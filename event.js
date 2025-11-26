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
    hide
  } = deps;

  // --- STATE & CHANNELS ---
  let currentCommentsChannel = null;
  let currentThreadsChannel = null;
  let currentFilesChannel = null;
  let currentLikesChannel = null;
  let currentRSVPFollowsChannel = null;
  
  // Cache
  const profileCache = new Map();

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
      .select('id, username, full_name, affiliation, avatar_url')
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

  // --- FILES LOGIC ---
  async function loadAndRenderFiles() {
    if (!state.selectedEvent) return;
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
      const bucketName = file.bucket_id || 'attachments';
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
      return; 
    }
    
    const filePath = `${state.selectedEvent.id}/${self.crypto.randomUUID()}-${file.name}`;
    setFlash('Uploading...', -1);
    
    const { error: uploadError } = await supabase.storage.from('attachments').upload(filePath, file);
    if (uploadError) { setFlash('Upload failed', 4000); return; }
    
    const { error: insertError } = await supabase.from('attachments').insert({
      event_id: state.selectedEvent.id,
      created_by: authState.session.user.id,
      bucket_id: 'attachments',
      object_path: filePath,
      file_name: file.name,
      file_size: file.size,
      file_type: file.type
    });
    
    // Note: We don't manually refresh here because the Realtime subscription (added in openEvent) 
    // will catch the INSERT and trigger loadAndRenderFiles automatically.
    if (insertError) setFlash('Upload failed', 4000); else setFlash('Upload complete!', 3000);
    e.target.value = '';
  }

  // UPDATED: Improved Delete File with Instant UI Update
  async function deleteFile(fileId, filePath, btn) {
    if (!confirm('Delete this file?')) return;
    
    const bucketName = btn.dataset.bucket || 'attachments';
    
    // 1. Visual Feedback: Set spinner
    const originalContent = btn.innerHTML;
    btn.disabled = true; 
    btn.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin"></i>`; 
    lucideRefresh();
    
    // 2. Delete from Storage first
    const { error: storageError } = await supabase.storage.from(bucketName).remove([filePath]);
    if (storageError) { 
      setFlash('Delete failed', 4000); 
      // Revert button state on error
      btn.disabled = false; 
      btn.innerHTML = originalContent;
      lucideRefresh();
      return; 
    }
    
    // 3. Delete from Database
    const { error: dbError } = await supabase.from('attachments').delete().eq('id', fileId);

    if (dbError) {
        setFlash('Database error', 4000);
        btn.disabled = false;
        btn.innerHTML = originalContent;
        lucideRefresh();
        return;
    }

    // 4. SUCCESS: Update Local State and Re-render immediately
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
            <button class="w-full text-left px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2" data-edit-thread="${thread.id}">
               Edit
            </button>
            <button class="w-full text-left px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2" data-toggle-pin-thread="${thread.id}">
               ${thread.pinned ? 'Unpin' : 'Pin'}
            </button>
            <button class="w-full text-left px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 flex items-center gap-2" data-delete-thread="${thread.id}">
               Delete
            </button>
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

  // Thread Action Handlers
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
    else { input.value = ''; await loadAndRenderThreads(); selectThread(data.id); }
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
      .select(`
        id, event_id, thread_id, parent_id, content, created_by, created_at, updated_at,
        author:profiles!comments_created_by_fkey(id, username, full_name, affiliation, avatar_url)
      `)
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true });

    if (error) { console.error("Error fetching comments:", error); return; }

    // Enrich profiles
    for (const c of (data || [])) {
      if (c.author?.id) {
        const cached = await ensureProfileInCache(c.author.id);
        if (cached) c.author = { ...cached };
      }
    }
    
    state.comments = data || [];
    
    // Load likes
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
        <button class="flex-shrink-0 w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center overflow-hidden ring-2 ring-white shadow-sm" data-open-profile="${user?.id || ''}">
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

  // --- PROFILE POPOVER LOGIC ---
  let profilePopoverEl = null;
  function ensurePopoverEl() {
    if (profilePopoverEl) return profilePopoverEl;
    const el = document.createElement('div');
    el.className = 'fixed z-[999] bg-white border border-slate-200 shadow-xl rounded-xl p-4 w-72 hidden';
    el.innerHTML = `
      <div class="flex items-center gap-3 mb-3">
        <div class="w-12 h-12 rounded-full bg-slate-100 overflow-hidden" id="pp-avatar"></div>
        <div class="min-w-0">
          <div class="font-bold text-slate-900 truncate" id="pp-name"></div>
          <div class="text-xs text-slate-500 truncate" id="pp-affiliation"></div>
        </div>
      </div>
      <a id="pp-view" class="block w-full text-center py-1.5 bg-brand-50 text-brand-700 font-bold text-xs rounded-lg hover:bg-brand-100 transition-colors">View Profile</a>
    `;
    document.body.appendChild(el);
    profilePopoverEl = el;
    document.addEventListener('click', (e) => {
        if (!el.contains(e.target) && !e.target.closest('[data-open-profile]')) el.classList.add('hidden');
    });
    return el;
  }

  async function openProfilePopover(profileId, anchor) {
      const el = ensurePopoverEl();
      const p = await ensureProfileInCache(profileId);
      if(!p) return;
      
      el.querySelector('#pp-name').textContent = formatName(p);
      el.querySelector('#pp-affiliation').textContent = p.affiliation || 'No affiliation';
      el.querySelector('#pp-avatar').innerHTML = p.public_avatar_url ? `<img src="${p.public_avatar_url}" class="w-full h-full object-cover">` : `<div class="w-full h-full flex items-center justify-center text-lg font-bold text-slate-400">${initialLetter(formatName(p))}</div>`;
      el.querySelector('#pp-view').href = `profile.html?user=${p.id}`;
      
      const rect = anchor.getBoundingClientRect();
      el.style.top = `${rect.bottom + window.scrollY + 10}px`;
      el.style.left = `${rect.left + window.scrollX}px`;
      el.classList.remove('hidden');
  }

  // --- REVAMPED HEADER & LAYOUT LOGIC ---
  function renderEventHeader() {
    const ev = state.selectedEvent;
    if (!ev) return;
    const title = state.language === "es" && ev.title_es ? ev.title_es : ev.title_en;
    const container = $('#compactEventHeaderContainer');

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
             <button id="followBtn" class="h-9 px-4 rounded-lg border text-xs font-bold transition-all flex items-center gap-2">
                <i data-lucide="star" class="w-3.5 h-3.5"></i> <span>Follow</span>
             </button>
             <select id="rsvpSelect" class="h-9 pl-3 pr-8 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-gray-50 transition-colors cursor-pointer outline-none focus:border-brand-500">
                <option value="not_going">Not Going</option>
                <option value="interested">Interested</option>
                <option value="going">Going</option>
             </select>
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
        const ava = img ? `<img src="${img}" class="w-full h-full object-cover">` : `<span class="text-brand-600 font-bold">${(s.name||'?')[0]}</span>`;
        return `<div class="flex items-center gap-3">
             <div class="w-10 h-10 rounded-full bg-brand-50 flex items-center justify-center overflow-hidden flex-shrink-0">${ava}</div>
             <div class="min-w-0">
                <div class="text-sm font-bold text-slate-800 truncate">${escapeHtml(s.name || s.profile?.full_name)}</div>
                ${s.affiliation ? `<div class="text-xs text-slate-500 truncate">${escapeHtml(s.affiliation)}</div>` : ''}
             </div>
        </div>`;
    }));

    const tags = (ev.topic_tags || []).map(t => `<span class="bg-slate-100 text-slate-600 px-2 py-1 rounded text-[11px] font-bold uppercase">${escapeHtml(t)}</span>`).join('');

    holder.innerHTML = `
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
        <div class="lg:col-span-8">
            <h3 class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">About this session</h3>
            <div class="prose prose-slate max-w-none prose-p:text-slate-600 prose-headings:text-slate-800">${linkify(desc || '')}</div>
        </div>
        <div class="lg:col-span-4 space-y-6">
            <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <h4 class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Access</h4>
                ${accessCard}
            </div>
            <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <h4 class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Speakers</h4>
                <div class="space-y-4">${speakerList.length ? speakerList.join('') : '<span class="text-sm text-slate-400 italic">TBA</span>'}</div>
            </div>
            <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-sm space-y-4">
                <div><h4 class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Language</h4><div class="text-sm font-semibold text-slate-800">${ev.language === 'bi' ? 'English & Spanish' : (ev.language === 'es' ? 'Español' : 'English')}</div></div>
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
    if (!authState.session) { setFlash(tr('auth.required')); return; }
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

    // --- THREADS SUBSCRIPTION ---
    if (currentThreadsChannel) supabase.removeChannel(currentThreadsChannel);
    currentThreadsChannel = supabase.channel(`threads-${eventId}`).on('postgres_changes', {event:'*', schema:'public', table:'threads', filter:`event_id=eq.${eventId}`}, loadAndRenderThreads).subscribe();
    
    // --- COMMENTS SUBSCRIPTION ---
    if (currentCommentsChannel) supabase.removeChannel(currentCommentsChannel);
    currentCommentsChannel = supabase.channel(`comments-${eventId}`).on('postgres_changes', {event:'*', schema:'public', table:'comments', filter:`event_id=eq.${eventId}`}, () => {
        if(state.selectedThreadId) loadCommentsForThread(state.selectedThreadId);
    }).subscribe();

    // --- UPDATED: FILES SUBSCRIPTION ---
    if (currentFilesChannel) supabase.removeChannel(currentFilesChannel);
    currentFilesChannel = supabase.channel(`files-${eventId}`)
      .on(
        'postgres_changes', 
        {
          event: '*', 
          schema: 'public', 
          table: 'attachments', 
          filter: `event_id=eq.${eventId}`
        }, 
        () => {
          // Auto-reload files list on INSERT or DELETE from other users
          loadAndRenderFiles();
        }
      )
      .subscribe();

    $('.tab-link[data-tab="description"]')?.click();
  }

  async function selectThread(threadId) {
    state.selectedThreadId = threadId;
    renderThreads(); // update active state
    hide($('#thread-welcome')); show($('#threadDetailView'));
    loadCommentsForThread(threadId);
  }

  // --- GLOBAL EVENT LISTENERS ---
  $('#newThreadForm')?.addEventListener('submit', handleNewThread);
  $('#replyToThreadForm')?.addEventListener('submit', handleNewComment);
  $('#fileInput')?.addEventListener('change', handleFileUpload);
  
  // --- UPDATED: FILE LISTENER (Correctly placed here) ---
  $('#filesList')?.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-delete-file]');
      if (!btn) return;

      e.preventDefault();
      
      const fileId = btn.dataset.deleteFile;
      const filePath = btn.dataset.filePath;
      
      await deleteFile(fileId, filePath, btn);
  });

  $('#threadsList')?.addEventListener('click', e => {
      // Dropdown logic
      const menuBtn = e.target.closest('[data-thread-menu]');
      if(menuBtn) {
          e.stopPropagation();
          const id = menuBtn.dataset.threadMenu;
          const dd = document.querySelector(`[data-thread-dropdown="${id}"]`);
          $$('.thread-actions-dropdown').forEach(d => d !== dd && d.classList.add('hidden')); // close others
          if(dd) dd.classList.toggle('hidden');
          return;
      }
      // Actions
      const editBtn = e.target.closest('[data-edit-thread]');
      if(editBtn) { e.stopPropagation(); handleEditThread(editBtn.dataset.editThread); document.querySelectorAll('[data-thread-dropdown]').forEach(d=>d.classList.add('hidden')); return; }
      
      const pinBtn = e.target.closest('[data-toggle-pin-thread]');
      if(pinBtn) { e.stopPropagation(); handleTogglePinThread(pinBtn.dataset.togglePinThread); document.querySelectorAll('[data-thread-dropdown]').forEach(d=>d.classList.add('hidden')); return; }

      const delBtn = e.target.closest('[data-delete-thread]');
      if(delBtn) { e.stopPropagation(); handleDeleteThread(delBtn.dataset.deleteThread); document.querySelectorAll('[data-thread-dropdown]').forEach(d=>d.classList.add('hidden')); return; }

      // Select
      const row = e.target.closest('[data-thread-id]');
      if(row) {
           document.querySelectorAll('[data-thread-dropdown]').forEach(d=>d.classList.add('hidden'));
           selectThread(row.dataset.threadId);
      }
  });

  // Close thread dropdowns on click outside
  document.addEventListener('click', e => {
      if(!e.target.closest('.thread-actions-menu')) $$('[data-thread-dropdown]').forEach(d=>d.classList.add('hidden'));
  });

  // Comment Actions (Delegated)
  $('#commentsList')?.addEventListener('click', async e => {
      const replyBtn = e.target.closest('[data-reply-to]');
      const editBtn = e.target.closest('[data-edit-comment]');
      const delBtn = e.target.closest('[data-delete-comment]');
      const likeBtn = e.target.closest('[data-like-comment]');
      const profileBtn = e.target.closest('[data-open-profile]');
      const cancelBtn = e.target.closest('[data-cancel-edit]');

      if(profileBtn) { openProfilePopover(profileBtn.dataset.openProfile, profileBtn); return; }

      if(replyBtn) {
          const parentId = replyBtn.dataset.replyTo;
          const name = replyBtn.dataset.replyName;
          const form = $('#replyToThreadForm');
          form.dataset.parentId = parentId;
          const oldInd = form.querySelector('.reply-indicator'); if(oldInd) oldInd.remove();
          const ind = document.createElement('div');
          ind.className = 'reply-indicator flex justify-between items-center px-3 py-1 text-xs bg-slate-100 text-slate-500 border-b border-slate-200';
          ind.innerHTML = `<span>Replying to <b>${name}</b></span><button type="button">&times;</button>`;
          form.insertBefore(ind, form.firstChild);
          ind.querySelector('button').onclick = () => { delete form.dataset.parentId; ind.remove(); };
          form.querySelector('input').focus();
          return;
      }

      if(likeBtn) {
          const id = likeBtn.dataset.likeComment;
          if(!authState.profile) return;
          const c = state.comments.find(c => c.id === id);
          if(c && c.liked_by_me) await supabase.from('comment_likes').delete().match({comment_id:id, profile_id:authState.profile.id});
          else await supabase.from('comment_likes').insert({comment_id:id, profile_id:authState.profile.id});
          // Realtime update will refresh UI
          return;
      }

      if(editBtn) {
          const root = editBtn.closest('[data-comment-root]');
          root.querySelector('.comment-content').classList.add('hidden');
          root.querySelector('.comment-edit-form').classList.remove('hidden');
          return;
      }

      if(cancelBtn) {
          const root = cancelBtn.closest('[data-comment-root]');
          root.querySelector('.comment-content').classList.remove('hidden');
          root.querySelector('.comment-edit-form').classList.add('hidden');
          return;
      }

      if(delBtn) {
          if(confirm('Delete this comment?')) {
              await supabase.from('comments').delete().eq('id', delBtn.dataset.deleteComment);
              loadCommentsForThread(state.selectedThreadId);
          }
      }
  });

  // Edit Comment Submit
  $('#commentsList')?.addEventListener('submit', async e => {
      if(e.target.matches('.comment-edit-form')) {
          e.preventDefault();
          const id = e.target.dataset.editFormFor;
          const txt = e.target.querySelector('textarea').value.trim();
          if(!txt) return;
          await supabase.from('comments').update({content:txt, updated_at: new Date().toISOString()}).eq('id', id);
          loadCommentsForThread(state.selectedThreadId);
      }
  });

  return { openEvent, reRender, selectThread };
}