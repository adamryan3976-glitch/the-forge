// A small copy of the student's own answers on this device, in case the page is
// closed while offline. It holds only letters (e.g. {"G3-001":"B"}), and is
// cleared once the attempt is submitted.
const key = (sn, attemptId) => `forge-answers:${sn}:${attemptId}`;

export function readBackup(sn, attemptId) {
  try { return JSON.parse(localStorage.getItem(key(sn, attemptId)) || '{}') || {}; } catch { return {}; }
}
export function writeBackup(sn, attemptId, answers) {
  try { localStorage.setItem(key(sn, attemptId), JSON.stringify(answers)); } catch { /* storage full or blocked */ }
}
export function clearBackup(sn, attemptId) {
  try { localStorage.removeItem(key(sn, attemptId)); } catch { /* ignore */ }
}
