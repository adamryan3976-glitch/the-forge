/*
 * The Forge · Math Check-In: Apps Script edition (server)
 * Copyright (c) 2026 Ryan Adams and Natasha Allen. All rights reserved.
 * Not to be copied, modified or distributed without the authors' written permission.
 *
 * This script is the whole back end when The Forge runs as a Google Apps Script
 * web app inside DDSB's Google Workspace:
 *   - It is deployed "Execute as: Me", so it reads and writes the data
 *     spreadsheet with the owner's permission. Students and teachers never get
 *     access to that spreadsheet.
 *   - Every request checks WHO is asking (their DDSB Google account) and applies
 *     the same rules as firestore.rules in the web version.
 *
 * SECURITY NOTE FOR ANYONE EDITING THIS FILE
 * The web page can call ANY top-level function whose name does not end in "_".
 * So: only doGet(), api(), setup() and refreshApp() are public, and the last
 * two check that the caller is the owner. Every other function ends in "_".
 */

/* ======================= Settings ======================= */

var FORGE_ = {
  STAFF_RE: /^[^@\s]+@ddsb\.ca$/i,
  STUDENT_RE: /^s(\d{9})@ddsbstudent\.ca$/i,
  // The app's screens, built by GitHub from this repo. The script downloads
  // this page and serves it itself, so students' browsers only ever talk to Google.
  APP_URL: 'https://wps-forge.winchesterps.ca/gas/forge-app.html',
  APP_MARKER: 'data-forge-app="1"',
  GRADES: ['K', '1', '2', '3', '4', '5', '6', '7', '8'],
  CHOICES: ['A', 'B', 'C', 'D'],
  DEFAULT_CONFIG: {
    schoolName: 'Winchester P.S.',
    currentWindow: 'Fall 2026',
    windowKey: 'fall-2026',
    assessmentOpen: false,
    allowRetakes: false,
    shuffleQuestions: true,
    strengthThreshold: 75,
    gapThreshold: 60,
    admins: [],
  },
  MAX_CELL: 49000,
};

/* ======================= Public entry points ======================= */

/** Opens the app. Works out who is signed in from their DDSB Google account. */
function doGet() {
  var me = me_();
  if (me.role === 'other') {
    return HtmlService.createHtmlOutput(messagePage_('Please use your school account',
      (me.email ? 'You are signed in as <b>' + esc_(me.email) + '</b>. ' : '') +
      'Students use their S-number school account, and staff use their @ddsb.ca account.'))
      .setTitle('The Forge · Math Check-In');
  }
  var html = appHtml_();
  if (!html) {
    return HtmlService.createHtmlOutput(messagePage_('The Forge is being set up',
      'The app files have not been downloaded yet. Please try again in a few minutes.'))
      .setTitle('The Forge · Math Check-In');
  }
  var boot = { email: me.email, displayName: me.name, role: me.role, studentNumber: me.sn || '' };
  if (me.role === 'staff') boot.ownerEmail = ownerEmail_();
  var script = '<script>window.__FORGE_BOOT__=' + JSON.stringify(boot).replace(/</g, '\\u003c') + ';</script>';
  // Insert right after the opening <head> (a function replacement, so "$" in data is never special).
  var page = html.replace('<head>', function () { return '<head>' + script; });
  return HtmlService.createHtmlOutput(page)
    .setTitle('The Forge · Math Check-In')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Every request from the app comes through here. */
function api(name, args) {
  var fn = Object.prototype.hasOwnProperty.call(API_, name) ? API_[name] : null;
  if (!fn) throw new Error('Unknown request.');
  var me = me_();
  if (me.role === 'other') deny_('Please use your school account.');
  return fn(me, args || {});
}

/**
 * Run once from the editor (Run ▸ setup). Creates the private data folder and
 * spreadsheet, downloads the app, and keeps it up to date every hour.
 * Safe to run again: it never replaces existing data.
 */
function setup() {
  requireOwner_();
  var props = PropertiesService.getScriptProperties();
  var folder = props.getProperty('FOLDER_ID') ? DriveApp.getFolderById(props.getProperty('FOLDER_ID')) : null;
  if (!folder) {
    folder = DriveApp.createFolder('The Forge – Data (private, do not share)');
    props.setProperty('FOLDER_ID', folder.getId());
  }
  if (!props.getProperty('DATA_ID')) {
    var ss = SpreadsheetApp.create('The Forge – Data (private, do not share)');
    DriveApp.getFileById(ss.getId()).moveTo(folder);
    props.setProperty('DATA_ID', ss.getId());
    ['config', 'classes', 'roster', 'enrolments', 'attempts', 'questions', 'answerKeys'].forEach(function (n) { sheet_(n); });
    var first = ss.getSheetByName('Sheet1');
    if (first) ss.deleteSheet(first);
  }
  var has = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'refreshApp'; });
  if (!has) ScriptApp.newTrigger('refreshApp').timeBased().everyHours(1).create();
  var ok = fetchApp_();
  Logger.log(ok ? 'Setup complete. Now deploy the web app.' : 'Setup done, but the app could not be downloaded from ' + FORGE_.APP_URL);
  return ok;
}

