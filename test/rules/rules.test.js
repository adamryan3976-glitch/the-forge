// Security-rule tests. They run against the Firestore emulator:
//   npm run test:rules        (needs Java; runs automatically on GitHub before every deploy)
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';

const ts = () => firebase.firestore.FieldValue.serverTimestamp();
let env;

const OWNER = 'adamryan3976@ddsb.ca';
const TA = 'teacher.a@ddsb.ca';
const TB = 'teacher.b@ddsb.ca';
const PRINCIPAL = 'principal@ddsb.ca';
const S1 = '111111111';
const S2 = '222222222';

const as = (email) => env.authenticatedContext(email.replace(/[^a-z0-9]/gi, '_'), { email, email_verified: true }).firestore();
const student = (sn) => as(`s${sn}@ddsbstudent.ca`);

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-forge',
    firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') },
  });
});
after(async () => { await env.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc('config/app').set({ schoolName: 'Test', currentWindow: 'Fall 2026', windowKey: 'fall-2026', assessmentOpen: true, allowRetakes: false, admins: [PRINCIPAL] });
    await db.doc('questions/G3-001').set({ grade: '3', text: '2+2', options: { A: { text: '3' }, B: { text: '4' } }, active: true });
    await db.doc('answerKeys/G3-001').set({ correct: 'B', wrongRank: ['A'] });
    const cls = (id, owner, extra = {}) => db.doc(`classes/${id}`).set({ name: id, ownerEmail: owner, ownerName: owner, editors: [], viewers: [], archived: false, schoolYear: '2026-2027', createdAt: new Date(), ...extra });
    await cls('classA', TA);
    await cls('classB', TB);
    await db.doc(`classes/classA/roster/${S1}`).set({ name: 'Ava', grade: '3', addedAt: new Date(), addedBy: TA });
    await db.doc(`enrolments/${S1}`).set({ classId: 'classA', className: 'classA', grade: '3', name: 'Ava', schoolYear: '2026-2027', updatedAt: new Date(), updatedBy: TA });
  });
});

const enrolBatch = (db, classId, sn, grade = '3', me = TA) => {
  const b = db.batch();
  b.set(db.doc(`enrolments/${sn}`), { classId, className: classId, grade, name: 'Kid', schoolYear: '2026-2027', updatedAt: ts(), updatedBy: me });
  b.set(db.doc(`classes/${classId}/roster/${sn}`), { name: 'Kid', grade, addedAt: ts(), addedBy: me });
  return b;
};
const newAttempt = (sn, over = {}) => ({
  studentNumber: sn, studentName: 'Ava', grade: '3', classId: 'classA', className: 'classA', window: 'Fall 2026',
  questionIds: ['G3-001'], answers: {}, answeredCount: 0, status: 'in_progress', startedAt: ts(), updatedAt: ts(), submittedAt: null, ...over,
});

// ---------- Who can sign in ----------
test('non-school Google accounts can read nothing', async () => {
  const x = as('someone@gmail.com');
  await assertFails(x.doc('config/app').get());
  await assertFails(x.doc('questions/G3-001').get());
  await assertFails(x.doc(`enrolments/${S1}`).get());
});

// ---------- Answer key ----------
test('students can read questions but never the answer key', async () => {
  await assertSucceeds(student(S1).doc('questions/G3-001').get());
  await assertFails(student(S1).doc('answerKeys/G3-001').get());
  await assertSucceeds(as(TA).doc('answerKeys/G3-001').get());
  await assertFails(as(TA).doc('answerKeys/G3-001').set({ correct: 'A' }));
});

// ---------- Students ----------
test('a student reads only their own enrolment', async () => {
  await assertSucceeds(student(S1).doc(`enrolments/${S1}`).get());
  await assertFails(student(S2).doc(`enrolments/${S1}`).get());
});

test('a student starts an attempt only for their own grade, class and the current window', async () => {
  const db = student(S1);
  await assertFails(db.doc(`students/${S1}/attempts/fall-2026__1`).set(newAttempt(S1, { grade: '5' })));
  await assertFails(db.doc(`students/${S1}/attempts/fall-2026__1`).set(newAttempt(S1, { classId: 'classB' })));
  await assertFails(db.doc(`students/${S1}/attempts/fall-2026__1`).set(newAttempt(S1, { window: 'Winter 2027' })));
  await assertFails(db.doc(`students/${S1}/attempts/fall-2026__2`).set(newAttempt(S1)));            // retakes off
  await assertFails(student(S2).doc(`students/${S1}/attempts/fall-2026__1`).set(newAttempt(S1)));   // someone else
  await assertSucceeds(db.doc(`students/${S1}/attempts/fall-2026__1`).set(newAttempt(S1)));
});

test('answers save as they go; after submitting nothing can change', async () => {
  const db = student(S1);
  const ref = db.doc(`students/${S1}/attempts/fall-2026__1`);
  await assertSucceeds(ref.set(newAttempt(S1)));
  await assertSucceeds(ref.update(new firebase.firestore.FieldPath('answers', 'G3-001'), 'A', 'answeredCount', 1, 'updatedAt', ts()));
  await assertFails(ref.update({ grade: '8', updatedAt: ts() }));
  await assertSucceeds(ref.update({ answers: { 'G3-001': 'B' }, answeredCount: 1, status: 'submitted', submittedAt: ts(), updatedAt: ts() }));
  await assertFails(ref.update({ answers: { 'G3-001': 'A' }, updatedAt: ts() }));
});

test('closing the check-in stops new attempts', async () => {
  await env.withSecurityRulesDisabled((ctx) => ctx.firestore().doc('config/app').update({ assessmentOpen: false }));
  await assertFails(student(S1).doc(`students/${S1}/attempts/fall-2026__1`).set(newAttempt(S1)));
});

