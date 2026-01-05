import { supabase, authState } from './auth.js';
import { getAvatarUrl as getSharedAvatarUrl, $, $$ } from './ui.js';
import { openProfileModal } from './clickprofile.js';
import { formatRichText } from './rich-text.js';

let map;
let markersLayer;

// Marker Colors based on System Category
const categoryColors = {
    'Crops': '#16a34a',       // Green
    'Livestock': '#d97706',   // Amber/Brown
    'Ecovoltaics': '#0891b2', // Cyan/Teal
    'Aquaculture': '#2563eb', // Blue
    'Mixed': '#9333ea',       // Purple
    'Other': '#64748b'        // Slate/Gray
};

const state = {
    language: localStorage.getItem("lang") || "en",
    mapPoints: [],
    allUsers: [],
    selectedPoint: null,
    uploadedMedia: [],
    existingMedia: [],
    deletedMedia: [],
    selectedCollaborators: [],
    // Sort by Capacity by default
    sort: { key: 'generating_capacity_kw', order: 'desc' },
    quillEditors: {}
};

const t = {
    en: {
        nav: { schedule: "Schedule", archive: "Archive", about: "About", network: "Network Map", admin: "Admin" },
        auth: { signin: "Sign in", signout: "Sign out" },
        map: { add: "Add New Point", edit_panel_title: "Edit Point", add_panel_title: "Add New Point", deleteConfirm: "Are you sure you want to delete this point? This action cannot be undone.", add_prompt: "Do you want to add a new point at this location?" },
        form: { 
            media: "Media (videos/images)", institution: "Institution (Required)", project_name: "Project Name (Required)", 
            latitude: "Latitude (Required)", longitude: "Longitude (Required)", start_year: "Start Year (Required)", 
            area: "Area (m²)", associated_crops: "Target Species / Crops (Required)", av_system_type: "AV System Tech (Required)", 
            system_category: "System Type (Required)", affiliation: "Affiliation", link: "Website Link", 
            description: "Description", leadership: "Leadership", facilities: "Facilities", equipment: "Equipment", 
            capabilities: "Capabilities", experiments: "Experiments", cancel: "Cancel", save: "Save Point", 
            saving: "Saving...", generating_capacity_kw: "Generating Capacity (kW)", keywords: "Keywords", collaborators: "Collaborators" 
        },
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
        form: { 
            media: "Multimedia (vídeos/imágenes)", institution: "Institución (Obligatorio)", project_name: "Nombre del proyecto (Obligatorio)", 
            latitude: "Latitud (Obligatorio)", longitude: "Longitud (Obligatorio)", start_year: "Año de inicio (Obligatorio)", 
            area: "Superficie (m²)", associated_crops: "Especies Objetivo / Cultivos (Obligatorio)", av_system_type: "Tecnología de sistema AV (Obligatorio)", 
            system_category: "Tipo de Sistema (Obligatorio)", affiliation: "Afiliación", link: "Enlace al sitio web", 
            description: "Descripción", leadership: "Liderazgo", facilities: "Instalaciones", equipment: "Equipo", 
            capabilities: "Capacidades", experiments: "Experimentos", cancel: "Cancelar", save: "Guardar Punto", 
            saving: "Guardando...", generating_capacity_kw: "Capacidad de Generación (kW)", keywords: "Palabras Clave", collaborators: "Colaboradores" 
        },
        view: { keywords: "Palabras Clave", generating_capacity_kw: "Capacidad", collaborators: "Colaboradores" },
        popup: { project: "Proyecto", species: "Especies Objetivo", system: "Tecnología de Sistema", area: "Superficie", capacity: "Capacidad" },
        notifications: { load_error: "No se pudieron cargar los puntos del mapa.", save_success: "¡Punto guardado exitosamente!", save_error: "Error al guardar el punto.", delete_success: "Punto eliminado.", delete_error: "Error al eliminar el punto.", upload_error: "Falló la subida de multimedia.", no_collaborators: "Se debe seleccionar al menos un colaborador." },
        table: { project_name: "Nombre del Proyecto", institution: "Institución", system_type: "Tipo de Sistema", capacity_kw: "Capacidad (kW)", start_year: "Año" },
        footer: { note: "Seminario bilingüe y comunitario sobre agrofotovoltaica en América Latina." },
    }
};

const tr = (key) =>
  key.split('.').reduce((o, i) => o?.[i], t[localStorage.getItem("lang") || "en"]) || key;

function setFlash(msg, isError = false, timeout = 3000) {
    const el = $("#flash");
    if (!el) return;
    el.textContent = msg;
    el.style.backgroundColor = isError ? '#ef4444' : '#0f172a';
    el.style.display = 'block';
    el.classList.add("visible");
    clearTimeout(setFlash._t);
    if (timeout > 0) {
        setFlash._t = setTimeout(() => {
            el.classList.remove("visible");
            setTimeout(() => { el.style.display = 'none'; }, 500);
        }, timeout);
    }
}

