// Scoring and report calculations. Pure functions (no Firebase), so they can be
// unit-tested with `npm test`. Scoring happens here, on the teacher's device,
// because students are never allowed to read the answer key.

import { CHOICES, LEVELS, STRANDS } from '../constants.js';

const norm = (s) => String(s ?? '').trim();

/** 0 = correct, 1 = less correct, 2 = pretty wrong, 3 = wrongest, null = blank / unranked. */
export function optionLevel(q, letter) {
  const ch = norm(letter).toUpperCase();
  if (!q || !CHOICES.includes(ch)) return null;
  if (ch === norm(q.correct).toUpperCase()) return 0;
  const rank = (q.wrongRank || []).map((x) => norm(x).toUpperCase());
  const i = rank.indexOf(ch);
  return i < 0 ? null : Math.min(i + 1, 3);
}

export function pct(c, n) {
  return n ? Math.round((c / n) * 1000) / 10 : null;
}

export function flag(p, t) {
  if (p === null || p === undefined) return '';
  if (p >= t.strength) return 'strength';
  if (p < t.gap) return 'gap';
  return 'developing';
}

/** Scores one attempt against the answer key. Unanswered = wrong. */
export function scoreAttempt(attempt, questions) {
  const ids = attempt.questionIds?.length ? attempt.questionIds : Object.keys(attempt.answers || {});
  const details = [];
  ids.forEach((qid) => {
    const q = questions[qid];
    if (!q || !CHOICES.includes(norm(q.correct).toUpperCase())) return; // question removed or no key
    const chosen = norm((attempt.answers || {})[qid]).toUpperCase();
    const ok = chosen !== '' && chosen === norm(q.correct).toUpperCase();
    details.push({ qid, strand: q.strand || 'Untagged', chosen: CHOICES.includes(chosen) ? chosen : '', correct: ok, level: optionLevel(q, chosen) });
  });
  const score = details.filter((d) => d.correct).length;
  return { details, score, total: details.length, percent: pct(score, details.length) ?? 0 };
}

function strandList(details, t) {
  const tot = {};
  details.forEach((d) => {
    tot[d.strand] = tot[d.strand] || { c: 0, n: 0 };
    tot[d.strand].n++;
    if (d.correct) tot[d.strand].c++;
  });
  const names = STRANDS.filter((s) => tot[s]).concat(Object.keys(tot).filter((s) => !STRANDS.includes(s)));
  return names.map((s) => {
    const p = pct(tot[s].c, tot[s].n);
    return { strand: s, correct: tot[s].c, total: tot[s].n, percent: p, flag: flag(p, t) };
  });
}

function average(list) {
  if (!list.length) return null;
  return Math.round((list.reduce((a, x) => a + x.percent, 0) / list.length) * 10) / 10;
}

const gradeOrder = (a, b) => (a === 'K' ? -1 : b === 'K' ? 1 : Number(a) - Number(b));

/**
 * The latest submitted attempt per student per window, scored.
 * Returns [{ student, attempt, window, scored }]
 */
export function scoredResults(students, attemptsBySn, questions) {
  const out = [];
  students.forEach((st) => {
    const byWindow = {};
    (attemptsBySn[st.studentNumber] || []).forEach((a) => {
      if (a.status !== 'submitted') return;
      const prev = byWindow[a.window];
      if (!prev || (a.submittedAt || 0) > (prev.submittedAt || 0)) byWindow[a.window] = a;
    });
    Object.values(byWindow).forEach((a) => {
      out.push({ student: st, attempt: a, window: a.window, scored: scoreAttempt(a, questions) });
    });
  });
  return out;
}

/**
 * Everything the Reports page shows.
 * students: current roster entries in scope [{studentNumber, name, grade, classId, className}]
 * attemptsBySn: { sn: [attempt] }   questions: { qid: question + key }
 * filters: { window, grade, classId }  ('all' = everything)
 * settings: { strength, gap, currentWindow }
 */
