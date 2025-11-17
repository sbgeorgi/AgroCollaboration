// C:\HELLOWORLD\AgroCollaboration\ui.js
/**
 * SHARED UI MODULE
 * Handles shared UI rendering, utilities, and event listeners.
 */

// --- UTILITIES (Exported) ---
export const $ = (sel) => document.querySelector(sel);
export const $$ = (sel) => document.querySelectorAll(sel);

// Updated to handle inline styles properly
export const show = (el) => {
  if (!el) return;
  el.classList.remove('hidden');
  el.style.display = ''; // Clears inline 'display: none' so CSS takes over
};

export const hide = (el) => {
  if (!el) return;
  el.classList.add('hidden');
  el.style.display = 'none'; // Forces inline hide
};

export function tr(t, lang, key, fallback = "") {
  const parts = key.split(".");
  let obj = t[lang];
  for (const p of parts) {
    obj = obj?.[p];
  }
  return obj ?? fallback;
}

export function applyI18n(t, lang) {
  $$("[data-i18n]").forEach((el) => {
    el.textContent = tr(t, lang, el.dataset.i18n, el.textContent);
  });
  $$("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = tr(t, lang, el.dataset.i18nPlaceholder, el.placeholder);
  });
  $$(".lang-switch-slider").forEach(el => el.dataset.lang = lang);
}

export function setFlash(msg, timeout = 3000) {
  const el = $("#flash");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("visible");
  clearTimeout(setFlash._t);
  if (timeout > 0) {
    setFlash._t = setTimeout(() => el.classList.remove("visible"), timeout);
  }
}

export function fmtDateTime(iso, options = { dateStyle: "medium", timeStyle: "short" }) {
  try {
    return new Intl.DateTimeFormat(undefined, options).format(new Date(iso));
  } catch (_) {
    return iso;
  }
}

