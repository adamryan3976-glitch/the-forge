import { useEffect, useState } from 'react';
import { Modal, Spinner, Pill, fmtPct, ErrorBox } from '../ui.jsx';
import { getQuestionBank } from '../../lib/data.js';
import { studentHistory } from '../../lib/report.js';
import { gradeLabel } from '../../constants.js';

let bankCache = null;
export async function loadBank(force = false) {
  if (!bankCache || force) bankCache = await getQuestionBank();
  return bankCache;
}

/** Every check-in a student has done, across classes and school years. */
export default function StudentHistory({ student, attempts, cfg, bank: bankProp, onClose }) {
  const [bank, setBank] = useState(bankProp || null);
  const [error, setError] = useState('');
  useEffect(() => { if (!bank) loadBank().then(setBank).catch((e) => setError(e.message || String(e))); }, [bank]);

  const settings = { strength: cfg.strengthThreshold, gap: cfg.gapThreshold };
  const rows = bank ? studentHistory(student, attempts, bank, settings) : [];
  const inProgress = attempts.filter((a) => a.status === 'in_progress');

  return (
    <Modal title={`${student.name} · #${student.studentNumber}`} onClose={onClose} wide>
      <p className="text-sm text-stone-500 mb-3">Now in {student.className} ({gradeLabel(student.grade)}). Results follow the student number from year to year.</p>
      <ErrorBox>{error}</ErrorBox>
      {!bank ? <Spinner /> : rows.length === 0 ? (
        <p className="text-sm text-stone-500">No finished check-ins yet.{inProgress.length ? ` One is in progress (${inProgress[0].answeredCount || 0} answered).` : ''}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-stone-600"><tr><th className="px-3 py-2">Check-in</th><th className="px-3 py-2">Grade · Class</th><th className="px-3 py-2 text-right">Score</th><th className="px-3 py-2">Strands</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.window + r.submittedAt} className="border-t border-stone-100 align-top">
                  <td className="px-3 py-2 font-medium">{r.window}<div className="text-xs text-stone-400">{r.submittedAt ? new Date(r.submittedAt).toLocaleDateString('en-CA') : ''}</div></td>
                  <td className="px-3 py-2">{gradeLabel(r.grade)}<div className="text-xs text-stone-500">{r.className}</div></td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{r.score}/{r.total} · {fmtPct(r.percent)}</td>
                  <td className="px-3 py-2"><div className="flex flex-wrap gap-1">{r.strands.map((s) => <Pill key={s.strand} kind={s.flag}>{s.strand} {fmtPct(s.percent)}</Pill>)}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
