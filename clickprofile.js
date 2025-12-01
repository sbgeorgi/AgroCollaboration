import { $, show, hide, getAvatarUrl } from './ui.js';

/**
 * Injects the modal HTML structure into the DOM if it doesn't exist.
 * This allows this script to be dropped into any page.
 */
export function initProfileModal() {
    if ($('#profileModal')) return; // Already initialized

    const modalHTML = `
    <!-- Shared Profile Modal -->
    <div id="modalOverlay" class="fixed inset-0 z-[100] bg-slate-900/20 backdrop-blur-sm opacity-0 pointer-events-none transition-opacity duration-300"></div>
    <div id="profileModal" class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[101] w-[90%] max-w-lg bg-white rounded-2xl shadow-2xl border border-gray-200 opacity-0 pointer-events-none transition-all duration-300 scale-95 flex flex-col max-h-[85vh]">
        
        <!-- Header -->
        <div class="p-6 border-b border-gray-100 flex items-center gap-5 relative bg-slate-50/50 rounded-t-2xl">
            <button id="modalCloseBtn" class="absolute top-4 right-4 text-slate-400 hover:text-slate-700 hover:bg-white p-1 rounded-full transition-all">
                <i data-lucide="x" class="w-5 h-5"></i>
            </button>
            <div id="modalAvatar" class="w-20 h-20 rounded-full bg-white ring-4 ring-white shadow-md flex items-center justify-center text-3xl font-bold text-brand-600 overflow-hidden shrink-0">
                <span id="modalAvatarInitial">?</span>
                <img id="modalAvatarImage" class="w-full h-full object-cover hidden">
            </div>
            <div class="min-w-0 flex-1">
                <h2 id="modalName" class="text-xl font-display font-bold text-slate-900 leading-tight mb-1">Loading...</h2>
                <div id="modalAffiliation" class="text-sm font-bold text-brand-600 leading-tight">...</div>
                
                <!-- New Fields -->
                <div id="modalRoleMeta" class="mt-1 space-y-0.5">
                    <div id="modalDepartment" class="text-xs text-slate-500 font-medium hidden"></div>
                    <div id="modalWorkingGroup" class="text-xs text-slate-500 font-medium hidden"></div>
                </div>
            </div>
        </div>

        <!-- Body -->
        <div class="p-6 overflow-y-auto custom-scrollbar space-y-6">
            
            <!-- Contact -->
            <div id="modalEmailSection" class="hidden">
                <h3 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Contact</h3>
                <a id="modalEmail" href="#" class="inline-flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-brand-600 transition-colors bg-gray-50 px-3 py-2 rounded-lg border border-gray-200 w-full">
                    <i data-lucide="mail" class="w-4 h-4 text-slate-400"></i>
                    <span class="email-text truncate"></span>
                </a>
            </div>

            <!-- Links -->
            <div id="modalLinksSection" class="hidden">
                <h3 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Links</h3>
                <div id="modalLinks" class="flex flex-col gap-2"></div>
            </div>

            <!-- Description -->
            <div id="modalDescriptionSection" class="hidden">
                <h3 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Profile</h3>
                <p id="modalDescription" class="text-sm text-slate-700 leading-relaxed whitespace-pre-line"></p>
            </div>

            <!-- Interests -->
            <div id="modalFieldsSection" class="hidden">
                <h3 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Interests</h3>
                <div id="modalFields" class="flex flex-wrap gap-2"></div>
            </div>
        </div>
    </div>`;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Bind Close Events
    const close = () => {
        $('#modalOverlay').classList.add('opacity-0', 'pointer-events-none');
        $('#profileModal').classList.add('opacity-0', 'pointer-events-none', 'scale-95');
    };

    $('#modalCloseBtn').addEventListener('click', close);
    $('#modalOverlay').addEventListener('click', close);
    
    // Refresh icons since we injected HTML
    if (window.lucide) window.lucide.createIcons();
}

/**
 * Populates and opens the profile modal.
 * @param {Object} m - The profile object from Supabase (must include fields like full_name, affiliation, department, working_group, etc.)
 * @param {Map} [tagCanonicalMap] - Optional map to translate tag keys to display text
 * @param {Map} [tagIndex] - Optional index to find tags associated with this user ID
 */
