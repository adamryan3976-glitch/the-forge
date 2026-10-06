import { useState } from 'react';
import { Plus, Users, Share2, Archive } from 'lucide-react';
import { Card, Button, Modal, Field, inputCls, ErrorBox, Pill } from '../ui.jsx';
import { createClass, accessFor } from '../../lib/data.js';
import { currentSchoolYear } from '../../constants.js';

export default function ClassList({ classes, me, cfg, onOpen, onCreated }) {
  const [creating, setCreating] = useState(false);
  const mine = classes.filter((c) => c.ownerEmail === me.email);
  const shared = classes.filter((c) => c.ownerEmail !== me.email && ((c.editors || []).includes(me.email) || (c.viewers || []).includes(me.email)));
  const others = me.isAdmin ? classes.filter((c) => !mine.includes(c) && !shared.includes(c)) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold text-stone-800 tracking-wide">Classes</h1>
          <p className="text-sm text-stone-500">
            Current check-in: <b>{cfg.currentWindow}</b> · {cfg.assessmentOpen ? <Pill kind="strength">Open to students</Pill> : <Pill>Closed</Pill>}
          </p>
        </div>
        <div className="flex-1" />
        <Button variant="primary" onClick={() => setCreating(true)}><Plus className="w-4 h-4" /> New class</Button>
      </div>

      <Section title="My classes" list={mine} me={me} onOpen={onOpen}
        empty="You don’t have any classes yet. Click “New class” to make one, then add your students." />
      {shared.length > 0 && <Section title="Shared with me" list={shared} me={me} onOpen={onOpen} />}
      {others.length > 0 && <Section title="All other classes (admin)" list={others} me={me} onOpen={onOpen} />}

      {creating && <NewClassModal me={me} onClose={() => setCreating(false)} onCreated={(c) => { setCreating(false); onCreated(c); }} />}
    </div>
  );
}

function Section({ title, list, me, onOpen, empty }) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-stone-500 uppercase tracking-wide mb-2">{title}</h2>
      {list.length === 0 ? <Card><p className="text-sm text-stone-500">{empty}</p></Card> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((c) => {
            const access = accessFor(c, me.email, me.isAdmin);
            return (
              <button key={c.id} type="button" onClick={() => onOpen(c.id)}
                className={'text-left bg-white border rounded-xl p-4 hover:border-brand-300 hover:shadow-sm ' + (c.archived ? 'border-stone-200 opacity-70' : 'border-stone-200')}>
                <div className="flex items-start gap-2">
                  <Users className="w-5 h-5 text-brand-600 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-stone-800 truncate">{c.name}</div>
                    <div className="text-xs text-stone-500">{c.schoolYear} · {access === 'owner' ? 'You' : c.ownerName || c.ownerEmail}</div>
                  </div>
                </div>
                <div className="flex gap-1.5 mt-3 flex-wrap">
                  {c.archived && <Pill><Archive className="inline w-3 h-3 mr-1" />Archived</Pill>}
                  {access !== 'owner' && <Pill kind="brand">{access === 'admin' ? 'Admin view' : access === 'editor' ? 'Can edit' : 'View only'}</Pill>}
                  {access === 'owner' && (c.editors.length + c.viewers.length) > 0 && <Pill kind="brand"><Share2 className="inline w-3 h-3 mr-1" />Shared with {c.editors.length + c.viewers.length}</Pill>}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function NewClassModal({ me, onClose, onCreated }) {
  const [name, setName] = useState('');
  const [year, setYear] = useState(currentSchoolYear());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    if (!name.trim()) return setError('Give the class a name, e.g. “Room 12 – Ms. Lee”.');
    setBusy(true);
    try { onCreated(await createClass({ name, schoolYear: year, ownerEmail: me.email, ownerName: me.name })); }
    catch (e) { setError('Could not create the class: ' + (e.message || e)); setBusy(false); }
  };
  return (
    <Modal title="New class" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Class name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Room 12 – Ms. Lee" maxLength={80} autoFocus /></Field>
        <Field label="School year"><input className={inputCls} value={year} onChange={(e) => setYear(e.target.value)} /></Field>
        <ErrorBox>{error}</ErrorBox>
        <div className="flex justify-end gap-2"><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save} disabled={busy}>Create class</Button></div>
      </div>
    </Modal>
  );
}
