// This module encapsulates all logic for the event detail view.
// It is initialized by a host page (like index.html or archive.html)
// and provides functions to open and manage the event detail display.

let supabase, authState, fetchProfile, tr, state, $, setFlash, fmtDateTime, escapeHtml, linkify, bytesToSize, showView, listViewName;
let eventRealtimeChannel = null;

// --- UTILITY FUNCTIONS ---
function colorFromString(str = "") {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 70% 45%)`;
}

function accentFromId(id = "") {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = (hash << 5) - hash + id.charCodeAt(i);
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue} 70% 50%)`;
}

// --- PERMISSION CHECKING FUNCTIONS ---
function canEditThread(thread) {
  const uid = authState.session?.user?.id;
  if (!uid) return false;
  if (thread.created_by === uid) return true;
  return ["organizer", "admin"].includes(authState.profile?.role);
}

function canDeleteThread(thread) {
  const uid = authState.session?.user?.id;
  if (!uid) return false;
  if (thread.created_by === uid) return true;
  return ["organizer", "admin"].includes(authState.profile?.role);
}

function canEditComment(comment) {
  const uid = authState.session?.user?.id;
  if (!uid) return false;
  if (comment.created_by === uid) return true;
  return ["organizer", "admin"].includes(authState.profile?.role);
}

function canDeleteComment(comment) {
  const uid = authState.session?.user?.id;
  if (!uid) return false;
  if (comment.created_by === uid) return true;
  return ["organizer", "admin"].includes(authState.profile?.role);
}

function canDeleteFile(file) {
  const uid = authState.session?.user?.id;
  if (!uid) return false;
  if (file.created_by === uid) return true;
  return ["organizer", "admin"].includes(authState.profile?.role);
}

// --- DATA & REALTIME ---
function cleanupSubscriptions() {
  if (eventRealtimeChannel) {
    supabase.removeChannel(eventRealtimeChannel);
    eventRealtimeChannel = null;
  }
}

