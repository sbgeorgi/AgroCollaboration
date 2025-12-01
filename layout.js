// layout.js
import { $ } from './ui.js';

export function renderLayout(activePage) {
  const app = document.querySelector('body');
  
  // 1. Define the Navigation Links Data
  const navLinks = [
    { key: 'schedule', href: 'index.html', label: 'nav.schedule', text: 'Schedule' },
    { key: 'archive',  href: 'archive.html', label: 'nav.archive', text: 'Archive' },
    { key: 'about',    href: 'about.html',   label: 'nav.about', text: 'About' },
    { key: 'network',  href: 'network.html', label: 'nav.network', text: 'Network' },
    { key: 'map',      href: 'map.html',     label: 'nav.map', text: 'Map' },
  ];

  // 2. Generate Nav HTML based on active page
  const navItemsHtml = navLinks.map(link => {
    const isActive = link.key === activePage;
    // Active style vs Inactive style
    const classes = isActive 
      ? "text-sm font-medium text-brand-700 bg-brand-50 px-3 py-1 rounded-full transition-all"
      : "text-sm font-medium text-slate-500 hover:text-brand-700 hover:bg-brand-50 px-3 py-1 rounded-full transition-all";
    
    return `<a href="${link.href}" class="link ${classes}" data-i18n="${link.label}">${link.text}</a>`;
  }).join('');

  // 3. The Header HTML Template
  const headerHTML = `
  <header class="site-header bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
    <div class="container header-grid">
      <a href="index.html" class="brand group">
        <img src="static/icon.png" alt="Agrovoltaicos sin Fronteras logo" class="logo-image">
        <div class="brand-text">
          <div class="title font-display font-bold text-slate-900 group-hover:text-brand-700 transition-colors">Agrovoltaicos sin Fronteras</div>
        </div>
      </a>
      
      <button id="mobileMenuBtn" class="mobile-menu-btn text-slate-600 hover:bg-gray-100 rounded-lg p-2" aria-label="Open menu">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
      </button>

      <nav class="nav">
        ${navItemsHtml}
        <a href="admin.html" id="btnAdmin" class="link text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 px-3 py-1 rounded-full transition-all" data-i18n="nav.admin" style="display: none;">Admin</a>
        
        <div class="divider border-r border-gray-200 h-6 mx-2"></div>
        
        <div id="langSwitchDesktop" class="lang-switch-slider border border-gray-200 bg-gray-50 hover:border-brand-300 cursor-pointer rounded-full">
          <span class="text-[10px] font-bold text-slate-500">EN</span>
          <span class="text-[10px] font-bold text-slate-500">ES</span>
        </div>
        
        <div class="auth-area flex items-center gap-3">
          <button id="btnProfile" class="profile-button w-9 h-9 rounded-full bg-brand-500 text-white shadow-sm ring-2 ring-white hover:ring-brand-200 transition-all" style="display: none" aria-label="Open profile">
            <span id="userInitial" class="font-bold text-xs"></span>
            <img id="userAvatar" class="rounded-full" style="display: none; width: 100%; height: 100%; object-fit: cover;" alt="User Avatar" />
          </button>
          <span id="userName" class="text-sm font-bold text-slate-700 hover:text-brand-600 cursor-pointer" style="display: none;"></span>
          <a href="signin.html" id="btnSignIn" class="text-sm font-bold text-slate-700 hover:text-brand-600 transition-colors" data-i18n="auth.signin">Sign in</a>
          <button id="btnSignOut" class="btn-ghost text-xs font-medium text-slate-400 hover:text-red-600 transition-colors" data-i18n="auth.signout" style="display: none">Sign out</button>
        </div>
      </nav>
    </div>
  </header>
  
  <!-- Mobile Overlay -->
  <div id="mobileNavOverlay" class="mobile-nav-overlay fixed inset-0 z-[60] bg-slate-900/20 backdrop-blur-sm hidden opacity-0 transition-opacity duration-300">
    <div class="mobile-nav-content absolute right-0 top-0 bottom-0 w-72 bg-white shadow-2xl transform translate-x-full transition-transform duration-300 flex flex-col p-4"></div>
  </div>
  `;

  // 4. The Footer HTML Template
  const footerHTML = `
  <footer class="site-footer bg-white border-t border-gray-200 py-4 mt-auto z-10 text-[10px] text-slate-400">
    <div class="container mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4">
      <div class="footer-text text-center md:text-left">
        &copy; <span id="year">${new Date().getFullYear()}</span> Agrovoltaicos sin Fronteras •&nbsp;
        <span data-i18n="footer.note">Bilingual, community-driven seminar on agrivoltaics in the Americas.</span>
      </div>
      <div class="footer-logos flex gap-4 items-center opacity-50 grayscale hover:grayscale-0 hover:opacity-100 transition-all duration-300">
          <a href="https://biosphere2.org/research/research-initiatives/agrivoltaics" target="_blank"><img src="static/b2ua.jpg" class="h-6 w-auto mix-blend-multiply" alt="Biosphere 2"></a>
          <a href="https://www.ier.unam.mx/ParcelaAgrovoltaica.html" target="_blank"><img src="static/unam.png" class="h-6 w-auto mix-blend-multiply" alt="UNAM"></a>
          <a href="https://centroenergia.cl" target="_blank"><img src="static/aal.png" class="h-6 w-auto object-contain mix-blend-multiply" alt="AAL"></a>
          <a href="https://redagvmx.com" target="_blank"><img src="static/rame.png" class="h-6 w-auto object-contain mix-blend-multiply" alt="RAME"></a>
      </div>
    </div>
  </footer>
  `;

  // 5. Inject into DOM
  app.insertAdjacentHTML('afterbegin', headerHTML);
  app.insertAdjacentHTML('beforeend', footerHTML);
}