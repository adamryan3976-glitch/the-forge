// ---- Change these if another school or board sets up its own copy ----
// (Also change the matching values at the top of firestore.rules.)
export const STAFF_DOMAIN = 'ddsb.ca';
export const STUDENT_DOMAIN = 'ddsbstudent.ca';
export const STUDENT_EMAIL_RE = /^s(\d{9})@ddsbstudent\.ca$/i;
export const DEFAULT_SCHOOL_NAME = 'Winchester P.S.';
// -----------------------------------------------------------------------

export const GRADES = ['K', '1', '2', '3', '4', '5', '6', '7', '8'];
export const CHOICES = ['A', 'B', 'C', 'D'];

/** Ontario Mathematics (2020) strands. */
export const STRANDS = ['Number', 'Algebra', 'Data', 'Spatial Sense', 'Financial Literacy'];

/** How wrong an answer is — the Forge colour coding. */
export const LEVELS = [
  { key: 'correct', label: 'Correct', colour: 'green', cls: 'bg-lvl-0' },
  { key: 'close', label: 'Less correct', colour: 'yellow', cls: 'bg-lvl-1' },
  { key: 'wrong', label: 'Pretty wrong', colour: 'orange', cls: 'bg-lvl-2' },
  { key: 'wrongest', label: 'Wrongest', colour: 'red', cls: 'bg-lvl-3' },
];

export const DEFAULT_CONFIG = {
  schoolName: DEFAULT_SCHOOL_NAME,
  currentWindow: 'Fall 2026',
  windowKey: 'fall-2026',
  assessmentOpen: false,
  allowRetakes: false,
  shuffleQuestions: true,
  strengthThreshold: 75,
  gapThreshold: 60,
  admins: [],
};

/** School year label for "now", e.g. "2026-2027" (a new year starts in August). */
export function currentSchoolYear(d = new Date()) {
  const y = d.getFullYear();
  return d.getMonth() >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

export function gradeLabel(g) {
  return g === 'K' ? 'Kindergarten' : `Grade ${g}`;
}
