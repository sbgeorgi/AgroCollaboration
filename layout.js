// layout.js
import { $ } from './ui.js';

export function renderLayout(activePage) {
  const app = document.querySelector('body');
  
  // 1. Navigation Data - Added Scholar with beta flag
  const navLinks = [
    { key: 'schedule', href: 'index.html', label: 'nav.schedule', text: 'Schedule' },
    { key: 'archive',  href: 'archive.html', label: 'nav.archive', text: 'Archive' },
    // NEW SCHOLAR LINK WITH BETA FLAG
    { key: 'scholar',  href: 'scholar.html', label: 'nav.scholar', text: 'Scholar', beta: true }, 
    { key: 'network',  href: 'network.html', label: 'nav.network', text: 'Network' },
    { key: 'map',      href: 'map.html',     label: 'nav.map', text: 'Map' },
    { 
      key: 'about_group', 
      label: 'nav.about', 
      text: 'About',
      children: [
        { key: 'about', href: 'about.html', label: 'nav.about_us', text: 'About Us' },
        { key: 'committee', href: 'committee.html', label: 'nav.committee', text: 'Steering Committee' },
        { key: 'organizations', href: 'organizations.html', label: 'nav.orgs', text: 'Organizations' }
      ]
    },
  ];

  // Helper for Beta Badge
  const getBadge = (isBeta) => isBeta 
    ? `<span style="font-size: 0.55rem; padding: 2px 5px; border-radius: 99px; background: #dbeafe; color: #1e40af; margin-left: 6px; vertical-align: middle; font-weight: 800; letter-spacing: 0.05em; transform: translateY(-1px); display: inline-block;">BETA</span>` 
    : '';

  // 2. DESKTOP NAV HTML
  const navItemsHtml = navLinks.map(link => {
    const isParentActive = link.children?.some(child => child.key === activePage);
    const isActive = link.key === activePage || isParentActive;
    
    const baseClass = "link"; 
    const activeClass = isActive ? " active" : "";

    if (link.children) {
      const dropdownItems = link.children.map(child => {
        const isChildActive = child.key === activePage;
        const childStyle = isChildActive 
          ? "background: var(--color-brand-light); color: var(--color-brand-dark); font-weight: 600;" 
          : "color: var(--text-secondary);";
          
        return `
          <a href="${child.href}" 
             class="block px-4 py-2 text-sm hover:bg-slate-50 transition-colors" 
             style="${childStyle}"
             data-i18n="${child.label}">
            ${child.text}
          </a>`;
      }).join('');

      // HOTFIX APPLIED BELOW:
      // 1. Changed 'mt-2' to 'pt-2' on the outer div (Creates invisible bridge)
      // 2. Removed visual classes (bg-white, shadow, border, etc) from outer div
      // 3. Added a new inner div to hold those visual classes
      return `
        <div class="relative group z-50" style="display:flex; align-items:center;">
          <button class="${baseClass}${activeClass} flex items-center gap-1 cursor-pointer" style="background:none; border:none; padding:4px 0; font-family:inherit;" aria-expanded="false">
            <span data-i18n="${link.label}">${link.text}</span>
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="transition-transform group-hover:rotate-180 ml-1"><path d="m6 9 6 6 6-6"/></svg>
          </button>
          
          <div class="absolute left-0 pt-2 w-48 opacity-0 invisible translate-y-2 group-hover:opacity-100 group-hover:visible group-hover:translate-y-0 transition-all duration-200 ease-out origin-top-left pointer-events-none group-hover:pointer-events-auto" style="top: 100%;">
            <div class="bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden">
              <div class="py-1">
                ${dropdownItems}
              </div>
            </div>
          </div>
        </div>
      `;
    } else {
      // ADDED: Badge injection
      return `<a href="${link.href}" class="${baseClass}${activeClass}" style="display:flex; align-items:center;">
        <span data-i18n="${link.label}">${link.text}</span>
        ${getBadge(link.beta)}
      </a>`;
    }
  }).join('');

  // 3. MOBILE NAV LINKS HTML
  const mobileNavHtml = navLinks.map(link => {
    
    const createMobileLink = (key, href, label, text, isSubItem = false, isBeta = false) => {
      const isActive = key === activePage;
      const activeClass = isActive ? " active" : "";
      
      const subItemStyle = isSubItem 
        ? "font-size: 1rem; padding-left: 32px; opacity: 0.9; background: transparent;" 
        : "";
      
      // ADDED: Badge injection for mobile
      return `
        <a href="${href}" 
           class="link${activeClass}" 
           style="${subItemStyle}; display:flex; align-items:center;"
           data-i18n="${label}">
          <span>${text}</span>
          ${getBadge(isBeta)}
        </a>`;
    };

    if (link.children && Array.isArray(link.children)) {
      const groupLabel = `
        <div style="width: 100%; text-align: left; padding: 16px 16px 8px; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-tertiary); font-weight: 700;">
          ${link.text}
        </div>
      `;
      const childrenHtml = link.children.map(child => {
        return createMobileLink(child.key, child.href, child.label, child.text, true);
      }).join('');
      return groupLabel + childrenHtml;
    }
    
    return createMobileLink(link.key, link.href, link.label, link.text, false, link.beta);
  }).join('');

  // 4. HEADER TEMPLATE (unchanged context, just variables)
  const headerHTML = `
  <header class="site-header">
    <div class="container header-grid">
      <a href="index.html" class="brand group">
        <img src="static/icon.png" alt="Logo" class="logo-image">
        <div class="brand-text">
          <div class="title">Agrovoltaicos sin Fronteras</div>
          <div class="subtitle" data-i18n="header.subtitle">Community-Driven Agrivoltaics in the Americas</div>
        </div>
      </a>
      
      <button id="mobileMenuBtn" class="mobile-menu-btn" aria-label="Open menu">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
      </button>

      <nav class="nav">
        ${navItemsHtml}
        
        <div class="divider"></div>
        <a href="admin.html" id="btnAdmin" class="link" style="color: var(--color-danger); display: none;" data-i18n="nav.admin">Admin</a>
        <div id="langSwitchDesktop" class="lang-switch-slider" data-lang="en"><span>EN</span><span>ES</span></div>
        
        <div class="auth-area">
          <button id="btnProfile" class="profile-button" style="display: none" aria-label="Profile">
            <span id="userInitial"></span>
            <img id="userAvatar" style="display: none; width: 100%; height: 100%; object-fit: cover;" alt="Avatar" />
          </button>
          <span id="userName" style="display: none; font-weight: 600; font-size: 0.9rem; cursor: pointer;"></span>
          <a href="signin.html" id="btnSignIn" class="btn-primary" style="text-decoration: none; padding: 8px 16px; font-size: 0.9rem;" data-i18n="auth.signin">Sign in</a>
          <button id="btnSignOut" class="btn-ghost" style="display: none" data-i18n="auth.signout">Sign out</button>
        </div>
      </nav>
    </div>
  </header>
  
  <div id="mobileNavOverlay" class="mobile-nav-overlay">
    <div id="mobileNavPanel" class="mobile-nav-content">
      <button id="mobileMenuClose" class="mobile-nav-close-btn" aria-label="Close menu">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
      <div style="flex: 1; overflow-y: auto; width: 100%; padding-top: 60px;">
        <nav>${mobileNavHtml}</nav>
      </div>
      <div style="padding: 24px; border-top: 1px solid var(--border); background: rgba(255,255,255,0.5); display: flex; flex-direction: column; gap: 16px;">
        <a href="admin.html" id="btnAdminMobile" class="link" style="color: var(--color-danger); display: none; text-align: center; justify-content: center;" data-i18n="nav.admin">Admin</a>
        <div style="display: flex; justify-content: center;"><div id="langSwitchMobile" class="lang-switch-slider" data-lang="en"><span>EN</span><span>ES</span></div></div>
        <div id="mobileAuthContainer" class="auth-area" style="flex-direction: column; gap: 12px; width: 100%;">
          <div id="mobileProfileContainer" style="display: none; flex-direction: column; align-items: center; gap: 8px;">
            <button id="mobileProfileBtn" class="profile-button"><span id="mobileUserInitial"></span><img id="mobileUserAvatar" style="display: none; width: 100%; height: 100%; object-fit: cover;" /></button>
            <span id="mobileUserName" style="font-weight: 700; color: var(--text-primary); cursor: pointer;"></span>
          </div>
          <a href="signin.html" id="mobileSignIn" class="btn btn-primary" style="width: 100%; text-decoration: none;" data-i18n="auth.signin">Sign in</a>
          <button id="mobileSignOut" class="btn btn-secondary" style="width: 100%; display: none;" data-i18n="auth.signout">Sign out</button>
        </div>
      </div>
    </div>
  </div>`;

  // 5. FOOTER TEMPLATE (Unchanged)
  const footerHTML = `
  <footer class="site-footer" style="padding: 12px 0; border-top: 1px solid var(--border); margin-top: auto;">
    <div class="container" style="display: flex; align-items: center; justify-content: space-between;">
      <div class="footer-text" style="margin: 0; font-size: 0.8rem; line-height: 1; white-space: nowrap; color: var(--text-tertiary);">
        &copy; <span id="year">${new Date().getFullYear()}</span> Agrovoltaicos sin Fronteras •&nbsp;
        <span data-i18n="footer.note">Bilingual, community-driven seminar.</span>
      </div>
      <div class="footer-logos" style="display: flex; gap: 1rem; align-items: center; margin: 0;">
          <a href="https://biosphere2.org" target="_blank" style="display: flex; align-items: center;"><img src="static/b2ua.jpg" alt="Biosphere 2" style="height: 24px; width: auto; display: block;"></a>
          <a href="https://www.ier.unam.mx" target="_blank" style="display: flex; align-items: center;"><img src="static/unam.png" alt="UNAM" style="height: 24px; width: auto; display: block;"></a>
          <a href="https://centroenergia.cl" target="_blank" style="display: flex; align-items: center;"><img src="static/aal.png" alt="AAL" style="height: 24px; width: auto; display: block;"></a>
          <a href="https://redagvmx.com" target="_blank" style="display: flex; align-items: center;"><img src="static/rame.png" alt="RAME" style="height: 24px; width: auto; display: block;"></a>
      </div>
    </div>
  </footer>`;

  app.insertAdjacentHTML('afterbegin', headerHTML);
  app.insertAdjacentHTML('beforeend', footerHTML);
  initMobileMenu();
}

