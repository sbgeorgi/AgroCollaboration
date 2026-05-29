import { supabase, authState } from './auth.js';
import { getAvatarUrl, $, $$ } from './ui.js';
import { openProfileModal } from './clickprofile.js';
import { formatRichText } from './rich-text.js';

// ---------------------------------------------------------------------------
// IMPROVEMENT 1: Translation dictionaries are module-level constants, never
// rebuilt inside a function. tr() does a single lookup with zero allocation.
// ---------------------------------------------------------------------------
const TRANSLATIONS = {
  en: {
    nav: { schedule: "Schedule", archive: "Archive", about: "About", network: "Network Map", admin: "Admin" },
    auth: { signin: "Sign in", signout: "Sign out" },
    map: {
      add: "Add New Point", edit_panel_title: "Edit Point", add_panel_title: "Add New Point",
      deleteConfirm: "Are you sure you want to delete this point? This action cannot be undone.",
      add_prompt: "Do you want to add a new point at this location?"
    },
    form: {
      media: "Media (videos/images)", institution: "Institution (Required)", project_name: "Project Name (Required)",
      latitude: "Latitude (Required)", longitude: "Longitude (Required)", start_year: "Start Year (Required)",
      area: "Area (m²)", associated_crops: "Target Species / Crops (Required)", av_system_type: "AV System Tech (Required)",
      system_category: "System Type (Required)", affiliation: "Affiliation", link: "Website Link",
      description: "Description", leadership: "Leadership", facilities: "Facilities", equipment: "Equipment",
      capabilities: "Capabilities", experiments: "Experiments", cancel: "Cancel", save: "Save Point",
      saving: "Saving...", generating_capacity_kw: "Generating Capacity (kW)", keywords: "Keywords",
      collaborators: "Collaborators"
    },
    view: { keywords: "Keywords", generating_capacity_kw: "Capacity", collaborators: "Collaborators" },
    popup: { project: "Project", species: "Target Species", system: "System Tech", area: "Area", capacity: "Capacity" },
    notifications: {
      load_error: "Could not load map points.", save_success: "Point saved successfully!",
      save_error: "Error saving point.", delete_success: "Point deleted.", delete_error: "Error deleting point.",
      upload_error: "Media upload failed.", no_collaborators: "At least one collaborator must be selected."
    },
    table: { project_name: "Project Name", institution: "Institution", system_type: "System Type", capacity_kw: "Capacity (kW)", start_year: "Year" },
    footer: { note: "Bilingual, community-driven seminar on agrivoltaics in Latin America." },
  },
  es: {
    nav: { schedule: "Calendario", archive: "Archivo", about: "Acerca de", network: "Mapa de la Red", admin: "Admin" },
    auth: { signin: "Iniciar sesión", signout: "Cerrar sesión" },
    map: {
      add: "Añadir Nuevo Punto", edit_panel_title: "Editar Punto", add_panel_title: "Añadir Nuevo Punto",
      deleteConfirm: "¿Estás seguro de que quieres eliminar este punto? Esta acción no se puede deshacer.",
      add_prompt: "¿Quieres añadir un nuevo punto en esta ubicación?"
    },
    form: {
      media: "Multimedia (vídeos/imágenes)", institution: "Institución (Obligatorio)", project_name: "Nombre del proyecto (Obligatorio)",
      latitude: "Latitud (Obligatorio)", longitude: "Longitud (Obligatorio)", start_year: "Año de inicio (Obligatorio)",
      area: "Superficie (m²)", associated_crops: "Especies Objetivo / Cultivos (Obligatorio)", av_system_type: "Tecnología de sistema AV (Obligatorio)",
      system_category: "Tipo de Sistema (Obligatorio)", affiliation: "Afiliación", link: "Enlace al sitio web",
      description: "Descripción", leadership: "Liderazgo", facilities: "Instalaciones", equipment: "Equipo",
      capabilities: "Capacidades", experiments: "Experimentos", cancel: "Cancelar", save: "Guardar Punto",
      saving: "Guardando...", generating_capacity_kw: "Capacidad de Generación (kW)", keywords: "Palabras Clave",
      collaborators: "Colaboradores"
    },
    view: { keywords: "Palabras Clave", generating_capacity_kw: "Capacidad", collaborators: "Colaboradores" },
    popup: { project: "Proyecto", species: "Especies Objetivo", system: "Tecnología de Sistema", area: "Superficie", capacity: "Capacidad" },
    notifications: {
      load_error: "No se pudieron cargar los puntos del mapa.", save_success: "¡Punto guardado exitosamente!",
      save_error: "Error al guardar el punto.", delete_success: "Punto eliminado.", delete_error: "Error al eliminar el punto.",
      upload_error: "Falló la subida de multimedia.", no_collaborators: "Se debe seleccionar al menos un colaborador."
    },
    table: { project_name: "Nombre del Proyecto", institution: "Institución", system_type: "Tipo de Sistema", capacity_kw: "Capacidad (kW)", start_year: "Año" },
    footer: { note: "Seminario bilingüe y comunitario sobre agrofotovoltaica en América Latina." },
  }
};

