/* ===================== Config.gs ===================== */
/**
 * Config.gs — sheet names, column layouts and default settings.
 *
 * SECURITY NOTE: In Apps Script, any top-level function WITHOUT a trailing
 * underscore can be called from the browser via google.script.run.
 * Every helper in this project ends in "_" so only the intentional API
 * functions in Api.gs are reachable from the web page.
 */

var SHEET = {
  SETTINGS: 'Settings',
  QUESTIONS: 'Questions',
  STAFF: 'Staff',
  ROSTER: 'Roster',
  ATTEMPTS: 'Attempts',
  RESPONSES: 'Responses',
  AUDIT: 'Audit Log'
};

var HEADERS = {
  'Settings':  ['Key', 'Value', 'Notes'],
  'Questions': ['QuestionID', 'Grade', 'Strand', 'Expectation', 'Question', 'ImageURL',
                'OptionA', 'OptionB', 'OptionC', 'OptionD', 'Correct', 'WrongRank', 'Active', 'Notes',
                'OptionAImage', 'OptionBImage', 'OptionCImage', 'OptionDImage'],
  'Staff':     ['Email', 'Name', 'Role'],
  'Roster':    ['StudentEmail', 'StudentName', 'Grade', 'Class', 'TeacherEmail'],
  'Attempts':  ['AttemptID', 'Window', 'StudentEmail', 'StudentName', 'Grade', 'Class',
                'StartedAt', 'SubmittedAt', 'Score', 'Total', 'Percent'],
  'Responses': ['AttemptID', 'Window', 'StudentEmail', 'Grade', 'Class', 'QuestionID',
                'Strand', 'Expectation', 'Chosen', 'IsCorrect'],
  'Audit Log': ['Timestamp', 'Email', 'Action', 'Details']
};

/** Ontario Mathematics (2020) strands that multiple-choice items can assess. */
var STRANDS = ['Number', 'Algebra', 'Data', 'Spatial Sense', 'Financial Literacy'];

var CHOICES = ['A', 'B', 'C', 'D'];

/**
 * How wrong each answer is, matching the Forge colour coding.
 * WrongRank on the Questions tab lists the wrong letters from closest to furthest,
 * e.g. "C,A,D" = C is "less correct" (yellow), A "pretty wrong" (orange), D "wrongest" (red).
 */
var LEVELS = [
  { key: 'correct', label: 'Correct', colour: 'green' },
  { key: 'close', label: 'Less correct', colour: 'yellow' },
  { key: 'wrong', label: 'Pretty wrong', colour: 'orange' },
  { key: 'wrongest', label: 'Wrongest', colour: 'red' }
];

var DEFAULT_SETTINGS = [
  ['SchoolName', 'Winchester P.S.', 'Shown at the top of every page.'],
  ['StudentDomains', 'ddsbstudent.ca', 'Comma-separated email domains allowed to take assessments.'],
  ['StaffDomains', 'ddsb.ca', 'Comma-separated domains staff accounts must use (staff must ALSO be listed on the Staff tab).'],
  ['CurrentWindow', 'Fall 2026', 'Saved with every attempt. Change it each assessment period (e.g. Winter 2027) to see trends.'],
  ['AssessmentOpen', 'TRUE', 'Set to FALSE to stop students starting or submitting.'],
  ['AllowRetakes', 'FALSE', 'FALSE = one submitted attempt per student per window.'],
  ['ShowScoreToStudent', 'FALSE', 'TRUE = students see their score when they finish.'],
  ['ShuffleQuestions', 'TRUE', 'Shuffle question order for each student.'],
  ['StrengthThreshold', '75', '% correct at or above this is flagged as a strength.'],
  ['GapThreshold', '60', '% correct below this is flagged as a gap.']
];

/* ===================== Util.gs ===================== */
/**
 * Util.gs — sheet access, settings, identity and audit helpers.
 * All functions here end in "_" so they cannot be called from the browser.
 */

function ss_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function sheet_(name) {
  var sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('Missing tab "' + name + '". Run Math Assessment → Set up / repair sheets.');
  return sh;
}

/** Reads a tab into an array of objects keyed by header name. */
function readRows_(name) {
  var sh = sheet_(name);
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];
  var values = sh.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = values[0].map(function (h) { return String(h).trim(); });
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var empty = true;
    var obj = {};
    for (var c = 0; c < headers.length; c++) {
      if (!headers[c]) continue;
      obj[headers[c]] = row[c];
      if (row[c] !== '' && row[c] !== null && row[c] !== false) empty = false; // unticked checkboxes don't count
    }
    if (!empty) { obj._row = r + 1; out.push(obj); }
  }
  return out;
}

/** Appends objects to a tab using that tab's header order. */
function appendRows_(name, objects) {
  if (!objects.length) return;
  var sh = sheet_(name);
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var rows = objects.map(function (o) {
    return headers.map(function (h) {
      var v = o[h];
      return v === undefined || v === null ? '' : sanitizeCell_(v);
    });
  });
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
}

/**
 * Stops "formula injection": text typed by users that starts with = + - @
 * would otherwise run as a formula when the sheet is opened.
 */
function sanitizeCell_(v) {
  if (typeof v !== 'string') return v;
  if (/^[=+\-@]/.test(v)) return "'" + v;
  return v;
}

function norm_(s) {
  return String(s === undefined || s === null ? '' : s).trim();
}

function normEmail_(s) {
  return norm_(s).toLowerCase();
}

function isTrue_(v) {
  return v === true || /^(true|yes|y|1)$/i.test(norm_(v));
}

function gradeKey_(g) {
  var s = norm_(g).toUpperCase();
  if (s === 'K' || s === 'JK' || s === 'SK' || s === 'KINDERGARTEN') return 'K';
  var n = parseInt(s, 10);
  return isNaN(n) ? s : String(n);
}

/* ---------- Settings ---------- */

function getSettings_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('settings');
  if (hit) return JSON.parse(hit);
  var s = {};
  DEFAULT_SETTINGS.forEach(function (d) { s[d[0]] = d[1]; });
  readRows_(SHEET.SETTINGS).forEach(function (r) {
    var k = norm_(r.Key);
    if (k) s[k] = norm_(r.Value);
  });
  var settings = {
    schoolName: s.SchoolName,
    studentDomains: splitList_(s.StudentDomains),
    staffDomains: splitList_(s.StaffDomains),
    currentWindow: norm_(s.CurrentWindow) || 'Default',
    open: isTrue_(s.AssessmentOpen),
    allowRetakes: isTrue_(s.AllowRetakes),
    showScore: isTrue_(s.ShowScoreToStudent),
    shuffle: isTrue_(s.ShuffleQuestions),
    strength: Number(s.StrengthThreshold) || 75,
    gap: Number(s.GapThreshold) || 60
  };
  cache.put('settings', JSON.stringify(settings), 60);
  return settings;
}

function splitList_(s) {
  return norm_(s).toLowerCase().split(/[,\s]+/).filter(String);
}

/* ---------- Identity ---------- */

/**
 * Returns the signed-in Google account's email.
 * The web app is deployed "Execute as: Me" and "Access: anyone in the domain",
 * so Google handles the DDSB sign-in and this value cannot be faked by the browser.
 */
function currentEmail_() {
  return normEmail_(Session.getActiveUser().getEmail());
}