function initMobileMenu() {
  const mobileMenuBtn = $('#mobileMenuBtn');
  const mobileMenuClose = $('#mobileMenuClose');
  const mobileNavOverlay = $('#mobileNavOverlay');
  if (!mobileMenuBtn || !mobileNavOverlay) return;
  const openMenu = () => { mobileNavOverlay.classList.add('is-open'); document.body.style.overflow = 'hidden'; };
  const closeMenu = () => { mobileNavOverlay.classList.remove('is-open'); document.body.style.overflow = ''; };
  mobileMenuBtn.addEventListener('click', openMenu);
  if (mobileMenuClose) mobileMenuClose.addEventListener('click', closeMenu);
  mobileNavOverlay.addEventListener('click', (e) => { if (e.target === mobileNavOverlay) closeMenu(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && mobileNavOverlay.classList.contains('is-open')) closeMenu(); });
  const langSwitchMobile = $('#langSwitchMobile');
  const langSwitchDesktop = $('#langSwitchDesktop');
  if (langSwitchMobile && langSwitchDesktop) {
    langSwitchMobile.addEventListener('click', () => { langSwitchDesktop.click(); const isES = langSwitchDesktop.getAttribute('data-lang') === 'es'; langSwitchMobile.setAttribute('data-lang', isES ? 'en' : 'es'); });
    const langObserver = new MutationObserver(() => { langSwitchMobile.setAttribute('data-lang', langSwitchDesktop.getAttribute('data-lang')); });
    langObserver.observe(langSwitchDesktop, { attributes: true, attributeFilter: ['data-lang'] });
  }
  const syncMobileAuth = () => {
    const dSignIn = $('#btnSignIn'), dSignOut = $('#btnSignOut'), dProfileBtn = $('#btnProfile'), dAvatar = $('#userAvatar'), dInitial = $('#userInitial'), dName = $('#userName'), dAdmin = $('#btnAdmin');
    const mSignIn = $('#mobileSignIn'), mSignOut = $('#mobileSignOut'), mProfileContainer = $('#mobileProfileContainer'), mAvatar = $('#mobileUserAvatar'), mInitial = $('#mobileUserInitial'), mName = $('#mobileUserName'), mAdmin = $('#btnAdminMobile');
    if (dSignIn && mSignIn) mSignIn.style.display = dSignIn.style.display;
    if (dSignOut && mSignOut) mSignOut.style.display = dSignOut.style.display;
    const isProfileVisible = dProfileBtn && dProfileBtn.style.display !== 'none';
    if (mProfileContainer) mProfileContainer.style.display = isProfileVisible ? 'flex' : 'none';
    if (isProfileVisible) {
      if (dAvatar && mAvatar) { mAvatar.src = dAvatar.src; mAvatar.style.display = dAvatar.style.display; }
      if (dInitial && mInitial) { mInitial.textContent = dInitial.textContent; }
      if (dName && mName) { mName.textContent = dName.textContent; }
    }
    if (dAdmin && mAdmin) { const isAdminVisible = dAdmin.style.display !== 'none'; mAdmin.style.display = isAdminVisible ? 'flex' : 'none'; }
  };
  const mSignOut = $('#mobileSignOut'), dSignOut = $('#btnSignOut');
  if (mSignOut && dSignOut) mSignOut.addEventListener('click', () => { dSignOut.click(); closeMenu(); });
  const observer = new MutationObserver(syncMobileAuth);
  const observeTarget = (id) => { const el = document.getElementById(id); if (el) observer.observe(el, { attributes: true, childList: true, subtree: true, characterData: true }); };
  ['btnSignIn', 'btnSignOut', 'btnProfile', 'userAvatar', 'userInitial', 'userName', 'btnAdmin'].forEach(observeTarget);
  setTimeout(syncMobileAuth, 50);
}