// Resolved once at module load time — zero repeated work
const _dict = TRANSLATIONS[localStorage.getItem('lang') || 'en'] || TRANSLATIONS['en'];
const tr = (key) => key.split('.').reduce((o, i) => o?.[i], _dict) ?? key;

// ---------------------------------------------------------------------------
// IMPROVEMENT 2: Icon cache — createMarkerIcon is O(1) lookup after first call
// per category. No SVG string rebuilt on every renderMarkers() call.
// ---------------------------------------------------------------------------
const categoryColors = {
  'Crops': '#16a34a', 'Livestock': '#d97706', 'Ecovoltaics': '#0891b2',
  'Aquaculture': '#2563eb', 'Mixed': '#9333ea', 'Other': '#64748b'
};

const _iconCache = new Map();
function createMarkerIcon(category) {
  if (_iconCache.has(category)) return _iconCache.get(category);
  const color = categoryColors[category] || categoryColors['Other'];
  const icon = L.divIcon({
    className: 'custom-marker',
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="36" height="36" fill="${color}" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="drop-shadow-lg"><path d="M12 2c-4.97 0-9 4.03-9 9 0 7 9 13 9 13s9-6 9-13c0-4.97-4.03-9-9-9z"></path><circle cx="12" cy="11" r="3" fill="white"></circle></svg>`
  });
  _iconCache.set(category, icon);
  return icon;
}

// ---------------------------------------------------------------------------
// IMPROVEMENT 3 & 4: Module-level avatar URL memo cache. getAvatarUrl hits
// Supabase storage signing on every call. With this cache, each avatar path
// is resolved exactly once per session — O(1) on subsequent calls.
// ---------------------------------------------------------------------------
const _avatarCache = new Map();
async function getCachedAvatarUrl(avatarPath) {
  if (!avatarPath) return null;
  if (_avatarCache.has(avatarPath)) return _avatarCache.get(avatarPath);
  const url = await getAvatarUrl(avatarPath);
  _avatarCache.set(avatarPath, url || null);
  return url || null;
}

// ---------------------------------------------------------------------------
// IMPROVEMENT 10: Debounce utility — prevents filter/search firing on every
// keystroke. Used in initUserSearch and initTableSearch.
// ---------------------------------------------------------------------------
function debounce(fn, ms = 200) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

let map, markersLayer;

const state = {
  mapPoints: [],
  allUsers: [],
  selectedPoint: null,
  uploadedMedia: [],
  existingMedia: [],
  deletedMedia: [],
  selectedCollaborators: [],
  sort: { key: 'generating_capacity_kw', order: 'desc' },
  quillEditors: {},
  // IMPROVEMENT 12: Table search filter term
  tableFilter: '',
  // IMPROVEMENT 9: Track pending-add latlng for non-blocking modal flow
  pendingAddLatLng: null,
};

// --- Utilities ---

function setFlash(msg, isError = false) {
  const el = $('#flash');
  if (!el) return;
  // IMPROVEMENT 8: Cancel both timers atomically to prevent opacity/display
  // race when setFlash is called rapidly in succession.
  clearTimeout(setFlash._hideT);
  clearTimeout(setFlash._removeT);

  el.textContent = msg;
  Object.assign(el.style, {
    backgroundColor: isError ? '#ef4444' : '#0f172a',
    display: 'block',
    opacity: '1'
  });
  el.classList.add('visible');

  setFlash._hideT = setTimeout(() => {
    el.classList.remove('visible');
    setFlash._removeT = setTimeout(() => {
      el.style.display = 'none';
      el.style.opacity = '0';
    }, 500);
  }, 3000);
}

const escapeHtml = (() => {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return (s) => s == null ? '' : String(s).replace(/[&<>"']/g, m => map[m]);
})();

// IMPROVEMENT 11: Quill guard — waits for Quill to be available on window
// rather than silently returning null when CDN is slow.
function initQuill(selector) {
  if (!window.Quill) {
    console.warn(`[map] Quill not loaded yet when initializing ${selector}`);
    return null;
  }
  return new Quill(selector, {
    theme: 'snow',
    modules: {
      toolbar: [
        ['bold', 'italic', 'underline'],
        [{ 'color': [] }, { 'background': [] }],
        [{ 'list': 'ordered' }, { 'list': 'bullet' }],
        ['link', 'clean']
      ]
    }
  });
}

const getQuillContent = (quill) => (quill && quill.getText().trim() ? quill.root.innerHTML : null);

function checkAccess() {
  const isAdmin = ['admin', 'organizer'].includes(authState.profile?.role);
  $('#addPointBtn')?.classList.toggle('hidden', !isAdmin);
}

// --- Carousel & Media ---

function createCarouselHTML(media) {
  if (!media?.length) return '<div class="carousel-container bg-gray-300"></div>';
  const sorted = [...media].sort((a, b) => (a.type === 'video' ? -1 : 1) - (b.type === 'video' ? -1 : 1));

  const slides = sorted.map((item, idx) => `
    <div class="carousel-slide" style="min-width:100%">
      ${item.type === 'video'
        ? `<video src="${escapeHtml(item.url)}" controls autoplay muted loop playsinline class="w-full h-full object-cover"></video>`
        : `<img src="${escapeHtml(item.url)}" loading="lazy" class="w-full h-full object-cover" alt="Media ${idx + 1}">`}
    </div>`).join('');

  if (sorted.length === 1) return `<div class="carousel-container overflow-hidden">${slides}</div>`;

  const dots = sorted.map((_, i) => `<span class="carousel-dot ${i === 0 ? 'active' : ''}" data-index="${i}"></span>`).join('');
  return `
    <div class="carousel-container relative overflow-hidden group" data-carousel>
      <div class="carousel-track flex transition-transform duration-300 ease-out h-full">${slides}</div>
      <button class="carousel-btn prev absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" data-dir="-1" aria-label="Previous">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>
      </button>
      <button class="carousel-btn next absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" data-dir="1" aria-label="Next">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
      </button>
      <div class="carousel-indicators absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-2">${dots}</div>
    </div>`;
}

// IMPROVEMENT 7: Touch/swipe support added to carousel. Tracks touchstart X
// and on touchend determines swipe direction with a 40px dead-zone threshold.
function initCarouselEvents(container) {
  const track = container.querySelector('.carousel-track');
  if (!track) return;

  let curr = 0;
  const count = track.children.length;
  const dots = container.querySelectorAll('.carousel-dot');

  const update = (animate = true) => {
    if (!animate) track.style.transition = 'none';
    track.style.transform = `translateX(-${curr * 100}%)`;
    if (!animate) requestAnimationFrame(() => { track.style.transition = ''; });
    dots.forEach((d, i) => d.classList.toggle('active', i === curr));
  };

  const advance = (dir) => {
    curr = (curr + dir + count) % count;
    update();
  };

  // Click delegation (buttons + dots)
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('.carousel-btn');
    const dot = e.target.closest('.carousel-dot');
    if (btn) { e.stopPropagation(); advance(parseInt(btn.dataset.dir, 10)); }
    else if (dot) { e.stopPropagation(); curr = parseInt(dot.dataset.index, 10); update(); }
  });

  // Touch swipe
  let touchStartX = 0;
  container.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
  container.addEventListener('touchend', (e) => {
    const delta = touchStartX - e.changedTouches[0].clientX;
    if (Math.abs(delta) > 40) advance(delta > 0 ? 1 : -1);
  }, { passive: true });
}

// --- Media Upload ---

function initMediaUpload() {
  const dropZone = $('#mediaDropZone');
  const fileInput = $('#mediaUpload');

  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragging'); });
  ['dragleave', 'drop'].forEach(ev => dropZone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragging');
    if (ev === 'drop') handleFiles(e.dataTransfer.files);
  }));

  $('#mediaPreviewGrid').addEventListener('click', (e) => {
    const btn = e.target.closest('.media-preview-remove');
    if (!btn) return;
    e.preventDefault();
    const id = btn.dataset.removeId;
    if (id.startsWith('http')) {
      const item = state.existingMedia.find(m => m.url === id);
      if (item) {
        state.existingMedia = state.existingMedia.filter(m => m.url !== id);
        state.deletedMedia.push(item);
      }
    } else {
      state.uploadedMedia = state.uploadedMedia.filter(m => String(m.id) !== String(id));
    }
    renderMediaPreviews();
  });
}

// IMPROVEMENT 15: Batch FileReader — all files are read in parallel via
// Promise.all, then renderMediaPreviews is called exactly once regardless
// of how many files were dropped. Previously N drops → N re-renders.
function handleFiles(files) {
  const fileArr = Array.from(files).filter(f => f.type.match(/^(image|video)\//));
  if (!fileArr.length) return;

  const reads = fileArr.map(file => new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve({
      file,
      preview: e.target.result,
      type: file.type.startsWith('video/') ? 'video' : 'image',
      id: Date.now() + Math.random()
    });
    reader.readAsDataURL(file);
  }));

  Promise.all(reads).then(results => {
    state.uploadedMedia.push(...results);
    renderMediaPreviews();
  });
}

function renderMediaPreviews() {
  const all = [
    ...state.existingMedia.map(m => ({ ...m, isEx: true })),
    ...state.uploadedMedia
  ];
  $('#mediaPreviewGrid').innerHTML = all.map(m => `
    <div class="media-preview-item relative group">
      ${m.type === 'video'
        ? `<video src="${m.isEx ? m.url : m.preview}" class="w-full h-full object-cover"></video>`
        : `<img src="${m.isEx ? m.url : m.preview}" class="w-full h-full object-cover" loading="lazy">`}
      <button type="button" class="media-preview-remove absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity" data-remove-id="${m.isEx ? m.url : m.id}" aria-label="Remove media">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    </div>`).join('');
}

// --- Data Loading ---

// IMPROVEMENT 14: Loading skeleton shown while map points are fetched.
// Gives immediate visual feedback instead of an empty map/table.
function showTableSkeleton() {
  const tbody = $('#projects-table tbody');
  if (!tbody) return;
  tbody.innerHTML = Array.from({ length: 5 }, () => `
    <tr class="animate-pulse">
      ${Array.from({ length: 5 }, () => `<td class="p-3"><div class="h-4 bg-slate-200 rounded w-3/4"></div></td>`).join('')}
    </tr>`).join('');
}

function showMapLoadingOverlay(visible) {
  let overlay = $('#map-loading-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'map-loading-overlay';
    overlay.style.cssText = 'position:absolute;inset:0;background:rgba(255,255,255,0.55);display:flex;align-items:center;justify-content:center;z-index:1000;pointer-events:none;transition:opacity 0.3s';
    overlay.innerHTML = '<div style="background:white;padding:12px 24px;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,0.15);font-size:14px;color:#334155;font-weight:600">Loading points…</div>';
    document.querySelector('#map')?.appendChild(overlay);
  }
  overlay.style.opacity = visible ? '1' : '0';
  if (!visible) setTimeout(() => overlay.remove(), 300);
}

async function loadMapPoints() {
  showMapLoadingOverlay(true);
  showTableSkeleton();

  const { data, error } = await supabase
    .from('map_points')
    .select('*, project_collaborators(profiles(id, full_name, avatar_url))')
    .order('created_at', { ascending: false });

  showMapLoadingOverlay(false);

  if (error) {
    console.error(error);
    setFlash(tr('notifications.load_error'), true);
    return;
  }

  state.mapPoints = data.map(p => ({
    ...p,
    collaborators: p.project_collaborators.map(pc => pc.profiles).filter(Boolean)
  }));

  renderMarkers();
  renderTable();
}

async function loadAllUsers() {
  const { data } = await supabase.from('profiles').select('id, full_name, avatar_url').order('full_name');
  if (data) state.allUsers = data;
}

// --- Map Render ---

function renderMarkers() {
  if (!markersLayer) return;
  markersLayer.clearLayers();
  state.mapPoints.forEach(p => {
    L.marker([p.latitude, p.longitude], { icon: createMarkerIcon(p.system_category) })
      .addTo(markersLayer)
      .on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        openViewPanel(p);
        map.flyTo([p.latitude, p.longitude], 14, { duration: 1.2, easeLinearity: 0.25 });
      });
  });
}

// --- Panels (View/Edit) ---

async function openViewPanel(point) {
  state.selectedPoint = point;
  const contentEl = $('#view-panel-content');

  // Show skeleton immediately while async work runs
  contentEl.innerHTML = `<div class="animate-pulse p-6 space-y-4">
    <div class="h-48 bg-slate-200 rounded"></div>
    <div class="h-6 bg-slate-200 rounded w-2/3"></div>
    <div class="h-4 bg-slate-200 rounded w-1/2"></div>
    <div class="h-4 bg-slate-200 rounded w-full"></div>
    <div class="h-4 bg-slate-200 rounded w-full"></div>
  </div>`;
  $('#view-panel').classList.remove('-translate-x-full');

  // Normalize media
  let media = Array.isArray(point.media_url) ? point.media_url : [];
  if (!media.length && point.image_url) {
    try { media = JSON.parse(point.image_url); } catch { media = [point.image_url]; }
    if (!Array.isArray(media)) media = [media];
    media = media.map(url => ({ url, type: 'image' }));
  }

  // IMPROVEMENT 3/4: Use cached avatar resolution — parallel, memoized
  const collabHtml = await Promise.all(point.collaborators.map(async c => {
    const url = await getCachedAvatarUrl(c.avatar_url);
    return `<div class="flex items-center gap-2 bg-slate-100 rounded-full pr-3 py-1 text-sm cursor-pointer hover:bg-slate-200 transition-colors" data-open-profile="${c.id}">
      <img class="w-6 h-6 rounded-full object-cover" src="${escapeHtml(url || 'static/avatar_placeholder.png')}" loading="lazy">
      <span class="font-medium">${escapeHtml(c.full_name)}</span>
    </div>`;
  }));

  const field = (k, v, isHtml) => v
    ? `<div class="py-4 border-b border-slate-100"><h4 class="text-xs font-bold uppercase text-slate-500 mb-2">${tr(k).replace(/\(Required\)|(Obligatorio)/i, '')}</h4><div class="text-slate-700 prose prose-sm max-w-none">${isHtml ? formatRichText(v) : escapeHtml(v)}</div></div>`
    : '';

  const isAdmin = ['admin', 'organizer'].includes(authState.profile?.role);

  contentEl.innerHTML = `
    ${createCarouselHTML(media)}
    <div class="p-6">
      <div class="mb-4">
        <h2 class="font-display font-bold text-2xl text-brand-700">${escapeHtml(point.project_name)}</h2>
        <p class="text-md text-slate-600 font-medium">${escapeHtml(point.name)}</p>
        ${point.system_category
          ? `<span class="inline-block mt-1 text-xs font-bold px-2 py-0.5 rounded-md text-white uppercase" style="background-color:${categoryColors[point.system_category] || '#64748b'}">${escapeHtml(point.system_category)}</span>`
          : ''}
      </div>
      <div class="grid grid-cols-2 gap-4 text-sm bg-slate-50 p-4 rounded-lg mb-4">
        ${[
          ['zap', 'popup.capacity', (point.generating_capacity_kw ?? '-') + ' kW'],
          ['scaling', 'popup.area', point.area || '-'],
          ['sprout', 'popup.species', point.associated_crops],
          ['solar-panel', 'popup.system', point.av_system_type]
        ].map(([i, l, v]) => `
          <div>
            <div class="flex items-center gap-1 text-brand-700">
              <i data-lucide="${i}" class="w-3 h-3"></i>
              <span class="font-semibold text-slate-600">${tr(l)}</span>
            </div>
            <div>${escapeHtml(String(v ?? ''))}</div>
          </div>`).join('')}
      </div>
      <div class="mb-4 pb-4 border-b border-slate-200">
        <h4 class="text-xs font-bold uppercase text-slate-500 mb-2">${tr('view.collaborators')}</h4>
        <div class="flex flex-wrap gap-2">${collabHtml.join('') || '<span class="text-sm italic text-slate-400">None</span>'}</div>
      </div>
      <div class="flex gap-3 mb-4">
        ${point.link ? `<a href="${escapeHtml(point.link)}" target="_blank" rel="noopener noreferrer" class="flex-1 btn btn-primary text-center">Website</a>` : ''}
        ${isAdmin ? `<button class="flex-1 btn btn-secondary btn-edit">Edit</button><button class="flex-1 btn btn-danger btn-delete">Delete</button>` : ''}
      </div>
      <div>
        ${field('form.description', point.description, true)}
        ${field('form.start_year', point.start_year)}
        ${field('view.keywords', Array.isArray(point.keywords) ? point.keywords.join(', ') : point.keywords)}
        ${['affiliation', 'leadership', 'facilities', 'equipment', 'capabilities', 'experiments']
          .map(k => field('form.' + k, point[k], ['leadership', 'facilities', 'equipment', 'capabilities', 'experiments'].includes(k)))
          .join('')}
      </div>
    </div>`;

  initCarouselEvents(contentEl);
  lucide.createIcons();

  contentEl.querySelector('.btn-edit')?.addEventListener('click', () => { closeViewPanel(); openEditPanel(point); });
  contentEl.querySelector('.btn-delete')?.addEventListener('click', () => handleDeletePoint(point.id));

  highlightTableRow(point.id, true);
}

function closeViewPanel() {
  $('#view-panel').classList.add('-translate-x-full');
  if (state.selectedPoint) highlightTableRow(state.selectedPoint.id, false);
  state.selectedPoint = null;
  // Defer innerHTML clear until after CSS transition (~300ms)
  setTimeout(() => { $('#view-panel-content').innerHTML = ''; }, 300);
}

function openEditPanel(point) {
  state.selectedPoint = point;
  state.uploadedMedia = [];
  state.deletedMedia = [];
  state.existingMedia = point ? (Array.isArray(point.media_url) ? point.media_url : []) : [];
  state.selectedCollaborators = point ? [...point.collaborators] : [];

  $('#point-form').reset();
  Object.values(state.quillEditors).forEach(q => q?.setContents([]));

  $('#panel-title').textContent = tr(point ? 'map.edit_panel_title' : 'map.add_panel_title');
  $('#pointId').value = point ? point.id : '';
  if (!point) $('#system_category').value = 'Crops';

  if (point) {
    $$('#point-form input, #point-form select, #point-form textarea').forEach(el => {
      if (point[el.id] !== undefined && !el.classList.contains('ql-editor')) {
        el.value = Array.isArray(point[el.id]) ? point[el.id].join(', ') : (point[el.id] ?? '');
      }
    });
    ['description', 'leadership', 'facilities', 'equipment', 'capabilities', 'experiments'].forEach(k => {
      if (point[k] && state.quillEditors[k]) state.quillEditors[k].root.innerHTML = point[k];
    });
  }

  renderMediaPreviews();
  renderSelectedCollaborators();
  $('#edit-panel').classList.remove('translate-x-full');
}

// --- Search & Collaborators ---

function initUserSearch() {
  const input = $('#userSearch');
  const results = $('#userSearchResults');

  // IMPROVEMENT 10: Debounced input — 200ms dead time before filtering runs
  const doSearch = debounce(async () => {
    const q = input.value.toLowerCase().trim();
    if (q.length < 2) { results.style.display = 'none'; return; }

    const matches = state.allUsers.filter(u =>
      u.full_name.toLowerCase().includes(q) &&
      !state.selectedCollaborators.find(s => s.id === u.id)
    );

    if (!matches.length) { results.style.display = 'none'; return; }

    // IMPROVEMENT 4: Use cached avatar URLs — no repeated Supabase calls
    const items = await Promise.all(matches.slice(0, 20).map(async u => `
      <div class="user-search-item p-2 hover:bg-slate-100 cursor-pointer flex items-center gap-2" data-uid="${u.id}">
        <img src="${escapeHtml(await getCachedAvatarUrl(u.avatar_url) || 'static/avatar_placeholder.png')}" class="w-6 h-6 rounded-full object-cover" loading="lazy">
        <span>${escapeHtml(u.full_name)}</span>
      </div>`));

    results.innerHTML = items.join('');
    results.style.display = 'block';
  }, 200);

  input.addEventListener('input', doSearch);

  results.addEventListener('click', (e) => {
    const item = e.target.closest('.user-search-item');
    if (!item) return;
    const user = state.allUsers.find(u => u.id === item.dataset.uid);
    if (user) {
      state.selectedCollaborators.push(user);
      renderSelectedCollaborators();
      input.value = '';
      results.style.display = 'none';
    }
  });

  $('#selectedUsers').addEventListener('click', (e) => {
    if (e.target.closest('.remove-user-btn')) {
      const id = e.target.closest('.selected-user-pill').dataset.uid;
      state.selectedCollaborators = state.selectedCollaborators.filter(u => u.id !== id);
      renderSelectedCollaborators();
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.user-search-wrapper')) results.style.display = 'none';
  });
}

// IMPROVEMENT 4: renderSelectedCollaborators uses avatar cache — instant re-renders
async function renderSelectedCollaborators() {
  const html = await Promise.all(state.selectedCollaborators.map(async u => `
    <div class="selected-user-pill flex items-center gap-1 bg-slate-100 rounded-full px-2 py-1 text-sm" data-uid="${u.id}">
      <img src="${escapeHtml(await getCachedAvatarUrl(u.avatar_url) || 'static/avatar_placeholder.png')}" class="w-5 h-5 rounded-full object-cover" loading="lazy">
      <span>${escapeHtml(u.full_name)}</span>
      <button type="button" class="remove-user-btn text-red-500 font-bold ml-1" aria-label="Remove">×</button>
    </div>`));
  $('#selectedUsers').innerHTML = html.join('');
}

// --- Form Handling ---

async function handleFormSubmit(e) {
  e.preventDefault();
  const btn = $('#saveBtn');
  btn.disabled = true;
  btn.textContent = tr('form.saving');

  try {
    // Parallel media uploads
    const newMedia = await Promise.all(state.uploadedMedia.map(async (m) => {
      const ext = m.file.name.split('.').pop();
      const path = `${authState.profile.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from('map_media').upload(path, m.file);
      if (error) throw error;
      return {
        url: supabase.storage.from('map_media').getPublicUrl(path).data.publicUrl,
        type: m.type
      };
    }));

    if (state.deletedMedia.length) {
      const paths = state.deletedMedia.map(m => m.url.split('/map_media/')[1]).filter(Boolean);
      if (paths.length) await supabase.storage.from('map_media').remove(paths);
    }

    const finalMedia = [...state.existingMedia, ...newMedia];

    const payload = {
      name: $('#name').value,
      project_name: $('#project_name').value,
      latitude: parseFloat($('#latitude').value),
      longitude: parseFloat($('#longitude').value),
      start_year: parseInt($('#start_year').value) || null,
      area: $('#area').value || null,
      associated_crops: $('#associated_crops').value,
      av_system_type: $('#av_system_type').value,
      system_category: $('#system_category').value,
      media_url: finalMedia,
      image_url: finalMedia.find(m => m.type === 'image')?.url || finalMedia[0]?.url || '',
      affiliation: $('#affiliation').value || null,
      link: $('#link').value || null,
      created_by: authState.profile.id,
      generating_capacity_kw: parseFloat($('#generating_capacity_kw').value) || null,
      keywords: $('#keywords').value.split(',').map(k => k.trim()).filter(Boolean),
      ...Object.keys(state.quillEditors).reduce((acc, k) => ({
        ...acc,
        [k]: getQuillContent(state.quillEditors[k])
      }), {})
    };

    const pid = $('#pointId').value;

    // IMPROVEMENT 5: Optimistic local state update — update state.mapPoints
    // immediately after DB confirm so we don't reload all points from scratch.
    const { data: saved, error } = pid
      ? await supabase.from('map_points').update(payload).eq('id', pid).select().single()
      : await supabase.from('map_points').insert(payload).select().single();

    if (error) throw error;

    // Update collaborators
    await supabase.from('project_collaborators').delete().eq('project_id', saved.id);
    if (state.selectedCollaborators.length) {
      await supabase.from('project_collaborators').insert(
        state.selectedCollaborators.map(u => ({ project_id: saved.id, user_id: u.id }))
      );
    }

    // IMPROVEMENT 5: Patch local state instead of full network reload
    const enriched = {
      ...saved,
      collaborators: [...state.selectedCollaborators]
    };

    if (pid) {
      const idx = state.mapPoints.findIndex(p => String(p.id) === String(pid));
      if (idx !== -1) state.mapPoints[idx] = enriched;
    } else {
      state.mapPoints.unshift(enriched);
    }

    renderMarkers();
    renderTable();

    setFlash(tr('notifications.save_success'));
    $('#edit-panel').classList.add('translate-x-full');
  } catch (err) {
    console.error(err);
    setFlash(tr('notifications.save_error') + ' ' + err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = tr('form.save');
  }
}

