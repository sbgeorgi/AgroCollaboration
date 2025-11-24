// C:\HELLOWORLD\AgroCollaboration\auth-preloader.js
/**
 * CRITICAL PRE-RENDER SCRIPT
 * Checks 'asf_auth_cache' and injects strict CSS to control visibility of 
 * header elements before the main app loads.
 */
(function () {
  try {
    const cached = localStorage.getItem('asf_auth_cache');
    let isLoggedIn = false;
    let profileData = null;

    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        // Check expiry
        if (parsed.expiry && Date.now() < parsed.expiry && parsed.data?.session) {
          isLoggedIn = true;
          profileData = parsed.data.profile;
        } else {
          localStorage.removeItem('asf_auth_cache');
        }
      } catch (e) {
        localStorage.removeItem('asf_auth_cache');
      }
    }

    // Create Style Tag
    const style = document.createElement('style');
    style.id = 'auth-preload-style';

    if (isLoggedIn) {
      // User is LOGGED IN: Hide Sign In, Show Profile/SignOut
      // Note: We use !important to override the inline 'display: none' set by layout.js
      style.textContent = `
        #btnSignIn { display: none !important; }
        #btnProfile { display: inline-flex !important; }
        #userName { display: inline !important; }
        #btnSignOut { display: inline-block !important; }
        #btnAdmin { display: ${profileData?.role === 'admin' || profileData?.role === 'organizer' ? 'inline-block' : 'none'} !important; }
      `;
    } else {
      // User is LOGGED OUT: Show Sign In, Hide Profile/SignOut
      style.textContent = `
        #btnSignIn { display: inline-flex !important; }
        #btnProfile { display: none !important; }
        #userName { display: none !important; }
        #btnSignOut { display: none !important; }
        #btnAdmin { display: none !important; }
      `;
    }
    
    document.head.appendChild(style);

    // Set attributes for debugging or CSS usage
    document.documentElement.setAttribute('data-auth-ready', isLoggedIn ? 'logged-in' : 'logged-out');
    
    if (isLoggedIn && profileData) {
      const fingerprint = JSON.stringify({
        hasSession: true,
        userId: profileData.id,
        fullName: profileData.full_name,
        avatarUrl: profileData.avatar_url
      });
      document.documentElement.setAttribute('data-auth-fingerprint', fingerprint);
    }

  } catch (e) {
    console.error("Auth preloader failed:", e);
  }
})();