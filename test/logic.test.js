// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReport, scoreAttempt, optionLevel, questionDetail, studentHistory } from '../src/lib/report.js';
import { parseStudentList, parseDelimited, toCsv, normGrade } from '../src/lib/csv.js';
import { classify, toStudentNumber } from '../src/lib/identity.js';
import { parseQuestionFile } from '../src/lib/questionImport.js';
import { seededShuffle, slugify } from '../src/lib/shuffle.js';

const Q = {
  'G3-001': { grade: '3', strand: 'Number', text: '2+2?', options: { A: { text: '3' }, B: { text: '4' }, C: { text: '5' }, D: { text: '6' } }, correct: 'B', wrongRank: ['A', 'C', 'D'] },
  'G3-003': { grade: '3', strand: 'Spatial Sense', text: 'Triangle sides?', options: { A: { text: '2' }, B: { text: '3' }, C: { text: '4' }, D: { text: '5' } }, correct: 'B', wrongRank: ['C', 'A', 'D'] },
  'G4-001': { grade: '4', strand: 'Algebra', text: 'x?', options: { A: { text: '1' }, B: { text: '2' } }, correct: 'A', wrongRank: ['B'] },
};
const settings = { strength: 75, gap: 60, currentWindow: 'Winter 2027' };
const students = [
  { studentNumber: '111111111', name: 'Ava', grade: '3', classId: 'c1', className: 'Rm 1' },
  { studentNumber: '222222222', name: 'Ben', grade: '3', classId: 'c1', className: 'Rm 1' },
  { studentNumber: '333333333', name: 'Cai', grade: '4', classId: 'c2', className: 'Rm 2' },
  { studentNumber: '444444444', name: 'Dev', grade: '3', classId: 'c1', className: 'Rm 1' },
];
const att = (window, grade, answers, submittedAt, status = 'submitted', ids) => ({
  id: window, window, grade, classId: 'c1', className: 'Rm 1', answers, status, submittedAt,
  questionIds: ids || (grade === '4' ? ['G4-001'] : ['G3-001', 'G3-003']),
});
const attemptsBySn = {
  '111111111': [att('Fall 2026', '3', { 'G3-001': 'A', 'G3-003': 'A' }, 1), att('Winter 2027', '3', { 'G3-001': 'B', 'G3-003': 'B' }, 10)],
  '222222222': [att('Winter 2027', '3', { 'G3-001': 'B', 'G3-003': 'C' }, 11), att('Winter 2027', '3', { 'G3-001': 'A' }, 5)],
  '333333333': [att('Winter 2027', '4', { 'G4-001': 'B' }, 12)],
  '444444444': [att('Winter 2027', '3', { 'G3-001': 'B' }, null, 'in_progress')],
};

test('optionLevel follows the green/yellow/orange/red ranking', () => {
  assert.deepEqual(['B', 'A', 'C', 'D', '', 'x'].map((k) => optionLevel(Q['G3-001'], k)), [0, 1, 2, 3, null, null]);
});

test('scoreAttempt: blanks are wrong, unknown questions skipped', () => {
  const r = scoreAttempt({ answers: { 'G3-001': 'b' }, questionIds: ['G3-001', 'G3-003', 'GONE'] }, Q);
  assert.equal(r.score, 1); assert.equal(r.total, 2); assert.equal(r.percent, 50);
});

test('whole-school report: latest attempt per window, strands, groups, not finished', () => {
  const r = buildReport({ students, attemptsBySn, questions: Q, filters: {}, settings });
  assert.equal(r.window, 'Winter 2027');
  assert.equal(r.summary.completed, 3);
  assert.equal(r.summary.rostered, 4);
  assert.equal(r.summary.average, 50);
  assert.equal(r.strands.find((s) => s.strand === 'Number').flag, 'strength');
  assert.equal(r.strands.find((s) => s.strand === 'Algebra').flag, 'gap');
  assert.equal(r.groupBy, 'grade');
  assert.deepEqual(r.groups.map((g) => g.name), ['Grade 3', 'Grade 4']);
  assert.deepEqual(r.notCompleted.map((s) => [s.name, s.status]), [['Dev', 'In progress (1/2)']]);
  assert.deepEqual(r.windows, ['Fall 2026', 'Winter 2027']);
});

test('class filter lists students with close calls; trend covers both windows', () => {
  const r = buildReport({ students, attemptsBySn, questions: Q, filters: { grade: '3', classId: 'c1' }, settings });
  assert.equal(r.groupBy, null);
  assert.deepEqual(r.students.map((s) => [s.name, s.percent, s.close]), [['Ava', 100, 0], ['Ben', 50, 1]]);
  assert.deepEqual(r.trend.map((t) => [t.window, t.average]), [['Fall 2026', 0], ['Winter 2027', 75]]);
  const it = r.items.find((i) => i.id === 'G3-003');
  assert.deepEqual(it.levels.map((l) => l.count), [1, 1, 0, 0]);
});

