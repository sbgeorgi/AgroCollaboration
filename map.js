import { supabase, authState } from './auth.js';
import { getAvatarUrl, $, $$ } from './ui.js';
import { openProfileModal } from './clickprofile.js';
import { formatRichText } from './rich-text.js';

let map, markersLayer;

const categoryColors = {
  'Crops': '#16a34a', 'Livestock': '#d97706', 'Ecovoltaics': '#0891b2',
  'Aquaculture': '#2563eb', 'Mixed': '#9333ea', 'Other': '#64748b'
};

const state = {
  mapPoints: [],
  allUsers: [],
  selectedPoint: null,
  uploadedMedia: [], // { file, preview, type, id }
  existingMedia: [], // { url, type }
  deletedMedia: [],  // { url, type }
  selectedCollaborators: [],
  sort: { key: 'generating_capacity_kw', order: 'desc' },
  quillEditors: {},
  // Cache translation dict once
  dict: null
};

// --- Utilities ---

const tr = (key) => {
  if (!state.dict) {
    const t = {
      en: {
        nav: { schedule: "Schedule", archive: "Archive", about: "About", network: "Network Map", admin: "Admin" },
        auth: { signin: "Sign in", signout: "Sign out" },
        map: { add: "Add New Point", edit_panel_title: "Edit Point", add_panel_title: "Add New Point", deleteConfirm: "Are you sure you want to delete this point? This action cannot be undone.", add_prompt: "Do you want to add a new point at this location?" },
        form: { media: "Media (videos/images)", institution: "Institution (Required)", project_name: "Project Name (Required)", latitude: "Latitude (Required)", longitude: "Longitude (Required)", start_year: "Start Year (Required)", area: "Area (m²)", associated_crops: "Target Species / Crops (Required)", av_system_type: "AV System Tech (Required)", system_category: "System Type (Required)", affiliation: "Affiliation", link: "Website Link", description: "Description", leadership: "Leadership", facilities: "Facilities", equipment: "Equipment", capabilities: "Capabilities", experiments: "Experiments", cancel: "Cancel", save: "Save Point", saving: "Saving...", generating_capacity_kw: "Generating Capacity (kW)", keywords: "Keywords", collaborators: "Collaborators" },
        view: { keywords: "Keywords", generating_capacity_kw: "Capacity", collaborators: "Collaborators" },
        popup: { project: "Project", species: "Target Species", system: "System Tech", area: "Area", capacity: "Capacity" },
        notifications: { load_error: "Could not load map points.", save_success: "Point saved successfully!", save_error: "Error saving point.", delete_success: "Point deleted.", delete_error: "Error deleting point.", upload_error: "Media upload failed.", no_collaborators: "At least one collaborator must be selected." },
        table: { project_name: "Project Name", institution: "Institution", system_type: "System Type", capacity_kw: "Capacity (kW)", start_year: "Year" },
        footer: { note: "Bilingual, community-driven seminar on agrivoltaics in Latin America." },
      },
      es: {
        nav: { schedule: "Calendario", archive: "Archivo", about: "Acerca de", network: "Mapa de la Red", admin: "Admin" },
        auth: { signin: "Iniciar sesión", signout: "Cerrar sesión" },
        map: { add: "Añadir Nuevo Punto", edit_panel_title: "Editar Punto", add_panel_title: "Añadir Nuevo Punto", deleteConfirm: "¿Estás seguro de que quieres eliminar este punto? Esta acción no se puede deshacer.", add_prompt: "¿Quieres añadir un nuevo punto en esta ubicación?" },
        form: { media: "Multimedia (vídeos/imágenes)", institution: "Institución (Obligatorio)", project_name: "Nombre del proyecto (Obligatorio)", latitude: "Latitud (Obligatorio)", longitude: "Longitud (Obligatorio)", start_year: "Año de inicio (Obligatorio)", area: "Superficie (m²)", associated_crops: "Especies Objetivo / Cultivos (Obligatorio)", av_system_type: "Tecnología de sistema AV (Obligatorio)", system_category: "Tipo de Sistema (Obligatorio)", affiliation: "Afiliación", link: "Enlace al sitio web", description: "Descripción", leadership: "Liderazgo", facilities: "Instalaciones", equipment: "Equipo", capabilities: "Capacidades", experiments: "Experimentos", cancel: "Cancelar", save: "Guardar Punto", saving: "Guardando...", generating_capacity_kw: "Capacidad de Generación (kW)", keywords: "Palabras Clave", collaborators: "Colaboradores" },
        view: { keywords: "Palabras Clave", generating_capacity_kw: "Capacidad", collaborators: "Colaboradores" },
        popup: { project: "Proyecto", species: "Especies Objetivo", system: "Tecnología de Sistema", area: "Superficie", capacity: "Capacidad" },
        notifications: { load_error: "No se pudieron cargar los puntos del mapa.", save_success: "¡Punto guardado exitosamente!", save_error: "Error al guardar el punto.", delete_success: "Punto eliminado.", delete_error: "Error al eliminar el punto.", upload_error: "Falló la subida de multimedia.", no_collaborators: "Se debe seleccionar al menos un colaborador." },
        table: { project_name: "Nombre del Proyecto", institution: "Institución", system_type: "Tipo de Sistema", capacity_kw: "Capacidad (kW)", start_year: "Año" },
        footer: { note: "Seminario bilingüe y comunitario sobre agrofotovoltaica en América Latina." },
      }
    };
    state.dict = t[localStorage.getItem("lang") || "en"];
  }
  return key.split('.').reduce((o, i) => o?.[i], state.dict) || key;
};

