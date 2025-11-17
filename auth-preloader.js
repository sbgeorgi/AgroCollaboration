// C:\HELLOWORLD\AgroCollaboration\auth-preloader.js
/**
 * CRITICAL PRE-RENDER SCRIPT
 * This script runs synchronously in the <head> of the document BEFORE the body is rendered.
 * Its purpose is to check for a cached auth session in localStorage and immediately inject
 * CSS rules to prevent a "Flash of Unauthenticated Content" (FOUC).
 * DO NOT load this as a module or defer it.
 */
(function () {
  try {
    const cached = localStorage.getItem('asf_auth_cache');
    if (!cached) {
      document.documentElement.setAttribute('data-auth-ready', 'logged-out');
      return;
    }

    const parsed = JSON.parse(cached);
    if (Date.now() > parsed.expiry) {
      localStorage.removeItem('asf_auth_cache');
      document.documentElement.setAttribute('data-auth-ready', 'logged-out');
      return;
    }

    const isLoggedIn = !!(parsed.data?.session && parsed.data?.profile);

    const style = document.createElement('style');
    style.id = 'auth-preload-style';
    style.textContent = isLoggedIn
      ? '#btnSignIn { display: none !important; } #btnProfile, #btnSignOut { display: inline-flex !important; } #btnProfile { display: grid !important; } #userName { display: inline !important; }'
      : '#btnSignIn { display: inline-flex !important; } #btnProfile, #userName, #btnSignOut { display: none !important; }';
    document.head.appendChild(style);

    const fingerprint = JSON.stringify({
      hasSession: !!parsed.data?.session,
      userId: parsed.data?.session?.user?.id || null,
      profileId: parsed.data?.profile?.id || null,
      fullName: parsed.data?.profile?.full_name || null,
      username: parsed.data?.profile?.username || null,
      avatarUrl: parsed.data?.profile?.avatar_url || null,
      role: parsed.data?.profile?.role || null,
      language: localStorage.getItem("lang") || "en"
    });

    document.documentElement.setAttribute('data-auth-ready', isLoggedIn ? 'logged-in' : 'logged-out');
    document.documentElement.setAttribute('data-auth-fingerprint', fingerprint);

  } catch (e) {
    console.error("Auth preloader failed:", e);
    document.documentElement.setAttribute('data-auth-ready', 'error');
  }
})();