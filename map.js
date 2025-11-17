// C:\HELLOWORLD\AgroCollaboration\map.js
import { supabase, authState } from './auth.js';
import { getAvatarUrl as getSharedAvatarUrl, $, $$ } from './ui.js';

// --- STATE & CONFIG ---
let map;
let markersLayer;
const state = {
    language: localStorage.getItem("lang") || "en",
    mapPoints: [],
    allUsers: [],
    selectedPoint: null,
    uploadedMedia: [],
    existingMedia: [],
    deletedMedia: [],
    selectedCollaborators: [],
    sort: { key: 'project_name', order: 'asc' },
};

const t = {
    en: {
        nav: { schedule: "Schedule", archive: "Archive", about: "About", network: "Network Map", admin: "Admin" },
        auth: { signin: "Sign in", signout: "Sign out" },
        map: { add: "Add New Point", edit_panel_title: "Edit Point", add_panel_title: "Add New Point", deleteConfirm: "Are you sure you want to delete this point? This action cannot be undone." },
        form: { media: "Media (videos/images)", institution: "Institution (Required)", project_name: "Project Name (Required)", latitude: "Latitude (Required)", longitude: "Longitude (Required)", start_year: "Start Year (Required)", area: "Area (ha or m2) (Required)", associated_crops: "Associated Crop(s) (Required)", av_system_type: "AV System Type (Required)", affiliation: "Affiliation", link: "Website Link", description: "Description", leadership: "Leadership", facilities: "Facilities", equipment: "Equipment", capabilities: "Capabilities", experiments: "Experiments", cancel: "Cancel", save: "Save Point", saving: "Saving...", generating_capacity_kw: "Generating Capacity (kW)", keywords: "Keywords", collaborators: "Collaborators (Required)" },
        view: { keywords: "Keywords", generating_capacity_kw: "Generating Capacity", collaborators: "Collaborators" },
        popup: { project: "Project", crops: "Crops", system: "System Type", area: "Area", year: "Start Year" },
        notifications: { load_error: "Could not load map points.", save_success: "Point saved successfully!", save_error: "Error saving point.", delete_success: "Point deleted.", delete_error: "Error deleting point.", upload_error: "Media upload failed.", no_collaborators: "At least one collaborator must be selected." },
        table: { project_name: "Project Name", institution: "Institution", start_year: "Year", capacity: "Capacity (kW)", area: "Area" },
        footer: { note: "Bilingual, community-driven seminar on agrivoltaics in Latin America." },
    },
    es: {
        nav: { schedule: "Calendario", archive: "Archivo", about: "Acerca de", network: "Mapa de la Red", admin: "Admin" },
        auth: { signin: "Iniciar sesión", signout: "Cerrar sesión" },
        map: { add: "Añadir Nuevo Punto", edit_panel_title: "Editar Punto", add_panel_title: "Añadir Nuevo Punto", deleteConfirm: "¿Estás seguro de que quieres eliminar este punto? Esta acción no se puede deshacer." },
        form: { media: "Multimedia (vídeos/imágenes)", institution: "Institución (Obligatorio)", project_name: "Nombre del proyecto (Obligatorio)", latitude: "Latitud (Obligatorio)", longitude: "Longitud (Obligatorio)", start_year: "Año de inicio (Obligatorio)", area: "Superficie (ha o m2) (Obligatorio)", associated_crops: "Cultivo(s) asociado(s) (Obligatorio)", av_system_type: "Tipo de sistema AV (Obligatorio)", affiliation: "Afiliación", link: "Enlace al sitio web", description: "Descripción", leadership: "Liderazgo", facilities: "Instalaciones", equipment: "Equipo", capabilities: "Capacidades", experiments: "Experimentos", cancel: "Cancelar", save: "Guardar Punto", saving: "Guardando...", generating_capacity_kw: "Capacidad de Generación (kW)", keywords: "Palabras Clave", collaborators: "Colaboradores (Obligatorio)" },
        view: { keywords: "Palabras Clave", generating_capacity_kw: "Capacidad de Generación", collaborators: "Colaboradores" },
        popup: { project: "Proyecto", crops: "Cultivos", system: "Tipo de Sistema", area: "Superficie", year: "Año de Inicio" },
        notifications: { load_error: "No se pudieron cargar los puntos del mapa.", save_success: "¡Punto guardado exitosamente!", save_error: "Error al guardar el punto.", delete_success: "Punto eliminado.", delete_error: "Error al eliminar el punto.", upload_error: "Falló la subida de multimedia.", no_collaborators: "Se debe seleccionar al menos un colaborador." },
        table: { project_name: "Nombre del Proyecto", institution: "Institución", start_year: "Año", capacity: "Capacidad (kW)", area: "Área" },
        footer: { note: "Seminario bilingüe y comunitario sobre agrofotovoltaica en América Latina." },
    }
};

