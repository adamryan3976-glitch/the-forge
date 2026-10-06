// All reads and writes to Firestore. firestore.rules decides what each person
// is allowed to do; these helpers just make the calls tidy.

import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, writeBatch,
  serverTimestamp, FieldPath, documentId,
} from 'firebase/firestore';
import { db } from '../firebase.js';
import { DEFAULT_CONFIG, CHOICES } from '../constants.js';

const tsToMs = (v) => (v && typeof v.toMillis === 'function' ? v.toMillis() : typeof v === 'number' ? v : null);

/* ---------------- Settings ---------------- */

export async function getConfig() {
  const snap = await getDoc(doc(db, 'config', 'app'));
  return { ...DEFAULT_CONFIG, ...(snap.exists() ? snap.data() : {}), exists: snap.exists() };
}

export async function saveConfig(cfg) {
  const { exists, ...data } = cfg;
  await setDoc(doc(db, 'config', 'app'), { ...DEFAULT_CONFIG, ...data, updatedAt: serverTimestamp() });
}

/* ---------------- Classes ---------------- */

function classFromSnap(d) {
  return { id: d.id, ...d.data(), createdAt: tsToMs(d.data().createdAt) };
}

/** Classes this person can see: owned + shared (admins see all). */
export async function listClasses(email, isAdmin) {
  const ref = collection(db, 'classes');
  const snaps = isAdmin
    ? [await getDocs(ref)]
    : await Promise.all([
        getDocs(query(ref, where('ownerEmail', '==', email))),
        getDocs(query(ref, where('editors', 'array-contains', email))),
        getDocs(query(ref, where('viewers', 'array-contains', email))),
      ]);
  const map = new Map();
  snaps.forEach((s) => s.docs.forEach((d) => map.set(d.id, classFromSnap(d))));
  return [...map.values()].sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name, undefined, { numeric: true }));
}

export function accessFor(cls, email, isAdmin) {
  if (!cls) return 'none';
  if (cls.ownerEmail === email) return 'owner';
  if ((cls.editors || []).includes(email)) return 'editor';
  if (isAdmin) return 'admin';
  if ((cls.viewers || []).includes(email)) return 'viewer';
  return 'none';
}

export async function createClass({ name, schoolYear, ownerEmail, ownerName }) {
  const ref = doc(collection(db, 'classes'));
  const data = { name: name.trim(), schoolYear, ownerEmail, ownerName: ownerName || ownerEmail, editors: [], viewers: [], archived: false, createdAt: serverTimestamp() };
  await setDoc(ref, data);
  return { id: ref.id, ...data, createdAt: Date.now() };
}

export async function updateClass(cls, patch) {
  await updateDoc(doc(db, 'classes', cls.id), patch);
  return { ...cls, ...patch };
}

/* ---------------- Roster & enrolments ---------------- */