function subscribeToEventChanges(eventId) {
  cleanupSubscriptions();
  eventRealtimeChannel = supabase.channel(`event-${eventId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'attachments', filter: `event_id=eq.${eventId}` }, () => loadFiles(eventId))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'event_follows', filter: `event_id=eq.${eventId}` }, () => loadRSVPFollow(eventId))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'event_rsvps', filter: `event_id=eq.${eventId}` }, () => loadRSVPFollow(eventId))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'threads', filter: `event_id=eq.${eventId}` }, () => loadThreads(eventId))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'comments', filter: `event_id=eq.${eventId}` }, () => {
      if (state.selectedThreadId) {
        loadComments(state.selectedThreadId);
      }
    })
    .subscribe();
}

async function loadRSVPFollow(eventId) {
  state.rsvpStatus = null; 
  state.isFollowing = false; 
  state.counts = { followers: 0, going: 0, interested: 0 };
  
  const { data: countsData } = await supabase.rpc('get_event_counts', { event_id_param: eventId });
  if (countsData) { 
    state.counts.followers = countsData.followers_count; 
    state.counts.going = countsData.going_count; 
    state.counts.interested = countsData.interested_count; 
  }
  
  if (authState.session) {
    const uid = authState.session.user.id;
    const [{ data: myFollow }, { data: myRsvp }] = await Promise.all([
      supabase.from("event_follows").select("id").eq("event_id", eventId).eq("profile_id", uid).maybeSingle(),
      supabase.from("event_rsvps").select("status").eq("event_id", eventId).eq("profile_id", uid).maybeSingle()
    ]);
    state.isFollowing = !!myFollow;
    state.rsvpStatus = myRsvp?.status || null;
  }
  renderEventHeader();
}

async function loadThreads(eventId) {
  const { data } = await supabase
    .from("threads")
    .select("*, comments(count), profiles(*)")
    .eq("event_id", eventId)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false });
    
  state.threads = data || [];
  
  for (const th of state.threads) {
    if (th.profiles) {
      if (th.profiles.avatar_url) {
        const { data: urlData } = await supabase.storage.from("avatars").createSignedUrl(th.profiles.avatar_url, 3600);
        if (urlData?.signedUrl) {
          th.profiles.avatar_url = urlData.signedUrl;
        }
      }
      authState.profileCache.set(th.created_by, th.profiles);
    } else {
      await fetchProfile(th.created_by);
    }
  }
  renderThreads();
}

async function loadComments(threadId) {
    if (!threadId) return;
    
    const commentsContainer = $("#commentsList");
    const scrollPos = commentsContainer ? commentsContainer.scrollTop : 0;
    
    const { data } = await supabase
      .from("comments")
      .select("*")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });
      
    state.comments = data || [];
    const userIds = [...new Set(state.comments.map(c => c.created_by))];
    await Promise.all(userIds.map(id => fetchProfile(id)));
    renderComments();
    
    if (commentsContainer) {
        commentsContainer.scrollTop = scrollPos;
    }
}

async function loadFiles(eventId) {
  const { data } = await supabase
    .from("attachments")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });
    
  state.files = data || [];
  renderFiles();
}

// --- RENDERING ---
function renderEventHeader() {
  const ev = state.selectedEvent; 
  if (!ev) return;
  const container = $("#compactEventHeaderContainer");
  if (!container) return;

  const title = state.language === "es" && ev.title_es ? ev.title_es : ev.title_en;

  let speakersHtml = "";
  if (ev.event_speakers && ev.event_speakers.length > 0) {
    const speakersSorted = [...ev.event_speakers].sort((a, b) => (b.primary_speaker === true) - (a.primary_speaker === true));
    const speakerPills = speakersSorted.map(s => {
      const col = colorFromString(s.name || "");
      return `
        <li class="speaker-pill" style="--spk-color:${col}">
          <span class="speaker-name">${escapeHtml(s.name)} ${s.primary_speaker ? '⭐' : ''}</span>
          ${s.affiliation ? `<span class="speaker-affiliation">${escapeHtml(s.affiliation)}</span>` : ''}
        </li>
      `;
    }).join("");

    speakersHtml = `
      <div class="event-speakers">
        <div style="font-weight:600; font-size: .9rem; color: var(--color-text-muted); margin-bottom: .2rem;">${tr('speakers')}</div>
        <ul class="speaker-list">${speakerPills}</ul>
      </div>
    `;
  }

  const metaHtml = `
    <div class="sidebar-meta">
      <div>🗓️ ${fmtDateTime(ev.start_time)}</div>
      ${ev.host_org ? `<div>🏢 ${escapeHtml(ev.host_org)}</div>` : ""}
      <div>🌐 ${(ev.language || "bi").toUpperCase()}</div>
    </div>
  `;

  const tagsHtml = `
    <div class="sidebar-tags">
      ${(ev.topic_tags || []).map(tag => `<span class="tag-topic">#${escapeHtml(tag)}</span>`).join("")}
    </div>
  `;

  const zoomHtml = (authState.session && ev.zoom_url) ? `
    <div class="zoom-inline">
      <a href="${ev.zoom_url}" target="_blank" rel="noopener" class="btn-primary">🔗 ${tr('join_zoom')}</a>
      <button class="btn-ghost" data-copy-link="${ev.zoom_url}" aria-label="${tr('copy_link')}">📋</button>
    </div>
  ` : "";

  const actionsHtml = `
    <div class="event-actions-row">
      <button class="chip ${state.rsvpStatus === 'going' ? 'active' : ''}" data-rsvp="going">${tr('rsvp.going')}</button>
      <button class="chip ${state.rsvpStatus === 'interested' ? 'active' : ''}" data-rsvp="interested">${tr('rsvp.interested')}</button>
      <button class="chip ${state.rsvpStatus === 'not_going' ? 'active' : ''}" data-rsvp="not_going">${tr('rsvp.notgoing')}</button>
      <button id="btnFollowCompact" class="chip ${state.isFollowing ? 'active' : ''}" style="display: ${authState.session ? 'inline-flex' : 'none'}">${tr('follow')}</button>
      <span class="event-counts" style="margin-left:auto; font-size:.8rem; color:var(--color-text-muted); display:flex; gap:.5rem;">
        <span class="count">${state.counts.followers} ${tr("labels.followers")}</span>
        <span class="count">${state.counts.going} ${tr("labels.going")}</span>
        <span class="count">${state.counts.interested} ${tr("labels.interested")}</span>
      </span>
    </div>
  `;

  container.innerHTML = `
    <div class="sidebar-title-row">
      <h2 class="event-title">${escapeHtml(title)}</h2>
      <button class="btn-pill" id="backToList">← ${tr(`back.${listViewName}`)}</button>
    </div>
    ${metaHtml}
    ${speakersHtml}
    ${tagsHtml}
    ${zoomHtml}
    ${actionsHtml}
  `;
}

function renderDescriptionTab() {
  const ev = state.selectedEvent;
  const el = $("#descriptionContent");
  if (!el) return;
  const desc = state.language === "es" && ev?.description_es ? ev.description_es : ev?.description_en || "";
  const extraLinks = [];
  if (ev?.registration_url) extraLinks.push(`<a href="${escapeHtml(ev.registration_url)}" target="_blank" rel="noopener">📝 Registration</a>`);
  if (ev?.livestream_url) extraLinks.push(`<a href="${escapeHtml(ev.livestream_url)}" target="_blank" rel="noopener">📺 Livestream</a>`);
  if (ev?.recording_url) extraLinks.push(`<a href="${escapeHtml(ev.recording_url)}" target="_blank" rel="noopener">🎥 Recording</a>`);
  el.innerHTML = `
    ${desc ? `<div>${linkify(desc)}</div>` : `<div class="text-muted">No description provided.</div>`}
    ${extraLinks.length ? `<div style="margin-top:.8rem; display:flex; gap:.6rem; flex-wrap:wrap;">${extraLinks.join("")}</div>` : ""}
  `;
}

function renderThreads() {
  const list = $("#threadsList");
  if (!list) return;
  list.innerHTML = "";

  if (!state.threads.length) {
    list.innerHTML = `<div class="empty" data-i18n="thread.empty">${tr('thread.empty')}</div>`;
  }

  for (const th of state.threads) {
    const author = authState.profileCache.get(th.created_by);
    const authorName = author?.full_name || author?.username || '...';
    const initial = authorName.charAt(0).toUpperCase();
    const canEdit = canEditThread(th);
    const canDelete = canDeleteThread(th);
    const isOrganizer = ["organizer", "admin"].includes(authState.profile?.role);

    const item = document.createElement("div");
    item.className = "thread-list-item";
    if (th.id === state.selectedThreadId) item.classList.add('active');

    item.innerHTML = `
      <div class="thread-content" data-thread-open="${th.id}">
        <div class="avatar-circle">${initial}</div>
        <div class="thread-info">
          <div class="title" id="thread-title-${th.id}">${th.pinned ? "📌 " : ""}${escapeHtml(th.title)}</div>
          <div class="meta">${th.comments[0].count} replies • by ${escapeHtml(authorName)}</div>
        </div>
      </div>
      <div class="thread-actions">
        ${canEdit ? `<button class="btn-icon" data-edit-thread="${th.id}" title="${state.language === 'es' ? 'Editar' : 'Edit'}">✏️</button>` : ""}
        ${canDelete ? `<button class="btn-icon" data-del-thread="${th.id}" title="${state.language === 'es' ? 'Eliminar' : 'Delete'}">🗑️</button>` : ""}
        ${isOrganizer ? `<button class="btn-icon" data-pin-thread="${th.id}" data-pinned="${th.pinned ? "1" : "0"}" title="${th.pinned ? (state.language === 'es' ? 'Desfijar' : 'Unpin') : (state.language === 'es' ? 'Fijar' : 'Pin')}">📌</button>` : ""}
      </div>
    `;
    
    // Open thread on content click
    item.querySelector('[data-thread-open]').addEventListener('click', () => openThread(th.id));
    
    // Edit thread
    item.querySelectorAll("[data-edit-thread]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const titleEl = item.querySelector(`#thread-title-${th.id}`);
        const currentTitle = th.title;
        
        // Create inline edit form
        const editForm = document.createElement('div');
        editForm.className = 'inline-edit-form';
        editForm.innerHTML = `
          <input type="text" value="${escapeHtml(currentTitle)}" class="edit-input" />
          <button class="btn-icon save-btn">✅</button>
          <button class="btn-icon cancel-btn">❌</button>
        `;
        
        titleEl.style.display = 'none';
        titleEl.parentNode.insertBefore(editForm, titleEl.nextSibling);
        
        const input = editForm.querySelector('.edit-input');
        input.focus();
        input.select();
        
        const saveEdit = async () => {
          const newTitle = input.value.trim();
          if (newTitle && newTitle !== currentTitle) {
            const { error } = await supabase
              .from("threads")
              .update({ title: newTitle })
              .eq("id", th.id);
              
            if (error) {
              setFlash(state.language === "es" ? "Error al actualizar" : "Update error");
            } else {
              await loadThreads(state.selectedEvent.id);
            }
          } else {
            editForm.remove();
            titleEl.style.display = '';
          }
        };
        
        editForm.querySelector('.save-btn').addEventListener('click', saveEdit);
        editForm.querySelector('.cancel-btn').addEventListener('click', () => {
          editForm.remove();
          titleEl.style.display = '';
        });
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') saveEdit();
          if (e.key === 'Escape') {
            editForm.remove();
            titleEl.style.display = '';
          }
        });
      });
    });
    
    // Delete thread
    item.querySelectorAll("[data-del-thread]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const confirmMsg = state.language === "es" 
          ? "¿Eliminar este tema y todos sus comentarios?"
          : "Delete this topic and all its comments?";
        
        if (!confirm(confirmMsg)) return;
        
        const { error } = await supabase
          .from("threads")
          .delete()
          .eq("id", btn.dataset.delThread);
          
        if (error) {
          console.error("Delete thread error:", error);
          setFlash(state.language === "es" ? "Error al eliminar" : "Delete error");
        } else {
          if (state.selectedThreadId === btn.dataset.delThread) {
            state.selectedThreadId = null;
            showDiscussionView('welcome');
          }
          await loadThreads(state.selectedEvent.id);
        }
      });
    });
    
    // Pin/unpin thread
    item.querySelectorAll("[data-pin-thread]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.pinThread;
        const next = btn.dataset.pinned !== "1";
        const { error } = await supabase
          .from("threads")
          .update({ pinned: next })
          .eq("id", id);
        if (error) {
          setFlash(error.message);
        } else {
          await loadThreads(state.selectedEvent.id);
        }
      });
    });
    
    list.appendChild(item);
  }
}

