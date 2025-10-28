import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* ================== CONFIG ================== */
const SUPABASE_URL = "https://iuzgfldgvueuehybgntm.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1emdmbGRndnVldWVoeWJnbnRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY4Mjc0MjUsImV4cCI6MjA3MjQwMzQyNX0.do919Hvw2AK-Ql-2V5guoRRH2yx4Rmset4eeVXi__o8";
// MODIFIED: This is now the DEFAULT redirect, but can be overridden.
const DEFAULT_REDIRECT_TO = window.location.origin + window.location.pathname;
/* ============================================ */

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export const authState = {
  session: null,
  profile: null,
  profileComplete: false,
  profileCache: new Map(),
  pendingDeepLinkEventId: null,
};

// Export fetchProfile so it can be imported in other files
export async function fetchProfile(userId, { refresh = false } = {}) {
    if (!userId) return null;
    if (!refresh && authState.profileCache.has(userId)) return authState.profileCache.get(userId);
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).single();
    
    // If profile has avatar_url, get the signed URL
    if (data?.avatar_url) {
        const { data: urlData } = await supabase.storage.from("avatars").createSignedUrl(data.avatar_url, 3600);
        if (urlData?.signedUrl) {
            data.avatar_url = urlData.signedUrl;
        }
    }
    
    if (data) authState.profileCache.set(userId, data);
    return data;
}

export async function ensureProfile() {
  const uid = authState.session?.user?.id;
  if (!uid) return;
  
  let profile = await fetchProfile(uid);

  if (!profile) {
    const { data: newProfile, error: insertErr } = await supabase
      .from("profiles")
      .insert({ 
        id: uid, 
        work_email: authState.session.user.email, 
        username: (authState.session.user.email || "").split("@")[0].replace(/[^a-zA-Z0-9_-]/g, "") 
      })
      .select()
      .single();
    if (insertErr) console.error("Profile insert error:", insertErr);
    profile = newProfile;
    if (profile) authState.profileCache.set(uid, profile);
  }
  
  authState.profile = profile;
  authState.profileComplete = !!(
    profile?.full_name &&
    profile?.username &&
    profile?.affiliation &&
    profile?.work_email
  );

  if (sessionStorage.getItem('justLoggedIn') && !authState.profileComplete) {
    sessionStorage.removeItem('justLoggedIn');
    const returnTo = window.location.href.includes('signin.html') ? window.location.origin + '/index.html' : window.location.href;
    window.location.href = `profile.html?force=true&return_to=${encodeURIComponent(returnTo)}`;
  }
}

export async function renderHeader() {
  const $ = (sel) => document.querySelector(sel);
  const btnSignIn = $("#btnSignIn"), 
        btnSignOut = $("#btnSignOut"), 
        btnAdmin = $("#btnAdmin"), 
        userName = $("#userName"), 
        btnProfile = $("#btnProfile"),
        userInitial = $("#userInitial"),
        userAvatar = $("#userAvatar");
        
  if (authState.session && authState.profile) {
    btnSignIn.style.display = "none"; 
    btnSignOut.style.display = "inline-block";
    btnProfile.style.display = "grid"; 
    userName.style.display = "inline";
    userName.textContent = authState.profile?.full_name || authState.profile?.username || "";
    
    // Handle avatar in header button
    if (authState.profile?.avatar_url && userAvatar) {
      userAvatar.src = authState.profile.avatar_url;
      userAvatar.style.display = "block";
      if (userInitial) userInitial.style.display = "none";
    } else {
      if (userAvatar) userAvatar.style.display = "none";
      if (userInitial) {
        userInitial.style.display = "block";
        userInitial.textContent = (authState.profile?.full_name || "U").charAt(0).toUpperCase();
      }
    }
    
    if (btnAdmin) btnAdmin.style.display = authState.profile?.role === "admin" ? "inline-block" : "none";
  } else {
    btnSignIn.style.display = "inline-block"; 
    btnSignOut.style.display = "none";
    btnProfile.style.display = "none"; 
    userName.style.display = "none";
    if (btnAdmin) btnAdmin.style.display = "none";
  }
}

export function renderAuthUI() {
  const $ = (sel) => document.querySelector(sel);
  const showAuthCard = !authState.session && $("#schedule").style.display !== 'none';
  $("#auth").style.display = showAuthCard ? "block" : "none";
}

