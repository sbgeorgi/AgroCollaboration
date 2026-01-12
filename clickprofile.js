// C:\HELLOWORLD\AgroCollaboration\clickprofile.js
import { getAvatarUrl } from './ui.js';

const COUNTRIES = {
    "US": "United States", "MX": "Mexico", "CA": "Canada", "CO": "Colombia", "BR": "Brazil", 
    "CL": "Chile", "AR": "Argentina", "PE": "Peru", "ES": "Spain", "FR": "France", "DE": "Germany",
    "BE": "Belgium", "NL": "Netherlands", "IT": "Italy", "UK": "UK", "GB": "UK",
    "IN": "India", "CN": "China", "AU": "Australia"
};

const MODAL_CSS = `
    #globalProfileModal {
        position: fixed !important;
        inset: 0 !important;
        z-index: 99999 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        padding: 1rem !important;
    }
    #globalProfileModal.hidden {
        display: none !important;
    }
    #globalProfileBackdrop {
        position: fixed !important;
        inset: 0 !important;
        background-color: rgba(15, 23, 42, 0.6) !important;
        backdrop-filter: blur(4px) !important;
        z-index: 99998 !important;
        opacity: 0;
        transition: opacity 0.3s ease;
    }
    #globalProfileBackdrop.visible {
        opacity: 1 !important;
    }
    #globalProfilePanel {
        position: relative !important;
        z-index: 99999 !important;
        background: white !important;
        border-radius: 1rem !important;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25) !important;
        max-width: 42rem !important;
        width: 100% !important;
        max-height: 90vh !important;
        overflow: hidden !important;
        opacity: 0;
        transform: scale(0.95);
        transition: opacity 0.3s ease, transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }
    #globalProfilePanel.visible {
        opacity: 1 !important;
        transform: scale(1) !important;
    }
    /* Toast Notification for Copy */
    #globalProfileToast {
        position: absolute;
        bottom: 1.5rem;
        left: 50%;
        transform: translateX(-50%) translateY(1rem);
        background-color: #10b981;
        color: white;
        padding: 0.5rem 1rem;
        border-radius: 9999px;
        font-size: 0.875rem;
        font-weight: 500;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        opacity: 0;
        pointer-events: none;
        transition: all 0.3s ease;
        z-index: 100000;
    }
    #globalProfileToast.visible {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
    }
    .profile-ql-content p { margin-bottom: 0.5em; }
    .profile-ql-content a { color: #4f46e5; text-decoration: underline; }
    .profile-ql-content ul { list-style-type: disc; padding-left: 1.25em; margin-bottom: 0.5em; }
    .profile-ql-content ol { list-style-type: decimal; padding-left: 1.25em; margin-bottom: 0.5em; }
`;

const MODAL_HTML = `
<div id="globalProfileModal" class="hidden" role="dialog" aria-modal="true">
    <div id="globalProfileBackdrop"></div>
    <div id="globalProfilePanel">
        <button id="globalProfileCloseBtn" style="position:absolute; top:1rem; right:1rem; z-index:10; padding:0.5rem; background:rgba(255,255,255,0.8); border-radius:9999px; border:none; cursor:pointer; display:flex; align-items:center; justify-content:center;">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>
        </button>
        <div id="globalProfileContent"></div>
        <div id="globalProfileToast">Email copied!</div>
    </div>
</div>
`;

let isInitialized = false;

function initPopup() {
    if (isInitialized || document.getElementById('globalProfileModal')) {
        isInitialized = true;
        return;
    }

    const style = document.createElement('style');
    style.id = 'globalProfileModalStyles';
    style.textContent = MODAL_CSS;
    document.head.appendChild(style);

    document.body.insertAdjacentHTML('beforeend', MODAL_HTML);

    document.getElementById('globalProfileCloseBtn')?.addEventListener('click', closeProfileModal);
    document.getElementById('globalProfileBackdrop')?.addEventListener('click', closeProfileModal);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeProfileModal(); });

    isInitialized = true;
}

