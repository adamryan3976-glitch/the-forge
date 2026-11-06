// Apps Script edition: Google has already signed the person in. The server
// puts who they are into the page (window.__FORGE_BOOT__) when it opens.
export function useAuth() {
  const boot = (typeof window !== 'undefined' && window.__FORGE_BOOT__) || null;
  const user = boot ? { email: boot.email, displayName: boot.displayName || '' } : null;
  return {
    user,
    loading: false,
    error: boot ? null : 'Please open The Forge from its school link.',
    signIn: () => window.location.reload(),
    logOut: undefined,   // no sign-out: it's the Chromebook's own Google account
  };
}
