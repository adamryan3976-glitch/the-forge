import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { initializeFirestore, memoryLocalCache } from 'firebase/firestore';

// These values come from your Firebase project settings (see README.md).
// They are safe to expose in client-side code -- real access control is
// enforced by firestore.rules, not by hiding these values.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const missingConfig = Object.entries(firebaseConfig).filter(([, v]) => !v).map(([k]) => k);
if (missingConfig.length) {
  console.error('Missing Firebase config values: ' + missingConfig.join(', ') +
    '. Copy .env.example to .env and fill in your Firebase project settings (see README.md).');
}

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
// Always show the account chooser: shared classroom devices often have
// several students signed in to Chrome.
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Memory cache: nothing about students is left behind in the browser's storage
// on shared devices. Writes made while offline still queue in memory and send
// automatically when the connection comes back; the student screen also keeps
// a small backup of the student's own answers (see lib/answerBackup.js).
export const db = initializeFirestore(app, { localCache: memoryLocalCache() });