function escapeHtml(s = "") {
    if (s === null || s === undefined) return "";
    return String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

function initQuill(selector) {
    if (!window.Quill) return null;
    return new Quill(selector, {
      theme: 'snow',
      modules: {
        toolbar: [
          ['bold', 'italic', 'underline'],
          [{ 'color': [] }, { 'background': [] }],
          [{ 'list': 'ordered'}, { 'list': 'bullet' }],
          ['link', 'clean']
        ]
      }
    });
}

function getQuillContent(quill) {
    if (!quill) return null;
    if (quill.getText().trim().length === 0 && quill.root.innerHTML === '<p><br></p>') return null;
    return quill.root.innerHTML;
}

function checkAccess() {
    const isAdmin = ['admin', 'organizer'].includes(authState.profile?.role);
    const addPointBtn = $('#addPointBtn');
    if (addPointBtn) {
        if (isAdmin) addPointBtn.classList.remove('hidden');
        else addPointBtn.classList.add('hidden');
    }
    // Re-render markers if specific perms affect visibility (optional, currently all public)
    // renderMarkers(); 
}

// Function to generate colored SVG icon
function createMarkerIcon(category) {
    const color = categoryColors[category] || categoryColors['Other'];
    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="36" height="36" fill="${color}" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="drop-shadow-lg">
        <path d="M12 2c-4.97 0-9 4.03-9 9 0 7 9 13 9 13s9-6 9-13c0-4.97-4.03-9-9-9z"></path>
        <circle cx="12" cy="11" r="3" fill="white"></circle>
    </svg>`;
    
    return L.divIcon({
        className: 'custom-marker',
        html: svg,
        iconSize: [36, 36],
        iconAnchor: [18, 36]
    });
}

function createCarousel(media) {
    if (!media || media.length === 0) {
        return '<div class="carousel-container bg-gray-300"></div>';
    }
    const sortedMedia = [...media].sort(
      (a, b) => (a.type === 'video' ? -1 : 1) - (b.type === 'video' ? -1 : 1)
    );
    if (sortedMedia.length === 1) {
        const item = sortedMedia[0];
        if (item.type === 'video') {
            return `<div class="carousel-container"><video src="${escapeHtml(
              item.url
            )}" controls autoplay muted loop playsinline class="w-full h-full object-cover"></video></div>`;
        }
        return `<div class="carousel-container"><img src="${escapeHtml(
          item.url
        )}" alt="Location media" class="w-full h-full object-cover"></div>`;
    }
    return `<div class="carousel-container">
        <div class="carousel-track" data-current-slide="0">
            ${sortedMedia
              .map(
                (item, idx) => `<div class="carousel-slide">
                ${
                  item.type === 'video'
                    ? `<video src="${escapeHtml(
                        item.url
                      )}" controls autoplay muted loop playsinline alt="Location video ${
                        idx + 1
                      }"></video>`
                    : `<img src="${escapeHtml(
                        item.url
                      )}" alt="Location image ${idx + 1}">`
                }
            </div>`
              )
              .join('')}
        </div>
        <button class="carousel-btn prev" data-carousel-action="prev"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg></button>
        <button class="carousel-btn next" data-carousel-action="next"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg></button>
        <div class="carousel-indicators">
            ${sortedMedia
              .map(
                (_item, idx) =>
                  `<span class="carousel-dot ${
                    idx === 0 ? 'active' : ''
                  }" data-slide-index="${idx}"></span>`
              )
              .join('')}
        </div>
    </div>`;
}

function initCarouselEvents(container) {
    const carousel = container.querySelector('.carousel-container');
    if (!carousel) return;
    const track = carousel.querySelector('.carousel-track');
    const slides = carousel.querySelectorAll('.carousel-slide');
    const dots = carousel.querySelectorAll('.carousel-dot');
    const prevBtn = carousel.querySelector('.carousel-btn.prev');
    const nextBtn = carousel.querySelector('.carousel-btn.next');
    if (!track || slides.length <= 1) return;
    let currentSlide = 0;
    const goToSlide = (index) => {
        currentSlide = index;
        track.style.transform = `translateX(-${currentSlide * 100}%)`;
        dots.forEach((dot, idx) => dot.classList.toggle('active', idx === currentSlide));
    };
    prevBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        goToSlide(currentSlide > 0 ? currentSlide - 1 : slides.length - 1);
    });
    nextBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        goToSlide(currentSlide < slides.length - 1 ? currentSlide + 1 : 0);
    });
    dots.forEach((dot, index) =>
      dot.addEventListener('click', (e) => {
          e.stopPropagation();
          goToSlide(index);
      })
    );
}

function initMediaUpload() {
    const dropZone = $('#mediaDropZone'),
      fileInput = $('#mediaUpload');
    if (!dropZone || !fileInput) return;
    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => handleFiles(e.target.files));
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragging');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragging'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragging');
        handleFiles(e.dataTransfer.files);
    });
}

function handleFiles(files) {
    Array.from(files).forEach((file) => {
        const type = file.type.startsWith('video/') ? 'video' : 'image';
        if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            state.uploadedMedia.push({
                file,
                preview: e.target.result,
                type,
                id: Date.now() + Math.random(),
            });
            renderMediaPreviews();
        };
        reader.readAsDataURL(file);
    });
}

function renderMediaPreviews() {
    const previewGrid = $('#mediaPreviewGrid');
    if (!previewGrid) return;
    const allMedia = [
        ...state.existingMedia.map((m) => ({ ...m, isExisting: true })),
        ...state.uploadedMedia,
    ];
    allMedia.sort(
      (a, b) => (a.type === 'video' ? -1 : 1) - (b.type === 'video' ? -1 : 1)
    );
    previewGrid.innerHTML = allMedia
      .map((item, idx) => {
          const preview = item.isExisting ? item.url : item.preview;
          const id = item.isExisting ? item.url : item.id;
          const typeIcon = item.type === 'video' ? 'video' : 'image';
          return `<div class="media-preview-item" data-media-id="${id}">
            ${
              item.type === 'video'
                ? `<video src="${preview}" muted loop playsinline></video>`
                : `<img src="${preview}" alt="Preview ${idx + 1}">`
            }
            <div class="media-preview-type-icon"><i data-lucide="${typeIcon}" class="w-4 h-4"></i></div>
            <button type="button" class="media-preview-remove" data-remove-id="${id}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
        </div>`;
      })
      .join('');
    lucide.createIcons();
    previewGrid
      .querySelectorAll('.media-preview-remove')
      .forEach((btn) =>
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            removeMedia(btn.dataset.removeId);
        })
      );
}

function removeMedia(id) {
    if (typeof id === 'string' && id.startsWith('http')) {
        const itemToRemove = state.existingMedia.find((m) => m.url === id);
        if (itemToRemove) {
            state.existingMedia = state.existingMedia.filter((m) => m.url !== id);
            state.deletedMedia.push(itemToRemove);
        }
    } else {
        state.uploadedMedia = state.uploadedMedia.filter((m) => m.id != id);
    }
    renderMediaPreviews();
}

async function loadMapPoints() {
    // OPTIMIZED QUERY: Only fetch required profile fields for collaborators
    const { data, error } = await supabase
      .from('map_points')
      .select('*, project_collaborators(profiles(id, full_name, avatar_url))')
      .order('created_at', { ascending: false });
    if (error) {
        setFlash(tr('notifications.load_error'), true);
        console.error('Error fetching map points:', error);
        return;
    }
    state.mapPoints =
      data.map((point) => ({
          ...point,
          collaborators: point.project_collaborators
            .map((pc) => pc.profiles)
            .filter(Boolean),
      })) || [];
    renderMarkers();
    renderTable();
}

async function loadAllUsers() {
    // OPTIMIZED QUERY: Only fetch fields needed for search
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .order('full_name', { ascending: true });
    if (error) {
        console.error('Error fetching users', error);
    } else {
        state.allUsers = data;
        // Pre-sign URLs in parallel
        await Promise.all(state.allUsers.map(async (user) => {
             user.public_avatar_url = await getSharedAvatarUrl(user.avatar_url);
        }));
    }
}

function renderMarkers() {
    if (!markersLayer) return;
    markersLayer.clearLayers();
    state.mapPoints.forEach((point) => {
        const category = point.system_category || 'Other';
        const marker = L.marker([point.latitude, point.longitude], {
            icon: createMarkerIcon(category)
        }).addTo(markersLayer);
        
        marker.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            openViewPanel(point);
            map.flyTo([point.latitude, point.longitude], Math.max(map.getZoom(), 8));
        });
    });
}

function cleanViewLabel(label) {
    return label
        .replace(/\s*\(Required\)/i, '')
        .replace(/\s*\(Obligatorio\)/i, '')
        .trim();
}

function openViewPanel(point) {
    state.selectedPoint = point;
    createViewPanelContent(point).then((html) => {
        $('#view-panel-content').innerHTML = html;
        $('#closeViewPanelBtn').addEventListener('click', closeViewPanel);
        $('#view-panel-content .btn-edit')?.addEventListener('click', () => {
            closeViewPanel();
            openEditPanel(point);
        });
        $('#view-panel-content .btn-delete')?.addEventListener('click', () =>
          handleDeletePoint(point.id)
        );
        initCarouselEvents($('#view-panel-content'));
        lucide.createIcons();
    });
    $('#view-panel').classList.remove('-translate-x-full');
    highlightTableRow(point.id, true);
}

function closeViewPanel() {
    $('#view-panel').classList.add('-translate-x-full');
    if (state.selectedPoint) highlightTableRow(state.selectedPoint.id, false);
    state.selectedPoint = null;
    $('#view-panel-content').innerHTML = '';
}

async function createViewPanelContent(point) {
    const isAdmin = ['admin', 'organizer'].includes(authState.profile?.role);
    let media = [];
    if (point.media_url && Array.isArray(point.media_url) && point.media_url.length > 0) {
        media = point.media_url;
    } else if (point.image_url) {
        try {
            let oldImages = JSON.parse(point.image_url);
            if (!Array.isArray(oldImages)) oldImages = [point.image_url];
            media = oldImages.map((url) => ({ url, type: 'image' }));
        } catch {
            media = [{ url: point.image_url, type: 'image' }];
        }
    }
    const collaboratorAvatars = await Promise.all(
      point.collaborators.map(async (c) => ({
          ...c,
          public_avatar_url: await getSharedAvatarUrl(c.avatar_url),
      }))
    );
    
    const createDetailSection = (labelKey, value, isHtml = false) => {
        if (!value || (Array.isArray(value) && value.length === 0)) return '';
        const rawLabel = tr(labelKey);
        const label = cleanViewLabel(rawLabel);
        
        const content = isHtml
          ? formatRichText(value)
          : escapeHtml(Array.isArray(value) ? value.join(', ') : value).replace(/\n/g, '<br>');

        return `<div class="py-4 border-b border-slate-100">
          <h4 class="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">${label}</h4>
          <div class="text-slate-700 prose prose-sm max-w-none">${content}</div>
        </div>`;
    };

    const capacityDisplay = point.generating_capacity_kw
      ? `${point.generating_capacity_kw} kW`
      : 'N/A';

    return `
        ${createCarousel(media)}
        <div class="p-4 sm:p-6">
            <div class="mb-4">
                <h2 class="font-display font-bold text-2xl text-brand-700 leading-tight">${escapeHtml(
                  point.project_name
                )}</h2>
                <p class="text-md text-slate-600 font-medium">${escapeHtml(
                  point.name
                )}</p>
                ${
                  point.system_category
                    ? `<span class="inline-block mt-1 text-xs font-bold px-2 py-0.5 rounded-md text-white uppercase" style="background-color: ${categoryColors[point.system_category] || categoryColors['Other']}">${escapeHtml(
                        point.system_category
                      )}</span>`
                    : ''
                }
            </div>

            <div class="grid grid-cols-2 gap-x-6 gap-y-4 text-sm bg-slate-50 p-4 rounded-lg mb-4">
                <div class="flex items-center gap-2">
                  <i data-lucide="zap" class="w-4 h-4 text-brand-700 shrink-0"></i>
                  <div>
                    <div class="font-semibold text-slate-600">${tr('popup.capacity')}</div>
                    <div class="text-slate-800">${capacityDisplay}</div>
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <i data-lucide="scaling" class="w-4 h-4 text-brand-700 shrink-0"></i>
                  <div>
                    <div class="font-semibold text-slate-600">${tr('popup.area')}</div>
                    <div class="text-slate-800">${point.area ? escapeHtml(point.area) : 'N/A'}</div>
                  </div>
                </div>
                <div class="flex items-start gap-2">
                  <i data-lucide="sprout" class="w-4 h-4 text-brand-700 mt-0.5 shrink-0"></i>
                  <div class="flex-1">
                    <div class="font-semibold text-slate-600">${tr('popup.species')}</div>
                    <div class="text-slate-800">${escapeHtml(point.associated_crops)}</div>
                  </div>
                </div>
                <div class="flex items-start gap-2">
                  <i data-lucide="solar-panel" class="w-4 h-4 text-brand-700 mt-0.5 shrink-0"></i>
                  <div class="flex-1">
                    <div class="font-semibold text-slate-600">${tr('popup.system')}</div>
                    <div class="text-slate-800">${escapeHtml(point.av_system_type)}</div>
                  </div>
                </div>
            </div>
            
            <div class="mb-4 pb-4 border-b border-slate-200">
                <h4 class="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">${tr(
                  'view.collaborators'
                )}</h4>
                <div class="flex flex-wrap gap-2">
                    ${
                      collaboratorAvatars.length
                        ? collaboratorAvatars
                            .map(
                              (c) => `
                        <div class="flex items-center gap-2 bg-slate-100 rounded-full pr-3 py-1 text-sm cursor-pointer hover:bg-slate-200 transition-colors" data-open-profile="${c.id}">
                            <img class="w-6 h-6 rounded-full object-cover" src="${
                              c.public_avatar_url ||
                              'static/avatar_placeholder.png'
                            }" alt="${escapeHtml(c.full_name)}">
                            <span class="font-medium text-slate-700">${escapeHtml(
                              c.full_name
                            )}</span>
                        </div>`
                            )
                            .join('')
                        : `<span class="text-sm text-slate-500 italic">No collaborators listed.</span>`
                    }
                </div>
            </div>
            
            <div class="flex flex-wrap gap-3 mb-4">
                ${
                  point.link
                    ? `<a href="${escapeHtml(
                        point.link
                      )}" target="_blank" rel="noopener noreferrer" class="flex-1 text-center btn btn-primary"><i data-lucide="external-link" class="w-4 h-4"></i>Website</a>`
                    : ''
                }
                ${
                  isAdmin
                    ? `<button class="flex-1 btn btn-secondary btn-edit" data-id="${
                        point.id
                      }"><i data-lucide="edit-3" class="w-4 h-4"></i>Edit</button>
                       <button class="flex-1 btn btn-danger btn-delete" data-id="${
                         point.id
                       }"><i data-lucide="trash-2" class="w-4 h-4"></i>Delete</button>`
                    : ''
                }
            </div>

            <div>
                ${createDetailSection('form.description', point.description, true)}
                ${createDetailSection('form.start_year', point.start_year)}
                ${createDetailSection('view.keywords', point.keywords)}
                ${createDetailSection('form.affiliation', point.affiliation)}
                ${createDetailSection('form.leadership', point.leadership, true)}
                ${createDetailSection('form.facilities', point.facilities, true)}
                ${createDetailSection('form.equipment', point.equipment, true)}
                ${createDetailSection('form.capabilities', point.capabilities, true)}
                ${createDetailSection('form.experiments', point.experiments, true)}
            </div>
        </div>`;
}

function openEditPanel(point = null) {
    state.selectedPoint = point;
    state.uploadedMedia = [];
    state.existingMedia = [];
    state.deletedMedia = [];
    state.selectedCollaborators = [];
    $('#point-form').reset();
    
    // Clear Quill Editors
    Object.values(state.quillEditors).forEach(q => q.setContents([]));

    if (point) {
        $('#panel-title').textContent = tr('map.edit_panel_title');
        $('#pointId').value = point.id;
        try {
            state.existingMedia = point.media_url || [];
        } catch {
            state.existingMedia = [];
        }
        
        // Populate Standard Fields
        Object.keys(point).forEach((key) => {
            const el = $(`#${key}`);
            if (el && el.tagName !== 'DIV') { 
                 el.value = Array.isArray(point[key]) ? point[key].join(', ') : point[key] || '';
            }
        });

        // Populate Quill Editors
        if(state.quillEditors.description) state.quillEditors.description.root.innerHTML = point.description || '';
        if(state.quillEditors.leadership) state.quillEditors.leadership.root.innerHTML = point.leadership || '';
        if(state.quillEditors.facilities) state.quillEditors.facilities.root.innerHTML = point.facilities || '';
        if(state.quillEditors.equipment) state.quillEditors.equipment.root.innerHTML = point.equipment || '';
        if(state.quillEditors.capabilities) state.quillEditors.capabilities.root.innerHTML = point.capabilities || '';
        if(state.quillEditors.experiments) state.quillEditors.experiments.root.innerHTML = point.experiments || '';

        state.selectedCollaborators = [...point.collaborators];
    } else {
        $('#panel-title').textContent = tr('map.add_panel_title');
        $('#pointId').value = '';
        $('#system_category').value = 'Crops';
    }
    renderMediaPreviews();
    renderSelectedCollaborators();
    $('#edit-panel').classList.remove('translate-x-full');
}

