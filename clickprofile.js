// C:\HELLOWORLD\AgroCollaboration\clickprofile.js
import { getAvatarUrl } from './ui.js';

// --- Configuration & Data ---
const COUNTRIES = {
    "US": "United States", "MX": "Mexico", "CA": "Canada", "CO": "Colombia", "BR": "Brazil", 
    "CL": "Chile", "AR": "Argentina", "PE": "Peru", "ES": "Spain", "FR": "France", "DE": "Germany",
    "BE": "Belgium", "NL": "Netherlands", "IT": "Italy", "UK": "UK", "GB": "UK",
    "IN": "India", "CN": "China", "AU": "Australia"
};

// --- Styles ---
const MODAL_CSS = `
    .profile-modal-backdrop {
        position: fixed; inset: 0; 
        background-color: transparent; /* No color, no blur, completely clear */
        opacity: 0; transition: opacity 0.3s ease;
        z-index: 9998;
    }
    .profile-modal-backdrop.visible { opacity: 1; }
    
    .profile-modal-panel {
        opacity: 0; transform: scale(0.95); 
        transition: opacity 0.3s ease, transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        z-index: 9999;
    }
    .profile-modal-panel.visible { opacity: 1; transform: scale(1); }
    
    .ql-editor-content p { margin-bottom: 0.5em; }
    .ql-editor-content a { color: #4f46e5; text-decoration: underline; }
    .ql-editor-content ul { list-style-type: disc; padding-left: 1.25em; margin-bottom: 0.5em; }
    .ql-editor-content ol { list-style-type: decimal; padding-left: 1.25em; margin-bottom: 0.5em; }
`;

// --- HTML Skeleton ---
const MODAL_HTML = `
<div id="globalProfileModal" class="fixed inset-0 z-[100] hidden" aria-labelledby="modal-title" role="dialog" aria-modal="true">
    <!-- Backdrop -->
    <div id="globalProfileBackdrop" class="profile-modal-backdrop"></div>

    <div class="fixed inset-0 z-[100] overflow-y-auto">
        <div class="flex min-h-full items-center justify-center p-4 text-center sm:p-0">
            <!-- Modal Panel -->
            <div id="globalProfilePanel" class="profile-modal-panel relative transform overflow-hidden rounded-2xl bg-white text-left shadow-2xl sm:my-8 sm:w-full sm:max-w-2xl ring-1 ring-slate-900/5">
                
                <!-- Close Button -->
                <button id="globalProfileCloseBtn" class="absolute top-4 right-4 z-10 p-2 bg-white/50 hover:bg-white rounded-full text-slate-400 hover:text-slate-600 transition-colors backdrop-blur-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>

                <!-- Content Area -->
                <div id="globalProfileContent"></div>
            </div>
        </div>
    </div>
</div>
`;

let isInitialized = false;

function initPopup() {
    if (isInitialized || document.getElementById('globalProfileModal')) return;

    // 1. Inject CSS
    const style = document.createElement('style');
    style.innerHTML = MODAL_CSS;
    document.head.appendChild(style);

    // 2. Inject HTML
    document.body.insertAdjacentHTML('beforeend', MODAL_HTML);

    // 3. Bind Listeners
    document.getElementById('globalProfileCloseBtn').onclick = closeProfileModal;
    document.getElementById('globalProfileBackdrop').onclick = closeProfileModal;
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeProfileModal(); });

    isInitialized = true;
}

export function closeProfileModal() {
    const modal = document.getElementById('globalProfileModal');
    const panel = document.getElementById('globalProfilePanel');
    const backdrop = document.getElementById('globalProfileBackdrop');

    if (!modal) return;

    panel.classList.remove('visible');
    backdrop.classList.remove('visible');

    setTimeout(() => {
        modal.classList.add('hidden');
    }, 300);
}

