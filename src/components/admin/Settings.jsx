import { useState } from 'react';
import { Card, Button, Field, inputCls, ErrorBox, OkBox } from '../ui.jsx';
import { saveConfig } from '../../lib/data.js';
import { slugify } from '../../lib/shuffle.js';
import { STAFF_DOMAIN } from '../../constants.js';
import { OWNER_EMAILS } from '../../lib/identity.js';

export default function Settings({ cfg, me, firstRun, onSaved }) {
  const [c, setC] = useState({ ...cfg, adminsText: (cfg.admins || []).join('\n') });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const set = (k, v) => setC((x) => ({ ...x, [k]: v }));

  const save = async () => {
    setError(''); setOk('');
    const admins = c.adminsText.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
    const bad = admins.filter((a) => !a.endsWith('@' + STAFF_DOMAIN));
    if (bad.length) return setError(`Admins must be @${STAFF_DOMAIN} accounts: ${bad.join(', ')}`);
    if (!c.currentWindow.trim()) return setError('Give the current check-in a name, e.g. “Fall 2026”.');
    const strength = Number(c.strengthThreshold), gap = Number(c.gapThreshold);
    if (!(gap > 0 && strength > gap && strength <= 100)) return setError('The strength cut-off must be higher than the gap cut-off (e.g. 75 and 60).');
    const { adminsText, exists, ...rest } = c;
    const next = { ...rest, currentWindow: c.currentWindow.trim(), windowKey: slugify(c.currentWindow), admins, strengthThreshold: strength, gapThreshold: gap };
    setBusy(true);
    try { await saveConfig(next); onSaved({ ...next, exists: true }); setOk('Saved.'); }
    catch (e) { setError('Could not save: ' + (e.message || e)); }
    setBusy(false);
  };

  const windowChanged = c.currentWindow.trim() !== cfg.currentWindow;

  return (
    <div className="space-y-4 max-w-2xl">
      <h1 className="text-2xl font-semibold text-stone-800">Settings</h1>
      {firstRun && <OkBox>Welcome! This is the first time the app has been opened. Check these settings and click Save to finish setting it up. Then import your questions on the Questions page.</OkBox>}
      <Card className="space-y-4">
        <Field label="School name"><input className={inputCls} value={c.schoolName} onChange={(e) => set('schoolName', e.target.value)} /></Field>
        <Field label="Current check-in (saved with every attempt — change it each term to see trends)">
          <input className={inputCls} value={c.currentWindow} onChange={(e) => set('currentWindow', e.target.value)} placeholder="Fall 2026" />
        </Field>
        {windowChanged && cfg.exists && <p className="text-xs text-amber-700 -mt-2">Starting a new check-in: students will begin a fresh attempt. Results from “{cfg.currentWindow}” are kept.</p>}
        <Toggle checked={c.assessmentOpen} onChange={(v) => set('assessmentOpen', v)} label="Open to students" help="Turn off to stop students starting or handing in the check-in." />
        <Toggle checked={c.allowRetakes} onChange={(v) => set('allowRetakes', v)} label="Allow retakes" help="Off = one attempt per student per check-in (teachers can still reset one student)." />
        <Toggle checked={c.shuffleQuestions} onChange={(v) => set('shuffleQuestions', v)} label="Shuffle question order" help="Each student gets their own order (it stays the same if they come back)." />
        <div className="flex gap-3">
          <Field label="Strength if % correct is at least"><input type="number" className={inputCls + ' w-28'} value={c.strengthThreshold} onChange={(e) => set('strengthThreshold', e.target.value)} /></Field>
          <Field label="Gap if % correct is below"><input type="number" className={inputCls + ' w-28'} value={c.gapThreshold} onChange={(e) => set('gapThreshold', e.target.value)} /></Field>
        </div>
        <Field label="Admins (one per line) — they see every class and manage questions and settings">
          <textarea className={inputCls + ' h-28 font-mono text-xs'} value={c.adminsText} onChange={(e) => set('adminsText', e.target.value)} placeholder={`principal@${STAFF_DOMAIN}`} />
        </Field>
        <p className="text-xs text-stone-500">Always an admin (set in the security rules): {OWNER_EMAILS.join(', ')}. You are signed in as {me.email}.</p>
        <ErrorBox>{error}</ErrorBox>
        <OkBox>{ok}</OkBox>
        <div className="flex justify-end"><Button variant="primary" onClick={save} disabled={busy}>Save settings</Button></div>
      </Card>
    </div>
  );
}

function Toggle({ checked, onChange, label, help }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input type="checkbox" className="mt-1 w-5 h-5 accent-brand-600" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <span><span className="text-sm font-medium text-stone-800">{label}</span><span className="block text-xs text-stone-500">{help}</span></span>
    </label>
  );
}