function closeEditPanel() {
    $('#edit-panel').classList.add('translate-x-full');
    state.selectedPoint = null;
    state.uploadedMedia = [];
    state.existingMedia = [];
    state.deletedMedia = [];
    state.selectedCollaborators = [];
    $('#point-form').reset();
    Object.values(state.quillEditors).forEach(q => q.setContents([]));
    $('#mediaPreviewGrid').innerHTML = '';
}

function initUserSearch() {
    const searchInput = $('#userSearch'),
      resultsContainer = $('#userSearchResults');
    searchInput.addEventListener('input', () => {
        const query = searchInput.value.toLowerCase();
        if (query.length < 2) {
            resultsContainer.style.display = 'none';
            return;
        }
        const filteredUsers = state.allUsers.filter(
          (user) =>
            user.full_name.toLowerCase().includes(query) &&
            !state.selectedCollaborators.find((sc) => sc.id === user.id)
        );
        resultsContainer.innerHTML = filteredUsers
          .map(
            (user) => `<div class="user-search-item" data-user-id="${user.id}">
              <img src="${
                user.public_avatar_url || 'static/avatar_placeholder.png'
              }" alt="${escapeHtml(user.full_name)}">
              <span>${escapeHtml(user.full_name)}</span>
            </div>`
          )
          .join('');
        resultsContainer.style.display = filteredUsers.length > 0 ? 'block' : 'none';
    });
    resultsContainer.addEventListener('click', (e) => {
        const item = e.target.closest('.user-search-item');
        if (!item) return;
        const userId = item.dataset.userId;
        const user = state.allUsers.find((u) => u.id === userId);
        if (user) {
            state.selectedCollaborators.push(user);
            renderSelectedCollaborators();
            searchInput.value = '';
            resultsContainer.style.display = 'none';
        }
    });
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.user-search-wrapper'))
            resultsContainer.style.display = 'none';
    });
}