function createCommentNode(comment, commentsByParentId, depth = 0) {
    const profile = authState.profileCache.get(comment.created_by);
    const authorName = profile?.full_name || profile?.username || '...';
    const initial = authorName.charAt(0).toUpperCase();
    const children = commentsByParentId.get(comment.id) || [];
    const accent = accentFromId(comment.created_by);
    const canEdit = canEditComment(comment);
    const canDelete = canDeleteComment(comment);

    const node = document.createElement('div');
    node.className = `comment-node depth-${depth}`;
    node.style.setProperty('--accent', accent);

    const avatarHtml = profile?.avatar_url
        ? `<img src="${profile.avatar_url}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" alt="${escapeHtml(authorName)}" />`
        : initial;

    node.innerHTML = `
        <div class="comment-main">
            ${depth > 0 ? `<span class="thread-dot" aria-hidden="true"></span>` : ''}
            <div class="comment-author">
                <div class="avatar-circle comment-avatar" data-user-id="${comment.created_by}" title="Open profile" style="${profile?.avatar_url ? '' : `background: color-mix(in oklab, ${accent} 22%, var(--color-surface-strong))`}">
                    ${avatarHtml}
                </div>
                <strong class="author-name" data-open-profile-id="${comment.created_by}" title="Open profile">${escapeHtml(authorName)}</strong>
                <span class="timestamp">• ${fmtDateTime(comment.created_at)}</span>
                <span class="comment-action-buttons" style="margin-left: 0.5rem; opacity: 1;">
                  ${canEdit ? `<button class="btn-icon" data-edit-comment="${comment.id}" title="${state.language === 'es' ? 'Editar' : 'Edit'}">✏️</button>` : ''}
                  ${canDelete ? `<button class="btn-icon" data-del-comment="${comment.id}" title="${state.language === 'es' ? 'Eliminar' : 'Delete'}">🗑️</button>` : ''}
                </span>
            </div>
            <div class="comment-body-wrapper">
                <div class="comment-bubble">
                    <div class="comment-text" id="comment-text-${comment.id}">${linkify(comment.content)}</div>
                </div>
                <div class="comment-actions">
                    <button class="btn-ghost" data-reply-id="${comment.id}">💬 ${tr('reply', 'Reply')}</button>
                </div>
            </div>
            <div class="comment-replies"></div>
        </div>
    `;

    // Edit comment handler
    node.querySelectorAll('[data-edit-comment]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const textEl = node.querySelector(`#comment-text-${comment.id}`);
        const currentContent = comment.content;
        
        // Create inline edit form
        const editForm = document.createElement('div');
        editForm.className = 'inline-edit-form';
        editForm.innerHTML = `
          <textarea class="edit-textarea">${escapeHtml(currentContent)}</textarea>
          <div class="edit-buttons">
            <button class="btn-icon save-btn">✅</button>
            <button class="btn-icon cancel-btn">❌</button>
          </div>
        `;
        
        textEl.style.display = 'none';
        textEl.parentNode.insertBefore(editForm, textEl.nextSibling);
        
        const textarea = editForm.querySelector('.edit-textarea');
        textarea.focus();
        textarea.select();
        
        const saveEdit = async () => {
          const newContent = textarea.value.trim();
          if (newContent && newContent !== currentContent) {
            const { error } = await supabase
              .from("comments")
              .update({ content: newContent })
              .eq("id", comment.id);
              
            if (error) {
              setFlash(state.language === "es" ? "Error al actualizar" : "Update error");
            } else {
              await loadComments(state.selectedThreadId);
            }
          } else {
            editForm.remove();
            textEl.style.display = '';
          }
        };
        
        editForm.querySelector('.save-btn').addEventListener('click', saveEdit);
        editForm.querySelector('.cancel-btn').addEventListener('click', () => {
          editForm.remove();
          textEl.style.display = '';
        });
        textarea.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') {
            editForm.remove();
            textEl.style.display = '';
          }
        });
      });
    });

    // Delete comment handler
    node.querySelectorAll('[data-del-comment]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const confirmMsg = state.language === 'es' 
          ? '¿Eliminar este comentario?'
          : 'Delete this comment?';
        
        if (!confirm(confirmMsg)) return;
        
        const { error } = await supabase
          .from('comments')
          .delete()
          .eq('id', btn.dataset.delComment);
          
        if (error) {
          console.error('Delete comment error:', error);
          setFlash(state.language === 'es' ? "Error al eliminar" : "Delete error");
        } else {
          await loadComments(state.selectedThreadId);
        }
      });
    });

    // Reply handler
    const replyBtn = node.querySelector(`[data-reply-id]`);
    if (replyBtn) {
      replyBtn.addEventListener('click', (e) => {
        const parentId = e.target.closest('[data-reply-id]').dataset.replyId;
        const existingForm = node.querySelector('.inline-reply-form');
        if (existingForm) {
            existingForm.remove();
            return;
        }

        const formContainer = document.createElement('div');
        formContainer.className = 'inline-reply-form';
        formContainer.innerHTML = `
          <form class="inline-form">
              <input type="text" placeholder="${state.language === 'es' ? `Respondiendo a ${escapeHtml(authorName)}...` : `Replying to ${escapeHtml(authorName)}...`}" required />
              <button type="submit" class="btn-primary">${tr('reply', 'Reply')}</button>
          </form>
        `;

        formContainer.querySelector('form').addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const input = ev.target.querySelector('input');
            const content = input.value.trim();
            if (content) {
                await createComment(state.selectedThreadId, parentId, content);
                await loadComments(state.selectedThreadId);
            }
        });
        node.querySelector('.comment-body-wrapper').insertAdjacentElement('afterend', formContainer);
        formContainer.querySelector('input').focus();
      });
    }

    const repliesContainer = node.querySelector('.comment-replies');
    for (const child of children) {
        repliesContainer.appendChild(createCommentNode(child, commentsByParentId, depth + 1));
    }

    return node;
}