/** Downloads the latest app screens from GitHub. Runs every hour (trigger). */
function refreshApp() {
  var email = activeEmail_();
  // Allowed for the owner and for the hourly trigger (which has no active user).
  if (email && email !== ownerEmail_()) deny_('Only the owner can do this.');
  return fetchApp_();
}

/* ======================= The API ======================= */

var API_ = {
  /* ---- Settings ---- */
  getConfig: function (me) {
    requireSchool_(me);
    return config_();
  },
  saveConfig: function (me, a) {
    requireAdmin_(me);
    var c = a.cfg || {};
    var key = String(c.windowKey || '');
    if (!/^[a-z0-9-]{1,40}$/.test(key)) deny_('The check-in name must use letters, numbers and dashes.');
    var admins = (Array.isArray(c.admins) ? c.admins : []).map(lower_).filter(function (e) { return FORGE_.STAFF_RE.test(e); }).slice(0, 30);
    var out = {
      schoolName: str_(c.schoolName, 80) || FORGE_.DEFAULT_CONFIG.schoolName,
      currentWindow: str_(c.currentWindow, 40) || FORGE_.DEFAULT_CONFIG.currentWindow,
      windowKey: key,
      assessmentOpen: c.assessmentOpen === true,
      allowRetakes: c.allowRetakes === true,
      shuffleQuestions: c.shuffleQuestions !== false,
      strengthThreshold: num_(c.strengthThreshold, 0, 100, 75),
      gapThreshold: num_(c.gapThreshold, 0, 100, 60),
      admins: admins,
      updatedAt: Date.now(),
      updatedBy: me.email,
    };
    withLock_(function () { db_().put('config', 'app', out); });
    return true;
  },

  /* ---- Classes ---- */
  listClasses: function (me) {
    requireStaff_(me);
    return db_().all('classes').filter(function (c) { return canRead_(me, c); }).map(publicClass_);
  },
  createClass: function (me, a) {
    requireStaff_(me);
    var name = str_(a.name, 80);
    if (!name) deny_('A class needs a name.');
    var cls = {
      name: name, schoolYear: str_(a.schoolYear, 20), ownerEmail: me.email, ownerName: me.name,
      editors: [], viewers: [], archived: false, createdAt: Date.now(),
    };
    var id = newId_();
    withLock_(function () { db_().put('classes', id, cls); });
    cls.id = id;
    return cls;
  },
  updateClass: function (me, a) {
    requireStaff_(me);
    return withLock_(function () {
      var cls = db_().get('classes', a.id);
      if (!cls) deny_('That class no longer exists.');
      var admin = isAdmin_(me);
      if (!(admin || cls.ownerEmail === me.email)) deny_('Only the class owner can change this class.');
      var p = a.patch || {};
      if ('name' in p) { var n = str_(p.name, 80); if (!n) deny_('A class needs a name.'); cls.name = n; }
      if ('schoolYear' in p) cls.schoolYear = str_(p.schoolYear, 20);
      if ('archived' in p) cls.archived = p.archived === true;
      if ('editors' in p) cls.editors = emailList_(p.editors);
      if ('viewers' in p) cls.viewers = emailList_(p.viewers);
      if ('ownerEmail' in p && lower_(p.ownerEmail) !== cls.ownerEmail) {
        if (!admin) deny_('Only an admin can give a class to someone else.');
        var o = lower_(p.ownerEmail);
        if (!FORGE_.STAFF_RE.test(o)) deny_('The new owner must be a DDSB staff account.');
        cls.ownerEmail = o;
        cls.ownerName = str_(p.ownerName, 80) || o;
      }
      db_().put('classes', a.id, cls);
      return publicClass_(cls);
    });
  },

  /* ---- Roster & enrolments ---- */
  getRoster: function (me, a) {
    var cls = classOrDeny_(a.classId);
    if (!canRead_(me, cls)) deny_('You do not have access to this class.');
    var prefix = a.classId + '/';
    return db_().byPrefix('roster', prefix).map(function (r) {
      return { studentNumber: r.id.slice(prefix.length), name: r.name, grade: r.grade, addedAt: r.addedAt || null };
    }).sort(function (x, y) { return String(x.name).localeCompare(String(y.name)); });
  },

  /** Adds or updates one student. Returns { status: added|updated|moved|conflict, fromClass }. */
  upsertStudent: function (me, a) {
    requireStaff_(me);
    var st = a.student || {};
    var sn = String(st.studentNumber || '');
    if (!/^\d{9}$/.test(sn)) deny_('A student number must be 9 digits.');
    var grade = String(st.grade || '');
    if (FORGE_.GRADES.indexOf(grade) < 0) deny_('That grade is not valid.');
    var name = str_(st.name, 80);
    return withLock_(function () {
      var db = db_();
      var cls = db.get('classes', a.classId);
      if (!cls) deny_('That class no longer exists.');
      cls.id = a.classId;
      if (!canEdit_(me, cls)) deny_('You can’t add students to this class.');
      var existing = db.get('enrolments', sn);
      var status = existing ? 'updated' : 'added';
      var fromClass = existing ? existing.className : undefined;
      if (existing && existing.classId !== a.classId) {
        status = 'moved';
        var old = db.get('classes', existing.classId);
        if (old) old.id = existing.classId;
        var free = isAdmin_(me) || !old || old.archived === true || canEdit_(me, old);
        if (!free) return { status: 'conflict' };
        // Tidy the old class's list, unless it is archived (then it stays as history).
        if (old && old.archived !== true) db.del('roster', existing.classId + '/' + sn);
      }
      var now = Date.now();
      db.put('enrolments', sn, {
        classId: a.classId, className: cls.name, grade: grade, name: name,
        schoolYear: cls.schoolYear || '', updatedAt: now, updatedBy: me.email,
      });
      db.put('roster', a.classId + '/' + sn, { name: name, grade: grade, addedAt: now, addedBy: me.email });
      return { status: status, fromClass: fromClass };
    });
  },

  removeStudent: function (me, a) {
    requireStaff_(me);
    var sn = String(a.sn || '');
    return withLock_(function () {
      var db = db_();
      var cls = db.get('classes', a.classId);
      if (!cls) deny_('That class no longer exists.');
      cls.id = a.classId;
      if (!canEdit_(me, cls)) deny_('You can’t change this class.');
      var en = db.get('enrolments', sn);
      if (en && en.classId === a.classId) db.del('enrolments', sn);
      db.del('roster', a.classId + '/' + sn);
      return true;
    });
  },

  getEnrolment: function (me, a) {
    var sn = String(a.sn || '');
    if (me.role === 'student') {
      if (sn !== me.sn) deny_('You can only see your own information.');
      return db_().get('enrolments', sn);
    }
    requireStaff_(me);
    var en = db_().get('enrolments', sn);
    if (!en) return null;
    if (isAdmin_(me)) return en;
    var cls = db_().get('classes', en.classId);
    if (cls && canRead_(me, cls)) return en;
    deny_('That student is in another teacher’s class.');
  },

  /* ---- Attempts ---- */
  getAttempts: function (me, a) {
    var sn = String(a.sn || '');
    if (!canReadStudent_(me, sn)) deny_('You do not have access to this student.');
    return attemptsOf_(db_().byPrefix('attempts', sn + '/'), sn);
  },
  getAttemptsFor: function (me, a) {
    requireStaff_(me);
    var admin = isAdmin_(me);
    var enrol = {}, classes = {};
    db_().all('enrolments').forEach(function (e) { enrol[e.id] = e; });
    db_().all('classes').forEach(function (c) { classes[c.id] = c; });
    var all = db_().all('attempts');
    var out = {};
    (Array.isArray(a.numbers) ? a.numbers : []).slice(0, 2000).forEach(function (sn) {
      sn = String(sn);
      var en = enrol[sn];
      var ok = admin || (en && canRead_(me, classes[en.classId]));
      out[sn] = ok ? attemptsOf_(all, sn) : [];
    });
    return out;
  },

  startAttempt: function (me, a) {
    requireStudent_(me);
    var cfg = config_();
    if (cfg.assessmentOpen !== true) deny_('The check-in is closed.');
    var id = String(a.attemptId || '');
    var okId = id === cfg.windowKey + '__1' ||
      (cfg.allowRetakes === true && new RegExp('^' + cfg.windowKey + '__[0-9]{1,3}$').test(id));
    if (!okId) deny_('That check-in is not available.');
    var qids = Array.isArray(a.questionIds) ? a.questionIds.map(String) : [];
    if (!qids.length || qids.length > 120) deny_('That check-in has no questions.');
    return withLock_(function () {
      var db = db_();
      var en = db.get('enrolments', me.sn);
      if (!en) deny_('You are not on a class list yet.');
      var cls = db.get('classes', en.classId);
      if (!cls || cls.archived === true) deny_('Your class is closed.');
      var key = me.sn + '/' + id;
      if (db.get('attempts', key)) deny_('This check-in has already been started.');
      // Only real, active questions for the student's own grade.
      var qs = {};
      db.all('questions').forEach(function (q) { qs[q.id] = q; });
      qids.forEach(function (qid) {
        var q = qs[qid];
        if (!q || q.active !== true || q.grade !== en.grade) deny_('Those questions are not for your grade.');
      });
      var now = Date.now();
      var at = {
        studentNumber: me.sn, studentName: en.name, grade: en.grade, classId: en.classId,
        className: en.className || '', window: cfg.currentWindow, questionIds: qids,
        answers: {}, answeredCount: 0, status: 'in_progress', startedAt: now, updatedAt: now, submittedAt: null,
      };
      db.put('attempts', key, at);
      return true;
    });
  },

  /** Saves answers (merged with what is already saved). */
  saveAnswers: function (me, a) {
    return writeAnswers_(me, a, false);
  },
  submitAttempt: function (me, a) {
    return writeAnswers_(me, a, true);
  },

  resetAttempt: function (me, a) {
    requireStaff_(me);
    var sn = String(a.sn || '');
    return withLock_(function () {
      var db = db_();
      var en = db.get('enrolments', sn);
      var cls = en ? db.get('classes', en.classId) : null;
      if (cls) cls.id = en.classId;
      if (!(isAdmin_(me) || (cls && canEdit_(me, cls)))) deny_('You can’t reset this student’s check-in.');
      db.del('attempts', sn + '/' + String(a.attemptId || ''));
      return true;
    });
  },

  /* ---- Questions ---- */
  getQuestionsForGrade: function (me, a) {
    requireSchool_(me);
    return db_().all('questions').filter(function (q) { return q.grade === String(a.grade) && q.active === true; })
      .map(publicQuestion_).sort(byOrder_);
  },
  getQuestionsByIds: function (me, a) {
    requireSchool_(me);
    var want = {};
    (Array.isArray(a.ids) ? a.ids : []).forEach(function (id) { want[String(id)] = true; });
    return db_().all('questions').filter(function (q) { return want[q.id]; }).map(publicQuestion_);
  },
  getQuestionBank: function (me) {
    requireStaff_(me);
    var keys = {};
    db_().all('answerKeys').forEach(function (k) { keys[k.id] = k; });
    var bank = {};
    db_().all('questions').forEach(function (q) {
      var b = publicQuestion_(q);
      if (keys[q.id]) { b.correct = keys[q.id].correct; b.wrongRank = keys[q.id].wrongRank || []; }
      bank[q.id] = b;
    });
    return bank;
  },
  getAnswerKeys: function (me, a) {
    requireStaff_(me);
    var want = {};
    (Array.isArray(a.ids) ? a.ids : []).forEach(function (id) { want[String(id)] = true; });
    var out = {};
    db_().all('answerKeys').forEach(function (k) { if (want[k.id]) out[k.id] = { correct: k.correct, wrongRank: k.wrongRank || [] }; });
    return out;
  },
  getQuestionImages: function (me, a) {
    requireSchool_(me);
    var out = {};
    (Array.isArray(a.slots) ? a.slots : []).slice(0, 5).forEach(function (s) {
      if (['Q', 'A', 'B', 'C', 'D'].indexOf(s) < 0) return;
      var data = images_().read(String(a.id) + '__' + s);
      if (data) out[s] = data;
    });
    return out;
  },

  /** Admin: saves a batch of imported questions (without pictures). */
  importQuestions: function (me, a) {
    requireAdmin_(me);
    var items = Array.isArray(a.items) ? a.items.slice(0, 100) : [];
    var qDocs = [], kDocs = [];
    items.forEach(function (q) {
      var id = String(q.id || '');
      if (!/^[A-Za-z0-9_.-]{1,40}$/.test(id)) deny_('Question ID "' + id + '" is not valid.');
      if (FORGE_.GRADES.indexOf(String(q.grade)) < 0) deny_('Question ' + id + ' has no valid grade.');
      qDocs.push({ id: id, data: {
        grade: String(q.grade), strand: str_(q.strand, 60), expectation: str_(q.expectation, 400),
        text: str_(q.text, 4000), options: q.options || {}, hasImage: q.hasImage === true,
        imageSlots: Array.isArray(q.imageSlots) ? q.imageSlots.slice(0, 5) : [],
        active: q.active === true, order: Number(q.order) || 0, updatedAt: Date.now(),
      } });
      kDocs.push({ id: id, data: { correct: String(q.correct || ''), wrongRank: Array.isArray(q.wrongRank) ? q.wrongRank : [], notes: str_(q.notes, 2000) } });
    });
    withLock_(function () { db_().putMany('questions', qDocs); db_().putMany('answerKeys', kDocs); });
    return items.length;
  },
  /** Admin: saves one picture (a data: URL). */
  saveQuestionImage: function (me, a) {
    requireAdmin_(me);
    var name = String(a.id || '') + '__' + String(a.slot || '');
    if (!/^[A-Za-z0-9_.-]{1,40}__[QABCD]$/.test(name)) deny_('Picture name not valid.');
    var data = String(a.data || '');
    if (!/^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/.test(data)) deny_('That picture is not a supported image.');
    if (data.length > 8 * 1024 * 1024) deny_('That picture is too big.');
    images_().write(name, data);
    return true;
  },
  /** Admin: switches off questions that are no longer in the Sheet (keeps them for old results). */
  deactivateMissing: function (me, a) {
    requireAdmin_(me);
    var keep = {};
    (Array.isArray(a.ids) ? a.ids : []).forEach(function (id) { keep[String(id)] = true; });
    return withLock_(function () {
      var off = db_().all('questions').filter(function (q) { return q.active && !keep[q.id]; });
      db_().putMany('questions', off.map(function (q) { var d = stripId_(q); d.active = false; return { id: q.id, data: d }; }));
      return off.length;
    });
  },

  /** Admin: download the newest app screens from GitHub now. */
  refreshApp: function (me) {
    requireAdmin_(me);
    return fetchApp_();
  },
};

