import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, UserPlus, Upload, Share2, Archive, ArchiveRestore, BarChart3, Trash2, RotateCcw, History, Pencil, RefreshCw } from 'lucide-react';
import { Card, Button, Modal, Field, inputCls, ErrorBox, OkBox, Pill, Spinner } from '../ui.jsx';
import { accessFor, getRoster, upsertStudent, removeStudent, getAttemptsFor, resetAttempt, updateClass } from '../../lib/data.js';
import { parseStudentList } from '../../lib/csv.js';
import { toStudentNumber } from '../../lib/identity.js';
import { GRADES, gradeLabel, STAFF_DOMAIN } from '../../constants.js';
import StudentHistory from './StudentHistory.jsx';

export default function ClassView({ cls, cfg, me, onBack, onChanged, onReport }) {
  const access = accessFor(cls, me.email, me.isAdmin);
  const canEdit = !cls.archived && ['owner', 'editor', 'admin'].includes(access);
  const canManage = access === 'owner' || me.isAdmin;
  const [roster, setRoster] = useState(null);
  const [attempts, setAttempts] = useState({});
  const [modal, setModal] = useState(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    setError('');
    try {
      const r = await getRoster(cls.id);
      setRoster(r);
      setAttempts(await getAttemptsFor(r.map((s) => s.studentNumber)));
    } catch (e) { setError('Could not load this class: ' + (e.message || e)); setRoster([]); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [cls.id]);

  const statusFor = (sn) => {
    const list = (attempts[sn] || []).filter((a) => a.window === cfg.currentWindow);
    const sub = list.filter((a) => a.status === 'submitted').sort((a, b) => b.submittedAt - a.submittedAt)[0];
    const ip = list.find((a) => a.status === 'in_progress');
    if (ip) return { kind: 'developing', text: `In progress ${ip.answeredCount || 0}/${(ip.questionIds || []).length}`, attempt: ip };
    if (sub) return { kind: 'strength', text: 'Finished ' + new Date(sub.submittedAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }), attempt: sub };
    return { kind: 'neutral', text: 'Not started' };
  };

  const counts = useMemo(() => {
    const c = { done: 0, ip: 0, none: 0 };
    (roster || []).forEach((s) => { const k = statusFor(s.studentNumber).kind; if (k === 'strength') c.done++; else if (k === 'developing') c.ip++; else c.none++; });
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roster, attempts]);

  const changeGrade = async (s, grade) => {
    setError('');
    try {
      const res = await upsertStudent(cls, { ...s, grade }, me.email);
      if (res.status === 'conflict') throw new Error('not allowed');
      setRoster((r) => r.map((x) => (x.studentNumber === s.studentNumber ? { ...x, grade } : x)));
    } catch (e) { setError(`Couldn’t change ${s.name}’s grade: ${e.message || e}`); }
  };

  const remove = async (s) => {
    if (!window.confirm(`Remove ${s.name} from ${cls.name}? Their results are kept and follow them to their next class.`)) return;
    try { await removeStudent(cls.id, s.studentNumber); setRoster((r) => r.filter((x) => x.studentNumber !== s.studentNumber)); }
    catch (e) { setError(`Couldn’t remove ${s.name}: ${e.message || e}`); }
  };

  const reset = async (s, attempt) => {
    if (!window.confirm(`Reset ${s.name}’s ${cfg.currentWindow} check-in? Their answers for it will be deleted so they can start again.`)) return;
    try { await resetAttempt(s.studentNumber, attempt.id); setAttempts((a) => ({ ...a, [s.studentNumber]: (a[s.studentNumber] || []).filter((x) => x.id !== attempt.id) })); }
    catch (e) { setError(`Couldn’t reset: ${e.message || e}`); }
  };

  const toggleArchive = async () => {
    const to = !cls.archived;
    if (to && !window.confirm(`Archive ${cls.name}? It becomes read-only, and its students can be added to next year’s classes. Results are kept.`)) return;
    try { onChanged(await updateClass(cls, { archived: to })); } catch (e) { setError('Couldn’t change the class: ' + (e.message || e)); }
  };

  const rename = async () => {
    const name = window.prompt('Class name', cls.name);
    if (!name || !name.trim() || name === cls.name) return;
    try { onChanged(await updateClass(cls, { name: name.trim().slice(0, 80) })); } catch (e) { setError('Couldn’t rename: ' + (e.message || e)); }
  };

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-sm text-brand-700 hover:underline"><ArrowLeft className="w-4 h-4" /> All classes</button>
      <div className="flex items-start gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold text-stone-800 tracking-wide flex items-center gap-2">{cls.name}
            {canManage && !cls.archived && <button type="button" onClick={rename} aria-label="Rename class" className="p-1 rounded hover:bg-stone-100"><Pencil className="w-4 h-4 text-stone-400" /></button>}
          </h1>
          <p className="text-sm text-stone-500">{cls.schoolYear} · Teacher: {cls.ownerName || cls.ownerEmail}
            {cls.archived && <> · <Pill>Archived</Pill></>}
            {access === 'viewer' && <> · <Pill kind="brand">View only</Pill></>}
          </p>
        </div>
        <div className="flex-1" />
        <div className="flex gap-2 flex-wrap">
          <Button onClick={onReport}><BarChart3 className="w-4 h-4" /> Class report</Button>
          {canManage && <Button onClick={() => setModal('share')}><Share2 className="w-4 h-4" /> Share</Button>}
          {canManage && <Button onClick={toggleArchive}>{cls.archived ? <><ArchiveRestore className="w-4 h-4" /> Unarchive</> : <><Archive className="w-4 h-4" /> Archive</>}</Button>}
        </div>
      </div>

      <ErrorBox>{error}</ErrorBox>
      <OkBox>{notice}</OkBox>

      {canEdit && <AddStudent cls={cls} me={me} onAdded={(msg) => { setNotice(msg); load(); }} onImport={() => setModal('import')} />}

      <Card className="p-0 overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-stone-100 flex-wrap">
          <h2 className="font-display font-bold tracking-wide text-stone-800">Students {roster && `(${roster.length})`}</h2>
          {roster && roster.length > 0 && (
            <span className="text-xs text-stone-500">{cfg.currentWindow}: {counts.done} finished · {counts.ip} in progress · {counts.none} not started</span>
          )}
          <div className="flex-1" />
          <Button variant="ghost" onClick={load}><RefreshCw className="w-4 h-4" /> Refresh</Button>
        </div>
        {!roster ? <Spinner /> : roster.length === 0 ? (
          <p className="p-4 text-sm text-stone-500">No students yet. {canEdit && 'Add them one at a time above, or import a CSV.'}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-left text-stone-600">
                <tr><th className="px-4 py-2">Student</th><th className="px-4 py-2">Student #</th><th className="px-4 py-2">Grade</th><th className="px-4 py-2">{cfg.currentWindow}</th><th className="px-4 py-2 text-right">Actions</th></tr>
              </thead>
              <tbody>
                {roster.map((s) => {
                  const st = statusFor(s.studentNumber);
                  return (
                    <tr key={s.studentNumber} className="border-t border-stone-100">
                      <td className="px-4 py-2 font-medium text-stone-800">{s.name}</td>
                      <td className="px-4 py-2 text-stone-500 tabular-nums">{s.studentNumber}</td>
                      <td className="px-4 py-2">
                        {canEdit ? (
                          <select className={inputCls + ' py-1 min-h-8'} value={s.grade} onChange={(e) => changeGrade(s, e.target.value)} aria-label={`Grade for ${s.name}`}>
                            {GRADES.map((g) => <option key={g} value={g}>{g === 'K' ? 'K' : g}</option>)}
                          </select>
                        ) : gradeLabel(s.grade)}
                      </td>
                      <td className="px-4 py-2"><Pill kind={st.kind}>{st.text}</Pill></td>
                      <td className="px-4 py-2">
                        <div className="flex justify-end gap-1">
                          <IconBtn label={`History for ${s.name}`} onClick={() => setModal({ history: s })}><History className="w-4 h-4" /></IconBtn>
                          {canEdit && st.attempt && <IconBtn label={`Reset ${s.name}’s check-in`} onClick={() => reset(s, st.attempt)}><RotateCcw className="w-4 h-4" /></IconBtn>}
                          {canEdit && <IconBtn label={`Remove ${s.name}`} onClick={() => remove(s)}><Trash2 className="w-4 h-4" /></IconBtn>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {modal === 'import' && <ImportModal cls={cls} me={me} onClose={() => setModal(null)} onDone={(msg) => { setModal(null); setNotice(msg); load(); }} />}
      {modal === 'share' && <ShareModal cls={cls} onClose={() => setModal(null)} onSaved={(c) => { onChanged(c); }} />}
      {modal?.history && <StudentHistory student={{ ...modal.history, classId: cls.id, className: cls.name }} attempts={attempts[modal.history.studentNumber] || []} cfg={cfg} onClose={() => setModal(null)} />}
    </div>
  );
}

function IconBtn({ label, onClick, children }) {
  return <button type="button" onClick={onClick} aria-label={label} title={label} className="p-2 rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-800">{children}</button>;
}

function resultMessage(name, res) {
  if (res.status === 'added') return `${name} added.`;
  if (res.status === 'updated') return `${name} updated.`;
  if (res.status === 'moved') return `${name} moved here${res.fromClass ? ` from ${res.fromClass}` : ''}.`;
  return '';
}

const CONFLICT = 'is already in another teacher’s active class. Ask that teacher to remove them (or archive their class), or ask an admin to move them.';

function AddStudent({ cls, me, onAdded, onImport }) {
  const [num, setNum] = useState('');
  const [name, setName] = useState('');
  const [grade, setGrade] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const add = async (e) => {
    e.preventDefault();
    setError('');
    const sn = toStudentNumber(num);
    if (!sn) return setError('Enter the 9-digit student number (from their S#########@ddsbstudent.ca account).');
    if (!name.trim()) return setError('Enter the student’s name.');
    if (!grade) return setError('Choose a grade, so the app knows which check-in to give them.');
    setBusy(true);
    try {
      const res = await upsertStudent(cls, { studentNumber: sn, name: name.trim(), grade }, me.email);
      if (res.status === 'conflict') setError(`${sn} ${CONFLICT}`);
      else { onAdded(resultMessage(name.trim(), res)); setNum(''); setName(''); }
    } catch (err) { setError('Could not add: ' + (err.message || err)); }
    setBusy(false);
  };
  return (
    <Card>
      <form onSubmit={add} className="flex flex-wrap items-end gap-3">
        <Field label="Student number" className="w-44"><input className={inputCls} value={num} onChange={(e) => setNum(e.target.value)} placeholder="123456789" inputMode="numeric" /></Field>
        <Field label="Name" className="flex-1 min-w-48"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="First Last" maxLength={80} /></Field>
        <Field label="Grade" className="w-36">
          <select className={inputCls} value={grade} onChange={(e) => setGrade(e.target.value)}>
            <option value="">Choose…</option>
            {GRADES.map((g) => <option key={g} value={g}>{gradeLabel(g)}</option>)}
          </select>
        </Field>
        <Button type="submit" variant="primary" disabled={busy}><UserPlus className="w-4 h-4" /> Add student</Button>
        <Button onClick={onImport}><Upload className="w-4 h-4" /> Import CSV</Button>
      </form>
      <div className="mt-2"><ErrorBox>{error}</ErrorBox></div>
    </Card>
  );
}

function ImportModal({ cls, me, onClose, onDone }) {
  const [text, setText] = useState('');
  const [grade, setGrade] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [problems, setProblems] = useState([]);
  const parsed = useMemo(() => (text.trim() ? parseStudentList(text, grade) : { students: [], errors: [] }), [text, grade]);

  const readFile = async (f) => { if (f) setText(await f.text()); };

  const run = async () => {
    setBusy(true);
    const out = { added: 0, updated: 0, moved: 0, conflicts: [] , failed: [] };
    for (let i = 0; i < parsed.students.length; i++) {
      const s = parsed.students[i];
      setProgress(`Saving ${i + 1} of ${parsed.students.length}…`);
      try {
        const res = await upsertStudent(cls, s, me.email);
        if (res.status === 'conflict') out.conflicts.push(`${s.name} (${s.studentNumber})`);
        else out[res.status]++;
      } catch (e) { out.failed.push(`${s.name}: ${e.message || e}`); }
    }
    setBusy(false);
    const issues = [];
    if (out.conflicts.length) issues.push(`Already in another teacher’s active class (not added):\n• ${out.conflicts.join('\n• ')}`);
    if (out.failed.length) issues.push(`Couldn’t save:\n• ${out.failed.join('\n• ')}`);
    const summary = `${out.added} added, ${out.updated} updated, ${out.moved} moved here.`;
    if (issues.length) { setProblems(issues); setProgress(summary); }
    else onDone(summary);
  };

  return (
    <Modal title={`Import students into ${cls.name}`} onClose={onClose} wide>
      <div className="space-y-3 text-sm">
        <p className="text-stone-600">Choose a CSV file or paste from a spreadsheet. Each row needs a <b>student number</b> (or their S-number email) and a <b>name</b>. Add a <b>grade</b> column, or pick one grade for everyone below. Students already in this class are updated.</p>
        <div className="flex flex-wrap gap-3 items-end">
          <Field label="CSV file"><input type="file" accept=".csv,.txt,.tsv,text/csv" onChange={(e) => readFile(e.target.files[0])} className="text-sm" /></Field>
          <Field label="Grade for rows without one" className="w-56">
            <select className={inputCls} value={grade} onChange={(e) => setGrade(e.target.value)}>
              <option value="">Use the grade column</option>
              {GRADES.map((g) => <option key={g} value={g}>{gradeLabel(g)}</option>)}
            </select>
          </Field>
        </div>
        <textarea className={inputCls + ' w-full h-40 font-mono text-xs'} value={text} onChange={(e) => setText(e.target.value)}
          placeholder={'Student Number,First Name,Last Name,Grade\n123456789,Jordan,Smith,4\nS987654321@ddsbstudent.ca,Priya,Patel,4'} />
        {parsed.students.length > 0 && (
          <div className="max-h-48 overflow-y-auto border border-stone-200 rounded-lg">
            <table className="w-full text-xs"><thead className="bg-stone-50"><tr><th className="text-left px-2 py-1">Student #</th><th className="text-left px-2 py-1">Name</th><th className="text-left px-2 py-1">Grade</th></tr></thead>
              <tbody>{parsed.students.map((s) => <tr key={s.studentNumber} className="border-t border-stone-100"><td className="px-2 py-1 tabular-nums">{s.studentNumber}</td><td className="px-2 py-1">{s.name}</td><td className="px-2 py-1">{s.grade}</td></tr>)}</tbody>
            </table>
          </div>
        )}
        <ErrorBox>{parsed.errors.length ? parsed.errors.slice(0, 15).join('\n') + (parsed.errors.length > 15 ? `\n…and ${parsed.errors.length - 15} more` : '') : ''}</ErrorBox>
        {progress && <OkBox>{progress}</OkBox>}
        <ErrorBox>{problems.join('\n\n')}</ErrorBox>
        <div className="flex justify-end gap-2">
          <Button onClick={problems.length ? () => onDone(progress) : onClose}>{problems.length ? 'Done' : 'Cancel'}</Button>
          {!problems.length && <Button variant="primary" onClick={run} disabled={busy || !parsed.students.length}>Import {parsed.students.length || ''} student{parsed.students.length === 1 ? '' : 's'}</Button>}
        </div>
      </div>
    </Modal>
  );
}

function ShareModal({ cls, onClose, onSaved }) {
  const [c, setC] = useState(cls);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('viewers');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async (next) => {
    setBusy(true); setError('');
    try { const saved = await updateClass(c, { editors: next.editors, viewers: next.viewers }); setC(saved); onSaved(saved); }
    catch (e) { setError('Could not save: ' + (e.message || e)); }
    setBusy(false);
  };
  const add = (e) => {
    e.preventDefault();
    const em = email.trim().toLowerCase();
    if (!em.endsWith('@' + STAFF_DOMAIN)) return setError(`Share with a staff account ending in @${STAFF_DOMAIN}.`);
    if (em === c.ownerEmail) return setError('That’s the class owner.');
    const editors = c.editors.filter((x) => x !== em), viewers = c.viewers.filter((x) => x !== em);
    (role === 'editors' ? editors : viewers).push(em);
    setEmail('');
    save({ editors, viewers });
  };
  const removeEm = (em) => save({ editors: c.editors.filter((x) => x !== em), viewers: c.viewers.filter((x) => x !== em) });
  const people = [...c.editors.map((e) => [e, 'Can edit']), ...c.viewers.map((e) => [e, 'View only'])];

  return (
    <Modal title={`Share ${cls.name}`} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <p className="text-stone-600"><b>Can edit</b>: add/remove students and reset check-ins (e.g. a co-teacher or ECE). <b>View only</b>: see the class and its reports. Admins can already see every class.</p>
        <form onSubmit={add} className="flex gap-2 flex-wrap items-end">
          <Field label="Staff email" className="flex-1 min-w-48"><input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder={`name@${STAFF_DOMAIN}`} /></Field>
          <Field label="Access"><select className={inputCls} value={role} onChange={(e) => setRole(e.target.value)}><option value="viewers">View only</option><option value="editors">Can edit</option></select></Field>
          <Button type="submit" variant="primary" disabled={busy}>Share</Button>
        </form>
        <ErrorBox>{error}</ErrorBox>
        <ul className="divide-y divide-stone-100 border border-stone-200 rounded-lg">
          <li className="flex items-center px-3 py-2"><span className="flex-1">{c.ownerEmail}</span><Pill kind="brand">Owner</Pill></li>
          {people.map(([em, label]) => (
            <li key={em} className="flex items-center gap-2 px-3 py-2"><span className="flex-1 truncate">{em}</span><Pill>{label}</Pill>
              <button type="button" onClick={() => removeEm(em)} aria-label={`Stop sharing with ${em}`} className="p-1.5 rounded hover:bg-stone-100"><Trash2 className="w-4 h-4 text-stone-500" /></button>
            </li>
          ))}
        </ul>
        <div className="flex justify-end"><Button onClick={onClose}>Done</Button></div>
      </div>
    </Modal>
  );
}
