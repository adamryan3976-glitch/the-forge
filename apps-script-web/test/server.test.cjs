// Security tests for the Apps Script server (apps-script-web/Code.gs).
// The same scenarios as test/rules/rules.test.js, run against the script with
// Google's services replaced by small in-memory stand-ins.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const OWNER = 'owner.teacher@ddsb.ca';
const TA = 'teacher.a@ddsb.ca';
const TB = 'teacher.b@ddsb.ca';
const ADMIN = 'principal.p@ddsb.ca';
const S1 = '111111111', S2 = '222222222', S3 = '333333333';
const stu = (sn) => `s${sn}@ddsbstudent.ca`;

function makeServer() {
  const cols = {};
  const col = (c) => (cols[c] = cols[c] || new Map());
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const TEST_DB_ = {
    get: (c, id) => (col(c).has(String(id)) ? { ...clone(col(c).get(String(id))), id: String(id) } : null),
    all: (c) => [...col(c).entries()].map(([id, d]) => ({ ...clone(d), id })),
    put: (c, id, d) => { const x = clone(d); delete x.id; col(c).set(String(id), x); },
    putMany: (c, items) => items.forEach((it) => TEST_DB_.put(c, it.id, it.data)),
    del: (c, id) => col(c).delete(String(id)),
    byPrefix: (c, pre) => TEST_DB_.all(c).filter((d) => d.id.startsWith(pre)),
  };
  const images = new Map();
  let active = '';
  let uuid = 0;
  const ctx = {
    TEST_DB_,
    TEST_IMAGES_: { read: (n) => images.get(n) || null, write: (n, d) => images.set(n, d) },
    Session: { getActiveUser: () => ({ getEmail: () => active }), getEffectiveUser: () => ({ getEmail: () => OWNER }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: { getUuid: () => `uuid-${++uuid}-xxxxxxxxxxxxxxxxxxxx` },
    console,
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8'), ctx);
  const as = (email) => (name, args) => { active = email; return ctx.api(name, args); };
  return { as, ctx, setActive: (e) => { active = e; }, db: TEST_DB_ };
}

const denied = (fn) => assert.throws(fn, /permission-denied|Unknown request|Please use your school account/);

/** A school with: classA (TA, grade 3: S1), classB (TB), settings open, Grade 3 questions. */
function school() {
  const s = makeServer();
  const owner = s.as(OWNER);
  owner('saveConfig', { cfg: { schoolName: 'Winchester P.S.', currentWindow: 'Fall 2026', windowKey: 'fall-2026', assessmentOpen: true, admins: [ADMIN] } });
  owner('importQuestions', { items: [
    { id: 'G3-001', grade: '3', text: '2+2', options: { A: { text: '3' }, B: { text: '4' } }, active: true, correct: 'B', wrongRank: ['A'] },
    { id: 'G3-002', grade: '3', text: '5-1', options: { A: { text: '4' }, B: { text: '6' } }, active: true, correct: 'A', wrongRank: ['B'] },
    { id: 'G4-001', grade: '4', text: '3x3', options: { A: { text: '9' } }, active: true, correct: 'A' },
  ] });
  const a = s.as(TA)('createClass', { name: 'Room 12', schoolYear: '2026-2027' });
  const b = s.as(TB)('createClass', { name: 'Room 14', schoolYear: '2026-2027' });
  s.as(TA)('upsertStudent', { classId: a.id, student: { studentNumber: S1, name: 'Ava One', grade: '3' } });
  return { ...s, A: a.id, B: b.id };
}

test('accounts outside DDSB get nothing, and only api/doGet/setup/refreshApp are callable', () => {
  const s = school();
  denied(() => s.as('someone@gmail.com')('getConfig'));
  denied(() => s.as('')('getConfig'));
  denied(() => s.as(stu(S1))('__proto__'));
  denied(() => s.as(stu(S1))('constructor'));
  // Students can't run the owner's setup or force an app download.
  s.setActive(stu(S1));
  assert.throws(() => s.ctx.setup(), /permission-denied/);
  assert.throws(() => s.ctx.refreshApp(), /permission-denied/);
  // Every other top-level function is private (ends in "_").
  const src = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
  const publicFns = [...src.matchAll(/^function\s+([A-Za-z0-9_$]+)/gm)].map((m) => m[1]).filter((n) => !n.endsWith('_'));
  assert.deepEqual(publicFns.sort(), ['api', 'doGet', 'refreshApp', 'setup']);
});

test('students read questions but never the answer key', () => {
  const s = school();
  const qs = s.as(stu(S1))('getQuestionsForGrade', { grade: '3' });
  assert.equal(qs.length, 2);
  qs.forEach((q) => { assert.equal(q.correct, undefined); assert.equal(q.wrongRank, undefined); });
  denied(() => s.as(stu(S1))('getAnswerKeys', { ids: ['G3-001'] }));
  denied(() => s.as(stu(S1))('getQuestionBank'));
  assert.equal(s.as(TB)('getAnswerKeys', { ids: ['G3-001'] })['G3-001'].correct, 'B');
});

test('a student reads only their own enrolment', () => {
  const s = school();
  assert.equal(s.as(stu(S1))('getEnrolment', { sn: S1 }).grade, '3');
  denied(() => s.as(stu(S2))('getEnrolment', { sn: S1 }));
});

test('a student starts a check-in only for their own grade, class and the current window', () => {
  const s = school();
  const me = s.as(stu(S1));
  denied(() => me('startAttempt', { attemptId: 'winter-2027__1', questionIds: ['G3-001'] }));   // wrong window
  denied(() => me('startAttempt', { attemptId: 'fall-2026__2', questionIds: ['G3-001'] }));     // retakes off
  denied(() => me('startAttempt', { attemptId: 'fall-2026__1', questionIds: ['G4-001'] }));     // another grade
  denied(() => me('startAttempt', { attemptId: 'fall-2026__1', questionIds: ['NOPE'] }));       // not a question
  denied(() => s.as(stu(S2))('startAttempt', { attemptId: 'fall-2026__1', questionIds: ['G3-001'] })); // not enrolled
  assert.equal(me('startAttempt', { attemptId: 'fall-2026__1', questionIds: ['G3-001', 'G3-002'] }), true);
  denied(() => me('startAttempt', { attemptId: 'fall-2026__1', questionIds: ['G3-001'] }));     // only once
  const at = s.db.get('attempts', `${S1}/fall-2026__1`);
  assert.equal(at.studentName, 'Ava One');   // name comes from the class list, not the browser
  assert.equal(at.grade, '3');
});

test('answers save as they go; after handing in nothing can change', () => {
  const s = school();
  const me = s.as(stu(S1));
  me('startAttempt', { attemptId: 'fall-2026__1', questionIds: ['G3-001', 'G3-002'] });
  me('saveAnswers', { attemptId: 'fall-2026__1', answers: { 'G3-001': 'A' } });
  me('saveAnswers', { attemptId: 'fall-2026__1', answers: { 'G3-002': 'A', 'G4-001': 'A', 'G3-001': 'Z' } }); // bad ones ignored
  let at = s.db.get('attempts', `${S1}/fall-2026__1`);
  assert.deepEqual(at.answers, { 'G3-001': 'A', 'G3-002': 'A' });
  assert.equal(at.answeredCount, 2);
  me('submitAttempt', { attemptId: 'fall-2026__1', answers: { 'G3-001': 'B' } });
  at = s.db.get('attempts', `${S1}/fall-2026__1`);
  assert.equal(at.status, 'submitted');
  assert.equal(at.answers['G3-001'], 'B');
  denied(() => me('saveAnswers', { attemptId: 'fall-2026__1', answers: { 'G3-001': 'A' } }));
  denied(() => me('submitAttempt', { attemptId: 'fall-2026__1', answers: {} }));
  // Another student can't write into it.
  denied(() => s.as(stu(S2))('saveAnswers', { attemptId: 'fall-2026__1', answers: { 'G3-001': 'A' } }));
});

test('closing the check-in stops new attempts and new answers', () => {
  const s = school();
  s.as(stu(S1))('startAttempt', { attemptId: 'fall-2026__1', questionIds: ['G3-001'] });
  s.as(OWNER)('saveConfig', { cfg: { ...s.as(OWNER)('getConfig'), assessmentOpen: false } });
  denied(() => s.as(stu(S1))('saveAnswers', { attemptId: 'fall-2026__1', answers: { 'G3-001': 'A' } }));
});

test('students cannot read other students’ attempts, class lists or classes', () => {
  const s = school();
  s.as(TA)('upsertStudent', { classId: s.A, student: { studentNumber: S2, name: 'Ben Two', grade: '3' } });
  s.as(stu(S2))('startAttempt', { attemptId: 'fall-2026__1', questionIds: ['G3-001'] });
  denied(() => s.as(stu(S1))('getAttempts', { sn: S2 }));
  denied(() => s.as(stu(S1))('getRoster', { classId: s.A }));
  denied(() => s.as(stu(S1))('listClasses'));
  denied(() => s.as(stu(S1))('getAttemptsFor', { numbers: [S2] }));
  assert.equal(s.as(stu(S2))('getAttempts', { sn: S2 }).length, 1);
});

test('teachers see only their own classes; admins see all', () => {
  const s = school();
  assert.deepEqual(s.as(TA)('listClasses').map((c) => c.name), ['Room 12']);
  assert.deepEqual(s.as(TB)('listClasses').map((c) => c.name), ['Room 14']);
  assert.equal(s.as(ADMIN)('listClasses').length, 2);
  assert.equal(s.as(OWNER)('listClasses').length, 2);
  denied(() => s.as(TB)('getRoster', { classId: s.A }));
});

test('a teacher adds a student; student numbers must be 9 digits', () => {
  const s = school();
  assert.equal(s.as(TA)('upsertStudent', { classId: s.A, student: { studentNumber: S2, name: 'Ben', grade: '3' } }).status, 'added');
  assert.equal(s.as(TA)('upsertStudent', { classId: s.A, student: { studentNumber: S2, name: 'Ben Two', grade: '4' } }).status, 'updated');
  denied(() => s.as(TA)('upsertStudent', { classId: s.A, student: { studentNumber: '12345', name: 'X', grade: '3' } }));
  denied(() => s.as(TA)('upsertStudent', { classId: s.A, student: { studentNumber: S3, name: 'X', grade: '9' } }));
  assert.deepEqual(s.as(TA)('getRoster', { classId: s.A }).map((r) => r.studentNumber).sort(), [S1, S2]);
});

test('a student in another teacher’s active class cannot be taken or looked at', () => {
  const s = school();
  assert.equal(s.as(TB)('upsertStudent', { classId: s.B, student: { studentNumber: S1, name: 'Ava', grade: '3' } }).status, 'conflict');
  denied(() => s.as(TB)('getEnrolment', { sn: S1 }));
  denied(() => s.as(TB)('getAttempts', { sn: S1 }));
  assert.equal(s.as(TB)('getAttemptsFor', { numbers: [S1] })[S1].length, 0);
  assert.equal(s.db.get('enrolments', S1).classId, s.A);   // unchanged
});

test('once the old class is archived, the next teacher can add the student', () => {
  const s = school();
  s.as(TA)('updateClass', { id: s.A, patch: { archived: true } });
  const r = s.as(TB)('upsertStudent', { classId: s.B, student: { studentNumber: S1, name: 'Ava', grade: '4' } });
  assert.equal(r.status, 'moved');
  assert.equal(s.db.get('enrolments', S1).classId, s.B);
  assert.equal(s.as(TA)('getRoster', { classId: s.A }).length, 1);    // archived list kept as history
  denied(() => s.as(TA)('upsertStudent', { classId: s.A, student: { studentNumber: S2, name: 'Ben', grade: '3' } })); // archived = read-only
});

test('sharing: viewers can read, editors can also add students', () => {
  const s = school();
  s.as(TA)('updateClass', { id: s.A, patch: { viewers: [TB] } });
  assert.equal(s.as(TB)('getRoster', { classId: s.A }).length, 1);
  denied(() => s.as(TB)('upsertStudent', { classId: s.A, student: { studentNumber: S2, name: 'Ben', grade: '3' } }));
  s.as(TA)('updateClass', { id: s.A, patch: { viewers: [], editors: [TB] } });
  assert.equal(s.as(TB)('upsertStudent', { classId: s.A, student: { studentNumber: S2, name: 'Ben', grade: '3' } }).status, 'added');
});

test('only the owner (or an admin) can share, rename or hand over a class', () => {
  const s = school();
  s.as(TA)('updateClass', { id: s.A, patch: { editors: [TB] } });
  denied(() => s.as(TB)('updateClass', { id: s.A, patch: { name: 'Mine now' } }));
  denied(() => s.as(TA)('updateClass', { id: s.A, patch: { ownerEmail: TB } }));
  assert.equal(s.as(ADMIN)('updateClass', { id: s.A, patch: { ownerEmail: TB } }).ownerEmail, TB);
  // Non-DDSB emails are dropped from sharing lists.
  const c = s.as(TB)('updateClass', { id: s.A, patch: { viewers: ['x@gmail.com', TA] } });
  assert.deepEqual(c.viewers, [TA]);
});

test('a class is always created as yourself', () => {
  const s = school();
  const c = s.as(TB)('createClass', { name: 'Room 9', schoolYear: '2026-2027', ownerEmail: TA });
  assert.equal(c.ownerEmail, TB);
  denied(() => s.as(stu(S1))('createClass', { name: 'Hack' }));
});

test('results: the student’s teacher and admins can read; other teachers cannot', () => {
  const s = school();
  s.as(stu(S1))('startAttempt', { attemptId: 'fall-2026__1', questionIds: ['G3-001'] });
  assert.equal(s.as(TA)('getAttemptsFor', { numbers: [S1] })[S1].length, 1);
  assert.equal(s.as(ADMIN)('getAttempts', { sn: S1 }).length, 1);
  assert.equal(s.as(TB)('getAttemptsFor', { numbers: [S1] })[S1].length, 0);
  denied(() => s.as(TB)('resetAttempt', { sn: S1, attemptId: 'fall-2026__1' }));
  assert.equal(s.as(TA)('resetAttempt', { sn: S1, attemptId: 'fall-2026__1' }), true);
  assert.equal(s.as(TA)('getAttempts', { sn: S1 }).length, 0);
});

test('removing a student takes them off the list and frees them', () => {
  const s = school();
  denied(() => s.as(TB)('removeStudent', { classId: s.A, sn: S1 }));
  s.as(TA)('removeStudent', { classId: s.A, sn: S1 });
  assert.equal(s.db.get('enrolments', S1), null);
  assert.equal(s.as(TB)('upsertStudent', { classId: s.B, student: { studentNumber: S1, name: 'Ava', grade: '3' } }).status, 'added');
});

test('only admins change settings and questions', () => {
  const s = school();
  const cfg = s.as(TA)('getConfig');
  denied(() => s.as(TA)('saveConfig', { cfg: { ...cfg, assessmentOpen: false } }));
  denied(() => s.as(stu(S1))('saveConfig', { cfg }));
  denied(() => s.as(TA)('importQuestions', { items: [] }));
  denied(() => s.as(TA)('saveQuestionImage', { id: 'G3-001', slot: 'Q', data: 'data:image/png;base64,AAAA' }));
  denied(() => s.as(TA)('deactivateMissing', { ids: [] }));
  denied(() => s.as(stu(S1))('refreshApp'));
  // An admin can; settings are cleaned up on the way in.
  s.as(ADMIN)('saveConfig', { cfg: { ...cfg, admins: [ADMIN, 'evil@gmail.com'], strengthThreshold: 500 } });
  const c2 = s.as(TA)('getConfig');
  assert.deepEqual(c2.admins, [ADMIN]);
  assert.equal(c2.strengthThreshold, 100);
  denied(() => s.as(ADMIN)('saveConfig', { cfg: { ...cfg, windowKey: 'Bad Key!' } }));
});

test('pictures: admins save valid images; everyone at school can view', () => {
  const s = school();
  denied(() => s.as(ADMIN)('saveQuestionImage', { id: 'G3-001', slot: 'Q', data: 'javascript:alert(1)' }));
  denied(() => s.as(ADMIN)('saveQuestionImage', { id: '../x', slot: 'Q', data: 'data:image/png;base64,AAAA' }));
  s.as(ADMIN)('saveQuestionImage', { id: 'G3-001', slot: 'Q', data: 'data:image/png;base64,AAAA' });
  assert.equal(s.as(stu(S1))('getQuestionImages', { id: 'G3-001', slots: ['Q'] }).Q, 'data:image/png;base64,AAAA');
});

test('re-importing switches off questions that were removed from the Sheet', () => {
  const s = school();
  assert.equal(s.as(OWNER)('deactivateMissing', { ids: ['G3-001', 'G4-001'] }), 1);
  assert.deepEqual(s.as(TA)('getQuestionsForGrade', { grade: '3' }).map((q) => q.id), ['G3-001']);
});