/* ======================= Rules ======================= */

function me_() {
  var email = activeEmail_();
  var m = FORGE_.STUDENT_RE.exec(email);
  if (m) return { email: email, role: 'student', sn: m[1], name: '' };
  if (FORGE_.STAFF_RE.test(email)) return { email: email, role: 'staff', name: nameFromEmail_(email) };
  return { email: email, role: 'other' };
}
function activeEmail_() {
  try { return lower_(Session.getActiveUser().getEmail()); } catch (e) { return ''; }
}
function ownerEmail_() {
  try { return lower_(Session.getEffectiveUser().getEmail()); } catch (e) { return ''; }
}
function requireOwner_() {
  var a = activeEmail_();
  if (!a || a !== ownerEmail_()) deny_('Only the owner can do this.');
}
function isAdmin_(me) {
  if (me.role !== 'staff') return false;
  if (me.email === ownerEmail_()) return true;
  return (config_().admins || []).map(lower_).indexOf(me.email) >= 0;
}
function requireSchool_(me) { if (me.role !== 'staff' && me.role !== 'student') deny_('Please use your school account.'); }
function requireStaff_(me) { if (me.role !== 'staff') deny_('Staff only.'); }
function requireStudent_(me) { if (me.role !== 'student') deny_('Students only.'); }
function requireAdmin_(me) { if (!isAdmin_(me)) deny_('Admins only.'); }