function domainOf_(email) {
  var i = email.lastIndexOf('@');
  return i < 0 ? '' : email.slice(i + 1);
}

function staffRecord_(email) {
  if (!email) return null;
  var settings = getSettings_();
  if (settings.staffDomains.length && settings.staffDomains.indexOf(domainOf_(email)) < 0) return null;
  var owner = normEmail_(Session.getEffectiveUser().getEmail());
  var rows = readRows_(SHEET.STAFF);
  for (var i = 0; i < rows.length; i++) {
    if (normEmail_(rows[i].Email) === email) {
      return { email: email, name: norm_(rows[i].Name) || email,
               isAdmin: /admin/i.test(norm_(rows[i].Role)) || email === owner };
    }
  }
  if (email === owner) return { email: email, name: email, isAdmin: true };
  return null;
}

function rosterRecord_(email) {
  if (!email) return null;
  var settings = getSettings_();
  if (settings.studentDomains.length && settings.studentDomains.indexOf(domainOf_(email)) < 0) return null;
  var rows = readRows_(SHEET.ROSTER);
  for (var i = 0; i < rows.length; i++) {
    if (normEmail_(rows[i].StudentEmail) === email) {
      return {
        email: email,
        name: norm_(rows[i].StudentName) || email.split('@')[0],
        grade: gradeKey_(rows[i].Grade),
        className: norm_(rows[i].Class),
        teacherEmail: normEmail_(rows[i].TeacherEmail)
      };
    }
  }
  return null;
}

function requireStaff_() {
  var s = staffRecord_(currentEmail_());
  if (!s) throw new Error('This page is for Winchester staff only.');
  return s;
}

function requireStudent_() {
  var email = currentEmail_();
  if (!email) throw new Error('We could not tell who is signed in. Please sign in with your school Google account.');
  var st = rosterRecord_(email);
  if (!st) throw new Error('Your account is not on a class list yet. Please tell your teacher.');
  return st;
}

/* ---------- Audit ---------- */

function audit_(email, action, details) {
  try {
    appendRows_(SHEET.AUDIT, [{
      Timestamp: new Date(), Email: email, Action: action,
      Details: typeof details === 'string' ? details : JSON.stringify(details || '')
    }]);
  } catch (e) { /* never block the user because of logging */ }
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function uuid_() {
  return Utilities.getUuid().slice(0, 8).toUpperCase();
}

/* ===================== Logic.gs ===================== */
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
  if (!optionFilled_(q, correct)) return false;
  if (q.Active !== undefined && norm_(q.Active) !== '' && !isTrue_(q.Active)) return false;
  return true;
}

/** An answer choice exists if it has text or a picture. */
function optionFilled_(q, k) {
  return !!(norm_(q['Option' + k]) || norm_(q['Option' + k + 'Image']));
}

/**
 * True when the answers are pictures: every choice is just its own letter
 * ("A", "B"…) and the question uses pictures. (G2-006's real letter answers have no picture.)
 */
function hasPictureAnswers_(q) {
  var letters = CHOICES.filter(function (k) { return norm_(q['Option' + k]); });
  var bare = letters.length >= 2 && letters.every(function (k) { return norm_(q['Option' + k]).toUpperCase() === k; });
  var anyOptImg = CHOICES.some(function (k) { return norm_(q['Option' + k + 'Image']); });
  var usesPictures = anyOptImg || !!norm_(q.ImageURL) || /NEEDS IMAGE/i.test(norm_(q.Notes));
  return anyOptImg || (bare && usesPictures);
}

/** Letters whose picture is still missing on a picture-answer question. */
function missingOptionPictures_(q) {
  if (!hasPictureAnswers_(q)) return [];
  return CHOICES.filter(function (k) { return norm_(q['Option' + k]) && !norm_(q['Option' + k + 'Image']); });
}