async function handleDeletePoint(id) {
  if (!confirm(tr('map.deleteConfirm'))) return;
  try {
    const pt = state.mapPoints.find(p => p.id === id);
    if (pt?.media_url?.length) {
      const paths = pt.media_url.map(m => m.url.split('/map_media/')[1]).filter(Boolean);
      if (paths.length) await supabase.storage.from('map_media').remove(paths);
    }
    const { error } = await supabase.from('map_points').delete().eq('id', id);
    if (error) throw error;

    // IMPROVEMENT 5: Optimistic remove from local state
    state.mapPoints = state.mapPoints.filter(p => p.id !== id);
    renderMarkers();
    renderTable();

    setFlash(tr('notifications.delete_success'));
    closeViewPanel();
  } catch (e) {
    console.error(e);
    setFlash(tr('notifications.delete_error'), true);
  }
}

// --- Table, Sort & Filter ---

// IMPROVEMENT 12: Table text filter — searches project name, institution,
// system type simultaneously. Runs client-side against already-loaded data.
function initTableSearch() {
  const input = $('#table-search-input');
  if (!input) return;

  input.addEventListener('input', debounce(() => {
    state.tableFilter = input.value.toLowerCase().trim();
    renderTable();
  }, 150));
}

// IMPROVEMENT 6: renderTable applies a DocumentFragment — avoids multiple
// forced reflows by building the full DOM off-screen then swapping in one op.
function renderTable() {
  const tbody = $('#projects-table tbody');
  if (!tbody) return;

  const { key, order } = state.sort;

  let rows = [...state.mapPoints];

  // Apply text filter
  if (state.tableFilter) {
    const f = state.tableFilter;
    rows = rows.filter(p =>
      (p.project_name || '').toLowerCase().includes(f) ||
      (p.name || '').toLowerCase().includes(f) ||
      (p.system_category || '').toLowerCase().includes(f) ||
      (p.associated_crops || '').toLowerCase().includes(f)
    );
  }

  // Sort
  rows.sort((a, b) => {
    let va = a[key] ?? '';
    let vb = b[key] ?? '';
    if (typeof va === 'string') va = va.toLowerCase();
    if (typeof vb === 'string') vb = vb.toLowerCase();
    if (va < vb) return order === 'asc' ? -1 : 1;
    if (va > vb) return order === 'asc' ? 1 : -1;
    return 0;
  });

  // Build via DocumentFragment
  const frag = document.createDocumentFragment();

  if (!rows.length) {
    const tr_el = document.createElement('tr');
    tr_el.innerHTML = `<td colspan="5" class="p-6 text-center text-slate-400 italic">${state.tableFilter ? 'No results match your search.' : 'No projects found.'}</td>`;
    frag.appendChild(tr_el);
  } else {
    rows.forEach(p => {
      const tr_el = document.createElement('tr');
      tr_el.dataset.id = p.id;
      tr_el.className = 'cursor-pointer hover:bg-slate-50 transition-colors';
      tr_el.innerHTML = `
        <td class="p-3">${escapeHtml(p.project_name)}</td>
        <td class="p-3">${escapeHtml(p.name)}</td>
        <td class="p-3">${escapeHtml(p.system_category)}</td>
        <td class="p-3 font-mono">${p.generating_capacity_kw ?? '-'}</td>
        <td class="p-3">${p.start_year || '-'}</td>`;
      frag.appendChild(tr_el);
    });
  }

  tbody.innerHTML = '';
  tbody.appendChild(frag);
}