function canRead_(me, c) {
  if (me.role !== 'staff' || !c) return false;
  return c.ownerEmail === me.email || (c.editors || []).indexOf(me.email) >= 0 ||
    (c.viewers || []).indexOf(me.email) >= 0 || isAdmin_(me);
}
function canEdit_(me, c) {
  if (me.role !== 'staff' || !c || c.archived === true) return false;
  return c.ownerEmail === me.email || (c.editors || []).indexOf(me.email) >= 0 || isAdmin_(me);
}
/** The student themself, a teacher of their CURRENT class, or an admin. */
function canReadStudent_(me, sn) {
  if (me.role === 'student') return me.sn === sn;
  if (me.role !== 'staff') return false;
  if (isAdmin_(me)) return true;
  var en = db_().get('enrolments', sn);
  if (!en) return false;
  return canRead_(me, db_().get('classes', en.classId));
}
function classOrDeny_(id) {
  var c = db_().get('classes', String(id || ''));
  if (!c) deny_('That class no longer exists.');
  c.id = String(id);
  return c;
}

function writeAnswers_(me, a, submit) {
  requireStudent_(me);
  var cfg = config_();
  if (cfg.assessmentOpen !== true) deny_('The check-in is closed.');
  var key = me.sn + '/' + String(a.attemptId || '');
  return withLock_(function () {
    var db = db_();
    var at = db.get('attempts', key);
    if (!at) deny_('That check-in was not found.');
    if (at.status !== 'in_progress') deny_('This check-in has already been handed in.');
    var allowed = {};
    (at.questionIds || []).forEach(function (q) { allowed[q] = true; });
    var incoming = a.answers || {};
    Object.keys(incoming).forEach(function (qid) {
      var letter = String(incoming[qid]);
      if (allowed[qid] && FORGE_.CHOICES.indexOf(letter) >= 0) at.answers[qid] = letter;
    });
    var now = Date.now();
    at.answeredCount = Object.keys(at.answers).length;
    at.updatedAt = now;
    if (submit) { at.status = 'submitted'; at.submittedAt = now; }
    delete at.id;
    db.put('attempts', key, at);
    return { answeredCount: at.answeredCount, status: at.status };
  });
}

