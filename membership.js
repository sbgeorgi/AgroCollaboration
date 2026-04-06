import { supabase } from './auth.js';
import { setFlash, escapeHtml } from './ui.js';

// ==========================================
// MEMBERSHIP MANAGEMENT SUITE
// ==========================================

// Module-level state
const memberState = {
    profiles: [],
    filtered: [],
    selected: new Set(),
    searchQuery: '',
    roleFilter: 'all',
    affiliationFilter: 'all',
    countryFilter: 'all',
    quickFilter: 'all', // 'all' | 'new_this_month' | 'new_this_week' | 'no_affiliation' | 'no_country' | 'incomplete_profile' | 'with_website' | 'with_scholar'
    sortField: 'full_name',
    sortDir: 'asc',
    page: 1,
    pageSize: 25,
    viewMode: 'table', // 'table' | 'grid'
    currentAuthState: null,
    containerId: null,
};

// ==========================================
// QUICK FILTER DEFINITIONS
// ==========================================
const QUICK_FILTERS = [
    {
        id: 'all',
        label: 'All Members',
        icon: 'users',
        color: 'slate',
        predicate: () => true,
    },
    {
        id: 'new_this_week',
        label: 'New This Week',
        icon: 'sparkles',
        color: 'amber',
        predicate: (p) => {
            if (!p.created_at) return false;
            const d = new Date();
            d.setDate(d.getDate() - 7);
            d.setHours(0, 0, 0, 0);
            return new Date(p.created_at) >= d;
        },
    },
    {
        id: 'new_this_month',
        label: 'New This Month',
        icon: 'calendar-plus',
        color: 'emerald',
        predicate: (p) => {
            if (!p.created_at) return false;
            const d = new Date();
            d.setDate(1);
            d.setHours(0, 0, 0, 0);
            return new Date(p.created_at) >= d;
        },
    },
    {
        id: 'no_affiliation',
        label: 'No Affiliation',
        icon: 'building-x',
        color: 'orange',
        predicate: (p) => !p.affiliation || p.affiliation.trim() === '',
    },
    {
        id: 'no_country',
        label: 'No Country',
        icon: 'map-pin-off',
        color: 'rose',
        predicate: (p) => !p.country || p.country.trim() === '',
    },
    {
        id: 'incomplete_profile',
        label: 'Incomplete Profile',
        icon: 'user-x',
        color: 'red',
        predicate: (p) =>
            !p.affiliation || !p.country || !p.description || !p.department,
    },
    {
        id: 'with_website',
        label: 'Has Website',
        icon: 'globe',
        color: 'indigo',
        predicate: (p) =>
            !!(p.personal_website || p.professional_website),
    },
    {
        id: 'with_scholar',
        label: 'Has Scholar',
        icon: 'graduation-cap',
        color: 'violet',
        predicate: (p) => !!p.google_scholar,
    },
];

function getQuickFilterDef(id) {
    return QUICK_FILTERS.find(f => f.id === id) || QUICK_FILTERS[0];
}

// Color maps for quick filter pills
const QF_COLOR = {
    slate:   { pill: 'bg-slate-100 text-slate-700 border-slate-200',   active: 'bg-slate-700 text-white border-slate-700',   dot: 'bg-slate-400'  },
    amber:   { pill: 'bg-amber-50 text-amber-700 border-amber-200',    active: 'bg-amber-500 text-white border-amber-500',    dot: 'bg-amber-400'  },
    emerald: { pill: 'bg-emerald-50 text-emerald-700 border-emerald-200', active: 'bg-emerald-600 text-white border-emerald-600', dot: 'bg-emerald-400' },
    orange:  { pill: 'bg-orange-50 text-orange-700 border-orange-200', active: 'bg-orange-500 text-white border-orange-500', dot: 'bg-orange-400'  },
    rose:    { pill: 'bg-rose-50 text-rose-700 border-rose-200',       active: 'bg-rose-500 text-white border-rose-500',     dot: 'bg-rose-400'   },
    red:     { pill: 'bg-red-50 text-red-700 border-red-200',          active: 'bg-red-600 text-white border-red-600',       dot: 'bg-red-400'    },
    indigo:  { pill: 'bg-indigo-50 text-indigo-700 border-indigo-200', active: 'bg-indigo-600 text-white border-indigo-600', dot: 'bg-indigo-400'  },
    violet:  { pill: 'bg-violet-50 text-violet-700 border-violet-200', active: 'bg-violet-600 text-white border-violet-600', dot: 'bg-violet-400'  },
};

// ==========================================
// DATA LOADING
// ==========================================
async function loadProfiles() {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
        if (!memberState.currentAuthState) memberState.currentAuthState = {};
        memberState.currentAuthState.profile = { id: user.id };
    }

    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('full_name', { ascending: true });

    if (error) throw error;
    memberState.profiles = data || [];
    applyFilters();
}

// ==========================================
// FILTERING, SORTING, PAGINATION
// ==========================================
function applyFilters() {
    let results = [...memberState.profiles];

    // Quick filter
    if (memberState.quickFilter !== 'all') {
        const def = getQuickFilterDef(memberState.quickFilter);
        if (def) results = results.filter(def.predicate);
    }

    // Text search
    if (memberState.searchQuery) {
        const q = memberState.searchQuery.toLowerCase();
        results = results.filter(p =>
            (p.full_name || '').toLowerCase().includes(q) ||
            (p.work_email || '').toLowerCase().includes(q) ||
            (p.username || '').toLowerCase().includes(q) ||
            (p.affiliation || '').toLowerCase().includes(q) ||
            (p.department || '').toLowerCase().includes(q) ||
            (p.fields_of_study || '').toLowerCase().includes(q) ||
            (p.country || '').toLowerCase().includes(q)
        );
    }

    // Role filter
    if (memberState.roleFilter !== 'all') {
        results = results.filter(p => p.role === memberState.roleFilter);
    }

    // Affiliation filter
    if (memberState.affiliationFilter !== 'all') {
        results = results.filter(p => (p.affiliation || '') === memberState.affiliationFilter);
    }

    // Country filter
    if (memberState.countryFilter !== 'all') {
        results = results.filter(p => (p.country || '') === memberState.countryFilter);
    }

    // Sort
    const field = memberState.sortField;
    const dir = memberState.sortDir === 'asc' ? 1 : -1;
    results.sort((a, b) => {
        let aVal = a[field] || '';
        let bVal = b[field] || '';

        if (field === 'created_at' || field === 'updated_at') {
            aVal = new Date(aVal || 0).getTime();
            bVal = new Date(bVal || 0).getTime();
            return (aVal - bVal) * dir;
        }

        return String(aVal).localeCompare(String(bVal), undefined, { sensitivity: 'base' }) * dir;
    });

    memberState.filtered = results;

    const totalPages = Math.max(1, Math.ceil(results.length / memberState.pageSize));
    if (memberState.page > totalPages) memberState.page = 1;
}

