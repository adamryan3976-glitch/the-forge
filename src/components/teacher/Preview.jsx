import { useEffect, useMemo, useState } from 'react';
import { Eye, X, Flag, Copy, Mail, ChevronLeft, RotateCcw, Check } from 'lucide-react';
import { Card, Button, Spinner, ErrorBox } from '../ui.jsx';
import { QuestionScreen, Big } from '../student/StudentApp.jsx';
import { getQuestionsForGrade, getQuestionImages, getAnswerKeys } from '../../lib/data.js';
import { GRADES, gradeLabel } from '../../constants.js';
import { OWNER_EMAILS } from '../../lib/identity.js';

/**
 * Teacher preview: go through a grade's check-in exactly as a student sees it.
 * Nothing here is written to the database. Answers and notes live only in
 * this page and disappear when the teacher leaves it.
 */
export default function Preview({ cfg, me }) {
  const [grade, setGrade] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [phase, setPhase] = useState('pick'); // pick | loading | intro | quiz | review | done
  const [questions, setQuestions] = useState([]);
  const [keys, setKeys] = useState({});
  const [images, setImages] = useState({});
  const [answers, setAnswers] = useState({});
  const [flags, setFlags] = useState({});     // qid -> note
  const [idx, setIdx] = useState(0);
  const [error, setError] = useState('');

  const leave = () => {
    const hasNotes = Object.values(flags).some((n) => n.trim());
    if (hasNotes && !window.confirm('Leave the preview? Your notes about problems will be lost unless you copy or email them first.')) return;
    setPhase('pick'); setAnswers({}); setFlags({}); setIdx(0); setError('');
  };

  // Leaving the page with notes typed: ask first.
  useEffect(() => {
    const hasNotes = Object.values(flags).some((n) => n.trim());
    if (!hasNotes) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [flags]);

  const start = async (g) => {
    setGrade(g); setPhase('loading'); setError('');
    setAnswers({}); setFlags({}); setIdx(0); setImages({});
    try {
      const qs = await getQuestionsForGrade(g);
      if (!qs.length) { setError(`There are no active questions for ${gradeLabel(g)} yet.`); setPhase('pick'); return; }
      setQuestions(qs);
      setKeys(await getAnswerKeys(qs.map((q) => q.id)).catch(() => ({})));
      setPhase('intro');
      qs.forEach((q) => {
        if (q.imageSlots?.length) getQuestionImages(q).then((imgs) => setImages((p) => ({ ...p, [q.id]: imgs }))).catch(() => {});
      });
    } catch (e) {
      setError('Could not load the questions: ' + (e.message || e));
      setPhase('pick');
    }
  };

  // ---------- Pick a grade ----------
  if (phase === 'pick' || phase === 'loading') {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-stone-800 tracking-wide flex items-center gap-2"><Eye className="w-6 h-6" /> Preview a check-in</h1>
          <p className="text-stone-600 mt-1">Choose a grade to go through its check-in exactly as a student sees it. <strong>Nothing is saved</strong>, and it doesn’t matter whether the check-in is open to students. Use <strong>Flag a problem</strong> on any question that looks wrong, then send your notes at the end.</p>
        </div>
        <ErrorBox>{error}</ErrorBox>
        <Card>
          {phase === 'loading' ? <Spinner label={`Loading ${gradeLabel(grade)}…`} /> : (
            <>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {GRADES.map((g) => (
                  <Button key={g} className="py-4 text-base" onClick={() => start(g)}>{gradeLabel(g)}</Button>
                ))}
              </div>
              <label className="flex items-center gap-2 mt-4 text-sm text-stone-700">
                <input type="checkbox" checked={showKey} onChange={(e) => setShowKey(e.target.checked)} className="w-4 h-4 accent-brand-600" />
                Show the correct answer after I pick one
              </label>
              {cfg?.shuffleQuestions && <p className="text-xs text-stone-500 mt-2">Questions are shuffled for students, so each student sees them in a different order. The preview shows them in the order they are in the Sheet.</p>}
            </>
          )}
        </Card>
      </div>
    );
  }

  const banner = (
    <div className="flex items-center gap-2 flex-wrap rounded-xl bg-gold-50 border border-gold-300 text-stone-800 px-3 py-2 mb-4 text-sm">
      <Eye className="w-4 h-4" />
      <span><strong>Preview · {gradeLabel(grade)}</strong>. Nothing is saved.</span>
      <div className="flex-1" />
      <Button variant="ghost" onClick={leave}><X className="w-4 h-4" /> Exit preview</Button>
    </div>
  );
  const wrap = (children) => <div className="max-w-3xl mx-auto">{banner}{children}</div>;
  const firstName = (me?.name || '').split(' ')[0] || 'there';

  if (phase === 'intro') {
    return wrap(
      <Big logo title={`Hi ${firstName}!`}>
        <p className="text-lg text-stone-700">Welcome to The Forge! This is your {gradeLabel(grade)} math check-in. It helps your teacher see what you already know and what to work on next.</p>
        <p className="mt-2 text-stone-500">Take your time and try your best. If you’re not sure, make your best guess. You can go back and change answers before you finish.</p>
        <p className="mt-2 text-sm text-stone-500">{questions.length} questions</p>
        <Button variant="primary" className="mt-6 text-lg px-8 py-3" onClick={() => setPhase('quiz')}>Start</Button>
      </Big>
    );
  }

  const answered = questions.filter((q) => answers[q.id]).length;

  if (phase === 'review') {
    const missing = questions.length - answered;
    return wrap(
      <div className="bg-white border border-stone-200 rounded-2xl p-5 sm:p-6">
        <h1 className="font-display text-2xl font-bold text-stone-800 tracking-wide">Check your answers</h1>
        <p className="mt-2 text-stone-700">{missing
          ? `You have ${missing} question${missing === 1 ? '' : 's'} without an answer (shown in yellow). Tap a number to go back to it.`
          : 'You answered every question. Tap a number if you want to look at one again.'}</p>
        <p className="mt-1 text-sm text-stone-500">Questions you flagged have a red flag.</p>
        <div className="flex flex-wrap gap-2 my-4">
          {questions.map((q, i) => (
            <button key={q.id} type="button" onClick={() => { setIdx(i); setPhase('quiz'); }}
              className={'relative w-12 h-12 rounded-lg border-2 font-semibold ' + (answers[q.id] ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-amber-400 bg-amber-50 text-amber-800')}>
              {i + 1}
              {(flags[q.id] || '').trim() && <Flag className="absolute -top-2 -right-2 w-4 h-4 text-rose-600 fill-rose-500" />}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 mt-4">
          <Button onClick={() => { setIdx(questions.length - 1); setPhase('quiz'); }}><ChevronLeft className="w-4 h-4" /> Back</Button>
          <div className="flex-1" />
          <Button variant="primary" className="text-lg px-6 py-3" onClick={() => setPhase('done')}>I’m finished</Button>
        </div>
      </div>
    );
  }

  if (phase === 'done') {
    return wrap(<Summary grade={grade} questions={questions} answers={answers} keys={keys} flags={flags} me={me}
      onBack={() => setPhase('review')} onRestart={() => { setAnswers({}); setFlags({}); setIdx(0); setPhase('intro'); }} />);
  }

  // ---------- A question ----------
  const q = questions[idx];
  const key = keys[q.id];
  const chosen = answers[q.id];
  const status = <span className="text-xs text-stone-400 font-mono" title="Question ID in the Sheet">{q.id}</span>;

  return wrap(
    <>
      <QuestionScreen
        q={q} index={idx} total={questions.length} answered={answered}
        images={images[q.id] || {}} chosen={chosen}
        onChoose={(letter) => setAnswers((a) => ({ ...a, [q.id]: letter }))}
        onBack={() => setIdx((i) => Math.max(0, i - 1))}
        onNext={() => (idx < questions.length - 1 ? setIdx(idx + 1) : setPhase('review'))}
        isLast={idx === questions.length - 1} status={status} saveError=""
      />
      {showKey && chosen && key?.correct && (
        <div className={'mt-3 rounded-lg px-3 py-2 text-sm ' + (chosen === key.correct ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800')}>
          {chosen === key.correct ? <><Check className="inline w-4 h-4" /> That’s the correct answer.</> : <>The answer key says <strong>{key.correct}</strong>.</>}
        </div>
      )}
      <FlagBox key={q.id} note={flags[q.id] || ''} onChange={(note) => setFlags((f) => ({ ...f, [q.id]: note }))} />
    </>
  );
}

function FlagBox({ note, onChange }) {
  const [open, setOpen] = useState(!!note);
  if (!open) {
    return (
      <div className="mt-3 text-right">
        <Button variant="ghost" onClick={() => setOpen(true)}><Flag className="w-4 h-4" /> Flag a problem with this question</Button>
      </div>
    );
  }
  return (
    <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50/60 p-3">
      <label className="flex items-center gap-1.5 text-sm font-medium text-rose-800 mb-1"><Flag className="w-4 h-4" /> What’s wrong with this question?</label>
      <textarea value={note} onChange={(e) => onChange(e.target.value)} rows={2} autoFocus
        placeholder="e.g. The picture is missing, two answers are correct, the wording is confusing for Grade 2…"
        className="w-full rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm" />
      <div className="text-right">
        <Button variant="ghost" onClick={() => { onChange(''); setOpen(false); }}>Remove flag</Button>
      </div>
    </div>
  );
}

function Summary({ grade, questions, answers, keys, flags, me, onBack, onRestart }) {
  const [copied, setCopied] = useState(false);
  const hasKeys = questions.some((q) => keys[q.id]?.correct);
  const right = questions.filter((q) => answers[q.id] && answers[q.id] === keys[q.id]?.correct).length;
  const flagged = questions.map((q, i) => ({ q, n: i + 1, note: (flags[q.id] || '').trim() })).filter((f) => f.note);

  const report = useMemo(() => [
    `The Forge: problems found in the ${gradeLabel(grade)} check-in`,
    `From: ${me?.name || ''} (${me?.email || ''})`,
    '',
    ...flagged.map(({ q, n, note }) => `Question ${n} (${q.id}): ${short(q.text, 90)}\n  Problem: ${note}`),
  ].join('\n'), [flagged, grade, me]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(report); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { window.prompt('Copy these notes:', report); }
  };
  const mailto = `mailto:${OWNER_EMAILS[0]}?subject=${encodeURIComponent(`The Forge: ${gradeLabel(grade)} check-in problems`)}&body=${encodeURIComponent(report)}`;

  return (
    <div className="space-y-4">
      <div className="bg-white border border-stone-200 rounded-2xl p-6 text-center">
        <h1 className="font-display text-2xl font-bold text-stone-800 tracking-wide">Preview finished</h1>
        <p className="text-stone-600 mt-1">A student would now see “Well forged!” and nothing more. They don’t see a score.</p>
        {hasKeys && <p className="mt-3 text-lg">You got <strong>{right}</strong> of <strong>{questions.length}</strong> right by the answer key.</p>}
      </div>

      {hasKeys && (
        <Card>
          <h2 className="font-semibold text-stone-800 mb-2">Answers that didn’t match the key</h2>
          {(() => {
            const off = questions.map((q, i) => ({ q, n: i + 1 })).filter(({ q }) => keys[q.id]?.correct && answers[q.id] !== keys[q.id].correct);
            if (!off.length) return <p className="text-sm text-emerald-700">None. Every answer matched.</p>;
            return (
              <ul className="text-sm divide-y divide-stone-100">
                {off.map(({ q, n }) => (
                  <li key={q.id} className="py-1.5 flex gap-2">
                    <span className="font-mono text-stone-400 w-16 flex-none">{q.id}</span>
                    <span className="flex-1 text-stone-700">Q{n}. {short(q.text, 80)}</span>
                    <span className="flex-none text-stone-600">You: <strong>{answers[q.id] || '—'}</strong> · Key: <strong>{keys[q.id].correct}</strong></span>
                  </li>
                ))}
              </ul>
            );
          })()}
          <p className="text-xs text-stone-500 mt-2">If you’re sure your answer is right, the answer key may be wrong. Flag that question.</p>
        </Card>
      )}

      <Card>
        <h2 className="font-semibold text-stone-800 mb-2 flex items-center gap-1.5"><Flag className="w-4 h-4 text-rose-600" /> Problems you flagged ({flagged.length})</h2>
        {flagged.length ? (
          <>
            <ul className="text-sm space-y-2 mb-3">
              {flagged.map(({ q, n, note }) => (
                <li key={q.id}><span className="font-mono text-stone-400">{q.id}</span> <span className="text-stone-700">Q{n}:</span> {note}</li>
              ))}
            </ul>
            <div className="flex gap-2 flex-wrap">
              <a href={mailto} className="inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium min-h-10 bg-brand-600 text-white hover:bg-brand-700 border-brand-600"><Mail className="w-4 h-4" /> Email these notes</a>
              <Button onClick={copy}><Copy className="w-4 h-4" /> {copied ? 'Copied!' : 'Copy notes'}</Button>
            </div>
          </>
        ) : <p className="text-sm text-stone-500">You didn’t flag anything. Go back and use <strong>Flag a problem</strong> on any question that looks wrong.</p>}
      </Card>

      <div className="flex gap-2">
        <Button onClick={onBack}><ChevronLeft className="w-4 h-4" /> Back to the questions</Button>
        <div className="flex-1" />
        <Button onClick={onRestart}><RotateCcw className="w-4 h-4" /> Start this grade again</Button>
      </div>
    </div>
  );
}

function short(text, n) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return '[picture question]';
  return t.length > n ? t.slice(0, n).replace(/\s+\S*$/, '') + '…' : t;
}