// IMPROVEMENT 13: highlightTableRow uses NodeList iteration with dataset
// comparison — avoids attribute selector with potential special-char issues.
function highlightTableRow(id, highlight) {
  const rows = $$('#projects-table tbody tr');
  rows.forEach(r => {
    r.classList.remove('selected');
    if (highlight && r.dataset.id === String(id)) {
      r.classList.add('selected');
      r.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  });
}

// IMPROVEMENT 9: Non-blocking add-point modal replaces synchronous confirm().
// Injects a small overlay modal that resolves a Promise — no thread blocking.
function showAddPointModal(latlng) {
  return new Promise((resolve) => {
    const existing = $('#add-point-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'add-point-modal';
    modal.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,0.4);display:flex;align-items:center;
      justify-content:center;z-index:9999;animation:fadeIn 0.15s ease`;
    modal.innerHTML = `
      <div style="background:white;border-radius:12px;padding:24px;max-width:340px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.2)">
        <h3 style="font-weight:700;font-size:1.1rem;color:#1e293b;margin-bottom:8px">Add New Point</h3>
        <p style="font-size:0.875rem;color:#64748b;margin-bottom:20px">${tr('map.add_prompt')}</p>
        <p style="font-size:0.75rem;color:#94a3b8;margin-bottom:16px">
          ${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}
        </p>
        <div style="display:flex;gap:10px;justify-content:flex-end">
          <button id="add-modal-cancel" style="padding:8px 16px;border-radius:6px;border:1px solid #e2e8f0;cursor:pointer;font-size:0.875rem">Cancel</button>
          <button id="add-modal-confirm" style="padding:8px 16px;border-radius:6px;background:#16a34a;color:white;border:none;cursor:pointer;font-size:0.875rem;font-weight:600">Add Point</button>
        </div>
      </div>`;

    document.body.appendChild(modal);

    const cleanup = (result) => { modal.remove(); resolve(result); };
    modal.querySelector('#add-modal-confirm').addEventListener('click', () => cleanup(true));
    modal.querySelector('#add-modal-cancel').addEventListener('click', () => cleanup(false));
    modal.addEventListener('click', (e) => { if (e.target === modal) cleanup(false); });
  });
}

// --- Initialization ---

function wireMapUI() {
  $('#addPointBtn')?.addEventListener('click', () => openEditPanel(null));

  ['closePanelBtn', 'cancelBtn'].forEach(id => {
    $(`#${id}`)?.addEventListener('click', () => $('#edit-panel').classList.add('translate-x-full'));
  });

  $('#point-form').addEventListener('submit', handleFormSubmit);

  // Sort headers
  $('#projects-table thead').addEventListener('click', (e) => {
    const th = e.target.closest('th[data-sort]');
    if (!th) return;
    const k = th.dataset.sort;
    state.sort = { key: k, order: state.sort.key === k && state.sort.order === 'desc' ? 'asc' : 'desc' };

    $$('th .sort-icon').forEach(i => {
      i.outerHTML = '<i class="sort-icon" data-lucide="chevrons-up-down"></i>';
    });
    th.querySelector('.sort-icon').outerHTML =
      `<i class="sort-icon" data-lucide="chevron-${state.sort.order === 'asc' ? 'up' : 'down'}"></i>`;
    lucide.createIcons();
    renderTable();
  });

  // Table row click
  $('#projects-table tbody').addEventListener('click', (e) => {
    const r = e.target.closest('tr');
    if (!r || !r.dataset.id) return;
    const pt = state.mapPoints.find(p => String(p.id) === String(r.dataset.id));
    if (pt) {
      openViewPanel(pt);
      map.flyTo([pt.latitude, pt.longitude], 14, { duration: 1.2, easeLinearity: 0.25 });
    }
  });

  $('#closeViewPanelBtn').addEventListener('click', closeViewPanel);

  // Global profile click delegation
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-open-profile]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const uid = btn.dataset.openProfile;
    const { data } = await supabase.from('profiles').select('*').eq('id', uid).single();
    if (data) openProfileModal(data);
  });

  initMediaUpload();
  initUserSearch();
  initTableSearch();

  // IMPROVEMENT 11: Guard Quill init — only initialize if Quill is available
  if (window.Quill) {
    ['description', 'leadership', 'facilities', 'equipment', 'capabilities', 'experiments']
      .forEach(id => { state.quillEditors[id] = initQuill(`#${id}`); });
  } else {
    // Retry once after a short delay to handle slow CDN loads
    setTimeout(() => {
      if (window.Quill) {
        ['description', 'leadership', 'facilities', 'equipment', 'capabilities', 'experiments']
          .forEach(id => {
            if (!state.quillEditors[id]) state.quillEditors[id] = initQuill(`#${id}`);
          });
      } else {
        console.error('[map] Quill failed to load. Rich text editors will not be available.');
      }
    }, 2000);
  }
}