export function bytesToSize(bytes = 0) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export function escapeHtml(s = "") {
  return String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

export function linkify(text = "") {
  let safe = escapeHtml(text);
  const urlRegex = /\b(https?:\/\/[^\s<]+)\b/g;
  safe = safe.replace(urlRegex, (m) => `<a href="${m}" target="_blank" rel="noopener noreferrer" class="hover:underline">${m}</a>`);
  safe = safe.replace(/\n/g, "<br/>");
  return safe;
}

export async function getAvatarUrl(path) {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  const SUPABASE_URL = "https://iuzgfldgvueuehybgntm.supabase.co";
  return `${SUPABASE_URL}/storage/v1/object/public/avatars/${path}`;
}

// --- SHARED UI LOGIC (Exported) ---
let headerState = { lastRenderedFingerprint: null };

export function updateActiveNav() {
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  $$('.nav .link, .mobile-nav-content .link').forEach(link => {
    const linkPage = link.getAttribute('href');
    if (linkPage === currentPage) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });
}

export function toggleMobileMenu(forceState) {
  const overlay = $('#mobileNavOverlay');
  const showMenu = forceState !== undefined ? forceState : !overlay.classList.contains('is-open');
  overlay.classList.toggle('is-open', showMenu);
}

export function switchTab(tabName, clickedBtn) {
  $$('.tab-panel').forEach(el => hide(el));
  show($('#tab_' + tabName));
  $$('.tab-link').forEach(btn => {
    btn.classList.remove('text-brand-700', 'border-brand-500');
    btn.classList.add('text-slate-400', 'border-transparent');
  });
  clickedBtn.classList.remove('text-slate-400', 'border-transparent');
  clickedBtn.classList.add('text-brand-700', 'border-brand-500');
}

export async function renderHeader(authState, t, lang) {
  const fingerprint = JSON.stringify({
    hasSession: !!authState.session,
    userId: authState.session?.user?.id || null,
    profileId: authState.profile?.id || null,
    fullName: authState.profile?.full_name || null,
    avatarUrl: authState.profile?.avatar_url || null,
    role: authState.profile?.role || null,
    language: lang
  });

  const preloadFingerprint = document.documentElement.getAttribute('data-auth-fingerprint');
  if (preloadFingerprint === fingerprint && headerState.lastRenderedFingerprint === null) {
    headerState.lastRenderedFingerprint = fingerprint;
    document.getElementById('auth-preload-style')?.remove();
    document.documentElement.removeAttribute('data-auth-fingerprint');
    applyI18n(t, lang);
    updateActiveNav();
    return;
  }
  if (headerState.lastRenderedFingerprint === fingerprint) return;
  headerState.lastRenderedFingerprint = fingerprint;

  const btnProfile = $('#btnProfile'), userInitial = $('#userInitial'), userAvatar = $('#userAvatar'), userName = $('#userName'), btnSignIn = $('#btnSignIn'), btnSignOut = $('#btnSignOut'), btnAdmin = $('#btnAdmin');
  const mobileNavContent = $('.mobile-nav-content');
  const isOrganizer = ["organizer", "admin"].includes(authState.profile?.role);

  if (authState.session && authState.profile) {
    show(btnProfile); show(btnSignOut); show(userName); hide(btnSignIn);
    
    userName.textContent = authState.profile.full_name || authState.profile.username || '';
    
    const avatarPath = authState.profile.avatar_url;
    const avatarUrl = avatarPath ? await getAvatarUrl(avatarPath) : null;
    
    if (avatarUrl) {
      userAvatar.src = avatarUrl; 
      show(userAvatar); 
      hide(userInitial);
    } else {
      userInitial.textContent = (authState.profile.full_name || "U").charAt(0).toUpperCase();
      hide(userAvatar); 
      show(userInitial);
    }
    
    if (isOrganizer) show(btnAdmin); else hide(btnAdmin);
  } else {
    hide(btnProfile); hide(btnSignOut); hide(userName); show(btnSignIn);
    hide(btnAdmin);
  }

  if (mobileNavContent) {
    const avatarPath = authState.profile?.avatar_url;
    const avatarUrl = avatarPath ? await getAvatarUrl(avatarPath) : null;
    const initial = (authState.profile?.full_name || "U").charAt(0).toUpperCase();
    
    mobileNavContent.innerHTML = `
      <button id="mobileNavCloseBtn" class="mobile-nav-close-btn" aria-label="Close menu">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
      <nav>
          <div id="langSwitchMobile" class="lang-switch-slider" data-lang="${lang}"><span>EN</span><span>ES</span></div>
          <a href="index.html" class="link" data-i18n="nav.schedule"></a>
          <a href="archive.html" class="link" data-i18n="nav.archive"></a>
          <a href="about.html" class="link" data-i18n="nav.about"></a>
          <a href="network.html" class="link" data-i18n="nav.network"></a>
          ${isOrganizer ? `<a href="admin.html" class="link" data-i18n="nav.admin"></a>` : ''}
          <div class="auth-area">
              ${authState.session && authState.profile ? `
                  <button class="profile-button" onclick="window.location.href='profile.html'">
                      ${avatarUrl ? `<img src="${avatarUrl}" style="width: 100%; height: 100%; object-fit: cover;" alt="User Avatar" />` : `<span>${initial}</span>`}
                  </button>
                  <span id="userNameMobile">${escapeHtml(authState.profile.full_name || "")}</span>
                  <button id="btnSignOutMobile" class="btn btn-secondary"><span data-i18n="auth.signout"></span></button>
              ` : `
                  <a href="signin.html" id="btnSignInMobile" class="btn btn-primary"><span data-i18n="auth.signin"></span></a>
              `}
          </div>
      </nav>
    `;
  }
  document.getElementById('auth-preload-style')?.remove();
  applyI18n(t, lang);
  updateActiveNav();
}

export function initSharedUI({ onLangSwitch, onSignOut }) {
  $('#mobileMenuBtn')?.addEventListener('click', () => toggleMobileMenu(true));
  
  document.body.addEventListener('click', e => {
    if (e.target.closest('#langSwitchDesktop') || e.target.closest('#langSwitchMobile')) {
        if(onLangSwitch) onLangSwitch();
    }
    if (e.target.id === 'mobileNavOverlay' || e.target.closest('#mobileNavCloseBtn')) {
        toggleMobileMenu(false);
    }
    if (e.target.closest("#btnSignOut") || e.target.closest("#btnSignOutMobile")) {
      if(onSignOut) onSignOut();
    }
    const mobileProfileButton = e.target.closest('.mobile-nav-content .profile-button');
    if (mobileProfileButton) {
      window.location.href = 'profile.html';
    }
  });

  const yearEl = $("#year");
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }
}