export async function getRoster(classId) {
  const snap = await getDocs(collection(db, 'classes', classId, 'roster'));
  return snap.docs.map((d) => ({ studentNumber: d.id, ...d.data(), addedAt: tsToMs(d.data().addedAt) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Adds or updates one student in a class. Returns { status: 'added'|'updated'|'moved'|'conflict' }.
 * 'conflict' means the student is in another active class this teacher can't edit.
 */
export async function upsertStudent(cls, student, me) {
  const sn = student.studentNumber;
  const enrolRef = doc(db, 'enrolments', sn);
  let existing = null;
  try {
    const snap = await getDoc(enrolRef);
    existing = snap.exists() ? snap.data() : null;
  } catch (e) {
    if (e.code === 'permission-denied') return { status: 'conflict' };
    throw e;
  }
  const batch = writeBatch(db);
  batch.set(enrolRef, {
    classId: cls.id, className: cls.name, grade: student.grade, name: student.name,
    schoolYear: cls.schoolYear, updatedAt: serverTimestamp(), updatedBy: me,
  });
  batch.set(doc(db, 'classes', cls.id, 'roster', sn), {
    name: student.name, grade: student.grade, addedAt: serverTimestamp(), addedBy: me,
  });
  let status = existing ? 'updated' : 'added';
  if (existing && existing.classId !== cls.id) {
    status = 'moved';
    // Tidy the old class's list if we're allowed to; if it's archived it stays as history.
    batch.delete(doc(db, 'classes', existing.classId, 'roster', sn));
  }
  try {
    await batch.commit();
  } catch (e) {
    if (e.code === 'permission-denied' && existing && existing.classId !== cls.id) {
      // Old class is archived (can't be edited): move without touching it.
      const b2 = writeBatch(db);
      b2.set(enrolRef, { classId: cls.id, className: cls.name, grade: student.grade, name: student.name, schoolYear: cls.schoolYear, updatedAt: serverTimestamp(), updatedBy: me });
      b2.set(doc(db, 'classes', cls.id, 'roster', sn), { name: student.name, grade: student.grade, addedAt: serverTimestamp(), addedBy: me });
      try { await b2.commit(); return { status: 'moved', fromClass: existing.className }; }
      catch (e2) { if (e2.code === 'permission-denied') return { status: 'conflict' }; throw e2; }
    }
    if (e.code === 'permission-denied') return { status: 'conflict' };
    throw e;
  }
  return { status, fromClass: existing?.className };
}

export async function removeStudent(classId, sn) {
  const batch = writeBatch(db);
  const enrolRef = doc(db, 'enrolments', sn);
  const snap = await getDoc(enrolRef).catch(() => null);
  if (snap && snap.exists() && snap.data().classId === classId) batch.delete(enrolRef);
  batch.delete(doc(db, 'classes', classId, 'roster', sn));
  await batch.commit();
}

export async function getEnrolment(sn) {
  const snap = await getDoc(doc(db, 'enrolments', sn));
  return snap.exists() ? snap.data() : null;
}

/* ---------------- Attempts ---------------- */

function attemptFromSnap(d) {
  const x = d.data();
  return { id: d.id, ...x, startedAt: tsToMs(x.startedAt), updatedAt: tsToMs(x.updatedAt), submittedAt: tsToMs(x.submittedAt) };
}

export async function getAttempts(sn) {
  const snap = await getDocs(collection(db, 'students', sn, 'attempts'));
  return snap.docs.map(attemptFromSnap);
}

/** Attempts for many students, a few at a time so the browser isn't swamped. */
export async function getAttemptsFor(numbers, onProgress) {
  const out = {};
  const list = [...new Set(numbers)];
  for (let i = 0; i < list.length; i += 25) {
    const chunk = list.slice(i, i + 25);
    const res = await Promise.all(chunk.map((sn) => getAttempts(sn).catch(() => [])));
    chunk.forEach((sn, j) => { out[sn] = res[j]; });
    onProgress && onProgress(Math.min(i + 25, list.length), list.length);
  }
  return out;
}

export function attemptRef(sn, attemptId) {
  return doc(db, 'students', sn, 'attempts', attemptId);
}

export async function startAttempt(sn, attemptId, data) {
  await setDoc(attemptRef(sn, attemptId), {
    ...data, answers: {}, answeredCount: 0, status: 'in_progress',
    startedAt: serverTimestamp(), updatedAt: serverTimestamp(), submittedAt: null,
  });
}

/** Saves one answer. Not awaited by the student screen: if offline it queues and sends later. */
export function saveAnswer(sn, attemptId, qid, letter, answeredCount) {
  return updateDoc(attemptRef(sn, attemptId), new FieldPath('answers', qid), letter,
    'answeredCount', answeredCount, 'updatedAt', serverTimestamp());
}

export function submitAttempt(sn, attemptId, answers) {
  return updateDoc(attemptRef(sn, attemptId), {
    answers, answeredCount: Object.keys(answers).length,
    status: 'submitted', submittedAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
}

export function resetAttempt(sn, attemptId) {
  return deleteDoc(attemptRef(sn, attemptId));
}

/* ---------------- Questions ---------------- */

function questionFromSnap(d) { return { id: d.id, ...d.data() }; }

export async function getQuestionsForGrade(grade) {
  const snap = await getDocs(query(collection(db, 'questions'), where('grade', '==', grade), where('active', '==', true)));
  return snap.docs.map(questionFromSnap).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id, undefined, { numeric: true }));
}

export async function getQuestionsByIds(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 30) {
    const snap = await getDocs(query(collection(db, 'questions'), where(documentId(), 'in', ids.slice(i, i + 30))));
    out.push(...snap.docs.map(questionFromSnap));
  }
  return out;
}

/** Staff only: every question merged with its answer key, keyed by id. */
export async function getQuestionBank() {
  const [qs, keys] = await Promise.all([getDocs(collection(db, 'questions')), getDocs(collection(db, 'answerKeys'))]);
  const bank = {};
  qs.docs.forEach((d) => { bank[d.id] = questionFromSnap(d); });
  keys.docs.forEach((d) => { if (bank[d.id]) Object.assign(bank[d.id], { correct: d.data().correct, wrongRank: d.data().wrongRank || [] }); });
  return bank;
}

/** Loads pictures for a question: { Q: dataUrl, A: dataUrl, ... } */
export async function getQuestionImages(q) {
  const slots = (q.imageSlots || []);
  const res = await Promise.all(slots.map((s) => getDoc(doc(db, 'questionImages', `${q.id}__${s}`)).catch(() => null)));
  const out = {};
  slots.forEach((s, i) => { if (res[i] && res[i].exists()) out[s] = res[i].data().data; });
  return out;
}

/**
 * Admin: writes an imported question bank. Questions not in the import are
 * switched off (not deleted) so past results still make sense.
 * items: [{ id, grade, strand, expectation, text, options:{A:{text}}, correct, wrongRank, active, notes, images:{Q,A,B,C,D: dataUrl} }]
 */
export async function importQuestionBank(items, onProgress) {
  const existing = await getDocs(collection(db, 'questions'));
  const incoming = new Set(items.map((q) => q.id));
  let ops = [];
  const flush = async () => {
    const batch = writeBatch(db);
    ops.forEach((f) => f(batch));
    await batch.commit();
    ops = [];
  };
  let done = 0;
  for (const q of items) {
    const imageSlots = Object.keys(q.images || {}).filter((k) => q.images[k]);
    const options = {};
    CHOICES.forEach((k) => {
      const text = String(q.options?.[k]?.text ?? '');
      const hasImage = imageSlots.includes(k);
      if (text || hasImage) options[k] = { text: hasImage && text.toUpperCase() === k ? '' : text, hasImage };
    });
    ops.push((b) => b.set(doc(db, 'questions', q.id), {
      grade: q.grade, strand: q.strand || '', expectation: q.expectation || '', text: q.text || '',
      options, hasImage: imageSlots.includes('Q'), imageSlots, active: !!q.active, order: q.order ?? 0,
      updatedAt: serverTimestamp(),
    }));
    ops.push((b) => b.set(doc(db, 'answerKeys', q.id), { correct: q.correct, wrongRank: q.wrongRank || [], notes: q.notes || '' }));
    if (ops.length >= 400) await flush();
    // Pictures are big, so each goes on its own.
    for (const slot of imageSlots) {
      await setDoc(doc(db, 'questionImages', `${q.id}__${slot}`), { data: q.images[slot], updatedAt: serverTimestamp() });
    }
    done++;
    onProgress && onProgress(done, items.length);
  }
  existing.docs.forEach((d) => {
    if (!incoming.has(d.id) && d.data().active) ops.push((b) => b.update(d.ref, { active: false }));
  });
  if (ops.length) await flush();
}
