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
