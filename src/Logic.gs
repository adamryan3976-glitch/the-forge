/**
 * Logic.gs — pure functions for scoring and reporting.
 * No spreadsheet calls in here, so this file can be unit-tested outside Google.
 */

/** Keeps only questions that are complete and usable. */
function validQuestion_(q) {
  var correct = norm_(q.Correct).toUpperCase();
  if (!norm_(q.QuestionID)) return false;
  if (!norm_(q.Question) && !norm_(q.ImageURL)) return false;
  if (CHOICES.indexOf(correct) < 0) return false;
  if (!norm_(q['Option' + correct])) return false;
  if (q.Active !== undefined && norm_(q.Active) !== '' && !isTrue_(q.Active)) return false;
  return true;
}

/** Question as sent to the browser — never includes the answer. */
function publicQuestion_(q) {
  var options = [];
  CHOICES.forEach(function (k) {
    var t = norm_(q['Option' + k]);
    if (t) options.push({ key: k, text: t });
  });
  var driveId = driveImageId_(q.ImageURL);
  return { id: norm_(q.QuestionID), text: norm_(q.Question), options: options,
           image: driveId ? '' : safeImageUrl_(q.ImageURL), driveImageId: driveId };
}

/** Drive file id from a Drive share link, or '' if the link is not a Drive file. */
function driveImageId_(url) {
  var m = norm_(url).match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([\w-]{10,})/);
  return m ? m[1] : '';
}

/**
 * 0 = correct, 1 = less correct (yellow), 2 = pretty wrong (orange), 3 = wrongest (red),
 * null = blank or not ranked.
 */
function optionLevel_(q, letter) {
  var ch = norm_(letter).toUpperCase();
  if (CHOICES.indexOf(ch) < 0) return null;
  if (ch === norm_(q.Correct).toUpperCase()) return 0;
  var rank = norm_(q.WrongRank).toUpperCase().split(/[^A-D]+/).filter(String);
  var i = rank.indexOf(ch);
  return i < 0 ? null : Math.min(i + 1, 3);
}

