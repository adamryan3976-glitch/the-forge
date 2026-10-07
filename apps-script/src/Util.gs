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

/**
 * Like readRows_, but text columns hold exactly what the cell SHOWS. Sheets
 * turns typed answers such as "1/11" into dates and "$3" into numbers; the
 * displayed text is what the question author meant. Checkbox columns keep
 * their true/false value.
 */
function readDisplayRows_(name, keepRawColumns) {
  var sh = sheet_(name);
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];
  var range = sh.getRange(1, 1, lastRow, lastCol);
  var raw = range.getValues();
  var shown = range.getDisplayValues();
  var headers = raw[0].map(function (h) { return String(h).trim(); });
  var keep = keepRawColumns || [];
  var out = [];
  for (var r = 1; r < raw.length; r++) {
    var empty = true;
    var obj = {};
    for (var c = 0; c < headers.length; c++) {
      if (!headers[c]) continue;
      var v = keep.indexOf(headers[c]) >= 0 ? raw[r][c] : shown[r][c];
      obj[headers[c]] = v;
      if (raw[r][c] !== '' && raw[r][c] !== null && raw[r][c] !== false) empty = false;
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
