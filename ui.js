// C:\HELLOWORLD\AgroCollaboration\ui.js
/**
 * SHARED UI MODULE
 * Handles shared UI rendering, utilities, and event listeners.
 */

// --- UTILITIES (Exported) ---
export const $ = (sel) => document.querySelector(sel);
export const $$ = (sel) => document.querySelectorAll(sel);

export const show = (el) => {
  if (!el) return;
  el.classList.remove('hidden');
  el.style.display = ''; 
};

export const hide = (el) => {
  if (!el) return;
  el.classList.add('hidden');
  el.style.display = 'none'; 
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
  if (!overlay) return;
  
  const showMenu = forceState !== undefined ? forceState : !overlay.classList.contains('is-open');
  
  if (showMenu) {
    overlay.classList.remove('hidden'); 
    requestAnimationFrame(() => {
        overlay.classList.add('is-open');
    });
  } else {
    overlay.classList.remove('is-open');
  }
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
    
    // Updated structure for better vertical spacing and fallback text
    mobileNavContent.innerHTML = `
      <button id="mobileNavCloseBtn" class="mobile-nav-close-btn" aria-label="Close menu">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
      
      <nav class="flex flex-col h-full w-full">
          <!-- Main Links Container: Centered vertically in available space -->
          <div class="flex-1 flex flex-col justify-center w-full gap-2 py-4">
              <a href="index.html" class="link" data-i18n="nav.schedule">Schedule</a>
              <a href="archive.html" class="link" data-i18n="nav.archive">Archive</a>
              <a href="about.html" class="link" data-i18n="nav.about">About</a>
              <a href="network.html" class="link" data-i18n="nav.network">Network</a>
              <a href="map.html" class="link" data-i18n="nav.map">Map</a>
              ${isOrganizer ? `<a href="admin.html" class="link text-red-600" data-i18n="nav.admin">Admin</a>` : ''}
          </div>

          <!-- Auth & Footer Section -->
          <div class="auth-area flex flex-col items-center w-full border-t border-gray-100 pt-6 pb-8">
              <div id="langSwitchMobile" class="lang-switch-slider mb-6" data-lang="${lang}"><span>EN</span><span>ES</span></div>
              
              ${authState.session && authState.profile ? `
                  <button class="profile-button mb-3" onclick="window.location.href='profile.html'">
                      ${avatarUrl ? `<img src="${avatarUrl}" class="w-full h-full object-cover" alt="User Avatar" />` : `<span>${initial}</span>`}
                  </button>
                  <span id="userNameMobile" class="font-bold text-slate-700 text-lg mb-4">${escapeHtml(authState.profile.full_name || "")}</span>
                  <button id="btnSignOutMobile" class="px-6 py-2 rounded-full border border-gray-200 text-slate-500 font-bold text-sm hover:bg-gray-50 transition-colors w-full max-w-[200px]"><span data-i18n="auth.signout">Sign out</span></button>
              ` : `
                  <a href="signin.html" id="btnSignInMobile" class="btn btn-primary w-full max-w-[240px] justify-center"><span data-i18n="auth.signin">Sign in</span></a>
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
  const mobileBtn = $('#mobileMenuBtn');
  if (mobileBtn) {
    mobileBtn.addEventListener('click', () => toggleMobileMenu(true));
  }
  
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

// ADD TO ui.js
export function showProfileGateModal(lang = 'en') {
    const existing = document.getElementById('profileGateModal');
    if (existing) existing.remove();

    const tModal = {
        en: {
            title: "Action Required",
            desc: "Please quickly fill out your mandatory profile fields (marked with an asterisk *) to access the interactive map and member network.",
            btn: "Complete Profile Now"
        },
        es: {
            title: "Acción Requerida",
            desc: "Por favor completa rápidamente los campos obligatorios de tu perfil (marcados con un asterisco *) para acceder al mapa interactivo y la red de miembros.",
            btn: "Completar Perfil Ahora"
        }
    };
    const l = tModal[lang] || tModal.en;

    // Changed z-[9999] to z-[40] so it sits under the main header
    const modalHtml = `
        <div id="profileGateModal" class="fixed inset-0 z-[40] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 opacity-0 transition-opacity duration-500">
            <div class="bg-white rounded-[24px] shadow-2xl max-w-md w-full p-8 text-center transform scale-95 transition-transform duration-500 relative overflow-hidden ring-1 ring-slate-900/5 mt-16">
                <div class="absolute top-0 left-0 w-full h-1.5 bg-amber-400"></div>
                <div class="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-5 border border-amber-100 shadow-sm">
                    <svg class="w-8 h-8 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                </div>
                <h3 class="text-[22px] font-bold text-slate-900 mb-2 font-display tracking-tight">${l.title}</h3>
                <p class="text-slate-500 mb-8 text-[14.5px] leading-relaxed">${l.desc}</p>
                <button onclick="window.location.href='profile.html?force=true&return_to=' + encodeURIComponent(window.location.href)" class="w-full inline-flex items-center justify-center gap-2 bg-slate-900 hover:bg-black text-white font-semibold py-3.5 px-4 rounded-xl transition-all shadow-lg shadow-slate-900/20 hover:shadow-xl hover:-translate-y-0.5">
                    <span>${l.btn}</span>
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                </button>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    requestAnimationFrame(() => {
        const modal = document.getElementById('profileGateModal');
        if (modal) {
            modal.classList.remove('opacity-0');
            modal.querySelector('div').classList.remove('scale-95');
        }
    });
}

export function showAuthGateModal(lang = 'en', dismissible = true) {
    const existing = document.getElementById('authGateModal');
    if (existing) existing.remove();

    const tModal = {
        en: {
            title: "Member Access Required",
            desc: "Join our community to view full event details, watch recordings, and access the interactive network.",
            btnIn: "Sign In / Register",
            btnLater: "Maybe Later"
        },
        es: {
            title: "Acceso de Miembro Requerido",
            desc: "Únete a nuestra comunidad para ver detalles completos, grabaciones y acceder a la red interactiva.",
            btnIn: "Ingresar / Registrarse",
            btnLater: "Quizás más tarde"
        }
    };
    const l = tModal[lang] || tModal.en;

    // 1. Changed z-[9999] to z-[40]
    // 2. Swapped brand-600 buttons for universal slate-900
    // 3. Swapped brand-50 icon background for universal slate-100
    const modalHtml = `
        <div id="authGateModal" class="fixed inset-0 z-[40] flex items-center justify-center p-4 opacity-0 transition-opacity duration-300" role="dialog" aria-modal="true">
            <!-- Backdrop -->
            <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" ${dismissible ? 'onclick="document.getElementById(\'authGateModal\').remove()"' : ''}></div>

            <!-- Modal Panel -->
            <div class="relative transform overflow-hidden rounded-2xl bg-white p-8 text-center shadow-2xl transition-all max-w-sm w-full border border-gray-100 scale-95 duration-300 mt-16">

                ${dismissible ? `<button onclick="document.getElementById('authGateModal').remove()" class="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors bg-gray-50 hover:bg-gray-100 p-1 rounded-full">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>` : ''}

                <div class="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6 text-slate-600 ring-8 ring-slate-50/50">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-8 h-8">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                    </svg>
                </div>

                <h3 class="text-xl font-display font-bold text-slate-900 mb-2">${l.title}</h3>
                <p class="text-sm text-slate-500 mb-8 leading-relaxed">${l.desc}</p>

                <div class="flex flex-col gap-3 w-full">
                    <a href="signin.html?return_to=${encodeURIComponent(window.location.href)}" class="w-full inline-flex items-center justify-center gap-2 bg-slate-900 hover:bg-black text-white font-semibold py-3.5 px-4 rounded-xl transition-all shadow-lg shadow-slate-900/20 hover:shadow-xl hover:-translate-y-0.5 text-sm">
                        <span>${l.btnIn}</span>
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                    </a>
                    ${dismissible ? `<button onclick="document.getElementById('authGateModal').remove()" class="w-full py-3.5 px-4 bg-white border border-gray-200 text-slate-600 font-bold rounded-xl hover:bg-gray-50 hover:text-slate-800 transition-all text-sm">${l.btnLater}</button>` : ''}
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    requestAnimationFrame(() => {
        const modal = document.getElementById('authGateModal');
        if (modal) {
            modal.classList.remove('opacity-0');
            modal.querySelector('.relative').classList.remove('scale-95');
        }
    });
}