/** Question as sent to the browser — never includes the answer. */
function publicQuestion_(q) {
  var options = [];
  CHOICES.forEach(function (k) {
    var t = norm_(q['Option' + k]);
    var imgUrl = norm_(q['Option' + k + 'Image']);
    if (!t && !imgUrl) return;
    if (imgUrl && t.toUpperCase() === k) t = '';   // the badge already shows the letter
    var dId = driveImageId_(imgUrl);
    options.push({ key: k, text: t, image: dId ? '' : safeImageUrl_(imgUrl), driveImageId: dId });
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

/* ===================== Api.gs ===================== */
/**
 * Api.gs — the ONLY functions the web page can call (google.script.run).
 * Every one checks who is signed in before doing anything.
 */

function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('Math Check-In')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/** Used by Index.html to pull in the CSS/JS partials. */
function include_(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

/* =========================================================
 * Everyone
 * ========================================================= */

function getBootstrap() {
  var settings = getSettings_();
  var email = currentEmail_();
  var base = { school: settings.schoolName, window: settings.currentWindow, email: email };
  if (!email) return mergeObj_(base, { role: 'unknown' });

  var staff = staffRecord_(email);
  if (staff) return mergeObj_(base, { role: 'staff', name: staff.name, isAdmin: staff.isAdmin });

  var st = rosterRecord_(email);
  if (!st) return mergeObj_(base, { role: 'unlisted' });

  var status = 'ready';
  if (!settings.open) status = 'closed';
  else if (hasSubmitted_(email, settings.currentWindow) && !settings.allowRetakes) status = 'done';
  else if (getProgress_(email, settings.currentWindow)) status = 'inProgress';
  return mergeObj_(base, { role: 'student', name: firstName_(st.name), grade: st.grade, status: status });
}

/* =========================================================
 * Students
 * ========================================================= */

function startAssessment() {
  var st = requireStudent_();
  var settings = getSettings_();
  if (!settings.open) throw new Error('The check-in is closed right now.');
  if (!settings.allowRetakes && hasSubmitted_(st.email, settings.currentWindow)) {
    throw new Error('You have already finished this check-in. Great work!');
  }
  var questions = questionsForGrade_(st.grade);
  if (!questions.length) throw new Error('There are no questions for Grade ' + st.grade + ' yet. Please tell your teacher.');

  var prog = getProgress_(st.email, settings.currentWindow);
  if (!prog) {
    var ids = questions.map(function (q) { return norm_(q.QuestionID); });
    prog = {
      attemptId: uuid_(),
      window: settings.currentWindow,
      startedAt: new Date().toISOString(),
      order: settings.shuffle ? seededShuffle_(ids, st.email + settings.currentWindow) : ids,
      answers: {}
    };
    putProgress_(st.email, prog);
  }
  var byId = {};
  questions.forEach(function (q) { byId[norm_(q.QuestionID)] = q; });
  var list = prog.order.filter(function (id) { return byId[id]; }).map(function (id) { return publicQuestion_(byId[id]); });
  // Include any questions added after the student started.
  questions.forEach(function (q) {
    if (prog.order.indexOf(norm_(q.QuestionID)) < 0) list.push(publicQuestion_(q));
  });
  list.forEach(function (pq) {
    [pq].concat(pq.options).forEach(function (o) {
      if (o.driveImageId) o.image = driveImageData_(o.driveImageId);
      delete o.driveImageId;
    });
  });
  return { questions: list, answers: prog.answers, grade: st.grade };
}

/** Called after every answer so a student can close the tab and resume. */
function saveAnswer(questionId, choice) {
  var st = requireStudent_();
  var settings = getSettings_();
  var id = norm_(questionId);
  var ch = norm_(choice).toUpperCase();
  if (!/^[\w.\-]{1,40}$/.test(id) || CHOICES.indexOf(ch) < 0) throw new Error('Invalid answer.');
  var prog = getProgress_(st.email, settings.currentWindow);
  if (!prog) return { saved: false };
  prog.answers[id] = ch;
  putProgress_(st.email, prog);
  return { saved: true };
}

function submitAssessment(answers) {
  var st = requireStudent_();
  var settings = getSettings_();
  if (!settings.open) throw new Error('The check-in is closed right now. Your teacher can reopen it.');

  // Only accept answers to this student's own grade questions.
  var questions = questionsForGrade_(st.grade);
  var clean = {};
  var prog = getProgress_(st.email, settings.currentWindow) || {};
  var incoming = (answers && typeof answers === 'object') ? answers : {};
  var saved = prog.answers || {};
  questions.forEach(function (q) {
    var id = norm_(q.QuestionID);
    var a = norm_(incoming[id] || saved[id]).toUpperCase();
    if (CHOICES.indexOf(a) >= 0) clean[id] = a;
  });

  var result = scoreAnswers_(questions, clean);
  var attemptId = prog.attemptId || uuid_();
  var now = new Date();

  return withLock_(function () {
    if (!settings.allowRetakes && hasSubmitted_(st.email, settings.currentWindow)) {
      throw new Error('You have already finished this check-in.');
    }
    appendRows_(SHEET.ATTEMPTS, [{
      AttemptID: attemptId, Window: settings.currentWindow, StudentEmail: st.email, StudentName: st.name,
      Grade: st.grade, Class: st.className, StartedAt: prog.startedAt ? new Date(prog.startedAt) : now,
      SubmittedAt: now, Score: result.score, Total: result.total, Percent: result.percent
    }]);
    appendRows_(SHEET.RESPONSES, result.details.map(function (r) {
      return {
        AttemptID: attemptId, Window: settings.currentWindow, StudentEmail: st.email, Grade: st.grade,
        Class: st.className, QuestionID: r.QuestionID, Strand: r.Strand, Expectation: r.Expectation,
        Chosen: r.Chosen, IsCorrect: r.IsCorrect
      };
    }));
    clearProgress_(st.email);
    return settings.showScore ? { done: true, score: result.score, total: result.total } : { done: true };
  });
}

/* =========================================================
 * Staff — reports
 * ========================================================= */

function getReport(filters) {
  var staff = requireStaff_();
  var report = computeReport_(reportInput_(filters));
  report.me = { name: staff.name, isAdmin: staff.isAdmin };
  return report;
}

/** One question: every answer, how wrong it is, and which students picked it. */
function getQuestionDetail(filters, questionId) {
  requireStaff_();
  var detail = questionDetail_(reportInput_(filters), questionId);
  var q = readRows_(SHEET.QUESTIONS).filter(function (r) { return norm_(r.QuestionID) === detail.id; })[0];
  var driveId = q ? driveImageId_(q.ImageURL) : '';
  detail.image = driveId ? driveImageData_(driveId) : (q ? safeImageUrl_(q.ImageURL) : '');
  detail.options.forEach(function (o) {
    var url = q ? norm_(q['Option' + o.key + 'Image']) : '';
    var id = driveImageId_(url);
    o.image = id ? driveImageData_(id) : safeImageUrl_(url);
    if (o.image && o.text.toUpperCase() === o.key) o.text = '';
  });
  return detail;
}

/** Creates a formatted Google Sheet of the current report and shares it with the requester. */
function exportReport(filters) {
  var staff = requireStaff_();
  var settings = getSettings_();
  var r = computeReport_(reportInput_(filters));
  var scope = (r.filters.className !== 'all' ? r.filters.className
             : r.filters.grade !== 'all' ? 'Grade ' + r.filters.grade : 'Whole School');
  var title = settings.schoolName + ' Math Check-In — ' + scope + ' — ' + r.window + ' (' +
              Utilities.formatDate(new Date(), 'America/Toronto', 'yyyy-MM-dd') + ')';
  var url = buildExportSpreadsheet_(title, r, scope);
  audit_(staff.email, 'export', { scope: scope, window: r.window, url: url });
  return { url: url, title: title };
}

/* =========================================================
 * Staff — class rosters
 * ========================================================= */

function getRosters() {
  var staff = requireStaff_();
  var classes = {};
  readRows_(SHEET.ROSTER).forEach(function (r) {
    var owner = normEmail_(r.TeacherEmail);
    if (!staff.isAdmin && owner !== staff.email) return;
    var c = norm_(r.Class);
    classes[c] = classes[c] || { className: c, teacherEmail: owner, students: [] };
    classes[c].students.push({ email: normEmail_(r.StudentEmail), name: norm_(r.StudentName), grade: gradeKey_(r.Grade) });
  });
  return {
    classes: Object.keys(classes).sort().map(function (k) { return classes[k]; }),
    studentDomains: getSettings_().studentDomains,
    isAdmin: staff.isAdmin
  };
}

/**
 * Replaces one class list. payload = { className, defaultGrade, lines }
 * lines: text pasted by the teacher — one student per line: email, name[, grade]
 */
function saveRoster(payload) {
  var staff = requireStaff_();
  var settings = getSettings_();
  var className = norm_(payload && payload.className).slice(0, 60);
  if (!className) throw new Error('Please give the class a name, e.g. "Room 12 - Ms. Lee".');
  var defGrade = gradeKey_(payload.defaultGrade);

  var parsed = parseRosterLines_(String(payload.lines || ''), defGrade, settings.studentDomains);
  if (parsed.errors.length) return { saved: false, errors: parsed.errors };
  if (!parsed.students.length) return { saved: false, errors: ['No students found. Paste one student per line: email, name, grade'] };

  return withLock_(function () {
    var sh = sheet_(SHEET.ROSTER);
    var rows = readRows_(SHEET.ROSTER);
    var existingOwner = null;
    var taken = {};
    rows.forEach(function (r) {
      if (norm_(r.Class) === className) existingOwner = normEmail_(r.TeacherEmail);
      else taken[normEmail_(r.StudentEmail)] = norm_(r.Class);
    });
    if (existingOwner && existingOwner !== staff.email && !staff.isAdmin) {
      throw new Error('"' + className + '" belongs to another teacher. Pick a different class name.');
    }
    var dupes = parsed.students.filter(function (s) { return taken[s.email]; })
      .map(function (s) { return s.email + ' is already in ' + taken[s.email]; });
    if (dupes.length) return { saved: false, errors: dupes };

    // Delete old rows for this class (bottom-up so row numbers stay valid).
    rows.filter(function (r) { return norm_(r.Class) === className; })
      .map(function (r) { return r._row; }).sort(function (a, b) { return b - a; })
      .forEach(function (rowNum) { sh.deleteRow(rowNum); });

    var owner = existingOwner && staff.isAdmin ? existingOwner : staff.email;
    appendRows_(SHEET.ROSTER, parsed.students.map(function (s) {
      return { StudentEmail: s.email, StudentName: s.name, Grade: s.grade, Class: className, TeacherEmail: owner };
    }));
    audit_(staff.email, 'saveRoster', { className: className, count: parsed.students.length });
    return { saved: true, count: parsed.students.length };
  });
}

function deleteClass(className) {
  var staff = requireStaff_();
  var c = norm_(className);
  return withLock_(function () {
    var sh = sheet_(SHEET.ROSTER);
    var rows = readRows_(SHEET.ROSTER).filter(function (r) { return norm_(r.Class) === c; });
    if (!rows.length) return { deleted: 0 };
    if (!staff.isAdmin && rows.some(function (r) { return normEmail_(r.TeacherEmail) !== staff.email; })) {
      throw new Error('You can only delete your own classes.');
    }
    rows.map(function (r) { return r._row; }).sort(function (a, b) { return b - a; })
      .forEach(function (n) { sh.deleteRow(n); });
    audit_(staff.email, 'deleteClass', c);
    return { deleted: rows.length };
  });
}

/* =========================================================
 * Private helpers
 * ========================================================= */

function mergeObj_(a, b) {
  var o = {};
  Object.keys(a).forEach(function (k) { o[k] = a[k]; });
  Object.keys(b).forEach(function (k) { o[k] = b[k]; });
  return o;
}

function firstName_(name) {
  var n = norm_(name);
  if (n.indexOf(',') >= 0) return norm_(n.split(',')[1]).split(' ')[0] || n; // "Last, First"
  return n.split(' ')[0];
}

function questionsForGrade_(grade) {
  var g = gradeKey_(grade);
  return readRows_(SHEET.QUESTIONS).filter(function (q) {
    return gradeKey_(q.Grade) === g && validQuestion_(q);
  });
}

function hasSubmitted_(email, window) {
  return readRows_(SHEET.ATTEMPTS).some(function (a) {
    return normEmail_(a.StudentEmail) === email && norm_(a.Window) === window && norm_(a.SubmittedAt) !== '';
  });
}

/**
 * Reads a picture from the owner's Google Drive and returns it as a data: URL,
 * so images never need to be shared publicly or with students.
 */
function driveImageData_(fileId) {
  var cache = CacheService.getScriptCache();
  var key = 'img_' + fileId;
  var hit = cache.get(key);
  if (hit) return hit;
  try {
    var blob = DriveApp.getFileById(fileId).getBlob();
    var type = blob.getContentType();
    if (!/^image\/(png|jpe?g|gif|webp|svg\+xml)$/.test(type)) return '';
    var bytes = blob.getBytes();
    if (bytes.length > 3 * 1024 * 1024) return '';
    var url = 'data:' + type + ';base64,' + Utilities.base64Encode(bytes);
    if (url.length < 95000) cache.put(key, url, 21600);
    return url;
  } catch (e) {
    return '';
  }
}

function progressKey_(email) {
  return 'p_' + Utilities.base64EncodeWebSafe(email);
}

function getProgress_(email, window) {
  var raw = CacheService.getScriptCache().get(progressKey_(email));
  if (!raw) return null;
  var p = JSON.parse(raw);
  return p.window === window ? p : null;
}

function putProgress_(email, prog) {
  CacheService.getScriptCache().put(progressKey_(email), JSON.stringify(prog), 21600); // 6 hours (max)
}

function clearProgress_(email) {
  CacheService.getScriptCache().remove(progressKey_(email));
}

function reportInput_(filters) {
  return {
    attempts: readRows_(SHEET.ATTEMPTS),
    responses: readRows_(SHEET.RESPONSES),
    questions: readRows_(SHEET.QUESTIONS),
    roster: readRows_(SHEET.ROSTER),
    filters: filters || {},
    settings: getSettings_()
  };
}

function parseRosterLines_(text, defaultGrade, allowedDomains) {
  var students = [], errors = [], seen = {};
  text.split(/\r?\n/).forEach(function (line, i) {
    var raw = line.trim();
    if (!raw) return;
    if (/^(student\s*)?e-?mail/i.test(raw)) return; // header row
    var parts = raw.split(/\t|,|;/).map(function (p) { return p.replace(/^"|"$/g, '').trim(); });
    var email = '', rest = [];
    parts.forEach(function (p) {
      if (!email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p)) email = p.toLowerCase(); else if (p) rest.push(p);
    });
    if (!email) { errors.push('Line ' + (i + 1) + ': no email address found ("' + raw.slice(0, 40) + '")'); return; }
    if (allowedDomains.length && allowedDomains.indexOf(domainOf_(email)) < 0) {
      errors.push('Line ' + (i + 1) + ': ' + email + ' is not a student school account (' + allowedDomains.join(', ') + ')');
      return;
    }
    if (seen[email]) return;
    seen[email] = true;
    var grade = defaultGrade;
    var name = [];
    rest.forEach(function (p) {
      if (/^(K|JK|SK|[1-8])$/i.test(p)) grade = gradeKey_(p); else name.push(p);
    });
    if (!grade) { errors.push('Line ' + (i + 1) + ': no grade for ' + email + ' (add one, or set the class grade)'); return; }
    students.push({ email: email, name: name.join(' ') || email.split('@')[0], grade: grade });
  });
  return { students: students, errors: errors };
}

/* ===================== Setup.gs ===================== */
/**
 * Setup.gs — spreadsheet menu, one-click setup, question checks and data clean-up.
 * These run from the Sheet's "Math Assessment" menu (only people who can edit
 * the Sheet can see it). Menu handlers must be public, so each one starts with
 * menuGuard_(), which throws if called from the web page (no spreadsheet UI there).
 */

function menuGuard_() {
  return SpreadsheetApp.getUi(); // throws "Cannot call getUi() from this context" in the web app
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Math Assessment')
    .addItem('1. Set up / repair sheets', 'menuSetup')
    .addItem('2. Check questions for problems', 'menuValidateQuestions')
    .addItem('3. Add question pictures…', 'menuPictures')
    .addItem('4. Export questions for the web app', 'menuExportForApp')
    .addSeparator()
    .addItem('Delete all data for one assessment window…', 'menuDeleteWindow')
    .addToUi();
}

function menuSetup() {
  menuGuard_();
  var ss = ss_();
  Object.keys(HEADERS).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    var headers = HEADERS[name];
    var existing = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] : [];
    headers.forEach(function (h) {
      if (existing.indexOf(h) < 0) {
        sh.getRange(1, (sh.getLastColumn() || 0) + 1).setValue(h);
        existing.push(h);
      }
    });
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold').setBackground('#e8eef7');
  });

  // Default settings (only adds keys that are missing).
  var set = sheet_(SHEET.SETTINGS);
  var keys = readRows_(SHEET.SETTINGS).map(function (r) { return norm_(r.Key); });
  DEFAULT_SETTINGS.forEach(function (d) {
    if (keys.indexOf(d[0]) < 0) set.appendRow(d);
  });
  set.autoResizeColumns(1, 3);

  // Add the owner as the first admin.
  var owner = Session.getEffectiveUser().getEmail();
  var staff = readRows_(SHEET.STAFF).map(function (r) { return normEmail_(r.Email); });
  if (staff.indexOf(normEmail_(owner)) < 0) sheet_(SHEET.STAFF).appendRow([owner, 'Owner', 'admin']);

  // Dropdowns to keep data clean.
  var q = sheet_(SHEET.QUESTIONS);
  var col = function (sh, name) { return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].indexOf(name) + 1; };
  var rows = Math.max(q.getMaxRows() - 1, 1);
  q.getRange(2, col(q, 'Correct'), rows, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(CHOICES, true).setAllowInvalid(false).build());
  q.getRange(2, col(q, 'Strand'), rows, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(STRANDS, true).setAllowInvalid(true).build());
  q.getRange(2, col(q, 'Active'), rows, 1).insertCheckboxes();
  var st = sheet_(SHEET.STAFF);
  st.getRange(2, col(st, 'Role'), Math.max(st.getMaxRows() - 1, 1), 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['teacher', 'admin'], true).build());

  // Warn anyone who opens the data tabs.
  [SHEET.ATTEMPTS, SHEET.RESPONSES, SHEET.ROSTER].forEach(function (name) {
    var sh = sheet_(name);
    if (!sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).length) {
      sh.protect().setDescription('Student data — edit through the web app').setWarningOnly(true);
    }
  });

  CacheService.getScriptCache().remove('settings');
  SpreadsheetApp.getUi().alert('Setup complete.\n\nNext: add questions to the Questions tab, add staff to the Staff tab, then run "Check questions for problems".');
}

