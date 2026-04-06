import { supabase } from './auth.js';
import { setFlash, escapeHtml } from './ui.js';

// Global auth state reference to satisfy Supabase Storage RLS policies
let globalAuthState = null;

// ==========================================
// PART 1: FRONTEND LOADERS (PUBLIC PAGES)
// ==========================================

function applyTextData(data, lang) {
    data.forEach(item => {
        const elements = document.querySelectorAll(`[data-copy-key="${item.id}"]`);
        elements.forEach(el => {
            const text = lang === 'es' ? (item.content_es || item.content_en) : item.content_en;
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                if (el.value !== text) el.value = text;
            } else if (item.is_html) {
                if (el.innerHTML !== text) el.innerHTML = text;
            } else {
                if (el.textContent !== text) el.textContent = text;
            }
        });
    });
}

export async function loadAndApplyCopy(pageName, lang) {
    const cacheKey = `site_copy_${pageName}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) { 
        try { applyTextData(JSON.parse(cached), lang); } 
        catch (e) { localStorage.removeItem(cacheKey); } 
    }
    try {
        const { data, error } = await supabase.from('site_copy').select('*').eq('page', pageName);
        if (!error && data) {
            localStorage.setItem(cacheKey, JSON.stringify(data));
            applyTextData(data, lang);
        }
    } catch (err) { console.error(err); }
}

function getThemeClasses(color) {
    const map = {
        purple:  { border: 'hover:border-purple-400', bar: 'bg-purple-700', text: 'group-hover:text-purple-700', badge: 'text-purple-700 bg-purple-50', ring: 'ring-purple-400', accent: 'purple' },
        amber:   { border: 'hover:border-amber-400', bar: 'bg-amber-500', text: 'group-hover:text-amber-600', badge: 'text-amber-700 bg-amber-50', ring: 'ring-amber-400', accent: 'amber' },
        blue:    { border: 'hover:border-blue-400', bar: 'bg-blue-600', text: 'group-hover:text-blue-600', badge: 'text-blue-700 bg-blue-50', ring: 'ring-blue-400', accent: 'blue' },
        emerald: { border: 'hover:border-emerald-400', bar: 'bg-emerald-500', text: 'group-hover:text-emerald-600', badge: 'text-emerald-700 bg-emerald-50', ring: 'ring-emerald-400', accent: 'emerald' },
        red:     { border: 'hover:border-red-400', bar: 'bg-red-600', text: 'group-hover:text-red-600', badge: 'text-red-700 bg-red-50', ring: 'ring-red-400', accent: 'red' }
    };
    return map[color] || map.purple;
}

export async function loadCommitteeGrid(containerId, lang) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const render = (list) => {
        container.innerHTML = list.map(m => {
            const theme = getThemeClasses(m.color_theme || 'purple');
            const desc = lang === 'es' ? (m.description_es || m.description_en) : m.description_en;
            const role = lang === 'es' ? (m.role_es || m.role_en) : m.role_en;
            return `
            <div class="group relative flex bg-white rounded-xl overflow-hidden border border-gray-200 shadow-sm hover:shadow-xl ${theme.border} transition-all duration-300 min-h-[140px]">
                <div class="w-1.5 ${theme.bar} flex-shrink-0"></div>
                <div class="w-24 sm:w-32 h-full relative overflow-hidden flex-shrink-0 bg-gray-100">
                    <img src="${m.image_url}" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" loading="lazy" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(m.name)}&background=random'">
                </div>
                <div class="flex-1 p-4 flex flex-col justify-center min-w-0 relative">
                    <div class="absolute top-3 right-3">
                        <span class="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border border-gray-100 ${theme.badge}">${m.badge_text || 'ASF'}</span>
                    </div>
                    <div class="pr-8">
                        <h3 class="font-display font-bold text-lg text-slate-900 leading-tight ${theme.text} transition-colors truncate">${m.name}</h3>
                        <p class="text-xs font-bold text-slate-400 uppercase tracking-wider truncate mb-1">${m.institution || ''}</p>
                        <p class="text-xs font-medium text-slate-500 mb-2">${role}</p>
                    </div>
                    <div class="text-sm text-slate-600 line-clamp-2 prose prose-sm leading-snug">${desc}</div>
                </div>
            </div>`;
        }).join('');
    };

    try {
        const { data } = await supabase.from('committee_members').select('*').order('display_order');
        if (data) render(data);
    } catch (e) { console.error(e); }
}

export async function loadOrgGrid(containerId, lang) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const render = (list) => {
        container.innerHTML = list.map(org => {
            const theme = getThemeClasses(org.color_theme);
            const desc = lang === 'es' ? (org.description_es || org.description_en) : org.description_en;
            return `
            <a href="${org.url}" target="_blank" class="group relative flex flex-col sm:flex-row bg-white rounded-2xl overflow-hidden border border-gray-200 shadow-sm hover:shadow-2xl ${theme.border} hover:-translate-y-1 transition-all duration-300 h-full">
                <div class="h-1.5 w-full sm:w-1.5 sm:h-auto ${theme.bar} flex-shrink-0"></div>
                <div class="w-full h-48 sm:w-56 relative overflow-hidden flex-shrink-0 bg-slate-50">
                    <img src="${org.image_url}" class="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" loading="lazy">
                    <div class="absolute inset-0 bg-gradient-to-t from-slate-900/40 to-transparent"></div>
                </div>
                <div class="flex-1 p-6 flex flex-col justify-center relative bg-white">
                    <div class="absolute top-4 right-4 w-12 h-12 bg-white rounded-lg shadow-sm border border-gray-100 p-1">
                        <img src="${org.logo_url}" class="w-full h-full object-contain" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(org.acronym || 'ORG')}&background=random'">
                    </div>
                    <div class="pr-12 mb-3">
                        <h3 class="font-display font-bold text-xl text-slate-900 leading-tight ${theme.text} transition-colors">${org.name}</h3>
                        <span class="inline-block mt-1 px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px] font-bold text-slate-500 uppercase">${org.acronym || 'ORG'}</span>
                    </div>
                    <div class="text-sm text-slate-600 line-clamp-3 prose prose-sm">${desc}</div>
                </div>
            </a>`;
        }).join('');
    };

    try {
        const { data } = await supabase.from('partner_organizations').select('*').order('display_order');
        if (data) render(data);
    } catch (e) { console.error(e); }
}


// ==========================================
// PART 2: ADMIN UI & IMAGE HELPERS
// ==========================================

const quillRegistry = new Map();
const quillToolbarOptions = [
    ['bold', 'italic', 'underline'],
    [{ 'list': 'ordered' }, { 'list': 'bullet' }],
    ['link', 'clean']
];

const THEME_OPTIONS = [
    { value: 'purple', label: 'Purple', dot: '#7c3aed' },
    { value: 'amber', label: 'Amber', dot: '#f59e0b' },
    { value: 'blue', label: 'Blue', dot: '#2563eb' },
    { value: 'emerald', label: 'Emerald', dot: '#10b981' },
    { value: 'red', label: 'Red', dot: '#dc2626' }
];

const PAGE_META = {
    home:      { icon: 'home', color: '#6366f1', label: 'Home' },
    about:     { icon: 'info', color: '#8b5cf6', label: 'About' },
    network:   { icon: 'globe', color: '#0ea5e9', label: 'Network' },
    resources: { icon: 'book-open', color: '#f59e0b', label: 'Resources' },
    contact:   { icon: 'mail', color: '#10b981', label: 'Contact' },
    auth:      { icon: 'lock', color: '#64748b', label: 'Auth' },
    nav:       { icon: 'menu', color: '#334155', label: 'Navigation' },
    footer:    { icon: 'layers', color: '#64748b', label: 'Footer' },
    committee: { icon: 'users', color: '#8b5cf6', label: 'Committee' },
};

const COMMITTEE_KEY_PREFIXES = ['about_committee', 'about_team', 'about_members', 'committee_'];
const ORG_KEY_PREFIXES = ['network_org', 'network_partner', 'network_collab'];

function copyBelongsToCommittee(item) { return COMMITTEE_KEY_PREFIXES.some(p => item.id.startsWith(p)); }
function copyBelongsToOrgs(item) { return ORG_KEY_PREFIXES.some(p => item.id.startsWith(p)); }

// -- IMAGE UPLOAD HELPERS --
function setupImageUploader(panel, type, id) {
    const input = panel.querySelector(`#${type}-input-${id}`);
    const preview = panel.querySelector(`#${type}-preview-${id}`);
    const urlField = panel.querySelector(`#${type}-url-${id}`);
    const removeBtn = panel.querySelector(`#${type}-remove-${id}`);

    if (input && preview) {
        input.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (ev) => { preview.src = ev.target.result; };
                reader.readAsDataURL(file);
            }
        });
    }

    if (removeBtn) {
        removeBtn.addEventListener('click', () => {
            if(input) input.value = '';
            if(urlField) urlField.value = '';
            preview.src = 'https://ui-avatars.com/api/?name=Removed&background=f1f5f9&color=64748b';
        });
    }
}