function renderComments() {
    const container = $(`#commentsList`);
    if (!container) return;
    container.innerHTML = "";

    const commentsByParentId = new Map();
    for (const comment of state.comments) {
        const parentId = comment.parent_id || 'root';
        if (!commentsByParentId.has(parentId)) {
            commentsByParentId.set(parentId, []);
        }
        commentsByParentId.get(parentId).push(comment);
    }

    const rootComments = commentsByParentId.get('root') || [];
    for (const comment of rootComments) {
        container.appendChild(createCommentNode(comment, commentsByParentId, 0));
    }
}

async function renderFiles() {
  const grid = $("#filesList"), empty = $("#emptyFiles");
  if (!grid || !empty) return;
  grid.innerHTML = "";
  empty.style.display = state.files.length ? "none" : "block";

  for (const f of state.files) {
    const div = document.createElement("div");
    div.className = "file";
    div.dataset.fileId = f.id;

    const url = await getSignedUrl(f.object_path);
    const canDelete = canDeleteFile(f);
    const profile = authState.profileCache.get(f.created_by);
    const uploaderName = profile?.full_name || profile?.username || 'User';

    div.innerHTML = `
      <div class="file-card">
        <div class="file-icon">📎</div>
        <div class="file-info">
          <div class="file-name">${escapeHtml(f.file_name)}</div>
          <div class="file-meta">
            <span class="file-size">${bytesToSize(f.file_size)}</span>
            <span class="file-uploader">• ${uploaderName}</span>
            <span class="file-date">• ${fmtDateTime(f.created_at)}</span>
          </div>
        </div>
        <div class="file-actions">
          ${url ? `
            <a class="btn-secondary" href="${url}" target="_blank" rel="noopener">
              ${state.language === "es" ? "Descargar" : "Download"}
            </a>
          ` : ''}
          ${canDelete ? `
            <button class="btn-icon" data-del-file-id="${f.id}" title="${state.language === 'es' ? 'Eliminar' : 'Delete'}">
              🗑️
            </button>
          ` : ""}
        </div>
      </div>
    `;
    
    grid.appendChild(div);
  }
}