function menuValidateQuestions() {
  menuGuard_();
  var sh = sheet_(SHEET.QUESTIONS);
  var rows = readRows_(SHEET.QUESTIONS);
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var idCol = headers.indexOf('QuestionID') + 1;
  var problems = [], seen = {}, counters = {}, perGrade = {}, untagged = 0, inactive = 0;

  // Auto-number blank IDs like G3-001.
  rows.forEach(function (q) {
    var g = gradeKey_(q.Grade);
    var m = norm_(q.QuestionID).match(/^G\w+-(\d+)$/);
    if (m) counters[g] = Math.max(counters[g] || 0, Number(m[1]));
  });
  rows.forEach(function (q) {
    var g = gradeKey_(q.Grade);
    if (!norm_(q.QuestionID) && g) {
      counters[g] = (counters[g] || 0) + 1;
      q.QuestionID = 'G' + g + '-' + ('00' + counters[g]).slice(-3);
      sh.getRange(q._row, idCol).setValue(q.QuestionID);
    }
  });

  rows.forEach(function (q) {
    var where = 'Row ' + q._row + (norm_(q.QuestionID) ? ' (' + q.QuestionID + ')' : '');
    var id = norm_(q.QuestionID);
    if (id && seen[id]) problems.push(where + ': duplicate QuestionID');
    seen[id] = true;
    if (!gradeKey_(q.Grade)) problems.push(where + ': missing Grade');
    if (!norm_(q.Question) && !norm_(q.ImageURL)) problems.push(where + ': needs question text or an image');
    var rank = norm_(q.WrongRank).toUpperCase().split(/[^A-D]+/).filter(String);
    if (norm_(q.WrongRank) && (rank.indexOf(norm_(q.Correct).toUpperCase()) >= 0 || rank.length !== new Set(rank).size)) {
      problems.push(where + ': WrongRank should list only the wrong letters, closest first (e.g. C,A,D)');
    }
    var correct = norm_(q.Correct).toUpperCase();
    if (CHOICES.indexOf(correct) < 0) problems.push(where + ': Correct must be A, B, C or D');
    else if (!optionFilled_(q, correct)) problems.push(where + ': the correct option (' + correct + ') is blank');
    var filled = CHOICES.filter(function (k) { return optionFilled_(q, k); }).length;
    var missingOpt = missingOptionPictures_(q);
    if (missingOpt.length && isTrue_(q.Active)) problems.push(where + ': answer pictures still missing for ' + missingOpt.join(', '));
    if (filled < 2) problems.push(where + ': needs at least 2 answer options');
    if (!norm_(q.Strand)) untagged++;
    if (!validQuestion_(q) && isTrue_(q.Active) === false && norm_(q.Active) !== '') inactive++;
    if (validQuestion_(q)) perGrade[gradeKey_(q.Grade)] = (perGrade[gradeKey_(q.Grade)] || 0) + 1;
  });

  var summary = Object.keys(perGrade).sort().map(function (g) { return 'Grade ' + g + ': ' + perGrade[g] + ' ready'; }).join('\n');
  var msg = (summary || 'No usable questions yet.') +
    (inactive ? '\n\n' + inactive + ' question(s) are switched off (Active unticked) — check the Notes column.' : '') +
    (untagged ? '\n\n' + untagged + ' question(s) have no Strand — reports will group them as "Untagged".' : '') +
    (problems.length ? '\n\nProblems (' + problems.length + '):\n' + problems.slice(0, 40).join('\n') +
                       (problems.length > 40 ? '\n…and more' : '') : '\n\nNo problems found.');
  SpreadsheetApp.getUi().alert('Question check', msg, SpreadsheetApp.getUi().ButtonSet.OK);
}