export function closeProfileModal() {
    const modal = document.getElementById('globalProfileModal');
    const panel = document.getElementById('globalProfilePanel');
    const backdrop = document.getElementById('globalProfileBackdrop');
    const toast = document.getElementById('globalProfileToast');

    if (!modal) return;

    panel?.classList.remove('visible');
    backdrop?.classList.remove('visible');
    toast?.classList.remove('visible');

    setTimeout(() => modal.classList.add('hidden'), 300);
}

export function openProfileModal(member) {
    initPopup();

    const modal = document.getElementById('globalProfileModal');
    const panel = document.getElementById('globalProfilePanel');
    const backdrop = document.getElementById('globalProfileBackdrop');
    const content = document.getElementById('globalProfileContent');
    const toast = document.getElementById('globalProfileToast');

    if (!modal || !panel || !backdrop || !content || !member) return;

    // Reset Toast state
    if(toast) toast.classList.remove('visible');

    // Avatar
    const avatarHtml = member.avatar_url 
        ? `<img id="globalModalAvatarImg" src="" alt="${member.full_name || 'Profile'}" style="width:100%; height:100%; object-fit:cover;">` 
        : `<span style="font-size:1.5rem; font-weight:bold; color:#4f46e5;">${member.full_name ? member.full_name[0].toUpperCase() : '?'}</span>`;

    // SVG Icons
    const iconMail = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"></rect><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path></svg>`;
    const iconGlobe = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"></path><path d="M2 12h20"></path></svg>`;
    const iconFlask = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6"></path><path d="M10 9V3"></path><path d="M14 9V3"></path><path d="M10 9a5 5 0 0 0-4 8 5 5 0 0 0 5 2h2a5 5 0 0 0 5-2 5 5 0 0 0-4-8"></path></svg>`;
    const iconGrad = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"></path><path d="M6 12v5c0 2 2 3 6 3s6-1 6-3v-5"></path></svg>`;
    const iconPin = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path><circle cx="12" cy="10" r="3"></circle></svg>`;

    // Social links
    let socialLinksHtml = '';
    const linkStyle = 'display:inline-flex; align-items:center; justify-content:center; padding:0.5rem; background:#f8fafc; border-radius:0.5rem; color:#64748b; text-decoration:none; transition:all 0.2s;';
    
    // Email is now a button
    if (member.work_email) {
        socialLinksHtml += `<button id="globalProfileEmailBtn" data-email="${member.work_email}" title="Copy Email" style="${linkStyle} border:none; cursor:pointer; font-size:inherit;">${iconMail}</button>`;
    }
    
    // Other links remain as <a>
    if (member.personal_website) socialLinksHtml += `<a href="${member.personal_website}" target="_blank" rel="noopener noreferrer" title="Personal Website" style="${linkStyle}">${iconGlobe}</a>`;
    if (member.professional_website) socialLinksHtml += `<a href="${member.professional_website}" target="_blank" rel="noopener noreferrer" title="Professional Website" style="${linkStyle}">${iconFlask}</a>`;
    if (member.google_scholar) socialLinksHtml += `<a href="${member.google_scholar}" target="_blank" rel="noopener noreferrer" title="Google Scholar" style="${linkStyle}">${iconGrad}</a>`;

    // Tags
    const tags = (member.fields_of_study || "").split(',').map(t => t.trim()).filter(Boolean);
    const tagsHtml = tags.length 
        ? tags.map(t => `<span style="display:inline-flex; padding:0.25rem 0.625rem; border-radius:0.375rem; font-size:0.75rem; font-weight:500; background:#eff6ff; color:#1d4ed8; border:1px solid #dbeafe;">${t}</span>`).join(' ') 
        : '<span style="color:#94a3b8; font-size:0.875rem; font-style:italic;">No research interests listed.</span>';

    // Role badge
    const roleBadge = (member.role === 'admin' || member.role === 'organizer')
        ? `<span style="padding:0.125rem 0.5rem; border-radius:9999px; background:#fef3c7; color:#92400e; font-size:0.625rem; font-weight:700; text-transform:uppercase; letter-spacing:0.05em;">Host</span>`
        : '';

    // Country
    const countryDisplay = member.country 
        ? `<div style="margin-top:0.25rem; font-size:0.75rem; color:#64748b; display:flex; align-items:center; gap:0.25rem;">${iconPin} ${COUNTRIES[member.country] || member.country}</div>` 
        : '';

    content.innerHTML = `
        <div style="position:relative;">
            <div style="height:8rem; background:linear-gradient(to right, #4f46e5, #6366f1);"></div>
            <div style="padding:0 1.5rem 1.5rem;">
                <div style="display:flex; flex-wrap:wrap; align-items:flex-start; gap:1rem; margin-top:-3rem; margin-bottom:1rem;">
                    <div style="width:6rem; height:6rem; border-radius:9999px; background:white; padding:0.25rem; box-shadow:0 10px 25px -5px rgba(0,0,0,0.1); flex-shrink:0;">
                        <div style="width:100%; height:100%; border-radius:9999px; background:#f1f5f9; display:flex; align-items:center; justify-content:center; overflow:hidden;">
                            ${avatarHtml}
                        </div>
                    </div>
                    <div style="flex:1; padding-top:3.5rem; min-width:200px;">
                        <h2 style="font-size:1.5rem; font-weight:700; color:#0f172a; margin:0;">${member.full_name || 'Member'}</h2>
                        <div style="display:flex; flex-wrap:wrap; align-items:center; gap:0.5rem; margin-top:0.25rem; font-size:0.875rem; color:#64748b;">
                            ${member.username ? `<span style="color:#4f46e5;">@${member.username}</span>` : ''}
                            ${roleBadge}
                        </div>
                    </div>
                    ${socialLinksHtml ? `<div style="display:flex; gap:0.5rem; padding-top:3.5rem;">${socialLinksHtml}</div>` : ''}
                </div>
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:1rem; margin-bottom:1.5rem;">
                    <div style="background:#f8fafc; padding:0.75rem; border-radius:0.75rem; border:1px solid #f1f5f9;">
                        <span style="display:block; font-size:0.625rem; font-weight:700; color:#94a3b8; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:0.25rem;">Affiliation</span>
                        <div style="font-weight:500; color:#1e293b; font-size:0.875rem;">${member.affiliation || '—'}</div>
                        ${countryDisplay}
                    </div>
                    <div style="background:#f8fafc; padding:0.75rem; border-radius:0.75rem; border:1px solid #f1f5f9;">
                        <span style="display:block; font-size:0.625rem; font-weight:700; color:#94a3b8; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:0.25rem;">Department / Group</span>
                        <div style="font-weight:500; color:#1e293b; font-size:0.875rem;">${member.department || '—'}</div>
                        ${member.working_group ? `<div style="font-size:0.75rem; color:#64748b;">${member.working_group}</div>` : ''}
                    </div>
                </div>
                ${member.description ? `
                <div style="margin-bottom:1.5rem;">
                    <h3 style="font-size:0.875rem; font-weight:700; color:#1e293b; margin-bottom:0.5rem;">About</h3>
                    <div style="font-size:0.875rem; color:#475569; line-height:1.6;" class="profile-ql-content">${member.description}</div>
                </div>` : ''}
                <div>
                    <h3 style="font-size:0.875rem; font-weight:700; color:#1e293b; margin-bottom:0.5rem;">Research Interests</h3>
                    <div style="display:flex; flex-wrap:wrap; gap:0.5rem;">${tagsHtml}</div>
                </div>
            </div>
        </div>
    `;

    // Load avatar
    if (member.avatar_url) {
        getAvatarUrl(member.avatar_url).then(url => {
            const img = document.getElementById('globalModalAvatarImg');
            if (img && url) img.src = url;
        });
    }

    // Bind Copy Email Event
    const emailBtn = document.getElementById('globalProfileEmailBtn');
    if (emailBtn) {
        emailBtn.addEventListener('click', () => {
            const email = emailBtn.getAttribute('data-email');
            if (email) {
                navigator.clipboard.writeText(email).then(() => {
                    const t = document.getElementById('globalProfileToast');
                    if (t) {
                        t.classList.add('visible');
                        setTimeout(() => t.classList.remove('visible'), 2000);
                    }
                }).catch(err => console.error('Failed to copy: ', err));
            }
        });
    }

    // Show modal
    modal.classList.remove('hidden');
    void modal.offsetWidth;
    requestAnimationFrame(() => {
        backdrop.classList.add('visible');
        panel.classList.add('visible');
    });
}