async function renderSelectedCollaborators() {
    const container = $('#selectedUsers');
    for (const user of state.selectedCollaborators) {
        if (!user.public_avatar_url)
            user.public_avatar_url = await getSharedAvatarUrl(user.avatar_url);
    }
    container.innerHTML = state.selectedCollaborators
      .map(
        (user) => `<div class="selected-user-pill" data-user-id="${user.id}">
        <img src="${
          user.public_avatar_url || 'static/avatar_placeholder.png'
        }" alt="${escapeHtml(user.full_name)}">
        <span>${escapeHtml(user.full_name)}</span>
        <button type="button" class="remove-user-btn">×</button>
      </div>`
      )
      .join('');
    container.querySelectorAll('.remove-user-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const userId = btn.closest('.selected-user-pill').dataset.userId;
            state.selectedCollaborators = state.selectedCollaborators.filter(
              (u) => u.id !== userId
            );
            renderSelectedCollaborators();
        });
    });
}

async function handleFormSubmit(e) {
    e.preventDefault();
    const btn = $('#saveBtn');
    btn.disabled = true;
    btn.textContent = tr('form.saving');
    
    try {
        const uploadedMediaData = [];
        for (const { file, type } of state.uploadedMedia) {
            const fileName = `${Date.now()}-${Math.random().toString(36).substr(
              2,
              9
            )}.${file.name.split('.').pop()}`;
            const filePath = `${authState.profile.id}/${fileName}`;
            const { error } = await supabase.storage
              .from('map_media')
              .upload(filePath, file);
            if (error) throw new Error(`${tr('notifications.upload_error')}: ${error.message}`);
            const {
                data: { publicUrl },
            } = supabase.storage.from('map_media').getPublicUrl(filePath);
            uploadedMediaData.push({ url: publicUrl, type });
        }

        for (const deleted of state.deletedMedia) {
            const mediaPath = deleted.url.split('/map_media/')[1];
            if (mediaPath) await supabase.storage.from('map_media').remove([mediaPath]);
        }

        const allMedia = [...state.existingMedia, ...uploadedMediaData];

        let legacyImageUrl = '';
        if (allMedia.length > 0) {
            const firstImage = allMedia.find((m) => m.type === 'image');
            legacyImageUrl = firstImage ? firstImage.url : allMedia[0].url;
        }

        const pointData = {
            name: $('#name').value,
            project_name: $('#project_name').value,
            latitude: parseFloat($('#latitude').value),
            longitude: parseFloat($('#longitude').value),
            start_year: parseInt($('#start_year').value, 10),
            area: $('#area').value || null,
            associated_crops: $('#associated_crops').value,
            av_system_type: $('#av_system_type').value,
            system_category: $('#system_category').value,
            media_url: allMedia,
            image_url: legacyImageUrl,
            affiliation: $('#affiliation').value || null,
            link: $('#link').value || null,
            description: getQuillContent(state.quillEditors.description),
            leadership: getQuillContent(state.quillEditors.leadership),
            facilities: getQuillContent(state.quillEditors.facilities),
            equipment: getQuillContent(state.quillEditors.equipment),
            capabilities: getQuillContent(state.quillEditors.capabilities),
            experiments: getQuillContent(state.quillEditors.experiments),
            created_by: authState.profile.id,
            generating_capacity_kw:
              parseFloat($('#generating_capacity_kw').value) || null,
            keywords:
              $('#keywords')
                .value.split(',')
                .map((k) => k.trim())
                .filter(Boolean) || [],
        };

        const { data: savedPoint, error } = $('#pointId').value
            ? await supabase
                .from('map_points')
                .update(pointData)
                .eq('id', $('#pointId').value)
                .select()
                .single()
            : await supabase.from('map_points').insert(pointData).select().single();

        if (error) throw error;

        const pointId = savedPoint.id;
        const { error: deleteError } = await supabase
          .from('project_collaborators')
          .delete()
          .eq('project_id', pointId);
        if (deleteError) throw deleteError;
        
        const collaboratorRows = state.selectedCollaborators.map((user) => ({
            project_id: pointId,
            user_id: user.id,
        }));
        if (collaboratorRows.length > 0) {
            const { error: insertError } = await supabase
              .from('project_collaborators')
              .insert(collaboratorRows);
            if (insertError) throw insertError;
        }

        setFlash(tr('notifications.save_success'));
        closeEditPanel();
        await loadMapPoints();
    } catch (error) {
        setFlash(error.message || tr('notifications.save_error'), true);
        console.error('Form submit error:', error);
    } finally {
        btn.disabled = false;
        btn.textContent = tr('form.save');
    }
}