// --- ACTIONS & INTERACTIONS ---
async function createThread(title) {
  if (!title || !state.selectedEvent) return;
  const { data } = await supabase
    .from("threads")
    .insert({ 
      event_id: state.selectedEvent.id, 
      title, 
      created_by: authState.session.user.id 
    })
    .select()
    .single();
  await loadThreads(state.selectedEvent.id);
  if (data) openThread(data.id);
}

async function createComment(thread_id, parent_id, content) {
  await supabase
    .from("comments")
    .insert({ 
      event_id: state.selectedEvent.id, 
      thread_id, 
      parent_id, 
      content, 
      created_by: authState.session.user.id 
    });
}

async function uploadFile(file) {
  if (!file || !state.selectedEvent) return;
  const eventId = state.selectedEvent.id;
  const userId = authState.session.user.id;
  
  const uniqueName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
  const object_path = `events/${eventId}/${userId}/${uniqueName}`;

  const { data: uploadData, error: upErr } = await supabase.storage
    .from("attachments")
    .upload(object_path, file, { 
      upsert: false,
      cacheControl: '3600'
    });
    
  if (upErr) {
    console.error("Upload error:", upErr);
    setFlash(
      state.language === "es" 
        ? `Error al subir archivo: ${upErr.message}`
        : `Upload failed: ${upErr.message}`
    );
    return;
  }

  const { error: dbErr } = await supabase
    .from("attachments")
    .insert({ 
      event_id: eventId, 
      bucket_id: "attachments", 
      object_path, 
      file_name: file.name, 
      file_type: file.type, 
      file_size: file.size, 
      created_by: userId 
    });
    
  if (dbErr) {
    await supabase.storage.from("attachments").remove([object_path]);
    setFlash(
      state.language === "es" 
        ? `Error al guardar archivo: ${dbErr.message}`
        : `Error saving file: ${dbErr.message}`
    );
    return;
  }
  
  setFlash(state.language === "es" ? "Archivo subido" : "File uploaded");
  await loadFiles(eventId);
}