async function processImageUpload(panel, type, id, folder) {
    const input = panel.querySelector(`#${type}-input-${id}`);
    const hiddenUrl = panel.querySelector(`#${type}-url-${id}`);
    let finalUrl = hiddenUrl ? hiddenUrl.value : '';

    if (input && input.files && input.files.length > 0) {
        const file = input.files[0];
        const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        
        // FIX: RLS Policy Bypass - Attach User ID
        const userId = globalAuthState?.session?.user?.id;
        if (!userId) {
            setFlash("Authentication error. Cannot upload.", 3000);
            return finalUrl;
        }

        const filePath = `${userId}/${folder}/${id}_${Date.now()}_${safeName}`;
        
        const { error } = await supabase.storage.from('avatars').upload(filePath, file);
        if (!error) {
            const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
            if (data && data.publicUrl) finalUrl = data.publicUrl;
        } else {
            console.error("Upload failed for", type, error);
            setFlash("Upload failed: " + error.message, 3000);
        }
    }
    return finalUrl;
}

const ADMIN_STYLES = `
<style>
    .adm-label { display: block; font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
    .adm-input { width: 100%; padding: 7px 11px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 13px; outline: none; transition: all 0.15s; }
    .adm-input:focus { border-color: #6366f1; background: white; box-shadow: 0 0 0 3px rgba(99,102,241,0.08); }
    
    .card-editable { transition: all 0.3s cubic-bezier(0.4,0,0.2,1); }
    .card-editable.is-editing { box-shadow: 0 0 0 2px #6366f1, 0 20px 60px -15px rgba(0,0,0,0.15); z-index: 10; }

    .adm-btn { display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; font-size: 12px; font-weight: 700; border-radius: 10px; transition: all 0.15s; cursor: pointer; border: none; }
    .adm-btn-primary { background: #0f172a; color: white; }
    .adm-btn-primary:hover { background: #4f46e5; }
    .adm-btn-danger { background: white; color: #dc2626; border: 1px solid #fecaca; }
    .adm-btn-danger:hover { background: #fef2f2; }
    .adm-btn-ghost { background: transparent; color: #64748b; }
    .adm-btn-ghost:hover { background: #f1f5f9; color: #334155; }
    .adm-btn-add { background: white; border: 2px dashed #cbd5e1; color: #64748b; width: 100%; padding: 24px; border-radius: 16px; font-size: 14px; font-weight: 700; display: flex; flex-direction: column; align-items: center; gap: 8px; cursor: pointer; transition: all 0.2s; }
    .adm-btn-add:hover { border-color: #6366f1; color: #4f46e5; background: #f5f3ff; }

    .theme-dot { width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 0 1px #e2e8f0; cursor: pointer; transition: all 0.15s; }
    .theme-dot:hover { transform: scale(1.2); }
    .theme-dot.active { box-shadow: 0 0 0 2px #4f46e5; }

    .fade-up-in { animation: fadeUpIn 0.3s cubic-bezier(0.4,0,0.2,1) both; }
    @keyframes fadeUpIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

    .member-card-preview { position: relative; }
    .member-card-preview .edit-overlay {
        position: absolute; inset: 0; background: rgba(15,23,42,0.04);
        opacity: 0; transition: opacity 0.2s; display: flex; align-items: center; justify-content: center;
        border-radius: inherit; cursor: pointer;
    }
    .member-card-preview:hover .edit-overlay { opacity: 1; }

    .copy-type-badge { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding: 2px 6px; border-radius: 4px; }
    .copy-type-text { background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; }
    .copy-type-rich { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }
    
    .page-section-header { position: sticky; top: 0; z-index: 5; backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); }
</style>
`;

