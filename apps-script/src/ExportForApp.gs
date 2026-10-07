/**
 * ExportForApp.gs — "Math Assessment → 4. Export questions for the web app".
 * Packs every question, its answer key, ranking and pictures into one .json
 * file in your Drive. Download it, then import it on the web app's Questions page.
 * The file contains the answer key: keep it private and out of GitHub.
 */
function menuExportForApp() {
  var ui = menuGuard_();
  var rows = readDisplayRows_(SHEET.QUESTIONS, ['Active']).filter(function (q) { return norm_(q.QuestionID); });
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