/** Only allow https images from Google Drive / Googleusercontent or other https hosts. */
function safeImageUrl_(url) {
  var u = norm_(url);
  if (!/^https:\/\/[^\s"'<>]+$/i.test(u)) return '';
  var m = u.match(/drive\.google\.com\/(?:file\/d\/|open\?id=)([\w-]+)/);
  if (m) return 'https://drive.google.com/thumbnail?id=' + m[1] + '&sz=w1000';
  return u;
}

/** Deterministic shuffle so a student who reloads sees the same order. */
function seededShuffle_(arr, seedText) {
  var a = arr.slice();
  var h = 2166136261;
  for (var i = 0; i < seedText.length; i++) { h ^= seedText.charCodeAt(i); h = Math.imul(h, 16777619); }
  function rnd() { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; }
  for (var j = a.length - 1; j > 0; j--) {
    var k = Math.floor(rnd() * (j + 1));
    var t = a[j]; a[j] = a[k]; a[k] = t;
  }
  return a;
}

/**
 * Scores answers against the key. Unanswered or invalid answers are wrong.
 * questions: full rows (with Correct). answers: { QuestionID: 'A'|'B'|'C'|'D' }.
 */
function scoreAnswers_(questions, answers) {
  answers = answers || {};
  var details = questions.map(function (q) {
    var id = norm_(q.QuestionID);
    var chosen = norm_(answers[id]).toUpperCase();
    if (CHOICES.indexOf(chosen) < 0) chosen = '';
    var correct = norm_(q.Correct).toUpperCase();
    return {
      QuestionID: id, Strand: norm_(q.Strand) || 'Untagged', Expectation: norm_(q.Expectation),
      Chosen: chosen, IsCorrect: chosen !== '' && chosen === correct
    };
  });
  var score = details.filter(function (d) { return d.IsCorrect; }).length;
  var total = details.length;
  return { details: details, score: score, total: total,
           percent: total ? Math.round((score / total) * 1000) / 10 : 0 };
}

function pct_(correct, total) {
  return total ? Math.round((correct / total) * 1000) / 10 : null;
}

function flag_(p, settings) {
  if (p === null) return '';
  if (p >= settings.strength) return 'strength';
  if (p < settings.gap) return 'gap';
  return 'developing';
}

function toTime_(v) {
  if (v instanceof Date) return v.getTime();
  var t = new Date(v).getTime();
  return isNaN(t) ? 0 : t;
}

/**
 * Builds every number the staff dashboard and exports need.
 * d = { attempts, responses, questions, roster, filters:{window,grade,className}, settings }
 */
function scope_(d) {
  var settings = d.settings;
  var f = d.filters || {};
  var fGrade = f.grade && f.grade !== 'all' ? gradeKey_(f.grade) : '';
  var fClass = f.className && f.className !== 'all' ? norm_(f.className) : '';

  // Latest submitted attempt per student per window.
  var latest = {};
  (d.attempts || []).forEach(function (a) {
    if (!norm_(a.SubmittedAt)) return;
    var key = norm_(a.Window) + '|' + normEmail_(a.StudentEmail);
    if (!latest[key] || toTime_(a.SubmittedAt) > toTime_(latest[key].SubmittedAt)) latest[key] = a;
  });
  var allAttempts = Object.keys(latest).map(function (k) { return latest[k]; });

  // Windows in the order they were first used.
  var firstSeen = {};
  allAttempts.forEach(function (a) {
    var w = norm_(a.Window), t = toTime_(a.SubmittedAt);
    if (!(w in firstSeen) || t < firstSeen[w]) firstSeen[w] = t;
  });
  if (settings.currentWindow && !(settings.currentWindow in firstSeen)) firstSeen[settings.currentWindow] = Infinity;
  var windows = Object.keys(firstSeen).sort(function (a, b) { return firstSeen[a] - firstSeen[b]; });
  var win = norm_(f.window) || settings.currentWindow || windows[windows.length - 1];

  function inScope(grade, cls) {
    if (fGrade && gradeKey_(grade) !== fGrade) return false;
    if (fClass && norm_(cls) !== fClass) return false;
    return true;
  }

  // Responses grouped by attempt.
  var respByAttempt = {};
  (d.responses || []).forEach(function (r) {
    var id = norm_(r.AttemptID);
    (respByAttempt[id] = respByAttempt[id] || []).push(r);
  });

  var qMap = {};
  (d.questions || []).forEach(function (q) { qMap[norm_(q.QuestionID)] = q; });

  function strandTotals(attempts) {
    var t = {};
    attempts.forEach(function (a) {
      (respByAttempt[norm_(a.AttemptID)] || []).forEach(function (r) {
        var s = norm_(r.Strand) || 'Untagged';
        t[s] = t[s] || { c: 0, n: 0 };
        t[s].n++;
        if (isTrue_(r.IsCorrect)) t[s].c++;
      });
    });
    return t;
  }

  function strandList(totals) {
    var names = STRANDS.filter(function (s) { return totals[s]; })
      .concat(Object.keys(totals).filter(function (s) { return STRANDS.indexOf(s) < 0; }));
    return names.map(function (s) {
      var p = pct_(totals[s].c, totals[s].n);
      return { strand: s, correct: totals[s].c, total: totals[s].n, percent: p, flag: flag_(p, settings) };
    });
  }

  function avg(attempts) {
    if (!attempts.length) return null;
    var sum = 0;
    attempts.forEach(function (a) { sum += Number(a.Percent) || 0; });
    return Math.round((sum / attempts.length) * 10) / 10;
  }

  var scoped = allAttempts.filter(function (a) {
    return norm_(a.Window) === win && inScope(a.Grade, a.Class);
  });
  return { settings: settings, fGrade: fGrade, fClass: fClass, allAttempts: allAttempts, windows: windows,
           win: win, inScope: inScope, respByAttempt: respByAttempt, qMap: qMap, scoped: scoped,
           strandTotals: strandTotals, strandList: strandList, avg: avg };
}

/**
 * Everything staff need for one question: each answer, how wrong it is,
 * and which students chose it (like the Forge "G" tabs).
 */
function questionDetail_(d, questionId) {
  var sc = scope_(d);
  var id = norm_(questionId);
  var q = sc.qMap[id] || {};
  var groups = {};
  CHOICES.concat(['blank']).forEach(function (k) { groups[k] = []; });
  sc.scoped.forEach(function (a) {
    (sc.respByAttempt[norm_(a.AttemptID)] || []).forEach(function (r) {
      if (norm_(r.QuestionID) !== id) return;
      var ch = norm_(r.Chosen).toUpperCase();
      (groups[ch] || groups.blank).push({ name: norm_(a.StudentName), className: norm_(a.Class), percent: Number(a.Percent) || 0 });
    });
  });
  var total = 0;
  Object.keys(groups).forEach(function (k) {
    groups[k].sort(function (x, y) { return x.name.localeCompare(y.name); });
    total += groups[k].length;
  });
  var options = CHOICES.filter(function (k) { return norm_(q['Option' + k]) || groups[k].length; }).map(function (k) {
    var lvl = optionLevel_(q, k);
    return { key: k, text: norm_(q['Option' + k]), level: lvl, levelLabel: lvl === null ? '' : LEVELS[lvl].label,
             students: groups[k], percent: pct_(groups[k].length, total) };
  }).sort(function (a, b) { return (a.level === null ? 9 : a.level) - (b.level === null ? 9 : b.level); });
  return {
    id: id, grade: gradeKey_(q.Grade), strand: norm_(q.Strand), question: norm_(q.Question),
    window: sc.win, total: total, options: options, blank: groups.blank
  };
}

function computeReport_(d) {
  var sc = scope_(d);
  var settings = sc.settings, fGrade = sc.fGrade, fClass = sc.fClass, allAttempts = sc.allAttempts,
      windows = sc.windows, win = sc.win, inScope = sc.inScope, respByAttempt = sc.respByAttempt,
      qMap = sc.qMap, scoped = sc.scoped, strandTotals = sc.strandTotals, strandList = sc.strandList, avg = sc.avg;

  // ---- Summary & score bands ----
  var bands = [
    { label: '75% and up', min: 75, max: 101, count: 0 },
    { label: '60–74%', min: 60, max: 75, count: 0 },
    { label: '50–59%', min: 50, max: 60, count: 0 },
    { label: 'Below 50%', min: -1, max: 50, count: 0 }
  ];
  scoped.forEach(function (a) {
    var p = Number(a.Percent) || 0;
    bands.forEach(function (b) { if (p >= b.min && p < b.max) b.count++; });
  });

  var rosterInScope = (d.roster || []).filter(function (r) { return inScope(r.Grade, r.Class); });
  var doneEmails = {};
  scoped.forEach(function (a) { doneEmails[normEmail_(a.StudentEmail)] = true; });
  var notCompleted = rosterInScope
    .filter(function (r) { return !doneEmails[normEmail_(r.StudentEmail)]; })
    .map(function (r) { return { name: norm_(r.StudentName), grade: gradeKey_(r.Grade), className: norm_(r.Class) }; })
    .sort(function (a, b) { return (a.className + a.name).localeCompare(b.className + b.name); });

  var strands = strandList(strandTotals(scoped));

  // ---- Breakdown by the next level down ----
  var groupBy = fClass ? null : (fGrade ? 'class' : 'grade');
  var groups = [];
  if (groupBy) {
    var gmap = {};
    scoped.forEach(function (a) {
      var key = groupBy === 'grade' ? 'Grade ' + gradeKey_(a.Grade) : norm_(a.Class) || '(no class)';
      (gmap[key] = gmap[key] || []).push(a);
    });
    groups = Object.keys(gmap).sort(function (x, y) { return x.localeCompare(y, undefined, { numeric: true }); })
      .map(function (k) {
        return { name: k, students: gmap[k].length, average: avg(gmap[k]), strands: strandList(strandTotals(gmap[k])) };
      });
  }

  // ---- Item analysis ----
  var items = {};
  scoped.forEach(function (a) {
    (respByAttempt[norm_(a.AttemptID)] || []).forEach(function (r) {
      var id = norm_(r.QuestionID);
      var it = items[id] = items[id] || { id: id, strand: norm_(r.Strand) || 'Untagged', expectation: norm_(r.Expectation),
                                          grade: gradeKey_(r.Grade), n: 0, c: 0, choices: { A: 0, B: 0, C: 0, D: 0, blank: 0 },
                                          levels: [0, 0, 0, 0], unranked: 0 };
      it.n++;
      if (isTrue_(r.IsCorrect)) it.c++;
      var ch = norm_(r.Chosen).toUpperCase();
      if (it.choices[ch] !== undefined) it.choices[ch]++; else it.choices.blank++;
      var lvl = qMap[id] ? optionLevel_(qMap[id], ch) : (isTrue_(r.IsCorrect) ? 0 : null);
      if (lvl === null) it.unranked++; else it.levels[lvl]++;
    });
  });
  var itemList = Object.keys(items).map(function (id) {
    var it = items[id], q = qMap[id] || {};
    var key = norm_(q.Correct).toUpperCase();
    var wrong = CHOICES.filter(function (k) { return k !== key && it.choices[k] > 0; })
      .sort(function (x, y) { return it.choices[y] - it.choices[x]; });
    var p = pct_(it.c, it.n);
    return {
      id: id, grade: it.grade, strand: it.strand, expectation: it.expectation,
      question: norm_(q.Question), correct: key, students: it.n, percent: p, flag: flag_(p, settings),
      choices: it.choices,
      levels: it.levels.map(function (count, i) { return { label: LEVELS[i].label, colour: LEVELS[i].colour, count: count, percent: pct_(count, it.n) }; }),
      unranked: it.unranked,
      commonWrong: wrong.length ? { choice: wrong[0], text: norm_(q['Option' + wrong[0]]), count: it.choices[wrong[0]] } : null
    };
  }).sort(function (a, b) { return a.percent - b.percent; });

  // ---- Students ----
  var students = scoped.map(function (a) {
    var st = strandList(strandTotals([a]));
    var lv = [0, 0, 0, 0];
    (respByAttempt[norm_(a.AttemptID)] || []).forEach(function (r) {
      var q = qMap[norm_(r.QuestionID)];
      var l = q ? optionLevel_(q, r.Chosen) : null;
      if (l !== null) lv[l]++;
    });
    return {
      name: norm_(a.StudentName), email: normEmail_(a.StudentEmail), grade: gradeKey_(a.Grade),
      className: norm_(a.Class), score: Number(a.Score) || 0, total: Number(a.Total) || 0,
      percent: Number(a.Percent) || 0, submittedAt: toTime_(a.SubmittedAt), strands: st,
      close: lv[1], farOff: lv[2] + lv[3],
      strengths: st.filter(function (s) { return s.flag === 'strength'; }).map(function (s) { return s.strand; }),
      gaps: st.filter(function (s) { return s.flag === 'gap'; }).map(function (s) { return s.strand; })
    };
  }).sort(function (a, b) { return (a.className + a.name).localeCompare(b.className + b.name); });

  // ---- Trend across windows (same grade/class filter) ----
  var trend = windows.map(function (w) {
    var at = allAttempts.filter(function (a) { return norm_(a.Window) === w && inScope(a.Grade, a.Class); });
    return { window: w, students: at.length, average: avg(at), strands: strandList(strandTotals(at)) };
  }).filter(function (t) { return t.students > 0; });

  // ---- Filter choices ----
  var classMap = {};
  var gradeSet = {};
  (d.roster || []).concat(allAttempts).forEach(function (r) {
    var g = gradeKey_(r.Grade), c = norm_(r.Class);
    if (g) gradeSet[g] = true;
    if (c) { classMap[c] = classMap[c] || {}; classMap[c][g] = true; }
  });
  var gradeOrder = function (a, b) {
    if (a === 'K') return -1; if (b === 'K') return 1;
    return Number(a) - Number(b);
  };

  return {
    window: win,
    filters: { window: win, grade: fGrade || 'all', className: fClass || 'all' },
    thresholds: { strength: settings.strength, gap: settings.gap },
    summary: {
      completed: scoped.length,
      rostered: rosterInScope.length,
      average: avg(scoped),
      bands: bands.map(function (b) { return { label: b.label, count: b.count }; })
    },
    strands: strands,
    strengths: strands.filter(function (s) { return s.flag === 'strength'; }).map(function (s) { return s.strand; }),
    gaps: strands.filter(function (s) { return s.flag === 'gap'; }).map(function (s) { return s.strand; }),
    groupBy: groupBy,
    groups: groups,
    items: itemList,
    students: students,
    notCompleted: notCompleted,
    trend: trend,
    options: {
      windows: windows,
      grades: Object.keys(gradeSet).sort(gradeOrder),
      classes: Object.keys(classMap).sort().map(function (c) {
        return { name: c, grades: Object.keys(classMap[c]).sort(gradeOrder) };
      })
    }
  };
}