const tr = (key) => key.split('.').reduce((o, i) => o?.[i], t[localStorage.getItem("lang") || "en"]) || key;

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

function checkAccess() {
    const isAdmin = ['admin', 'organizer'].includes(authState.profile?.role);
    const addPointBtn = $('#addPointBtn');
    if (addPointBtn) {
        if (isAdmin) { addPointBtn.classList.remove('hidden'); } else { addPointBtn.classList.add('hidden'); }
    }
    renderMarkers();
}

function createCarousel(media) {
    if (!media || media.length === 0) {
        return '<div class="carousel-container bg-gray-300"></div>';
    }
    const sortedMedia = [...media].sort((a, b) => (a.type === 'video' ? -1 : 1) - (b.type === 'video' ? -1 : 1));
    if (sortedMedia.length === 1) {
        const item = sortedMedia[0];
        if (item.type === 'video') {
            return `<div class="carousel-container"><video src="${escapeHtml(item.url)}" controls autoplay muted loop playsinline class="w-full h-full object-cover"></video></div>`;
        }
        return `<div class="carousel-container"><img src="${escapeHtml(item.url)}" alt="Location media" class="w-full h-full object-cover"></div>`;
    }
    return `<div class="carousel-container">
        <div class="carousel-track" data-current-slide="0">
            ${sortedMedia.map((item, idx) => `<div class="carousel-slide">
                ${item.type === 'video' 
                    ? `<video src="${escapeHtml(item.url)}" controls autoplay muted loop playsinline alt="Location video ${idx + 1}"></video>`
                    : `<img src="${escapeHtml(item.url)}" alt="Location image ${idx + 1}">`
                }
            </div>`).join('')}
        </div>
        <button class="carousel-btn prev" data-carousel-action="prev"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg></button>
        <button class="carousel-btn next" data-carousel-action="next"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg></button>
        <div class="carousel-indicators">
            ${sortedMedia.map((_, idx) => `<span class="carousel-dot ${idx === 0 ? 'active' : ''}" data-slide-index="${idx}"></span>`).join('')}
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
    prevBtn?.addEventListener('click', (e) => { e.stopPropagation(); goToSlide(currentSlide > 0 ? currentSlide - 1 : slides.length - 1); });
    nextBtn?.addEventListener('click', (e) => { e.stopPropagation(); goToSlide(currentSlide < slides.length - 1 ? currentSlide + 1 : 0); });
    dots.forEach((dot, index) => dot.addEventListener('click', (e) => { e.stopPropagation(); goToSlide(index); }));
}

function initMediaUpload() {
    const dropZone = $('#mediaDropZone'), fileInput = $('#mediaUpload');
    if (!dropZone || !fileInput) return;
    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => handleFiles(e.target.files));
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragging'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragging'));
    dropZone.addEventListener('drop', (e) => { e.preventDefault(); dropZone.classList.remove('dragging'); handleFiles(e.dataTransfer.files); });
}

function handleFiles(files) {
    Array.from(files).forEach(file => {
        const type = file.type.startsWith('video/') ? 'video' : 'image';
        if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            state.uploadedMedia.push({ file, preview: e.target.result, type, id: Date.now() + Math.random() });
            renderMediaPreviews();
        };
        reader.readAsDataURL(file);
    });
}

function renderMediaPreviews() {
    const previewGrid = $('#mediaPreviewGrid');
    if (!previewGrid) return;
    const allMedia = [...state.existingMedia.map(m => ({ ...m, isExisting: true })), ...state.uploadedMedia];
    allMedia.sort((a, b) => (a.type === 'video' ? -1 : 1) - (b.type === 'video' ? -1 : 1));
    previewGrid.innerHTML = allMedia.map((item, idx) => {
        const preview = item.isExisting ? item.url : item.preview;
        const id = item.isExisting ? item.url : item.id;
        const typeIcon = item.type === 'video' ? 'video' : 'image';
        return `<div class="media-preview-item" data-media-id="${id}">
            ${item.type === 'video' ? `<video src="${preview}" muted loop playsinline></video>` : `<img src="${preview}" alt="Preview ${idx + 1}">`}
            <div class="media-preview-type-icon"><i data-lucide="${typeIcon}" class="w-4 h-4"></i></div>
            <button type="button" class="media-preview-remove" data-remove-id="${id}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
        </div>`;
    }).join('');
    lucide.createIcons();
    previewGrid.querySelectorAll('.media-preview-remove').forEach(btn => btn.addEventListener('click', (e) => { e.preventDefault(); removeMedia(btn.dataset.removeId); }));
}

function removeMedia(id) {
    if (typeof id === 'string' && id.startsWith('http')) {
        const itemToRemove = state.existingMedia.find(m => m.url === id);
        if (itemToRemove) {
            state.existingMedia = state.existingMedia.filter(m => m.url !== id);
            state.deletedMedia.push(itemToRemove);
        }
    } else {
        state.uploadedMedia = state.uploadedMedia.filter(m => m.id != id);
    }
    renderMediaPreviews();
}

async function loadMapPoints() {
    const { data, error } = await supabase.from('map_points').select('*, project_collaborators(profiles(id, full_name, avatar_url))').order('created_at', { ascending: false });
    if (error) { setFlash(tr('notifications.load_error'), true); console.error('Error fetching map points:', error); return; }
    state.mapPoints = data.map(point => ({ ...point, collaborators: point.project_collaborators.map(pc => pc.profiles).filter(Boolean) })) || [];
    renderMarkers();
    renderTable();
}

async function loadAllUsers() {
    const { data, error } = await supabase.from('profiles').select('id, full_name, avatar_url').order('full_name', { ascending: true });
    if (error) { console.error("Error fetching users", error); } else {
        state.allUsers = data;
        for (const user of state.allUsers) { user.public_avatar_url = await getSharedAvatarUrl(user.avatar_url); }
    }
}

function renderMarkers() {
    if (!markersLayer) return;
    markersLayer.clearLayers();
    state.mapPoints.forEach(point => {
        const marker = L.marker([point.latitude, point.longitude]).addTo(markersLayer);
        marker.on('click', (e) => { L.DomEvent.stopPropagation(e); openViewPanel(point); map.flyTo([point.latitude, point.longitude], Math.max(map.getZoom(), 8)); });
    });
}

function openViewPanel(point) {
    state.selectedPoint = point;
    createViewPanelContent(point).then(html => {
        $('#view-panel-content').innerHTML = html;
        $('#closeViewPanelBtn').addEventListener('click', closeViewPanel);
        $('#view-panel-content .btn-edit')?.addEventListener('click', () => { closeViewPanel(); openEditPanel(point); });
        $('#view-panel-content .btn-delete')?.addEventListener('click', () => { handleDeletePoint(point.id); });
        initCarouselEvents($('#view-panel-content'));
        lucide.createIcons();
    });
    $('#view-panel').classList.remove('-translate-x-full');
    highlightTableRow(point.id, true);
}

function closeViewPanel() {
    $('#view-panel').classList.add('-translate-x-full');
    if (state.selectedPoint) { highlightTableRow(state.selectedPoint.id, false); }
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
            media = oldImages.map(url => ({ url: url, type: 'image' }));
        } catch {
            media = [{ url: point.image_url, type: 'image' }];
        }
    }
    const collaboratorAvatars = await Promise.all(point.collaborators.map(async c => ({ ...c, public_avatar_url: await getSharedAvatarUrl(c.avatar_url) })));
    const createDetailSection = (labelKey, value, isHtml = false) => {
        if (!value || (Array.isArray(value) && value.length === 0)) return '';
        const content = isHtml ? value : escapeHtml(Array.isArray(value) ? value.join(', ') : value).replace(/\n/g, '<br>');
        return `<div class="py-4 border-b border-slate-100"><h4 class="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">${tr(labelKey)}</h4><div class="text-slate-700 prose prose-sm max-w-none">${content}</div></div>`;
    };

    return `
        ${createCarousel(media)}
        <div class="p-4 sm:p-6">
            <div class="mb-4">
                <h2 class="font-display font-bold text-2xl text-brand-700 leading-tight">${escapeHtml(point.project_name)}</h2>
                <p class="text-md text-slate-600 font-medium">${escapeHtml(point.name)}</p>
            </div>

            <div class="grid grid-cols-2 gap-x-6 gap-y-4 text-sm bg-slate-50 p-4 rounded-lg mb-4">
                <div class="flex items-center gap-2"><i data-lucide="calendar" class="w-4 h-4 text-brand-700 shrink-0"></i><div><div class="font-semibold text-slate-600">${tr('popup.year')}</div><div class="text-slate-800">${escapeHtml(point.start_year)}</div></div></div>
                <div class="flex items-center gap-2"><i data-lucide="scaling" class="w-4 h-4 text-brand-700 shrink-0"></i><div><div class="font-semibold text-slate-600">${tr('popup.area')}</div><div class="text-slate-800">${escapeHtml(point.area)}</div></div></div>
                <div class="flex items-start gap-2"><i data-lucide="sprout" class="w-4 h-4 text-brand-700 mt-0.5 shrink-0"></i><div class="flex-1"><div class="font-semibold text-slate-600">${tr('popup.crops')}</div><div class="text-slate-800">${escapeHtml(point.associated_crops)}</div></div></div>
                <div class="flex items-start gap-2"><i data-lucide="solar-panel" class="w-4 h-4 text-brand-700 mt-0.5 shrink-0"></i><div class="flex-1"><div class="font-semibold text-slate-600">${tr('popup.system')}</div><div class="text-slate-800">${escapeHtml(point.av_system_type)}</div></div></div>
            </div>
            
            <div class="mb-4 pb-4 border-b border-slate-200">
                <h4 class="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">${tr('view.collaborators')}</h4>
                <div class="flex flex-wrap gap-2">
                    ${collaboratorAvatars.map(c => `
                        <div class="flex items-center gap-2 bg-slate-100 rounded-full pr-3 py-1 text-sm">
                            <img class="w-6 h-6 rounded-full object-cover" src="${c.public_avatar_url || 'static/avatar_placeholder.png'}" alt="${escapeHtml(c.full_name)}">
                            <span class="font-medium text-slate-700">${escapeHtml(c.full_name)}</span>
                        </div>
                    `).join('') || `<span class="text-sm text-slate-500">No collaborators listed.</span>`}
                </div>
            </div>
            
            <div class="flex flex-wrap gap-3 mb-4">
                ${point.link ? `<a href="${escapeHtml(point.link)}" target="_blank" rel="noopener noreferrer" class="flex-1 text-center btn btn-primary"><i data-lucide="external-link" class="w-4 h-4"></i>Website</a>` : ''}
                ${isAdmin ? `<button class="flex-1 btn btn-secondary btn-edit" data-id="${point.id}"><i data-lucide="edit-3" class="w-4 h-4"></i>Edit</button><button class="flex-1 btn btn-danger btn-delete" data-id="${point.id}"><i data-lucide="trash-2" class="w-4 h-4"></i>Delete</button>` : ''}
            </div>

            <div>
                ${createDetailSection('form.description', point.description)}
                ${createDetailSection('view.generating_capacity_kw', point.generating_capacity_kw ? `${point.generating_capacity_kw} kW` : null)}
                ${createDetailSection('view.keywords', point.keywords)}
                ${createDetailSection('form.affiliation', point.affiliation)}
                ${createDetailSection('form.leadership', point.leadership, true)}
                ${createDetailSection('form.facilities', point.facilities)}
                ${createDetailSection('form.equipment', point.equipment)}
                ${createDetailSection('form.capabilities', point.capabilities)}
                ${createDetailSection('form.experiments', point.experiments)}
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
    if (point) {
        $('#panel-title').textContent = tr('map.edit_panel_title');
        $('#pointId').value = point.id;
        try { state.existingMedia = point.media_url || []; } catch { state.existingMedia = []; }
        Object.keys(point).forEach(key => { const el = $(`#${key}`); if (el) el.value = Array.isArray(point[key]) ? point[key].join(', ') : (point[key] || ''); });
        state.selectedCollaborators = [...point.collaborators];
    } else {
        $('#panel-title').textContent = tr('map.add_panel_title');
        $('#pointId').value = '';
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
    $('#mediaPreviewGrid').innerHTML = '';
}

function initUserSearch() {
    const searchInput = $('#userSearch'), resultsContainer = $('#userSearchResults');
    searchInput.addEventListener('input', () => {
        const query = searchInput.value.toLowerCase();
        if (query.length < 2) { resultsContainer.style.display = 'none'; return; }
        const filteredUsers = state.allUsers.filter(user => user.full_name.toLowerCase().includes(query) && !state.selectedCollaborators.find(sc => sc.id === user.id));
        resultsContainer.innerHTML = filteredUsers.map(user => `<div class="user-search-item" data-user-id="${user.id}"><img src="${user.public_avatar_url || 'static/avatar_placeholder.png'}" alt="${escapeHtml(user.full_name)}"><span>${escapeHtml(user.full_name)}</span></div>`).join('');
        resultsContainer.style.display = filteredUsers.length > 0 ? 'block' : 'none';
    });
    resultsContainer.addEventListener('click', (e) => {
        const item = e.target.closest('.user-search-item');
        if (!item) return;
        const userId = item.dataset.userId;
        const user = state.allUsers.find(u => u.id === userId);
        if (user) { state.selectedCollaborators.push(user); renderSelectedCollaborators(); searchInput.value = ''; resultsContainer.style.display = 'none'; }
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('.user-search-wrapper')) resultsContainer.style.display = 'none'; });
}