function setFlash(msg, isError = false) {
  const el = $("#flash");
  if (!el) return;
  el.textContent = msg;
  Object.assign(el.style, { backgroundColor: isError ? '#ef4444' : '#0f172a', display: 'block' });
  el.classList.add("visible");
  clearTimeout(setFlash._t);
  setFlash._t = setTimeout(() => {
    el.classList.remove("visible");
    setTimeout(() => { el.style.display = 'none'; }, 500);
  }, 3000);
}

const escapeHtml = (s) => (s == null ? "" : String(s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])));

function initQuill(selector) {
  if (!window.Quill) return null;
  return new Quill(selector, {
    theme: 'snow',
    modules: { toolbar: [['bold', 'italic', 'underline'], [{ 'color': [] }, { 'background': [] }], [{ 'list': 'ordered' }, { 'list': 'bullet' }], ['link', 'clean']] }
  });
}

const getQuillContent = (quill) => (quill && quill.getText().trim() ? quill.root.innerHTML : null);

function checkAccess() {
  const isAdmin = ['admin', 'organizer'].includes(authState.profile?.role);
  $('#addPointBtn')?.classList.toggle('hidden', !isAdmin);
}

// --- Map Helpers ---

function createMarkerIcon(category) {
  const color = categoryColors[category] || categoryColors['Other'];
  return L.divIcon({
    className: 'custom-marker',
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="36" height="36" fill="${color}" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="drop-shadow-lg"><path d="M12 2c-4.97 0-9 4.03-9 9 0 7 9 13 9 13s9-6 9-13c0-4.97-4.03-9-9-9z"></path><circle cx="12" cy="11" r="3" fill="white"></circle></svg>`
  });
}

// --- Carousel & Media ---

function createCarouselHTML(media) {
  if (!media?.length) return '<div class="carousel-container bg-gray-300"></div>';
  // Sort video first
  const sorted = [...media].sort((a, b) => (a.type === 'video' ? -1 : 1) - (b.type === 'video' ? -1 : 1));
  
  const slides = sorted.map((item, idx) => `
    <div class="carousel-slide" style="min-width:100%">
      ${item.type === 'video' 
        ? `<video src="${escapeHtml(item.url)}" controls autoplay muted loop playsinline class="w-full h-full object-cover"></video>`
        : `<img src="${escapeHtml(item.url)}" class="w-full h-full object-cover" alt="Media ${idx + 1}">`}
    </div>`).join('');

  if (sorted.length === 1) return `<div class="carousel-container overflow-hidden">${slides}</div>`;

  const dots = sorted.map((_, i) => `<span class="carousel-dot ${i === 0 ? 'active' : ''}" data-index="${i}"></span>`).join('');
  return `
    <div class="carousel-container relative overflow-hidden group">
        <div class="carousel-track flex transition-transform duration-300 ease-out h-full">${slides}</div>
        <button class="carousel-btn prev absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" data-dir="-1"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg></button>
        <button class="carousel-btn next absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" data-dir="1"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg></button>
        <div class="carousel-indicators absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-2">${dots}</div>
    </div>`;
}

function initCarouselEvents(container) {
  const track = container.querySelector('.carousel-track');
  if (!track) return;
  
  let curr = 0;
  const count = track.children.length;
  const dots = container.querySelectorAll('.carousel-dot');
  
  const update = () => {
    track.style.transform = `translateX(-${curr * 100}%)`;
    dots.forEach((d, i) => d.classList.toggle('active', i === curr));
  };

  container.addEventListener('click', (e) => {
    const btn = e.target.closest('.carousel-btn');
    const dot = e.target.closest('.carousel-dot');
    
    if (btn) {
      e.stopPropagation();
      const dir = parseInt(btn.dataset.dir);
      curr = (curr + dir + count) % count;
      update();
    } else if (dot) {
      e.stopPropagation();
      curr = parseInt(dot.dataset.index);
      update();
    }
  });
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

  // Event Delegation for Removing Media
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
      state.uploadedMedia = state.uploadedMedia.filter(m => m.id != id);
    }
    renderMediaPreviews();
  });
}

function handleFiles(files) {
  Array.from(files).forEach(file => {
    if (!file.type.match(/^(image|video)\//)) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      state.uploadedMedia.push({
        file, preview: e.target.result,
        type: file.type.startsWith('video/') ? 'video' : 'image',
        id: Date.now() + Math.random()
      });
      renderMediaPreviews();
    };
    reader.readAsDataURL(file);
  });
}

function renderMediaPreviews() {
  const all = [...state.existingMedia.map(m => ({ ...m, isEx: true })), ...state.uploadedMedia];
  $('#mediaPreviewGrid').innerHTML = all.map(m => `
    <div class="media-preview-item relative group">
       ${m.type === 'video' ? `<video src="${m.isEx ? m.url : m.preview}" class="w-full h-full object-cover"></video>` : `<img src="${m.isEx ? m.url : m.preview}" class="w-full h-full object-cover">`}
       <button type="button" class="media-preview-remove absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity" data-remove-id="${m.isEx ? m.url : m.id}">
         <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
       </button>
    </div>`).join('');
}

// --- Data Loading ---

async function loadMapPoints() {
  // Efficient fetch: get points and collaborator profiles in one go
  const { data, error } = await supabase.from('map_points')
    .select('*, project_collaborators(profiles(id, full_name, avatar_url))')
    .order('created_at', { ascending: false });

  if (error) return console.error(error) || setFlash(tr('notifications.load_error'), true);

  state.mapPoints = data.map(p => ({
    ...p,
    collaborators: p.project_collaborators.map(pc => pc.profiles).filter(Boolean)
  }));
  
  renderMarkers();
  renderTable();
}

async function loadAllUsers() {
  // Optimization: Do NOT sign URLs here. Too expensive on load.
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
        map.flyTo([p.latitude, p.longitude], Math.max(map.getZoom(), 8));
      });
  });
}

// --- Panels (View/Edit) ---

async function openViewPanel(point) {
  state.selectedPoint = point;
  const contentEl = $('#view-panel-content');
  
  // Prepare Media
  let media = Array.isArray(point.media_url) ? point.media_url : [];
  if (!media.length && point.image_url) {
    try { media = JSON.parse(point.image_url); } catch { media = [point.image_url]; }
    if (!Array.isArray(media)) media = [media];
    media = media.map(url => ({ url, type: 'image' }));
  }

  // Lazy load collaborator avatars for display
  const collabHtml = await Promise.all(point.collaborators.map(async c => {
    const url = await getAvatarUrl(c.avatar_url);
    return `<div class="flex items-center gap-2 bg-slate-100 rounded-full pr-3 py-1 text-sm cursor-pointer hover:bg-slate-200" data-open-profile="${c.id}">
      <img class="w-6 h-6 rounded-full object-cover" src="${url || 'static/avatar_placeholder.png'}">
      <span class="font-medium">${escapeHtml(c.full_name)}</span>
    </div>`;
  }));

  const field = (k, v, isHtml) => v ? `<div class="py-4 border-b border-slate-100"><h4 class="text-xs font-bold uppercase text-slate-500 mb-2">${tr(k).replace(/\(Required\)|(Obligatorio)/i, '')}</h4><div class="text-slate-700 prose prose-sm max-w-none">${isHtml ? formatRichText(v) : escapeHtml(v)}</div></div>` : '';
  const isAdmin = ['admin', 'organizer'].includes(authState.profile?.role);

  contentEl.innerHTML = `
    ${createCarouselHTML(media)}
    <div class="p-6">
      <div class="mb-4">
        <h2 class="font-display font-bold text-2xl text-brand-700">${escapeHtml(point.project_name)}</h2>
        <p class="text-md text-slate-600 font-medium">${escapeHtml(point.name)}</p>
        ${point.system_category ? `<span class="inline-block mt-1 text-xs font-bold px-2 py-0.5 rounded-md text-white uppercase" style="background-color: ${categoryColors[point.system_category] || '#64748b'}">${escapeHtml(point.system_category)}</span>` : ''}
      </div>
      <div class="grid grid-cols-2 gap-4 text-sm bg-slate-50 p-4 rounded-lg mb-4">
         ${[['zap','popup.capacity', (point.generating_capacity_kw || '-') + ' kW'], ['scaling','popup.area', point.area || '-'], ['sprout','popup.species', point.associated_crops], ['solar-panel','popup.system', point.av_system_type]]
           .map(([i, l, v]) => `<div><div class="flex items-center gap-1 text-brand-700"><i data-lucide="${i}" class="w-3 h-3"></i><span class="font-semibold text-slate-600">${tr(l)}</span></div><div>${escapeHtml(v)}</div></div>`).join('')}
      </div>
      <div class="mb-4 pb-4 border-b border-slate-200">
        <h4 class="text-xs font-bold uppercase text-slate-500 mb-2">${tr('view.collaborators')}</h4>
        <div class="flex flex-wrap gap-2">${collabHtml.join('') || '<span class="text-sm italic text-slate-400">None</span>'}</div>
      </div>
      <div class="flex gap-3 mb-4">
        ${point.link ? `<a href="${point.link}" target="_blank" class="flex-1 btn btn-primary text-center">Website</a>` : ''}
        ${isAdmin ? `<button class="flex-1 btn btn-secondary btn-edit">Edit</button><button class="flex-1 btn btn-danger btn-delete">Delete</button>` : ''}
      </div>
      <div>
        ${field('form.description', point.description, true)}
        ${field('form.start_year', point.start_year)}
        ${field('view.keywords', Array.isArray(point.keywords) ? point.keywords.join(', ') : point.keywords)}
        ${['affiliation','leadership','facilities','equipment','capabilities','experiments'].map(k => field('form.'+k, point[k], ['leadership','facilities','equipment','capabilities','experiments'].includes(k))).join('')}
      </div>
    </div>`;
  
  initCarouselEvents(contentEl);
  lucide.createIcons();
  
  // Bind actions
  contentEl.querySelector('.btn-edit')?.addEventListener('click', () => { closeViewPanel(); openEditPanel(point); });
  contentEl.querySelector('.btn-delete')?.addEventListener('click', () => handleDeletePoint(point.id));

  $('#view-panel').classList.remove('-translate-x-full');
  highlightTableRow(point.id, true);
}

function closeViewPanel() {
  $('#view-panel').classList.add('-translate-x-full');
  if (state.selectedPoint) highlightTableRow(state.selectedPoint.id, false);
  state.selectedPoint = null;
  $('#view-panel-content').innerHTML = '';
}

function openEditPanel(point) {
  state.selectedPoint = point;
  state.uploadedMedia = [];
  state.deletedMedia = [];
  state.existingMedia = point ? (point.media_url || []) : [];
  state.selectedCollaborators = point ? [...point.collaborators] : [];
  
  $('#point-form').reset();
  Object.values(state.quillEditors).forEach(q => q.setContents([]));

  $('#panel-title').textContent = tr(point ? 'map.edit_panel_title' : 'map.add_panel_title');
  $('#pointId').value = point ? point.id : '';
  if (!point) $('#system_category').value = 'Crops';

  if (point) {
    // Fill basic inputs
    $$('#point-form input, #point-form select, #point-form textarea').forEach(el => {
      if (point[el.id] !== undefined && !el.classList.contains('ql-editor')) {
        el.value = Array.isArray(point[el.id]) ? point[el.id].join(', ') : point[el.id] || '';
      }
    });
    // Fill Quill
    ['description','leadership','facilities','equipment','capabilities','experiments'].forEach(k => {
      if (point[k] && state.quillEditors[k]) state.quillEditors[k].root.innerHTML = point[k];
    });
  }

  renderMediaPreviews();
  renderSelectedCollaborators();
  $('#edit-panel').classList.remove('translate-x-full');
}

// --- Search & Collaborators ---

function initUserSearch() {
  const input = $('#userSearch'), results = $('#userSearchResults');
  
  input.addEventListener('input', async () => {
    const q = input.value.toLowerCase();
    if (q.length < 2) return results.style.display = 'none';
    
    const matches = state.allUsers.filter(u => u.full_name.toLowerCase().includes(q) && !state.selectedCollaborators.find(s => s.id === u.id));
    
    if (!matches.length) return results.style.display = 'none';

    // Optimally render results and fetch avatars on demand
    const items = await Promise.all(matches.map(async u => `
      <div class="user-search-item p-2 hover:bg-slate-100 cursor-pointer flex items-center gap-2" data-uid="${u.id}">
        <img src="${await getAvatarUrl(u.avatar_url) || 'static/avatar_placeholder.png'}" class="w-6 h-6 rounded-full">
        <span>${escapeHtml(u.full_name)}</span>
      </div>`));
    
    results.innerHTML = items.join('');
    results.style.display = 'block';
  });

  // Delegation for selecting user
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
  
  // Delegation for removing collaborator
  $('#selectedUsers').addEventListener('click', (e) => {
    if (e.target.closest('.remove-user-btn')) {
      const id = e.target.closest('.selected-user-pill').dataset.uid;
      state.selectedCollaborators = state.selectedCollaborators.filter(u => u.id !== id);
      renderSelectedCollaborators();
    }
  });

  document.addEventListener('click', (e) => !e.target.closest('.user-search-wrapper') && (results.style.display = 'none'));
}

async function renderSelectedCollaborators() {
  const html = await Promise.all(state.selectedCollaborators.map(async u => `
    <div class="selected-user-pill flex items-center gap-1 bg-slate-100 rounded-full px-2 py-1 text-sm" data-uid="${u.id}">
       <img src="${await getAvatarUrl(u.avatar_url) || 'static/avatar_placeholder.png'}" class="w-5 h-5 rounded-full">
       <span>${escapeHtml(u.full_name)}</span>
       <button type="button" class="remove-user-btn text-red-500 font-bold ml-1">×</button>
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
    // 1. Parallel Uploads (Optimization)
    const newMedia = await Promise.all(state.uploadedMedia.map(async (m) => {
      const path = `${authState.profile.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${m.file.name.split('.').pop()}`;
      const { error } = await supabase.storage.from('map_media').upload(path, m.file);
      if (error) throw error;
      return { url: supabase.storage.from('map_media').getPublicUrl(path).data.publicUrl, type: m.type };
    }));

    // 2. Cleanup Deleted
    if (state.deletedMedia.length) {
        await supabase.storage.from('map_media').remove(state.deletedMedia.map(m => m.url.split('/map_media/')[1]).filter(Boolean));
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
      image_url: finalMedia.find(m => m.type === 'image')?.url || (finalMedia[0]?.url) || '',
      affiliation: $('#affiliation').value || null,
      link: $('#link').value || null,
      created_by: authState.profile.id,
      generating_capacity_kw: parseFloat($('#generating_capacity_kw').value) || null,
      keywords: $('#keywords').value.split(',').map(k => k.trim()).filter(Boolean),
      // Gather Quill Content
      ...Object.keys(state.quillEditors).reduce((acc, k) => ({...acc, [k]: getQuillContent(state.quillEditors[k])}), {})
    };

    const pid = $('#pointId').value;
    const { data: saved, error } = pid 
        ? await supabase.from('map_points').update(payload).eq('id', pid).select().single()
        : await supabase.from('map_points').insert(payload).select().single();
    
    if (error) throw error;

    // 3. Update Collaborators
    await supabase.from('project_collaborators').delete().eq('project_id', saved.id);
    if (state.selectedCollaborators.length) {
        await supabase.from('project_collaborators').insert(state.selectedCollaborators.map(u => ({ project_id: saved.id, user_id: u.id })));
    }

    setFlash(tr('notifications.save_success'));
    $('#edit-panel').classList.add('translate-x-full');
    loadMapPoints(); // Reload
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
        await supabase.storage.from('map_media').remove(pt.media_url.map(m => m.url.split('/map_media/')[1]).filter(Boolean));
    }
    await supabase.from('map_points').delete().eq('id', id);
    setFlash(tr('notifications.delete_success'));
    closeViewPanel();
    loadMapPoints();
  } catch (e) { setFlash(tr('notifications.delete_error'), true); }
}

