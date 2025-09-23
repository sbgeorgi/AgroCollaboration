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
    .subscribe();
}

async function loadRSVPFollow(eventId) {
  state.rsvpStatus = null; state.isFollowing = false; state.counts = { followers: 0, going: 0, interested: 0 };
  const { data: countsData } = await supabase.rpc('get_event_counts', { event_id_param: eventId });
  if (countsData) { state.counts.followers = countsData.followers_count; state.counts.going = countsData.going_count; state.counts.interested = countsData.interested_count; }
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
  const { data } = await supabase.from("threads").select("*, comments(count), profiles(*)").eq("event_id", eventId).order("created_at", { ascending: false });
  state.threads = data || [];
  for (const th of state.threads) {
    if (th.profiles) {
      // Process the profile to get signed avatar URL
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
    const { data } = await supabase.from("comments").select("*").eq("thread_id", threadId).order("created_at", { ascending: true });
    state.comments = data || [];
    const userIds = [...new Set(state.comments.map(c => c.created_by))];
    await Promise.all(userIds.map(id => fetchProfile(id)));
    renderComments();
}

async function loadFiles(eventId) {
  const { data } = await supabase.from("attachments").select("*").eq("event_id", eventId).order("created_at", { ascending: false });
  state.files = data || [];
  renderFiles();
}


// --- RENDERING ---
function renderEventHeader() {
  const ev = state.selectedEvent; if (!ev) return;
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

    const item = document.createElement("div");
    item.className = "thread-list-item";
    if (th.id === state.selectedThreadId) item.classList.add('active');

    item.innerHTML = `
      <div class="avatar-circle">${initial}</div>
      <div>
        <div class="title">${th.pinned ? "📌 " : ""}${escapeHtml(th.title)}</div>
        <div class="meta">${th.comments[0].count} replies • by ${escapeHtml(authorName)}</div>
      </div>
    `;
    item.addEventListener('click', () => openThread(th.id));
    list.appendChild(item);
  }
}

function createCommentNode(comment, commentsByParentId, depth = 0) {
    const profile = authState.profileCache.get(comment.created_by);
    const authorName = profile?.full_name || profile?.username || '...';
    const initial = authorName.charAt(0).toUpperCase();
    const children = commentsByParentId.get(comment.id) || [];
    const accent = accentFromId(comment.created_by);

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
            </div>
            <div class="comment-body-wrapper">
                <div class="comment-bubble">
                    <div class="comment-text">${comment.is_deleted ? "<em>(deleted)</em>" : linkify(comment.content)}</div>
                </div>
                <div class="comment-actions">
                    <button class="btn-ghost" data-reply-id="${comment.id}">💬 ${tr('reply', 'Reply')}</button>
                </div>
            </div>
            <div class="comment-replies"></div>
        </div>
    `;

    const repliesContainer = node.querySelector('.comment-replies');
    for (const child of children) {
        repliesContainer.appendChild(createCommentNode(child, commentsByParentId, depth + 1));
    }

    node.querySelector(`[data-reply-id]`).addEventListener('click', (e) => {
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
              <input type="text" placeholder="Replying to ${escapeHtml(authorName)}..." required />
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
    const url = await getSignedUrl(f.object_path);
    div.innerHTML = `<div class="meta"><div class="name">${escapeHtml(f.file_name)}</div><div class="size">${bytesToSize(f.file_size)}</div></div><div class="actions"><a class="btn-secondary" href="${url}" target="_blank" rel="noopener">${tr('open')}</a>${authState.profile?.role === 'admin' ? `<button class="btn-danger" data-del-file-id="${f.id}" data-del-file-path="${f.object_path}">Delete</button>` : ""}</div>`;
    grid.appendChild(div);
  }
}

// --- ACTIONS & INTERACTIONS ---
async function createThread(title) {
  if (!title || !state.selectedEvent) return;
  const { data } = await supabase.from("threads").insert({ event_id: state.selectedEvent.id, title, created_by: authState.session.user.id }).select().single();
  await loadThreads(state.selectedEvent.id);
  if (data) openThread(data.id);
}

async function createComment(thread_id, parent_id, content) {
  await supabase.from("comments").insert({ event_id: state.selectedEvent.id, thread_id, parent_id, content, created_by: authState.session.user.id });
}

async function uploadFile(file) {
  if (!file || !state.selectedEvent) return;
  const eventId = state.selectedEvent.id;
  const object_path = `events/${eventId}/${Date.now()}-${file.name}`;
  await supabase.storage.from("attachments").upload(object_path, file);
  await supabase.from("attachments").insert({ event_id: eventId, bucket_id: "attachments", object_path, file_name: file.name, file_type: file.type, file_size: file.size, created_by: authState.session.user.id });
}

async function getSignedUrl(path) {
  const { data } = await supabase.storage.from("attachments").createSignedUrl(path, 3600);
  return data?.signedUrl;
}

async function deleteFile(id, path) {
  if (!confirm('Delete file permanently?')) return;
  await supabase.storage.from("attachments").remove([path]);
  await supabase.from("attachments").delete().eq("id", id);
}

async function toggleFollow() {
  if (!authState.session || !state.selectedEvent) return;
  const uid = authState.session.user.id;
  const eventId = state.selectedEvent.id;
  
  // Immediately update UI for responsiveness
  state.isFollowing = !state.isFollowing;
  renderEventHeader();
  
  if (!state.isFollowing) {
    await supabase.from("event_follows").delete().eq("event_id", eventId).eq("profile_id", uid);
  } else {
    await supabase.from("event_follows").insert({ event_id: eventId, profile_id: uid });
  }
  
  // Fetch accurate counts from database
  await loadRSVPFollow(eventId);
}

async function setRSVP(status) {
  if (!authState.session || !state.selectedEvent) return;
  const uid = authState.session.user.id;
  const eventId = state.selectedEvent.id;
  
  // Store the previous status before updating
  const previousStatus = state.rsvpStatus;
  
  // If clicking the same status, do nothing
  if (previousStatus === status) return;
  
  // Immediately update UI for responsiveness
  state.rsvpStatus = status;
  renderEventHeader();
  
  // Save to database
  await supabase.from("event_rsvps").upsert({ 
    event_id: eventId, 
    profile_id: uid, 
    status 
  }, { onConflict: "event_id,profile_id" });
  
  // Fetch accurate counts from database
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
        const followBtn = e.target.closest('#btnFollowCompact'); if (followBtn) { toggleFollow(); return; }
        const rsvpBtn = e.target.closest('[data-rsvp]'); if (rsvpBtn) { setRSVP(rsvpBtn.dataset.rsvp); return; }
        const delFileBtn = e.target.closest('[data-del-file-id]'); if (delFileBtn) { deleteFile(delFileBtn.dataset.delFileId, delFileBtn.dataset.delFilePath); return; }
        const copyBtn = e.target.closest('[data-copy-link]'); if (copyBtn) { navigator.clipboard.writeText(copyBtn.dataset.copyLink); setFlash(tr('copied')); return; }

        const profileEl = e.target.closest('[data-open-profile-id], .comment-avatar[data-user-id]');
        if (profileEl) {
          const userId = profileEl.dataset.openProfileId || profileEl.dataset.userId;
          if (userId) window.location.href = `profile.html?user=${userId}`;
        }
    });

    document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => {
        setActiveTab(tab.dataset.tab);
    }));

    $("#newThreadForm")?.addEventListener("submit", async (e) => { e.preventDefault(); const title = $("#threadTitle")?.value.trim(); if (title) { await createThread(title); $("#threadTitle").value = ""; } });
    $("#replyToThreadForm")?.addEventListener("submit", async (e) => {
        e.preventDefault(); const textarea = e.target.querySelector("textarea"); const content = textarea.value.trim();
        if (content && state.selectedThreadId) { await createComment(state.selectedThreadId, null, content); textarea.value = ""; await loadComments(state.selectedThreadId); }
    });
    $("#uploadForm")?.addEventListener("submit", async (e) => { e.preventDefault(); const f = $("#fileInput")?.files[0]; if (f) { await uploadFile(f); $("#fileInput").value = ""; } });
}


// --- INITIALIZATION ---
export function initEventLogic(dependencies) {
  // Assign dependencies to module-level variables
  supabase = dependencies.supabase;
  authState = dependencies.authState;
  fetchProfile = dependencies.fetchProfile; // <-- CORRECTED: Added fetchProfile
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

  // Return public API for the host page
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