async function getSignedUrl(path) {
  const { data, error } = await supabase.storage
    .from("attachments")
    .createSignedUrl(path, 3600);
  if (error) {
    console.error("Error getting signed URL:", error);
    return null;
  }
  return data?.signedUrl;
}

async function deleteFile(id) {
  const file = state.files.find(f => f.id === id);
  if (!file) return;
  
  const confirmMsg = state.language === "es" 
    ? "¿Eliminar este archivo?"
    : "Delete this file?";
  
  if (!confirm(confirmMsg)) return;
  
  try {
    const { error: storageErr } = await supabase.storage
      .from("attachments")
      .remove([file.object_path]);
    
    if (storageErr) {
      console.error("Storage deletion error:", storageErr);
    }
    
    const { error: dbErr } = await supabase
      .from("attachments")
      .delete()
      .eq("id", id);
    
    if (dbErr) {
      console.error("Database deletion error:", dbErr);
      setFlash(state.language === "es" ? "Error al eliminar" : "Delete error");
      return;
    }
    
    await loadFiles(state.selectedEvent.id);
    
  } catch (error) {
    console.error("Delete file error:", error);
    setFlash(state.language === "es" ? "Error al eliminar" : "Delete error");
  }
}

async function toggleFollow() {
  if (!authState.session || !state.selectedEvent) return;
  const uid = authState.session.user.id;
  const eventId = state.selectedEvent.id;
  
  state.isFollowing = !state.isFollowing;
  renderEventHeader();
  
  if (!state.isFollowing) {
    await supabase.from("event_follows").delete().eq("event_id", eventId).eq("profile_id", uid);
  } else {
    await supabase.from("event_follows").insert({ event_id: eventId, profile_id: uid });
  }
  
  await loadRSVPFollow(eventId);
}

