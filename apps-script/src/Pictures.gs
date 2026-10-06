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