export async function renderCopyTab(containerId, authState) {
    globalAuthState = authState; // Store globally for image upload functionality
    
    const container = document.getElementById(containerId);

    container.innerHTML = `
        ${ADMIN_STYLES}
        <div class="max-w-7xl mx-auto pb-20">
            <!-- Tabs -->
            <div class="flex items-center gap-1 p-1 bg-slate-100/80 backdrop-blur rounded-xl border border-gray-200 mb-8 w-fit">
                <button class="sub-tab-btn px-4 py-2 text-xs font-bold rounded-lg transition-all shadow-sm bg-white text-brand-700" data-target="section-general">
                    <i data-lucide="file-text" class="inline w-3 h-3 mr-1.5"></i>General Copy
                </button>
                <button class="sub-tab-btn px-4 py-2 text-xs font-bold rounded-lg transition-all text-slate-500 hover:text-slate-700 hover:bg-white/50" data-target="section-committee">
                    <i data-lucide="users" class="inline w-3 h-3 mr-1.5"></i>Committee
                </button>
                <button class="sub-tab-btn px-4 py-2 text-xs font-bold rounded-lg transition-all text-slate-500 hover:text-slate-700 hover:bg-white/50" data-target="section-orgs">
                    <i data-lucide="building-2" class="inline w-3 h-3 mr-1.5"></i>Organizations
                </button>
            </div>

            <!-- General Tab -->
            <div id="section-general" class="sub-tab-content fade-up-in">
                <div class="flex justify-between items-center mb-6">
                    <div>
                        <h3 class="font-bold text-xl text-slate-800">Site Copy</h3>
                        <p class="text-sm text-slate-500 mt-1">Click any item to edit. Committee & organization copy lives in those tabs.</p>
                    </div>
                    <div class="flex items-center gap-2">
                        <div class="relative">
                            <i data-lucide="search" class="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"></i>
                            <input type="text" id="copy-search" placeholder="Filter copy keys…" class="adm-input pl-9 w-64 text-sm" />
                        </div>
                    </div>
                </div>
                <div class="flex flex-col items-center justify-center py-12" id="general-loading"><i data-lucide="loader-2" class="w-8 h-8 animate-spin text-brand-300"></i></div>
                <div id="general-content" class="space-y-6 hidden"></div>
            </div>

            <!-- Committee Tab -->
            <div id="section-committee" class="sub-tab-content hidden fade-up-in">
                <div class="flex justify-between items-center mb-6">
                    <div>
                        <h3 class="font-bold text-xl text-slate-800">Committee Members</h3>
                        <p class="text-sm text-slate-500 mt-1">Page copy and member cards. Click any to edit inline.</p>
                    </div>
                </div>
                <div id="committee-copy-cards" class="section-copy-block space-y-3 mb-6"></div>
                <div id="committee-admin-grid" class="space-y-3"></div>
            </div>

            <!-- Organizations Tab -->
            <div id="section-orgs" class="sub-tab-content hidden fade-up-in">
                <div class="flex justify-between items-center mb-6">
                    <div>
                        <h3 class="font-bold text-xl text-slate-800">Partner Organizations</h3>
                        <p class="text-sm text-slate-500 mt-1">Page copy and organization cards. Click any to edit inline.</p>
                    </div>
                </div>
                <div id="orgs-copy-cards" class="section-copy-block space-y-3 mb-6"></div>
                <div id="orgs-admin-grid" class="space-y-3"></div>
            </div>
        </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    setupTabs();
    await loadAllCopy(authState);
    await loadCommitteeAdmin();
    await loadOrgsAdmin();
}

function setupTabs() {
    const btns = document.querySelectorAll('.sub-tab-btn');
    const contents = document.querySelectorAll('.sub-tab-content');
    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            btns.forEach(b => b.className = "sub-tab-btn px-4 py-2 text-xs font-bold rounded-lg transition-all text-slate-500 hover:text-slate-700 hover:bg-white/50");
            btn.className = "sub-tab-btn px-4 py-2 text-xs font-bold rounded-lg transition-all shadow-sm bg-white text-brand-700";
            contents.forEach(c => c.classList.add('hidden'));
            document.getElementById(btn.dataset.target).classList.remove('hidden');
        });
    });
}

// ==========================================
// SITE COPY LOGIC
// ==========================================

let allCopyData = [], generalCopyData = [], committeeCopyData = [], orgsCopyData = [];

async function loadAllCopy(authState) {
    const { data: items } = await supabase.from('site_copy').select('*').order('page').order('id');
    if (!items) return;
    
    allCopyData = items;
    generalCopyData = []; committeeCopyData = []; orgsCopyData = [];

    items.forEach(item => {
        if (copyBelongsToCommittee(item)) committeeCopyData.push(item);
        else if (copyBelongsToOrgs(item)) orgsCopyData.push(item);
        else generalCopyData.push(item);
    });

    // General Copy Render
    const generalContainer = document.getElementById('general-content');
    const loading = document.getElementById('general-loading');
    renderGeneralCopyCards(generalContainer);
    loading.classList.add('hidden');
    generalContainer.classList.remove('hidden');

    // Section Specific Copy Render
    renderSectionCopyCards('committee-copy-cards', committeeCopyData, PAGE_META.committee);
    renderSectionCopyCards('orgs-copy-cards', orgsCopyData, PAGE_META.network);

    // Filter Logic
    const searchInput = document.getElementById('copy-search');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            const q = searchInput.value.toLowerCase().trim();
            generalContainer.querySelectorAll('.copy-card').forEach(card => {
                const match = !q || card.dataset.copyId.toLowerCase().includes(q) || (card.dataset.contentEn || '').toLowerCase().includes(q);
                card.style.display = match ? '' : 'none';
            });
            generalContainer.querySelectorAll('.page-group').forEach(group => {
                const visibleCards = group.querySelectorAll('.copy-card:not([style*="display: none"])');
                group.style.display = visibleCards.length ? '' : 'none';
            });
        });
    }
}

function getCopyType(id) { 
    return ['_title', '_btn', '_label', '_sub', '_heading', '_name', '_link', '_cta', '_nav'].some(p => id.includes(p)) ? 'simple' : 'rich'; 
}

function truncateHtml(html, maxLen = 120) { 
    const tmp = document.createElement('div'); 
    tmp.innerHTML = html || ''; 
    const text = tmp.textContent || tmp.innerText || ''; 
    return text.length > maxLen ? text.substring(0, maxLen) + '…' : text; 
}

function renderGeneralCopyCards(container) {
    const grouped = generalCopyData.reduce((acc, item) => { 
        if (!acc[item.page]) acc[item.page] = []; 
        acc[item.page].push(item); 
        return acc; 
    }, {});
    
    let html = '';
    Object.keys(grouped).forEach((page, pageIdx) => {
        const meta = PAGE_META[page] || { icon: 'file', color: '#64748b', label: page };
        const items = grouped[page];
        html += `
        <div class="page-group fade-up-in" style="animation-delay: ${pageIdx * 60}ms">
            <div class="page-section-header flex items-center gap-3 mb-3 py-2 px-1">
                <div class="w-8 h-8 rounded-lg flex items-center justify-center shadow-sm border border-gray-200" style="background: ${meta.color}10; border-color: ${meta.color}25">
                    <i data-lucide="${meta.icon}" class="w-4 h-4" style="color: ${meta.color}"></i>
                </div>
                <div>
                    <h4 class="font-bold text-sm text-slate-800 capitalize">${meta.label}</h4>
                    <span class="text-[10px] text-slate-400 font-medium">${items.length} item${items.length !== 1 ? 's' : ''}</span>
                </div>
            </div>
            <div class="space-y-2 mb-8">
                ${items.map((item, idx) => renderCopyCard(item, idx, meta)).join('')}
            </div>
        </div>`;
    });
    
    container.innerHTML = html;
    wireUpCopyCards(container);
    if (window.lucide) window.lucide.createIcons();
}

function renderSectionCopyCards(containerId, items, pageMeta) {
    const container = document.getElementById(containerId);
    if (!container || !items.length) { 
        if (container) container.innerHTML = ''; 
        return; 
    }
    
    container.innerHTML = `
        <div class="flex items-center gap-2 mb-3 px-1">
            <i data-lucide="file-text" class="w-4 h-4 text-slate-400"></i>
            <span class="text-xs font-bold text-slate-500 uppercase tracking-wider">Page Copy</span>
            <span class="text-[10px] text-slate-300 font-medium">${items.length} item${items.length !== 1 ? 's' : ''}</span>
        </div>
        ${items.map((item, idx) => renderSectionCopyCard(item, idx, pageMeta)).join('')}
    `;
    
    wireUpSectionCopyCards(container);
    if (window.lucide) window.lucide.createIcons();
}

function renderSectionCopyCard(item, idx, pageMeta) {
    const isRich = getCopyType(item.id) === 'rich';
    return `
    <div class="copy-card card-editable rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden fade-up-in" data-copy-id="${item.id}" data-content-en="${escapeHtml(item.content_en || '')}" id="copy-card-${item.id}" style="animation-delay: ${idx * 40}ms">
        <div class="section-copy-view cursor-pointer member-card-preview" data-id="${item.id}">
            <div class="group relative flex min-h-[90px]">
                <div class="w-1.5 flex-shrink-0" style="background: ${pageMeta.color}"></div>
                <div class="w-16 relative overflow-hidden flex-shrink-0 flex items-center justify-center" style="background: ${pageMeta.color}08">
                    <i data-lucide="${isRich ? 'file-text' : 'type'}" class="w-5 h-5" style="color: ${pageMeta.color}"></i>
                    <div class="edit-overlay"><span class="bg-white/95 backdrop-blur shadow-lg rounded-full px-3 py-1.5 text-xs font-bold text-slate-700 flex items-center gap-1.5"><i data-lucide="pencil" class="w-3 h-3"></i></span></div>
                </div>
                <div class="flex-1 p-4 flex flex-col justify-center min-w-0 relative">
                    <div class="absolute top-3 right-3 flex items-center gap-1.5"><span class="copy-type-badge ${isRich ? 'copy-type-rich' : 'copy-type-text'}">${isRich ? 'Rich' : 'Text'}</span></div>
                    <div class="pr-16">
                        <h3 class="font-display font-bold text-sm text-slate-900 leading-tight truncate">${item.id.split('_').slice(1).join('_') || item.id}</h3>
                        <code class="text-[10px] font-mono text-slate-400">${item.id}</code>
                    </div>
                    <div class="flex items-baseline gap-6 mt-1.5">
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-1 mb-0.5"><img src="https://flagcdn.com/w20/us.png" class="w-3 h-2.5 rounded-sm opacity-60"><span class="text-[9px] font-bold text-slate-300 uppercase">EN</span></div>
                            <p class="text-sm text-slate-700 truncate leading-snug">${(isRich ? truncateHtml(item.content_en, 100) : item.content_en) || '<span class="text-slate-300 italic">Empty</span>'}</p>
                        </div>
                        <div class="flex-1 min-w-0 hidden sm:block">
                            <div class="flex items-center gap-1 mb-0.5"><img src="https://flagcdn.com/w20/es.png" class="w-3 h-2.5 rounded-sm opacity-60"><span class="text-[9px] font-bold text-slate-300 uppercase">ES</span></div>
                            <p class="text-sm text-slate-400 truncate leading-snug">${(isRich ? truncateHtml(item.content_es, 80) : item.content_es) || '<span class="text-slate-200 italic">—</span>'}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div class="section-copy-edit hidden border-t border-indigo-100 bg-gradient-to-b from-indigo-50/40 to-white" id="copy-edit-${item.id}">
            <div class="p-5 space-y-4">
                <div class="flex items-center gap-2 mb-1">
                    <code class="text-[11px] font-bold font-mono text-brand-700 bg-brand-50 px-2 py-0.5 rounded border border-brand-100">${item.id}</code>
                    <span class="copy-type-badge ${isRich ? 'copy-type-rich' : 'copy-type-text'}">${isRich ? 'Rich Text' : 'Plain Text'}</span>
                </div>
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div>
                        <label class="adm-label"><span class="inline-flex items-center gap-1"><img src="https://flagcdn.com/w20/us.png" class="w-3 h-2.5 rounded-sm"> English</span></label>
                        ${isRich ? `<div class="rounded-lg border border-gray-200 overflow-hidden bg-white"><div class="ce-quill-en" style="min-height: 100px">${item.content_en || ''}</div></div>` : `<input type="text" class="adm-input ce-input-en" value="${escapeHtml(item.content_en || '')}">`}
                    </div>
                    <div>
                        <label class="adm-label"><span class="inline-flex items-center gap-1"><img src="https://flagcdn.com/w20/es.png" class="w-3 h-2.5 rounded-sm"> Español</span></label>
                        ${isRich ? `<div class="rounded-lg border border-gray-200 overflow-hidden bg-white"><div class="ce-quill-es" style="min-height: 100px">${item.content_es || ''}</div></div>` : `<input type="text" class="adm-input ce-input-es" value="${escapeHtml(item.content_es || '')}">`}
                    </div>
                </div>
                <div class="flex items-center justify-between pt-2">
                    <button class="adm-btn adm-btn-ghost ce-cancel-btn"><i data-lucide="x" class="w-3 h-3"></i> Cancel</button>
                    <button class="adm-btn adm-btn-primary ce-save-btn"><i data-lucide="check" class="w-3 h-3"></i> Save Changes</button>
                </div>
            </div>
        </div>
    </div>`;
}

function wireUpSectionCopyCards(container) { 
    container.querySelectorAll('.section-copy-view').forEach(view => { 
        view.addEventListener('click', () => expandCopyCard(view.dataset.id)); 
    }); 
}

function renderCopyCard(item, idx, pageMeta) {
    const isRich = getCopyType(item.id) === 'rich';
    return `
    <div class="copy-card card-editable rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden" data-copy-id="${item.id}" data-content-en="${escapeHtml(item.content_en || '')}" id="copy-card-${item.id}" style="animation-delay: ${idx * 25}ms">
        <div class="copy-card-view cursor-pointer member-card-preview px-4 py-3" data-id="${item.id}">
            <div class="flex items-start gap-3">
                <div class="w-1 self-stretch rounded-full flex-shrink-0 mt-0.5" style="background: ${pageMeta.color}40"></div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-1">
                        <code class="text-[11px] font-bold font-mono text-slate-600">${item.id.split('_').slice(1).join('_') || item.id}</code>
                        <span class="copy-type-badge ${isRich ? 'copy-type-rich' : 'copy-type-text'}">${isRich ? 'Rich' : 'Text'}</span>
                    </div>
                    <div class="flex items-baseline gap-4">
                        <div class="flex-1 min-w-0"><p class="text-sm text-slate-800 truncate leading-snug">${(isRich ? truncateHtml(item.content_en, 100) : item.content_en) || '<span class="text-slate-300 italic">Empty</span>'}</p></div>
                        <div class="flex-1 min-w-0 hidden sm:block"><p class="text-sm text-slate-400 truncate leading-snug">${(isRich ? truncateHtml(item.content_es, 80) : item.content_es) || '<span class="text-slate-200 italic">—</span>'}</p></div>
                    </div>
                </div>
                <div class="flex items-center gap-1 text-xs text-brand-500 font-semibold flex-shrink-0 pt-0.5 opacity-0 group-hover:opacity-100 transition-opacity"><i data-lucide="pencil" class="w-3 h-3"></i></div>
            </div>
        </div>
        <div class="copy-card-edit hidden border-t border-indigo-100 bg-gradient-to-b from-indigo-50/30 to-white" id="copy-edit-${item.id}">
            <div class="p-4 space-y-3">
                <div class="flex items-center gap-2 mb-1">
                    <code class="text-[11px] font-bold font-mono text-brand-700 bg-brand-50 px-2 py-0.5 rounded border border-brand-100">${item.id}</code>
                    <span class="copy-type-badge ${isRich ? 'copy-type-rich' : 'copy-type-text'}">${isRich ? 'Rich Text' : 'Plain Text'}</span>
                </div>
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div>
                        <label class="adm-label"><span class="inline-flex items-center gap-1"><img src="https://flagcdn.com/w20/us.png" class="w-3 h-2.5 rounded-sm"> English</span></label>
                        ${isRich ? `<div class="rounded-lg border border-gray-200 overflow-hidden bg-white"><div class="ce-quill-en" style="min-height: 100px">${item.content_en || ''}</div></div>` : `<input type="text" class="adm-input ce-input-en" value="${escapeHtml(item.content_en || '')}">`}
                    </div>
                    <div>
                        <label class="adm-label"><span class="inline-flex items-center gap-1"><img src="https://flagcdn.com/w20/es.png" class="w-3 h-2.5 rounded-sm"> Español</span></label>
                        ${isRich ? `<div class="rounded-lg border border-gray-200 overflow-hidden bg-white"><div class="ce-quill-es" style="min-height: 100px">${item.content_es || ''}</div></div>` : `<input type="text" class="adm-input ce-input-es" value="${escapeHtml(item.content_es || '')}">`}
                    </div>
                </div>
                <div class="flex items-center justify-between pt-1">
                    <button class="adm-btn adm-btn-ghost ce-cancel-btn"><i data-lucide="x" class="w-3 h-3"></i> Cancel</button>
                    <button class="adm-btn adm-btn-primary ce-save-btn"><i data-lucide="check" class="w-3 h-3"></i> Save Changes</button>
                </div>
            </div>
        </div>
    </div>`;
}

function wireUpCopyCards(container) { 
    container.querySelectorAll('.copy-card-view').forEach(view => { 
        view.addEventListener('click', () => expandCopyCard(view.dataset.id)); 
    }); 
}

function expandCopyCard(id) {
    document.querySelectorAll('.copy-card.is-editing').forEach(card => { 
        if (card.dataset.copyId !== id) collapseCopyCard(card.dataset.copyId); 
    });
    
    const wrapper = document.getElementById(`copy-card-${id}`);
    const editPanel = document.getElementById(`copy-edit-${id}`);
    
    if (!wrapper || !editPanel || wrapper.classList.contains('is-editing')) return;

    wrapper.classList.add('is-editing');
    editPanel.classList.remove('hidden');

    if (getCopyType(id) === 'rich' && window.Quill) {
        if (!quillRegistry.has(`copy-en-${id}`)) {
            quillRegistry.set(`copy-en-${id}`, new Quill(editPanel.querySelector('.ce-quill-en'), { theme: 'snow', modules: { toolbar: quillToolbarOptions } }));
        }
        if (!quillRegistry.has(`copy-es-${id}`)) {
            quillRegistry.set(`copy-es-${id}`, new Quill(editPanel.querySelector('.ce-quill-es'), { theme: 'snow', modules: { toolbar: quillToolbarOptions } }));
        }
    }

    editPanel.querySelector('.ce-cancel-btn').onclick = () => collapseCopyCard(id);
    editPanel.querySelector('.ce-save-btn').onclick = () => saveCopyCard(id, editPanel);
    wrapper.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    
    if (window.lucide) window.lucide.createIcons();
}

function collapseCopyCard(id) {
    const wrapper = document.getElementById(`copy-card-${id}`);
    const editPanel = document.getElementById(`copy-edit-${id}`);
    if (!wrapper || !editPanel) return;
    
    wrapper.classList.remove('is-editing');
    editPanel.classList.add('hidden');
    
    quillRegistry.delete(`copy-en-${id}`); 
    quillRegistry.delete(`copy-es-${id}`);
}

async function saveCopyCard(id, panel) {
    const saveBtn = panel.querySelector('.ce-save-btn');
    const origHtml = saveBtn.innerHTML;
    saveBtn.innerHTML = `<i data-lucide="loader-2" class="w-3 h-3 animate-spin"></i> Saving…`;
    saveBtn.disabled = true;

    const isRich = getCopyType(id) === 'rich';
    const en = isRich ? (quillRegistry.get(`copy-en-${id}`)?.root.innerHTML || '') : (panel.querySelector('.ce-input-en')?.value || '');
    const es = isRich ? (quillRegistry.get(`copy-es-${id}`)?.root.innerHTML || '') : (panel.querySelector('.ce-input-es')?.value || '');

    const { error } = await supabase.from('site_copy').update({ 
        content_en: en, 
        content_es: es, 
        is_html: isRich, 
        updated_at: new Date() 
    }).eq('id', id);
    
    saveBtn.disabled = false;

    if (!error) {
        // Update local arrays immediately
        [allCopyData, generalCopyData, committeeCopyData, orgsCopyData].forEach(arr => { 
            const idx = arr.findIndex(c => c.id === id); 
            if (idx !== -1) arr[idx] = { ...arr[idx], content_en: en, content_es: es, is_html: isRich }; 
        });
        
        saveBtn.innerHTML = `<i data-lucide="check" class="w-3 h-3"></i> Saved!`; 
        saveBtn.style.background = '#059669';
        
        setTimeout(() => {
            collapseCopyCard(id);
            const gc = document.getElementById('general-content');
            
            // Re-render the container to reflect new text
            if (gc && generalCopyData.find(c => c.id === id)) renderGeneralCopyCards(gc);
            if (committeeCopyData.find(c => c.id === id)) renderSectionCopyCards('committee-copy-cards', committeeCopyData, PAGE_META.committee);
            if (orgsCopyData.find(c => c.id === id)) renderSectionCopyCards('orgs-copy-cards', orgsCopyData, PAGE_META.network);
            
            setFlash('Copy updated', 1500);
        }, 600);
    } else { 
        saveBtn.innerHTML = origHtml; 
        setFlash('Error saving', 2000); 
    }
    
    if (window.lucide) window.lucide.createIcons();
}


// ==========================================
// COMMITTEE ADMIN (WITH IMAGE UPLOADS)
// ==========================================

let committeeData = [];

async function loadCommitteeAdmin() {
    const { data } = await supabase.from('committee_members').select('*').order('display_order');
    committeeData = data || [];
    renderCommitteeCards(document.getElementById('committee-admin-grid'));
}

function renderCommitteeCards(grid) {
    grid.innerHTML = committeeData.map((m, idx) => renderMemberCard(m, idx)).join('') + `
        <button class="adm-btn-add mt-4" id="addMemberBtn">
            <i data-lucide="plus-circle" class="w-5 h-5"></i> Add New Member
        </button>`;
        
    grid.querySelectorAll('.member-card-view').forEach(card => {
        card.addEventListener('click', (e) => { 
            if (!e.target.closest('.card-action-btn')) expandMemberCard(card.dataset.id); 
        });
    });
    
    grid.querySelectorAll('.card-delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => { 
            e.stopPropagation(); 
            deleteMember(btn.dataset.id); 
        });
    });
    
    document.getElementById('addMemberBtn').onclick = () => addNewMember();
    if (window.lucide) window.lucide.createIcons();
}

function renderMemberCard(m, idx) {
    const theme = getThemeClasses(m.color_theme || 'purple');
    const barColor = { purple: '#7c3aed', amber: '#f59e0b', blue: '#2563eb', emerald: '#10b981', red: '#dc2626' }[m.color_theme] || '#7c3aed';

    return `
    <div class="card-editable rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden fade-up-in" style="animation-delay: ${idx * 40}ms" data-member-id="${m.id}" id="member-card-${m.id}">
        <!-- VIEW MODE -->
        <div class="member-card-view cursor-pointer" data-id="${m.id}">
            <div class="group relative flex min-h-[130px]">
                <div class="w-1.5 flex-shrink-0" style="background: ${barColor}"></div>
                <div class="w-28 relative overflow-hidden flex-shrink-0 bg-gray-100">
                    <img src="${m.image_url || ''}" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(m.name || 'M')}&background=f1f5f9&color=64748b&bold=true'" loading="lazy">
                    <div class="edit-overlay"><span class="bg-white/95 backdrop-blur shadow-lg rounded-full px-3 py-1.5 text-xs font-bold text-slate-700 flex items-center gap-1.5"><i data-lucide="pencil" class="w-3 h-3"></i> Edit</span></div>
                </div>
                <div class="flex-1 p-4 flex flex-col justify-center min-w-0 relative">
                    <div class="absolute top-3 right-3 flex items-center gap-1.5">
                        <span class="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border border-gray-100 ${theme.badge}">${m.badge_text || 'ASF'}</span>
                        <span class="text-[9px] font-mono text-slate-300 bg-slate-50 px-1.5 py-0.5 rounded">#${m.display_order || 0}</span>
                        <button class="card-action-btn card-delete-btn p-1 rounded hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors" data-id="${m.id}" title="Remove member"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
                    </div>
                    <div class="pr-24">
                        <h3 class="font-display font-bold text-lg text-slate-900 leading-tight truncate">${m.name || 'Untitled'}</h3>
                        <p class="text-xs font-bold text-slate-400 uppercase tracking-wider truncate mb-0.5">${m.institution || '—'}</p>
                        <p class="text-xs font-medium text-slate-500 mb-2">${m.role_en || '—'}</p>
                    </div>
                    <div class="text-sm text-slate-600 line-clamp-2 prose prose-sm leading-snug">${m.description_en || '<em class="text-slate-300">No bio yet</em>'}</div>
                </div>
            </div>
        </div>

        <!-- EDIT MODE -->
        <div class="member-card-edit hidden border-t border-indigo-100 bg-gradient-to-b from-indigo-50/40 to-white" id="member-edit-${m.id}">
            <div class="p-5 space-y-4">
                <div class="grid grid-cols-3 gap-3">
                    <div><label class="adm-label">Full Name</label><input type="text" class="adm-input me-name" value="${escapeHtml(m.name || '')}"></div>
                    <div><label class="adm-label">Institution</label><input type="text" class="adm-input me-inst" value="${escapeHtml(m.institution || '')}"></div>
                    <div><label class="adm-label">Badge</label><input type="text" class="adm-input me-badge" value="${escapeHtml(m.badge_text || 'ASF')}"></div>
                </div>
                <div class="grid grid-cols-2 gap-3">
                    <div><label class="adm-label"><span class="inline-flex items-center gap-1"><img src="https://flagcdn.com/w20/us.png" class="w-3 h-2.5 rounded-sm"> Role</span></label><input type="text" class="adm-input me-role-en" value="${escapeHtml(m.role_en || '')}"></div>
                    <div><label class="adm-label"><span class="inline-flex items-center gap-1"><img src="https://flagcdn.com/w20/es.png" class="w-3 h-2.5 rounded-sm"> Rol</span></label><input type="text" class="adm-input me-role-es" value="${escapeHtml(m.role_es || '')}"></div>
                </div>
                <div class="grid grid-cols-12 gap-3">
                    
                    <!-- NEW UPLOADER SECTION -->
                    <div class="col-span-12 md:col-span-7">
                        <label class="adm-label">Profile Image</label>
                        <div class="flex items-center gap-3 mt-1">
                            <div class="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden border border-gray-200 shrink-0">
                                <img id="me-img-preview-${m.id}" src="${escapeHtml(m.image_url || '')}" class="w-full h-full object-cover" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(m.name || 'M')}&background=f1f5f9&color=64748b'">
                            </div>
                            <div class="flex-1">
                                <input type="file" id="me-img-input-${m.id}" accept="image/*" class="hidden">
                                <input type="hidden" id="me-img-url-${m.id}" value="${escapeHtml(m.image_url || '')}">
                                <div class="flex gap-1.5">
                                    <button type="button" class="adm-btn adm-btn-ghost text-[11px] px-2 py-1" onclick="document.getElementById('me-img-input-${m.id}').click()">
                                        <i data-lucide="upload" class="w-3 h-3"></i> Upload
                                    </button>
                                    <button type="button" class="adm-btn adm-btn-danger text-[11px] px-2 py-1" id="me-img-remove-${m.id}">
                                        <i data-lucide="trash" class="w-3 h-3"></i> Remove
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="col-span-6 md:col-span-2"><label class="adm-label">Order</label><input type="number" class="adm-input me-order" value="${m.display_order || 0}"></div>
                    <div class="col-span-6 md:col-span-3">
                        <label class="adm-label">Theme</label>
                        <div class="flex items-center gap-1.5 mt-1.5">
                            ${THEME_OPTIONS.map(t => `<div class="theme-dot ${m.color_theme === t.value ? 'active' : ''}" style="background: ${t.dot}" data-theme="${t.value}" title="${t.label}"></div>`).join('')}
                        </div>
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="adm-label"><span class="inline-flex items-center gap-1"><img src="https://flagcdn.com/w20/us.png" class="w-3 h-2.5 rounded-sm"> Bio</span></label>
                        <div class="rounded-lg border border-gray-200 overflow-hidden bg-white"><div class="me-bio-en" style="min-height: 90px">${m.description_en || ''}</div></div>
                    </div>
                    <div>
                        <label class="adm-label"><span class="inline-flex items-center gap-1"><img src="https://flagcdn.com/w20/es.png" class="w-3 h-2.5 rounded-sm"> Bio</span></label>
                        <div class="rounded-lg border border-gray-200 overflow-hidden bg-white"><div class="me-bio-es" style="min-height: 90px">${m.description_es || ''}</div></div>
                    </div>
                </div>
                <div class="flex items-center justify-between pt-2">
                    <button class="adm-btn adm-btn-ghost me-cancel-btn"><i data-lucide="x" class="w-3 h-3"></i> Cancel</button>
                    <button class="adm-btn adm-btn-primary me-save-btn"><i data-lucide="check" class="w-3 h-3"></i> Save Changes</button>
                </div>
            </div>
        </div>
    </div>`;
}

function expandMemberCard(id) {
    document.querySelectorAll('.card-editable[data-member-id].is-editing').forEach(card => { 
        if (card.dataset.memberId !== id) collapseMemberCard(card.dataset.memberId); 
    });
    
    const wrapper = document.getElementById(`member-card-${id}`);
    const editPanel = document.getElementById(`member-edit-${id}`);
    if (!wrapper || !editPanel || wrapper.classList.contains('is-editing')) return;

    wrapper.classList.add('is-editing'); 
    editPanel.classList.remove('hidden');

    if (!quillRegistry.has(`member-bio-en-${id}`)) {
        quillRegistry.set(`member-bio-en-${id}`, new Quill(editPanel.querySelector('.me-bio-en'), { theme: 'snow', modules: { toolbar: [['bold', 'italic'], ['clean']] } }));
    }
    if (!quillRegistry.has(`member-bio-es-${id}`)) {
        quillRegistry.set(`member-bio-es-${id}`, new Quill(editPanel.querySelector('.me-bio-es'), { theme: 'snow', modules: { toolbar: [['bold', 'italic'], ['clean']] } }));
    }

    // Attach Image uploader listeners
    setupImageUploader(editPanel, 'me-img', id);

    editPanel.querySelectorAll('.theme-dot').forEach(dot => {
        dot.onclick = () => { 
            editPanel.querySelectorAll('.theme-dot').forEach(d => d.classList.remove('active')); 
            dot.classList.add('active'); 
        };
    });
    
    editPanel.querySelector('.me-cancel-btn').onclick = () => collapseMemberCard(id);
    editPanel.querySelector('.me-save-btn').onclick = () => saveMemberCard(id, editPanel);
    wrapper.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    if (window.lucide) window.lucide.createIcons();
}

function collapseMemberCard(id) {
    const wrapper = document.getElementById(`member-card-${id}`);
    const editPanel = document.getElementById(`member-edit-${id}`);
    if (!wrapper || !editPanel) return;
    
    wrapper.classList.remove('is-editing'); 
    editPanel.classList.add('hidden');
    
    quillRegistry.delete(`member-bio-en-${id}`); 
    quillRegistry.delete(`member-bio-es-${id}`);
}

async function saveMemberCard(id, panel) {
    const saveBtn = panel.querySelector('.me-save-btn');
    const origHtml = saveBtn.innerHTML;
    saveBtn.innerHTML = `<i data-lucide="loader-2" class="w-3 h-3 animate-spin"></i> Saving…`;
    saveBtn.disabled = true;

    // Process File Uploads first
    const imageUrl = await processImageUpload(panel, 'me-img', id, 'committee');

    const payload = {
        name: panel.querySelector('.me-name').value,
        institution: panel.querySelector('.me-inst').value,
        badge_text: panel.querySelector('.me-badge').value,
        role_en: panel.querySelector('.me-role-en').value,
        role_es: panel.querySelector('.me-role-es').value,
        image_url: imageUrl,
        display_order: parseInt(panel.querySelector('.me-order').value) || 0,
        color_theme: panel.querySelector('.theme-dot.active')?.dataset.theme || 'purple',
        description_en: quillRegistry.get(`member-bio-en-${id}`)?.root.innerHTML || '',
        description_es: quillRegistry.get(`member-bio-es-${id}`)?.root.innerHTML || '',
    };

    const { error } = await supabase.from('committee_members').update(payload).eq('id', id);
    saveBtn.disabled = false;
    
    if (!error) {
        saveBtn.innerHTML = `<i data-lucide="check" class="w-3 h-3"></i> Saved!`; 
        saveBtn.style.background = '#059669';
        
        const idx = committeeData.findIndex(m => m.id === id);
        if (idx !== -1) committeeData[idx] = { ...committeeData[idx], ...payload };
        
        setTimeout(() => { 
            collapseMemberCard(id); 
            renderCommitteeCards(document.getElementById('committee-admin-grid')); 
            setFlash('Member updated', 1500); 
        }, 600);
    } else { 
        saveBtn.innerHTML = origHtml; 
        setFlash('Error saving member', 2000); 
    }
    if (window.lucide) window.lucide.createIcons();
}

async function addNewMember() {
    const maxOrder = committeeData.reduce((max, m) => Math.max(max, m.display_order || 0), 0);
    const payload = { 
        name: 'New Member', 
        institution: '', 
        role_en: 'Role', 
        role_es: '', 
        badge_text: 'ASF', 
        image_url: '', 
        display_order: maxOrder + 1, 
        color_theme: 'purple', 
        description_en: '', 
        description_es: '' 
    };
    
    const { data, error } = await supabase.from('committee_members').insert([payload]).select();
    if (!error && data) {
        committeeData.push(data[0]); 
        renderCommitteeCards(document.getElementById('committee-admin-grid'));
        setTimeout(() => expandMemberCard(data[0].id), 100); 
        setFlash('Member added', 2000);
    } else { 
        setFlash('Error adding member: ' + error?.message, 3000); 
    }
}

async function deleteMember(id) {
    if (!confirm(`Remove this member?`)) return;
    const { error } = await supabase.from('committee_members').delete().eq('id', id);
    if (!error) {
        committeeData = committeeData.filter(m => m.id !== id);
        const card = document.getElementById(`member-card-${id}`);
        if (card) {
            card.style.transition = 'all 0.3s'; card.style.opacity = '0'; card.style.transform = 'scale(0.95) translateY(-8px)'; card.style.maxHeight = card.offsetHeight + 'px';
            setTimeout(() => { card.style.maxHeight = '0'; card.style.padding = '0'; card.style.margin = '0'; card.style.border = 'none'; }, 200);
            setTimeout(() => renderCommitteeCards(document.getElementById('committee-admin-grid')), 500);
        }
        setFlash('Member removed', 1500);
    }
}


// ==========================================
// ORGANIZATIONS ADMIN (WITH IMAGE UPLOADS)
// ==========================================

let orgsData = [];

async function loadOrgsAdmin() {
    const { data } = await supabase.from('partner_organizations').select('*').order('display_order');
    orgsData = data || [];
    renderOrgCards(document.getElementById('orgs-admin-grid'));
}

function renderOrgCards(grid) {
    grid.innerHTML = orgsData.map((o, idx) => renderOrgCard(o, idx)).join('') + `
        <button class="adm-btn-add mt-4" id="addOrgBtn">
            <i data-lucide="plus-circle" class="w-5 h-5"></i> Add New Organization
        </button>`;
        
    grid.querySelectorAll('.org-card-view').forEach(card => {
        card.addEventListener('click', (e) => { 
            if (!e.target.closest('.card-action-btn')) expandOrgCard(card.dataset.id); 
        });
    });
    
    grid.querySelectorAll('.org-delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => { 
            e.stopPropagation(); 
            deleteOrg(btn.dataset.id); 
        });
    });
    
    document.getElementById('addOrgBtn').onclick = () => addNewOrg();
    if (window.lucide) window.lucide.createIcons();
}

function renderOrgCard(o, idx) {
    const theme = getThemeClasses(o.color_theme || 'purple');
    const barColor = { purple: '#7c3aed', amber: '#f59e0b', blue: '#2563eb', emerald: '#10b981', red: '#dc2626' }[o.color_theme] || '#7c3aed';

    return `
    <div class="card-editable rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden fade-up-in" style="animation-delay: ${idx * 40}ms" data-org-id="${o.id}" id="org-card-${o.id}">
        <!-- VIEW MODE -->
        <div class="org-card-view cursor-pointer member-card-preview" data-id="${o.id}">
            <div class="group relative flex min-h-[100px]">
                <div class="w-1.5 flex-shrink-0" style="background: ${barColor}"></div>
                <div class="w-20 relative overflow-hidden flex-shrink-0 bg-slate-50 flex items-center justify-center p-2">
                    <img src="${o.logo_url || ''}" class="w-full h-full object-contain" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(o.acronym || 'O')}&background=f1f5f9&color=64748b'" loading="lazy">
                    <div class="edit-overlay"><span class="bg-white/95 backdrop-blur shadow-lg rounded-full px-3 py-1.5 text-xs font-bold text-slate-700 flex items-center gap-1.5"><i data-lucide="pencil" class="w-3 h-3"></i></span></div>
                </div>
                <div class="flex-1 p-4 flex flex-col justify-center min-w-0 relative">
                    <div class="absolute top-3 right-3 flex items-center gap-1.5">
                        <span class="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border border-gray-100 ${theme.badge}">${o.acronym || 'ORG'}</span>
                        <span class="text-[9px] font-mono text-slate-300 bg-slate-50 px-1.5 py-0.5 rounded">#${o.display_order || 0}</span>
                        <button class="card-action-btn org-delete-btn p-1 rounded hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors" data-id="${o.id}" title="Remove"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
                    </div>
                    <div class="pr-28">
                        <h3 class="font-display font-bold text-base text-slate-900 leading-tight truncate">${o.name || 'Untitled'}</h3>
                        <p class="text-xs text-slate-400 truncate mt-0.5">${o.url || '—'}</p>
                    </div>
                    <div class="text-sm text-slate-500 line-clamp-2 mt-1 prose prose-sm">${o.description_en || '<em class="text-slate-300">No description</em>'}</div>
                </div>
            </div>
        </div>

        <!-- EDIT MODE -->
        <div class="org-card-edit hidden border-t border-indigo-100 bg-gradient-to-b from-indigo-50/40 to-white" id="org-edit-${o.id}">
            <div class="p-5 space-y-4">
                <div class="grid grid-cols-3 gap-3">
                    <div><label class="adm-label">Organization Name</label><input type="text" class="adm-input oe-name" value="${escapeHtml(o.name || '')}"></div>
                    <div><label class="adm-label">Acronym</label><input type="text" class="adm-input oe-acr" value="${escapeHtml(o.acronym || '')}"></div>
                    <div><label class="adm-label">Website URL</label><input type="text" class="adm-input oe-url" value="${escapeHtml(o.url || '')}"></div>
                </div>
                <div class="grid grid-cols-12 gap-3">
                    
                    <!-- NEW LOGO UPLOADER -->
                    <div class="col-span-6 md:col-span-4">
                        <label class="adm-label">Logo Image</label>
                        <div class="flex items-center gap-2 mt-1">
                            <div class="w-10 h-10 rounded bg-gray-50 border border-gray-200 shrink-0 p-1">
                                <img id="oe-logo-preview-${o.id}" src="${escapeHtml(o.logo_url || '')}" class="w-full h-full object-contain" onerror="this.src='https://ui-avatars.com/api/?name=L&background=f1f5f9'">
                            </div>
                            <div class="flex-1">
                                <input type="file" id="oe-logo-input-${o.id}" accept="image/*" class="hidden">
                                <input type="hidden" id="oe-logo-url-${o.id}" value="${escapeHtml(o.logo_url || '')}">
                                <div class="flex gap-1">
                                    <button type="button" class="adm-btn adm-btn-ghost text-[10px] px-2 py-1" onclick="document.getElementById('oe-logo-input-${o.id}').click()"><i data-lucide="upload" class="w-3 h-3"></i></button>
                                    <button type="button" class="adm-btn adm-btn-danger text-[10px] px-2 py-1" id="oe-logo-remove-${o.id}"><i data-lucide="trash" class="w-3 h-3"></i></button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- NEW BACKGROUND UPLOADER -->
                    <div class="col-span-6 md:col-span-4">
                        <label class="adm-label">Background Image</label>
                        <div class="flex items-center gap-2 mt-1">
                            <div class="w-10 h-10 rounded bg-gray-50 border border-gray-200 shrink-0 overflow-hidden">
                                <img id="oe-img-preview-${o.id}" src="${escapeHtml(o.image_url || '')}" class="w-full h-full object-cover" onerror="this.src='https://ui-avatars.com/api/?name=BG&background=f1f5f9'">
                            </div>
                            <div class="flex-1">
                                <input type="file" id="oe-img-input-${o.id}" accept="image/*" class="hidden">
                                <input type="hidden" id="oe-img-url-${o.id}" value="${escapeHtml(o.image_url || '')}">
                                <div class="flex gap-1">
                                    <button type="button" class="adm-btn adm-btn-ghost text-[10px] px-2 py-1" onclick="document.getElementById('oe-img-input-${o.id}').click()"><i data-lucide="upload" class="w-3 h-3"></i></button>
                                    <button type="button" class="adm-btn adm-btn-danger text-[10px] px-2 py-1" id="oe-img-remove-${o.id}"><i data-lucide="trash" class="w-3 h-3"></i></button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="col-span-6 md:col-span-1"><label class="adm-label">Order</label><input type="number" class="adm-input oe-order" value="${o.display_order || 0}"></div>
                    <div class="col-span-6 md:col-span-3">
                        <label class="adm-label">Theme</label>
                        <div class="flex items-center gap-1.5 mt-1.5">
                            ${THEME_OPTIONS.map(t => `<div class="theme-dot ${o.color_theme === t.value ? 'active' : ''}" style="background: ${t.dot}" data-theme="${t.value}" title="${t.label}"></div>`).join('')}
                        </div>
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="adm-label"><span class="inline-flex items-center gap-1"><img src="https://flagcdn.com/w20/us.png" class="w-3 h-2.5 rounded-sm"> Description</span></label>
                        <div class="rounded-lg border border-gray-200 overflow-hidden bg-white"><div class="oe-desc-en" style="min-height: 90px">${o.description_en || ''}</div></div>
                    </div>
                    <div>
                        <label class="adm-label"><span class="inline-flex items-center gap-1"><img src="https://flagcdn.com/w20/es.png" class="w-3 h-2.5 rounded-sm"> Descripción</span></label>
                        <div class="rounded-lg border border-gray-200 overflow-hidden bg-white"><div class="oe-desc-es" style="min-height: 90px">${o.description_es || ''}</div></div>
                    </div>
                </div>
                <div class="flex items-center justify-between pt-2">
                    <button class="adm-btn adm-btn-ghost oe-cancel-btn"><i data-lucide="x" class="w-3 h-3"></i> Cancel</button>
                    <button class="adm-btn adm-btn-primary oe-save-btn"><i data-lucide="check" class="w-3 h-3"></i> Save Changes</button>
                </div>
            </div>
        </div>
    </div>`;
}

function expandOrgCard(id) {
    document.querySelectorAll('.card-editable[data-org-id].is-editing').forEach(card => { 
        if (card.dataset.orgId !== id) collapseOrgCard(card.dataset.orgId); 
    });
    
    const wrapper = document.getElementById(`org-card-${id}`);
    const editPanel = document.getElementById(`org-edit-${id}`);
    if (!wrapper || !editPanel || wrapper.classList.contains('is-editing')) return;

    wrapper.classList.add('is-editing'); 
    editPanel.classList.remove('hidden');

    if (!quillRegistry.has(`org-desc-en-${id}`)) {
        quillRegistry.set(`org-desc-en-${id}`, new Quill(editPanel.querySelector('.oe-desc-en'), { theme: 'snow', modules: { toolbar: [['bold', 'italic'], ['clean']] } }));
    }
    if (!quillRegistry.has(`org-desc-es-${id}`)) {
        quillRegistry.set(`org-desc-es-${id}`, new Quill(editPanel.querySelector('.oe-desc-es'), { theme: 'snow', modules: { toolbar: [['bold', 'italic'], ['clean']] } }));
    }

    // Attach Image Uploader listeners
    setupImageUploader(editPanel, 'oe-logo', id);
    setupImageUploader(editPanel, 'oe-img', id);

    editPanel.querySelectorAll('.theme-dot').forEach(dot => {
        dot.onclick = () => { 
            editPanel.querySelectorAll('.theme-dot').forEach(d => d.classList.remove('active')); 
            dot.classList.add('active'); 
        };
    });
    
    editPanel.querySelector('.oe-cancel-btn').onclick = () => collapseOrgCard(id);
    editPanel.querySelector('.oe-save-btn').onclick = () => saveOrgCard(id, editPanel);
    wrapper.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    if (window.lucide) window.lucide.createIcons();
}

function collapseOrgCard(id) {
    const wrapper = document.getElementById(`org-card-${id}`);
    const editPanel = document.getElementById(`org-edit-${id}`);
    if (!wrapper || !editPanel) return;
    
    wrapper.classList.remove('is-editing'); 
    editPanel.classList.add('hidden');
    
    quillRegistry.delete(`org-desc-en-${id}`); 
    quillRegistry.delete(`org-desc-es-${id}`);
}

async function saveOrgCard(id, panel) {
    const saveBtn = panel.querySelector('.oe-save-btn');
    const origHtml = saveBtn.innerHTML;
    saveBtn.innerHTML = `<i data-lucide="loader-2" class="w-3 h-3 animate-spin"></i> Saving…`;
    saveBtn.disabled = true;

    // Process file uploads first
    const logoUrl = await processImageUpload(panel, 'oe-logo', id, 'organizations');
    const bgUrl = await processImageUpload(panel, 'oe-img', id, 'organizations');

    const payload = {
        name: panel.querySelector('.oe-name').value,
        acronym: panel.querySelector('.oe-acr').value,
        url: panel.querySelector('.oe-url').value,
        logo_url: logoUrl,
        image_url: bgUrl,
        display_order: parseInt(panel.querySelector('.oe-order').value) || 0,
        color_theme: panel.querySelector('.theme-dot.active')?.dataset.theme || 'purple',
        description_en: quillRegistry.get(`org-desc-en-${id}`)?.root.innerHTML || '',
        description_es: quillRegistry.get(`org-desc-es-${id}`)?.root.innerHTML || '',
    };

    const { error } = await supabase.from('partner_organizations').update(payload).eq('id', id);
    saveBtn.disabled = false;
    
    if (!error) {
        saveBtn.innerHTML = `<i data-lucide="check" class="w-3 h-3"></i> Saved!`; 
        saveBtn.style.background = '#059669';
        
        const idx = orgsData.findIndex(o => o.id === id);
        if (idx !== -1) orgsData[idx] = { ...orgsData[idx], ...payload };
        
        setTimeout(() => { 
            collapseOrgCard(id); 
            renderOrgCards(document.getElementById('orgs-admin-grid')); 
            setFlash('Organization updated', 1500); 
        }, 600);
    } else { 
        saveBtn.innerHTML = origHtml; 
        setFlash('Error saving organization', 2000); 
    }
    if (window.lucide) window.lucide.createIcons();
}

async function addNewOrg() {
    const maxOrder = orgsData.reduce((max, o) => Math.max(max, o.display_order || 0), 0);
    const payload = { 
        name: 'New Organization', 
        acronym: 'ORG', 
        url: 'https://', 
        logo_url: '', 
        image_url: '', 
        display_order: maxOrder + 1, 
        color_theme: 'blue', 
        description_en: '', 
        description_es: '' 
    };
    
    const { data, error } = await supabase.from('partner_organizations').insert([payload]).select();
    if (!error && data) {
        orgsData.push(data[0]); 
        renderOrgCards(document.getElementById('orgs-admin-grid'));
        setTimeout(() => expandOrgCard(data[0].id), 100); 
        setFlash('Organization added', 2000);
    } else { 
        setFlash('Error adding organization: ' + error?.message, 3000); 
    }
}

async function deleteOrg(id) {
    if (!confirm(`Remove this organization?`)) return;
    const { error } = await supabase.from('partner_organizations').delete().eq('id', id);
    if (!error) {
        orgsData = orgsData.filter(o => o.id !== id);
        const card = document.getElementById(`org-card-${id}`);
        if (card) {
            card.style.transition = 'all 0.3s'; card.style.opacity = '0'; card.style.transform = 'scale(0.95) translateY(-8px)'; card.style.maxHeight = card.offsetHeight + 'px';
            setTimeout(() => { card.style.maxHeight = '0'; card.style.padding = '0'; card.style.margin = '0'; card.style.border = 'none'; }, 200);
            setTimeout(() => renderOrgCards(document.getElementById('orgs-admin-grid')), 500);
        }
        setFlash('Organization removed', 1500);
    }
}