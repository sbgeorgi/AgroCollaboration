import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* ================== CONFIG ================== */
const SUPABASE_URL = "https://iuzgfldgvueuehybgntm.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1emdmbGRndnVldWVoeWJnbnRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY4Mjc0MjUsImV4cCI6MjA3MjQwMzQyNX0.do919Hvw2AK-Ql-2V5guoRRH2yx4Rmset4eeVXi__o8";
const REDIRECT_TO = window.location.origin + window.location.pathname;
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

export async function fetchProfile(uid, { refresh = false } = {}) {
  if (!uid) return null;

  const cached = authState.profileCache.get(uid);
  if (!refresh && cached) return cached;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", uid)
    .maybeSingle();

  if (error) {
    console.error(`Error fetching profile for ${uid}:`, error);
    return cached || null;
  }
  if (data) authState.profileCache.set(uid, data);
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
    window.location.href = `profile.html?force=true&return_to=${encodeURIComponent(window.location.href)}`;
  }
}

export function renderHeader() {
  const $ = (sel) => document.querySelector(sel);
  const btnSignIn = $("#btnSignIn"), 
        btnSignOut = $("#btnSignOut"), 
        btnAdmin = $("#btnAdmin"), 
        userName = $("#userName"), 
        btnProfile = $("#btnProfile");
        
  if (authState.session && authState.profile) {
    btnSignIn.style.display = "none"; 
    btnSignOut.style.display = "inline-block";
    btnProfile.style.display = "grid"; 
    userName.style.display = "inline";
    userName.textContent = authState.profile?.full_name || authState.profile?.username || "";
    $("#userInitial").textContent = (authState.profile?.full_name || "U").charAt(0).toUpperCase();
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
    authState.session = newSession;
    if (newSession) {
      await ensureProfile();
    } else {
      authState.profile = null;
    }
    renderHeader();
    
    // Execute change callback if provided
    if (callbacks.onAuthChange) {
      callbacks.onAuthChange(authState, viewUserId);
    }
  });
}

export async function signInWithGoogle() {
  sessionStorage.setItem('justLoggedIn', 'true');
  await supabase.auth.signInWithOAuth({ 
    provider: "google", 
    options: { redirectTo: REDIRECT_TO } 
  });
}

export async function signInWithEmail(email, tr) {
  if (email) {
    sessionStorage.setItem('justLoggedIn', 'true');
    await supabase.auth.signInWithOtp({ 
      email, 
      options: { emailRedirectTo: REDIRECT_TO } 
    });
    return tr ? tr("auth.magic_hint") : "We'll email you a sign-in link. Check your inbox.";
  }
}

export async function signOut() {
  await supabase.auth.signOut();
}