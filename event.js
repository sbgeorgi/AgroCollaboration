import { openProfileModal } from './clickprofile.js';
import { formatRichText } from './rich-text.js';

// ============================================
// STORAGE BUCKET CONSTANT - SINGLE SOURCE OF TRUTH
// matches the bucket name in your Supabase dashboard screenshot
// ============================================
const STORAGE_BUCKET = 'event_files';

export function initEventLogic(deps) {
  const {
    supabase,
    authState,
    tr,
    state,
    $,
    $$,
    setFlash,
    fmtDateTime,
    escapeHtml,
    linkify,
    bytesToSize,
    showView,
    getAvatarUrl,
    applyI18n,
    show,
    hide,
    refreshEventsList
  } = deps;

  // --- STATE & CHANNELS ---
  let currentCommentsChannel = null;
  let currentThreadsChannel = null;
  let currentFilesChannel = null;
  let currentLikesChannel = null;

  // Quill Instances for the Edit Modal
  let quillEnInstance = null;
  let quillEsInstance = null;

  // Cache
  const profileCache = new Map();
  let availableProfiles = []; 

  // --- UTILITIES ---
  function isOrganizerOrAdmin() {
    return ['admin', 'organizer'].includes(authState.profile?.role);
  }

  function nearBottom(threshold = 180) {
    return (window.innerHeight + window.scrollY) >= (document.body.scrollHeight - threshold);
  }

  function scrollToLatest(smooth = true) {
    const anchor = $('#commentsBottomAnchor');
    if (anchor) anchor.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'end' });
  }

  function formatName(profile) {
    return profile?.full_name || profile?.username || 'Anonymous';
  }

  function initialLetter(name) {
    return (name || 'U').charAt(0).toUpperCase();
  }

  async function ensureProfileInCache(profileId) {
    if (!profileId) return null;
    if (profileCache.has(profileId)) return profileCache.get(profileId);

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', profileId)
      .single();

    if (error) return null;
    const public_avatar_url = data?.avatar_url ? await getAvatarUrl(data.avatar_url) : null;
    const enriched = { ...data, public_avatar_url };
    profileCache.set(profileId, enriched);
    return enriched;
  }

  function timeMeta(created_at, updated_at) {
    const created = fmtDateTime(created_at);
    const updated = updated_at && updated_at !== created_at ? ` · edited ${fmtDateTime(updated_at)}` : '';
    return `${created}${updated || ''}`;
  }

  function lucideRefresh() {
    if (window.lucide) lucide.createIcons();
  }

  const toLocalInputValue = (d) => {
    if (!d) return "";
    d = new Date(d);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  // --- ADMIN EDITING LOGIC ---

  async function fetchProfilesForEdit() {
    if (availableProfiles.length > 0) return;
    const { data } = await supabase.from('profiles').select('id, full_name, affiliation').order('full_name');
    availableProfiles = data || [];

    // Populate Datalist
    const dl = document.getElementById('js-dl-profiles');
    const dlAff = document.getElementById('js-dl-affiliations');
    if (dl && availableProfiles.length) {
      dl.innerHTML = availableProfiles.map(p => `<option value="${escapeHtml(p.full_name)}">`).join('');
      const uniqueAffiliations = [...new Set(availableProfiles.map(p => p.affiliation).filter(Boolean))].sort();
      if (dlAff) {
        dlAff.innerHTML = uniqueAffiliations.map(aff => `<option value="${escapeHtml(aff)}">`).join('');
      }
    }
  }

  function initQuillEditor(selector) {
    if (!window.Quill) return null;

    const toolbarOptions = [
      ['bold', 'italic', 'underline'],
      [{ 'color': [] }, { 'background': [] }],
      [{ 'list': 'ordered' }, { 'list': 'bullet' }],
      ['link', 'clean']
    ];

    return new Quill(selector, {
      theme: 'snow',
      modules: { toolbar: toolbarOptions }
    });
  }

  function setupSpeakerAutofill(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.addEventListener('input', (e) => {
      if (e.target.matches('.js-sp-profile-search')) {
        const searchVal = e.target.value;
        const row = e.target.closest('.js-speaker-row');
        const idInput = row.querySelector('.js-sp-profile-id');
        const nameInput = row.querySelector('.js-sp-name');
        const affiliationInput = row.querySelector('.js-sp-aff');

        const profile = availableProfiles.find(p => p.full_name === searchVal);

        if (profile) {
          idInput.value = profile.id;
          nameInput.value = profile.full_name;
          if (profile.affiliation) {
            affiliationInput.value = profile.affiliation;
          }
        } else {
          idInput.value = '';
        }
      }
    });
  }

  function injectEditModal() {
    if (document.getElementById('event-js-editor-modal')) return;

    const modalHtml = `
      <dialog id="event-js-editor-modal" class="rounded-2xl p-0 bg-white shadow-2xl max-w-2xl w-full m-auto backdrop:bg-slate-900/50">
        <style>
            .input-field {
                width: 100%; padding: 0.625rem 1rem; background-color: #f8fafc; 
                border: 1px solid transparent; border-radius: 0.75rem; 
                transition: all 0.2s; font-size: 0.875rem; color: #1e293b; 
                box-shadow: inset 0 1px 2px 0 rgb(0 0 0 / 0.05);
            }
            .input-field:focus { outline: none; box-shadow: 0 0 0 2px var(--color-brand-light); border-color: var(--color-brand); background-color: #ffffff; }
            .input-field:hover { background-color: #ffffff; box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05); }
            .label-text { display: block; font-size: 0.75rem; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.375rem; }
            .editor-wrapper { width: 100%; background-color: #f8fafc; border: 1px solid transparent; border-radius: 0.75rem; transition: all 0.2s; box-shadow: inset 0 1px 2px 0 rgb(0 0 0 / 0.05); overflow: hidden; }
            .editor-wrapper:hover { background-color: #ffffff; box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05); }
            .editor-wrapper:focus-within { box-shadow: 0 0 0 2px var(--color-brand-light); border-color: var(--color-brand); background-color: #ffffff; }
            .ql-toolbar.ql-snow { border: none !important; border-bottom: 1px solid rgba(0,0,0,0.05) !important; background: rgba(255,255,255,0.5); padding: 6px 8px !important; }
            .ql-container.ql-snow { border: none !important; font-family: 'Inter', sans-serif !important; font-size: 0.875rem !important; }
            .ql-editor { min-height: 100px; padding: 12px 16px !important; color: #1e293b; }
            .ql-snow .ql-stroke { stroke: #64748b !important; }
            .ql-snow .ql-fill { fill: #64748b !important; }
            .ql-snow .ql-picker { color: #64748b !important; }
        </style>

        <div class="flex flex-col h-full max-h-[90vh]">
            <div class="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <h2 class="font-display font-bold text-xl text-slate-800">Edit Event</h2>
                <button id="close-js-editor" class="p-2 hover:bg-gray-200 rounded-full transition-colors text-slate-500"><i data-lucide="x" class="w-5 h-5"></i></button>
            </div>
            
            <div class="flex-1 overflow-y-auto custom-scrollbar p-6">
                <form id="jsEventEditForm" class="space-y-5">
                    <input type="hidden" id="jsEditEventId">
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div><label class="label-text">Title (EN)</label><input id="jsEditTitleEn" class="input-field" required /></div>
                        <div><label class="label-text">Title (ES)</label><input id="jsEditTitleEs" class="input-field" /></div>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div><label class="label-text">Start</label><input id="jsEditStartTime" type="datetime-local" class="input-field" required /></div>
                        <div><label class="label-text">End</label><input id="jsEditEndTime" type="datetime-local" class="input-field" /></div>
                    </div>

                    <div><label class="label-text">Description (EN)</label><div class="editor-wrapper"><div id="jsEditDescEn"></div></div></div>
                    <div><label class="label-text">Description (ES)</label><div class="editor-wrapper"><div id="jsEditDescEs"></div></div></div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="label-text">Language</label>
                            <select id="jsEditEventLang" class="input-field cursor-pointer">
                                <option value="bi">Bilingual</option><option value="en">English</option><option value="es">Español</option>
                            </select>
                        </div>
                        <div><label class="label-text">Host</label><input id="jsEditHostOrg" class="input-field" /></div>
                    </div>

                    <div><label class="label-text">Zoom URL</label><input id="jsEditZoomUrl" type="url" class="input-field" /></div>
                    <div><label class="label-text">Recording URL</label><input id="jsEditRecordingUrl" type="url" class="input-field" /></div>
                    <div><label class="label-text">Tags</label><input id="jsEditTags" class="input-field" /></div>

                    <div class="bg-gray-50 border border-gray-200 rounded-xl p-4">
                        <div class="flex justify-between items-center mb-3">
                            <label class="label-text mb-0">Speakers</label>
                            <button type="button" id="jsAddSpeakerBtn" class="text-xs font-bold text-brand-600 hover:text-brand-700 hover:bg-brand-50 px-2 py-1 rounded transition-colors">+ Add</button>
                        </div>
                        <div id="jsEditSpeakersContainer" class="space-y-3"></div>
                    </div>
                </form>
            </div>
            
            <div class="p-5 border-t border-gray-100 bg-gray-50 flex justify-end items-center gap-3">
                <button type="button" id="jsCancelEdit" class="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-xl font-bold text-sm transition-colors">Cancel</button>
                <button type="submit" form="jsEventEditForm" class="px-6 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold text-sm shadow-sm transition-colors">Save Changes</button>
            </div>
        </div>
      </dialog>
      <datalist id="js-dl-profiles"></datalist><datalist id="js-dl-affiliations"></datalist>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    quillEnInstance = initQuillEditor('#jsEditDescEn');
    quillEsInstance = initQuillEditor('#jsEditDescEs');

    document.getElementById('close-js-editor').onclick = () => document.getElementById('event-js-editor-modal').close();
    document.getElementById('jsCancelEdit').onclick = () => document.getElementById('event-js-editor-modal').close();
    document.getElementById('jsAddSpeakerBtn').onclick = () => addJsSpeakerRow();
    document.getElementById('jsEventEditForm').onsubmit = handleJsEditSubmit;

    document.getElementById('jsEditSpeakersContainer').addEventListener('click', (e) => {
      if (e.target.closest('.js-remove-speaker')) { e.target.closest('.js-speaker-row').remove(); }
    });

    setupSpeakerAutofill('jsEditSpeakersContainer');
    lucideRefresh();
  }

  function addJsSpeakerRow(speaker = {}) {
    const container = document.getElementById('jsEditSpeakersContainer');
    const row = document.createElement('div');
    row.className = 'js-speaker-row flex flex-col gap-2 p-3 bg-white border border-gray-200 rounded-lg shadow-sm mb-3 transition-all hover:shadow-md';

    let profileNameVal = "";
    if (speaker.profile_id && availableProfiles.length) {
      const matched = availableProfiles.find(p => p.id === speaker.profile_id);
      if (matched) profileNameVal = matched.full_name;
    }

    row.innerHTML = `
        <div class="w-full space-y-2">
            <input type="text" class="js-sp-name input-field" placeholder="Name*" value="${escapeHtml(speaker.name || '')}" required>
            <input type="text" class="js-sp-aff input-field" placeholder="Affiliation" list="js-dl-affiliations" value="${escapeHtml(speaker.affiliation || '')}">
            <div class="relative">
                <input type="text" class="js-sp-profile-search input-field" placeholder="Link Profile (Search)" list="js-dl-profiles" autocomplete="off" value="${escapeHtml(profileNameVal)}">
                <input type="hidden" class="js-sp-profile-id" value="${speaker.profile_id || ''}">
            </div>
        </div>
        <div class="flex items-center justify-between pt-2 border-t border-gray-100">
            <label class="flex items-center gap-2 text-xs text-slate-600 font-medium cursor-pointer select-none hover:text-brand-600 transition-colors">
                <input type="checkbox" class="js-sp-primary rounded border-gray-300 text-brand-600 focus:ring-brand-500" ${speaker.primary_speaker ? 'checked' : ''}>
                <span>Primary</span>
            </label>
            <button type="button" class="js-remove-speaker text-slate-400 hover:text-red-500 p-1.5 rounded-full hover:bg-red-50 transition-all"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
        </div>
    `;
    container.appendChild(row);
    lucideRefresh();
  }

  const getQuillContent = (quill) => {
    if (!quill) return null;
    if (quill.getText().trim().length === 0 && quill.root.innerHTML === '<p><br></p>') return null;
    return quill.root.innerHTML;
  };

  async function openEditModal(section) {
    if (!state.selectedEvent) return;
    const ev = state.selectedEvent;

    injectEditModal();
    await fetchProfilesForEdit(); 

    document.getElementById('jsEditEventId').value = ev.id;
    document.getElementById('jsEditTitleEn').value = ev.title_en || '';
    document.getElementById('jsEditTitleEs').value = ev.title_es || '';
    document.getElementById('jsEditStartTime').value = toLocalInputValue(ev.start_time);
    document.getElementById('jsEditEndTime').value = toLocalInputValue(ev.end_time);

    if (quillEnInstance) quillEnInstance.root.innerHTML = ev.description_en || '';
    if (quillEsInstance) quillEsInstance.root.innerHTML = ev.description_es || '';

    document.getElementById('jsEditEventLang').value = ev.language || 'bi';
    document.getElementById('jsEditHostOrg').value = ev.host_org || '';
    document.getElementById('jsEditZoomUrl').value = ev.zoom_url || '';
    document.getElementById('jsEditRecordingUrl').value = ev.recording_url || '';
    document.getElementById('jsEditTags').value = (ev.topic_tags || []).join(', ');

    const container = document.getElementById('jsEditSpeakersContainer');
    container.innerHTML = '';
    const { data: speakers } = await supabase.from('event_speakers').select('*').eq('event_id', ev.id);
    if (speakers && speakers.length) {
      speakers.forEach(s => addJsSpeakerRow(s));
    } else {
      addJsSpeakerRow();
    }

    const modal = document.getElementById('event-js-editor-modal');
    modal.showModal();
    modal.querySelector('div').scrollTop = 0;
  }

  async function handleJsEditSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('jsEditEventId').value;

    const payload = {
      title_en: document.getElementById('jsEditTitleEn').value.trim(),
      title_es: document.getElementById('jsEditTitleEs').value.trim() || null,
      description_en: getQuillContent(quillEnInstance),
      description_es: getQuillContent(quillEsInstance),
      start_time: new Date(document.getElementById('jsEditStartTime').value).toISOString(),
      end_time: document.getElementById('jsEditEndTime').value ? new Date(document.getElementById('jsEditEndTime').value).toISOString() : null,
      language: document.getElementById('jsEditEventLang').value,
      host_org: document.getElementById('jsEditHostOrg').value.trim() || null,
      zoom_url: document.getElementById('jsEditZoomUrl').value.trim() || null,
      recording_url: document.getElementById('jsEditRecordingUrl').value.trim() || null,
      topic_tags: document.getElementById('jsEditTags').value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    };

    const speakerRows = document.querySelectorAll('.js-speaker-row');
    const speakers = Array.from(speakerRows).map(row => ({
      event_id: id,
      name: row.querySelector('.js-sp-name').value.trim(),
      affiliation: row.querySelector('.js-sp-aff').value.trim() || null,
      profile_id: row.querySelector('.js-sp-profile-id').value || null,
      primary_speaker: row.querySelector('.js-sp-primary').checked
    })).filter(s => s.name);

    const { error } = await supabase.from('events').update(payload).eq('id', id);
    if (error) { setFlash("Error updating event", 3000); return; }

    await supabase.from('event_speakers').delete().eq('event_id', id);
    if (speakers.length > 0) {
      await supabase.from('event_speakers').insert(speakers);
    }

    setFlash("Event updated successfully!");
    document.getElementById('event-js-editor-modal').close();

    const { data: newEv } = await supabase.from('events').select('*, event_speakers(*, profile:profiles(*))').eq('id', id).single();
    if (newEv) {
      state.selectedEvent = newEv;
      const idx = state.events.findIndex(e => e.id === id);
      if (idx !== -1) state.events[idx] = newEv;
      reRender();
    }
    if (refreshEventsList) refreshEventsList();
  }

  // ============================================
  // FILES LOGIC - CORRECTED TO USE 'event_files'
  // ============================================
  
  async function loadAndRenderFiles() {
    if (!state.selectedEvent) return;
    
    // Fetch attachment metadata from DB (table name is 'attachments', correct)
    const { data, error } = await supabase
      .from('attachments')
      .select('id, event_id, thread_id, comment_id, bucket_id, object_path, file_name, file_type, file_size, created_by, created_at, creator:profiles!attachments_created_by_fkey(id, full_name)')
      .eq('event_id', state.selectedEvent.id)
      .order('created_at', { ascending: false });

    if (error) { console.error("Error fetching files:", error); return; }
    state.files = data || [];
    renderFiles();
  }

  function renderFiles() {
    const listEl = $('#filesList');
    const emptyEl = $('#emptyFiles');
    if (!listEl || !emptyEl) return;

    if (!state.files || state.files.length === 0) {
      hide(listEl); show(emptyEl); return;
    }
    show(listEl); hide(emptyEl);

    listEl.innerHTML = state.files.map(file => {
      // FORCE retrieval from correct bucket unless strictly defined otherwise in DB
      // Defaults to 'event_files' if bucket_id is missing or null
      const bucketName = file.bucket_id || STORAGE_BUCKET;
      
      const { data: urlData } = supabase.storage.from(bucketName).getPublicUrl(file.object_path);
      const isUploader = authState.profile?.id === file.created_by;
      const isAdmin = isOrganizerOrAdmin();
      return `
        <div class="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-xl animate-fade-in" data-file-id="${file.id}">
          <div class="flex items-center gap-4 min-w-0">
            <div class="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center text-slate-500 border border-slate-200">
              <i data-lucide="file-text" class="w-5 h-5"></i>
            </div>
            <div class="min-w-0">
              <p class="font-semibold text-sm text-slate-800 truncate">${escapeHtml(file.file_name)}</p>
              <p class="text-xs text-slate-400">${bytesToSize(file.file_size)} • Uploaded by ${escapeHtml(file.creator?.full_name || 'Anonymous')}</p>
            </div>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0">
            ${(isUploader || isAdmin) ? `<button class="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" data-delete-file="${file.id}" data-file-path="${file.object_path}" data-bucket="${bucketName}"><i data-lucide="trash-2" class="w-4 h-4"></i></button>` : ''}
            <a href="${urlData.publicUrl}" download="${escapeHtml(file.file_name)}" class="px-3 py-1.5 bg-slate-50 text-xs font-bold text-slate-600 rounded-lg border border-slate-200 hover:bg-white transition-colors">Download</a>
          </div>
        </div>`;
    }).join('');
    lucideRefresh();
  }

  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file || !state.selectedEvent || !authState.session) return;

    if (file.size > 10 * 1024 * 1024) {
      setFlash('File is too large (max 10MB).', 4000);
      e.target.value = '';
      return;
    }

    // Generate unique path
    const filePath = `${state.selectedEvent.id}/${crypto.randomUUID()}-${file.name}`;
    setFlash('Uploading...', -1);

    try {
      console.log(`📤 Uploading to bucket: ${STORAGE_BUCKET}, path: ${filePath}`);

      // 1. UPLOAD TO 'event_files' BUCKET
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET) 
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        console.error('❌ Storage upload error:', uploadError);
        setFlash(`Upload failed: ${uploadError.message}`, 5000);
        e.target.value = '';
        return;
      }

      const finalPath = uploadData?.path || filePath;

      // 2. INSERT INTO DATABASE with correct bucket_id
      const { error: insertError } = await supabase.from('attachments').insert({
        event_id: state.selectedEvent.id,
        created_by: authState.session.user.id,
        bucket_id: STORAGE_BUCKET, // <--- Explicitly saves 'event_files' to DB
        object_path: finalPath,
        file_name: file.name,
        file_size: file.size,
        file_type: file.type
      });

      if (insertError) {
        console.error('❌ Database insert error:', insertError);
        // Cleanup orphaned file
        await supabase.storage.from(STORAGE_BUCKET).remove([finalPath]);
        setFlash('Database error - upload rolled back', 4000);
      } else {
        console.log('✅ Upload complete!');
        setFlash('Upload complete!', 3000);
        await loadAndRenderFiles();
      }

    } catch (err) {
      console.error('❌ Unexpected error:', err);
      setFlash('Unexpected upload error', 4000);
    }

    e.target.value = '';
  }

  async function deleteFile(fileId, filePath, btn) {
    if (!confirm('Delete this file?')) return;
    
    // Use data attribute from renderFiles or fallback to constant
    const bucketName = btn.dataset.bucket || STORAGE_BUCKET;

    const originalContent = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin"></i>`;
    lucideRefresh();

    const { error: storageError } = await supabase.storage.from(bucketName).remove([filePath]);
    if (storageError) {
      console.error('❌ Storage delete error:', storageError);
      setFlash('Delete failed', 4000);
      btn.disabled = false;
      btn.innerHTML = originalContent;
      lucideRefresh();
      return;
    }

    const { error: dbError } = await supabase.from('attachments').delete().eq('id', fileId);

    if (dbError) {
      console.error('❌ Database delete error:', dbError);
      setFlash('Database error', 4000);
      btn.disabled = false;
      btn.innerHTML = originalContent;
      lucideRefresh();
      return;
    }

    if (state.files) {
      state.files = state.files.filter(f => f.id !== fileId);
      renderFiles();
      setFlash('File deleted', 3000);
    }
  }

  // --- THREADS LOGIC ---

  async function loadAndRenderThreads() {
    if (!state.selectedEvent) return;
    const { data, error } = await supabase
      .from('threads')
      .select('id, event_id, title, created_by, created_at, updated_at, pinned, created_by_profile:profiles!threads_created_by_fkey(id, full_name, avatar_url)')
      .eq('event_id', state.selectedEvent.id)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) { console.error("Error fetching threads:", error); return; }

    const enriched = await Promise.all((data || []).map(async (t) => {
      if (t.created_by_profile?.id) {
        const cached = await ensureProfileInCache(t.created_by_profile.id);
        if (cached) {
          return { ...t, created_by_profile: { ...t.created_by_profile, public_avatar_url: cached.public_avatar_url, full_name: cached.full_name } };
        }
      }
      return t;
    }));

    state.threads = enriched || [];
    renderThreads();
  }

  function canManageThread(thread) {
    if (!authState.profile) return false;
    return thread.created_by === authState.profile.id || isOrganizerOrAdmin();
  }

  function renderThreads() {
    const listEl = $('#threadsList');
    if (!listEl) return;
    if (!state.threads || state.threads.length === 0) {
      listEl.innerHTML = `<div class="p-4 text-center text-xs text-slate-400">No topics yet.</div>`;
      return;
    }

    listEl.innerHTML = state.threads.map(thread => {
      const isActive = String(thread.id) === String(state.selectedThreadId);
      const canManage = canManageThread(thread);

      const actionsMenu = canManage ? `
        <div class="relative thread-actions-menu group/menu">
          <button class="p-1 text-slate-400 hover:text-slate-600 rounded opacity-0 group-hover:opacity-100 transition-opacity" data-thread-menu="${thread.id}">
            <i data-lucide="more-horizontal" class="w-4 h-4"></i>
          </button>
          <div class="hidden absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-50 w-32" data-thread-dropdown="${thread.id}">
            <button class="w-full text-left px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2" data-edit-thread="${thread.id}">Edit</button>
            <button class="w-full text-left px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2" data-toggle-pin-thread="${thread.id}">${thread.pinned ? 'Unpin' : 'Pin'}</button>
            <button class="w-full text-left px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 flex items-center gap-2" data-delete-thread="${thread.id}">Delete</button>
          </div>
        </div>
      ` : '';

      return `
        <div class="group flex items-center justify-between gap-2 p-2 rounded-lg cursor-pointer transition-colors ${isActive ? 'bg-brand-50 ring-1 ring-brand-200' : 'hover:bg-slate-100'}" data-thread-row="${thread.id}">
          <div class="flex items-center gap-2 min-w-0 flex-1" data-thread-id="${thread.id}">
            <i data-lucide="${thread.pinned ? 'pin' : 'hash'}" class="w-3.5 h-3.5 shrink-0 ${thread.pinned ? 'text-amber-500 fill-current' : 'text-slate-400'}"></i>
            <span class="truncate text-sm font-medium text-slate-700 ${isActive ? 'text-brand-800' : ''}">${escapeHtml(thread.title)}</span>
          </div>
          ${actionsMenu}
        </div>`;
    }).join('');
    lucideRefresh();
  }

  async function handleNewThread(e) {
    e.preventDefault();
    const input = e.target.querySelector('input');
    const title = input.value.trim();
    if (!title) return;
    const { data, error } = await supabase.from('threads').insert({
      title,
      event_id: state.selectedEvent.id,
      created_by: authState.session.user.id
    }).select().single();
    if (error) setFlash('Failed to create thread');
    else {
      input.value = '';
      hide($('#newThreadForm'));
      show($('#btnToggleThreadForm'));
      await loadAndRenderThreads();
      selectThread(data.id);
    }
  }

  async function handleEditThread(threadId) {
    const thread = state.threads?.find(t => t.id === threadId);
    if (!thread) return;
    const newTitle = prompt('Edit thread title:', thread.title);
    if (!newTitle || newTitle.trim() === '' || newTitle === thread.title) return;
    const { error } = await supabase.from('threads').update({ title: newTitle.trim() }).eq('id', threadId);
    if (error) setFlash('Failed to update thread'); else await loadAndRenderThreads();
  }

  async function handleTogglePinThread(threadId) {
    const thread = state.threads?.find(t => t.id === threadId);
    if (!thread) return;
    const { error } = await supabase.from('threads').update({ pinned: !thread.pinned }).eq('id', threadId);
    if (error) setFlash('Failed to update thread'); else await loadAndRenderThreads();
  }

  async function handleDeleteThread(threadId) {
    if (!confirm('Delete this thread and all its comments?')) return;
    const { error } = await supabase.from('threads').delete().eq('id', threadId);
    if (error) setFlash('Failed to delete thread');
    else {
      if (String(state.selectedThreadId) === String(threadId)) {
        state.selectedThreadId = null;
        hide($('#threadDetailView'));
        show($('#thread-welcome'));
      }
      await loadAndRenderThreads();
    }
  }

  // --- COMMENTS LOGIC ---

  async function loadCommentsForThread(threadId) {
    const { data, error } = await supabase
      .from('comments')
      .select(`id, event_id, thread_id, parent_id, content, created_by, created_at, updated_at, author:profiles!comments_created_by_fkey(id, username, full_name, affiliation, avatar_url)`)
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true });

    if (error) { console.error("Error fetching comments:", error); return; }

    for (const c of (data || [])) {
      if (c.author?.id) {
        const cached = await ensureProfileInCache(c.author.id);
        if (cached) c.author = { ...cached };
      }
    }

    state.comments = data || [];

    const ids = state.comments.map(c => c.id);
    if (ids.length) {
      const { data: likes } = await supabase.from('comment_likes').select('comment_id, profile_id').in('comment_id', ids);
      if (likes) {
        const counts = {};
        const likedByMe = new Set();
        likes.forEach(l => {
          counts[l.comment_id] = (counts[l.comment_id] || 0) + 1;
          if (l.profile_id === authState.profile?.id) likedByMe.add(l.comment_id);
        });
        state.comments = state.comments.map(c => ({ ...c, likes_count: counts[c.id] || 0, liked_by_me: likedByMe.has(c.id) }));
      }
    }
    renderComments();
  }

  function buildCommentsByParent() {
    return (state.comments || []).reduce((acc, c) => {
      const key = c.parent_id || 'root';
      (acc[key] = acc[key] || []).push(c);
      return acc;
    }, {});
  }

  function createCommentHtml(c) {
    const user = c.author;
    const isOwner = authState.profile?.id === user?.id;
    const isAdmin = isOrganizerOrAdmin();
    const name = formatName(user);
    const avatarHtml = user?.public_avatar_url
      ? `<img src="${user.public_avatar_url}" alt="${escapeHtml(name)}" class="w-full h-full object-cover">`
      : `<span class="font-bold text-slate-600 text-xs">${initialLetter(name)}</span>`;

    const likesCount = Number(c.likes_count || 0);

    return `
      <div class="flex items-start gap-3" data-comment-root="${c.id}">
        <button class="flex-shrink-0 w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center overflow-hidden ring-2 ring-white shadow-sm hover:ring-brand-200 transition-all cursor-pointer" data-open-profile="${user?.id || ''}">
          ${avatarHtml}
        </button>
        <div class="flex-1 min-w-0">
          <div class="bg-slate-50 border border-slate-100 rounded-2xl rounded-tl-none p-3 hover:border-slate-200 transition-colors group/card">
            <div class="flex items-center justify-between gap-2 mb-1">
              <div class="flex items-center gap-2 min-w-0">
                <span class="text-sm font-bold text-slate-800 truncate cursor-pointer hover:underline" data-open-profile="${user?.id || ''}">${escapeHtml(name)}</span>
                <span class="comment-meta text-[10px] text-slate-400 whitespace-nowrap">${timeMeta(c.created_at, c.updated_at)}</span>
              </div>
              <div class="flex items-center gap-3 opacity-0 group-hover/card:opacity-100 transition-opacity">
                 <button class="flex items-center gap-1 text-slate-400 hover:text-rose-600 transition-colors ${c.liked_by_me ? 'text-rose-600' : ''}" data-like-comment="${c.id}">
                    <i data-lucide="heart" class="w-3.5 h-3.5 ${c.liked_by_me ? 'fill-current' : ''}"></i>
                    <span class="text-[10px] font-bold" data-like-count>${likesCount > 0 ? likesCount : ''}</span>
                 </button>
              </div>
            </div>
            
            <div class="comment-content text-sm text-slate-700 leading-relaxed prose prose-sm max-w-none prose-p:my-0 prose-a:text-brand-600">${linkify(c.content)}</div>
            
            <form class="comment-edit-form hidden mt-2" data-edit-form-for="${c.id}">
              <textarea class="w-full bg-white border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none resize-y" rows="2">${escapeHtml(c.content)}</textarea>
              <div class="flex justify-end gap-2 mt-2">
                <button type="button" class="text-xs font-bold text-slate-500 px-3 py-1 rounded hover:bg-slate-200" data-cancel-edit>Cancel</button>
                <button type="submit" class="text-xs font-bold text-white bg-brand-600 px-3 py-1 rounded hover:bg-brand-700">Save</button>
              </div>
            </form>
          </div>
          
          <div class="flex items-center gap-3 mt-1 pl-2">
            <button class="text-[11px] font-bold text-slate-500 hover:text-brand-600 transition-colors" data-reply-to="${c.id}" data-reply-name="${escapeHtml(name)}">Reply</button>
            ${isOwner ? `<button class="text-[11px] font-bold text-slate-400 hover:text-slate-600 transition-colors" data-edit-comment="${c.id}">Edit</button>` : ''}
            ${(isOwner || isAdmin) ? `<button class="text-[11px] font-bold text-slate-400 hover:text-red-600 transition-colors" data-delete-comment="${c.id}">Delete</button>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  function renderComments() {
    const listEl = $('#commentsList');
    if (!listEl) return;
    if (!state.comments || state.comments.length === 0) {
      listEl.innerHTML = `<div class="flex flex-col items-center justify-center h-full py-10 text-slate-400">
        <i data-lucide="message-circle" class="w-10 h-10 mb-2 opacity-20"></i>
        <p class="text-xs font-medium">No comments yet.</p>
        <p class="text-[10px]">Start the conversation!</p>
      </div><div id="commentsBottomAnchor"></div>`;
      lucideRefresh();
      return;
    }

    const byParent = buildCommentsByParent();
    const buildTree = (parentId) => {
      const arr = byParent[parentId] || [];
      return arr.map(c => {
        const children = buildTree(c.id);
        return `<div class="mb-4">${createCommentHtml(c)}${children.length ? `<div class="ml-8 mt-3 pl-3 border-l-2 border-slate-100 space-y-4">${children.join('')}</div>` : ''}</div>`;
      });
    };

    listEl.innerHTML = `<div class="pb-2">${buildTree('root').join('')}</div><div id="commentsBottomAnchor"></div>`;
    lucideRefresh();
  }

  async function handleNewComment(e) {
    e.preventDefault();
    const form = e.target;
    const input = form.querySelector('input, textarea');
    const content = input.value.trim();
    const parentId = form.dataset.parentId || null;
    if (!content) return;

    const { error } = await supabase.from('comments').insert({
      content,
      thread_id: state.selectedThreadId,
      created_by: authState.session.user.id,
      event_id: state.selectedEvent.id,
      parent_id: parentId
    });

    if (error) setFlash('Failed to post comment');
    else {
      input.value = '';
      clearReplyState(form);
      loadCommentsForThread(state.selectedThreadId);
      setTimeout(() => scrollToLatest(true), 100);
    }
  }

  function clearReplyState(form) {
    delete form.dataset.parentId;
    const indicator = form.querySelector('.reply-indicator');
    if (indicator) indicator.remove();
  }

  function subscribeToLikes() {
    if (currentLikesChannel) { supabase.removeChannel(currentLikesChannel); currentLikesChannel = null; }
    currentLikesChannel = supabase.channel(`likes`).on('postgres_changes', { event: '*', schema: 'public', table: 'comment_likes' }, () => {
      if (state.selectedThreadId) loadCommentsForThread(state.selectedThreadId);
    }).subscribe();
  }

  // --- REVAMPED HEADER & LAYOUT LOGIC ---
  function renderEventHeader() {
    const ev = state.selectedEvent;
    if (!ev) return;
    const title = state.language === "es" && ev.title_es ? ev.title_es : ev.title_en;
    const container = $('#compactEventHeaderContainer');

    const editBtn = isOrganizerOrAdmin()
      ? `<button class="h-9 w-9 rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-brand-600 hover:bg-brand-50 hover:border-brand-200 transition-all flex items-center justify-center ml-2" data-edit-event-section="main" title="Edit Event Details"><i data-lucide="pencil" class="w-4 h-4"></i></button>`
      : '';

    container.innerHTML = `
      <div class="flex items-start justify-between gap-4">
        <div class="flex items-start gap-3 overflow-hidden">
             <button id="back-to-schedule" class="mt-1 p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 rounded-full transition-colors shrink-0">
                <i data-lucide="arrow-left" class="w-5 h-5"></i>
             </button>
             <div class="min-w-0 py-1">
                <div class="flex items-center gap-2 text-brand-600 text-xs font-bold uppercase tracking-wider mb-1">
                    <i data-lucide="calendar" class="w-3.5 h-3.5"></i>
                    ${fmtDateTime(ev.start_time, { weekday: 'short', month: 'short', day: 'numeric' })} <span class="text-slate-300">•</span> ${fmtDateTime(ev.start_time, { hour: 'numeric', minute: '2-digit' })}
                </div>
                <h2 class="font-display font-bold text-xl md:text-2xl text-slate-900 leading-tight truncate" title="${escapeHtml(title)}">${escapeHtml(title)}</h2>
             </div>
        </div>
        
        <div class="flex items-center gap-2 shrink-0 pt-1">
             <button id="followBtn" class="h-9 px-4 rounded-lg border text-xs font-bold transition-all flex items-center gap-2"><i data-lucide="star" class="w-3.5 h-3.5"></i> <span>Follow</span></button>
             <select id="rsvpSelect" class="h-9 pl-3 pr-8 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-gray-50 transition-colors cursor-pointer outline-none focus:border-brand-500">
                <option value="not_going">Not Going</option><option value="interested">Interested</option><option value="going">Going</option>
             </select>
             ${editBtn}
        </div>
      </div>
    `;

    setTimeout(() => {
      $('#back-to-schedule').onclick = () => showView('schedule');
      $('#followBtn').onclick = (e) => { e.preventDefault(); toggleFollow(ev.id); };
      $('#rsvpSelect').onchange = (e) => updateRSVP(ev.id, e.target.value);
      loadRSVPFollow(ev.id);
    }, 0);
    lucideRefresh();
  }

  function updateFollowButtonUI(isFollowing) {
    const btn = $('#followBtn');
    if (!btn) return;
    if (isFollowing) {
      btn.className = 'h-9 px-4 rounded-lg border border-amber-200 bg-amber-50 text-amber-700 text-xs font-bold transition-all flex items-center gap-2';
      btn.innerHTML = `<i data-lucide="star" class="w-3.5 h-3.5 fill-current"></i> <span>Following</span>`;
    } else {
      btn.className = 'h-9 px-4 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-xs font-bold transition-all flex items-center gap-2';
      btn.innerHTML = `<i data-lucide="star" class="w-3.5 h-3.5"></i> <span>Follow</span>`;
    }
    lucideRefresh();
  }

  async function loadRSVPFollow(eventId) {
    if (!authState.profile) return;
    const { data: f } = await supabase.from('event_follows').select('id').eq('event_id', eventId).eq('profile_id', authState.profile.id).maybeSingle();
    const { data: r } = await supabase.from('event_rsvps').select('status').eq('event_id', eventId).eq('profile_id', authState.profile.id).maybeSingle();
    state.isFollowing = !!f;
    state.rsvpStatus = r?.status || 'not_going';
    if ($('#rsvpSelect')) $('#rsvpSelect').value = state.rsvpStatus;
    updateFollowButtonUI(state.isFollowing);
  }

  async function updateRSVP(id, status) {
    if (!authState.profile) return;
    await supabase.from('event_rsvps').upsert({ event_id: id, profile_id: authState.profile.id, status });
    setFlash('RSVP updated');
  }

  async function toggleFollow(id) {
    if (!authState.profile) return;
    const was = state.isFollowing;
    state.isFollowing = !was;
    updateFollowButtonUI(state.isFollowing);
    if (was) await supabase.from('event_follows').delete().match({ event_id: id, profile_id: authState.profile.id });
    else await supabase.from('event_follows').insert({ event_id: id, profile_id: authState.profile.id });
  }

  async function renderDescriptionTab() {
    const ev = state.selectedEvent;
    if (!ev) return;
    const desc = state.language === "es" && (ev.description_es || ev.description_en) || ev.description_en;
    const holder = $('#tab_description');
    const isPast = new Date(ev.start_time) < new Date();

    let accessCard = '';
    if (!isPast && ev.zoom_url) {
      accessCard = `<a href="${ev.zoom_url}" target="_blank" class="block w-full text-center py-3 bg-[#0077b6] hover:bg-[#023e8a] text-white font-bold rounded-lg transition-colors shadow-sm mb-1"><i data-lucide="video" class="inline w-4 h-4 mr-2"></i>Register/Join via Zoom</a>`;
    } else if (ev.recording_url) {
      accessCard = `<a href="${ev.recording_url}" target="_blank" class="block w-full text-center py-3 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-lg transition-colors shadow-sm mb-1"><i data-lucide="play-circle" class="inline w-4 h-4 mr-2"></i>Watch Recording</a>`;
    } else {
      accessCard = `<div class="w-full py-3 bg-gray-100 text-gray-400 font-bold text-center rounded-lg text-sm cursor-not-allowed">Access Unavailable</div>`;
    }

    const speakers = ev.event_speakers || [];
    const speakerList = await Promise.all(speakers.map(async s => {
      const img = s.profile?.avatar_url ? await getAvatarUrl(s.profile.avatar_url) : null;
      const ava = img ? `<img src="${img}" class="w-full h-full object-cover">` : `<span class="text-brand-600 font-bold">${(s.name || '?')[0]}</span>`;

      const profileId = s.profile?.id;
      const clickAttributes = profileId
        ? `data-open-profile="${profileId}" class="flex items-center gap-3 p-2 -mx-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer group/speaker"`
        : `class="flex items-center gap-3 p-2 -mx-2 opacity-80"`;

      const countryCode = s.profile?.country ? s.profile.country.toLowerCase() : null;
      const flagHtml = countryCode ? `<img src="https://flagcdn.com/w80/${countryCode}.png" class="ml-auto h-8 w-auto rounded-md shadow-sm border border-gray-100 object-cover shrink-0" alt="${countryCode}" title="${countryCode.toUpperCase()}">` : '';

      return `<div ${clickAttributes}>
             <div class="w-10 h-10 rounded-full bg-brand-50 flex items-center justify-center overflow-hidden flex-shrink-0 shadow-sm ring-2 ring-transparent ${profileId ? 'group-hover/speaker:ring-brand-100' : ''} transition-all">${ava}</div>
             <div class="min-w-0 flex-1">
                <div class="text-sm font-bold text-slate-800 truncate ${profileId ? 'group-hover/speaker:text-brand-700' : ''} transition-colors">${escapeHtml(s.name || s.profile?.full_name)}</div>
                ${s.affiliation ? `<div class="text-xs text-slate-500 truncate">${escapeHtml(s.affiliation)}</div>` : ''}
             </div>
             ${flagHtml}
        </div>`;
    }));

    const tags = (ev.topic_tags || []).map(t => `<span class="bg-slate-100 text-slate-600 px-2 py-1 rounded text-[11px] font-bold uppercase">${escapeHtml(t)}</span>`).join('');

    holder.innerHTML = `
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
        <div class="lg:col-span-8">
            <h3 class="flex items-center text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">About this session</h3>
            ${formatRichText(desc || '')}
        </div>
        <div class="lg:col-span-4 space-y-6">
            <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <h4 class="flex items-center text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Access</h4>
                ${accessCard}
            </div>
            <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <h4 class="flex items-center text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Speakers</h4>
                <div class="space-y-2">${speakerList.length ? speakerList.join('') : '<span class="text-sm text-slate-400 italic">TBA</span>'}</div>
            </div>
            <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-sm space-y-4">
                <div><h4 class="flex items-center text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Language</h4><div class="text-sm font-semibold text-slate-800">${ev.language === 'bi' ? 'English & Spanish' : (ev.language === 'es' ? 'Español' : 'English')}</div></div>
                ${ev.host_org ? `<div><h4 class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Hosted By</h4><div class="text-sm font-semibold text-slate-800 flex items-center gap-1.5"><i data-lucide="building-2" class="w-3.5 h-3.5 text-slate-400"></i> ${escapeHtml(ev.host_org)}</div></div>` : ''}
                ${tags ? `<div><h4 class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Tags</h4><div class="flex flex-wrap gap-1.5">${tags}</div></div>` : ''}
            </div>
        </div>
      </div>
    `;
    lucideRefresh();
  }

  function reRender() {
    if (!state.selectedEvent) return;
    renderEventHeader(); renderDescriptionTab(); renderThreads(); renderComments(); renderFiles();
  }

  // --- INITIALIZATION & ROUTING ---
  async function openEvent(eventId) {
    if (!authState.session) {
      const gate = document.getElementById('authGateModal');
      if (gate) { gate.classList.remove('hidden'); if (window.lucide) window.lucide.createIcons(); } 
      else { setFlash(tr('auth.required')); }
      return;
    }

    const event = state.events.find(e => String(e.id) === String(eventId));
    if (!event) return;

    state.selectedEvent = event;
    state.selectedThreadId = null;

    showView('event');
    window.history.pushState({ event: eventId }, '', `?event=${eventId}`);

    renderEventHeader();
    renderDescriptionTab();

    hide($('#threadDetailView')); show($('#thread-welcome'));
    loadAndRenderThreads();
    loadAndRenderFiles();
    subscribeToLikes();

    if (currentThreadsChannel) supabase.removeChannel(currentThreadsChannel);
    currentThreadsChannel = supabase.channel(`threads-${eventId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'threads', filter: `event_id=eq.${eventId}` }, loadAndRenderThreads).subscribe();

    if (currentCommentsChannel) supabase.removeChannel(currentCommentsChannel);
    currentCommentsChannel = supabase.channel(`comments-${eventId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'comments', filter: `event_id=eq.${eventId}` }, () => {
      if (state.selectedThreadId) loadCommentsForThread(state.selectedThreadId);
    }).subscribe();

    if (currentFilesChannel) supabase.removeChannel(currentFilesChannel);
    currentFilesChannel = supabase.channel(`files-${eventId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attachments', filter: `event_id=eq.${eventId}` }, loadAndRenderFiles)
      .subscribe();

    $('.tab-link[data-tab="description"]')?.click();
  }

  async function selectThread(threadId) {
    state.selectedThreadId = threadId;
    renderThreads();
    hide($('#thread-welcome')); show($('#threadDetailView'));
    loadCommentsForThread(threadId);
  }

  // --- GLOBAL EVENT LISTENERS ---
  $('#newThreadForm')?.addEventListener('submit', handleNewThread);
  $('#replyToThreadForm')?.addEventListener('submit', handleNewComment);
  $('#fileInput')?.addEventListener('change', handleFileUpload);

  $('#btnToggleThreadForm')?.addEventListener('click', () => {
    show($('#newThreadForm')); hide($('#btnToggleThreadForm')); $('#threadTitle').focus();
  });
  $('#cancelThreadBtn')?.addEventListener('click', () => {
    hide($('#newThreadForm')); show($('#btnToggleThreadForm')); $('#threadTitle').value = '';
  });

  $('#filesList')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-delete-file]');
    if (!btn) return;
    e.preventDefault();
    await deleteFile(btn.dataset.deleteFile, btn.dataset.filePath, btn);
  });

  document.addEventListener('click', (e) => {
    const editBtn = e.target.closest('[data-edit-event-section]');
    if (editBtn) { e.preventDefault(); e.stopPropagation(); openEditModal(editBtn.dataset.editEventSection); }
  });

  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-open-profile]');
    if (!btn) return;
    e.preventDefault(); e.stopPropagation();

    const profileId = btn.dataset.openProfile;
    if (profileId) {
      const profile = await ensureProfileInCache(profileId);
      if (profile) {
        const displayProfile = { ...profile };
        if (state.selectedEvent) {
          const isSpeaker = state.selectedEvent.event_speakers?.some(s => s.profile_id === profileId);
          if (isSpeaker && state.selectedEvent.topic_tags?.length) {
            const existingTags = displayProfile.fields_of_study ? displayProfile.fields_of_study.split(',').map(s => s.trim()).filter(Boolean) : [];
            const eventTags = state.selectedEvent.topic_tags;
            const combined = new Set(existingTags);
            eventTags.forEach(t => combined.add(t));
            displayProfile.fields_of_study = Array.from(combined).join(', ');
          }
        }
        openProfileModal(displayProfile);
      }
    }
  });

  $('#threadsList')?.addEventListener('click', e => {
    const menuBtn = e.target.closest('[data-thread-menu]');
    if (menuBtn) {
      e.stopPropagation();
      const id = menuBtn.dataset.threadMenu;
      const dd = document.querySelector(`[data-thread-dropdown="${id}"]`);
      $$('.thread-actions-dropdown').forEach(d => d !== dd && d.classList.add('hidden'));
      if (dd) dd.classList.toggle('hidden');
      return;
    }
    const editBtn = e.target.closest('[data-edit-thread]');
    if (editBtn) { e.stopPropagation(); handleEditThread(editBtn.dataset.editThread); document.querySelectorAll('[data-thread-dropdown]').forEach(d => d.classList.add('hidden')); return; }

    const pinBtn = e.target.closest('[data-toggle-pin-thread]');
    if (pinBtn) { e.stopPropagation(); handleTogglePinThread(pinBtn.dataset.togglePinThread); document.querySelectorAll('[data-thread-dropdown]').forEach(d => d.classList.add('hidden')); return; }

    const delBtn = e.target.closest('[data-delete-thread]');
    if (delBtn) { e.stopPropagation(); handleDeleteThread(delBtn.dataset.deleteThread); document.querySelectorAll('[data-thread-dropdown]').forEach(d => d.classList.add('hidden')); return; }

    const row = e.target.closest('[data-thread-id]');
    if (row) {
      document.querySelectorAll('[data-thread-dropdown]').forEach(d => d.classList.add('hidden'));
      selectThread(row.dataset.threadId);
    }
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('.thread-actions-menu')) $$('[data-thread-dropdown]').forEach(d => d.classList.add('hidden'));
  });

  $('#commentsList')?.addEventListener('click', async e => {
    const replyBtn = e.target.closest('[data-reply-to]');
    const editBtn = e.target.closest('[data-edit-comment]');
    const delBtn = e.target.closest('[data-delete-comment]');
    const likeBtn = e.target.closest('[data-like-comment]');
    const cancelBtn = e.target.closest('[data-cancel-edit]');

    if (replyBtn) {
      const parentId = replyBtn.dataset.replyTo;
      const name = replyBtn.dataset.replyName;
      const form = $('#replyToThreadForm');
      form.dataset.parentId = parentId;
      const oldInd = form.querySelector('.reply-indicator'); if (oldInd) oldInd.remove();
      const ind = document.createElement('div');
      ind.className = 'reply-indicator flex justify-between items-center px-3 py-1 text-xs bg-slate-100 text-slate-500 border-b border-slate-200';
      ind.innerHTML = `<span>Replying to <b>${name}</b></span><button type="button">&times;</button>`;
      form.insertBefore(ind, form.firstChild);
      ind.querySelector('button').onclick = () => { delete form.dataset.parentId; ind.remove(); };
      form.querySelector('input').focus();
      return;
    }

    if (likeBtn) {
      const id = likeBtn.dataset.likeComment;
      if (!authState.profile) return;
      const c = state.comments.find(c => c.id === id);
      if (c && c.liked_by_me) await supabase.from('comment_likes').delete().match({ comment_id: id, profile_id: authState.profile.id });
      else await supabase.from('comment_likes').insert({ comment_id: id, profile_id: authState.profile.id });
      return;
    }

    if (editBtn) {
      const root = editBtn.closest('[data-comment-root]');
      root.querySelector('.comment-content').classList.add('hidden');
      root.querySelector('.comment-edit-form').classList.remove('hidden');
      return;
    }

    if (cancelBtn) {
      const root = cancelBtn.closest('[data-comment-root]');
      root.querySelector('.comment-content').classList.remove('hidden');
      root.querySelector('.comment-edit-form').classList.add('hidden');
      return;
    }

    if (delBtn) {
      if (confirm('Delete this comment?')) {
        await supabase.from('comments').delete().eq('id', delBtn.dataset.deleteComment);
        loadCommentsForThread(state.selectedThreadId);
      }
    }
  });

  $('#commentsList')?.addEventListener('submit', async e => {
    if (e.target.matches('.comment-edit-form')) {
      e.preventDefault();
      const id = e.target.dataset.editFormFor;
      const txt = e.target.querySelector('textarea').value.trim();
      if (!txt) return;
      await supabase.from('comments').update({ content: txt, updated_at: new Date().toISOString() }).eq('id', id);
      loadCommentsForThread(state.selectedThreadId);
    }
  });

  return { openEvent, reRender, selectThread };
}