function deny_(msg) {
  throw new Error('permission-denied: ' + msg);
}

/* ======================= Helpers ======================= */

function config_() {
  var saved = db_().get('config', 'app');
  var out = {};
  Object.keys(FORGE_.DEFAULT_CONFIG).forEach(function (k) { out[k] = FORGE_.DEFAULT_CONFIG[k]; });
  if (saved) Object.keys(saved).forEach(function (k) { if (k !== 'id') out[k] = saved[k]; });
  out.exists = !!saved;
  return out;
}
function attemptsOf_(all, sn) {
  var prefix = sn + '/';
  return all.filter(function (r) { return r.id.indexOf(prefix) === 0; }).map(function (r) {
    var x = stripId_(r);
    x.id = r.id.slice(prefix.length);
    return x;
  });
}
function publicClass_(c) {
  return { id: c.id, name: c.name, schoolYear: c.schoolYear, ownerEmail: c.ownerEmail, ownerName: c.ownerName,
    editors: c.editors || [], viewers: c.viewers || [], archived: c.archived === true, createdAt: c.createdAt || null };
}
function publicQuestion_(q) {
  // Never includes the answer key (that lives in answerKeys).
  return { id: q.id, grade: q.grade, strand: q.strand, expectation: q.expectation, text: q.text,
    options: q.options || {}, hasImage: q.hasImage === true, imageSlots: q.imageSlots || [],
    active: q.active === true, order: q.order || 0 };
}
function byOrder_(a, b) {
  return (a.order || 0) - (b.order || 0) || String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
}
function stripId_(o) {
  var x = {};
  Object.keys(o).forEach(function (k) { if (k !== 'id') x[k] = o[k]; });
  return x;
}
function lower_(s) { return String(s || '').trim().toLowerCase(); }
function str_(s, max) { return String(s == null ? '' : s).trim().slice(0, max); }
function num_(v, lo, hi, d) { var n = Number(v); return isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d; }
function emailList_(list) {
  var seen = {};
  return (Array.isArray(list) ? list : []).map(lower_).filter(function (e) {
    if (!FORGE_.STAFF_RE.test(e) || seen[e]) return false;
    seen[e] = true;
    return true;
  }).slice(0, 20);
}
function nameFromEmail_(email) {
  var local = String(email).split('@')[0].replace(/[0-9]+$/, '');
  return local.split(/[._-]+/).filter(String).map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(' ') || email;
}
function newId_() {
  return Utilities.getUuid().replace(/-/g, '').slice(0, 20);
}
function esc_(s) {
  return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
}
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try { return fn(); } finally { lock.releaseLock(); }
}
function messagePage_(title, body) {
  return '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>' +
    'body{font-family:Arial,sans-serif;background:#1d2127;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center}' +
    '.c{background:#fff;border-radius:16px;padding:32px;max-width:460px;text-align:center;line-height:1.5}h1{margin:0 0 12px;color:#7c1d16}' +
    '</style></head><body><div class="c"><h1>' + esc_(title) + '</h1><p>' + body + '</p></div></body></html>';
}