export async function initAuth(callbacks = {}) {
  // Get current session
  const { data: { session } } = await supabase.auth.getSession();
  authState.session = session;
  if (session) {
    await ensureProfile();
  }
  renderHeader();
  
  const urlParams = new URLSearchParams(window.location.search);
  const viewUserId = urlParams.get('user');

  // Execute view callback if provided
  if (callbacks.onAuthReady) {
    callbacks.onAuthReady(authState, viewUserId);
  }
  
  // Listen for auth changes
  supabase.auth.onAuthStateChange(async (_event, newSession) => {
    // IMPROVED: More robust check for a new sign-in vs. a token refresh
    const isInitialSignIn = !authState.session && newSession;
    authState.session = newSession;

    if (newSession) {
      if (isInitialSignIn) {
        sessionStorage.setItem('justLoggedIn', 'true');
      }
      await ensureProfile();
    } else {
      authState.profile = null;
      sessionStorage.removeItem('justLoggedIn');
    }
    renderHeader();
    
    // Execute change callback if provided
    if (callbacks.onAuthChange) {
      callbacks.onAuthChange(authState, viewUserId);
    }
  });
}

// MODIFIED: Function now accepts an options object to override the redirect
export async function signInWithGoogle(options = {}) {
  await supabase.auth.signInWithOAuth({ 
    provider: "google", 
    options: { 
      redirectTo: DEFAULT_REDIRECT_TO, // Use default...
      ...options                      // ...unless overridden by options
    } 
  });
}

// MODIFIED: Function now accepts an options object to override the redirect
export async function signInWithEmail(email, options = {}) {
  if (email) {
    const { error } = await supabase.auth.signInWithOtp({ 
      email, 
      options: { 
        emailRedirectTo: DEFAULT_REDIRECT_TO, // Use default...
        ...options                           // ...unless overridden by options
      } 
    });
    if (error) return error.message;
    return "We'll email you a sign-in link. Check your inbox.";
  }
}

export async function signOut() {
  await supabase.auth.signOut();
}

/**
 * Initializes all shared UI components and their event listeners.
 * This should be called on every page.
 * @param {object} i18n - An object containing i18n functions { applyI18n, handleLangSwitch }
 */
export function initSharedUI(i18n) {
  const { applyI18n, handleLangSwitch } = i18n;

  // --- Mobile Menu Logic ---
  const mobileNavOverlay = document.querySelector("#mobileNavOverlay");
  const mobileMenuBtn = document.querySelector("#mobileMenuBtn");

  function openMenu() {
    if (!mobileNavOverlay || !mobileMenuBtn) return;
    mobileNavOverlay.classList.add("is-open");
    document.body.classList.add("menu-open");
    mobileMenuBtn.setAttribute("aria-expanded", "true");
    mobileMenuBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
  }

  function closeMenu() {
    if (!mobileNavOverlay || !mobileMenuBtn) return;
    mobileNavOverlay.classList.remove("is-open");
    document.body.classList.remove("menu-open");
    mobileMenuBtn.setAttribute("aria-expanded", "false");
    mobileMenuBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>`;
  }

  function setupMobileMenu() {
    const desktopNav = document.querySelector('.header-grid .nav');
    if (!mobileNavOverlay || !desktopNav) return;

    mobileNavOverlay.innerHTML = ''; // Clear previous content
    const closeBtn = document.createElement('button');
    closeBtn.className = 'mobile-nav-close-btn';
    closeBtn.setAttribute('aria-label', 'Close menu');
    closeBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    
    const content = desktopNav.cloneNode(true);
    content.id = ''; // Avoid duplicate IDs
    
    mobileNavOverlay.appendChild(closeBtn);
    mobileNavOverlay.appendChild(content);

    closeBtn.addEventListener('click', closeMenu);
  }

  // --- Wire up all event listeners ---
  
  // Mobile Menu Toggle
  mobileMenuBtn?.addEventListener("click", () => {
    if (mobileNavOverlay && !mobileNavOverlay.classList.contains('is-open')) openMenu();
    else closeMenu();
  });

  // Universal event listener on body for dynamic elements (mobile nav, language switch)
  document.body.addEventListener('click', (e) => {
    // Language Switcher (works for desktop and mobile)
    if (e.target.closest('.lang-switch-slider')) {
      handleLangSwitch();
      setupMobileMenu(); // Re-render mobile menu to update link text
      renderHeader(); // Re-render header to update auth button text
    }

    // Profile button (works for desktop and mobile)
    if (e.target.closest("#btnProfile")) {
      window.location.href = 'profile.html';
    }

    // Sign Out button (works for desktop and mobile)
    if (e.target.closest("#btnSignOut")) {
      signOut();
    }
    
    // Sign In button (works for desktop and mobile)
    if (e.target.closest("#btnSignIn")) {
      window.location.href = 'signin.html';
    }
    
    // Close mobile overlay if clicking outside the content
    if (e.target === mobileNavOverlay) {
      closeMenu();
    }
  });

  // Footer Year
  const yearEl = document.querySelector("#year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();
  
  // Initial setup call
  setupMobileMenu();
}