async function handleDeletePoint(pointId) {
    if (!confirm(tr('map.deleteConfirm'))) return;
    try {
        const pointToDelete = state.mapPoints.find((p) => p.id === pointId);
        if (!pointToDelete) throw new Error('Point not found');
        const { error: dbError } = await supabase
          .from('map_points')
          .delete()
          .eq('id', pointId);
        if (dbError) throw dbError;
        let media = [];
        try {
            media = pointToDelete.media_url || [];
        } catch {
            media = [];
        }
        const mediaPaths = media
          .map((m) => m.url.split('/map_media/')[1])
          .filter(Boolean);
        if (mediaPaths.length > 0)
            await supabase.storage.from('map_media').remove(mediaPaths);
        setFlash(tr('notifications.delete_success'));
        closeViewPanel();
        await loadMapPoints();
    } catch (error) {
        setFlash(error.message || tr('notifications.delete_error'), true);
        console.error('Delete error:', error);
    }
}

function renderTable() {
    const tbody = $('#projects-table tbody');
    if (!tbody) return;
    const key = state.sort.key;
    const sortedPoints = [...state.mapPoints].sort((a, b) => {
        let valA = a[key];
        let valB = b[key];

        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();
        
        // Handle nulls always last for desc sort, first for asc (or logic of choice)
        // Here: pushing nulls to bottom usually preferred
        if (valA === null || valA === undefined) return 1;
        if (valB === null || valB === undefined) return -1;
        
        if (valA < valB) return state.sort.order === 'asc' ? -1 : 1;
        if (valA > valB) return state.sort.order === 'asc' ? 1 : -1;
        return 0;
    });

    tbody.innerHTML = sortedPoints
      .map((p) => {
          return `<tr data-point-id="${p.id}">
            <td class="p-3">${escapeHtml(p.project_name)}</td>
            <td class="p-3">${escapeHtml(p.name)}</td>
            <td class="p-3">${escapeHtml(p.system_category || '')}</td>
            <td class="p-3 font-mono">${p.generating_capacity_kw ?? '-'}</td>
            <td class="p-3">${p.start_year || '-'}</td>
        </tr>`;
      })
      .join('');
}