export function buildReport({ students, attemptsBySn, questions, filters = {}, settings }) {
  const t = { strength: Number(settings.strength) || 75, gap: Number(settings.gap) || 60 };
  const fGrade = filters.grade && filters.grade !== 'all' ? filters.grade : '';
  const fClass = filters.classId && filters.classId !== 'all' ? filters.classId : '';
  const inScope = students.filter((s) => (!fGrade || s.grade === fGrade) && (!fClass || s.classId === fClass));

  const all = scoredResults(inScope, attemptsBySn, questions);

  // Windows in the order they were first used.
  const first = {};
  all.forEach((r) => { const w = r.window; const ts = r.attempt.submittedAt || 0; if (!(w in first) || ts < first[w]) first[w] = ts; });
  Object.values(attemptsBySn).flat().forEach((a) => { if (a && !(a.window in first)) first[a.window] = a.startedAt || Infinity; });
  if (settings.currentWindow && !(settings.currentWindow in first)) first[settings.currentWindow] = Infinity;
  const windows = Object.keys(first).sort((a, b) => first[a] - first[b]);
  const win = filters.window || settings.currentWindow || windows[windows.length - 1];

  const results = all.filter((r) => r.window === win);
  const details = results.flatMap((r) => r.scored.details);

  // Score bands
  const bands = [
    { label: '75% and up', min: 75, max: 101, count: 0 },
    { label: '60–74%', min: 60, max: 75, count: 0 },
    { label: '50–59%', min: 50, max: 60, count: 0 },
    { label: 'Below 50%', min: -1, max: 50, count: 0 },
  ];
  results.forEach((r) => bands.forEach((b) => { if (r.scored.percent >= b.min && r.scored.percent < b.max) b.count++; }));

  // Not finished / in progress
  const done = new Set(results.map((r) => r.student.studentNumber));
  const notCompleted = inScope.filter((s) => !done.has(s.studentNumber)).map((s) => {
    const ip = (attemptsBySn[s.studentNumber] || []).find((a) => a.window === win && a.status === 'in_progress');
    return {
      studentNumber: s.studentNumber, name: s.name, grade: s.grade, className: s.className,
      status: ip ? `In progress (${ip.answeredCount || Object.keys(ip.answers || {}).length}/${(ip.questionIds || []).length})` : 'Not started',
    };
  }).sort((a, b) => (a.className + a.name).localeCompare(b.className + b.name));

  const strands = strandList(details, t);

  // Breakdown by the next level down
  const groupBy = fClass ? null : fGrade ? 'class' : 'grade';
  let groups = [];
  if (groupBy) {
    const g = {};
    results.forEach((r) => {
      const key = groupBy === 'grade' ? r.student.grade : r.student.className || '(no class)';
      (g[key] = g[key] || []).push(r);
    });
    const keys = Object.keys(g).sort(groupBy === 'grade' ? gradeOrder : (a, b) => a.localeCompare(b, undefined, { numeric: true }));
    groups = keys.map((k) => ({
      name: groupBy === 'grade' ? (k === 'K' ? 'Kindergarten' : `Grade ${k}`) : k,
      students: g[k].length,
      average: average(g[k].map((r) => r.scored)),
      strands: strandList(g[k].flatMap((r) => r.scored.details), t),
    }));
  }

  // Item analysis
  const items = {};
  details.forEach((d) => {
    const it = items[d.qid] = items[d.qid] || { n: 0, c: 0, choices: { A: 0, B: 0, C: 0, D: 0, blank: 0 }, levels: [0, 0, 0, 0], unranked: 0 };
    it.n++;
    if (d.correct) it.c++;
    if (d.chosen) it.choices[d.chosen]++; else it.choices.blank++;
    if (d.level === null) it.unranked++; else it.levels[d.level]++;
  });
  const itemList = Object.entries(items).map(([qid, it]) => {
    const q = questions[qid] || {};
    const key = norm(q.correct).toUpperCase();
    const wrong = CHOICES.filter((k) => k !== key && it.choices[k] > 0).sort((x, y) => it.choices[y] - it.choices[x]);
    const p = pct(it.c, it.n);
    return {
      id: qid, grade: q.grade, strand: q.strand || 'Untagged', expectation: q.expectation || '',
      question: q.text || '', correct: key, students: it.n, percent: p, flag: flag(p, t), choices: it.choices,
      levels: it.levels.map((count, i) => ({ ...LEVELS[i], count, percent: pct(count, it.n) })),
      commonWrong: wrong.length ? { choice: wrong[0], text: q.options?.[wrong[0]]?.text || '(picture)', count: it.choices[wrong[0]] } : null,
    };
  }).sort((a, b) => a.percent - b.percent || a.id.localeCompare(b.id, undefined, { numeric: true }));

  // Students
  const studentRows = results.map((r) => {
    const st = strandList(r.scored.details, t);
    const lv = [0, 0, 0, 0];
    r.scored.details.forEach((d) => { if (d.level !== null) lv[d.level]++; });
    return {
      studentNumber: r.student.studentNumber, name: r.student.name, grade: r.attempt.grade || r.student.grade,
      className: r.student.className, score: r.scored.score, total: r.scored.total, percent: r.scored.percent,
      submittedAt: r.attempt.submittedAt || 0, strands: st, close: lv[1], farOff: lv[2] + lv[3],
      strengths: st.filter((s) => s.flag === 'strength').map((s) => s.strand),
      gaps: st.filter((s) => s.flag === 'gap').map((s) => s.strand),
    };
  }).sort((a, b) => (a.className + a.name).localeCompare(b.className + b.name));

  // Trend across windows for the same students
  const trend = windows.map((w) => {
    const rs = all.filter((r) => r.window === w);
    return { window: w, students: rs.length, average: average(rs.map((r) => r.scored)), strands: strandList(rs.flatMap((r) => r.scored.details), t) };
  }).filter((x) => x.students > 0);

  return {
    window: win, windows, thresholds: t, groupBy, groups, strands,
    strengths: strands.filter((s) => s.flag === 'strength').map((s) => s.strand),
    gaps: strands.filter((s) => s.flag === 'gap').map((s) => s.strand),
    summary: { completed: results.length, rostered: inScope.length, average: average(results.map((r) => r.scored)), bands },
    items: itemList, students: studentRows, notCompleted, trend,
  };
}

