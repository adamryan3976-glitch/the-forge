import { useState, useEffect } from 'react';
import { onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut } from 'firebase/auth';
import { auth, googleProvider } from '../firebase.js';

export function useAuth() {
  // undefined = still checking; null = signed out; object = signed in
  const [user, setUser] = useState(undefined);
  const [error, setError] = useState(null);

  useEffect(() => onAuthStateChanged(auth, (u) => setUser(u)), []);

  const signIn = async () => {
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      if (e.code === 'auth/popup-blocked') return signInWithRedirect(auth, googleProvider);
      if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') return;
      setError(friendlyAuthError(e));
    }
  };

  const logOut = () => signOut(auth);
  return { user, loading: user === undefined, error, signIn, logOut };
}

function friendlyAuthError(e) {
  const msg = String(e.message || '');
  if (/admin_policy_enforced|access_denied|disallowed/i.test(msg)) {
    return 'Your school account isn’t allowed to sign in to this app yet. Please tell your teacher.';
  }
  if (e.code === 'auth/unauthorized-domain') return 'This web address isn’t set up in Firebase yet (Authorized domains).';
  return 'Sign-in didn’t work. Please try again. (' + (e.code || msg) + ')';
}
