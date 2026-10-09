import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onSnapshot } from 'firebase/firestore';
import { Volume2, ChevronLeft, ChevronRight, Check, CloudOff, Loader2 } from 'lucide-react';
import Header from '../Header.jsx';
import { Spinner, Button, ErrorBox } from '../ui.jsx';
import {
  getEnrolment, getConfig, getAttempts, getQuestionsForGrade, getQuestionsByIds, getQuestionImages,
  startAttempt, saveAnswer, submitAttempt, attemptRef,
} from '../../lib/data.js';
import { seededShuffle } from '../../lib/shuffle.js';
import { readBackup, writeBackup, clearBackup } from '../../lib/answerBackup.js';
import { gradeLabel } from '../../constants.js';
import { Footer } from '../Legal.jsx';

export default function StudentApp({ user, studentNumber: sn, onSignOut }) {
  const [phase, setPhase] = useState('loading'); // loading | message | intro | quiz | review | submitting | done
  const [msg, setMsg] = useState(null);
  const [ctx, setCtx] = useState(null);           // { enrol, cfg, resume, nextId, submittedCount }
  const [error, setError] = useState('');
  const firstName = (ctx?.enrol?.name || user.displayName || '').split(' ')[0];

  // ---------- 1. Who am I, which class, which grade? ----------
  useEffect(() => {
    (async () => {
      try {
        const enrol = await getEnrolment(sn);
        if (!enrol) {
          return show('👋', 'Almost there!', `Your student number (${sn}) isn’t on a class list yet. Please ask your teacher to add you.`);
        }
        const cfg = await getConfig();
        const attempts = (await getAttempts(sn)).filter((a) => a.window === cfg.currentWindow);
        const resume = attempts.find((a) => a.status === 'in_progress');
        const submittedCount = attempts.filter((a) => a.status === 'submitted').length;
        setCtx({ enrol, cfg, resume, submittedCount, nextId: `${cfg.windowKey}__${attempts.length + 1}` });
        if (!cfg.assessmentOpen) return show('⏸️', 'Not open right now', 'The math check-in is closed. Your teacher will let you know when it opens.');
        if (!resume && submittedCount && !cfg.allowRetakes) return show('🎉', `All done, ${enrol.name.split(' ')[0]}!`, 'You have already finished this math check-in. Great work!');
        setPhase('intro');
      } catch (e) {
        setError(friendly(e));
        setPhase('message');
      }
    })();
    function show(emoji, title, body) { setMsg({ emoji, title, body }); setPhase('message'); }
  }, [sn]);

  // ---------- 2. The quiz ----------
  const [quiz, setQuiz] = useState(null);         // { attemptId, questions:[...] }
  const [images, setImages] = useState({});       // qid -> { Q, A, ... }
  const [answers, setAnswers] = useState({});
  const [idx, setIdx] = useState(0);
  const [pending, setPending] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  const begin = async () => {
    setPhase('loading');
    setError('');
    try {
      const { enrol, cfg, resume } = ctx;
      let attemptId, questions, serverAnswers = {};
      if (resume) {
        attemptId = resume.id;
        const found = await getQuestionsByIds(resume.questionIds);
        const byId = Object.fromEntries(found.map((q) => [q.id, q]));
        questions = resume.questionIds.map((id) => byId[id]).filter(Boolean);
        serverAnswers = resume.answers || {};
      } else {
        const qs = await getQuestionsForGrade(enrol.grade);
        if (!qs.length) { setMsg({ emoji: '🛠️', title: 'Not ready yet', body: `There are no questions for ${gradeLabel(enrol.grade)} yet. Please tell your teacher.` }); setPhase('message'); return; }
        questions = cfg.shuffleQuestions ? seededShuffle(qs, sn + cfg.currentWindow) : qs;
        attemptId = cfg.allowRetakes ? ctx.nextId : `${cfg.windowKey}__1`;
        await startAttempt(sn, attemptId, {
          studentNumber: sn, studentName: enrol.name, grade: enrol.grade, classId: enrol.classId,
          className: enrol.className || '', window: cfg.currentWindow, questionIds: questions.map((q) => q.id),
        });
      }
      // Answers kept on this device win over the server copy (they're newer).
      const backup = readBackup(sn, attemptId);
      const merged = { ...serverAnswers, ...backup };
      setAnswers(merged);
      Object.entries(backup).forEach(([qid, letter]) => {
        if (serverAnswers[qid] !== letter) saveAnswer(sn, attemptId, qid, letter, Object.keys(merged).length).catch(() => {});
      });
      setQuiz({ attemptId, questions });
      const firstOpen = questions.findIndex((q) => !merged[q.id]);
      setIdx(firstOpen < 0 ? questions.length - 1 : firstOpen);
      setPhase('quiz');
      // Pictures load in the background.
      questions.forEach((q) => {
        if (q.imageSlots?.length) getQuestionImages(q).then((imgs) => setImages((prev) => ({ ...prev, [q.id]: imgs }))).catch(() => {});
      });
    } catch (e) {
      setError(friendly(e));
      setPhase('message');
    }
  };

  // Watch whether answers are still waiting to be sent.
  useEffect(() => {
    if (!quiz) return undefined;
    return onSnapshot(attemptRef(sn, quiz.attemptId), { includeMetadataChanges: true },
      (snap) => setPending(snap.metadata.hasPendingWrites), () => {});
  }, [quiz, sn]);

  const answersRef = useRef({});
  useEffect(() => { answersRef.current = answers; }, [answers]);

  const choose = useCallback((qid, letter) => {
    const next = { ...answersRef.current, [qid]: letter };
    answersRef.current = next;
    setAnswers(next);
    writeBackup(sn, quiz.attemptId, next);
    saveAnswer(sn, quiz.attemptId, qid, letter, Object.keys(next).length)
      .then(() => setSaveError(''))
      .catch((e) => setSaveError(e.code === 'permission-denied'
        ? 'The check-in has been closed, so new answers can’t be saved. Your teacher can reopen it.'
        : 'An answer didn’t save. Check your internet; we’ll keep trying.'));
  }, [quiz, sn]);

  const submit = async () => {
    setPhase('submitting');
    try {
      await submitAttempt(sn, quiz.attemptId, answersRef.current);
      clearBackup(sn, quiz.attemptId);
      setPhase('done');
    } catch (e) {
      setError(e.code === 'permission-denied'
        ? 'The check-in is closed right now, so it can’t be handed in. Your answers are saved — your teacher can reopen it.'
        : 'Your answers were not sent. Check your internet and try again. Your answers are still saved.');
      setPhase('review');
    }
  };

  // ---------- Screens ----------
  const header = <Header schoolName={ctx?.cfg?.schoolName || ''} user={user} onSignOut={onSignOut} />;
  const shell = (children) => (
    <div className="min-h-screen bg-stone-50 flex flex-col">{header}<main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6">{children}</main><Footer /></div>
  );

  if (phase === 'loading') return shell(<Spinner />);
  if (phase === 'message') {
    return shell(
      <Big emoji={msg?.emoji || '😕'} title={msg?.title || 'Something went wrong'}>
        {msg?.body}
        {error && <div className="mt-3 text-left"><ErrorBox>{error}</ErrorBox></div>}
      </Big>
    );
  }
  if (phase === 'intro') {
    const resuming = !!ctx.resume;
    return shell(
      <Big logo title={`Hi ${firstName}!`}>
        <p className="text-lg text-stone-700">{resuming
          ? 'Welcome back! Your answers were saved. Let’s keep going.'
          : `Welcome to The Forge! This is your ${gradeLabel(ctx.enrol.grade)} math check-in. It helps your teacher see what you already know and what to work on next.`}</p>
        {!resuming && <p className="mt-2 text-stone-500">Take your time and try your best. If you’re not sure, make your best guess. You can go back and change answers before you finish.</p>}
        <Button variant="primary" className="mt-6 text-lg px-8 py-3 shadow-md shadow-brand-900/20" onClick={begin}>{resuming ? 'Keep going' : 'Start'}</Button>
      </Big>
    );
  }
  if (phase === 'submitting') return shell(<Big emoji="📨" title="Handing in…">{!online && 'Waiting for the internet to come back. Keep this page open.'}<Spinner label="" /></Big>);
  if (phase === 'done') {
    return shell(<Big logo title={`Well forged, ${firstName}!`}>You finished your math check-in. Thank you for trying your best! You can close this page now.</Big>);
  }

  const { questions } = quiz;
  const answered = questions.filter((q) => answers[q.id]).length;
  const status = <SaveStatus online={online} pending={pending} />;

  if (phase === 'review') {
    const missing = questions.length - answered;
    return shell(
      <div className="bg-white border border-stone-200 rounded-2xl p-5 sm:p-6">
        <div className="flex items-center justify-between gap-2"><h1 className="font-display text-2xl font-bold text-stone-800 tracking-wide">Check your answers</h1>{status}</div>
        <p className="mt-2 text-stone-700">{missing
          ? `You have ${missing} question${missing === 1 ? '' : 's'} without an answer (shown in yellow). Tap a number to go back to it.`
          : 'You answered every question. Tap a number if you want to look at one again.'}</p>
        <div className="flex flex-wrap gap-2 my-4">
          {questions.map((q, i) => (
            <button key={q.id} type="button" onClick={() => { setIdx(i); setPhase('quiz'); }}
              aria-label={`Question ${i + 1}, ${answers[q.id] ? 'answered' : 'not answered'}`}
              className={'w-12 h-12 rounded-lg border-2 font-semibold ' + (answers[q.id] ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-amber-400 bg-amber-50 text-amber-800')}>
              {i + 1}
            </button>
          ))}
        </div>
        <ErrorBox>{error || saveError}</ErrorBox>
        <div className="flex items-center gap-3 mt-4">
          <Button onClick={() => { setIdx(questions.length - 1); setPhase('quiz'); }}><ChevronLeft className="w-4 h-4" /> Back</Button>
          <div className="flex-1" />
          <Button variant="primary" className="text-lg px-6 py-3" onClick={() => {
            if (missing && !window.confirm(`You still have ${missing} question(s) without an answer. Finish anyway?`)) return;
            submit();
          }}>I’m finished</Button>
        </div>
      </div>
    );
  }

  return shell(
    <QuestionScreen
      q={questions[idx]} index={idx} total={questions.length} answered={answered}
      images={images[questions[idx].id] || {}} chosen={answers[questions[idx].id]}
      onChoose={(letter) => choose(questions[idx].id, letter)}
      onBack={() => setIdx((i) => Math.max(0, i - 1))}
      onNext={() => (idx < questions.length - 1 ? setIdx(idx + 1) : setPhase('review'))}
      isLast={idx === questions.length - 1} status={status} saveError={saveError}
    />
  );
}

export function QuestionScreen({ q, index, total, answered, images, chosen, onChoose, onBack, onNext, isLast, status, saveError }) {
  const options = useMemo(() => ['A', 'B', 'C', 'D'].filter((k) => q.options?.[k]).map((k) => ({ key: k, ...q.options[k] })), [q]);
  const topRef = useRef(null);
  useEffect(() => { window.speechSynthesis?.cancel(); topRef.current?.focus(); }, [q.id]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const k = e.key.toUpperCase();
      if (options.some((o) => o.key === k)) onChoose(k);
      else if (e.key === 'ArrowRight') onNext();
      else if (e.key === 'ArrowLeft') onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [options, onChoose, onNext, onBack]);

  const speak = () => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const text = (q.text || 'Look at the picture.') + '. ' + options.map((o) => `${o.key}. ${o.text || 'picture'}`).join('. ');
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.9; u.lang = 'en-CA';
    synth.speak(u);
  };

  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <span ref={topRef} tabIndex={-1} className="font-semibold text-stone-500 outline-none">Question {index + 1} of {total}</span>
        <div className="flex-1" />
        {status}
        {'speechSynthesis' in window && (
          <Button onClick={speak} aria-label="Read the question out loud"><Volume2 className="w-4 h-4" /> Read to me</Button>
        )}
      </div>
      <div className="h-3 bg-stone-100 rounded-full overflow-hidden my-4 ring-1 ring-stone-200" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={answered}>
        <div className="h-full heat-bar transition-all" style={{ width: `${(answered / total) * 100}%` }} />
      </div>
      {q.text && <p className="text-xl sm:text-2xl leading-relaxed text-stone-800 whitespace-pre-line mb-4">{q.text}</p>}
      {q.hasImage && (images.Q
        ? <img src={images.Q} alt="Picture for this question" className="block max-w-full max-h-80 mx-auto mb-4 rounded-lg" />
        : <div className="h-40 mb-4 rounded-lg bg-stone-100 animate-pulse" aria-label="Loading picture" />)}
      <div className="grid gap-3" role="group" aria-label="Answer choices">
        {options.map((o) => {
          const on = chosen === o.key;
          return (
            <button key={o.key} type="button" onClick={() => onChoose(o.key)} aria-pressed={on}
              className={'flex items-center gap-4 text-left rounded-xl border-2 px-4 py-3 min-h-16 text-lg sm:text-xl transition-colors ' +
                (on ? 'border-brand-500 bg-brand-50' : 'border-stone-200 hover:border-brand-300 bg-white')}>
              <span className={'flex-none w-10 h-10 rounded-full grid place-items-center font-bold ' + (on ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-700')}>{o.key}</span>
              {o.hasImage && (images[o.key]
                ? <img src={images[o.key]} alt={`Answer ${o.key}${o.text ? ': ' + o.text : ' (picture)'}`} className="max-h-36 max-w-[70%] rounded-lg bg-white" />
                : <span className="h-16 w-32 rounded-lg bg-stone-100 animate-pulse" />)}
              {o.text && <span className="text-stone-800">{o.text}</span>}
            </button>
          );
        })}
      </div>
      {saveError && <div className="mt-3"><ErrorBox>{saveError}</ErrorBox></div>}
      <div className="flex items-center gap-3 mt-6">
        <Button onClick={onBack} disabled={index === 0}><ChevronLeft className="w-4 h-4" /> Back</Button>
        <div className="flex-1" />
        <Button variant="primary" onClick={onNext} className="px-5">
          {isLast ? 'Check my answers' : 'Next'} <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

function SaveStatus({ online, pending }) {
  if (!online) return <span className="inline-flex items-center gap-1 text-xs text-amber-700"><CloudOff className="w-4 h-4" /> Offline — answers kept on this device</span>;
  if (pending) return <span className="inline-flex items-center gap-1 text-xs text-stone-500"><Loader2 className="w-4 h-4 animate-spin" /> Saving…</span>;
  return <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><Check className="w-4 h-4" /> Saved</span>;
}

export function Big({ emoji, logo, title, children }) {
  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center shadow-sm">
      {logo
        ? <img src={import.meta.env.BASE_URL + 'logo.svg'} alt="" className="w-32 mx-auto mb-3 ember-pulse" />
        : <div className="text-6xl mb-3" aria-hidden="true">{emoji}</div>}
      <h1 className="font-display text-2xl font-bold text-stone-800 tracking-wide mb-2">{title}</h1>
      <div className="text-stone-600">{children}</div>
    </div>
  );
}

function friendly(e) {
  if (e?.code === 'permission-denied') return 'Your class isn’t open for the check-in right now. Please tell your teacher.';
  if (e?.code === 'unavailable') return 'We can’t reach the internet. Check your connection and reload the page.';
  return 'Something went wrong: ' + (e?.message || e);
}