async function renderSelectedCollaborators() {
    const container = $('#selectedUsers');
    const hiddenInput = $('#collaborators_hidden_required');
    for (const user of state.selectedCollaborators) {
        if (!user.public_avatar_url) user.public_avatar_url = await getSharedAvatarUrl(user.avatar_url);
    }
    container.innerHTML = state.selectedCollaborators.map(user => `<div class="selected-user-pill" data-user-id="${user.id}"><img src="${user.public_avatar_url || 'static/avatar_placeholder.png'}" alt="${escapeHtml(user.full_name)}"><span>${escapeHtml(user.full_name)}</span><button type="button" class="remove-user-btn">×</button></div>`).join('');
    container.querySelectorAll('.remove-user-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const userId = btn.closest('.selected-user-pill').dataset.userId;
            state.selectedCollaborators = state.selectedCollaborators.filter(u => u.id !== userId);
            renderSelectedCollaborators();
        });
    });
    hiddenInput.value = state.selectedCollaborators.length > 0 ? 'filled' : '';
}

async function handleFormSubmit(e) {
    e.preventDefault();
    const btn = $('#saveBtn');
    btn.disabled = true; btn.textContent = tr('form.saving');
    try {
        if (state.selectedCollaborators.length === 0) throw new Error(tr('notifications.no_collaborators'));
        const uploadedMediaData = [];
        for (const { file, type } of state.uploadedMedia) {
            const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${file.name.split('.').pop()}`;
            const filePath = `${authState.profile.id}/${fileName}`;
            const { error } = await supabase.storage.from('map_media').upload(filePath, file);
            if (error) throw new Error(`${tr('notifications.upload_error')}: ${error.message}`);
            const { data: { publicUrl } } = supabase.storage.from('map_media').getPublicUrl(filePath);
            uploadedMediaData.push({ url: publicUrl, type });
        }
        for (const deleted of state.deletedMedia) {
            const mediaPath = deleted.url.split('/map_media/')[1];
            if (mediaPath) await supabase.storage.from('map_media').remove([mediaPath]);
        }
        const allMedia = [...state.existingMedia, ...uploadedMediaData];
        const pointData = {
            name: $('#name').value,
            project_name: $('#project_name').value,
            latitude: parseFloat($('#latitude').value),
            longitude: parseFloat($('#longitude').value),
            start_year: parseInt($('#start_year').value, 10),
            area: $('#area').value,
            associated_crops: $('#associated_crops').value,
            av_system_type: $('#av_system_type').value,
            media_url: allMedia,
            affiliation: $('#affiliation').value || null,
            link: $('#link').value || null,
            description: $('#description').value || null,
            leadership: $('#leadership').value || null,
            facilities: $('#facilities').value || null,
            equipment: $('#equipment').value || null,
            capabilities: $('#capabilities').value || null,
            experiments: $('#experiments').value || null,
            created_by: authState.profile.id,
            generating_capacity_kw: parseFloat($('#generating_capacity_kw').value) || null,
            keywords: $('#keywords').value.split(',').map(k => k.trim()).filter(Boolean) || [],
        };
        const { data: savedPoint, error } = $('#pointId').value
            ? await supabase.from('map_points').update(pointData).eq('id', $('#pointId').value).select().single()
            : await supabase.from('map_points').insert(pointData).select().single();
        if (error) throw error;
        const pointId = savedPoint.id;
        const { error: deleteError } = await supabase.from('project_collaborators').delete().eq('project_id', pointId);
        if (deleteError) throw deleteError;
        const collaboratorRows = state.selectedCollaborators.map(user => ({ project_id: pointId, user_id: user.id }));
        if (collaboratorRows.length > 0) {
            const { error: insertError } = await supabase.from('project_collaborators').insert(collaboratorRows);
            if (insertError) throw insertError;
        }
        setFlash(tr('notifications.save_success'));
        closeEditPanel();
        await loadMapPoints();
    } catch (error) {
        setFlash(error.message || tr('notifications.save_error'), true);
        console.error('Form submit error:', error);
    } finally {
        btn.disabled = false; btn.textContent = tr('form.save');
    }
}

async function handleDeletePoint(pointId) {
    if (!confirm(tr('map.deleteConfirm'))) return;
    try {
        const pointToDelete = state.mapPoints.find(p => p.id === pointId);
        if (!pointToDelete) throw new Error("Point not found");
        const { error: dbError } = await supabase.from('map_points').delete().eq('id', pointId);
        if (dbError) throw dbError;
        let media = [];
        try { media = pointToDelete.media_url || []; } catch { media = []; }
        const mediaPaths = media.map(m => m.url.split('/map_media/')[1]).filter(Boolean);
        if (mediaPaths.length > 0) await supabase.storage.from('map_media').remove(mediaPaths);
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
    const sortedPoints = [...state.mapPoints].sort((a, b) => {
        let valA = a[state.sort.key], valB = b[state.sort.key];
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();
        if (valA === null || valA === undefined) valA = state.sort.order === 'asc' ? Infinity : -Infinity;
        if (valB === null || valB === undefined) valB = state.sort.order === 'asc' ? Infinity : -Infinity;
        if (valA < valB) return state.sort.order === 'asc' ? -1 : 1;
        if (valA > valB) return state.sort.order === 'asc' ? 1 : -1;
        return 0;
    });
    tbody.innerHTML = sortedPoints.map(p => `<tr data-point-id="${p.id}"><td>${escapeHtml(p.project_name)}</td><td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.start_year)}</td><td>${p.generating_capacity_kw || 'N/A'}</td><td>${escapeHtml(p.area)}</td></tr>`).join('');
}

function handleTableSort(e) {
    const header = e.target.closest('th');
    if (!header || !header.dataset.sort) return;
    const key = header.dataset.sort;
    if (state.sort.key === key) {
        state.sort.order = state.sort.order === 'asc' ? 'desc' : 'asc';
    } else {
        state.sort.key = key;
        state.sort.order = 'asc';
    }
    $$('#projects-table th').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
        th.querySelector('.sort-icon').outerHTML = `<i class="sort-icon" data-lucide="chevrons-up-down"></i>`;
    });
    header.classList.add(state.sort.order === 'asc' ? 'sort-asc' : 'sort-desc');
    header.querySelector('.sort-icon').outerHTML = `<i class="sort-icon" data-lucide="${state.sort.order === 'asc' ? 'chevron-up' : 'chevron-down'}"></i>`;
    lucide.createIcons();
    renderTable();
}

function highlightTableRow(pointId, shouldHighlight) {
    $$('#projects-table tbody tr').forEach(row => row.classList.remove('selected'));
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
        const point = state.mapPoints.find(p => p.id === pointId);
        if (point) openViewPanel(point);
    });
    $('#closeViewPanelBtn').addEventListener('click', closeViewPanel);
}

export function initMap() {
    map = L.map('map', { zoomControl: false }).setView([39.8283, -98.5795], 4);
    window.map = map;
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);
    markersLayer = L.layerGroup().addTo(map);
    wireMapUI();
    map.on('click', closeViewPanel);
    loadAllUsers().then(() => loadMapPoints());
    checkAccess();
    supabase.auth.onAuthStateChange((_event, session) => {
        authState.session = session;
        supabase.from("profiles").select("id, full_name, role, avatar_url, preferred_language").eq("id", session?.user.id).single().then(({data}) => {
            authState.profile = data;
            checkAccess();
        });
    });
}