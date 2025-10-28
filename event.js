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

  // Live channels
  let currentCommentsChannel = null;
  let currentThreadsChannel = null;
  let currentFilesChannel = null;
  let currentLikesChannel = null;
  let currentRSVPFollowsChannel = null;

  // Polling fallback (in case Realtime is disabled/misconfigured)
  let commentsPollInterval = null;

  // Simple in-memory cache for profiles
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

  // --- FILES ---

  async function loadAndRenderFiles() {
    if (!state.selectedEvent) return;
    const { data, error } = await supabase
      .from('attachments')
      .select('id, event_id, thread_id, comment_id, bucket_id, object_path, file_name, file_type, file_size, created_by, created_at, creator:profiles!attachments_created_by_fkey(id, full_name)')
      .eq('event_id', state.selectedEvent.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error("Error fetching files:", error);
      return;
    }
    state.files = data || [];
    renderFiles();
  }

  function renderFiles() {
    const listEl = $('#filesList');
    const emptyEl = $('#emptyFiles');
    if (!listEl || !emptyEl) return;

    if (!state.files || state.files.length === 0) {
      hide(listEl);
      show(emptyEl);
      return;
    }

    show(listEl);
    hide(emptyEl);

    listEl.innerHTML = state.files.map(file => {
      const bucketName = file.bucket_id || 'attachments';
      const { data: urlData } = supabase.storage.from(bucketName).getPublicUrl(file.object_path);
      const isUploader = authState.profile?.id === file.created_by;
      const isAdmin = isOrganizerOrAdmin();
      return `
        <div class="flex items-center justify-between p-4 bg-slate-100/80 rounded-2xl animate-fade-in" data-file-id="${file.id}">
          <div class="flex items-center gap-4 min-w-0">
            <div class="w-12 h-12 bg-white rounded-lg flex items-center justify-center border border-slate-200 shadow-sm">
              <i data-lucide="file-text" class="w-6 h-6 text-slate-500"></i>
            </div>
            <div class="min-w-0">
              <p class="font-semibold text-slate-800 truncate">${escapeHtml(file.file_name)}</p>
              <p class="text-xs text-slate-500">${bytesToSize(file.file_size)} • Uploaded by ${escapeHtml(file.creator?.full_name || 'Anonymous')}</p>
            </div>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0">
            ${(isUploader || isAdmin) ? `<button class="p-2 text-slate-400 hover:bg-red-100 hover:text-red-600 rounded-lg transition-colors" data-delete-file="${file.id}" data-file-path="${file.object_path}" data-bucket="${bucketName}"><i data-lucide="trash-2" class="w-4 h-4"></i></button>` : ''}
            <a href="${urlData.publicUrl}" download="${escapeHtml(file.file_name)}" class="px-4 py-2 bg-white text-sm font-semibold rounded-lg shadow-sm border border-slate-200 hover:bg-slate-50 transition-colors" data-i18n="files.download">Download</a>
          </div>
        </div>`;
    }).join('');
    lucideRefresh();
    if (typeof applyI18n === 'function') applyI18n();
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
    
    const { error: uploadError } = await supabase.storage
      .from('attachments')
      .upload(filePath, file);
      
    if (uploadError) { 
      setFlash(tr('errors.upload') || 'Upload failed', 4000); 
      console.error('Upload error:', uploadError); 
      return; 
    }
    
    const { error: insertError } = await supabase.from('attachments').insert({
      event_id: state.selectedEvent.id,
      created_by: authState.session.user.id,
      bucket_id: 'attachments',
      object_path: filePath,
      file_name: file.name,
      file_size: file.size,
      file_type: file.type
    });
    
    if (insertError) { 
      setFlash(tr('errors.upload') || 'Upload failed', 4000); 
      console.error('DB insert error:', insertError); 
    } else { 
      setFlash('Upload complete!', 3000); 
    }
    
    e.target.value = '';
  }

  async function deleteFile(fileId, filePath, btn) {
    if (!confirm(tr('files.delete_confirm') || 'Delete this file?')) return;
    
    const bucketName = btn.dataset.bucket || 'attachments';
    
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin"></i>`;
    lucideRefresh();
    
    const { error: storageError } = await supabase.storage
      .from(bucketName)
      .remove([filePath]);
      
    if (storageError) {
      setFlash(tr('errors.delete') || 'Delete failed', 4000);
      console.error('Storage delete error:', storageError);
      btn.innerHTML = `<i data-lucide="trash-2" class="w-4 h-4"></i>`;
      lucideRefresh();
      btn.disabled = false;
      return;
    }
    
    const { error: dbError } = await supabase
      .from('attachments')
      .delete()
      .eq('id', fileId);
      
    if (dbError) { 
      setFlash(tr('errors.delete') || 'Delete failed', 4000); 
      console.error('DB delete error:', dbError); 
    }
  }

  // --- THREADS ---

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
          return {
            ...t,
            created_by_profile: { ...t.created_by_profile, public_avatar_url: cached.public_avatar_url, full_name: cached.full_name }
          };
        }
      }
      return t;
    }));

    state.threads = enriched || [];
    renderThreads();
  }

  function canManageThread(thread) {
    if (!authState.profile) return false;
    const isCreator = thread.created_by === authState.profile.id;
    const isAdmin = isOrganizerOrAdmin();
    return isCreator || isAdmin;
  }

  function renderThreads() {
    const listEl = $('#threadsList');
    if (!listEl) return;
    if (!state.threads || state.threads.length === 0) {
      listEl.innerHTML = `<div class="p-4 text-center text-sm text-slate-500" data-i18n="thread.empty">No threads yet.</div>`;
      if (typeof applyI18n === 'function') applyI18n();
      return;
    }
    listEl.innerHTML = state.threads.map(thread => {
      const isActive = String(thread.id) === String(state.selectedThreadId);
      const name = formatName(thread.created_by_profile);
      const userInitial = initialLetter(name);
      const pinnedBadge = thread.pinned ? `<span class="ml-2 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700"><i data-lucide="pin" class="w-3 h-3"></i> Pinned</span>` : '';
      const avatar = thread.created_by_profile?.public_avatar_url
        ? `<img src="${thread.created_by_profile.public_avatar_url}" alt="${escapeHtml(name)}" class="w-full h-full object-cover">`
        : userInitial;

      const canManage = canManageThread(thread);
      const actionsMenu = canManage ? `
        <div class="relative thread-actions-menu flex-shrink-0">
          <button class="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors" data-thread-menu="${thread.id}" aria-label="Thread actions">
            <i data-lucide="more-vertical" class="w-4 h-4"></i>
          </button>
          <div class="thread-actions-dropdown hidden absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-50 min-w-[140px]" data-thread-dropdown="${thread.id}">
            <button class="w-full text-left px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2" data-edit-thread="${thread.id}">
              <i data-lucide="edit-2" class="w-3.5 h-3.5"></i> Edit
            </button>
            <button class="w-full text-left px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2" data-toggle-pin-thread="${thread.id}">
              <i data-lucide="${thread.pinned ? 'pin-off' : 'pin'}" class="w-3.5 h-3.5"></i> ${thread.pinned ? 'Unpin' : 'Pin'}
            </button>
            <button class="w-full text-left px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 flex items-center gap-2" data-delete-thread="${thread.id}">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i> Delete
            </button>
          </div>
        </div>
      ` : '';

      return `
        <div class="flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-colors ${isActive ? 'bg-brand-50 ring-1 ring-brand-200' : 'hover:bg-slate-100'}" data-thread-row="${thread.id}">
          <div class="flex-shrink-0 w-9 h-9 bg-slate-200 rounded-full flex items-center justify-center font-bold text-slate-600 text-sm overflow-hidden" data-thread-id="${thread.id}">
            ${avatar}
          </div>
          <div class="flex-1 min-w-0" data-thread-id="${thread.id}">
            <p class="font-semibold text-sm text-slate-800 truncate">${escapeHtml(thread.title)} ${pinnedBadge}</p>
            <p class="text-xs text-slate-500">By ${escapeHtml(name)}</p>
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
    if (error) { setFlash('Failed to create thread.'); console.error(error); }
    else { input.value = ''; await loadAndRenderThreads(); selectThread(data.id); }
  }

  async function handleEditThread(threadId) {
    const thread = state.threads?.find(t => t.id === threadId);
    if (!thread || !canManageThread(thread)) return;

    const newTitle = prompt('Edit thread title:', thread.title);
    if (!newTitle || newTitle.trim() === '' || newTitle === thread.title) return;

    const { error } = await supabase
      .from('threads')
      .update({ 
        title: newTitle.trim(),
        updated_at: new Date().toISOString()
      })
      .eq('id', threadId);

    if (error) {
      setFlash('Failed to update thread.');
      console.error('Thread update error:', error);
    } else {
      setFlash('Thread updated!', 2000);
      await loadAndRenderThreads();
    }
  }

  async function handleTogglePinThread(threadId) {
    const thread = state.threads?.find(t => t.id === threadId);
    if (!thread || !canManageThread(thread)) return;

    const { error } = await supabase
      .from('threads')
      .update({ 
        pinned: !thread.pinned,
        updated_at: new Date().toISOString()
      })
      .eq('id', threadId);

    if (error) {
      setFlash('Failed to update thread.');
      console.error('Thread pin error:', error);
    } else {
      setFlash(thread.pinned ? 'Thread unpinned!' : 'Thread pinned!', 2000);
      await loadAndRenderThreads();
    }
  }

  async function handleDeleteThread(threadId) {
    const thread = state.threads?.find(t => t.id === threadId);
    if (!thread || !canManageThread(thread)) return;

    if (!confirm(`Are you sure you want to delete the thread "${thread.title}"? This will also delete all comments in this thread.`)) return;

    const { error } = await supabase
      .from('threads')
      .delete()
      .eq('id', threadId);

    if (error) {
      setFlash('Failed to delete thread.');
      console.error('Thread delete error:', error);
    } else {
      setFlash('Thread deleted!', 2000);
      if (String(state.selectedThreadId) === String(threadId)) {
        state.selectedThreadId = null;
        hide($('#threadDetailView'));
        show($('#thread-welcome'));
      }
      await loadAndRenderThreads();
    }
  }

  // --- COMMENTS (LIVE CHAT) ---

  async function loadCommentsForThread(threadId) {
    const { data, error } = await supabase
      .from('comments')
      .select(`
        id, event_id, thread_id, parent_id, content, created_by, created_at, updated_at,
        author:profiles!comments_created_by_fkey(id, username, full_name, affiliation, avatar_url)
      `)
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true });

    const listEl = $('#commentsList');

    if (error) {
      console.error("Error fetching comments:", error);
      if (listEl) listEl.innerHTML = '<div class="text-center text-red-500 p-4">Error loading comments.</div>';
      return;
    }

    for (const c of (data || [])) {
      if (c.author?.id) {
        const cached = await ensureProfileInCache(c.author.id);
        if (cached) c.author = { ...cached };
        else {
          const public_avatar_url = c.author?.avatar_url ? await getAvatarUrl(c.author.avatar_url) : null;
          c.author = { ...c.author, public_avatar_url };
          profileCache.set(c.author.id, c.author);
        }
      }
    }

    state.comments = data || [];

    const ids = state.comments.map(c => c.id);
    if (ids.length) {
      const { data: likes, error: likesErr } = await supabase
        .from('comment_likes')
        .select('comment_id, profile_id')
        .in('comment_id', ids);
      if (!likesErr && Array.isArray(likes)) {
        const counts = {};
        const likedByMe = new Set();
        likes.forEach(l => {
          counts[l.comment_id] = (counts[l.comment_id] || 0) + 1;
          if (l.profile_id === authState.profile?.id) likedByMe.add(l.comment_id);
        });
        state.comments = state.comments.map(c => ({ ...c, likes_count: counts[c.id] || 0, liked_by_me: likedByMe.has(c.id) }));
      }
    } else {
      state.comments = state.comments.map(c => ({ ...c, likes_count: 0, liked_by_me: false }));
    }

    renderComments();
  }

  function subscribeToEventComments(eventId) {
    if (currentCommentsChannel) { supabase.removeChannel(currentCommentsChannel); currentCommentsChannel = null; }

    currentCommentsChannel = supabase
      .channel(`comments-for-event-${eventId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'comments', filter: `event_id=eq.${eventId}` },
        async (payload) => {
          const newRow = payload.new;
          const shouldStickToBottom = nearBottom();

          if (String(newRow.thread_id) !== String(state.selectedThreadId)) return;
          if (state.comments?.some(c => c.id === newRow.id)) return;

          const { data, error } = await supabase
            .from('comments')
            .select(`
              id, event_id, thread_id, parent_id, content, created_by, created_at, updated_at,
              author:profiles!comments_created_by_fkey(id, username, full_name, affiliation, avatar_url)
            `)
            .eq('id', newRow.id)
            .single();
          if (error || !data) return;

          if (data.author?.id) {
            const cached = await ensureProfileInCache(data.author.id);
            if (cached) data.author = cached;
            else {
              data.author.public_avatar_url = data.author.avatar_url ? await getAvatarUrl(data.author.avatar_url) : null;
              profileCache.set(data.author.id, data.author);
            }
          }
          data.likes_count = 0;
          data.liked_by_me = false;

          state.comments.push(data);
          renderComments();
          if (shouldStickToBottom || data.created_by === authState.profile?.id) scrollToLatest(true);
        }
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'comments', filter: `event_id=eq.${eventId}` },
        (payload) => {
          const upd = payload.new;
          if (String(upd.thread_id) !== String(state.selectedThreadId)) return;
          const idx = state.comments?.findIndex(c => c.id === upd.id);
          if (idx != null && idx !== -1) {
            state.comments[idx] = { ...state.comments[idx], content: upd.content, updated_at: upd.updated_at };
            updateSingleCommentDom(upd.id);
          }
        }
      )
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'comments', filter: `event_id=eq.${eventId}` },
        (payload) => {
          const removed = payload.old;
          if (String(removed.thread_id) !== String(state.selectedThreadId)) return;
          const removeIds = new Set([removed.id]);
          let changed = true;
          while (changed) {
            changed = false;
            (state.comments || []).forEach(c => {
              if (c.parent_id && removeIds.has(c.parent_id) && !removeIds.has(c.id)) {
                removeIds.add(c.id);
                changed = true;
              }
            });
          }
          state.comments = (state.comments || []).filter(c => !removeIds.has(c.id));
          renderComments();
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log(`✅ Realtime channel subscribed for comments in event ${eventId}`);
        }
        if (status === 'CHANNEL_ERROR') {
          console.error(`❌ Realtime channel error for comments:`, err);
        }
      });
  }

  function subscribeToLikes() {
    if (currentLikesChannel) { supabase.removeChannel(currentLikesChannel); currentLikesChannel = null; }
    currentLikesChannel = supabase
      .channel(`comment-likes-live`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comment_likes' }, (payload) => {
        const affectedCommentId = payload.new?.comment_id ?? payload.old?.comment_id;
        if (!affectedCommentId) return;
        const idx = state.comments?.findIndex(c => c.id === affectedCommentId);
        if (idx === -1 || idx == null) return;

        const currentUserId = authState.profile?.id;
        if (payload.eventType === 'INSERT') {
          state.comments[idx].likes_count = (state.comments[idx].likes_count || 0) + 1;
          if (payload.new.profile_id === currentUserId) state.comments[idx].liked_by_me = true;
        } else if (payload.eventType === 'DELETE') {
          state.comments[idx].likes_count = Math.max(0, (state.comments[idx].likes_count || 0) - 1);
          if (payload.old.profile_id === currentUserId) state.comments[idx].liked_by_me = false;
        }
        updateLikeDom(affectedCommentId);
      })
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log(`✅ Realtime channel subscribed for all comment likes.`);
        }
        if (status === 'CHANNEL_ERROR') {
          console.error(`❌ Realtime channel error for likes:`, err);
        }
      });
  }

  function updateLikeDom(commentId) {
    const data = state.comments?.find(c => c.id === commentId);
    const row = document.querySelector(`[data-comment-root="${commentId}"]`);
    if (!row || !data) return;
    const likeBtn = row.querySelector('[data-like-comment]');
    const likeCount = row.querySelector('[data-like-count]');
    if (likeBtn) {
      if (data.liked_by_me) {
        likeBtn.classList.add('text-rose-600', 'fill-current');
      } else {
        likeBtn.classList.remove('text-rose-600', 'fill-current');
      }
      likeBtn.setAttribute('aria-pressed', data.liked_by_me ? 'true' : 'false');
    }
    if (likeCount) likeCount.textContent = data.likes_count || 0;
    lucideRefresh();
  }

  function updateSingleCommentDom(commentId) {
    const comment = state.comments?.find(c => c.id === commentId);
    if (!comment) return;
    const root = document.querySelector(`[data-comment-root="${commentId}"]`);
    if (!root) return;
    const contentEl = root.querySelector('.comment-content');
    if (contentEl) contentEl.innerHTML = linkify(comment.content);
    const metaEl = root.querySelector('.comment-meta');
    if (metaEl) metaEl.textContent = timeMeta(comment.created_at, comment.updated_at);
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
      : `<span class="font-bold text-slate-600">${initialLetter(name)}</span>`;

    const likeActive = c.liked_by_me ? 'text-rose-600 fill-current' : 'text-slate-400';
    const likesCount = Number(c.likes_count || 0);

    return `
      <div class="flex items-start gap-4" data-comment-root="${c.id}">
        <button class="flex-shrink-0 w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center overflow-hidden hover:ring-2 hover:ring-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-400 transition" data-open-profile="${user?.id || ''}" aria-label="Open profile">
          ${avatarHtml}
        </button>
        <div class="flex-1 min-w-0">
          <div class="bg-white border border-slate-200 shadow-sm rounded-xl rounded-tl-none p-3">
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-2 min-w-0">
                <button class="text-sm font-semibold text-slate-900 hover:text-brand-700 truncate" data-open-profile="${user?.id || ''}">${escapeHtml(name)}</button>
                <span class="comment-meta text-[11px] text-slate-400 whitespace-nowrap">${timeMeta(c.created_at, c.updated_at)}</span>
              </div>
              <div class="flex items-center gap-2 text-xs text-slate-400">
                <button class="flex items-center gap-1 hover:text-rose-600 transition-colors ${likeActive}" data-like-comment="${c.id}" aria-pressed="${c.liked_by_me ? 'true' : 'false'}" title="Like">
                  <i data-lucide="heart" class="w-4 h-4"></i>
                  <span data-like-count>${likesCount}</span>
                </button>
              </div>
            </div>
            <div class="comment-content prose prose-sm mt-2 text-slate-700">${linkify(c.content)}</div>
            <form class="comment-edit-form hidden mt-2" data-edit-form-for="${c.id}">
              <textarea class="w-full bg-white border border-slate-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500" required>${escapeHtml(c.content)}</textarea>
              <div class="flex justify-end gap-2 mt-2">
                <button type="button" class="text-xs font-semibold text-slate-600 px-3 py-1 rounded-md hover:bg-slate-200 transition-colors" data-cancel-edit>Cancel</button>
                <button type="submit" class="text-xs font-semibold text-white bg-brand-600 px-3 py-1 rounded-md hover:bg-brand-700 transition-colors">Save</button>
              </div>
            </form>
          </div>
          <div class="actions text-xs font-bold text-slate-400 flex items-center gap-3 px-3 pt-1">
            <button class="hover:text-brand-600 transition-colors" data-reply-to="${c.id}" data-reply-name="${escapeHtml(name)}">Reply</button>
            ${isOwner ? `<button class="hover:text-brand-600 transition-colors" data-edit-comment="${c.id}">Edit</button>` : ''}
            ${(isOwner || isAdmin) ? `<button class="hover:text-red-600 transition-colors" data-delete-comment="${c.id}">Delete</button>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  function renderComments() {
    const listEl = $('#commentsList');
    if (!listEl) return;
    if (!state.comments || state.comments.length === 0) {
      listEl.innerHTML = `<div class="text-center text-slate-500 py-8">No comments yet.</div><div id="commentsBottomAnchor"></div>`;
      lucideRefresh();
      return;
    }

    const byParent = buildCommentsByParent();

    const buildTree = (parentId) => {
      const arr = byParent[parentId] || [];
      return arr.map(c => {
        const children = buildTree(c.id);
        return `
          <li class="group">
            ${createCommentHtml(c)}
            ${children.length ? `<ul class="space-y-4 pl-8 lg:pl-14 pt-4 border-l-2 border-slate-200 ml-5">${children.join('')}</ul>` : ''}
          </li>
        `;
      });
    };

    listEl.innerHTML = `<ul class="space-y-4">${buildTree('root').join('')}</ul><div id="commentsBottomAnchor"></div>`;
    lucideRefresh();
  }

  async function handleNewComment(e) {
    e.preventDefault();
    const form = e.target;
    const input = form.querySelector('input, textarea');
    const content = input.value.trim();
    const parentId = form.dataset.parentId || null;
    if (!content) return;

    const optimisticShouldScroll = nearBottom();

    input.disabled = true;
    const { error } = await supabase.from('comments').insert({
      content,
      thread_id: state.selectedThreadId,
      created_by: authState.session.user.id,
      event_id: state.selectedEvent.id,
      parent_id: parentId
    });
    input.disabled = false;

    if (error) { setFlash('Failed to post comment.'); console.error(error); }
    else {
      input.value = '';
      input.focus();
      clearReplyState(form);
      if (optimisticShouldScroll) setTimeout(() => scrollToLatest(true), 50);
    }
  }

  function clearReplyState(form) {
    delete form.dataset.parentId;
    const replyIndicator = form.querySelector('.reply-indicator');
    if (replyIndicator) replyIndicator.remove();
  }

  // --- PROFILE POPOVER ---

  let profilePopoverEl = null;

  function ensurePopoverEl() {
    if (profilePopoverEl) return profilePopoverEl;
    const el = document.createElement('div');
    el.id = 'profileQuickPopover';
    el.className = 'fixed z-[999] bg-white border border-slate-200 shadow-xl rounded-2xl p-3 w-72 hidden';
    el.style.pointerEvents = 'auto';
    el.innerHTML = `
      <div class="flex items-center gap-3">
        <div class="w-12 h-12 rounded-full bg-slate-200 overflow-hidden" id="pp-avatar"></div>
        <div class="min-w-0">
          <div class="font-semibold text-slate-900 truncate" id="pp-name"></div>
          <div class="text-xs text-slate-500 truncate" id="pp-affiliation"></div>
        </div>
      </div>
      <div class="mt-3 flex items-center gap-2">
        <a id="pp-view" class="px-3 py-1.5 text-sm font-semibold rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition-colors">View Profile</a>
        <button id="pp-close" class="ml-auto text-slate-400 hover:text-slate-600 p-1" aria-label="Close"><i data-lucide="x" class="w-4 h-4"></i></button>
      </div>
    `;
    document.body.appendChild(el);
    profilePopoverEl = el;

    document.addEventListener('click', (e) => {
      if (profilePopoverEl.classList.contains('hidden')) return;
      if (!profilePopoverEl.contains(e.target) && !e.target.closest('[data-open-profile]')) {
        hidePopover();
      }
    });

    window.addEventListener('resize', hidePopover);
    window.addEventListener('scroll', () => {
      if (!profilePopoverEl.classList.contains('hidden')) hidePopover();
    });

    return el;
  }

  function hidePopover() {
    if (!profilePopoverEl) return;
    profilePopoverEl.classList.add('hidden');
  }

  async function openProfilePopover(profileId, anchorEl) {
    const el = ensurePopoverEl();
    const profile = await ensureProfileInCache(profileId);
    if (!profile) return;

    const avatar = el.querySelector('#pp-avatar');
    avatar.innerHTML = profile.public_avatar_url
      ? `<img src="${profile.public_avatar_url}" alt="" class="w-full h-full object-cover">`
      : `<div class="w-full h-full grid place-items-center text-lg font-bold text-slate-600">${initialLetter(formatName(profile))}</div>`;
    el.querySelector('#pp-name').textContent = formatName(profile);
    el.querySelector('#pp-affiliation').textContent = profile.affiliation || '';

    const viewLink = el.querySelector('#pp-view');
    viewLink.href = `profile.html?user=${profile.id}`;
    el.querySelector('#pp-close').onclick = hidePopover;

    const rect = anchorEl.getBoundingClientRect();
    const margin = 8;
    const top = rect.bottom + margin + window.scrollY;
    let left = rect.left + window.scrollX - 8;
    el.style.top = `${top}px`;
    el.style.left = `${left}px`;

    el.classList.remove('hidden');
    lucideRefresh();

    const bounds = el.getBoundingClientRect();
    const overflow = (bounds.right + 12) - window.innerWidth;
    if (overflow > 0) {
      left = left - overflow;
      el.style.left = `${left}px`;
    }
  }

  // --- EVENT HEADER & TABS ---

  function renderEventHeader() {
    const ev = state.selectedEvent;
    if (!ev) return;
    const title = state.language === "es" && ev.title_es ? ev.title_es : ev.title_en;
    const headerContainer = $('#compactEventHeaderContainer');

    headerContainer.innerHTML = `
      <button id="back-to-schedule" class="p-3 text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors shrink-0">
        <i data-lucide="arrow-left" class="w-5 h-5"></i>
      </button>
      <div class="min-w-0">
        <h2 class="font-display font-bold text-xl text-slate-900 truncate" title="${escapeHtml(title)}">${escapeHtml(title)}</h2>
        <p class="text-sm text-slate-500 font-medium">${fmtDateTime(ev.start_time)}</p>
      </div>
      <div class="ml-auto flex items-center gap-2">
        <button id="followBtn" class="px-4 py-2 text-sm font-semibold rounded-lg shadow-sm border border-slate-200 hover:bg-slate-50 transition-colors flex items-center gap-2">
          <i data-lucide="star" class="w-4 h-4 text-slate-400"></i> <span data-i18n="follow">Follow</span>
        </button>
        <select id="rsvpSelect" class="px-4 py-2 text-sm font-semibold rounded-lg shadow-sm border border-slate-200 hover:bg-slate-50 transition-colors appearance-none bg-white">
          <option value="not_going" data-i18n="rsvp.notgoing">Not Going</option>
          <option value="interested" data-i18n="rsvp.interested">Interested</option>
          <option value="going" data-i18n="rsvp.going">Going</option>
        </select>
      </div>
    `;

    setTimeout(() => {
      const backBtn = $('#back-to-schedule');
      const followBtn = $('#followBtn');
      const rsvpSelect = $('#rsvpSelect');

      if (backBtn) backBtn.onclick = () => showView('schedule');
      
      if (followBtn) {
        followBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          toggleFollow(ev.id);
        };
      }
      
      if (rsvpSelect) {
        rsvpSelect.onchange = (e) => updateRSVP(ev.id, e.target.value);
      }

      loadRSVPFollow(ev.id);
    }, 0);

    lucideRefresh();
    if (typeof applyI18n === 'function') applyI18n();
  }

  function updateFollowButtonUI(isFollowing) {
    const followBtn = $('#followBtn');
    if (!followBtn) {
      console.warn('Follow button not found in DOM');
      return;
    }
    
    const starIcon = followBtn.querySelector('i[data-lucide="star"]');
    const textSpan = followBtn.querySelector('span');
    
    if (isFollowing) {
      followBtn.classList.add('bg-amber-50', 'border-amber-200', 'text-amber-800');
      followBtn.classList.remove('border-slate-200', 'hover:bg-slate-50');
      if (starIcon) {
        starIcon.classList.add('fill-current', 'text-amber-500');
        starIcon.classList.remove('text-slate-400');
      }
      if (textSpan) textSpan.textContent = 'Following';
    } else {
      followBtn.classList.remove('bg-amber-50', 'border-amber-200', 'text-amber-800');
      followBtn.classList.add('border-slate-200', 'hover:bg-slate-50');
      if (starIcon) {
        starIcon.classList.remove('fill-current', 'text-amber-500');
        starIcon.classList.add('text-slate-400');
      }
      if (textSpan) textSpan.textContent = 'Follow';
    }
    
    lucideRefresh();
  }

  async function loadRSVPFollow(eventId) {
    if (!authState.profile) return;
  
    const { data: rsvpData, error: rsvpError } = await supabase
        .from('event_rsvps')
        .select('status')
        .eq('event_id', eventId)
        .eq('profile_id', authState.profile.id)
        .maybeSingle();

    const { data: followData, error: followError } = await supabase
        .from('event_follows')
        .select('id')
        .eq('event_id', eventId)
        .eq('profile_id', authState.profile.id)
        .maybeSingle();

    if (rsvpError) console.error('RSVP fetch error:', rsvpError);
    if (followError) console.error('Follow fetch error:', followError);

    state.rsvpStatus = rsvpData?.status || 'not_going';
    const rsvpSelect = $('#rsvpSelect');
    if (rsvpSelect) rsvpSelect.value = state.rsvpStatus;

    state.isFollowing = !!followData;
    updateFollowButtonUI(state.isFollowing);
  }

  async function updateRSVP(eventId, status) {
    if (!authState.profile) return;
    
    const { error } = await supabase.from('event_rsvps').upsert(
        { event_id: eventId, profile_id: authState.profile.id, status: status },
        { onConflict: 'event_id, profile_id' }
    );

    if (error) {
        setFlash('Failed to update RSVP');
        console.error("RSVP update error:", error);
    } else {
        setFlash('RSVP updated!');
        state.rsvpStatus = status;
    }
  }

  async function toggleFollow(eventId) {
    if (!authState.profile) {
      setFlash('Please sign in to follow events');
      return;
    }

    const originalFollowingState = state.isFollowing;
    const newFollowingState = !originalFollowingState;

    state.isFollowing = newFollowingState;
    updateFollowButtonUI(newFollowingState);

    try {
      let result;
      if (originalFollowingState) {
        result = await supabase
          .from('event_follows')
          .delete()
          .match({ 
            event_id: eventId, 
            profile_id: authState.profile.id 
          });
      } else {
        result = await supabase
          .from('event_follows')
          .insert({ 
            event_id: eventId, 
            profile_id: authState.profile.id 
          });
      }

      if (result.error) {
        throw result.error;
      }

      setFlash(newFollowingState ? 'Following event!' : 'Unfollowed event', 2000);
      
    } catch (error) {
      console.error('Follow toggle error:', error);
      setFlash('Failed to update follow status', 3000);
      
      state.isFollowing = originalFollowingState;
      updateFollowButtonUI(originalFollowingState);
    }
  }

  function renderDescriptionTab() {
    const ev = state.selectedEvent;
    if (!ev) return;
    const desc = state.language === "es" && ev.description_es ? ev.description_es : ev.description_en;
    const holder = $('#tab_description');
    if (holder) holder.innerHTML = `<div class="prose prose-lg prose-slate max-w-none prose-headings:font-display prose-a:text-brand-600">${linkify(desc || '')}</div>`;
  }

  function reRender() {
    if (!state.selectedEvent) return;
    renderEventHeader();
    renderDescriptionTab();
    renderThreads();
    renderComments();
    renderFiles();
  }

  // --- MAIN CONTROLLER ---

  async function openEvent(eventId) {
    if (!authState.session) { setFlash(tr('auth.required') || 'Please sign in'); return; }
    const event = state.events.find(e => String(e.id) === String(eventId));
    if (!event) return;
    state.selectedEvent = event;
    state.selectedThreadId = null;

    if (currentThreadsChannel) { supabase.removeChannel(currentThreadsChannel); currentThreadsChannel = null; }
    if (currentCommentsChannel) { supabase.removeChannel(currentCommentsChannel); currentCommentsChannel = null; }
    if (currentFilesChannel) { supabase.removeChannel(currentFilesChannel); currentFilesChannel = null; }
    if (currentLikesChannel) { supabase.removeChannel(currentLikesChannel); currentLikesChannel = null; }
    if (currentRSVPFollowsChannel) { supabase.removeChannel(currentRSVPFollowsChannel); currentRSVPFollowsChannel = null; }
    if (commentsPollInterval) { clearInterval(commentsPollInterval); commentsPollInterval = null; }

    showView('event');
    window.history.pushState({ event: eventId }, '', `?event=${eventId}`);
    hide($('#threadDetailView'));
    show($('#thread-welcome'));
    renderEventHeader();
    renderDescriptionTab();

    await loadAndRenderThreads();
    await loadAndRenderFiles();

    subscribeToEventComments(eventId);
    subscribeToLikes();

    if (authState.profile?.id) {
      currentRSVPFollowsChannel = supabase
        .channel(`interactions-for-event-${eventId}-user-${authState.profile.id}`)
        .on('postgres_changes', 
          { 
            event: '*', 
            schema: 'public', 
            table: 'event_follows', 
            filter: `event_id=eq.${eventId}` 
          }, 
          async (payload) => {
            if (payload.new?.profile_id === authState.profile.id || 
                payload.old?.profile_id === authState.profile.id) {
              await loadRSVPFollow(eventId);
            }
          }
        )
        .on('postgres_changes', 
          { 
            event: '*', 
            schema: 'public', 
            table: 'event_rsvps', 
            filter: `event_id=eq.${eventId}` 
          }, 
          async (payload) => {
            if (payload.new?.profile_id === authState.profile.id || 
                payload.old?.profile_id === authState.profile.id) {
              await loadRSVPFollow(eventId);
            }
          }
        )
        .subscribe((status, err) => {
          if (status === 'SUBSCRIBED') {
            console.log(`✅ Realtime subscribed for RSVP/follows on event ${eventId}`);
          }
          if (status === 'CHANNEL_ERROR') {
            console.error(`❌ Realtime error for RSVP/follows:`, err);
          }
        });
    }

    currentThreadsChannel = supabase
      .channel(`threads-for-event-${eventId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'threads', filter: `event_id=eq.${eventId}` }, () => loadAndRenderThreads())
      .subscribe();

    currentFilesChannel = supabase
      .channel(`files-for-event-${eventId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attachments', filter: `event_id=eq.${eventId}` }, () => loadAndRenderFiles())
      .subscribe();

    commentsPollInterval = setInterval(() => {
      if (state.selectedThreadId) loadCommentsForThread(state.selectedThreadId);
    }, 12000);

    $('.tab-link[data-tab="description"]')?.click();
  }

  async function selectThread(threadId) {
    if (!threadId) return;

    $('.tab-link[data-tab="discussion"]')?.click();

    state.selectedThreadId = threadId;
    renderThreads();

    hide($('#thread-welcome'));
    show($('#threadDetailView'));

    const listEl = $('#commentsList');
    if (listEl) {
      listEl.innerHTML = `<div class="p-8 flex justify-center"><div class="w-8 h-8 border-4 border-slate-200 border-t-brand-600 rounded-full animate-spin"></div></div>`;
    }

    await loadCommentsForThread(threadId);

    setTimeout(() => scrollToLatest(false), 0);
  }

  // --- EVENT LISTENERS ---

  $('#commentsList').addEventListener('click', async (e) => {
    const replyBtn = e.target.closest('[data-reply-to]');
    const editBtn = e.target.closest('[data-edit-comment]');
    const deleteBtn = e.target.closest('[data-delete-comment]');
    const cancelBtn = e.target.closest('[data-cancel-edit]');
    const profileBtn = e.target.closest('[data-open-profile]');
    const likeBtn = e.target.closest('[data-like-comment]');

    if (profileBtn) {
      const profileId = profileBtn.dataset.openProfile;
      if (profileId) openProfilePopover(profileId, profileBtn);
      return;
    }

    if (likeBtn) {
      const commentId = likeBtn.dataset.likeComment;
      const me = authState.profile?.id;
      if (!me) { setFlash('Please sign in to like messages.'); return; }
      const comment = (state.comments || []).find(c => c.id === commentId);
      if (!comment) return;
      if (comment.liked_by_me) {
        const { error } = await supabase.from('comment_likes').delete().match({ comment_id: commentId, profile_id: me });
        if (error) console.error('Failed to unlike', error);
      } else {
        const { error } = await supabase.from('comment_likes').insert({ comment_id: commentId, profile_id: me });
        if (error) console.error('Failed to like', error);
      }
      return;
    }

    if (replyBtn) {
      const commentId = replyBtn.dataset.replyTo;
      const replyName = replyBtn.dataset.replyName;
      const mainForm = $('#replyToThreadForm');

      clearReplyState(mainForm);
      mainForm.dataset.parentId = commentId;

      const indicator = document.createElement('div');
      indicator.className = 'reply-indicator text-xs text-slate-500 font-semibold mb-1 flex justify-between items-center px-2';
      indicator.innerHTML = `<span>Replying to ${replyName}</span><button type="button" class="font-bold text-lg leading-none px-1" aria-label="Cancel reply">&times;</button>`;
      mainForm.prepend(indicator);
      indicator.querySelector('button').onclick = () => clearReplyState(mainForm);
      mainForm.querySelector('input, textarea')?.focus();
      return;
    }

    if (editBtn) {
      const commentId = editBtn.dataset.editComment;
      const commentEl = document.querySelector(`[data-comment-root="${commentId}"]`);
      commentEl?.querySelector('.comment-content')?.classList.add('hidden');
      commentEl?.querySelector('.comment-edit-form')?.classList.remove('hidden');
      return;
    }

    if (cancelBtn) {
      const commentEl = cancelBtn.closest('[data-comment-root]');
      commentEl?.querySelector('.comment-content')?.classList.remove('hidden');
      commentEl?.querySelector('.comment-edit-form')?.classList.add('hidden');
      return;
    }

    if (deleteBtn) {
      const commentId = deleteBtn.dataset.deleteComment;
      if (confirm('Are you sure you want to delete this comment?')) {
        const { error } = await supabase.from('comments').delete().eq('id', commentId);
        if (error) { setFlash('Failed to delete comment.'); console.error(error); }
      }
      return;
    }
  });

  $('#commentsList').addEventListener('submit', async (e) => {
    if (e.target.matches('.comment-edit-form')) {
      e.preventDefault();
      const form = e.target;
      const commentId = form.dataset.editFormFor;
      const content = form.querySelector('textarea').value.trim();
      if (!content) return;

      const { error } = await supabase.from('comments').update({
        content,
        updated_at: new Date().toISOString()
      }).eq('id', commentId);

      if (error) {
        setFlash('Failed to update comment.');
        console.error(error);
      } else {
        const comment = (state.comments || []).find(c => c.id === commentId);
        if (comment) {
          comment.content = content;
          comment.updated_at = new Date().toISOString();
        }
        const commentEl = document.querySelector(`[data-comment-root="${commentId}"]`);
        commentEl?.querySelector('.comment-content')?.classList.remove('hidden');
        commentEl?.querySelector('.comment-edit-form')?.classList.add('hidden');
        updateSingleCommentDom(commentId);
      }
    }
  });

  $('#threadsList').addEventListener('click', (e) => {
    // Handle thread menu toggle
    const menuBtn = e.target.closest('[data-thread-menu]');
    if (menuBtn) {
      e.stopPropagation();
      const threadId = menuBtn.dataset.threadMenu;
      const dropdown = document.querySelector(`[data-thread-dropdown="${threadId}"]`);
      
      // Close all other dropdowns
      document.querySelectorAll('.thread-actions-dropdown').forEach(d => {
        if (d !== dropdown) d.classList.add('hidden');
      });
      
      if (dropdown) {
        dropdown.classList.toggle('hidden');
      }
      return;
    }

    // Handle thread actions
    const editBtn = e.target.closest('[data-edit-thread]');
    const pinBtn = e.target.closest('[data-toggle-pin-thread]');
    const deleteBtn = e.target.closest('[data-delete-thread]');

    if (editBtn) {
      e.stopPropagation();
      const threadId = editBtn.dataset.editThread;
      handleEditThread(threadId);
      // Close dropdown
      document.querySelectorAll('.thread-actions-dropdown').forEach(d => d.classList.add('hidden'));
      return;
    }

    if (pinBtn) {
      e.stopPropagation();
      const threadId = pinBtn.dataset.togglePinThread;
      handleTogglePinThread(threadId);
      // Close dropdown
      document.querySelectorAll('.thread-actions-dropdown').forEach(d => d.classList.add('hidden'));
      return;
    }

    if (deleteBtn) {
      e.stopPropagation();
      const threadId = deleteBtn.dataset.deleteThread;
      handleDeleteThread(threadId);
      // Close dropdown
      document.querySelectorAll('.thread-actions-dropdown').forEach(d => d.classList.add('hidden'));
      return;
    }

    // Handle thread selection (only if not clicking on actions)
    const el = e.target.closest('[data-thread-id]');
    if (el) {
      // Close any open dropdowns
      document.querySelectorAll('.thread-actions-dropdown').forEach(d => d.classList.add('hidden'));
      selectThread(el.dataset.threadId);
    }
  });

  // Close thread dropdowns when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.thread-actions-menu')) {
      document.querySelectorAll('.thread-actions-dropdown').forEach(d => d.classList.add('hidden'));
    }
  });

  $('#newThreadForm').addEventListener('submit', handleNewThread);
  $('#replyToThreadForm').addEventListener('submit', handleNewComment);
  $('#fileInput').addEventListener('change', handleFileUpload);
  $('#filesList').addEventListener('click', (e) => {
    const el = e.target.closest('[data-delete-file]');
    if (el) deleteFile(el.dataset.deleteFile, el.dataset.filePath, el);
  });

  window.debugFollow = () => {
    console.log('Current follow state:', state.isFollowing);
    console.log('Follow button:', $('#followBtn'));
    console.log('Auth profile:', authState.profile);
    console.log('Selected event:', state.selectedEvent);
  };

  return { openEvent, reRender, selectThread };
}