export function openProfileModal(m, tagCanonicalMap = null, tagIndex = null) {
    if (!m) return;
    
    // Ensure Modal Exists
    initProfileModal();

    const modal = $('#profileModal');
    const over = $('#modalOverlay');
    const displayName = m.full_name || 'Member';

    // 1. Basic Info
    $('#modalName').innerText = displayName;
    $('#modalAffiliation').innerText = m.affiliation || '';
    
    // 2. Department & Working Group (New Logic)
    const deptEl = $('#modalDepartment');
    const groupEl = $('#modalWorkingGroup');
    
    if (m.department) {
        deptEl.innerText = m.department;
        show(deptEl);
    } else {
        hide(deptEl);
    }

    if (m.working_group) {
        groupEl.innerText = `Group: ${m.working_group}`;
        show(groupEl);
    } else {
        hide(groupEl);
    }

    // 3. Avatar
    $('#modalAvatarInitial').innerText = displayName[0].toUpperCase();
    hide($('#modalAvatarImage'));
    show($('#modalAvatarInitial'));
    
    if (m.avatar_url) {
        getAvatarUrl(m.avatar_url).then(u => {
            if (u) {
                $('#modalAvatarImage').src = u;
                show($('#modalAvatarImage'));
                hide($('#modalAvatarInitial'));
            }
        });
    }

    // 4. Contact
    if (m.work_email) {
        $('#modalEmail').href = `mailto:${m.work_email}`;
        $('.email-text').innerText = m.work_email;
        show($('#modalEmailSection'));
    } else {
        hide($('#modalEmailSection'));
    }

    // 5. Links
    const ld = $('#modalLinks');
    ld.innerHTML = '';
    let hl = false;
    [
        ['personal_website', 'Website', 'globe'],
        ['professional_website', 'Lab Website', 'building'],
        ['google_scholar', 'Google Scholar', 'graduation-cap']
    ].forEach(([k, l, i]) => {
        if (m[k]) {
            hl = true;
            ld.insertAdjacentHTML(
                'beforeend',
                `<a href="${m[k]}" target="_blank" class="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:bg-brand-50 hover:border-brand-300 transition-all group">
                    <span class="flex items-center gap-2 text-sm font-medium text-slate-700">
                        <i data-lucide="${i}" class="w-4 h-4 text-slate-400 group-hover:text-brand-500"></i> ${l}
                    </span>
                    <i data-lucide="external-link" class="w-3 h-3 text-slate-300"></i>
                </a>`
            );
        }
    });
    if (hl) {
        show($('#modalLinksSection'));
        if (window.lucide) window.lucide.createIcons();
    } else {
        hide($('#modalLinksSection'));
    }

    // 6. Description
    const descSection = $('#modalDescriptionSection');
    const descEl = $('#modalDescription');
    if (m.description && m.description.trim().length > 0) {
        descEl.innerText = m.description.trim();
        show(descSection);
    } else {
        descEl.innerText = '';
        hide(descSection);
    }

    // 7. Interests (Tags)
    // We try to parse fields_of_study directly, or use the optional tagIndex maps if passed from network.html
    const fd = $('#modalFields');
    fd.innerHTML = '';
    const tags = new Set();

    // Strategy A: Use passed Tag Maps (Network Page logic)
    if (tagCanonicalMap && tagIndex) {
        for (const [t, s] of tagIndex) {
            if (s.has(m.id)) tags.add(tagCanonicalMap.get(t));
        }
    } 
    // Strategy B: Fallback to simple comma split (Other pages)
    else if (m.fields_of_study) {
        m.fields_of_study.split(',').forEach(t => tags.add(t.trim()));
    }

    if (tags.size) {
        tags.forEach(t =>
            fd.insertAdjacentHTML('beforeend',
                `<span class="px-2 py-1 rounded bg-gray-100 text-slate-600 text-xs font-bold border border-gray-200">${t}</span>`
            )
        );
        show($('#modalFieldsSection'));
    } else {
        hide($('#modalFieldsSection'));
    }

    // Show Modal Animation
    show(over);
    show(modal);
    requestAnimationFrame(() => {
        over.classList.remove('opacity-0', 'pointer-events-none');
        modal.classList.remove('opacity-0', 'pointer-events-none', 'scale-95');
    });
}