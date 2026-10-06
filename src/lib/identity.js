import { STAFF_DOMAIN, STUDENT_EMAIL_RE } from '../constants.js';

/**
 * Works out who signed in from their Google account email.
 * Students: S#########@ddsbstudent.ca → { role: 'student', studentNumber: '#########' }
 * Staff:    anything @ddsb.ca          → { role: 'staff' }
 */
export function classify(email) {
  const e = String(email || '').trim().toLowerCase();
  const m = e.match(STUDENT_EMAIL_RE);
  if (m) return { role: 'student', email: e, studentNumber: m[1] };
  if (e.endsWith('@' + STAFF_DOMAIN)) return { role: 'staff', email: e };
  return { role: 'other', email: e };
}

/** Accepts "123456789", "S123456789" or the full email; returns the 9 digits or ''. */
export function toStudentNumber(input) {
  const s = String(input || '').trim().toLowerCase();
  const m = s.match(/^s?(\d{9})(@.*)?$/);
  return m ? m[1] : '';
}

export function isAdminEmail(email, config, ownerEmails = OWNER_EMAILS) {
  const e = String(email || '').toLowerCase();
  return ownerEmails.includes(e) || (config?.admins || []).map((a) => a.toLowerCase()).includes(e);
}

// Must match ownerEmails() in firestore.rules.
export const OWNER_EMAILS = ['adamryan3976@ddsb.ca'];
