// Apps Script edition of src/lib/data.js: same functions, but every call goes
// to the server script, which checks who is asking (apps-script-web/Code.gs).

import { call } from './run.js';
import { CHOICES } from '../../constants.js';

/* ---------------- Settings ---------------- */
export const getConfig = () => call('getConfig');
export const saveConfig = (cfg) => { const { exists, ...rest } = cfg; return call('saveConfig', { cfg: rest }); };

/* ---------------- Classes ---------------- */
export async function listClasses() {
  const list = await call('listClasses');
  return list.sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name, undefined, { numeric: true }));
}
export function accessFor(cls, email, isAdmin) {
  if (!cls) return 'none';
  if (cls.ownerEmail === email) return 'owner';
  if ((cls.editors || []).includes(email)) return 'editor';
  if (isAdmin) return 'admin';
  if ((cls.viewers || []).includes(email)) return 'viewer';
  return 'none';
}
export const createClass = ({ name, schoolYear }) => call('createClass', { name, schoolYear });
export async function updateClass(cls, patch) {
  const saved = await call('updateClass', { id: cls.id, patch });
  return { ...cls, ...saved };
}

/* ---------------- Roster & enrolments ---------------- */
export const getRoster = (classId) => call('getRoster', { classId });
export const upsertStudent = (cls, student) => call('upsertStudent', { classId: cls.id, student });
export const removeStudent = (classId, sn) => call('removeStudent', { classId, sn });
export const getEnrolment = (sn) => call('getEnrolment', { sn });

/* ---------------- Attempts ---------------- */
export const getAttempts = (sn) => call('getAttempts', { sn });
export async function getAttemptsFor(numbers, onProgress) {
  const list = [...new Set(numbers)];
  const out = {};
  for (let i = 0; i < list.length; i += 400) {
    Object.assign(out, await call('getAttemptsFor', { numbers: list.slice(i, i + 400) }));
    onProgress && onProgress(Math.min(i + 400, list.length), list.length);
  }
  return out;
}
export const startAttempt = (sn, attemptId, data) => call('startAttempt', { attemptId, questionIds: data.questionIds });
export const resetAttempt = (sn, attemptId) => call('resetAttempt', { sn, attemptId });

/*
 * Answers are sent in small batches: taps within ~1.5 seconds go together, so
 * a class of 30 doesn't flood the script. Unsent answers are retried until
 * they go through (and are also backed up on the device by the student screen).
 */
const queues = new Map();
function queueFor(attemptId) {
  if (!queues.has(attemptId)) queues.set(attemptId, { pending: {}, timer: null, sending: false, waiters: [], listeners: new Set(), delay: 1500 });
  return queues.get(attemptId);
}
function notify(q) {
  const busy = q.sending || Object.keys(q.pending).length > 0;
  q.listeners.forEach((fn) => fn(busy));
}
function schedule(attemptId, ms) {
  const q = queueFor(attemptId);
  clearTimeout(q.timer);
  q.timer = setTimeout(() => flush(attemptId), ms);
}
async function flush(attemptId) {
  const q = queueFor(attemptId);
  if (q.sending) { schedule(attemptId, 500); return; }
  const batch = q.pending;
  if (!Object.keys(batch).length) return;
  const waiters = q.waiters;
  q.pending = {}; q.waiters = []; q.sending = true; notify(q);
  try {
    await call('saveAnswers', { attemptId, answers: batch }, { tries: 2 });
    q.delay = 1500;
    waiters.forEach((w) => w.resolve());
  } catch (e) {
    // Put them back (newer taps win) and try again later.
    q.pending = { ...batch, ...q.pending };
    q.waiters = [...waiters, ...q.waiters];
    if (e.code === 'permission-denied') {
      q.waiters.forEach((w) => w.reject(e)); q.waiters = []; q.pending = {};
    } else {
      waiters.forEach((w) => w.reject(e));
      q.delay = Math.min(q.delay * 2, 30000);
      schedule(attemptId, q.delay);
    }
  } finally {
    q.sending = false; notify(q);
  }
}
/** Saves one answer (batched). Resolves once it has reached the server. */
export function saveAnswer(sn, attemptId, qid, letter) {
  const q = queueFor(attemptId);
  q.pending[qid] = letter;
  notify(q);
  schedule(attemptId, 1500);
  return new Promise((resolve, reject) => q.waiters.push({ resolve, reject }));
}
/** Calls back with true while answers are still waiting to be sent. */
export function watchPending(sn, attemptId, cb) {
  const q = queueFor(attemptId);
  q.listeners.add(cb);
  notify(q);
  return () => q.listeners.delete(cb);
}
export async function submitAttempt(sn, attemptId, answers) {
  const q = queueFor(attemptId);
  clearTimeout(q.timer);
  q.pending = {};
  await call('submitAttempt', { attemptId, answers }, { tries: 4 });
  q.waiters.forEach((w) => w.resolve()); q.waiters = [];
  notify(q);
}

/* ---------------- Questions ---------------- */
export const getQuestionsForGrade = (grade) => call('getQuestionsForGrade', { grade });
export const getQuestionsByIds = (ids) => call('getQuestionsByIds', { ids });
export const getQuestionBank = () => call('getQuestionBank');
export const getAnswerKeys = (ids) => call('getAnswerKeys', { ids });

const imageCache = new Map();
export function getQuestionImages(q) {
  const slots = q.imageSlots || [];
  if (!slots.length) return Promise.resolve({});
  if (!imageCache.has(q.id)) {
    imageCache.set(q.id, call('getQuestionImages', { id: q.id, slots }).catch((e) => { imageCache.delete(q.id); throw e; }));
  }
  return imageCache.get(q.id);
}

/** Admin: imports the question bank exported from the Sheet. */
export async function importQuestionBank(items, onProgress) {
  const prepared = items.map((q) => {
    const imageSlots = Object.keys(q.images || {}).filter((k) => q.images[k]);
    const options = {};
    CHOICES.forEach((k) => {
      const text = String(q.options?.[k]?.text ?? '');
      const hasImage = imageSlots.includes(k);
      if (text || hasImage) options[k] = { text: hasImage && text.toUpperCase() === k ? '' : text, hasImage };
    });
    return {
      id: q.id, grade: q.grade, strand: q.strand || '', expectation: q.expectation || '', text: q.text || '',
      options, hasImage: imageSlots.includes('Q'), imageSlots, active: !!q.active, order: q.order ?? 0,
      correct: q.correct, wrongRank: q.wrongRank || [], notes: q.notes || '',
    };
  });
  const pictures = [];
  items.forEach((q) => Object.entries(q.images || {}).forEach(([slot, data]) => { if (data) pictures.push({ id: q.id, slot, data }); }));
  const total = prepared.length + pictures.length;
  let done = 0;
  for (let i = 0; i < prepared.length; i += 25) {
    const chunk = prepared.slice(i, i + 25);
    await call('importQuestions', { items: chunk });
    done += chunk.length;
    onProgress && onProgress(done, total);
  }
  for (const p of pictures) {
    await call('saveQuestionImage', p);
    done++;
    onProgress && onProgress(done, total);
  }
  await call('deactivateMissing', { ids: prepared.map((q) => q.id) });
  imageCache.clear();
}
