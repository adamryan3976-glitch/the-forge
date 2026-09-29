// Run with: node test/logic.test.js
// Loads the pure server code into a sandbox and checks scoring, shuffling,
// roster parsing and report aggregation with fake data (no real student info).
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');

const ctx = { console, Math, Date, JSON, Object, Array, String, Number, isNaN, parseInt, Infinity };
vm.createContext(ctx);
['Config.gs', 'Util.gs', 'Logic.gs', 'Api.gs', 'Pictures.gs'].forEach(f =>
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8'), ctx, { filename: f }));

let passed = 0;
function test(name, fn) { fn(); passed++; console.log('  ✓ ' + name); }

const Q = [
  { QuestionID: 'G3-001', Grade: 3, Strand: 'Number', Question: '2+2?', OptionA: '3', OptionB: '4', OptionC: '5', OptionD: '6', Correct: 'B', Active: true },
  { QuestionID: 'G3-002', Grade: 3, Strand: 'Number', Question: '5-1?', OptionA: '4', OptionB: '3', OptionC: '', OptionD: '', Correct: 'A', Active: true },
  { QuestionID: 'G3-003', Grade: 3, Strand: 'Spatial Sense', Question: 'Sides on a triangle?', OptionA: '2', OptionB: '3', OptionC: '4', OptionD: '5', Correct: 'b', Active: '' },
  { QuestionID: 'G3-004', Grade: 3, Strand: 'Data', Question: 'Broken', OptionA: 'x', OptionB: 'y', Correct: 'C', Active: true },
  { QuestionID: 'G3-005', Grade: 3, Strand: 'Data', Question: 'Retired', OptionA: 'x', OptionB: 'y', Correct: 'A', Active: false }
];

test('validQuestion_ rejects blank correct option and inactive rows', () => {
  assert.deepEqual(Q.map(q => ctx.validQuestion_(q)), [true, true, true, false, false]);
});

test('publicQuestion_ never includes the answer and skips blank options', () => {
  const p = ctx.publicQuestion_(Q[1]);
  assert.strictEqual(JSON.stringify(p).includes('Correct'), false);
  assert.strictEqual(p.options.length, 2);
});

test('safeImageUrl_ blocks non-https and converts Drive links', () => {
  assert.strictEqual(ctx.safeImageUrl_('javascript:alert(1)'), '');
  assert.strictEqual(ctx.safeImageUrl_('http://x.com/a.png'), '');
  assert.ok(ctx.safeImageUrl_('https://drive.google.com/file/d/abc_123/view').includes('thumbnail?id=abc_123'));
});

test('seededShuffle_ is stable per student and keeps every item', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
  const one = ctx.seededShuffle_(ids, 'kid1@x');
  assert.deepEqual(one, ctx.seededShuffle_(ids, 'kid1@x'));
  assert.deepEqual([...one].sort(), ids);
});

test('scoreAnswers_ scores case-insensitively; blanks and junk are wrong', () => {
  const valid = Q.filter(q => ctx.validQuestion_(q));
  const r = ctx.scoreAnswers_(valid, { 'G3-001': 'b', 'G3-002': 'Z' });
  assert.strictEqual(r.score, 1);
  assert.strictEqual(r.total, 3);
  assert.strictEqual(r.percent, 33.3);
  assert.strictEqual(r.details[1].Chosen, '');
});

test('parseRosterLines_ handles tabs, commas, headers, split grades and bad domains', () => {
  const text = 'Email\tName\tGrade\ns1@ddsbstudent.ca\tJordan Smith\t4\ns2@ddsbstudent.ca, Priya Patel\nbad@gmail.com, Nope\n\ns1@ddsbstudent.ca, dup';
  const r = ctx.parseRosterLines_(text, '3', ['ddsbstudent.ca']);
  assert.strictEqual(r.students.length, 2);
  assert.deepEqual(r.students[0], { email: 's1@ddsbstudent.ca', name: 'Jordan Smith', grade: '4' });
  assert.strictEqual(r.students[1].grade, '3');
  assert.strictEqual(r.errors.length, 1);
});