/** One question: each answer, how wrong it is, and which students chose it. */
export function questionDetail({ students, attemptsBySn, questions, filters = {}, settings }, qid) {
  const fGrade = filters.grade && filters.grade !== 'all' ? filters.grade : '';
  const fClass = filters.classId && filters.classId !== 'all' ? filters.classId : '';
  const inScope = students.filter((s) => (!fGrade || s.grade === fGrade) && (!fClass || s.classId === fClass));
  const win = filters.window || settings.currentWindow;
  const results = scoredResults(inScope, attemptsBySn, questions).filter((r) => r.window === win);
  const q = questions[qid] || {};
  const groups = { A: [], B: [], C: [], D: [], blank: [] };
  results.forEach((r) => {
    const d = r.scored.details.find((x) => x.qid === qid);
    if (!d) return;
    (groups[d.chosen] || groups.blank).push({ name: r.student.name, className: r.student.className });
  });
  const total = Object.values(groups).reduce((a, g) => a + g.length, 0);
  Object.values(groups).forEach((g) => g.sort((a, b) => a.name.localeCompare(b.name)));
  const options = CHOICES.filter((k) => q.options?.[k] && (q.options[k].text || q.options[k].hasImage)).map((k) => {
    const level = optionLevel(q, k);
    return { key: k, text: q.options[k].text, hasImage: !!q.options[k].hasImage, level,
      levelLabel: level === null ? '' : LEVELS[level].label, students: groups[k], percent: pct(groups[k].length, total) };
  }).sort((a, b) => (a.level ?? 9) - (b.level ?? 9));
  return { id: qid, grade: q.grade, strand: q.strand, question: q.text, hasImage: !!q.hasImage, window: win, total, options, blank: groups.blank };
}

/** A student's results across every window (multi-year history). */
export function studentHistory(student, attempts, questions, settings) {
  const t = { strength: Number(settings.strength) || 75, gap: Number(settings.gap) || 60 };
  return scoredResults([student], { [student.studentNumber]: attempts }, questions)
    .sort((a, b) => (a.attempt.submittedAt || 0) - (b.attempt.submittedAt || 0))
    .map((r) => ({
      window: r.window, grade: r.attempt.grade, className: r.attempt.className,
      submittedAt: r.attempt.submittedAt, score: r.scored.score, total: r.scored.total, percent: r.scored.percent,
      strands: strandList(r.scored.details, t),
    }));
}