// --- Table & Sort ---

function renderTable() {
  const tbody = $('#projects-table tbody');
  const { key, order } = state.sort;
  const sorted = [...state.mapPoints].sort((a, b) => {
    let va = a[key] ?? '', vb = b[key] ?? '';
    if (typeof va === 'string') { va = va.toLowerCase(); vb = vb.toLowerCase(); }
    if (va < vb) return order === 'asc' ? -1 : 1;
    if (va > vb) return order === 'asc' ? 1 : -1;
    return 0;
  });

  tbody.innerHTML = sorted.map(p => 
    `<tr data-id="${p.id}" class="cursor-pointer hover:bg-slate-50 transition-colors">
      <td class="p-3">${escapeHtml(p.project_name)}</td><td class="p-3">${escapeHtml(p.name)}</td>
      <td class="p-3">${escapeHtml(p.system_category)}</td><td class="p-3 font-mono">${p.generating_capacity_kw ?? '-'}</td>
      <td class="p-3">${p.start_year || '-'}</td>
    </tr>`).join('');
}

function highlightTableRow(id, highlight) {
  $$('#projects-table tbody tr').forEach(r => r.classList.remove('selected'));
  if (highlight) {
    const r = $(`#projects-table tbody tr[data-id="${id}"]`);
    if (r) { r.classList.add('selected'); r.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  }
}

// --- Initialization ---

function wireMapUI() {
  $('#addPointBtn').addEventListener('click', () => openEditPanel(null));
  ['closePanelBtn', 'cancelBtn'].forEach(id => $(`#${id}`).addEventListener('click', () => $('#edit-panel').classList.add('translate-x-full')));
  $('#point-form').addEventListener('submit', handleFormSubmit);
  
  $('#projects-table thead').addEventListener('click', (e) => {
    const th = e.target.closest('th[data-sort]');
    if (!th) return;
    const k = th.dataset.sort;
    state.sort = { key: k, order: state.sort.key === k && state.sort.order === 'desc' ? 'asc' : 'desc' };
    
    $$('th .sort-icon').forEach(i => i.outerHTML = '<i class="sort-icon" data-lucide="chevrons-up-down"></i>');
    th.querySelector('.sort-icon').outerHTML = `<i class="sort-icon" data-lucide="chevron-${state.sort.order === 'asc' ? 'up' : 'down'}"></i>`;
    lucide.createIcons();
    renderTable();
  });

  $('#projects-table tbody').addEventListener('click', (e) => {
    const r = e.target.closest('tr');
    if (r) {
       const pt = state.mapPoints.find(p => String(p.id) === String(r.dataset.id));
       if (pt) openViewPanel(pt);
    }
  });

  $('#closeViewPanelBtn').addEventListener('click', closeViewPanel);
  
  // Profile Click Delegation (Global)
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-open-profile]');
    if (btn) {
       e.preventDefault(); e.stopPropagation();
       const uid = btn.dataset.openProfile;
       const { data } = await supabase.from('profiles').select('*').eq('id', uid).single();
       if (data) openProfileModal(data);
    }
  });

  initMediaUpload();
  initUserSearch();
  ['description','leadership','facilities','equipment','capabilities','experiments'].forEach(id => state.quillEditors[id] = initQuill(`#${id}`));
}