/* ======================= Storage ======================= */
/*
 * Data lives in a private spreadsheet: one sheet per collection, one row per
 * record (id | data as JSON | last updated). Pictures live as small text files
 * in the private Drive folder.
 */

var DB_CACHE_ = null;

function db_() {
  if (typeof TEST_DB_ !== 'undefined' && TEST_DB_) return TEST_DB_;
  return SheetDb_;
}

function dataSpreadsheet_() {
  var id = PropertiesService.getScriptProperties().getProperty('DATA_ID');
  if (!id) throw new Error('The Forge has not been set up yet. The owner needs to run setup.');
  return SpreadsheetApp.openById(id);
}
function sheet_(name) {
  var ss = dataSpreadsheet_();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, 3).setValues([['id', 'data', 'updated']]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange('A:A').setNumberFormat('@');
  }
  return sh;
}

var SheetDb_ = {
  /** Whole collection, read once per request (used for small ones, and reports). */
  rows_: function (col) {
    DB_CACHE_ = DB_CACHE_ || {};
    if (!DB_CACHE_[col]) {
      var sh = sheet_(col);
      var n = sh.getLastRow() - 1;
      var vals = n > 0 ? sh.getRange(2, 1, n, 2).getValues() : [];
      var index = {};
      var docs = [];
      vals.forEach(function (r, i) {
        var id = String(r[0]);
        if (!id) return;
        var d = parse_(r[1]);
        if (!d) return;
        d.id = id;
        index[id] = { row: i + 2, doc: d };
        docs.push(d);
      });
      DB_CACHE_[col] = { index: index, docs: docs };
    }
    return DB_CACHE_[col];
  },
  /** Finds one record's row without reading the whole sheet. */
  findRow_: function (col, id) {
    var sh = sheet_(col);
    if (sh.getLastRow() < 2) return 0;
    var hit = sh.getRange(2, 1, sh.getLastRow() - 1, 1).createTextFinder(String(id))
      .matchEntireCell(true).matchCase(true).findNext();
    return hit ? hit.getRow() : 0;
  },
  get: function (col, id) {
    var cached = DB_CACHE_ && DB_CACHE_[col];
    if (cached) { var h = cached.index[String(id)]; return h ? JSON.parse(JSON.stringify(h.doc)) : null; }
    var row = this.findRow_(col, id);
    if (!row) return null;
    var d = parse_(sheet_(col).getRange(row, 2).getValue());
    if (d) d.id = String(id);
    return d;
  },
  all: function (col) {
    return JSON.parse(JSON.stringify(this.rows_(col).docs));
  },
  /** Records whose id starts with prefix (e.g. one student's attempts). */
  byPrefix: function (col, prefix) {
    var sh = sheet_(col);
    if (sh.getLastRow() < 2) return [];
    var pattern = '^' + String(prefix).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var hits = sh.getRange(2, 1, sh.getLastRow() - 1, 1).createTextFinder(pattern)
      .useRegularExpression(true).matchCase(true).findAll();
    var out = [];
    hits.forEach(function (cell) {
      var vals = sh.getRange(cell.getRow(), 1, 1, 2).getValues()[0];
      var d = parse_(vals[1]);
      if (d && String(vals[0]).indexOf(prefix) === 0) { d.id = String(vals[0]); out.push(d); }
    });
    return out;
  },
  put: function (col, id, data) {
    var json = toJson_(data);
    var sh = sheet_(col);
    var row = this.findRow_(col, id);
    if (row) sh.getRange(row, 2, 1, 2).setValues([[json, new Date()]]);
    else sh.appendRow([String(id), json, new Date()]);
    if (DB_CACHE_) DB_CACHE_[col] = null;
  },
  putMany: function (col, items) {
    if (!items.length) return;
    var sh = sheet_(col);
    var cache = this.rows_(col);
    var now = new Date();
    var appends = [];
    items.forEach(function (it) {
      var json = toJson_(it.data);
      var hit = cache.index[String(it.id)];
      if (hit) sh.getRange(hit.row, 2, 1, 2).setValues([[json, now]]);
      else appends.push([String(it.id), json, now]);
    });
    if (appends.length) sh.getRange(sh.getLastRow() + 1, 1, appends.length, 3).setValues(appends);
    DB_CACHE_[col] = null;
  },
  del: function (col, id) {
    var row = this.findRow_(col, id);
    if (row) sheet_(col).deleteRow(row);
    if (DB_CACHE_) DB_CACHE_[col] = null;
  },
};