function getPageSlice() {
    const start = (memberState.page - 1) * memberState.pageSize;
    return memberState.filtered.slice(start, start + memberState.pageSize);
}

function getTotalPages() {
    return Math.max(1, Math.ceil(memberState.filtered.length / memberState.pageSize));
}

// ==========================================
// UNIQUE VALUES FOR FILTER DROPDOWNS
// ==========================================
function getUniqueAffiliations() {
    return [...new Set(memberState.profiles.map(p => p.affiliation).filter(Boolean))].sort();
}

function getUniqueCountries() {
    return [...new Set(memberState.profiles.map(p => p.country).filter(Boolean))].sort();
}

// ==========================================
// STATS CALCULATION
// ==========================================
function getStats() {
    const total = memberState.profiles.length;
    const roles = { member: 0, organizer: 0, admin: 0 };
    const countries = new Set();
    const affiliations = new Set();
    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);
    let newThisMonth = 0;

    memberState.profiles.forEach(p => {
        if (roles[p.role] !== undefined) roles[p.role]++;
        if (p.country) countries.add(p.country);
        if (p.affiliation) affiliations.add(p.affiliation);
        if (p.created_at && new Date(p.created_at) >= thisMonth) newThisMonth++;
    });

    return { total, roles, countries: countries.size, affiliations: affiliations.size, newThisMonth };
}

// Count how many profiles match each quick filter (applied on top of role/country/search but independently of quick filter itself)
function getQuickFilterCounts() {
    // Base set: apply text search + role + country filters only
    let base = [...memberState.profiles];

    if (memberState.searchQuery) {
        const q = memberState.searchQuery.toLowerCase();
        base = base.filter(p =>
            (p.full_name || '').toLowerCase().includes(q) ||
            (p.work_email || '').toLowerCase().includes(q) ||
            (p.username || '').toLowerCase().includes(q) ||
            (p.affiliation || '').toLowerCase().includes(q) ||
            (p.department || '').toLowerCase().includes(q) ||
            (p.fields_of_study || '').toLowerCase().includes(q) ||
            (p.country || '').toLowerCase().includes(q)
        );
    }
    if (memberState.roleFilter !== 'all') {
        base = base.filter(p => p.role === memberState.roleFilter);
    }
    if (memberState.countryFilter !== 'all') {
        base = base.filter(p => (p.country || '') === memberState.countryFilter);
    }

    const counts = {};
    QUICK_FILTERS.forEach(f => {
        counts[f.id] = f.id === 'all' ? base.length : base.filter(f.predicate).length;
    });
    return counts;
}

// ==========================================
// QUICK FILTER BAR RENDERER
// ==========================================
function renderQuickFilterBar(counts) {
    return `
        <div class="flex-none px-4 pt-3 pb-0 bg-white border-b border-gray-100 z-20">
            <div class="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-3">
                <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mr-1 shrink-0">Quick&nbsp;Filter</span>
                ${QUICK_FILTERS.map(f => {
                    const isActive = memberState.quickFilter === f.id;
                    const c = QF_COLOR[f.color];
                    const count = counts[f.id] ?? 0;
                    const dimmed = count === 0 && !isActive ? 'opacity-40' : '';
                    return `
                        <button
                            class="quick-filter-btn shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold transition-all select-none whitespace-nowrap
                                ${isActive ? c.active : c.pill} ${dimmed}"
                            data-qf="${f.id}"
                            title="${f.label}"
                        >
                            <i data-lucide="${f.icon}" class="w-3 h-3 shrink-0"></i>
                            ${f.label}
                            <span class="ml-0.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold
                                ${isActive ? 'bg-white/25 text-white' : `${c.dot.replace('bg-', 'bg-opacity-20 bg-')} ${c.pill.split(' ').find(x => x.startsWith('text-'))}`}">
                                ${count}
                            </span>
                        </button>`;
                }).join('')}
            </div>
        </div>`;
}