test('question detail groups students by answer, best answer first', () => {
  const d = questionDetail({ students, attemptsBySn, questions: Q, filters: { grade: '3' }, settings }, 'G3-003');
  assert.deepEqual(d.options.map((o) => [o.key, o.level, o.students.map((s) => s.name)]), [['B', 0, ['Ava']], ['C', 1, ['Ben']], ['A', 2, []], ['D', 3, []]]);
});

test('student history spans windows (multi-year)', () => {
  const h = studentHistory(students[0], attemptsBySn['111111111'], Q, settings);
  assert.deepEqual(h.map((x) => [x.window, x.percent]), [['Fall 2026', 0], ['Winter 2027', 100]]);
});

test('identity: S-number students, staff, others', () => {
  assert.deepEqual(classify('S123456789@ddsbstudent.ca'), { role: 'student', email: 's123456789@ddsbstudent.ca', studentNumber: '123456789' });
  assert.equal(classify('ryan.adams@ddsb.ca').role, 'staff');
  assert.equal(classify('someone@gmail.com').role, 'other');
  assert.equal(classify('s12345678@ddsbstudent.ca').role, 'other');
  assert.equal(toStudentNumber('S987654321@ddsbstudent.ca'), '987654321');
  assert.equal(toStudentNumber('12345'), '');
});

test('student list: headers, first/last columns, S-emails, default grade, errors', () => {
  const r = parseStudentList('Student Number,First Name,Last Name,Grade\n123456789,Jordan,Smith,4\nS987654321@ddsbstudent.ca,Priya,Patel,Gr. 3\n555,No,Number,4\n123456789,Dup,Row,4');
  assert.deepEqual(r.students, [{ studentNumber: '123456789', name: 'Jordan Smith', grade: '4' }, { studentNumber: '987654321', name: 'Priya Patel', grade: '3' }]);
  assert.equal(r.errors.length, 1);
  const r2 = parseStudentList('123456789\tLee, Sam\n223456789\tAlex Kim\tK', '5');
  assert.deepEqual(r2.students, [{ studentNumber: '123456789', name: 'Sam Lee', grade: '5' }, { studentNumber: '223456789', name: 'Alex Kim', grade: 'K' }]);
  assert.match(parseStudentList('123456789,Sam').errors[0], /no grade/);
  assert.equal(normGrade('Grade 7'), '7'); assert.equal(normGrade('SK'), 'K'); assert.equal(normGrade('9'), '');
});

test('CSV parsing handles quotes; CSV export blocks formulas', () => {
  assert.deepEqual(parseDelimited('a,"b, c","d ""q"""\n1,2,3'), [['a', 'b, c', 'd "q"'], ['1', '2', '3']]);
  assert.equal(toCsv([['=SUM(A1)', 'x,y']]), "'=SUM(A1),\"x,y\"");
});

test('question import from the Sheet CSV', () => {
  const csv = 'QuestionID,Grade,Strand,Expectation,Question,ImageURL,OptionA,OptionB,OptionC,OptionD,Correct,WrongRank,Active,Notes\n' +
    'G2-001,2,Number,,Which is 47?,,11,47,74,407,B,"D,C,A",TRUE,\nG2-002,2,Number,,Broken,,1,,,,C,,TRUE,';
  const r = parseQuestionFile(csv, 'q.csv');
  assert.equal(r.questions.length, 2);
  assert.deepEqual(r.questions[0].wrongRank, ['D', 'C', 'A']);
  assert.equal(r.questions[0].active, true);
  assert.equal(r.questions[1].active, false);
  assert.ok(r.problems.some((p) => /G2-002/.test(p)));
});

test('question import from the Sheet JSON export, with picture answers', () => {
  const json = JSON.stringify({ format: 'forge-questions', version: 1, questions: [
    { id: 'G3-017', grade: '3', strand: 'Financial Literacy', text: 'Change?', options: { A: { text: 'A' }, B: { text: 'B' }, C: { text: 'C' }, D: { text: 'D' } },
      correct: 'D', wrongRank: ['A', 'C', 'B'], active: true, images: { Q: 'data:image/png;base64,AAAA', A: 'data:image/png;base64,AA' } }] });
  const r = parseQuestionFile(json, 'questions-export.json');
  assert.equal(r.questions[0].active, true);
  assert.equal(Object.keys(r.questions[0].images).length, 2);
});

test('shuffle is stable per student; window keys are rule-safe', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
  assert.deepEqual(seededShuffle(ids, 's1Fall'), seededShuffle(ids, 's1Fall'));
  assert.deepEqual([...seededShuffle(ids, 's1Fall')].sort(), ids);
  assert.equal(slugify('Fall 2026 (Term 1)'), 'fall-2026-term-1');
});