async function setRSVP(status) {
  if (!authState.session || !state.selectedEvent) return;
  const uid = authState.session.user.id;
  const eventId = state.selectedEvent.id;
  
  const previousStatus = state.rsvpStatus;
  
  if (previousStatus === status) return;
  
  state.rsvpStatus = status;
  renderEventHeader();
  
  await supabase.from("event_rsvps").upsert({ 
    event_id: eventId, 
    profile_id: uid, 
    status 
  }, { onConflict: "event_id,profile_id" });
  
  await loadRSVPFollow(eventId);
  
  setFlash(tr('rsvp.saved'));
}

// --- VIEW MANAGEMENT ---
function setActiveTab(name) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
  document.querySelectorAll(".tab-panel").forEach((p) => (p.style.display = "none"));
  const tabBtn = document.querySelector(`.tab[data-tab="${name}"]`);
  const panel = document.querySelector(`#tab_${name}`);
  if (tabBtn) tabBtn.classList.add("active");
  if (panel) panel.style.display = "flex";
}

function showDiscussionView(view) {
  if (view === 'detail') {
    $("#thread-welcome").style.display = 'none';
    $("#threadDetailView").style.display = 'flex';
  } else {
    $("#thread-welcome").style.display = 'grid';
    $("#threadDetailView").style.display = 'none';
  }
}

async function openThread(threadId) {
  state.selectedThreadId = threadId;
  showDiscussionView('detail');
  renderThreads();
  await loadComments(threadId);
  setActiveTab('discussion');
}

