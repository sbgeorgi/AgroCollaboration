// C:\HELLOWORLD\AgroCollaboration\auth.js
/**
 * AUTHENTICATION MODULE
 * This module handles all Supabase authentication logic, session management, and
 * profile fetching. It does NOT handle any direct DOM manipulation or UI rendering.
 * It communicates with other parts of the app via callbacks.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* ================== CONFIG ================== */
const SUPABASE_URL = "https://iuzgfldgvueuehybgntm.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1emdmbGRndnVldWVoeWJnbnRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY4Mjc0MjUsImV4cCI6MjA3MjQwMzQyNX0.do919Hvw2AK-Ql-2V5guoRRH2yx4Rmset4eeVXi__o8";
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
  isPasswordRecovery: false,
};

export async function fetchProfile(userId, { refresh = false } = {}) {
  if (!userId) return null;
  if (!refresh && authState.profileCache.has(userId)) return authState.profileCache.get(userId);
  const { data } = await supabase.from("profiles").select("*").eq("id", userId).single();
    
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

  if (!authState.isPasswordRecovery && sessionStorage.getItem('justLoggedIn') && !authState.profileComplete) {
    sessionStorage.removeItem('justLoggedIn');
    const returnTo = window.location.href.includes('signin.html') ? window.location.origin + '/index.html' : window.location.href;
    window.location.href = `profile.html?force=true&return_to=${encodeURIComponent(returnTo)}`;
  }
}

export async function initAuth(callbacks = {}) {
  const hashParams = new URLSearchParams(window.location.hash.substring(1));
  const type = hashParams.get('type');
  const accessToken = hashParams.get('access_token');

  if (type === 'recovery' && accessToken) {
    authState.isPasswordRecovery = true;
  }

  const { data: { session } } = await supabase.auth.getSession();
  authState.session = session;

  if (session && !authState.isPasswordRecovery) {
    await ensureProfile();
  }

  if (callbacks.onAuthReady) {
    callbacks.onAuthReady(authState);
  }

  supabase.auth.onAuthStateChange(async (_event, newSession) => {
    if (_event === 'PASSWORD_RECOVERY') {
      authState.isPasswordRecovery = true;
      authState.session = newSession;
      if (callbacks.onAuthChange) callbacks.onAuthChange(authState);
      return;
    }

    if (authState.isPasswordRecovery && _event === 'SIGNED_IN') {
      authState.isPasswordRecovery = false;
    }

    const isInitialSignIn = !authState.session && newSession && !authState.isPasswordRecovery;
    authState.session = newSession;

    if (newSession && !authState.isPasswordRecovery) {
      if (isInitialSignIn) sessionStorage.setItem('justLoggedIn', 'true');
      await ensureProfile();
    } else if (!newSession) {
      authState.profile = null;
      authState.isPasswordRecovery = false;
      sessionStorage.removeItem('justLoggedIn');
    }

    if (callbacks.onAuthChange) {
      callbacks.onAuthChange(authState);
    }
  });
}

export async function signInWithGoogle(options = {}) {
  await supabase.auth.signInWithOAuth({ 
    provider: "google", 
    options: { 
      redirectTo: DEFAULT_REDIRECT_TO,
      ...options
    } 
  });
}

export async function signInWithEmail(email, options = {}) {
  if (email) {
    const { error } = await supabase.auth.signInWithOtp({ 
      email, 
      options: { 
        emailRedirectTo: DEFAULT_REDIRECT_TO,
        ...options
      } 
    });
    if (error) return error.message;
    return "We'll email you a sign-in link. Check your inbox.";
  }
}

export async function signOut() {
  await supabase.auth.signOut();
}