function handleTableSort(e) {
    const header = e.target.closest('th');
    if (!header || !header.dataset.sort) return;
    const key = header.dataset.sort;
    if (state.sort.key === key) {
        state.sort.order = state.sort.order === 'asc' ? 'desc' : 'asc';
    } else {
        state.sort.key = key;
        state.sort.order = 'desc'; // Default to desc for new columns often better for capacity
    }
    $$('#projects-table th').forEach((th) => {
        th.classList.remove('sort-asc', 'sort-desc');
        const icon = th.querySelector('.sort-icon');
        if (icon) icon.outerHTML = `<i class="sort-icon" data-lucide="chevrons-up-down"></i>`;
    });
    header.classList.add(state.sort.order === 'asc' ? 'sort-asc' : 'sort-desc');
    const sortIconName = state.sort.order === 'asc' ? 'chevron-up' : 'chevron-down';
    const icon = header.querySelector('.sort-icon');
    if (icon) icon.outerHTML = `<i class="sort-icon" data-lucide="${sortIconName}"></i>`;
    lucide.createIcons();
    renderTable();
}

function highlightTableRow(pointId, shouldHighlight) {
    $$('#projects-table tbody tr').forEach((row) =>
      row.classList.remove('selected')
    );
    if (shouldHighlight) {
        const row = $(`#projects-table tbody tr[data-point-id="${pointId}"]`);
        if (row) {
            row.classList.add('selected');
            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
}

function wireMapUI() {
    $('#addPointBtn').addEventListener('click', () => openEditPanel(null));
    $('#closePanelBtn').addEventListener('click', closeEditPanel);
    $('#cancelBtn').addEventListener('click', closeEditPanel);
    $('#point-form').addEventListener('submit', handleFormSubmit);
    initMediaUpload();
    initUserSearch();
    $('#projects-table thead').addEventListener('click', handleTableSort);
    $('#projects-table tbody').addEventListener('click', (e) => {
        const row = e.target.closest('tr');
        if (!row) return;
        const pointId = row.dataset.pointId;
        const point = state.mapPoints.find((p) => p.id === pointId);
        if (point) openViewPanel(point);
    });
    $('#closeViewPanelBtn').addEventListener('click', closeViewPanel);
    
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-open-profile]');
        if (btn) {
            e.preventDefault();
            const profileId = btn.dataset.openProfile;
            if (state.selectedPoint && state.selectedPoint.collaborators) {
                const user = state.selectedPoint.collaborators.find(c => c.id === profileId);
                if (user) openProfileModal(user);
            }
        }
    });
    
    // INITIALIZE QUILL EDITORS
    state.quillEditors.description = initQuill('#description');
    state.quillEditors.leadership = initQuill('#leadership');
    state.quillEditors.facilities = initQuill('#facilities');
    state.quillEditors.equipment = initQuill('#equipment');
    state.quillEditors.capabilities = initQuill('#capabilities');
    state.quillEditors.experiments = initQuill('#experiments');
}