/** Supports a retention schedule: remove a whole window once it is no longer needed. */
function menuDeleteWindow() {
  var ui = menuGuard_();
  var windows = {};
  readRows_(SHEET.ATTEMPTS).forEach(function (a) { windows[norm_(a.Window)] = true; });
  var list = Object.keys(windows);
  if (!list.length) { ui.alert('There is no student data to delete.'); return; }
  var res = ui.prompt('Delete assessment window',
    'Windows with data: ' + list.join(', ') + '\n\nType the exact window name to permanently delete its attempts and answers:',
    ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var w = norm_(res.getResponseText());
  if (!windows[w]) { ui.alert('No window named "' + w + '".'); return; }
  if (ui.alert('Permanently delete all data for "' + w + '"? This cannot be undone.', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  var removed = 0;
  withLock_(function () {
    [SHEET.ATTEMPTS, SHEET.RESPONSES].forEach(function (name) {
      var sh = sheet_(name);
      var keep = [sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]];
      var all = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues() : [];
      var wCol = keep[0].indexOf('Window');
      all.forEach(function (row) { if (norm_(row[wCol]) !== w) keep.push(row); else removed++; });
      sh.clearContents();
      sh.getRange(1, 1, keep.length, keep[0].length).setValues(keep);
    });
  });
  audit_(currentEmail_(), 'deleteWindow', w);
  ui.alert('Deleted ' + removed + ' rows for "' + w + '".');
}

/* ===================== Export.gs ===================== */
/**
 * Export.gs — writes a report into a new Google Sheet in the owner's Drive
 * and shares it (edit) with the staff member who asked for it.
 */

function buildExportSpreadsheet_(title, r, scope) {
  var staffEmail = currentEmail_();
  var out = SpreadsheetApp.create(title);
  var head = function (sh, rowNum, n) {
    sh.getRange(rowNum, 1, 1, n).setFontWeight('bold').setBackground('#e8eef7');
  };
  var write = function (sh, startRow, rows) {
    if (!rows.length) return startRow;
    var width = Math.max.apply(null, rows.map(function (x) { return x.length; }));
    rows = rows.map(function (x) { while (x.length < width) x.push(''); return x.map(sanitizeCell_); });
    sh.getRange(startRow, 1, rows.length, width).setValues(rows);
    return startRow + rows.length;
  };
  var pctText = function (p) { return p === null || p === undefined ? '' : p + '%'; };
  var flagText = function (f) { return f === 'strength' ? 'Strength' : f === 'gap' ? 'Gap' : f === 'developing' ? 'Developing' : ''; };

  // ---- Summary ----
  var sum = out.getSheets()[0].setName('Summary');
  var row = write(sum, 1, [
    [title], [''],
    ['Scope', scope], ['Window', r.window],
    ['Students completed', r.summary.completed + ' of ' + r.summary.rostered + ' on class lists'],
    ['Average score', pctText(r.summary.average)],
    ['Strength threshold', '≥ ' + r.thresholds.strength + '%'], ['Gap threshold', '< ' + r.thresholds.gap + '%'],
    ['Overall strengths', r.strengths.join(', ') || '—'], ['Overall gaps', r.gaps.join(', ') || '—'], ['']
  ]);
  sum.getRange(1, 1).setFontSize(14).setFontWeight('bold');
  head(sum, row, 3);
  row = write(sum, row, [['Strand', '% correct', 'Status']].concat(
    r.strands.map(function (s) { return [s.strand, pctText(s.percent), flagText(s.flag)]; })));
  row = write(sum, row + 1, [['Score band', 'Students']].concat(
    r.summary.bands.map(function (b) { return [b.label, b.count]; })));
  head(sum, row - r.summary.bands.length - 1, 2);
  sum.autoResizeColumns(1, 3);

  // ---- Breakdown by grade or class ----
  if (r.groups.length) {
    var gs = out.insertSheet(r.groupBy === 'grade' ? 'By Grade' : 'By Class');
    var strandNames = unionStrands_(r.groups.map(function (g) { return g.strands; }));
    write(gs, 1, [[r.groupBy === 'grade' ? 'Grade' : 'Class', 'Students', 'Average'].concat(strandNames)]
      .concat(r.groups.map(function (g) {
        return [g.name, g.students, pctText(g.average)].concat(strandNames.map(function (s) {
          var hit = g.strands.filter(function (x) { return x.strand === s; })[0];
          return hit ? pctText(hit.percent) : '';
        }));
      })));
    head(gs, 1, 3 + strandNames.length);
    gs.setFrozenRows(1);
    gs.autoResizeColumns(1, 3 + strandNames.length);
  }

  // ---- Item analysis ----
  var ia = out.insertSheet('Question Analysis');
  write(ia, 1, [['Question ID', 'Grade', 'Strand', 'Expectation', 'Question', '% correct', 'Status',
                 'Answer', 'A', 'B', 'C', 'D', 'Blank', 'Most common wrong answer',
                 'Correct (green)', 'Less correct (yellow)', 'Pretty wrong (orange)', 'Wrongest (red)']]
    .concat(r.items.map(function (it) {
      return [it.id, it.grade, it.strand, it.expectation, it.question, pctText(it.percent), flagText(it.flag),
              it.correct, it.choices.A, it.choices.B, it.choices.C, it.choices.D, it.choices.blank,
              it.commonWrong ? it.commonWrong.choice + ': ' + it.commonWrong.text + ' (' + it.commonWrong.count + ')' : '']
              .concat(it.levels.map(function (l) { return l.count; }));
    })));
  head(ia, 1, 18);
  ['#d9f2e0', '#fdf1c7', '#fde0c8', '#f9d3d0'].forEach(function (c, i) { ia.getRange(1, 15 + i).setBackground(c); });
  ia.setFrozenRows(1);
  ia.setColumnWidth(5, 380);
  ia.getRange('E:E').setWrap(true);

  // ---- Students ----
  var stSheet = out.insertSheet('Students');
  var sNames = unionStrands_(r.students.map(function (s) { return s.strands; }));
  write(stSheet, 1, [['Student', 'Grade', 'Class', 'Score', '%', 'Close calls', 'Far off'].concat(sNames).concat(['Strengths', 'Gaps'])]
    .concat(r.students.map(function (s) {
      return [s.name, s.grade, s.className, s.score + '/' + s.total, pctText(s.percent), s.close, s.farOff]
        .concat(sNames.map(function (n) {
          var hit = s.strands.filter(function (x) { return x.strand === n; })[0];
          return hit ? pctText(hit.percent) + ' (' + hit.correct + '/' + hit.total + ')' : '';
        }))
        .concat([s.strengths.join(', '), s.gaps.join(', ')]);
    })));
  head(stSheet, 1, 9 + sNames.length);
  stSheet.setFrozenRows(1);
  stSheet.autoResizeColumns(1, 9 + sNames.length);

  // ---- Trends ----
  if (r.trend.length) {
    var tr = out.insertSheet('Trends');
    var tNames = unionStrands_(r.trend.map(function (t) { return t.strands; }));
    write(tr, 1, [['Window', 'Students', 'Average'].concat(tNames)].concat(r.trend.map(function (t) {
      return [t.window, t.students, pctText(t.average)].concat(tNames.map(function (n) {
        var hit = t.strands.filter(function (x) { return x.strand === n; })[0];
        return hit ? pctText(hit.percent) : '';
      }));
    })));
    head(tr, 1, 3 + tNames.length);
  }

  // ---- Not completed ----
  var nc = out.insertSheet('Not Completed');
  write(nc, 1, [['Student', 'Grade', 'Class']].concat(r.notCompleted.map(function (s) {
    return [s.name, s.grade, s.className];
  })));
  head(nc, 1, 3);

  if (staffEmail && staffEmail !== normEmail_(Session.getEffectiveUser().getEmail())) {
    out.addEditor(staffEmail);
  }
  return out.getUrl();
}

function unionStrands_(lists) {
  var seen = {};
  lists.forEach(function (l) { l.forEach(function (s) { seen[s.strand] = true; }); });
  return STRANDS.filter(function (s) { return seen[s]; })
    .concat(Object.keys(seen).filter(function (s) { return STRANDS.indexOf(s) < 0; }));
}

/* ===================== Pictures.gs ===================== */
/**
 * Pictures.gs — adds question pictures from Google Forms.
 *
 * Two ways in, both from the Sheet menu "Add question pictures…":
 *  1. Import from a Form: reads the Form with Apps Script's built-in FormApp
 *     (no Cloud project needed), saves every picture block to a private Drive
 *     folder, fills in ImageURL, and compares the Form's answer key with ours.
 *  2. Paste: for pictures attached directly to a question (FormApp can't read
 *     those), copy the picture in the Form and paste it into the dialog.
 *
 * Only admins (the owner, or Staff rows with Role = admin) can call these.
 */

var PICTURE_FOLDER_NAME = 'Math Check-In Pictures';
var MAX_PICTURE_BYTES = 5 * 1024 * 1024;

function menuPictures() {
  var ui = menuGuard_();
  var html = HtmlService.createHtmlOutputFromFile('PicturesDialog').setWidth(900).setHeight(680);
  ui.showModalDialog(html, 'Add question pictures');
}

/* =========================================================
 * Called from PicturesDialog.html
 * ========================================================= */

/**
 * Every question, with what pictures it has. The dialog lists the ones that use
 * pictures and lets you add pictures to any other question.
 */
function getPictureStatus() {
  requireAdmin_();
  return readRows_(SHEET.QUESTIONS).filter(function (q) { return norm_(q.QuestionID); }).map(function (q) {
    var pictureAnswers = hasPictureAnswers_(q);
    return {
      id: norm_(q.QuestionID), grade: gradeKey_(q.Grade), text: norm_(q.Question).slice(0, 160),
      hasImage: !!norm_(q.ImageURL), needs: needsPictureNote_(q.Notes), active: isTrue_(q.Active),
      review: /REVIEW:/.test(norm_(q.Notes)),
      pictureAnswers: pictureAnswers,
      options: CHOICES.filter(function (k) { return optionFilled_(q, k); }).map(function (k) {
        return { key: k, text: norm_(q['Option' + k]), hasImage: !!norm_(q['Option' + k + 'Image']) };
      }),
      usesPictures: needsPictureNote_(q.Notes) || !!norm_(q.ImageURL) || pictureAnswers
    };
  }).sort(function (a, b) { return a.id.localeCompare(b.id, undefined, { numeric: true }); });
}

/** Import picture blocks and check answer keys from one Google Form. */
function importFromForm(formUrl) {
  var admin = requireAdmin_();
  var url = norm_(formUrl);
  var form;
  try {
    form = /^[\w-]{25,}$/.test(url) ? FormApp.openById(url) : FormApp.openByUrl(url.replace(/\/viewform.*$/, '/edit'));
  } catch (e) {
    throw new Error('Could not open that Form. Use the Form’s edit link (…/forms/d/…/edit) from an account that can edit it.');
  }

  var blobs = [];
  var items = form.getItems().map(function (it) {
    var type = it.getType();
    if (type === FormApp.ItemType.IMAGE) {
      blobs.push(it.asImageItem().getImage());
      return { kind: 'image', title: it.getTitle(), imageIndex: blobs.length - 1 };
    }
    var typed = type === FormApp.ItemType.MULTIPLE_CHOICE ? it.asMultipleChoiceItem()
              : type === FormApp.ItemType.LIST ? it.asListItem()
              : type === FormApp.ItemType.CHECKBOX ? it.asCheckboxItem() : null;
    if (!typed) return { kind: 'other', title: it.getTitle() };
    var choices = typed.getChoices().map(function (c) {
      var correct = false;
      try { correct = c.isCorrectAnswer(); } catch (e) { /* not a quiz */ }
      return { text: c.getValue(), correct: correct };
    });
    var points = 0;
    try { points = typed.getPoints(); } catch (e) { /* not a quiz */ }
    return { kind: 'question', title: it.getTitle(), choices: choices,
             graded: points > 0 || choices.some(function (c) { return c.correct; }) };
  });

  var plan = planFormImport_(items, readRows_(SHEET.QUESTIONS));
  if (plan.error) throw new Error(plan.error);

  var saved = [];
  plan.images.forEach(function (im) {
    saved.push(savePicture_(im.qid, blobs[im.imageIndex]));
  });
  audit_(admin.email, 'importFormPictures', { form: form.getTitle(), grade: plan.grade, pictures: saved.length });
  return {
    formTitle: form.getTitle(), grade: plan.grade, matched: plan.mapped.length, questionsInForm: plan.gradedCount,
    saved: saved, mismatches: plan.mismatches, unmatched: plan.unmatched,
    note: plan.images.length ? '' : 'This Form has no separate picture blocks, so its pictures must be attached to the questions themselves. Use the paste boxes below.'
  };
}

/**
 * Saves a picture pasted or chosen in the dialog. dataUrl = "data:image/png;base64,…"
 * slot = '' for the question picture, or 'A'–'D' for an answer picture.
 */
function savePastedPicture(questionId, dataUrl, slot) {
  requireAdmin_();
  var m = String(dataUrl || '').match(/^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+\/=]+)$/);
  if (!m) throw new Error('That doesn’t look like a picture. Copy the image itself, or choose a PNG/JPG file.');
  var bytes = Utilities.base64Decode(m[2]);
  if (bytes.length > MAX_PICTURE_BYTES) throw new Error('That picture is over 5 MB. Try a smaller one.');
  var ext = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp' }[m[1]];
  var s = norm_(slot).toUpperCase();
  if (s && CHOICES.indexOf(s) < 0) throw new Error('Unknown answer slot.');
  return savePicture_(norm_(questionId), Utilities.newBlob(bytes, m[1], norm_(questionId) + (s ? '-' + s : '') + ext), s);
}