// ---- Report aggregation ----
const settings = { currentWindow: 'Winter 2027', strength: 75, gap: 60 };
const roster = [
  { StudentEmail: 'a@s', StudentName: 'Ava', Grade: 3, Class: 'Rm 1' },
  { StudentEmail: 'b@s', StudentName: 'Ben', Grade: 3, Class: 'Rm 1' },
  { StudentEmail: 'c@s', StudentName: 'Cai', Grade: 4, Class: 'Rm 2' },
  { StudentEmail: 'd@s', StudentName: 'Dev', Grade: 3, Class: 'Rm 1' }
];
const attempts = [], responses = [];
function add(id, win, email, grade, cls, when, answers) {
  let c = 0;
  answers.forEach(([q, strand, ok]) => {
    if (ok) c++;
    responses.push({ AttemptID: id, Window: win, StudentEmail: email, Grade: grade, Class: cls, QuestionID: q, Strand: strand, Chosen: ok ? 'B' : 'A', IsCorrect: ok });
  });
  attempts.push({ AttemptID: id, Window: win, StudentEmail: email, StudentName: email[0].toUpperCase(), Grade: grade, Class: cls,
    SubmittedAt: new Date(when), Score: c, Total: answers.length, Percent: Math.round(c / answers.length * 1000) / 10 });
}
add('F1', 'Fall 2026', 'a@s', 3, 'Rm 1', '2026-10-01', [['G3-001', 'Number', false], ['G3-003', 'Spatial Sense', false]]);
add('W1', 'Winter 2027', 'a@s', 3, 'Rm 1', '2027-02-01', [['G3-001', 'Number', true], ['G3-003', 'Spatial Sense', true]]);
add('W2', 'Winter 2027', 'b@s', 3, 'Rm 1', '2027-02-01', [['G3-001', 'Number', true], ['G3-003', 'Spatial Sense', false]]);
add('W3', 'Winter 2027', 'c@s', 4, 'Rm 2', '2027-02-02', [['G4-001', 'Algebra', false], ['G4-002', 'Algebra', false]]);
// A retake: older attempt for b@s in the same window should be ignored.
add('W0', 'Winter 2027', 'b@s', 3, 'Rm 1', '2027-01-15', [['G3-001', 'Number', false], ['G3-003', 'Spatial Sense', false]]);

const base = { attempts, responses, questions: Q, roster, settings };

test('whole-school report: latest attempt per student, strands, groups by grade', () => {
  const r = ctx.computeReport_({ ...base, filters: {} });
  assert.strictEqual(r.window, 'Winter 2027');
  assert.strictEqual(r.summary.completed, 3);
  assert.strictEqual(r.summary.rostered, 4);
  assert.strictEqual(r.summary.average, 50);
  const num = r.strands.find(s => s.strand === 'Number');
  assert.strictEqual(num.percent, 100); assert.strictEqual(num.flag, 'strength');
  assert.strictEqual(r.strands.find(s => s.strand === 'Algebra').flag, 'gap');
  assert.strictEqual(r.groupBy, 'grade');
  assert.deepEqual(r.groups.map(g => g.name), ['Grade 3', 'Grade 4']);
  assert.deepEqual(r.notCompleted.map(s => s.name), ['Dev']);
  assert.deepEqual(r.options.windows, ['Fall 2026', 'Winter 2027']);
});

test('grade filter groups by class; class filter lists students', () => {
  const g = ctx.computeReport_({ ...base, filters: { grade: '3' } });
  assert.strictEqual(g.groupBy, 'class');
  assert.strictEqual(g.summary.completed, 2);
  const c = ctx.computeReport_({ ...base, filters: { grade: '3', className: 'Rm 1' } });
  assert.strictEqual(c.groupBy, null);
  assert.deepEqual(c.students.map(s => [s.name, s.percent]), [['A', 100], ['B', 50]]);
  assert.deepEqual(c.students[1].gaps, ['Spatial Sense']);
});

test('trend shows each window for the same scope', () => {
  const r = ctx.computeReport_({ ...base, filters: { grade: '3' } });
  assert.deepEqual(r.trend.map(t => [t.window, t.average]), [['Fall 2026', 0], ['Winter 2027', 75]]);
});

test('item analysis sorts hardest first and finds most common wrong answer', () => {
  const r = ctx.computeReport_({ ...base, filters: { grade: '3' } });
  assert.strictEqual(r.items[0].id, 'G3-003');
  assert.strictEqual(r.items[0].percent, 50);
  assert.strictEqual(r.items[0].commonWrong.choice, 'A');
});

test('older window can be selected', () => {
  const r = ctx.computeReport_({ ...base, filters: { window: 'Fall 2026' } });
  assert.strictEqual(r.summary.completed, 1);
  assert.strictEqual(r.summary.average, 0);
});

// ---- Forge answer ranking ----
test('optionLevel_ maps correct/yellow/orange/red and ignores blanks', () => {
  const q = { Correct: 'B', WrongRank: 'D, C,A' };
  assert.deepEqual(['B', 'D', 'C', 'A', '', 'x'].map(k => ctx.optionLevel_(q, k)), [0, 1, 2, 3, null, null]);
});

test('driveImageId_ recognises Drive share links only', () => {
  assert.strictEqual(ctx.driveImageId_('https://drive.google.com/file/d/1AbCdEfGhIjK_lm/view?usp=sharing'), '1AbCdEfGhIjK_lm');
  assert.strictEqual(ctx.driveImageId_('https://example.com/pic.png'), '');
  assert.strictEqual(ctx.publicQuestion_({ QuestionID: 'x', Question: 'q', ImageURL: 'https://drive.google.com/open?id=1AbCdEfGhIjK_lm', OptionA: '1', OptionB: '2' }).driveImageId, '1AbCdEfGhIjK_lm');
});