export function initMap() {
  map = L.map('map', { zoomControl: false }).setView([25, -75], 2);
  L.control.zoom({ position: 'bottomright' }).addTo(map);

  const base = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', { maxZoom: 20, attribution: 'CARTO' });
  const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Esri' });
  base.addTo(map);

  // Simplified Custom Controls
  const createCtrl = (pos, html, click) => {
    const C = L.Control.extend({
      onAdd: () => {
        const d = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
        Object.assign(d.style, { backgroundColor: 'white', padding: '5px', cursor: 'pointer', boxShadow: '0 1px 5px rgba(0,0,0,0.4)' });
        d.innerHTML = html;
        if (click) { d.onclick = (e) => { L.DomEvent.stopPropagation(e); click(d); }; }
        return d;
      }
    });
    map.addControl(new C({ position: pos }));
  };

  // Toggle Control
  createCtrl('topleft', `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>`, () => {
    if (map.hasLayer(sat)) { map.removeLayer(sat); base.addTo(map); }
    else { map.removeLayer(base); sat.addTo(map); }
    if (markersLayer) markersLayer.bringToFront();
  });

  // Legend
  const legendHtml = '<div style="font-weight:700;margin-bottom:5px;color:#334155;font-size:12px">System Types</div>' + 
    Object.entries(categoryColors).map(([k,c]) => `<div style="display:flex;align-items:center;margin-bottom:2px;font-size:11px;color:#475569"><span style="width:10px;height:10px;background:${c};border-radius:50%;margin-right:6px"></span>${k}</div>`).join('');
  createCtrl('bottomleft', `<div style="padding:5px">${legendHtml}</div>`);

  markersLayer = L.layerGroup().addTo(map);

  map.on('click', (e) => {
    if (['admin', 'organizer'].includes(authState.profile?.role)) {
      if (confirm(tr('map.add_prompt'))) {
        $('#view-panel').classList.add('-translate-x-full');
        openEditPanel(null);
        $('#latitude').value = e.latlng.lat.toFixed(6);
        $('#longitude').value = e.latlng.lng.toFixed(6);
      }
    } else closeViewPanel();
  });

  wireMapUI();
  supabase.auth.onAuthStateChange(() => setTimeout(checkAccess, 500));
  
  return Promise.all([loadAllUsers(), loadMapPoints()]).then(checkAccess);
}