/* =========================================================
 * Private helpers
 * ========================================================= */

function requireAdmin_() {
  var s = requireStaff_();
  if (!s.isAdmin) throw new Error('Only admins can change questions.');
  return s;
}

function picturesFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('pictureFolderId');
  if (id) {
    try { var f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) { /* recreate */ }
  }
  var folder = DriveApp.createFolder(PICTURE_FOLDER_NAME);
  props.setProperty('pictureFolderId', folder.getId());
  return folder;
}

/** Stores the picture in Drive and updates that question's row (slot '' = question, 'A'–'D' = answer). */
function savePicture_(qid, blob, slot) {
  slot = slot || '';
  var field = slot ? 'Option' + slot + 'Image' : 'ImageURL';
  return withLock_(function () {
    var sh = sheet_(SHEET.QUESTIONS);
    var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    var col = function (name) { return headers.indexOf(name) + 1; };
    var q = readRows_(SHEET.QUESTIONS).filter(function (r) { return norm_(r.QuestionID) === qid; })[0];
    if (!q) throw new Error('No question with ID ' + qid);

    var type = blob.getContentType() || 'image/png';
    var ext = type === 'image/jpeg' ? '.jpg' : type === 'image/gif' ? '.gif' : '.png';
    var file = picturesFolder_().createFile(blob.setName(qid + (slot ? '-' + slot : '') + ext));
    if (!col(field)) {
      sh.getRange(1, sh.getLastColumn() + 1).setValue(field).setFontWeight('bold').setBackground('#e8eef7');
      headers.push(field);
    }

    var oldId = driveImageId_(q[field]);
    if (oldId) {
      CacheService.getScriptCache().remove('img_' + oldId);
      try { DriveApp.getFileById(oldId).setTrashed(true); } catch (e) { /* not ours or already gone */ }
    }

    q[field] = 'https://drive.google.com/file/d/' + file.getId() + '/view';
    var notes = slot ? norm_(q.Notes) : removeNeedsPictureNote_(q.Notes);
    var missing = missingOptionPictures_(q);
    var activate = !/REVIEW:/.test(notes) && !needsPictureNote_(notes) && !missing.length &&
                   validQuestion_(mergeObj_(q, { Active: true }));
    sh.getRange(q._row, col(field)).setValue(q[field]);
    if (col('Notes')) sh.getRange(q._row, col('Notes')).setValue(notes);
    if (activate && col('Active')) sh.getRange(q._row, col('Active')).setValue(true);
    return { qid: qid, slot: slot, activated: activate, needsReview: /REVIEW:/.test(notes),
             stillNeeds: (needsPictureNote_(notes) ? ['question picture'] : []).concat(missing.map(function (k) { return 'answer ' + k; })),
             url: q[field] };
  });
}