test('image-only questions are valid when they have a picture', () => {
  assert.strictEqual(ctx.validQuestion_({ QuestionID: 'x', Question: '', ImageURL: 'https://drive.google.com/file/d/1AbCdEfGhIjK_lm', OptionA: '1', OptionB: '2', Correct: 'A' }), true);
  assert.strictEqual(ctx.validQuestion_({ QuestionID: 'x', Question: '', OptionA: '1', OptionB: '2', Correct: 'A' }), false);
});

test('item levels, student close calls and question detail', () => {
  const qs = Q.map(q => ({ ...q, WrongRank: q.QuestionID === 'G3-003' ? 'A,C,D' : '' }));
  const r = ctx.computeReport_({ ...base, questions: qs, filters: { grade: '3' } });
  const it = r.items.find(i => i.id === 'G3-003');
  assert.deepEqual(it.levels.map(l => l.count), [1, 1, 0, 0]);
  assert.strictEqual(r.students.find(s => s.name === 'B').close, 1);
  const d = ctx.questionDetail_({ ...base, questions: qs, filters: { grade: '3' } }, 'G3-003');
  assert.strictEqual(d.total, 2);
  assert.deepEqual(d.options.map(o => [o.key, o.level, o.students.length]), [['B', 0, 1], ['A', 1, 1], ['C', 2, 0], ['D', 3, 0]]);
});

test('picture notes are removed cleanly', () => {
  const n = 'NEEDS IMAGE from the Google Form: add a Drive link in ImageURL, then tick Active. REVIEW: text cut off.';
  assert.strictEqual(ctx.needsPictureNote_(n), true);
  assert.strictEqual(ctx.removeNeedsPictureNote_(n), 'REVIEW: text cut off.');
});

// ---- The converted Forge questions ----
const csvPath = process.env.FORGE_CSV;
if (csvPath && fs.existsSync(csvPath)) {
  const parse = (txt) => { // minimal RFC4180 parser
    const rows = []; let row = [], f = '', q = false;
    for (let i = 0; i < txt.length; i++) {
      const c = txt[i];
      if (q) { if (c === '"' && txt[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; }
      else if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; }
      else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; } else if (c !== '\r') f += c;
    }
    if (f || row.length) { row.push(f); rows.push(row); }
    const [h, ...rest] = rows; return rest.map(r => Object.fromEntries(h.map((k, i) => [k, r[i]])));
  };
  const forge = parse(fs.readFileSync(csvPath, 'utf8'));
  const formsPath = process.env.FORGE_FORMS;
  if (formsPath && fs.existsSync(formsPath)) {
    const forms = JSON.parse(fs.readFileSync(formsPath, 'utf8'));
    test('Form importer matches every Forge question, finds the grade, and places each picture', () => {
      for (const g of ['2', '3', '4', '5', '6']) {
        const items = JSON.parse(JSON.stringify(forms[g]));
        const plan = ctx.planFormImport_(items, forge);
        assert.ok(!plan.error, plan.error);
        assert.strictEqual(plan.grade, g);
        const n = forge.filter(q => q.Grade === g).length;
        assert.strictEqual(plan.mapped.length, n, 'grade ' + g + ' unmatched: ' + plan.unmatched);
        plan.mapped.forEach((m, i) => assert.strictEqual(m.qid, 'G' + g + '-' + String(i + 1).padStart(3, '0')));
        const needs = forge.filter(q => q.Grade === g && /NEEDS IMAGE/.test(q.Notes)).map(q => q.QuestionID);
        assert.deepEqual(plan.images.map(x => x.qid), needs);
        assert.deepEqual(plan.mismatches, [], JSON.stringify(plan.mismatches));
      }
    });
    test('Form importer flags a wrong answer key', () => {
      const items = JSON.parse(JSON.stringify(forms['4']));
      const q = items.find(it => it.title.startsWith('4. Add'));
      q.choices.forEach(c => { c.correct = c.text === '3923'; });
      const plan = ctx.planFormImport_(items, forge);
      assert.deepEqual(plan.mismatches.map(m => m.qid), ['G4-004']);
    });
  }
  test('every active Forge question is valid, and the key matches the green answer', () => {
    const active = forge.filter(q => q.Active === 'TRUE');
    assert.ok(active.length >= 80);
    active.forEach(q => assert.ok(ctx.validQuestion_(q), q.QuestionID));
    forge.forEach(q => {
      const rank = q.WrongRank.split(',');
      assert.strictEqual(new Set([q.Correct, ...rank]).size, 4, q.QuestionID);
      assert.ok(ctx.STRANDS.includes(q.Strand), q.QuestionID);
    });
  });
}

console.log('\n' + passed + ' tests passed');