function parse_(text) {
  try { return JSON.parse(text); } catch (e) { return null; }
}
function toJson_(data) {
  var json = JSON.stringify(stripId_(data));
  if (json.length > FORGE_.MAX_CELL) throw new Error('A record is too large to save.');
  return json;
}

function images_() {
  if (typeof TEST_IMAGES_ !== 'undefined' && TEST_IMAGES_) return TEST_IMAGES_;
  var folder = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('FOLDER_ID'));
  return {
    read: function (name) {
      var cache = CacheService.getScriptCache();
      var c = cache.get('img:' + name);
      if (c) return c;
      var it = folder.getFilesByName(name + '.txt');
      if (!it.hasNext()) return null;
      var data = it.next().getBlob().getDataAsString();
      if (data.length < 90000) cache.put('img:' + name, data, 21600);
      return data;
    },
    write: function (name, data) {
      var it = folder.getFilesByName(name + '.txt');
      if (it.hasNext()) it.next().setContent(data);
      else folder.createFile(name + '.txt', data, MimeType.PLAIN_TEXT);
      CacheService.getScriptCache().remove('img:' + name);
    },
  };
}

/* ======================= The app's screens ======================= */

function appHtml_() {
  var cache = CacheService.getScriptCache();
  var parts = Number(cache.get('app:parts') || 0);
  if (parts) {
    var keys = [];
    for (var i = 0; i < parts; i++) keys.push('app:' + i);
    var got = cache.getAll(keys);
    var html = keys.map(function (k) { return got[k] || ''; }).join('');
    if (got['app:' + (parts - 1)] && html.indexOf(FORGE_.APP_MARKER) >= 0) return html;
  }
  var file = appFile_();
  if (!file) return fetchApp_() ? appHtml_() : null;
  var text = file.getBlob().getDataAsString();
  cacheApp_(text);
  return text;
}
function appFile_() {
  var id = PropertiesService.getScriptProperties().getProperty('APP_FILE_ID');
  if (!id) return null;
  try { return DriveApp.getFileById(id); } catch (e) { return null; }
}
function cacheApp_(text) {
  var cache = CacheService.getScriptCache();
  var size = 90000, map = {}, n = Math.ceil(text.length / size);
  for (var i = 0; i < n; i++) map['app:' + i] = text.slice(i * size, (i + 1) * size);
  map['app:parts'] = String(n);
  try { cache.putAll(map, 21600); } catch (e) { /* the cache is only a speed-up */ }
}
/** Downloads the app page from GitHub and keeps a copy in the private folder. */
function fetchApp_() {
  var res;
  try {
    res = UrlFetchApp.fetch(FORGE_.APP_URL + '?t=' + Date.now(), { muteHttpExceptions: true, followRedirects: true });
  } catch (e) {
    return false;
  }
  if (res.getResponseCode() !== 200) return false;
  var text = res.getContentText('UTF-8');
  if (text.indexOf(FORGE_.APP_MARKER) < 0) return false;   // not our app: keep the old copy
  var props = PropertiesService.getScriptProperties();
  var file = appFile_();
  if (file) {
    if (file.getBlob().getDataAsString() !== text) file.setContent(text);
  } else {
    var folder = DriveApp.getFolderById(props.getProperty('FOLDER_ID'));
    file = folder.createFile('forge-app.html', text, MimeType.PLAIN_TEXT);
    props.setProperty('APP_FILE_ID', file.getId());
  }
  cacheApp_(text);
  return true;
}
