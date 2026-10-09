import { useAuth } from './hooks/useAuth.js';
import { classify } from './lib/identity.js';
import { missingConfig } from './firebase.js';
import SignInScreen from './components/SignInScreen.jsx';
import StudentApp from './components/student/StudentApp.jsx';
import TeacherApp from './components/teacher/TeacherApp.jsx';
import { Spinner, Button } from './components/ui.jsx';
import { Footer, LegalPage, useLegalRoute } from './components/Legal.jsx';

export default function App() {
  const { user, loading, error, signIn, logOut } = useAuth();
  const legal = useLegalRoute();

  // The Privacy Policy and Terms open for anyone, signed in or not.
  if (legal) return <LegalPage page={legal} />;

  if (missingConfig.length) {
    return <Centered title="Firebase isn’t set up yet">The site was built without its Firebase settings ({missingConfig.join(', ')}). See README → “Add your Firebase settings to GitHub”.</Centered>;
  }
  if (loading) return <Spinner />;
  if (!user) return <SignInScreen onSignIn={signIn} error={error} />;

  const who = classify(user.email);
  if (who.role === 'student') return <StudentApp user={user} studentNumber={who.studentNumber} onSignOut={logOut} />;
  if (who.role === 'staff') return <TeacherApp user={user} email={who.email} onSignOut={logOut} />;
  return (
    <Centered title="Please use your school account">
      You’re signed in as <b>{user.email}</b>. Students sign in with their S-number school account, and staff with their @ddsb.ca account.
      <div className="mt-4"><Button variant="primary" onClick={logOut}>Sign out and try again</Button></div>
    </Centered>
  );
}

function Centered({ title, children }) {
  return (
    <div className="min-h-screen bg-stone-50 flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="max-w-md bg-white border border-stone-200 rounded-2xl p-6 text-center">
          <h1 className="text-xl font-semibold text-stone-800 mb-2">{title}</h1>
          <div className="text-sm text-stone-600">{children}</div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
