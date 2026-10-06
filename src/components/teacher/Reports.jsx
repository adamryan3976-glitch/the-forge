import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Download, Printer } from 'lucide-react';
import { Card, Button, Field, inputCls, Spinner, ErrorBox, Pill, Modal, fmtPct, flagLabel } from '../ui.jsx';
import { getRoster, getAttemptsFor, getQuestionImages } from '../../lib/data.js';
import { buildReport, questionDetail } from '../../lib/report.js';
import { downloadCsv } from '../../lib/csv.js';
import { GRADES, gradeLabel, LEVELS } from '../../constants.js';
import StudentHistory, { loadBank } from './StudentHistory.jsx';

const LEVEL_BG = ['bg-lvl-0', 'bg-lvl-1', 'bg-lvl-2', 'bg-lvl-3'];
const FLAG_BAR = { strength: 'bg-emerald-600', developing: 'bg-amber-500', gap: 'bg-rose-600' };

export default function Reports({ classes, cfg, me, initialClassId }) {
  const [data, setData] = useState(null);      // { students, attemptsBySn, bank }
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ window: cfg.currentWindow, grade: 'all', classId: initialClassId || 'all', archived: false });
  const [modal, setModal] = useState(null);

  const load = async () => {
    setError(''); setData(null);
    try {
      setProgress('Loading class lists…');
      const rosters = await Promise.all(classes.map((c) => getRoster(c.id).then((r) => r.map((s) => ({ ...s, classId: c.id, className: c.name, archived: c.archived, schoolYear: c.schoolYear }))).catch(() => [])));
      // A student can appear in an archived class and their current class; keep the current one.
      const bySn = {};
      rosters.flat().forEach((s) => {
        const prev = bySn[s.studentNumber];
        if (!prev || (prev.archived && !s.archived) || (prev.archived === s.archived && s.schoolYear > prev.schoolYear)) bySn[s.studentNumber] = s;
      });
      const students = Object.values(bySn);
      setProgress(`Loading results for ${students.length} students…`);
      const [attemptsBySn, bank] = await Promise.all([
        getAttemptsFor(students.map((s) => s.studentNumber), (d, n) => setProgress(`Loading results… ${d}/${n}`)),
        loadBank(true),
      ]);
      setData({ students, attemptsBySn, bank });
    } catch (e) { setError('Could not load reports: ' + (e.message || e)); }
    setProgress('');
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [classes]);

  const settings = { strength: cfg.strengthThreshold, gap: cfg.gapThreshold, currentWindow: cfg.currentWindow };
  const scopeStudents = useMemo(() => (data ? data.students.filter((s) => filters.archived || !s.archived || s.classId === filters.classId) : []), [data, filters.archived, filters.classId]);
  const report = useMemo(() => (data ? buildReport({ students: scopeStudents, attemptsBySn: data.attemptsBySn, questions: data.bank, filters, settings }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, scopeStudents, filters]);

  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!report) return <Spinner label={progress || 'Loading…'} />;

  const set = (k, v) => setFilters((f) => ({ ...f, [k]: v, ...(k === 'grade' ? { classId: 'all' } : {}) }));
  const classOptions = classes.filter((c) => filters.archived || !c.archived || c.id === filters.classId);
  const scopeName = filters.classId !== 'all' ? (classes.find((c) => c.id === filters.classId)?.name || 'Class')
    : filters.grade !== 'all' ? gradeLabel(filters.grade) : me.isAdmin ? 'Whole school' : 'All my classes';
  const s = report.summary;

  const exportStudents = () => downloadCsv(`${scopeName} – ${report.window} – students.csv`, [
    ['Student', 'Student #', 'Grade', 'Class', 'Score', 'Total', '%', 'Close calls', 'Far off', ...report.strands.map((x) => x.strand), 'Strengths', 'Gaps'],
    ...report.students.map((r) => [r.name, r.studentNumber, r.grade, r.className, r.score, r.total, r.percent, r.close, r.farOff,
      ...report.strands.map((x) => { const h = r.strands.find((y) => y.strand === x.strand); return h ? h.percent : ''; }),
      r.strengths.join('; '), r.gaps.join('; ')]),
    ...report.notCompleted.map((r) => [r.name, r.studentNumber, r.grade, r.className, '', '', r.status]),
  ]);
  const exportItems = () => downloadCsv(`${scopeName} – ${report.window} – questions.csv`, [
    ['Question ID', 'Grade', 'Strand', 'Question', '% correct', 'Status', 'Answer', 'A', 'B', 'C', 'D', 'Blank', ...LEVELS.map((l) => `${l.label} (${l.colour})`), 'Most common wrong answer'],
    ...report.items.map((it) => [it.id, it.grade, it.strand, it.question, it.percent, flagLabel(it.flag), it.correct, it.choices.A, it.choices.B, it.choices.C, it.choices.D, it.choices.blank,
      ...it.levels.map((l) => l.count), it.commonWrong ? `${it.commonWrong.choice}: ${it.commonWrong.text} (${it.commonWrong.count})` : '']),
  ]);

  return (
    <div className="space-y-4">
      <Card className="no-print">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Check-in"><select className={inputCls} value={report.window} onChange={(e) => set('window', e.target.value)}>
            {report.windows.map((w) => <option key={w} value={w}>{w}</option>)}</select></Field>
          <Field label="Grade"><select className={inputCls} value={filters.grade} onChange={(e) => set('grade', e.target.value)}>
            <option value="all">All grades</option>{GRADES.map((g) => <option key={g} value={g}>{gradeLabel(g)}</option>)}</select></Field>
          <Field label="Class"><select className={inputCls} value={filters.classId} onChange={(e) => set('classId', e.target.value)}>
            <option value="all">All classes</option>{classOptions.map((c) => <option key={c.id} value={c.id}>{c.name}{c.archived ? ' (archived)' : ''}</option>)}</select></Field>
          <label className="flex items-center gap-2 text-sm text-stone-600 pb-2"><input type="checkbox" checked={filters.archived} onChange={(e) => set('archived', e.target.checked)} /> Include archived classes</label>
          <div className="flex-1" />
          <Button onClick={load}><RefreshCw className="w-4 h-4" /> Refresh</Button>
          <Button onClick={exportStudents}><Download className="w-4 h-4" /> Students CSV</Button>
          <Button onClick={exportItems}><Download className="w-4 h-4" /> Questions CSV</Button>
          <Button onClick={() => window.print()}><Printer className="w-4 h-4" /> Print / PDF</Button>
        </div>
      </Card>

      <h1 className="text-2xl font-semibold text-stone-800">{scopeName} · {report.window}</h1>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Stat label="Finished" value={`${s.completed} / ${s.rostered}`} />
        <Stat label="Average score" value={fmtPct(s.average)} />
        <Stat label="Strengths" value={report.strengths.join(', ') || '—'} />
        <Stat label="Gaps" value={report.gaps.join(', ') || '—'} />
      </div>

      {s.completed === 0 ? <Card><p className="text-sm text-stone-500">No finished check-ins for this selection yet.</p></Card> : (<>
        <Card>
          <h2 className="font-semibold text-stone-800">Strands</h2>
          <p className="text-xs text-stone-500 mb-3">Bars show % of answers correct. The lines mark the gap ({report.thresholds.gap}%) and strength ({report.thresholds.strength}%) cut-offs.</p>
          <div className="space-y-2.5">
            {report.strands.map((st) => (
              <div key={st.strand} className="grid grid-cols-[120px_1fr_150px] sm:grid-cols-[150px_1fr_170px] items-center gap-3 text-sm">
                <span>{st.strand}</span>
                <div className="relative h-5 bg-stone-100 rounded" title={`${st.correct} of ${st.total} answers correct`}>
                  <div className={'h-full rounded ' + FLAG_BAR[st.flag]} style={{ width: `${st.percent || 0}%` }} />
                  <div className="absolute inset-y-0 w-0.5 bg-stone-800/40" style={{ left: `${report.thresholds.gap}%` }} />
                  <div className="absolute inset-y-0 w-0.5 bg-stone-800/40" style={{ left: `${report.thresholds.strength}%` }} />
                </div>
                <span className="whitespace-nowrap">{fmtPct(st.percent)} <Pill kind={st.flag}>{flagLabel(st.flag)}</Pill></span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="font-semibold text-stone-800 mb-3">Score spread</h2>
          <div className="space-y-2">
            {s.bands.map((b) => (
              <div key={b.label} className="grid grid-cols-[120px_1fr_100px] items-center gap-3 text-sm">
                <span>{b.label}</span>
                <div className="h-4 bg-stone-100 rounded"><div className="h-full rounded bg-brand-500" style={{ width: `${s.completed ? (b.count / s.completed) * 100 : 0}%` }} /></div>
                <span>{b.count} student{b.count === 1 ? '' : 's'}</span>
              </div>
            ))}
          </div>
        </Card>

        {report.groups.length > 0 && (
          <Card><h2 className="font-semibold text-stone-800 mb-2">{report.groupBy === 'grade' ? 'By grade' : 'By class'}</h2>
            <StrandTable rows={report.groups.map((g) => ({ key: g.name, label: g.name, n: g.students, avg: g.average, strands: g.strands }))} first={report.groupBy === 'grade' ? 'Grade' : 'Class'} />
          </Card>
        )}

        {report.trend.length > 1 && (
          <Card><h2 className="font-semibold text-stone-800">Trends over time</h2>
            <p className="text-xs text-stone-500 mb-2">The same students, across every check-in (including past school years).</p>
            <StrandTable rows={report.trend.map((t) => ({ key: t.window, label: t.window, n: t.students, avg: t.average, strands: t.strands }))} first="Check-in" />
          </Card>
        )}

        <Card>
          <details open={filters.grade !== 'all' || filters.classId !== 'all'}>
            <summary className="cursor-pointer font-semibold text-stone-800">Question analysis ({report.items.length} questions, hardest first)</summary>
            <p className="text-xs text-stone-500 my-2 flex flex-wrap gap-3 items-center">Answer colours:
              {LEVELS.map((l, i) => <span key={l.key} className="inline-flex items-center gap-1"><span className={'w-3 h-3 rounded-sm ' + LEVEL_BG[i]} />{l.label}</span>)}
              · Select a question to see who chose each answer.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-stone-50 text-left text-stone-600"><tr><th className="px-3 py-2">ID</th><th className="px-3 py-2">Strand</th><th className="px-3 py-2">Question</th><th className="px-3 py-2 text-right">% correct</th><th className="px-3 py-2">How students answered</th><th className="px-3 py-2">Most common wrong answer</th></tr></thead>
                <tbody>
                  {report.items.map((it) => (
                    <tr key={it.id} tabIndex={0} role="button" aria-label={`Details for ${it.id}`}
                      onClick={() => setModal({ question: it.id })} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setModal({ question: it.id }); } }}
                      className="border-t border-stone-100 cursor-pointer hover:bg-brand-50 focus:bg-brand-50 outline-none align-top">
                      <td className="px-3 py-2 whitespace-nowrap font-medium">{it.id}</td>
                      <td className="px-3 py-2">{it.strand}</td>
                      <td className="px-3 py-2 max-w-md">{it.question || <i className="text-stone-400">(picture question)</i>}</td>
                      <td className="px-3 py-2 text-right"><Pill kind={it.flag}>{fmtPct(it.percent)}</Pill></td>
                      <td className="px-3 py-2 min-w-36"><LevelBar levels={it.levels} n={it.students} /></td>
                      <td className="px-3 py-2">{it.commonWrong ? `${it.commonWrong.choice}: ${it.commonWrong.text} (${it.commonWrong.count})` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </Card>

        <Card>
          <details open={filters.classId !== 'all'}>
            <summary className="cursor-pointer font-semibold text-stone-800">Students ({report.students.length})</summary>
            <p className="text-xs text-stone-500 my-2">“Close calls” are wrong answers that were the nearest choice (yellow). Lots of close calls usually means careless slips; far-off answers point to a missing idea. Select a student to see their history.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-stone-50 text-left text-stone-600"><tr><th className="px-3 py-2">Student</th><th className="px-3 py-2">Class</th><th className="px-3 py-2 text-right">Score</th><th className="px-3 py-2 text-right">Close calls</th><th className="px-3 py-2 text-right">Far off</th><th className="px-3 py-2">Strengths</th><th className="px-3 py-2">Gaps</th></tr></thead>
                <tbody>
                  {report.students.map((r) => (
                    <tr key={r.studentNumber} tabIndex={0} role="button" onClick={() => setModal({ student: r.studentNumber })}
                      onKeyDown={(e) => { if (e.key === 'Enter') setModal({ student: r.studentNumber }); }}
                      className="border-t border-stone-100 cursor-pointer hover:bg-brand-50 focus:bg-brand-50 outline-none">
                      <td className="px-3 py-2 font-medium">{r.name}</td>
                      <td className="px-3 py-2">{r.className} <span className="text-stone-400">(Gr {r.grade})</span></td>
                      <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{r.score}/{r.total} · {fmtPct(r.percent)}</td>
                      <td className="px-3 py-2 text-right">{r.close}</td>
                      <td className="px-3 py-2 text-right">{r.farOff}</td>
                      <td className="px-3 py-2"><div className="flex flex-wrap gap-1">{r.strengths.map((x) => <Pill key={x} kind="strength">{x}</Pill>)}</div></td>
                      <td className="px-3 py-2"><div className="flex flex-wrap gap-1">{r.gaps.map((x) => <Pill key={x} kind="gap">{x}</Pill>)}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </Card>
      </>)}

      {report.notCompleted.length > 0 && (
        <Card>
          <details>
            <summary className="cursor-pointer font-semibold text-stone-800">Not finished yet ({report.notCompleted.length})</summary>
            <table className="w-full text-sm mt-2"><thead className="bg-stone-50 text-left text-stone-600"><tr><th className="px-3 py-2">Student</th><th className="px-3 py-2">Class</th><th className="px-3 py-2">Grade</th><th className="px-3 py-2">Status</th></tr></thead>
              <tbody>{report.notCompleted.map((r) => <tr key={r.studentNumber} className="border-t border-stone-100"><td className="px-3 py-2">{r.name}</td><td className="px-3 py-2">{r.className}</td><td className="px-3 py-2">{r.grade}</td><td className="px-3 py-2">{r.status}</td></tr>)}</tbody>
            </table>
          </details>
        </Card>
      )}

      {modal?.question && <QuestionDetail id={modal.question} data={data} students={scopeStudents} filters={{ ...filters, window: report.window }} settings={settings} onClose={() => setModal(null)} />}
      {modal?.student && (() => {
        const st = data.students.find((x) => x.studentNumber === modal.student);
        return <StudentHistory student={st} attempts={data.attemptsBySn[st.studentNumber] || []} cfg={cfg} bank={data.bank} onClose={() => setModal(null)} />;
      })()}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-white border border-stone-200 rounded-xl px-4 py-3">
      <div className="text-xs text-stone-500">{label}</div>
      <div className={'font-bold text-stone-800 ' + (String(value).length > 12 ? 'text-base leading-snug' : 'text-2xl')}>{value}</div>
    </div>
  );
}

function LevelBar({ levels, n }) {
  return (
    <div className="flex h-4 rounded overflow-hidden bg-stone-100" role="img" aria-label={levels.map((l) => `${l.label} ${l.count}`).join(', ')}>
      {levels.map((l, i) => (l.count ? <div key={l.key} className={LEVEL_BG[i]} style={{ width: `${(l.count / n) * 100}%` }} title={`${l.label}: ${l.count}`} /> : null))}
    </div>
  );
}

function StrandTable({ rows, first }) {
  const names = [...new Set(rows.flatMap((r) => r.strands.map((s) => s.strand)))];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-stone-50 text-left text-stone-600"><tr><th className="px-3 py-2">{first}</th><th className="px-3 py-2 text-right">Students</th><th className="px-3 py-2 text-right">Average</th>{names.map((n) => <th key={n} className="px-3 py-2 text-right">{n}</th>)}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-stone-100">
              <td className="px-3 py-2 font-medium">{r.label}</td><td className="px-3 py-2 text-right">{r.n}</td><td className="px-3 py-2 text-right">{fmtPct(r.avg)}</td>
              {names.map((n) => { const h = r.strands.find((s) => s.strand === n); return <td key={n} className="px-3 py-2 text-right">{h ? <Pill kind={h.flag}>{fmtPct(h.percent)}</Pill> : '—'}</td>; })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QuestionDetail({ id, data, students, filters, settings, onClose }) {
  const d = questionDetail({ students, attemptsBySn: data.attemptsBySn, questions: data.bank, filters, settings }, id);
  const [imgs, setImgs] = useState({});
  useEffect(() => { const q = data.bank[id]; if (q?.imageSlots?.length) getQuestionImages({ ...q, id }).then(setImgs).catch(() => {}); }, [id, data.bank]);
  const border = ['border-l-lvl-0', 'border-l-lvl-1', 'border-l-lvl-2', 'border-l-lvl-3'];
  return (
    <Modal title={`${d.id} · ${gradeLabel(d.grade)} · ${d.strand || ''}`} onClose={onClose} wide>
      {d.question && <p className="text-stone-800 whitespace-pre-line mb-2">{d.question}</p>}
      {imgs.Q && <img src={imgs.Q} alt="Question picture" className="max-h-64 mx-auto rounded-lg mb-3" />}
      <p className="text-sm text-stone-500 mb-2">{d.total} student{d.total === 1 ? '' : 's'} answered · {d.window}</p>
      <div className="space-y-2">
        {d.options.map((o) => (
          <div key={o.key} className={'border-l-8 rounded-lg bg-stone-50 px-3 py-2 ' + (o.level === null ? 'border-l-stone-300' : border[o.level])}>
            <div className="flex items-center gap-3 flex-wrap">
              <strong>{o.key}.{o.text ? ' ' + o.text : ''}</strong>
              {imgs[o.key] && <img src={imgs[o.key]} alt={`Answer ${o.key}`} className="max-h-14 rounded bg-white" />}
              <span className="flex-1" />
              <span className="text-sm text-stone-500">{o.levelLabel ? o.levelLabel + ' · ' : ''}{o.students.length} ({fmtPct(o.percent)})</span>
            </div>
            {o.students.length > 0 && <div className="text-sm mt-1 text-stone-700">{o.students.map((s) => s.name + (filters.classId === 'all' ? ` (${s.className})` : '')).join(', ')}</div>}
          </div>
        ))}
        {d.blank.length > 0 && <div className="border-l-8 border-l-stone-300 rounded-lg bg-stone-50 px-3 py-2"><strong>No answer · {d.blank.length}</strong><div className="text-sm mt-1">{d.blank.map((s) => s.name).join(', ')}</div></div>}
      </div>
    </Modal>
  );
}
