import { useCallback, useEffect, useState } from 'react';
import { School, BarChart3, BookOpen, Settings as SettingsIcon } from 'lucide-react';
import Header, { NavButton } from '../Header.jsx';
import { Spinner, ErrorBox } from '../ui.jsx';
import { getConfig, listClasses } from '../../lib/data.js';
import { isAdminEmail } from '../../lib/identity.js';
import ClassList from './ClassList.jsx';
import ClassView from './ClassView.jsx';
import Reports from './Reports.jsx';
import Settings from '../admin/Settings.jsx';
import QuestionBank from '../admin/QuestionBank.jsx';

export default function TeacherApp({ user, email, onSignOut }) {
  const [cfg, setCfg] = useState(null);
  const [classes, setClasses] = useState(null);
  const [view, setView] = useState({ name: 'classes' });
  const [error, setError] = useState('');
  const isAdmin = cfg ? isAdminEmail(email, cfg) : false;

  const reloadClasses = useCallback(async (config = cfg) => {
    try {
      setClasses(await listClasses(email, isAdminEmail(email, config)));
    } catch (e) {
      setError('Could not load classes: ' + (e.message || e));
      setClasses([]);
    }
  }, [cfg, email]);

  useEffect(() => {
    (async () => {
      try {
        const c = await getConfig();
        setCfg(c);
        await reloadClasses(c);
        if (!c.exists && isAdminEmail(email, c)) setView({ name: 'settings', firstRun: true });
      } catch (e) {
        setError('Could not load the app settings: ' + (e.message || e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);

  const go = (name, extra = {}) => setView({ name, ...extra });
  const me = { email, name: user.displayName || email, isAdmin };

  let body;
  if (error) body = <ErrorBox>{error}</ErrorBox>;
  else if (!cfg || !classes) body = <Spinner />;
  else if (view.name === 'class') {
    const cls = classes.find((c) => c.id === view.classId);
    body = cls
      ? <ClassView cls={cls} cfg={cfg} me={me} onBack={() => go('classes')}
          onChanged={(updated) => setClasses((list) => list.map((c) => (c.id === updated.id ? updated : c)))}
          onReport={() => go('reports', { classId: cls.id })} />
      : <ErrorBox>That class couldn’t be found.</ErrorBox>;
  } else if (view.name === 'reports') body = <Reports classes={classes} cfg={cfg} me={me} initialClassId={view.classId} />;
  else if (view.name === 'settings' && isAdmin) body = <Settings cfg={cfg} me={me} firstRun={view.firstRun} onSaved={(c) => { setCfg(c); }} />;
  else if (view.name === 'questions' && isAdmin) body = <QuestionBank />;
  else body = <ClassList classes={classes} me={me} cfg={cfg} onOpen={(id) => go('class', { classId: id })} onCreated={(c) => { setClasses((l) => [...l, c]); go('class', { classId: c.id }); }} />;

  return (
    <div className="min-h-screen bg-stone-50">
      <Header schoolName={cfg?.schoolName || ''} user={user} onSignOut={onSignOut}>
        <NavButton icon={School} active={['classes', 'class'].includes(view.name)} onClick={() => go('classes')}>Classes</NavButton>
        <NavButton icon={BarChart3} active={view.name === 'reports'} onClick={() => go('reports')}>Reports</NavButton>
        {isAdmin && <NavButton icon={BookOpen} active={view.name === 'questions'} onClick={() => go('questions')}>Questions</NavButton>}
        {isAdmin && <NavButton icon={SettingsIcon} active={view.name === 'settings'} onClick={() => go('settings')}>Settings</NavButton>}
      </Header>
      <main className="max-w-6xl mx-auto px-4 py-6">{body}</main>
    </div>
  );
}
