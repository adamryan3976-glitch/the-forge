import { CHOICES, STRANDS } from '../constants.js';
import { parseDelimited, normGrade } from './csv.js';

const norm = (s) => String(s ?? '').trim();
const truthy = (v) => v === true || /^(true|yes|y|1)$/i.test(norm(v));

/**
 * Reads the file exported from the Google Sheet ("Math Assessment → Export
 * questions for the web app", a .json with pictures) or the Questions tab saved
 * as .csv (no pictures). Returns { questions, problems }.
 */
export function parseQuestionFile(text, filename = '') {
  const trimmed = String(text || '').trim();
  if (/\.json$/i.test(filename) || trimmed.startsWith('{')) {
    let data;
    try { data = JSON.parse(trimmed); } catch { return { questions: [], problems: ['That file isn’t valid JSON.'] }; }
    if (data.format !== 'forge-questions') return { questions: [], problems: ['That JSON file wasn’t made by the Sheet’s export.'] };
    return checkQuestions(data.questions.map((q, i) => ({ ...q, order: i })));
  }
  const rows = parseDelimited(trimmed);
  if (!rows.length) return { questions: [], problems: ['The file is empty.'] };
  const h = rows[0].map(norm);
  const col = (name) => h.indexOf(name);
  if (col('QuestionID') < 0 || col('Correct') < 0) return { questions: [], problems: ['That CSV doesn’t have the Questions tab columns (QuestionID, Grade, … Correct).'] };
  const questions = rows.slice(1).map((r, i) => {
    const g = (name) => norm(r[col(name)]);
    const options = {};
    CHOICES.forEach((k) => { options[k] = { text: g('Option' + k) }; });
    return {
      id: g('QuestionID'), grade: g('Grade'), strand: g('Strand'), expectation: g('Expectation'), text: g('Question'),
      options, correct: g('Correct'), wrongRank: g('WrongRank').toUpperCase().split(/[^A-D]+/).filter(Boolean),
      active: col('Active') < 0 ? true : truthy(r[col('Active')]), notes: g('Notes'), images: {}, order: i,
    };
  }).filter((q) => q.id);
  const res = checkQuestions(questions);
  if (questions.some((q) => /NEEDS IMAGE/i.test(q.notes))) res.problems.unshift('A CSV has no pictures. Use the Sheet’s “Export questions for the web app” to bring pictures across.');
  return res;
}

export function checkQuestions(list) {
  const problems = [], seen = new Set();
  const questions = list.map((q) => {
    const grade = normGrade(q.grade);
    const correct = norm(q.correct).toUpperCase();
    const images = q.images || {};
    const filled = CHOICES.filter((k) => norm(q.options?.[k]?.text) || images[k]);
    const where = q.id || '(no id)';
    let ok = true;
    if (!q.id) { problems.push('A question has no QuestionID'); ok = false; }
    if (seen.has(q.id)) { problems.push(`${where}: duplicate QuestionID`); ok = false; }
    seen.add(q.id);
    if (!grade) { problems.push(`${where}: missing grade`); ok = false; }
    if (!CHOICES.includes(correct)) { problems.push(`${where}: Correct must be A, B, C or D`); ok = false; }
    else if (!filled.includes(correct)) { problems.push(`${where}: the correct answer (${correct}) is blank`); ok = false; }
    if (filled.length < 2) { problems.push(`${where}: needs at least 2 answers`); ok = false; }
    if (!norm(q.text) && !images.Q) { problems.push(`${where}: needs question text or a picture`); ok = false; }
    if (q.strand && !STRANDS.includes(q.strand)) problems.push(`${where}: strand "${q.strand}" isn’t an Ontario strand (kept anyway)`);
    return { ...q, id: norm(q.id), grade, correct, active: !!q.active && ok, images };
  }).filter((q) => q.id);
  return { questions, problems };
}

/** Keeps each picture under ~700 KB so it fits in one Firestore document. */
export async function shrinkDataUrl(dataUrl, maxChars = 700000, maxWidth = 1000) {
  if (!dataUrl || dataUrl.length <= maxChars) return dataUrl;
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('Could not read a picture'));
    i.src = dataUrl;
  });
  let width = Math.min(maxWidth, img.naturalWidth);
  for (let attempt = 0; attempt < 6; attempt++) {
    const scale = width / img.naturalWidth;
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const out = c.toDataURL('image/jpeg', 0.85);
    if (out.length <= maxChars) return out;
    width = Math.round(width * 0.75);
  }
  throw new Error('A picture is too large even after shrinking.');
}