// ==========================================
// MAIN RENDER FUNCTION
// ==========================================
function render() {
    const container = document.getElementById(memberState.containerId);
    if (!container) return;

    const stats = getStats();
    const qfCounts = getQuickFilterCounts();
    const pageSlice = getPageSlice();
    const totalPages = getTotalPages();
    const allSelected = pageSlice.length > 0 && pageSlice.every(p => memberState.selected.has(p.id));
    const someSelected = memberState.selected.size > 0;
    const isSelf = (id) => id === memberState.currentAuthState?.profile?.id;
    const activeQF = getQuickFilterDef(memberState.quickFilter);

    container.innerHTML = `
        <div class="flex flex-col h-full bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden relative">

            <!-- 1. Stats Bar (Compact) -->
            <div class="flex-none px-5 py-3 border-b border-gray-100 bg-slate-50/50 flex flex-wrap gap-4 md:gap-8 items-center justify-between text-xs">
                <div class="flex items-center gap-6 overflow-x-auto no-scrollbar">
                    ${statItem('users', 'Total', stats.total, 'text-blue-600')}
                    ${statItem('shield-check', 'Admins', stats.roles.admin, 'text-purple-600')}
                    ${statItem('user-check', 'Organizers', stats.roles.organizer, 'text-emerald-600')}
                    ${statItem('globe', 'Countries', stats.countries, 'text-indigo-600')}
                    ${statItem('zap', 'New', stats.newThisMonth, 'text-amber-600')}
                </div>
                <div class="hidden md:flex items-center gap-2 text-slate-400">
                    ${memberState.quickFilter !== 'all' ? `
                        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-semibold border border-slate-200">
                            <i data-lucide="${activeQF.icon}" class="w-3 h-3"></i>
                            ${activeQF.label}
                        </span>
                        <span class="text-slate-300">·</span>` : ''}
                    <span class="font-medium text-slate-600">${memberState.filtered.length}</span> matches found
                </div>
            </div>

            <!-- 2. Quick Filter Bar -->
            ${renderQuickFilterBar(qfCounts)}

            <!-- 3. Toolbar & Filters -->
            <div class="flex-none p-4 border-b border-gray-100 bg-white z-20">
                <div class="flex flex-col lg:flex-row gap-3 justify-between">

                    <!-- Search & Filter Group -->
                    <div class="flex flex-1 flex-col sm:flex-row gap-2">
                        <!-- Search -->
                        <div class="relative flex-1 min-w-[200px]">
                            <i data-lucide="search" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"></i>
                            <input id="memberSearch" type="text"
                                class="w-full pl-9 pr-8 py-2 bg-slate-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:bg-white outline-none transition-all placeholder:text-slate-400"
                                placeholder="Search members..."
                                value="${escapeHtml(memberState.searchQuery)}">
                            ${memberState.searchQuery ? `<button id="clearSearch" class="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><i data-lucide="x" class="w-3 h-3"></i></button>` : ''}
                        </div>

                        <!-- Dropdowns -->
                        <select id="filterRole" class="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-slate-600 focus:ring-2 focus:ring-brand-500 outline-none cursor-pointer hover:border-brand-300">
                            <option value="all" ${memberState.roleFilter === 'all' ? 'selected' : ''}>All Roles</option>
                            <option value="member" ${memberState.roleFilter === 'member' ? 'selected' : ''}>Member</option>
                            <option value="organizer" ${memberState.roleFilter === 'organizer' ? 'selected' : ''}>Organizer</option>
                            <option value="admin" ${memberState.roleFilter === 'admin' ? 'selected' : ''}>Admin</option>
                        </select>

                        <select id="filterCountry" class="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-slate-600 focus:ring-2 focus:ring-brand-500 outline-none cursor-pointer hover:border-brand-300 max-w-[150px]">
                            <option value="all" ${memberState.countryFilter === 'all' ? 'selected' : ''}>All Countries</option>
                            ${getUniqueCountries().map(c => `<option value="${escapeHtml(c)}" ${memberState.countryFilter === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
                        </select>

                        ${hasActiveFilters() ?
                            `<button id="resetFilters" class="px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100 whitespace-nowrap flex items-center gap-1.5">
                                <i data-lucide="filter-x" class="w-3.5 h-3.5"></i>
                                Reset All
                            </button>` : ''
                        }
                    </div>

                    <!-- View & Pagination Controls -->
                    <div class="flex items-center gap-2 self-end sm:self-auto">
                        <!-- View Toggle -->
                        <div class="flex bg-slate-100 p-1 rounded-lg border border-gray-200">
                            <button class="view-toggle p-1.5 rounded-md ${memberState.viewMode === 'table' ? 'bg-white shadow text-brand-600' : 'text-slate-400 hover:text-slate-600'}" data-view="table">
                                <i data-lucide="table-2" class="w-4 h-4"></i>
                            </button>
                            <button class="view-toggle p-1.5 rounded-md ${memberState.viewMode === 'grid' ? 'bg-white shadow text-brand-600' : 'text-slate-400 hover:text-slate-600'}" data-view="grid">
                                <i data-lucide="layout-grid" class="w-4 h-4"></i>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Active Quick Filter indicator inside toolbar (mobile-friendly) -->
                ${memberState.quickFilter !== 'all' ? `
                <div class="mt-2 flex items-center gap-2 text-xs text-slate-500 md:hidden">
                    <i data-lucide="${activeQF.icon}" class="w-3.5 h-3.5 text-slate-400"></i>
                    <span>Filtered by <strong class="text-slate-700">${activeQF.label}</strong></span>
                    <button id="clearQuickFilter" class="ml-auto text-red-500 hover:text-red-700 font-medium">Clear</button>
                </div>` : ''}

                <!-- Bulk Actions Context Bar -->
                ${someSelected ? `
                <div class="mt-3 flex items-center gap-3 px-3 py-2 bg-brand-50 border border-brand-100 rounded-lg animate-in fade-in slide-in-from-top-1">
                    <span class="text-xs font-bold text-brand-700">${memberState.selected.size} selected</span>
                    <div class="h-4 w-px bg-brand-200"></div>
                    <button id="bulkRoleBtn" class="flex items-center gap-1.5 text-xs font-medium text-brand-700 hover:text-brand-900">
                        <i data-lucide="user-cog" class="w-3.5 h-3.5"></i> Set Role
                    </button>
                    <button id="bulkDeleteBtn" class="flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-800 ml-auto">
                        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i> Delete Selected
                    </button>
                    <button id="clearSelection" class="text-slate-400 hover:text-slate-600"><i data-lucide="x" class="w-4 h-4"></i></button>
                </div>` : ''}
            </div>

            <!-- 4. Scrollable Content Area -->
            <div class="flex-1 overflow-y-auto custom-scrollbar bg-slate-50/30 relative">
                ${memberState.filtered.length === 0 ? renderEmptyState() :
                  memberState.viewMode === 'table' ? renderTable(pageSlice, allSelected, isSelf) :
                  renderGrid(pageSlice, isSelf)}
            </div>

            <!-- 5. Footer / Pagination -->
            <div class="flex-none px-4 py-3 border-t border-gray-200 bg-white flex items-center justify-between z-20">
                <div class="text-xs text-slate-500">
                    Showing <span class="font-semibold text-slate-700">${memberState.filtered.length === 0 ? 0 : ((memberState.page - 1) * memberState.pageSize) + 1}-${Math.min(memberState.page * memberState.pageSize, memberState.filtered.length)}</span> of ${memberState.filtered.length}
                </div>
                ${totalPages > 1 ? renderPagination(totalPages) : ''}
                <select id="pageSize" class="ml-2 text-xs border-gray-200 rounded-lg text-slate-500 focus:ring-0">
                    <option value="10" ${memberState.pageSize === 10 ? 'selected' : ''}>10 / page</option>
                    <option value="25" ${memberState.pageSize === 25 ? 'selected' : ''}>25 / page</option>
                    <option value="50" ${memberState.pageSize === 50 ? 'selected' : ''}>50 / page</option>
                </select>
            </div>

            <!-- 6. Slide-over Detail Drawer -->
            <div id="memberDrawer" class="absolute inset-0 z-50 pointer-events-none overflow-hidden hidden">
                <div id="drawerBackdrop" class="absolute inset-0 bg-slate-900/20 backdrop-blur-sm opacity-0 transition-opacity duration-300 pointer-events-auto"></div>
                <div id="drawerPanel" class="absolute top-2 bottom-2 right-2 w-full max-w-md bg-white rounded-xl shadow-2xl transform translate-x-[110%] transition-transform duration-300 ease-out flex flex-col pointer-events-auto border border-gray-100">
                    <!-- Drawer Content Injected Here -->
                </div>
            </div>
        </div>
    `;

    attachListeners();
    if (window.lucide) lucide.createIcons();
}

function statItem(icon, label, value, color) {
    return `
        <div class="flex items-center gap-2">
            <i data-lucide="${icon}" class="w-4 h-4 ${color}"></i>
            <span class="font-bold text-slate-700">${value}</span>
            <span class="text-slate-500">${label}</span>
        </div>`;
}

function renderEmptyState() {
    const activeQF = getQuickFilterDef(memberState.quickFilter);
    const isQFActive = memberState.quickFilter !== 'all';

    return `
        <div class="flex flex-col items-center justify-center h-full min-h-[300px] text-center p-8">
            <div class="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                <i data-lucide="${isQFActive ? activeQF.icon : 'search-x'}" class="w-8 h-8 text-slate-400"></i>
            </div>
            <h3 class="text-slate-800 font-bold mb-1">No members found</h3>
            <p class="text-slate-500 text-sm max-w-xs mx-auto mb-4">
                ${isQFActive
                    ? `No members match the <strong class="text-slate-700">${activeQF.label}</strong> filter with your current search.`
                    : "We couldn't find any members matching your current filters."}
            </p>
            <div class="flex flex-wrap gap-2 justify-center">
                ${isQFActive ? `<button id="emptyResetQF" class="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 shadow-sm transition-all flex items-center gap-2">
                    <i data-lucide="${activeQF.icon}" class="w-4 h-4"></i> Clear Quick Filter
                </button>` : ''}
                <button id="emptyResetBtn" class="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 shadow-sm transition-all">
                    Clear All Filters
                </button>
            </div>
        </div>`;
}

// ==========================================
// TABLE VIEW
// ==========================================
function renderTable(profiles, allSelected, isSelf) {
    const sortIcon = (field) => {
        if (memberState.sortField !== field) return `<i data-lucide="arrow-up-down" class="w-3 h-3 opacity-20 group-hover:opacity-50 ml-1"></i>`;
        return memberState.sortDir === 'asc'
            ? `<i data-lucide="arrow-up" class="w-3 h-3 text-brand-600 ml-1"></i>`
            : `<i data-lucide="arrow-down" class="w-3 h-3 text-brand-600 ml-1"></i>`;
    };

    const isNewThisWeek = (p) => {
        if (!p.created_at) return false;
        const d = new Date();
        d.setDate(d.getDate() - 7);
        d.setHours(0, 0, 0, 0);
        return new Date(p.created_at) >= d;
    };

    return `
    <table class="w-full text-left text-sm text-slate-600 border-collapse">
        <thead class="bg-white text-slate-500 text-xs uppercase font-semibold sticky top-0 z-10 shadow-sm">
            <tr>
                <th class="px-4 py-3 w-10 border-b border-gray-100">
                    <input type="checkbox" id="selectAll" class="rounded border-gray-300 text-brand-600 focus:ring-brand-500 cursor-pointer" ${allSelected ? 'checked' : ''}>
                </th>
                <th class="px-4 py-3 border-b border-gray-100 cursor-pointer group hover:bg-slate-50 transition-colors select-none" data-sort="full_name">
                    <div class="flex items-center">Name ${sortIcon('full_name')}</div>
                </th>
                <th class="px-4 py-3 border-b border-gray-100 hidden sm:table-cell cursor-pointer group hover:bg-slate-50 transition-colors select-none" data-sort="affiliation">
                    <div class="flex items-center">Affiliation ${sortIcon('affiliation')}</div>
                </th>
                <th class="px-4 py-3 border-b border-gray-100 hidden lg:table-cell cursor-pointer group hover:bg-slate-50 transition-colors select-none" data-sort="country">
                    <div class="flex items-center">Country ${sortIcon('country')}</div>
                </th>
                <th class="px-4 py-3 border-b border-gray-100 cursor-pointer group hover:bg-slate-50 transition-colors select-none" data-sort="role">
                    <div class="flex items-center">Role ${sortIcon('role')}</div>
                </th>
                <th class="px-4 py-3 border-b border-gray-100 hidden xl:table-cell cursor-pointer group hover:bg-slate-50 transition-colors select-none" data-sort="created_at">
                    <div class="flex items-center">Joined ${sortIcon('created_at')}</div>
                </th>
                <th class="px-4 py-3 border-b border-gray-100 text-right w-20">Actions</th>
            </tr>
        </thead>
        <tbody class="divide-y divide-gray-50 bg-white">
            ${profiles.map(p => {
                const self = isSelf(p.id);
                const isSelected = memberState.selected.has(p.id);
                const initials = (p.full_name || 'U').substring(0,2).toUpperCase();
                const brandNew = isNewThisWeek(p);

                return `
                <tr class="group hover:bg-slate-50 transition-colors ${isSelected ? 'bg-brand-50/40' : ''}">
                    <td class="px-4 py-3">
                        <input type="checkbox" class="member-cb rounded border-gray-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                            data-id="${p.id}" ${isSelected ? 'checked' : ''} ${self ? 'disabled' : ''}>
                    </td>
                    <td class="px-4 py-3">
                        <div class="flex items-center gap-3">
                            <div class="relative w-9 h-9 flex-shrink-0">
                                <div class="w-9 h-9 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 border border-slate-100 flex items-center justify-center text-slate-500 text-xs font-bold overflow-hidden">
                                    ${p.avatar_url ? `<img src="${escapeHtml(p.avatar_url)}" class="w-full h-full object-cover" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">` : ''}
                                    <span class="${p.avatar_url ? 'hidden' : 'flex'} w-full h-full items-center justify-center">${initials}</span>
                                </div>
                                ${brandNew ? `<span class="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-amber-400 border-2 border-white" title="New this week"></span>` : ''}
                            </div>
                            <div class="min-w-0">
                                <div class="font-medium text-slate-900 truncate flex items-center gap-2">
                                    <button class="view-detail hover:text-brand-600 hover:underline text-left truncate" data-id="${p.id}">
                                        ${escapeHtml(p.full_name || 'Unnamed Member')}
                                    </button>
                                    ${self ? '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200 shrink-0">YOU</span>' : ''}
                                    ${brandNew && !self ? '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-200 shrink-0">NEW</span>' : ''}
                                </div>
                                <div class="text-xs text-slate-400 truncate">${escapeHtml(p.work_email || p.username || '')}</div>
                            </div>
                        </div>
                    </td>
                    <td class="px-4 py-3 hidden sm:table-cell">
                        <div class="text-sm text-slate-700 truncate max-w-[200px]" title="${escapeHtml(p.affiliation || '')}">${escapeHtml(p.affiliation || '—')}</div>
                        ${p.department ? `<div class="text-xs text-slate-400 truncate max-w-[200px]">${escapeHtml(p.department)}</div>` : ''}
                    </td>
                    <td class="px-4 py-3 hidden lg:table-cell">
                        ${p.country ? `<span class="inline-flex items-center px-2 py-1 rounded-md bg-slate-50 border border-gray-100 text-xs text-slate-600">${escapeHtml(p.country)}</span>` : '<span class="text-slate-300">—</span>'}
                    </td>
                    <td class="px-4 py-3">
                        ${self ?
                            `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize border ${getRoleBadgeClass(p.role)}">${p.role}</span>` :
                            `<select class="role-select bg-transparent text-xs font-medium capitalize border-0 border-b border-transparent hover:border-gray-300 focus:border-brand-500 focus:ring-0 cursor-pointer py-1 pr-6 pl-0 transition-colors ${getRoleTextColor(p.role)}" data-id="${p.id}">
                                <option value="member" ${p.role === 'member' ? 'selected' : ''}>Member</option>
                                <option value="organizer" ${p.role === 'organizer' ? 'selected' : ''}>Organizer</option>
                                <option value="admin" ${p.role === 'admin' ? 'selected' : ''}>Admin</option>
                            </select>`
                        }
                    </td>
                    <td class="px-4 py-3 hidden xl:table-cell">
                        <span class="text-xs text-slate-400" title="${p.created_at ? new Date(p.created_at).toLocaleString() : ''}">
                            ${p.created_at ? formatRelativeDate(p.created_at) : '—'}
                        </span>
                    </td>
                    <td class="px-4 py-3 text-right">
                        <div class="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button class="view-detail p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-md transition-colors" data-id="${p.id}" title="View Details">
                                <i data-lucide="eye" class="w-4 h-4"></i>
                            </button>
                            ${!self ? `<button class="delete-user p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors" data-id="${p.id}" data-name="${escapeHtml(p.full_name)}" title="Delete User">
                                <i data-lucide="trash-2" class="w-4 h-4"></i>
                            </button>` : ''}
                        </div>
                    </td>
                </tr>`;
            }).join('')}
        </tbody>
    </table>`;
}

// ==========================================
// GRID VIEW
// ==========================================
function renderGrid(profiles, isSelf) {
    const isNewThisWeek = (p) => {
        if (!p.created_at) return false;
        const d = new Date();
        d.setDate(d.getDate() - 7);
        d.setHours(0, 0, 0, 0);
        return new Date(p.created_at) >= d;
    };

    return `
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
        ${profiles.map(p => {
            const self = isSelf(p.id);
            const isSelected = memberState.selected.has(p.id);
            const initials = (p.full_name || 'U').substring(0,2).toUpperCase();
            const brandNew = isNewThisWeek(p);

            return `
            <div class="bg-white rounded-xl border ${isSelected ? 'border-brand-300 ring-1 ring-brand-300' : 'border-gray-200'} shadow-sm hover:shadow-md transition-all group relative overflow-hidden flex flex-col">
                ${brandNew ? `<div class="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-amber-400 to-orange-400"></div>` : ''}
                <div class="absolute top-3 left-3 z-10">
                    <input type="checkbox" class="member-cb rounded border-gray-300 text-brand-600 focus:ring-brand-500 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity ${isSelected ? '!opacity-100' : ''}"
                        data-id="${p.id}" ${isSelected ? 'checked' : ''} ${self ? 'disabled' : ''}>
                </div>
                ${brandNew ? `<div class="absolute top-3 right-3 z-10 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-400 text-white shadow-sm">NEW</div>` : ''}

                <div class="p-5 flex flex-col items-center text-center flex-1 cursor-pointer view-detail" data-id="${p.id}">
                    <div class="relative w-16 h-16 mb-3">
                        <div class="w-16 h-16 rounded-full bg-slate-100 border-2 border-white shadow-sm flex items-center justify-center overflow-hidden text-lg font-bold text-slate-500">
                             ${p.avatar_url ? `<img src="${escapeHtml(p.avatar_url)}" class="w-full h-full object-cover" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">` : ''}
                             <span class="${p.avatar_url ? 'hidden' : 'flex'} w-full h-full items-center justify-center bg-gradient-to-br from-slate-50 to-slate-200">${initials}</span>
                        </div>
                        ${brandNew ? `<span class="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-amber-400 border-2 border-white"></span>` : ''}
                    </div>

                    <h3 class="font-bold text-slate-900 line-clamp-1 text-sm">${escapeHtml(p.full_name || 'Unnamed')}</h3>
                    <p class="text-xs text-slate-500 mb-1 line-clamp-1">${escapeHtml(p.affiliation || '')}</p>
                    ${p.created_at ? `<p class="text-[10px] text-slate-400 mb-2">${formatRelativeDate(p.created_at)}</p>` : '<div class="mb-3"></div>'}

                    <div class="mt-auto flex flex-wrap gap-2 justify-center">
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold border ${getRoleBadgeClass(p.role)} uppercase tracking-wider">${p.role}</span>
                        ${p.country ? `<span class="px-2 py-0.5 rounded text-[10px] bg-slate-50 border border-slate-200 text-slate-600">${escapeHtml(p.country)}</span>` : ''}
                    </div>
                </div>

                ${!self ? `
                <div class="border-t border-gray-100 flex divide-x divide-gray-100 bg-slate-50/50">
                    <button class="view-detail flex-1 py-2 text-xs font-medium text-slate-600 hover:bg-white hover:text-brand-600 transition-colors" data-id="${p.id}">View</button>
                    <button class="delete-user flex-1 py-2 text-xs font-medium text-slate-600 hover:bg-white hover:text-red-600 transition-colors" data-id="${p.id}" data-name="${escapeHtml(p.full_name)}">Delete</button>
                </div>` : '<div class="h-1 bg-amber-400 w-full"></div>'}
            </div>`;
        }).join('')}
    </div>`;
}

// ==========================================
// HELPERS & DRAWER
// ==========================================
function getRoleBadgeClass(role) {
    switch(role) {
        case 'admin': return 'bg-purple-50 text-purple-700 border-purple-100';
        case 'organizer': return 'bg-emerald-50 text-emerald-700 border-emerald-100';
        default: return 'bg-slate-50 text-slate-600 border-slate-200';
    }
}

function getRoleTextColor(role) {
    switch(role) {
        case 'admin': return 'text-purple-700';
        case 'organizer': return 'text-emerald-700';
        default: return 'text-slate-600';
    }
}

function formatRelativeDate(dateStr) {
    if (!dateStr) return '';
    const now = new Date();
    const d = new Date(dateStr);
    const diffMs = now - d;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
    return `${Math.floor(diffDays / 365)}y ago`;
}

function renderPagination(totalPages) {
    return `
        <div class="flex items-center gap-1">
            <button id="prevPage" class="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-30" ${memberState.page === 1 ? 'disabled' : ''}>
                <i data-lucide="chevron-left" class="w-4 h-4"></i>
            </button>
            <span class="text-xs font-medium text-slate-600 px-2">Page ${memberState.page} of ${totalPages}</span>
            <button id="nextPage" class="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-30" ${memberState.page === totalPages ? 'disabled' : ''}>
                <i data-lucide="chevron-right" class="w-4 h-4"></i>
            </button>
        </div>
    `;
}

function openDrawer(profileId) {
    const p = memberState.profiles.find(x => x.id === profileId);
    if (!p) return;

    const drawer = document.getElementById('memberDrawer');
    const backdrop = document.getElementById('drawerBackdrop');
    const panel = document.getElementById('drawerPanel');
    const initials = (p.full_name || 'U').substring(0,2).toUpperCase();
    const isSelf = p.id === memberState.currentAuthState?.profile?.id;

    const isNewThisWeek = (() => {
        if (!p.created_at) return false;
        const d = new Date();
        d.setDate(d.getDate() - 7);
        d.setHours(0, 0, 0, 0);
        return new Date(p.created_at) >= d;
    })();

    drawer.classList.remove('hidden');
    setTimeout(() => {
        backdrop.classList.remove('opacity-0');
        panel.classList.remove('translate-x-[110%]');
    }, 10);

    panel.innerHTML = `
        <div class="flex-none p-5 border-b border-gray-100 flex items-start justify-between bg-slate-50/50">
            <div class="flex gap-4">
                <div class="relative w-14 h-14 flex-shrink-0">
                    <div class="w-14 h-14 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center overflow-hidden text-xl font-bold text-slate-400">
                        ${p.avatar_url ? `<img src="${escapeHtml(p.avatar_url)}" class="w-full h-full object-cover" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">` : ''}
                        <span class="${p.avatar_url ? 'hidden' : 'flex'} w-full h-full items-center justify-center bg-slate-100">${initials}</span>
                    </div>
                    ${isNewThisWeek ? `<span class="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-amber-400 border-2 border-white" title="New this week"></span>` : ''}
                </div>
                <div>
                    <div class="flex items-center gap-2 flex-wrap">
                        <h3 class="font-bold text-lg text-slate-800 leading-tight">${escapeHtml(p.full_name || 'Unnamed')}</h3>
                        ${isNewThisWeek ? `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-200">NEW</span>` : ''}
                    </div>
                    <p class="text-sm text-slate-500 mb-1">${escapeHtml(p.affiliation || 'No affiliation')}</p>
                    <div class="flex gap-2 flex-wrap">
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold border ${getRoleBadgeClass(p.role)} uppercase tracking-wider">${p.role}</span>
                        ${p.country ? `<span class="px-2 py-0.5 rounded text-[10px] bg-white border border-gray-200 text-slate-600 flex items-center gap-1"><i data-lucide="map-pin" class="w-3 h-3"></i> ${escapeHtml(p.country)}</span>` : ''}
                    </div>
                </div>
            </div>
            <button id="closeDrawer" class="text-slate-400 hover:text-slate-600 p-1 bg-white hover:bg-slate-100 rounded-full border border-transparent hover:border-gray-200 transition-all">
                <i data-lucide="x" class="w-5 h-5"></i>
            </button>
        </div>

        <div class="flex-1 overflow-y-auto p-6 space-y-6">
            ${isSelf ? `<div class="p-3 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-800 flex items-start gap-2">
                <i data-lucide="info" class="w-4 h-4 mt-0.5 shrink-0"></i>
                This is your public profile information. Go to your settings to edit this data.
            </div>` : ''}

            <div class="space-y-4">
                ${drawerItem('mail', 'Email', p.work_email || p.username || '—', true)}
                ${drawerItem('building', 'Department', p.department)}
                ${drawerItem('book-open', 'Fields of Study', p.fields_of_study)}
                ${drawerItem('globe', 'Languages', p.preferred_language)}
                ${drawerItem('calendar', 'Member Since', p.created_at ? new Date(p.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : null)}

                <div>
                    <div class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Bio / Description</div>
                    <div class="text-sm text-slate-600 leading-relaxed p-3 bg-slate-50 rounded-lg border border-gray-100">
                        ${escapeHtml(p.description || 'No description provided.')}
                    </div>
                </div>

                <div>
                    <div class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Links</div>
                    <div class="flex flex-wrap gap-2">
                        ${p.personal_website ? drawerLink(p.personal_website, 'Personal Site') : ''}
                        ${p.professional_website ? drawerLink(p.professional_website, 'Work Profile') : ''}
                        ${p.google_scholar ? drawerLink(p.google_scholar, 'Google Scholar') : ''}
                        ${!p.personal_website && !p.professional_website && !p.google_scholar ? '<span class="text-sm text-slate-400 italic">No links available</span>' : ''}
                    </div>
                </div>

                <!-- Profile Completeness -->
                ${renderProfileCompleteness(p)}
            </div>
        </div>

        ${!isSelf ? `
        <div class="flex-none p-4 border-t border-gray-100 bg-slate-50 flex justify-between items-center">
            <div class="text-xs text-slate-400">
                Joined ${formatRelativeDate(p.created_at)}
            </div>
            <button id="drawerDeleteBtn" class="px-4 py-2 bg-white border border-red-200 text-red-600 hover:bg-red-50 text-sm font-medium rounded-lg shadow-sm transition-colors flex items-center gap-2" data-id="${p.id}" data-name="${escapeHtml(p.full_name)}">
                <i data-lucide="trash-2" class="w-4 h-4"></i> Delete Member
            </button>
        </div>` : ''}
    `;

    document.getElementById('closeDrawer').onclick = closeDrawer;
    if (document.getElementById('drawerDeleteBtn')) {
        document.getElementById('drawerDeleteBtn').onclick = (e) => {
            const btn = e.currentTarget;
            deleteUser(btn.dataset.id, btn.dataset.name);
            closeDrawer();
        };
    }
    if (window.lucide) lucide.createIcons();
}

function renderProfileCompleteness(p) {
    const fields = [
        { key: 'affiliation', label: 'Affiliation' },
        { key: 'department', label: 'Department' },
        { key: 'country', label: 'Country' },
        { key: 'description', label: 'Bio' },
        { key: 'fields_of_study', label: 'Fields of Study' },
        { key: 'preferred_language', label: 'Language' },
    ];
    const filled = fields.filter(f => p[f.key] && String(p[f.key]).trim() !== '').length;
    const pct = Math.round((filled / fields.length) * 100);
    const color = pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-400' : 'bg-red-400';
    const textColor = pct >= 80 ? 'text-emerald-700' : pct >= 50 ? 'text-amber-700' : 'text-red-700';

    return `
        <div>
            <div class="flex items-center justify-between mb-1.5">
                <div class="text-xs font-bold text-slate-400 uppercase tracking-wider">Profile Completeness</div>
                <span class="text-xs font-bold ${textColor}">${pct}%</span>
            </div>
            <div class="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div class="${color} h-full rounded-full transition-all" style="width: ${pct}%"></div>
            </div>
            <div class="mt-2 flex flex-wrap gap-1.5">
                ${fields.map(f => {
                    const ok = p[f.key] && String(p[f.key]).trim() !== '';
                    return `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-600 border border-red-100'}">
                        <i data-lucide="${ok ? 'check' : 'x'}" class="w-2.5 h-2.5"></i> ${f.label}
                    </span>`;
                }).join('')}
            </div>
        </div>
    `;
}

function closeDrawer() {
    const drawer = document.getElementById('memberDrawer');
    const backdrop = document.getElementById('drawerBackdrop');
    const panel = document.getElementById('drawerPanel');

    backdrop.classList.add('opacity-0');
    panel.classList.add('translate-x-[110%]');
    setTimeout(() => {
        drawer.classList.add('hidden');
    }, 300);
}

function drawerItem(icon, label, value, isCopyable = false) {
    if (!value) return '';
    return `
        <div class="flex gap-3">
            <div class="mt-0.5 text-slate-400"><i data-lucide="${icon}" class="w-4 h-4"></i></div>
            <div class="flex-1 min-w-0">
                <div class="text-xs font-semibold text-slate-500 uppercase">${label}</div>
                <div class="text-sm text-slate-800 break-words font-medium">${escapeHtml(value)}</div>
            </div>
        </div>
    `;
}

function drawerLink(url, label) {
    return `<a href="${escapeHtml(url)}" target="_blank" class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-brand-600 hover:border-brand-300 hover:shadow-sm transition-all">
        <i data-lucide="link" class="w-3 h-3"></i> ${label}
    </a>`;
}

// ==========================================
// ACTIONS (Delete/Update)
// ==========================================
async function deleteUser(uid, name) {
    if (!confirm(`Are you sure you want to remove ${name}? This action cannot be undone.`)) return;

    const { error } = await supabase.from('profiles').delete().eq('id', uid);

    if (error) {
        console.error(error);
        setFlash('Error deleting user: ' + error.message, 3000);
    } else {
        memberState.profiles = memberState.profiles.filter(p => p.id !== uid);
        memberState.selected.delete(uid);
        applyFilters();
        render();
        setFlash(`${name} has been removed.`);
    }
}

async function updateUserRole(uid, newRole, selectElem) {
    selectElem.disabled = true;
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', uid);

    if (error) {
        setFlash('Failed to update role', 3000);
        selectElem.value = memberState.profiles.find(p => p.id === uid).role;
    } else {
        const p = memberState.profiles.find(p => p.id === uid);
        if (p) p.role = newRole;
        selectElem.className = selectElem.className.replace(/text-\w+-\d+/, getRoleTextColor(newRole));
        setFlash('Role updated');
    }
    selectElem.disabled = false;
}

// ==========================================
// EVENT LISTENERS
// ==========================================
function attachListeners() {
    const container = document.getElementById(memberState.containerId);

    // Debounced Search
    let timeout;
    container.querySelector('#memberSearch')?.addEventListener('input', (e) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            memberState.searchQuery = e.target.value;
            memberState.page = 1;
            applyFilters();
            render();
        }, 300);
    });

    container.querySelector('#clearSearch')?.addEventListener('click', () => {
        memberState.searchQuery = '';
        applyFilters();
        render();
    });

    // Quick Filter Pills
    container.querySelectorAll('.quick-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const qf = btn.dataset.qf;
            // Toggle off if already active (except 'all')
            if (memberState.quickFilter === qf && qf !== 'all') {
                memberState.quickFilter = 'all';
            } else {
                memberState.quickFilter = qf;
            }
            memberState.page = 1;
            applyFilters();
            render();
        });
    });

    // Clear quick filter from mobile bar
    container.querySelector('#clearQuickFilter')?.addEventListener('click', () => {
        memberState.quickFilter = 'all';
        memberState.page = 1;
        applyFilters();
        render();
    });

    // Filters
    ['filterRole', 'filterCountry'].forEach(id => {
        container.querySelector(`#${id}`)?.addEventListener('change', (e) => {
            if (id === 'filterRole') memberState.roleFilter = e.target.value;
            if (id === 'filterCountry') memberState.countryFilter = e.target.value;
            memberState.page = 1;
            applyFilters();
            render();
        });
    });

    container.querySelector('#resetFilters')?.addEventListener('click', () => {
        memberState.searchQuery = '';
        memberState.roleFilter = 'all';
        memberState.countryFilter = 'all';
        memberState.quickFilter = 'all';
        applyFilters();
        render();
    });

    container.querySelector('#emptyResetBtn')?.addEventListener('click', () => {
        memberState.searchQuery = '';
        memberState.roleFilter = 'all';
        memberState.countryFilter = 'all';
        memberState.quickFilter = 'all';
        applyFilters();
        render();
    });

    container.querySelector('#emptyResetQF')?.addEventListener('click', () => {
        memberState.quickFilter = 'all';
        applyFilters();
        render();
    });

    // Sort Headers
    container.querySelectorAll('[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const field = th.dataset.sort;
            if (memberState.sortField === field) {
                memberState.sortDir = memberState.sortDir === 'asc' ? 'desc' : 'asc';
            } else {
                memberState.sortField = field;
                memberState.sortDir = 'asc';
            }
            applyFilters();
            render();
        });
    });

    // View Toggles
    container.querySelectorAll('.view-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            memberState.viewMode = btn.dataset.view;
            render();
        });
    });

    // Pagination
    container.querySelector('#prevPage')?.addEventListener('click', () => {
        if (memberState.page > 1) { memberState.page--; render(); }
    });
    container.querySelector('#nextPage')?.addEventListener('click', () => {
        if (memberState.page < getTotalPages()) { memberState.page++; render(); }
    });
    container.querySelector('#pageSize')?.addEventListener('change', (e) => {
        memberState.pageSize = parseInt(e.target.value);
        memberState.page = 1;
        applyFilters();
        render();
    });

    // Checkboxes
    container.querySelector('#selectAll')?.addEventListener('change', (e) => {
        const slice = getPageSlice();
        const myId = memberState.currentAuthState?.profile?.id;
        if (e.target.checked) {
            slice.forEach(p => { if(p.id !== myId) memberState.selected.add(p.id); });
        } else {
            slice.forEach(p => memberState.selected.delete(p.id));
        }
        render();
    });

    container.querySelectorAll('.member-cb').forEach(cb => {
        cb.addEventListener('change', (e) => {
            if (e.target.checked) memberState.selected.add(e.target.dataset.id);
            else memberState.selected.delete(e.target.dataset.id);
            render();
        });
    });

    // Row Actions
    container.querySelectorAll('.delete-user').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteUser(btn.dataset.id, btn.dataset.name);
        });
    });

    container.querySelectorAll('.role-select').forEach(sel => {
        sel.addEventListener('change', (e) => {
            e.stopPropagation();
            updateUserRole(e.target.dataset.id, e.target.value, e.target);
        });
        sel.addEventListener('click', e => e.stopPropagation());
    });

    container.querySelectorAll('.view-detail').forEach(el => {
        el.addEventListener('click', () => {
            openDrawer(el.dataset.id);
        });
    });

    // Bulk Actions
    container.querySelector('#clearSelection')?.addEventListener('click', () => {
        memberState.selected.clear();
        render();
    });

    container.querySelector('#bulkDeleteBtn')?.addEventListener('click', async () => {
        if(!confirm(`Delete ${memberState.selected.size} users?`)) return;
        const ids = Array.from(memberState.selected);
        const { error } = await supabase.from('profiles').delete().in('id', ids);
        if(!error) {
            memberState.profiles = memberState.profiles.filter(p => !memberState.selected.has(p.id));
            memberState.selected.clear();
            applyFilters();
            render();
            setFlash('Users deleted');
        }
    });

    // Drawer Background click
    document.getElementById('drawerBackdrop')?.addEventListener('click', closeDrawer);
}

function hasActiveFilters() {
    return memberState.searchQuery ||
        memberState.roleFilter !== 'all' ||
        memberState.countryFilter !== 'all' ||
        memberState.quickFilter !== 'all';
}

// ==========================================
// PUBLIC EXPORT
// ==========================================
export async function renderMembershipTab(containerId, authState) {
    memberState.containerId = containerId;
    memberState.currentAuthState = authState;
    const container = document.getElementById(containerId);

    container.innerHTML = `
        <div class="flex flex-col items-center justify-center h-96 gap-4 text-slate-400">
            <div class="w-8 h-8 border-2 border-brand-200 border-t-brand-600 rounded-full animate-spin"></div>
            <span class="text-sm font-medium">Loading membership data...</span>
        </div>`;

    try {
        await loadProfiles();
        render();
    } catch (err) {
        console.error(err);
        container.innerHTML = `<div class="p-8 text-center text-red-600">Failed to load members. <button onclick="location.reload()" class="underline">Retry</button></div>`;
    }
}
