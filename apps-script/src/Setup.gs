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
  // Answer columns are plain text, so Sheets doesn't turn "1/2" into a date or "$3" into a number.
  // Cells Sheets already converted are rewritten as the text they show, then locked as text.
  ['Question', 'OptionA', 'OptionB', 'OptionC', 'OptionD', 'WrongRank', 'Expectation'].forEach(function (name) {
    var c = col(q, name);
    if (!c) return;
    var r = q.getRange(2, c, rows, 1);
    var shown = r.getDisplayValues();
    r.setNumberFormat('@');
    r.setValues(shown);
  });
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