test('students cannot read other students’ attempts or class lists', async () => {
  await assertSucceeds(student(S1).doc(`students/${S1}/attempts/fall-2026__1`).set(newAttempt(S1)));
  await assertFails(student(S2).doc(`students/${S1}/attempts/fall-2026__1`).get());
  await assertFails(student(S1).doc(`classes/classA/roster/${S1}`).get());
  await assertFails(student(S1).doc('classes/classA').get());
});

// ---------- Teachers ----------
test('teachers see only their own classes; admins see all', async () => {
  await assertSucceeds(as(TA).collection('classes').where('ownerEmail', '==', TA).get());
  await assertFails(as(TB).doc('classes/classA').get());
  await assertFails(as(TB).collection('classes').get());
  await assertSucceeds(as(PRINCIPAL).collection('classes').get());
  await assertSucceeds(as(OWNER).collection('classes').get());
});

test('a teacher adds a student to their class (enrolment + roster together)', async () => {
  await assertSucceeds(as(TA).doc(`enrolments/${S2}`).get());        // not enrolled: lookup allowed
  await assertSucceeds(enrolBatch(as(TA), 'classA', S2).commit());
  await assertFails(as(TA).doc(`classes/classA/roster/333333333`).set({ name: 'X', grade: '3', addedAt: ts(), addedBy: TA })); // no enrolment
  await assertFails(enrolBatch(as(TA), 'classA', '12345').commit());  // not a 9-digit number
});

test('a student in another teacher’s active class cannot be taken or looked at', async () => {
  await assertFails(as(TB).doc(`enrolments/${S1}`).get());
  await assertFails(enrolBatch(as(TB), 'classB', S1, '3', TB).commit());
  await assertFails(as(TB).doc(`classes/classA/roster/${S1}`).get());
});

test('once the old class is archived, the next teacher can add the student', async () => {
  await env.withSecurityRulesDisabled((ctx) => ctx.firestore().doc('classes/classA').update({ archived: true }));
  await assertSucceeds(enrolBatch(as(TB), 'classB', S1, '4', TB).commit());
  await assertFails(enrolBatch(as(TA), 'classA', S2).commit());     // archived class is read-only
});

test('sharing: viewers can read, editors can also add students', async () => {
  await assertFails(as(TB).doc(`classes/classA/roster/${S1}`).get());
  await assertSucceeds(as(TA).doc('classes/classA').update({ viewers: [TB] }));
  await assertSucceeds(as(TB).doc(`classes/classA/roster/${S1}`).get());
  await assertFails(enrolBatch(as(TB), 'classA', S2, '3', TB).commit());
  await assertFails(as(TB).doc('classes/classA').update({ editors: [TB] }));   // can't promote themselves
  await assertSucceeds(as(TA).doc('classes/classA').update({ viewers: [], editors: [TB] }));
  await assertSucceeds(enrolBatch(as(TB), 'classA', S2, '3', TB).commit());
});

test('only the owner can share or rename; nobody can delete a class', async () => {
  await assertFails(as(TB).doc('classes/classA').update({ name: 'Mine now' }));
  await assertFails(as(TA).doc('classes/classA').update({ ownerEmail: TB }));
  await assertFails(as(TA).doc('classes/classA').delete());
  await assertSucceeds(as(PRINCIPAL).doc('classes/classA').update({ ownerEmail: TB }));
});

test('a class can only be created as yourself', async () => {
  const c = { name: 'New', ownerName: 'x', editors: [], viewers: [], archived: false, schoolYear: '2026-2027', createdAt: ts() };
  await assertSucceeds(as(TA).collection('classes').add({ ...c, ownerEmail: TA }));
  await assertFails(as(TA).collection('classes').add({ ...c, ownerEmail: TB }));
  await assertFails(student(S1).collection('classes').add({ ...c, ownerEmail: `s${S1}@ddsbstudent.ca` }));
});

test('results: the student’s teacher and admins can read; other teachers cannot', async () => {
  await assertSucceeds(student(S1).doc(`students/${S1}/attempts/fall-2026__1`).set(newAttempt(S1)));
  await assertSucceeds(as(TA).collection(`students/${S1}/attempts`).get());
  await assertSucceeds(as(PRINCIPAL).collection(`students/${S1}/attempts`).get());
  await assertFails(as(TB).collection(`students/${S1}/attempts`).get());
  await assertFails(as(TA).doc(`students/${S1}/attempts/fall-2026__1`).update({ status: 'in_progress' }));
  await assertSucceeds(as(TA).doc(`students/${S1}/attempts/fall-2026__1`).delete());   // reset
});

test('removing a student takes them off the list and frees them', async () => {
  const db = as(TA);
  const b = db.batch();
  b.delete(db.doc(`enrolments/${S1}`));
  b.delete(db.doc(`classes/classA/roster/${S1}`));
  await assertSucceeds(b.commit());
  await assertSucceeds(enrolBatch(as(TB), 'classB', S1, '3', TB).commit());
});

// ---------- Admin ----------
test('only admins change settings and questions', async () => {
  const cfg = { schoolName: 'X', currentWindow: 'Winter 2027', windowKey: 'winter-2027', assessmentOpen: true, allowRetakes: false, admins: [] };
  await assertFails(as(TA).doc('config/app').set(cfg));
  await assertFails(as(TA).doc('questions/G3-002').set({ grade: '3' }));
  await assertSucceeds(as(PRINCIPAL).doc('questions/G3-002').set({ grade: '3' }));
  await assertSucceeds(as(OWNER).doc('config/app').set({ ...cfg, admins: [PRINCIPAL] }));
  await assertFails(as(OWNER).doc('config/app').set({ ...cfg, windowKey: 'bad key!' }));
});