/* ---------- Pure helpers (unit-tested) ---------- */

function needsPictureNote_(notes) {
  return /NEEDS IMAGE/i.test(norm_(notes));
}

function removeNeedsPictureNote_(notes) {
  return norm_(notes).replace(/NEEDS IMAGE[\s\S]*?tick Active\.\s*/i, '').trim();
}

/** Normalises a question title so Form titles and Sheet text can be compared. */
function normTitle_(t) {
  return norm_(t).toLowerCase()
    .replace(/^\s*[nadsf]\s*-\s*question\s*#\s*\d+/, '')
    .replace(/^\s*\d+\s*\.\s+/, '')
    .replace(/[^a-z0-9]+/g, '');
}

function titlesMatch_(a, b) {
  var x = normTitle_(a), y = normTitle_(b);
  if (!x || !y) return false;
  if (x === y) return true;
  var n = Math.min(x.length, y.length, 40);
  return n >= 15 && x.slice(0, n) === y.slice(0, n);
}

function normChoice_(t) {
  return norm_(t).toLowerCase().replace(/\s+/g, '');
}

/**
 * Matches Form items to Questions rows.
 * items: Form items in order — {kind:'question'|'image'|'other', title, choices:[{text,correct}], graded, imageIndex}
 * Returns which picture goes with which question, and any answer-key differences.
 */
function planFormImport_(items, questions) {
  var graded = items.filter(function (it) { return it.kind === 'question' && it.graded; });
  if (!graded.length) {
    graded = items.filter(function (it) { return it.kind === 'question' && it.choices && it.choices.length >= 2; });
  }
  if (!graded.length) return { error: 'No multiple-choice questions were found in that Form.' };

  // Which grade is this Form? The one whose questions match the most titles.
  var byGrade = {};
  questions.forEach(function (q) {
    var g = gradeKey_(q.Grade);
    if (g) (byGrade[g] = byGrade[g] || []).push(q);
  });
  var best = null, bestScore = 0;
  Object.keys(byGrade).forEach(function (g) {
    var score = graded.filter(function (it) {
      return byGrade[g].some(function (q) { return titlesMatch_(it.title, q.Question); });
    }).length;
    if (score > bestScore) { best = g; bestScore = score; }
  });
  if (!best) return { error: 'None of this Form’s questions match the Questions tab. Import the questions first.' };

  var qs = byGrade[best].slice().sort(function (a, b) {
    return norm_(a.QuestionID).localeCompare(norm_(b.QuestionID), undefined, { numeric: true });
  });
  var usePosition = graded.length === qs.length;
  var taken = {};
  var mapped = [], unmatched = [];

  graded.forEach(function (it, idx) {
    var hits = qs.filter(function (q) { return !taken[q.QuestionID] && titlesMatch_(it.title, q.Question); });
    var q = null, how = '';
    if (hits.length === 1) { q = hits[0]; how = 'title'; }
    else if (usePosition && !taken[qs[idx].QuestionID]) { q = qs[idx]; how = 'position'; }
    else {
      var set = (it.choices || []).map(function (c) { return normChoice_(c.text); }).sort().join('|');
      var byOpts = qs.filter(function (x) {
        return !taken[x.QuestionID] && CHOICES.map(function (k) { return normChoice_(x['Option' + k]); })
          .filter(String).sort().join('|') === set;
      });
      if (byOpts.length === 1) { q = byOpts[0]; how = 'answers'; }
    }
    if (!q) { unmatched.push(norm_(it.title).slice(0, 80) || '(untitled question ' + (idx + 1) + ')'); return; }
    taken[q.QuestionID] = true;
    it._qid = norm_(q.QuestionID);
    mapped.push({ qid: it._qid, title: norm_(it.title).slice(0, 80), how: how, item: it, question: q });
  });

  // A picture block belongs to the next question after it.
  var images = [];
  items.forEach(function (it, i) {
    if (it.kind !== 'image') return;
    for (var j = i + 1; j < items.length; j++) {
      if (items[j].kind === 'question') {
        if (items[j]._qid) images.push({ qid: items[j]._qid, imageIndex: it.imageIndex });
        return;
      }
    }
  });

  // Compare answer keys.
  var mismatches = [];
  mapped.forEach(function (m) {
    var formCorrect = (m.item.choices || []).filter(function (c) { return c.correct; }).map(function (c) { return c.text; });
    if (!formCorrect.length) return;
    var key = norm_(m.question.Correct).toUpperCase();
    var ours = norm_(m.question['Option' + key]);
    var same = formCorrect.some(function (t) { return normChoice_(t) === normChoice_(ours); });
    if (!same) mismatches.push({ qid: m.qid, formAnswer: formCorrect.join(' / '), appAnswer: key + ': ' + ours });
  });

  items.forEach(function (it) { delete it._qid; });
  return {
    grade: best, gradedCount: graded.length,
    mapped: mapped.map(function (m) { return { qid: m.qid, title: m.title, how: m.how }; }),
    images: images, mismatches: mismatches, unmatched: unmatched
  };
}

/* ===================== ExportForApp.gs ===================== */
/**
 * ExportForApp.gs — "Math Assessment → 4. Export questions for the web app".
 * Packs every question, its answer key, ranking and pictures into one .json
 * file in your Drive. Download it, then import it on the web app's Questions page.
 * The file contains the answer key: keep it private and out of GitHub.
 */
function menuExportForApp() {
  var ui = menuGuard_();
  var rows = readRows_(SHEET.QUESTIONS).filter(function (q) { return norm_(q.QuestionID); });
  if (!rows.length) { ui.alert('There are no questions to export.'); return; }

  var missing = [];
  var questions = rows.map(function (q, i) {
    var images = {};
    var add = function (slot, url) {
      var u = norm_(url);
      if (!u) return;
      var id = driveImageId_(u);
      var data = id ? driveImageData_(id) : '';
      if (data) images[slot] = data; else missing.push(norm_(q.QuestionID) + (slot === 'Q' ? '' : ' answer ' + slot));
    };
    add('Q', q.ImageURL);
    var options = {};
    CHOICES.forEach(function (k) {
      options[k] = { text: norm_(q['Option' + k]) };
      add(k, q['Option' + k + 'Image']);
    });
    return {
      id: norm_(q.QuestionID), grade: gradeKey_(q.Grade), strand: norm_(q.Strand), expectation: norm_(q.Expectation),
      text: norm_(q.Question), options: options, correct: norm_(q.Correct).toUpperCase(),
      wrongRank: norm_(q.WrongRank).toUpperCase().split(/[^A-D]+/).filter(String),
      active: validQuestion_(q) && missingOptionPictures_(q).length === 0 && !needsPictureNote_(q.Notes),
      notes: norm_(q.Notes), images: images, order: i
    };
  });

  var json = JSON.stringify({ format: 'forge-questions', version: 1, exportedAt: new Date().toISOString(),
    school: getSettings_().schoolName, questions: questions });
  var name = 'questions-export-' + Utilities.formatDate(new Date(), 'America/Toronto', 'yyyy-MM-dd-HHmm') + '.json';
  var file = picturesFolder_().createFile(Utilities.newBlob(json, 'application/json', name));
  audit_(currentEmail_(), 'exportForApp', { questions: questions.length, file: file.getId() });

  var url = 'https://drive.google.com/uc?export=download&id=' + file.getId();
  var html = HtmlService.createHtmlOutput(
    '<div style="font:14px/1.5 Arial,sans-serif">' +
    '<p><b>' + questions.length + ' questions</b> exported (' + Math.round(json.length / 1024) + ' KB).</p>' +
    (missing.length ? '<p style="color:#9a6200">Pictures that couldn’t be read: ' + missing.join(', ') + '</p>' : '') +
    '<p><a href="' + url + '" target="_blank" style="display:inline-block;background:#116588;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Download the file</a></p>' +
    '<p>Then, in the web app, go to <b>Questions → Import from the Sheet</b> and choose it.</p>' +
    '<p style="color:#666">It’s also saved in your Drive folder “' + PICTURE_FOLDER_NAME + '”. It contains the answer key, so don’t share it.</p></div>'
  ).setWidth(460).setHeight(300);
  ui.showModalDialog(html, 'Export questions for the web app');
}

