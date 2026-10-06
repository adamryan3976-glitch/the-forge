import { GRADES } from '../constants.js';
import { toStudentNumber } from './identity.js';

/** RFC-4180-ish CSV/TSV parser (handles quotes, commas in quotes, tabs). */
export function parseDelimited(text) {
  const t = String(text || '').replace(/\r\n?/g, '\n');
  const delim = t.split('\n', 1)[0].includes('\t') ? '\t' : ',';
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inQ) {
      if (c === '"' && t[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((x) => String(x).trim() !== ''));
}

export function normGrade(g) {
  const s = String(g ?? '').trim().toUpperCase().replace(/^GRADE\s*/, '').replace(/^GR\.?\s*/, '');
  if (['K', 'JK', 'SK', 'KINDERGARTEN', 'FDK'].includes(s)) return 'K';
  const n = parseInt(s, 10);
  return GRADES.includes(String(n)) ? String(n) : '';
}

/**
 * Turns a pasted list or CSV file into students. Columns can be in any order;
 * a header row is optional. Each row needs a student number (or S-number email)
 * and a name; grade is optional when a default grade is given.
 */
export function parseStudentList(text, defaultGrade = '') {
  const rows = parseDelimited(text);
  const students = [], errors = [], seen = new Set();
  if (!rows.length) return { students, errors: ['Nothing to import.'] };

  // Detect a header row and column positions.
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const hasHeader = header.some((h) => /number|email|name|grade|student/.test(h)) && !header.some((h) => toStudentNumber(h));
  let numCol = -1, nameCol = -1, firstCol = -1, lastCol = -1, gradeCol = -1;
  if (hasHeader) {
    header.forEach((h, i) => {
      if (numCol < 0 && /(number|email|oen|id)/.test(h)) numCol = i;
      else if (gradeCol < 0 && /grade|gr\b/.test(h)) gradeCol = i;
      else if (firstCol < 0 && /first/.test(h)) firstCol = i;
      else if (lastCol < 0 && /last|surname/.test(h)) lastCol = i;
      else if (nameCol < 0 && /name/.test(h)) nameCol = i;
    });
  }
  const body = hasHeader ? rows.slice(1) : rows;
  body.forEach((r, idx) => {
    const line = idx + 1 + (hasHeader ? 1 : 0);
    const cells = r.map((c) => String(c).trim());
    let sn = numCol >= 0 ? toStudentNumber(cells[numCol]) : '';
    if (!sn) { const i = cells.findIndex((c) => toStudentNumber(c)); if (i >= 0) { sn = toStudentNumber(cells[i]); if (numCol < 0) numCol = -2; } }
    if (!sn) { errors.push(`Line ${line}: no 9-digit student number found ("${cells.join(', ').slice(0, 50)}")`); return; }
    if (seen.has(sn)) return;
    seen.add(sn);

    let grade = gradeCol >= 0 ? normGrade(cells[gradeCol]) : '';
    let name = '';
    if (firstCol >= 0 || lastCol >= 0) name = [cells[firstCol] || '', cells[lastCol] || ''].join(' ').trim();
    else if (nameCol >= 0) name = cells[nameCol];
    if (!name || (!grade && gradeCol < 0)) {
      // No header: anything that isn't the number is either the grade or part of the name.
      const rest = cells.filter((c) => c && !toStudentNumber(c));
      const parts = [];
      rest.forEach((c) => { if (!grade && normGrade(c) && c.length <= 8) grade = normGrade(c); else parts.push(c); });
      if (!name) name = parts.join(' ');
    }
    if (/,/.test(name) && !/\s/.test(name.split(',')[1]?.trim() || ' x')) name = name.split(',').map((x) => x.trim()).reverse().join(' ');
    grade = grade || normGrade(defaultGrade);
    if (!grade) { errors.push(`Line ${line}: no grade for ${sn} (add a grade column or choose a grade above)`); return; }
    if (!name) { errors.push(`Line ${line}: no name for ${sn}`); return; }
    students.push({ studentNumber: sn, name: name.slice(0, 80), grade });
  });
  return { students, errors };
}

function cell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  // Stop spreadsheet formula injection when the CSV is opened.
  const safe = /^[=+\-@]/.test(s) ? "'" + s : s;
  return /[",\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
}

export function toCsv(rows) {
  return rows.map((r) => r.map(cell).join(',')).join('\r\n');
}

export function downloadCsv(filename, rows) {
  const blob = new Blob(['﻿' + toCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