async function openEvent(eventId) {
  if (!authState.session) {
    setFlash(tr('auth.required'));
    return;
  }

  const { data: ev, error } = await supabase
    .from('events')
    .select('*, event_speakers(*)')
    .eq('id', eventId)
    .single();

  if (error || !ev) {
    console.error("Failed to fetch event details", error);
    setFlash("Could not load event.", true);
    return;
  }

  state.selectedEvent = ev;
  state.selectedThreadId = null;
  showDiscussionView('welcome');
  subscribeToEventChanges(ev.id);
  await Promise.all([loadThreads(ev.id), loadFiles(ev.id), loadRSVPFollow(ev.id)]);
  renderEventHeader();
  renderDescriptionTab();
  setActiveTab('description');
  showView("event");

  const url = new URL(window.location.href);
  url.searchParams.set("event", ev.id);
  history.replaceState(null, "", url.toString());
}

// --- UI WIRING ---
function wireEventDetailUI() {
    $("#eventDetail").addEventListener('click', (e) => {
        const backBtn = e.target.closest('#backToList');
        if (backBtn) {
          cleanupSubscriptions();
          showView(listViewName);
          const url = new URL(window.location.href);
          url.searchParams.delete("event");
          url.searchParams.delete("e");
          history.replaceState(null, "", url.toString());
          return;
        }
        
        const followBtn = e.target.closest('#btnFollowCompact'); 
        if (followBtn) { 
          toggleFollow(); 
          return; 
        }
        
        const rsvpBtn = e.target.closest('[data-rsvp]'); 
        if (rsvpBtn) { 
          setRSVP(rsvpBtn.dataset.rsvp); 
          return; 
        }
        
        const delFileBtn = e.target.closest('[data-del-file-id]'); 
        if (delFileBtn) { 
          deleteFile(delFileBtn.dataset.delFileId); 
          return; 
        }
        
        const copyBtn = e.target.closest('[data-copy-link]'); 
        if (copyBtn) { 
          navigator.clipboard.writeText(copyBtn.dataset.copyLink); 
          setFlash(tr('copied')); 
          return; 
        }

        const profileEl = e.target.closest('[data-open-profile-id], .comment-avatar[data-user-id]');
        if (profileEl) {
          const userId = profileEl.dataset.openProfileId || profileEl.dataset.userId;
          if (userId) window.location.href = `profile.html?user=${userId}`;
        }
    });

    document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => {
        setActiveTab(tab.dataset.tab);
    }));

    $("#newThreadForm")?.addEventListener("submit", async (e) => { 
      e.preventDefault(); 
      const title = $("#threadTitle")?.value.trim(); 
      if (title) { 
        await createThread(title); 
        $("#threadTitle").value = ""; 
      } 
    });
    
    $("#replyToThreadForm")?.addEventListener("submit", async (e) => {
        e.preventDefault(); 
        const textarea = e.target.querySelector("textarea"); 
        const content = textarea.value.trim();
        if (content && state.selectedThreadId) { 
          await createComment(state.selectedThreadId, null, content); 
          textarea.value = ""; 
          await loadComments(state.selectedThreadId); 
        }
    });
    
    $("#uploadForm")?.addEventListener("submit", async (e) => { 
      e.preventDefault(); 
      const f = $("#fileInput")?.files[0]; 
      if (f) { 
        await uploadFile(f); 
        $("#fileInput").value = ""; 
      } 
    });
}

// --- INITIALIZATION ---
export function initEventLogic(dependencies) {
  supabase = dependencies.supabase;
  authState = dependencies.authState;
  fetchProfile = dependencies.fetchProfile;
  tr = dependencies.tr;
  state = dependencies.state;
  $ = dependencies.$;
  setFlash = dependencies.setFlash;
  fmtDateTime = dependencies.fmtDateTime;
  escapeHtml = dependencies.escapeHtml;
  linkify = dependencies.linkify;
  bytesToSize = dependencies.bytesToSize;
  showView = dependencies.showView;
  listViewName = dependencies.listViewName;

  wireEventDetailUI();

  return {
    openEvent,
    cleanupSubscriptions,
    renderEventHeader,
    renderDescriptionTab,
    renderThreads,
    renderComments,
    renderFiles,
    loadRSVPFollow
  };
}