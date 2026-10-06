import { useEffect, useMemo, useState } from 'react';
import { Upload, Eye } from 'lucide-react';
import { Card, Button, Field, inputCls, ErrorBox, OkBox, Spinner, Pill, Modal } from '../ui.jsx';
import { getQuestionBank, importQuestionBank, getQuestionImages } from '../../lib/data.js';
import { parseQuestionFile, shrinkDataUrl } from '../../lib/questionImport.js';
import { loadBank } from '../teacher/StudentHistory.jsx';
import { GRADES, gradeLabel, CHOICES, LEVELS } from '../../constants.js';

export default function QuestionBank() {
  const [bank, setBank] = useState(null);
  const [error, setError] = useState('');
  const [grade, setGrade] = useState('all');
  const [preview, setPreview] = useState(null);
  const [importing, setImporting] = useState(null); // { questions, problems, filename }
  const [progress, setProgress] = useState('');
  const [ok, setOk] = useState('');

  const load = async () => {
    try { setBank(await getQuestionBank()); } catch (e) { setError('Could not load questions: ' + (e.message || e)); }
  };
  useEffect(() => { load(); }, []);

  const list = useMemo(() => Object.values(bank || {}).filter((q) => grade === 'all' || q.grade === grade)
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })), [bank, grade]);
  const counts = useMemo(() => {
    const c = {};
    Object.values(bank || {}).forEach((q) => { c[q.grade] = c[q.grade] || { on: 0, off: 0 }; c[q.grade][q.active ? 'on' : 'off']++; });
    return c;
  }, [bank]);

  const pickFile = async (f) => {
    setError(''); setOk('');
    if (!f) return;
    const text = await f.text();
    setImporting({ ...parseQuestionFile(text, f.name), filename: f.name });
  };

  const runImport = async () => {
    setProgress('Preparing pictures…');
    try {
      const qs = [];
      for (const q of importing.questions) {
        const images = {};
        for (const [slot, url] of Object.entries(q.images || {})) if (url) images[slot] = await shrinkDataUrl(url);
        qs.push({ ...q, images });
      }
      await importQuestionBank(qs, (d, n) => setProgress(`Saving question ${d} of ${n}…`));
      setOk(`Imported ${qs.length} questions. Questions that weren’t in the file have been switched off (not deleted).`);
      setImporting(null);
      await loadBank(true);
      await load();
    } catch (e) { setError('Import stopped: ' + (e.message || e)); }
    setProgress('');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-stone-800">Questions</h1>
          <p className="text-sm text-stone-500">Edit questions and pictures in the Google Sheet, then import them here.</p>
        </div>
        <div className="flex-1" />
        <label className="inline-flex items-center gap-2 rounded-lg border border-brand-600 bg-brand-600 text-white px-3.5 py-2 text-sm font-medium cursor-pointer hover:bg-brand-700">
          <Upload className="w-4 h-4" /> Import from the Sheet
          <input type="file" accept=".json,.csv,application/json,text/csv" className="sr-only" onChange={(e) => { pickFile(e.target.files[0]); e.target.value = ''; }} />
        </label>
      </div>

      <Card className="text-sm text-stone-600">
        <b>How to update questions:</b> in the Google Sheet, run <b>Math Assessment → 4. Export questions for the web app</b>, download the file it makes, then click <b>Import from the Sheet</b> and choose it. Pictures and the green/yellow/orange/red answer ranking come across too. Students never receive the answer key.
      </Card>

      <ErrorBox>{error}</ErrorBox>
      <OkBox>{ok}</OkBox>

      {importing && (
        <Card className="space-y-3">
          <h2 className="font-semibold text-stone-800">Ready to import “{importing.filename}”</h2>
          <p className="text-sm">{importing.questions.length} questions ({importing.questions.filter((q) => q.active).length} switched on), {importing.questions.reduce((a, q) => a + Object.keys(q.images || {}).length, 0)} pictures.</p>
          <ErrorBox>{importing.problems.length ? importing.problems.slice(0, 20).join('\n') + (importing.problems.length > 20 ? `\n…and ${importing.problems.length - 20} more` : '') : ''}</ErrorBox>
          {progress ? <Spinner label={progress} /> : (
            <div className="flex gap-2 justify-end"><Button onClick={() => setImporting(null)}>Cancel</Button>
              <Button variant="primary" onClick={runImport} disabled={!importing.questions.length}>Import now</Button></div>
          )}
        </Card>
      )}

      {!bank ? <Spinner /> : (
        <Card className="p-0 overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-stone-100 flex-wrap">
            <Field label="Grade"><select className={inputCls} value={grade} onChange={(e) => setGrade(e.target.value)}>
              <option value="all">All grades</option>{GRADES.map((g) => <option key={g} value={g}>{gradeLabel(g)}</option>)}</select></Field>
            <div className="flex flex-wrap gap-2 text-xs">
              {GRADES.filter((g) => counts[g]).map((g) => <Pill key={g} kind="brand">{gradeLabel(g)}: {counts[g].on} on{counts[g].off ? `, ${counts[g].off} off` : ''}</Pill>)}
              {!Object.keys(counts).length && <span className="text-stone-500">No questions yet — import them from the Sheet.</span>}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-left text-stone-600"><tr><th className="px-3 py-2">ID</th><th className="px-3 py-2">Strand</th><th className="px-3 py-2">Question</th><th className="px-3 py-2">Answer</th><th className="px-3 py-2">Status</th><th className="px-3 py-2" /></tr></thead>
              <tbody>
                {list.map((q) => (
                  <tr key={q.id} className="border-t border-stone-100">
                    <td className="px-3 py-2 font-medium whitespace-nowrap">{q.id}</td>
                    <td className="px-3 py-2">{q.strand}</td>
                    <td className="px-3 py-2 max-w-lg">{q.text || <i className="text-stone-400">(picture question)</i>}{q.imageSlots?.length ? <span className="ml-1 text-xs text-stone-400">🖼 {q.imageSlots.length}</span> : null}</td>
                    <td className="px-3 py-2">{q.correct}</td>
                    <td className="px-3 py-2">{q.active ? <Pill kind="strength">On</Pill> : <Pill>Off</Pill>}</td>
                    <td className="px-3 py-2"><Button variant="ghost" onClick={() => setPreview(q)}><Eye className="w-4 h-4" /> Preview</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {preview && <Preview q={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

function Preview({ q, onClose }) {
  const [imgs, setImgs] = useState({});
  useEffect(() => { if (q.imageSlots?.length) getQuestionImages(q).then(setImgs).catch(() => {}); }, [q]);
  const lvl = (k) => {
    if (k === q.correct) return 0;
    const i = (q.wrongRank || []).indexOf(k);
    return i < 0 ? null : Math.min(i + 1, 3);
  };
  const border = ['border-lvl-0', 'border-lvl-1', 'border-lvl-2', 'border-lvl-3'];
  return (
    <Modal title={`${q.id} · ${gradeLabel(q.grade)} · ${q.strand}`} onClose={onClose} wide>
      {q.text && <p className="text-lg text-stone-800 whitespace-pre-line mb-3">{q.text}</p>}
      {q.hasImage && (imgs.Q ? <img src={imgs.Q} alt="" className="max-h-72 mx-auto rounded-lg mb-3" /> : <Spinner label="Loading picture…" />)}
      <div className="grid gap-2">
        {CHOICES.filter((k) => q.options?.[k]).map((k) => {
          const l = lvl(k);
          return (
            <div key={k} className={'flex items-center gap-3 rounded-xl border-2 px-3 py-2 ' + (l === null ? 'border-stone-200' : border[l])}>
              <span className="w-8 h-8 rounded-full grid place-items-center bg-brand-50 text-brand-700 font-bold">{k}</span>
              {imgs[k] && <img src={imgs[k]} alt="" className="max-h-24 rounded" />}
              <span className="flex-1">{q.options[k].text}</span>
              {l !== null && <span className="text-xs text-stone-500">{LEVELS[l].label}</span>}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-stone-500 mt-3">Coloured borders show the answer key and ranking — students never see these.</p>
    </Modal>
  );
}