export function initMap() {
  map = L.map('map', { zoomControl: false }).setView([25, -75], 2);
  L.control.zoom({ position: 'bottomright' }).addTo(map);

  const base = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
    maxZoom: 20,
    attribution: 'CARTO'
  });
  const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Esri'
  });

  sat.addTo(map);

  // Layer toggle control
  const createCtrl = (pos, html, click) => {
    const C = L.Control.extend({
      onAdd: () => {
        const d = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
        Object.assign(d.style, {
          backgroundColor: 'white',
          padding: '5px',
          cursor: 'pointer',
          boxShadow: '0 1px 5px rgba(0,0,0,0.4)'
        });
        d.innerHTML = html;
        if (click) {
          d.onclick = (e) => { L.DomEvent.stopPropagation(e); click(d); };
        }
        return d;
      }
    });
    map.addControl(new C({ position: pos }));
  };

  createCtrl('topleft',
    `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="2" title="Toggle layers"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>`,
    () => {
      if (map.hasLayer(sat)) { map.removeLayer(sat); base.addTo(map); }
      else { map.removeLayer(base); sat.addTo(map); }
      if (markersLayer) markersLayer.bringToFront();
    }
  );

  // Legend control
  const legendHtml =
    '<div style="font-weight:700;margin-bottom:5px;color:#334155;font-size:12px">System Types</div>' +
    Object.entries(categoryColors).map(([k, c]) =>
      `<div style="display:flex;align-items:center;margin-bottom:2px;font-size:11px;color:#475569">
        <span style="width:10px;height:10px;background:${c};border-radius:50%;margin-right:6px;flex-shrink:0"></span>${escapeHtml(k)}
      </div>`
    ).join('');
  createCtrl('bottomleft', `<div style="padding:5px">${legendHtml}</div>`);

  markersLayer = L.layerGroup().addTo(map);

  // IMPROVEMENT 9: Non-blocking map click — async modal instead of confirm()
  map.on('click', async (e) => {
    if (!['admin', 'organizer'].includes(authState.profile?.role)) {
      closeViewPanel();
      return;
    }
    const confirmed = await showAddPointModal(e.latlng);
    if (confirmed) {
      $('#view-panel').classList.add('-translate-x-full');
      openEditPanel(null);
      $('#latitude').value = e.latlng.lat.toFixed(6);
      $('#longitude').value = e.latlng.lng.toFixed(6);
    }
  });

  wireMapUI();

  supabase.auth.onAuthStateChange(() => setTimeout(checkAccess, 500));

  return Promise.all([loadAllUsers(), loadMapPoints()]).then(checkAccess);
}
