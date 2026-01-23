import { openProfileModal } from './clickprofile.js';
import { formatRichText } from './rich-text.js';

export function initEventLogic(deps) {
  const {
    supabase, authState, tr, state, $, $$, setFlash, fmtDateTime,
    escapeHtml, linkify, bytesToSize, showView, getAvatarUrl,
    show, hide, refreshEventsList
  } = deps;

  // --- STATE ---
  let channels = { comments: null, threads: null, files: null, likes: null };
  let quillInstances = { en: null, es: null };
  const profileCache = new Map();
  let availableProfiles = [];

  // --- UTILITIES ---
  const isOrganizerOrAdmin = () => ['admin', 'organizer'].includes(authState.profile?.role);
  
  const scrollToLatest = (smooth = true) => {
    $('#commentsBottomAnchor')?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'end' });
  };

  const formatName = (p) => p?.full_name || p?.username || 'Anonymous';
  const initialLetter = (n) => (n || 'U').charAt(0).toUpperCase();
  
  const timeMeta = (created, updated) => {
    const base = fmtDateTime(created);
    return updated && updated !== created ? `${base} · edited ${fmtDateTime(updated)}` : base;
  };

  const toLocalInputValue = (d) => {
    if (!d) return "";
    const date = new Date(d);
    const p = n => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${p(date.getMonth()+1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`;
  };

  const lucideRefresh = () => window.lucide?.createIcons();

  // Efficient Bulk Profile Fetcher to avoid N+1 queries
  async function resolveProfiles(items, idKey = 'created_by') {
    const idsToFetch = new Set();
    items.forEach(i => {
      const uid = i[idKey]?.id || i[idKey]; // Handle raw ID or object
      if (uid && !profileCache.has(uid)) idsToFetch.add(uid);
    });

    if (idsToFetch.size > 0) {
      const { data } = await supabase.from('profiles').select('*').in('id', [...idsToFetch]);
      if (data) {
        await Promise.all(data.map(async p => {
          const public_avatar_url = p.avatar_url ? await getAvatarUrl(p.avatar_url) : null;
          profileCache.set(p.id, { ...p, public_avatar_url });
        }));
      }
    }
    return items.map(i => {
      const uid = i[idKey]?.id || i[idKey];
      return { ...i, author: profileCache.get(uid) || { full_name: 'Unknown' } };
    });
  }

  async function ensureProfileInCache(profileId) {
    if (!profileId || profileCache.has(profileId)) return profileCache.get(profileId);
    const { data } = await supabase.from('profiles').select('*').eq('id', profileId).single();
    if (!data) return null;
    const public_avatar_url = data.avatar_url ? await getAvatarUrl(data.avatar_url) : null;
    const enriched = { ...data, public_avatar_url };
    profileCache.set(profileId, enriched);
    return enriched;
  }

  // --- ADMIN EDITING LOGIC ---
  async function fetchProfilesForEdit() {
    if (availableProfiles.length) return;
    const { data } = await supabase.from('profiles').select('id, full_name, affiliation').order('full_name');
    availableProfiles = data || [];
    
    const dl = document.getElementById('js-dl-profiles');
    if (dl) dl.innerHTML = availableProfiles.map(p => `<option value="${escapeHtml(p.full_name)}">`).join('');
    
    const dlAff = document.getElementById('js-dl-affiliations');
    if (dlAff) {
      const affs = [...new Set(availableProfiles.map(p => p.affiliation).filter(Boolean))].sort();
      dlAff.innerHTML = affs.map(a => `<option value="${escapeHtml(a)}">`).join('');
    }
  }

  function initQuillEditor(sel) {
    if (!window.Quill) return null;
    return new Quill(sel, {
      theme: 'snow',
      modules: { toolbar: [['bold', 'italic', 'underline'], [{ 'color': [] }, { 'background': [] }], [{ 'list': 'ordered' }, { 'list': 'bullet' }], ['link', 'clean']] }
    });
  }

  function injectEditModal() {
    if (document.getElementById('event-js-editor-modal')) return;

    // Minified CSS for efficiency
    const styles = `.input-field{width:100%;padding:0.625rem 1rem;background-color:#f8fafc;border:1px solid transparent;border-radius:0.75rem;transition:all 0.2s;font-size:0.875rem;color:#1e293b;box-shadow:inset 0 1px 2px 0 rgb(0 0 0 / 0.05)}.input-field:focus{outline:none;box-shadow:0 0 0 2px var(--color-brand-light);border-color:var(--color-brand);background-color:#fff}.label-text{display:block;font-size:0.75rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.375rem}.editor-wrapper{width:100%;background-color:#f8fafc;border-radius:0.75rem;overflow:hidden}.ql-toolbar.ql-snow{border:none!important;border-bottom:1px solid rgba(0,0,0,0.05)!important;background:rgba(255,255,255,0.5)}.ql-container.ql-snow{border:none!important;font-family:'Inter',sans-serif!important;font-size:0.875rem!important}.ql-editor{min-height:100px;padding:12px 16px!important}`;

    const modalHtml = `
      <dialog id="event-js-editor-modal" class="rounded-2xl p-0 bg-white shadow-2xl max-w-2xl w-full m-auto backdrop:bg-slate-900/50">
        <style>${styles}</style>
        <div class="flex flex-col h-full max-h-[90vh]">
            <div class="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <h2 class="font-display font-bold text-xl text-slate-800">Edit Event</h2>
                <button id="close-js-editor" class="p-2 hover:bg-gray-200 rounded-full text-slate-500"><i data-lucide="x" class="w-5 h-5"></i></button>
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
                    <div><label class="label-text">Desc (EN)</label><div class="editor-wrapper"><div id="jsEditDescEn"></div></div></div>
                    <div><label class="label-text">Desc (ES)</label><div class="editor-wrapper"><div id="jsEditDescEs"></div></div></div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div><label class="label-text">Language</label><select id="jsEditEventLang" class="input-field cursor-pointer"><option value="bi">Bilingual</option><option value="en">English</option><option value="es">Español</option></select></div>
                        <div><label class="label-text">Host</label><input id="jsEditHostOrg" class="input-field" /></div>
                    </div>
                    <div><label class="label-text">Zoom URL</label><input id="jsEditZoomUrl" type="url" class="input-field" /></div>
                    <div><label class="label-text">Recording URL</label><input id="jsEditRecordingUrl" type="url" class="input-field" /></div>
                    <div><label class="label-text">Tags</label><input id="jsEditTags" class="input-field" /></div>
                    <div class="bg-gray-50 border border-gray-200 rounded-xl p-4">
                        <div class="flex justify-between items-center mb-3">
                            <label class="label-text mb-0">Speakers</label>
                            <button type="button" id="jsAddSpeakerBtn" class="text-xs font-bold text-brand-600 hover:text-brand-700 hover:bg-brand-50 px-2 py-1 rounded">+ Add</button>
                        </div>
                        <div id="jsEditSpeakersContainer" class="space-y-3"></div>
                    </div>
                </form>
            </div>
            <div class="p-5 border-t border-gray-100 bg-gray-50 flex justify-end items-center gap-3">
                <button type="button" id="jsCancelEdit" class="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-xl font-bold text-sm">Cancel</button>
                <button type="submit" form="jsEventEditForm" class="px-6 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold text-sm shadow-sm">Save Changes</button>
            </div>
        </div>
      </dialog>
      <datalist id="js-dl-profiles"></datalist><datalist id="js-dl-affiliations"></datalist>`;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    quillInstances.en = initQuillEditor('#jsEditDescEn');
    quillInstances.es = initQuillEditor('#jsEditDescEs');

    // Event Delegation for Speakers
    const spContainer = document.getElementById('jsEditSpeakersContainer');
    spContainer.addEventListener('click', e => {
      if (e.target.closest('.js-remove-speaker')) e.target.closest('.js-speaker-row').remove();
    });
    
    // Autofill logic via delegation
    spContainer.addEventListener('input', (e) => {
        if (!e.target.matches('.js-sp-profile-search')) return;
        const profile = availableProfiles.find(p => p.full_name === e.target.value);
        const row = e.target.closest('.js-speaker-row');
        if (profile) {
            row.querySelector('.js-sp-profile-id').value = profile.id;
            row.querySelector('.js-sp-name').value = profile.full_name;
            if (profile.affiliation) row.querySelector('.js-sp-aff').value = profile.affiliation;
        } else {
            row.querySelector('.js-sp-profile-id').value = '';
        }
    });

    document.getElementById('close-js-editor').onclick = () => document.getElementById('event-js-editor-modal').close();
    document.getElementById('jsCancelEdit').onclick = () => document.getElementById('event-js-editor-modal').close();
    document.getElementById('jsAddSpeakerBtn').onclick = () => addJsSpeakerRow();
    document.getElementById('jsEventEditForm').onsubmit = handleJsEditSubmit;
    lucideRefresh();
  }

  function addJsSpeakerRow(s = {}) {
    const profileName = s.profile_id && availableProfiles.length 
        ? availableProfiles.find(p => p.id === s.profile_id)?.full_name || '' 
        : '';
    
    const html = `
    <div class="js-speaker-row flex flex-col gap-2 p-3 bg-white border border-gray-200 rounded-lg shadow-sm mb-3">
        <div class="w-full space-y-2">
            <input type="text" class="js-sp-name input-field" placeholder="Name*" value="${escapeHtml(s.name || '')}" required>
            <input type="text" class="js-sp-aff input-field" placeholder="Affiliation" list="js-dl-affiliations" value="${escapeHtml(s.affiliation || '')}">
            <div class="relative">
                <input type="text" class="js-sp-profile-search input-field" placeholder="Link Profile (Search)" list="js-dl-profiles" autocomplete="off" value="${escapeHtml(profileName)}">
                <input type="hidden" class="js-sp-profile-id" value="${s.profile_id || ''}">
            </div>
        </div>
        <div class="flex items-center justify-between pt-2 border-t border-gray-100">
            <label class="flex items-center gap-2 text-xs text-slate-600 font-medium cursor-pointer"><input type="checkbox" class="js-sp-primary" ${s.primary_speaker ? 'checked' : ''}><span>Primary</span></label>
            <button type="button" class="js-remove-speaker text-slate-400 hover:text-red-500 p-1.5"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
        </div>
    </div>`;
    document.getElementById('jsEditSpeakersContainer').insertAdjacentHTML('beforeend', html);
    lucideRefresh();
  }

  const getQuillContent = (q) => {
    if (!q) return null;
    const t = q.getText().trim();
    return (t.length === 0 && q.root.innerHTML === '<p><br></p>') ? null : q.root.innerHTML;
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
    document.getElementById('jsEditEventLang').value = ev.language || 'bi';
    document.getElementById('jsEditHostOrg').value = ev.host_org || '';
    document.getElementById('jsEditZoomUrl').value = ev.zoom_url || '';
    document.getElementById('jsEditRecordingUrl').value = ev.recording_url || '';
    document.getElementById('jsEditTags').value = (ev.topic_tags || []).join(', ');

    if (quillInstances.en) quillInstances.en.root.innerHTML = ev.description_en || '';
    if (quillInstances.es) quillInstances.es.root.innerHTML = ev.description_es || '';

    const container = document.getElementById('jsEditSpeakersContainer');
    container.innerHTML = '';
    const { data: speakers } = await supabase.from('event_speakers').select('*').eq('event_id', ev.id);
    (speakers?.length ? speakers : [{}]).forEach(s => addJsSpeakerRow(s));

    document.getElementById('event-js-editor-modal').showModal();
    if (!section || section === 'main') document.querySelector('#event-js-editor-modal div').scrollTop = 0;
  }

  async function handleJsEditSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('jsEditEventId').value;
    const payload = {
      title_en: document.getElementById('jsEditTitleEn').value.trim(),
      title_es: document.getElementById('jsEditTitleEs').value.trim() || null,
      description_en: getQuillContent(quillInstances.en),
      description_es: getQuillContent(quillInstances.es),
      start_time: new Date(document.getElementById('jsEditStartTime').value).toISOString(),
      end_time: document.getElementById('jsEditEndTime').value ? new Date(document.getElementById('jsEditEndTime').value).toISOString() : null,
      language: document.getElementById('jsEditEventLang').value,
      host_org: document.getElementById('jsEditHostOrg').value.trim() || null,
      zoom_url: document.getElementById('jsEditZoomUrl').value.trim() || null,
      recording_url: document.getElementById('jsEditRecordingUrl').value.trim() || null,
      topic_tags: document.getElementById('jsEditTags').value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    };

    const speakers = Array.from(document.querySelectorAll('.js-speaker-row')).map(row => ({
      event_id: id,
      name: row.querySelector('.js-sp-name').value.trim(),
      affiliation: row.querySelector('.js-sp-aff').value.trim() || null,
      profile_id: row.querySelector('.js-sp-profile-id').value || null,
      primary_speaker: row.querySelector('.js-sp-primary').checked
    })).filter(s => s.name);

    const { error } = await supabase.from('events').update(payload).eq('id', id);
    if (error) { setFlash("Error updating event", 3000); return; }

    await supabase.from('event_speakers').delete().eq('event_id', id);
    if (speakers.length) await supabase.from('event_speakers').insert(speakers);

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

  // --- FILES LOGIC ---
  async function loadAndRenderFiles() {
    if (!state.selectedEvent) return;
    const { data, error } = await supabase.from('attachments').select('id, event_id, created_by, object_path, file_name, file_size, created_at, created_by:profiles!attachments_created_by_fkey(id, full_name)').eq('event_id', state.selectedEvent.id).order('created_at', { ascending: false });
    if (error) return console.error(error);
    state.files = data || [];
    renderFiles();
  }

  function renderFiles() {
    const listEl = $('#filesList');
    if (!listEl) return;
    if (!state.files?.length) { hide(listEl); show($('#emptyFiles')); return; }
    
    show(listEl); hide($('#emptyFiles'));
    const uid = authState.profile?.id;
    const isAdmin = isOrganizerOrAdmin();

    listEl.innerHTML = state.files.map(f => {
      const { data: { publicUrl } } = supabase.storage.from('attachments').getPublicUrl(f.object_path);
      const canDel = uid === f.created_by || isAdmin;
      return `
        <div class="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-xl animate-fade-in">
          <div class="flex items-center gap-4 min-w-0">
            <div class="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center text-slate-500 border border-slate-200"><i data-lucide="file-text" class="w-5 h-5"></i></div>
            <div class="min-w-0">
              <p class="font-semibold text-sm text-slate-800 truncate">${escapeHtml(f.file_name)}</p>
              <p class="text-xs text-slate-400">${bytesToSize(f.file_size)} • ${escapeHtml(f.created_by?.full_name || 'Anonymous')}</p>
            </div>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0">
            ${canDel ? `<button class="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" data-delete-file="${f.id}" data-file-path="${f.object_path}"><i data-lucide="trash-2" class="w-4 h-4"></i></button>` : ''}
            <a href="${publicUrl}" download="${escapeHtml(f.file_name)}" class="px-3 py-1.5 bg-slate-50 text-xs font-bold text-slate-600 rounded-lg border border-slate-200 hover:bg-white">Download</a>
          </div>
        </div>`;
    }).join('');
    lucideRefresh();
  }

  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file || !state.selectedEvent) return;
    if (file.size > 10485760) return setFlash('File too large (max 10MB).', 4000);

    const path = `${state.selectedEvent.id}/${self.crypto.randomUUID()}-${file.name}`;
    setFlash('Uploading...', -1);
    
    const { error: upErr } = await supabase.storage.from('attachments').upload(path, file);
    if (upErr) return setFlash('Upload failed', 4000);

    const { error: dbErr } = await supabase.from('attachments').insert({
      event_id: state.selectedEvent.id, created_by: authState.session.user.id,
      bucket_id: 'attachments', object_path: path, file_name: file.name, file_size: file.size, file_type: file.type
    });
    
    setFlash(dbErr ? 'Upload failed' : 'Upload complete!', 3000);
    e.target.value = '';
  }

  async function deleteFile(id, path, btn) {
    if (!confirm('Delete this file?')) return;
    btn.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin"></i>`;
    lucideRefresh();

    const { error: sErr } = await supabase.storage.from('attachments').remove([path]);
    if (sErr) return setFlash('Delete failed', 4000);
    
    const { error: dErr } = await supabase.from('attachments').delete().eq('id', id);
    if (dErr) return setFlash('Database error', 4000);

    state.files = state.files.filter(f => f.id !== id);
    renderFiles();
    setFlash('File deleted', 3000);
  }

  // --- THREADS LOGIC ---
  async function loadAndRenderThreads() {
    if (!state.selectedEvent) return;
    const { data, error } = await supabase.from('threads').select('id, event_id, title, created_by, created_at, pinned').eq('event_id', state.selectedEvent.id).order('pinned', { ascending: false }).order('created_at', { ascending: false });
    if (error) return console.error(error);
    
    state.threads = await resolveProfiles(data || []);
    renderThreads();
  }

  function renderThreads() {
    const listEl = $('#threadsList');
    if (!listEl) return;
    if (!state.threads?.length) { listEl.innerHTML = `<div class="p-4 text-center text-xs text-slate-400">No topics yet.</div>`; return; }

    const uid = authState.profile?.id;
    const isAdmin = isOrganizerOrAdmin();

    listEl.innerHTML = state.threads.map(t => {
      const active = String(t.id) === String(state.selectedThreadId);
      const canMod = t.created_by === uid || isAdmin;
      
      return `<div class="group flex items-center justify-between gap-2 p-2 rounded-lg cursor-pointer transition-colors ${active ? 'bg-brand-50 ring-1 ring-brand-200' : 'hover:bg-slate-100'}" data-thread-row="${t.id}">
          <div class="flex items-center gap-2 min-w-0 flex-1" data-thread-id="${t.id}">
            <i data-lucide="${t.pinned ? 'pin' : 'hash'}" class="w-3.5 h-3.5 shrink-0 ${t.pinned ? 'text-amber-500 fill-current' : 'text-slate-400'}"></i>
            <span class="truncate text-sm font-medium text-slate-700 ${active ? 'text-brand-800' : ''}">${escapeHtml(t.title)}</span>
          </div>
          ${canMod ? `<div class="relative thread-actions-menu group/menu">
            <button class="p-1 text-slate-400 hover:text-slate-600 rounded opacity-0 group-hover:opacity-100 transition-opacity" data-thread-menu="${t.id}"><i data-lucide="more-horizontal" class="w-4 h-4"></i></button>
            <div class="hidden absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-50 w-32" data-thread-dropdown="${t.id}">
                <button class="w-full text-left px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 flex gap-2" data-edit-thread="${t.id}">Edit</button>
                <button class="w-full text-left px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 flex gap-2" data-toggle-pin-thread="${t.id}">${t.pinned ? 'Unpin' : 'Pin'}</button>
                <button class="w-full text-left px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 flex gap-2" data-delete-thread="${t.id}">Delete</button>
            </div>
          </div>` : ''}
        </div>`;
    }).join('');
    lucideRefresh();
  }

  async function handleNewThread(e) {
    e.preventDefault();
    const title = e.target.querySelector('input').value.trim();
    if (!title) return;
    const { data, error } = await supabase.from('threads').insert({ title, event_id: state.selectedEvent.id, created_by: authState.session.user.id }).select().single();
    if (error) setFlash('Failed to create thread');
    else {
      e.target.querySelector('input').value = '';
      hide($('#newThreadForm')); show($('#btnToggleThreadForm'));
      await loadAndRenderThreads();
      selectThread(data.id);
    }
  }

  async function threadAction(action, id) {
    if (action === 'delete' && !confirm('Delete thread?')) return;
    const t = state.threads.find(x => x.id === id);
    if (!t && action !== 'delete') return;

    let error;
    if (action === 'edit') {
        const title = prompt('New title:', t.title);
        if (title && title.trim() !== t.title) ({ error } = await supabase.from('threads').update({ title: title.trim() }).eq('id', id));
    } else if (action === 'pin') {
        ({ error } = await supabase.from('threads').update({ pinned: !t.pinned }).eq('id', id));
    } else if (action === 'delete') {
        ({ error } = await supabase.from('threads').delete().eq('id', id));
        if (!error && String(state.selectedThreadId) === String(id)) {
            state.selectedThreadId = null;
            hide($('#threadDetailView')); show($('#thread-welcome'));
        }
    }
    if (error) setFlash('Action failed'); else await loadAndRenderThreads();
  }

  // --- COMMENTS LOGIC ---
  async function loadCommentsForThread(tId) {
    const { data, error } = await supabase.from('comments').select('id, event_id, thread_id, parent_id, content, created_by, created_at, updated_at').eq('thread_id', tId).order('created_at', { ascending: true });
    if (error) return console.error(error);
    
    // Enrich with Author Profiles (Bulk)
    state.comments = await resolveProfiles(data || [], 'created_by');

    // Enrich with Likes
    if (state.comments.length) {
      const ids = state.comments.map(c => c.id);
      const { data: likes } = await supabase.from('comment_likes').select('comment_id, profile_id').in('comment_id', ids);
      const counts = {}, likedByMe = new Set();
      likes?.forEach(l => {
        counts[l.comment_id] = (counts[l.comment_id] || 0) + 1;
        if (l.profile_id === authState.profile?.id) likedByMe.add(l.comment_id);
      });
      state.comments = state.comments.map(c => ({ ...c, likes_count: counts[c.id] || 0, liked_by_me: likedByMe.has(c.id) }));
    }
    renderComments();
  }

  function renderComments() {
    const listEl = $('#commentsList');
    if (!listEl) return;
    if (!state.comments?.length) {
      listEl.innerHTML = `<div class="flex flex-col items-center py-10 text-slate-400"><i data-lucide="message-circle" class="w-10 h-10 mb-2 opacity-20"></i><p class="text-xs">No comments yet.</p></div><div id="commentsBottomAnchor"></div>`;
      return lucideRefresh();
    }

    const byParent = state.comments.reduce((acc, c) => { (acc[c.parent_id || 'root'] ||= []).push(c); return acc; }, {});
    const buildTree = (pid) => (byParent[pid] || []).map(c => {
      const name = formatName(c.author);
      const isMe = authState.profile?.id === c.author?.id;
      const isAdmin = isOrganizerOrAdmin();
      const ava = c.author?.public_avatar_url ? `<img src="${c.author.public_avatar_url}" class="w-full h-full object-cover">` : `<span class="font-bold text-slate-600 text-xs">${initialLetter(name)}</span>`;
      
      return `<div class="mb-4" data-comment-root="${c.id}">
        <div class="flex items-start gap-3">
          <button class="flex-shrink-0 w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center overflow-hidden ring-2 ring-white shadow-sm cursor-pointer" data-open-profile="${c.author?.id || ''}">${ava}</button>
          <div class="flex-1 min-w-0">
            <div class="bg-slate-50 border border-slate-100 rounded-2xl rounded-tl-none p-3 group/card">
                <div class="flex justify-between gap-2 mb-1">
                    <div class="flex items-center gap-2 min-w-0">
                        <span class="text-sm font-bold text-slate-800 cursor-pointer hover:underline" data-open-profile="${c.author?.id || ''}">${escapeHtml(name)}</span>
                        <span class="text-[10px] text-slate-400">${timeMeta(c.created_at, c.updated_at)}</span>
                    </div>
                    <button class="flex items-center gap-1 text-slate-400 hover:text-rose-600 transition-colors opacity-0 group-hover/card:opacity-100 ${c.liked_by_me ? 'text-rose-600' : ''}" data-like-comment="${c.id}">
                        <i data-lucide="heart" class="w-3.5 h-3.5 ${c.liked_by_me ? 'fill-current' : ''}"></i><span class="text-[10px] font-bold">${c.likes_count || ''}</span>
                    </button>
                </div>
                <div class="comment-content text-sm text-slate-700 prose prose-sm max-w-none prose-p:my-0 prose-a:text-brand-600">${linkify(c.content)}</div>
                <form class="comment-edit-form hidden mt-2" data-edit-form-for="${c.id}">
                    <textarea class="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none" rows="2">${escapeHtml(c.content)}</textarea>
                    <div class="flex justify-end gap-2 mt-2"><button type="button" class="text-xs font-bold text-slate-500 px-3 py-1" data-cancel-edit>Cancel</button><button type="submit" class="text-xs font-bold text-white bg-brand-600 rounded px-3 py-1">Save</button></div>
                </form>
            </div>
            <div class="flex items-center gap-3 mt-1 pl-2 text-[11px] font-bold">
                <button class="text-slate-500 hover:text-brand-600" data-reply-to="${c.id}" data-reply-name="${escapeHtml(name)}">Reply</button>
                ${isMe ? `<button class="text-slate-400 hover:text-slate-600" data-edit-comment="${c.id}">Edit</button>` : ''}
                ${(isMe || isAdmin) ? `<button class="text-slate-400 hover:text-red-600" data-delete-comment="${c.id}">Delete</button>` : ''}
            </div>
          </div>
        </div>
        ${(byParent[c.id]?.length) ? `<div class="ml-8 mt-3 pl-3 border-l-2 border-slate-100 space-y-4">${buildTree(c.id).join('')}</div>` : ''}
      </div>`;
    }).join('');

    listEl.innerHTML = `<div class="pb-2">${buildTree('root').join('')}</div><div id="commentsBottomAnchor"></div>`;
    lucideRefresh();
  }

  async function handleNewComment(e) {
    e.preventDefault();
    const input = e.target.querySelector('input, textarea');
    const content = input.value.trim();
    if (!content) return;
    
    const { error } = await supabase.from('comments').insert({ content, thread_id: state.selectedThreadId, created_by: authState.session.user.id, event_id: state.selectedEvent.id, parent_id: e.target.dataset.parentId || null });
    if (error) setFlash('Failed to post');
    else {
      input.value = '';
      delete e.target.dataset.parentId;
      e.target.querySelector('.reply-indicator')?.remove();
      loadCommentsForThread(state.selectedThreadId);
      setTimeout(() => scrollToLatest(true), 100);
    }
  }

  // --- HEADER & TABS ---
  function renderEventHeader() {
    const ev = state.selectedEvent;
    if (!ev) return;
    const title = (state.language === "es" && ev.title_es) || ev.title_en;
    const isAdmin = isOrganizerOrAdmin();

    $('#compactEventHeaderContainer').innerHTML = `
      <div class="flex items-start justify-between gap-4">
        <div class="flex items-start gap-3 overflow-hidden">
             <button id="back-to-schedule" class="mt-1 p-2 text-slate-400 hover:bg-slate-100 rounded-full shrink-0"><i data-lucide="arrow-left" class="w-5 h-5"></i></button>
             <div class="min-w-0 py-1">
                <div class="flex items-center gap-2 text-brand-600 text-xs font-bold uppercase tracking-wider mb-1"><i data-lucide="calendar" class="w-3.5 h-3.5"></i> ${fmtDateTime(ev.start_time, { weekday: 'short', month: 'short', day: 'numeric' })} <span class="text-slate-300">•</span> ${fmtDateTime(ev.start_time, { hour: 'numeric', minute: '2-digit' })}</div>
                <h2 class="font-display font-bold text-xl md:text-2xl text-slate-900 leading-tight truncate" title="${escapeHtml(title)}">${escapeHtml(title)}</h2>
             </div>
        </div>
        <div class="flex items-center gap-2 shrink-0 pt-1">
             <button id="followBtn" class="h-9 px-4 rounded-lg border text-xs font-bold flex items-center gap-2"><i data-lucide="star" class="w-3.5 h-3.5"></i> <span>Follow</span></button>
             <select id="rsvpSelect" class="h-9 pl-3 pr-8 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-gray-50 cursor-pointer outline-none focus:border-brand-500"><option value="not_going">Not Going</option><option value="interested">Interested</option><option value="going">Going</option></select>
             ${isAdmin ? `<button class="h-9 w-9 rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-brand-600 hover:bg-brand-50 flex items-center justify-center ml-2" data-edit-event-section="main"><i data-lucide="pencil" class="w-4 h-4"></i></button>` : ''}
        </div>
      </div>`;

    setTimeout(() => {
      $('#back-to-schedule').onclick = () => showView('schedule');
      $('#followBtn').onclick = (e) => { e.preventDefault(); toggleFollow(ev.id); };
      $('#rsvpSelect').onchange = (e) => updateRSVP(ev.id, e.target.value);
      loadRSVPFollow(ev.id);
    }, 0);
    lucideRefresh();
  }

  async function loadRSVPFollow(id) {
    if (!authState.profile) return;
    const [{ data: f }, { data: r }] = await Promise.all([
        supabase.from('event_follows').select('id').eq('event_id', id).eq('profile_id', authState.profile.id).maybeSingle(),
        supabase.from('event_rsvps').select('status').eq('event_id', id).eq('profile_id', authState.profile.id).maybeSingle()
    ]);
    state.isFollowing = !!f;
    state.rsvpStatus = r?.status || 'not_going';
    if ($('#rsvpSelect')) $('#rsvpSelect').value = state.rsvpStatus;
    updateFollowUI();
  }

  function updateFollowUI() {
    const btn = $('#followBtn');
    if (!btn) return;
    if (state.isFollowing) {
      btn.className = 'h-9 px-4 rounded-lg border border-amber-200 bg-amber-50 text-amber-700 text-xs font-bold flex items-center gap-2 transition-all';
      btn.innerHTML = `<i data-lucide="star" class="w-3.5 h-3.5 fill-current"></i> <span>Following</span>`;
    } else {
      btn.className = 'h-9 px-4 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-xs font-bold flex items-center gap-2 transition-all';
      btn.innerHTML = `<i data-lucide="star" class="w-3.5 h-3.5"></i> <span>Follow</span>`;
    }
    lucideRefresh();
  }

  const updateRSVP = async (eid, status) => {
    if (authState.profile) await supabase.from('event_rsvps').upsert({ event_id: eid, profile_id: authState.profile.id, status });
    setFlash('RSVP updated');
  };

  const toggleFollow = async (eid) => {
    if (!authState.profile) return;
    const was = state.isFollowing;
    state.isFollowing = !was;
    updateFollowUI();
    const q = supabase.from('event_follows');
    if (was) await q.delete().match({ event_id: eid, profile_id: authState.profile.id });
    else await q.insert({ event_id: eid, profile_id: authState.profile.id });
  };

  async function renderDescriptionTab() {
    const ev = state.selectedEvent;
    if (!ev) return;
    const desc = (state.language === "es" && ev.description_es) || ev.description_en || '';
    const isPast = new Date(ev.start_time) < new Date();
    
    let access = `<div class="w-full py-3 bg-gray-100 text-gray-400 font-bold text-center rounded-lg text-sm cursor-not-allowed">Access Unavailable</div>`;
    if (!isPast && ev.zoom_url) access = `<a href="${ev.zoom_url}" target="_blank" class="block w-full text-center py-3 bg-[#0077b6] hover:bg-[#023e8a] text-white font-bold rounded-lg shadow-sm mb-1"><i data-lucide="video" class="inline w-4 h-4 mr-2"></i>Register/Join via Zoom</a>`;
    else if (ev.recording_url) access = `<a href="${ev.recording_url}" target="_blank" class="block w-full text-center py-3 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-lg shadow-sm mb-1"><i data-lucide="play-circle" class="inline w-4 h-4 mr-2"></i>Watch Recording</a>`;

    const speakersHtml = await Promise.all((ev.event_speakers || []).map(async s => {
      const p = s.profile;
      const img = p?.avatar_url ? await getAvatarUrl(p.avatar_url) : null;
      const ava = img ? `<img src="${img}" class="w-full h-full object-cover">` : `<span class="text-brand-600 font-bold">${(s.name||'?')[0]}</span>`;
      const flag = p?.country ? `<img src="https://flagcdn.com/w80/${p.country.toLowerCase()}.png" class="ml-auto h-8 w-auto rounded-md shadow-sm border border-gray-100 object-cover shrink-0">` : '';

      return `<div ${p?.id ? `data-open-profile="${p.id}" class="flex items-center gap-3 p-2 -mx-2 rounded-lg hover:bg-slate-50 cursor-pointer group/speaker"` : `class="flex items-center gap-3 p-2 -mx-2 opacity-80"`}>
         <div class="w-10 h-10 rounded-full bg-brand-50 flex items-center justify-center overflow-hidden flex-shrink-0 shadow-sm ring-2 ring-transparent ${p?.id ? 'group-hover/speaker:ring-brand-100' : ''}">${ava}</div>
         <div class="min-w-0 flex-1"><div class="text-sm font-bold text-slate-800 truncate ${p?.id ? 'group-hover/speaker:text-brand-700' : ''}">${escapeHtml(s.name||p?.full_name)}</div>${s.affiliation ? `<div class="text-xs text-slate-500 truncate">${escapeHtml(s.affiliation)}</div>` : ''}</div>
         ${flag}
      </div>`;
    }));

    const tags = (ev.topic_tags || []).map(t => `<span class="bg-slate-100 text-slate-600 px-2 py-1 rounded text-[11px] font-bold uppercase">${escapeHtml(t)}</span>`).join('');
    
    $('#tab_description').innerHTML = `
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
        <div class="lg:col-span-8"><h3 class="flex items-center text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">About this session</h3>${formatRichText(desc)}</div>
        <div class="lg:col-span-4 space-y-6">
            <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-sm"><h4 class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Access</h4>${access}</div>
            <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-sm"><h4 class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Speakers</h4><div class="space-y-2">${speakersHtml.length ? speakersHtml.join('') : '<span class="text-sm text-slate-400 italic">TBA</span>'}</div></div>
            <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-sm space-y-4">
                <div><h4 class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Language</h4><div class="text-sm font-semibold text-slate-800">${ev.language === 'bi' ? 'English & Spanish' : (ev.language === 'es' ? 'Español' : 'English')}</div></div>
                ${ev.host_org ? `<div><h4 class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Hosted By</h4><div class="text-sm font-semibold text-slate-800 flex items-center gap-1.5"><i data-lucide="building-2" class="w-3.5 h-3.5 text-slate-400"></i> ${escapeHtml(ev.host_org)}</div></div>` : ''}
                ${tags ? `<div><h4 class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Tags</h4><div class="flex flex-wrap gap-1.5">${tags}</div></div>` : ''}
            </div>
        </div>
      </div>`;
    lucideRefresh();
  }

  function reRender() {
    if (!state.selectedEvent) return;
    renderEventHeader(); renderDescriptionTab(); renderThreads(); renderComments(); renderFiles();
  }

  // --- INIT ---
  async function openEvent(eid) {
    if (!authState.session) {
      const gate = document.getElementById('authGateModal');
      if (gate) { gate.classList.remove('hidden'); lucideRefresh(); }
      else setFlash(tr('auth.required'));
      return;
    }

    const event = state.events.find(e => String(e.id) === String(eid));
    if (!event) return;

    state.selectedEvent = event;
    state.selectedThreadId = null;
    showView('event');
    window.history.pushState({ event: eid }, '', `?event=${eid}`);
    
    renderEventHeader();
    renderDescriptionTab();
    hide($('#threadDetailView')); show($('#thread-welcome'));
    
    // Cleanup old channels
    Object.values(channels).forEach(c => c?.unsubscribe());
    
    // Parallel Fetching
    await Promise.all([loadAndRenderThreads(), loadAndRenderFiles()]);
    
    // Subscriptions
    channels.threads = supabase.channel(`t-${eid}`).on('postgres_changes', { event: '*', schema: 'public', table: 'threads', filter: `event_id=eq.${eid}` }, loadAndRenderThreads).subscribe();
    channels.comments = supabase.channel(`c-${eid}`).on('postgres_changes', { event: '*', schema: 'public', table: 'comments', filter: `event_id=eq.${eid}` }, () => state.selectedThreadId && loadCommentsForThread(state.selectedThreadId)).subscribe();
    channels.files = supabase.channel(`f-${eid}`).on('postgres_changes', { event: '*', schema: 'public', table: 'attachments', filter: `event_id=eq.${eid}` }, loadAndRenderFiles).subscribe();
    channels.likes = supabase.channel(`l-${eid}`).on('postgres_changes', { event: '*', schema: 'public', table: 'comment_likes' }, () => state.selectedThreadId && loadCommentsForThread(state.selectedThreadId)).subscribe();

    $('.tab-link[data-tab="description"]')?.click();
  }

  async function selectThread(tid) {
    state.selectedThreadId = tid;
    renderThreads();
    hide($('#thread-welcome')); show($('#threadDetailView'));
    loadCommentsForThread(tid);
  }

  // --- GLOBAL LISTENERS ---
  const bindListener = (sel, event, handler) => $(sel)?.addEventListener(event, handler);
  
  bindListener('#newThreadForm', 'submit', handleNewThread);
  bindListener('#replyToThreadForm', 'submit', handleNewComment);
  bindListener('#fileInput', 'change', handleFileUpload);
  bindListener('#btnToggleThreadForm', 'click', () => { show($('#newThreadForm')); hide($('#btnToggleThreadForm')); $('#threadTitle').focus(); });
  bindListener('#cancelThreadBtn', 'click', () => { hide($('#newThreadForm')); show($('#btnToggleThreadForm')); $('#threadTitle').value = ''; });
  
  bindListener('#filesList', 'click', async e => {
    const btn = e.target.closest('[data-delete-file]');
    if (btn) { e.preventDefault(); await deleteFile(btn.dataset.deleteFile, btn.dataset.filePath, btn); }
  });

  document.addEventListener('click', async e => {
    // Edit Event
    const editBtn = e.target.closest('[data-edit-event-section]');
    if (editBtn) { e.preventDefault(); e.stopPropagation(); return openEditModal(editBtn.dataset.editEventSection); }

    // Profile Click
    const pBtn = e.target.closest('[data-open-profile]');
    if (pBtn) {
        e.preventDefault(); e.stopPropagation();
        const pid = pBtn.dataset.openProfile;
        if (!pid) return;
        const profile = await ensureProfileInCache(pid);
        if (profile) openProfileModal({ ...profile }); // Pass copy
        return;
    }

    // Thread Dropdowns (Global Close)
    if (!e.target.closest('.thread-actions-menu')) $$('[data-thread-dropdown]').forEach(d => d.classList.add('hidden'));
  });

  // Thread List Actions
  $('#threadsList')?.addEventListener('click', e => {
    const menu = e.target.closest('[data-thread-menu]');
    if (menu) {
        e.stopPropagation();
        const dd = document.querySelector(`[data-thread-dropdown="${menu.dataset.threadMenu}"]`);
        $$('.thread-actions-dropdown').forEach(d => d !== dd && d.classList.add('hidden'));
        return dd?.classList.toggle('hidden');
    }
    const actionMap = { 'data-edit-thread': 'edit', 'data-toggle-pin-thread': 'pin', 'data-delete-thread': 'delete' };
    for (const [attr, action] of Object.entries(actionMap)) {
        const btn = e.target.closest(`[${attr}]`);
        if (btn) {
            e.stopPropagation();
            $$('[data-thread-dropdown]').forEach(d => d.classList.add('hidden'));
            return threadAction(action, btn.getAttribute(attr));
        }
    }
    const row = e.target.closest('[data-thread-id]');
    if (row) selectThread(row.dataset.threadId);
  });

  // Comments Actions
  $('#commentsList')?.addEventListener('click', async e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    
    if (btn.matches('[data-reply-to]')) {
        const form = $('#replyToThreadForm');
        form.dataset.parentId = btn.dataset.replyTo;
        form.querySelector('.reply-indicator')?.remove();
        const ind = document.createElement('div');
        ind.className = 'reply-indicator flex justify-between items-center px-3 py-1 text-xs bg-slate-100 text-slate-500 border-b border-slate-200';
        ind.innerHTML = `<span>Replying to <b>${btn.dataset.replyName}</b></span><button type="button">&times;</button>`;
        form.insertBefore(ind, form.firstChild);
        ind.querySelector('button').onclick = () => { delete form.dataset.parentId; ind.remove(); };
        form.querySelector('input').focus();
    } else if (btn.matches('[data-like-comment]')) {
        const id = btn.dataset.likeComment;
        if (!authState.profile) return;
        const c = state.comments.find(x => x.id === id);
        if (c?.liked_by_me) await supabase.from('comment_likes').delete().match({ comment_id: id, profile_id: authState.profile.id });
        else await supabase.from('comment_likes').insert({ comment_id: id, profile_id: authState.profile.id });
    } else if (btn.matches('[data-edit-comment]')) {
        const r = btn.closest('[data-comment-root]');
        r.querySelector('.comment-content').classList.add('hidden');
        r.querySelector('.comment-edit-form').classList.remove('hidden');
    } else if (btn.matches('[data-cancel-edit]')) {
        const r = btn.closest('[data-comment-root]');
        r.querySelector('.comment-content').classList.remove('hidden');
        r.querySelector('.comment-edit-form').classList.add('hidden');
    } else if (btn.matches('[data-delete-comment]')) {
        if (confirm('Delete comment?')) await supabase.from('comments').delete().eq('id', btn.dataset.deleteComment);
        loadCommentsForThread(state.selectedThreadId);
    }
  });

  // Edit Comment Submit
  $('#commentsList')?.addEventListener('submit', async e => {
    if (e.target.matches('.comment-edit-form')) {
        e.preventDefault();
        const txt = e.target.querySelector('textarea').value.trim();
        if (txt) {
            await supabase.from('comments').update({ content: txt, updated_at: new Date().toISOString() }).eq('id', e.target.dataset.editFormFor);
            loadCommentsForThread(state.selectedThreadId);
        }
    }
  });

  return { openEvent, reRender, selectThread };
}