export function initMap() {
    map = L.map('map', { zoomControl: false }).setView([25, -75], 2);
    window.map = map;
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    const defaultLayer = L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png',
      {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
          subdomains: 'abcd',
          maxZoom: 20,
      }
    );

    const satelliteLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
          attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
      }
    );

    defaultLayer.addTo(map);
    let isSatellite = false;

    // Custom Toggle Control with Stacked Layer Icon
    const LayerToggle = L.Control.extend({
        options: { position: 'topleft' },
        onAdd: function() {
            const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
            container.style.backgroundColor = 'white';
            container.style.width = '32px';
            container.style.height = '32px';
            container.style.borderRadius = '4px';
            container.style.cursor = 'pointer';
            container.style.display = 'flex';
            container.style.alignItems = 'center';
            container.style.justifyContent = 'center';
            container.style.boxShadow = '0 1px 5px rgba(0,0,0,0.65)';
            container.title = "Switch Map View";

            // Stacked Layer Icon (Lucide style)
            const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>`;

            container.innerHTML = icon;

            container.onclick = (e) => {
                L.DomEvent.stopPropagation(e);
                if (isSatellite) {
                    map.removeLayer(satelliteLayer);
                    defaultLayer.addTo(map);
                } else {
                    map.removeLayer(defaultLayer);
                    satelliteLayer.addTo(map);
                }
                isSatellite = !isSatellite;
                if (markersLayer) markersLayer.bringToFront();
            };

            return container;
        }
    });

    map.addControl(new LayerToggle());

    // Legend Control (Bottom Left)
    const Legend = L.Control.extend({
        options: { position: 'bottomleft' },
        onAdd: function() {
            const div = L.DomUtil.create('div', 'info legend');
            div.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
            div.style.padding = '10px';
            div.style.borderRadius = '8px';
            div.style.boxShadow = '0 1px 5px rgba(0,0,0,0.4)';
            div.style.fontSize = '12px';
            div.style.fontFamily = 'Inter, sans-serif';
            div.style.marginBottom = '20px'; // Space from bottom
            div.style.marginLeft = '10px';

            let html = '<div style="font-weight:700; margin-bottom:5px; color:#334155">System Types</div>';
            Object.entries(categoryColors).forEach(([label, color]) => {
                html += `<div style="display:flex; align-items:center; margin-bottom:4px;">
                    <span style="width:12px; height:12px; background-color:${color}; border-radius:50%; display:inline-block; margin-right:8px;"></span>
                    <span style="color:#475569">${label}</span>
                </div>`;
            });
            div.innerHTML = html;
            return div;
        }
    });

    map.addControl(new Legend());

    markersLayer = L.layerGroup().addTo(map);
    
    // Add Click listener for Admins to add points
    map.on('click', (e) => {
        const isAdmin = ['admin', 'organizer'].includes(authState.profile?.role);
        // Ensure not clicking on a control or existing panel
        if(isAdmin) {
             // Close existing panels first
             $('#view-panel').classList.add('-translate-x-full');
             
             // Confirm intention
             if(confirm(tr('map.add_prompt'))) {
                 openEditPanel(null);
                 // Pre-populate coordinates with high precision
                 $('#latitude').value = e.latlng.lat.toFixed(6);
                 $('#longitude').value = e.latlng.lng.toFixed(6);
             }
        } else {
             closeViewPanel();
        }
    });

    wireMapUI();
    checkAccess();
    
    // Listen for auth state changes to update permissions UI
    supabase.auth.onAuthStateChange((_event, session) => {
        // auth.js updates authState, we just need to re-check permissions
        // wait briefly for authState.profile to populate if this is a login event
        setTimeout(() => checkAccess(), 500);
    });

    // === PARALLEL DATA FETCH ===
    return Promise.all([loadAllUsers(), loadMapPoints()]);
}