export function openProfileModal(member) {
    initPopup(); // Ensure DOM exists

    const modal = document.getElementById('globalProfileModal');
    const panel = document.getElementById('globalProfilePanel');
    const backdrop = document.getElementById('globalProfileBackdrop');
    const content = document.getElementById('globalProfileContent');

    if (!member) return;

    // --- Generate Content ---
    const avatarHtml = member.avatar_url 
        ? `<img id="globalModalAvatarImg" src="" class="w-full h-full object-cover">` 
        : `<span class="text-2xl font-bold text-brand-600">${member.full_name ? member.full_name[0].toUpperCase() : '?'}</span>`;

    // Social Links
    let socialLinks = '';
    // SVG Icons inline to ensure they work without lucide refresh dependency issues
    const iconMail = `<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`;
    const iconGlobe = `<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>`;
    const iconFlask = `<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 2v7.31"/><path d="M14 2v7.31"/><path d="M8.5 2h7"/><path d="M14 9.3a6.5 6.5 0 1 1-4 0"/></svg>`;
    const iconGrad = `<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>`;
    const iconPin = `<svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`;

    if (member.work_email) socialLinks += `<a href="mailto:${member.work_email}" title="Email" class="p-2 bg-gray-50 hover:bg-brand-50 text-slate-500 hover:text-brand-600 rounded-lg transition-colors">${iconMail}</a>`;
    if (member.personal_website) socialLinks += `<a href="${member.personal_website}" target="_blank" title="Personal Website" class="p-2 bg-gray-50 hover:bg-brand-50 text-slate-500 hover:text-brand-600 rounded-lg transition-colors">${iconGlobe}</a>`;
    if (member.professional_website) socialLinks += `<a href="${member.professional_website}" target="_blank" title="Lab/Professional Website" class="p-2 bg-gray-50 hover:bg-brand-50 text-slate-500 hover:text-brand-600 rounded-lg transition-colors">${iconFlask}</a>`;
    if (member.google_scholar) socialLinks += `<a href="${member.google_scholar}" target="_blank" title="Google Scholar" class="p-2 bg-gray-50 hover:bg-brand-50 text-slate-500 hover:text-brand-600 rounded-lg transition-colors">${iconGrad}</a>`;

    // Tags
    const tags = (member.fields_of_study || "").split(',').map(t => t.trim()).filter(Boolean);
    const tagsHtml = tags.length 
        ? tags.map(t => `<span class="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-brand-50 text-brand-700 border border-brand-100">${t}</span>`).join('') 
        : '<span class="text-slate-400 text-sm italic">No research interests listed.</span>';

    // HTML Construction
    content.innerHTML = `
        <div class="relative">
            <!-- Header Background -->
            <div class="h-32 bg-gradient-to-r from-brand-600 to-indigo-600"></div>
            
            <div class="px-6 pb-6">
                <div class="flex flex-col sm:flex-row items-start gap-4 -mt-12 mb-4">
                    <!-- Avatar -->
                    <div class="w-24 h-24 rounded-full bg-white p-1 shadow-lg shrink-0">
                        <div class="w-full h-full rounded-full bg-slate-100 flex items-center justify-center overflow-hidden ring-1 ring-gray-100">
                            ${avatarHtml}
                        </div>
                    </div>
                    
                    <!-- Main Info -->
                    <div class="flex-1 pt-0 sm:pt-14 text-center sm:text-left">
                        <h2 class="text-2xl font-display font-bold text-slate-900">${member.full_name || 'Member'}</h2>
                        <div class="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-1 text-sm text-slate-500 font-medium">
                            ${member.username ? `<span class="text-brand-600">@${member.username}</span>` : ''}
                            ${member.role === 'admin' || member.role === 'organizer' 
                                ? `<span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold uppercase tracking-wider">Host</span>` 
                                : ''}
                        </div>
                    </div>

                    <!-- Social Links (Desktop) -->
                    <div class="hidden sm:flex gap-2 pt-14">
                        ${socialLinks}
                    </div>
                </div>

                <!-- Details Grid -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <div class="bg-gray-50 p-3 rounded-xl border border-gray-100">
                        <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Affiliation</span>
                        <div class="font-medium text-slate-800 text-sm">${member.affiliation || '—'}</div>
                        ${member.country ? `<div class="mt-1 text-xs text-slate-500 flex items-center gap-1">${iconPin} ${COUNTRIES[member.country] || member.country}</div>` : ''}
                    </div>
                    <div class="bg-gray-50 p-3 rounded-xl border border-gray-100">
                        <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Department / Group</span>
                        <div class="font-medium text-slate-800 text-sm mb-0.5">${member.department || '—'}</div>
                        <div class="text-xs text-slate-500">${member.working_group || ''}</div>
                    </div>
                </div>

                <!-- Mobile Social Links -->
                <div class="flex sm:hidden gap-2 mb-6 justify-center">
                    ${socialLinks}
                </div>

                <!-- Bio / Description -->
                ${member.description ? `
                <div class="mb-6">
                    <h3 class="text-sm font-bold text-slate-800 mb-2">About</h3>
                    <div class="text-sm text-slate-600 leading-relaxed ql-editor-content">${member.description}</div>
                </div>` : ''}

                <!-- Tags -->
                <div>
                    <h3 class="text-sm font-bold text-slate-800 mb-2">Research Interests</h3>
                    <div class="flex flex-wrap gap-2">
                        ${tagsHtml}
                    </div>
                </div>
            </div>
        </div>
    `;

    // Fetch Avatar
    if (member.avatar_url) {
        getAvatarUrl(member.avatar_url).then(url => {
            const img = document.getElementById('globalModalAvatarImg');
            if (img && url) img.src = url;
        });
    }

    // --- Show Modal ---
    modal.classList.remove('hidden');
    // Force Reflow
    void modal.offsetWidth;
    
    panel.classList.add('visible');
    backdrop.classList.add('visible');
}