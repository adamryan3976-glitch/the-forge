export default function SignInScreen({ onSignIn, error, schoolName = 'Winchester P.S.' }) {
  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
      <div className="max-w-sm w-full text-center">
        <img src={import.meta.env.BASE_URL + 'favicon.svg'} alt="" className="w-20 h-20 rounded-2xl mx-auto mb-4 shadow-sm" />
        <h1 className="text-2xl font-bold text-stone-800 mb-1">Math Check-In</h1>
        <p className="text-sm text-stone-500 mb-6">{schoolName} · Sign in with your school Google account.</p>
        <button
          type="button"
          onClick={onSignIn}
          className="w-full flex items-center justify-center gap-3 bg-white border border-stone-300 rounded-xl px-4 py-3.5 text-base font-medium text-stone-700 hover:bg-stone-100 shadow-sm"
        >
          <GoogleIcon /> Sign in with Google
        </button>
        {error && <p className="text-sm text-rose-700 mt-3" role="alert">{error}</p>}
        <p className="text-xs text-stone-400 mt-6">Students: use your S-number school account. Teachers: use your @ddsb.ca account.</p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.9-2.26 5.36-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24s.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
