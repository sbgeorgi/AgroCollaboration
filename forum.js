import { renderLayout } from './layout.js';
import { supabase, authState, initAuth, signOut } from './auth.js';
import {
  initSharedUI, renderHeader, $, $$, show, hide, applyI18n, tr, setFlash,
  fmtDateTime, escapeHtml, getAvatarUrl, showProfileGateModal, showAuthGateModal
} from './ui.js';
import { openProfileModal } from './clickprofile.js';
import { formatCommentContent, formatRichText, sanitizeRichText, stripHtml } from './rich-text.js';

renderLayout('forum');

const state = {
  language: localStorage.getItem('lang') || 'en',
  events: [],
  threads: [],
  comments: [],
  selectedBoard: 'all',
  focusedEventId: null,
  selectedThreadId: null,
  search: '',
  sort: 'recent',
  channels: [],
  profileCache: new Map(),
  replyTargetId: null,
};

const t = {
  en: {
    auth: { signin: 'Sign in', signout: 'Sign out' },
    nav: { schedule: 'Schedule', archive: 'Archive', scholar: 'Scholar', about: 'About', network: 'Network', map: 'Map', forum: 'Forum', admin: 'Admin' },
    footer: { note: 'Bilingual, community-driven seminar on agrivoltaics in the Americas.' }
  },
  es: {
    auth: { signin: 'Ingresar', signout: 'Salir' },
    nav: { schedule: 'Programa', archive: 'Archivo', scholar: 'Scholar', about: 'Acerca de', network: 'Red', map: 'Mapa', forum: 'Foro', admin: 'Admin' },
    footer: { note: 'Seminario bilingue impulsado por la comunidad sobre agrovoltaica en las Americas.' }
  }
};

const boards = [
  { id: 'all', label: 'All threads', icon: 'layout-grid', hint: 'Every event and community post' },
  { id: 'opportunity', label: 'Opportunities', icon: 'briefcase-business', hint: 'Jobs, projects, funding, students' },
  { id: 'event', label: 'Event discussions', icon: 'calendar-days', hint: 'Threads tied to seminar pages' },
  { id: 'question', label: 'Questions', icon: 'circle-help', hint: 'Methods, design, data, policy' },
  { id: 'resource', label: 'Resources', icon: 'book-open', hint: 'Papers, tools, field notes' },
  { id: 'general', label: 'General', icon: 'messages-square', hint: 'Open collaboration space' },
];

let topicEditor = null;
let replyEditor = null;

const isOrganizerOrAdmin = () => ['admin', 'organizer'].includes(authState.profile?.role);
const normalize = (value = '') => String(value).toLowerCase().trim();
const getEvent = (id) => state.events.find((event) => String(event.id) === String(id));
const formatName = (profile) => profile?.full_name || profile?.username || 'Anonymous';
const initialLetter = (name) => (name || 'U').charAt(0).toUpperCase();

function localTr(key, fallback = '') {
  return tr(t, state.language, key, fallback);
}

function setupEditors() {
  if (!window.Quill) return;
  const toolbar = [
    ['bold', 'italic', 'underline'],
    [{ list: 'ordered' }, { list: 'bullet' }],
    ['blockquote', 'link', 'clean']
  ];

  topicEditor = new Quill('#forumTopicEditor', {
    theme: 'snow',
    placeholder: 'Add context, links, images, and what kind of response would help.',
    modules: { toolbar }
  });

  replyEditor = new Quill('#forumReplyEditor', {
    theme: 'snow',
    placeholder: 'Write a reply...',
    modules: { toolbar }
  });
}

function getEditorHtml(editor) {
  if (!editor) return '';
  const text = editor.getText().trim();
  if (!text && editor.root.querySelectorAll('img').length === 0) return '';
  return sanitizeRichText(editor.root.innerHTML);
}

function clearEditor(editor) {
  if (editor) editor.setContents([]);
}

function parseThreadTitle(rawTitle = '') {
  const match = rawTitle.match(/^\[(Opportunity(?::\s*([^\]]+))?|Question|Resource|General|Event)\]\s*(.*)$/i);
  if (!match) return { title: rawTitle, board: 'general', detail: '' };
  const label = match[1].toLowerCase();
  const detail = match[2] || '';
  const board = label.startsWith('opportunity') ? 'opportunity' : label;
  return { title: match[3] || rawTitle, board, detail };
}

function buildStoredTitle(board, title, detail = '') {
  const cleanTitle = title.trim();
  if (board === 'opportunity') return `[Opportunity${detail ? `: ${detail}` : ''}] ${cleanTitle}`;
  const labels = { question: 'Question', resource: 'Resource', event: 'Event', general: 'General' };
  return `[${labels[board] || 'General'}] ${cleanTitle}`;
}

function threadBoard(thread) {
  const parsed = parseThreadTitle(thread.title);
  if (parsed.board === 'general' && thread.event_id) return 'event';
  return parsed.board;
}

function threadEventTitle(thread) {
  const event = getEvent(thread.event_id);
  if (!event) return 'Community forum';
  return state.language === 'es' ? (event.title_es || event.title_en) : event.title_en;
}

async function resolveProfiles(items, idKey = 'created_by') {
  const ids = [...new Set(items.map((item) => item[idKey]).filter(Boolean))];
  const missing = ids.filter((id) => !state.profileCache.has(id));

  if (missing.length) {
    const { data } = await supabase.from('profiles').select('*').in('id', missing);
    await Promise.all((data || []).map(async (profile) => {
      const public_avatar_url = profile.avatar_url ? await getAvatarUrl(profile.avatar_url) : null;
      state.profileCache.set(profile.id, { ...profile, public_avatar_url });
    }));
  }

  return items.map((item) => ({
    ...item,
    author: state.profileCache.get(item[idKey]) || { full_name: 'Unknown' }
  }));
}

async function ensureProfileInCache(profileId) {
  if (!profileId) return null;
  if (state.profileCache.has(profileId)) return state.profileCache.get(profileId);
  const { data } = await supabase.from('profiles').select('*').eq('id', profileId).single();
  if (!data) return null;
  const public_avatar_url = data.avatar_url ? await getAvatarUrl(data.avatar_url) : null;
  const enriched = { ...data, public_avatar_url };
  state.profileCache.set(profileId, enriched);
  return enriched;
}

function requireMemberAction() {
  if (!authState.session) {
    showAuthGateModal(state.language, true);
    return false;
  }
  if (!authState.profileComplete) {
    showProfileGateModal(state.language);
    return false;
  }
  return true;
}

function renderAdminControls() {
  const adminButton = $('#forumBoardAdminButton');
  if (!adminButton) return;
  isOrganizerOrAdmin() ? show(adminButton) : hide(adminButton);
}

function renderBoards() {
  const counts = boards.reduce((acc, board) => ({ ...acc, [board.id]: 0 }), {});
  state.threads.forEach((thread) => {
    counts.all += 1;
    const board = threadBoard(thread);
    counts[board] = (counts[board] || 0) + 1;
  });

  $('#forumBoards').innerHTML = boards.map((board) => `
    <button type="button" class="forum-board-button ${state.selectedBoard === board.id ? 'active' : ''}" data-board="${board.id}">
      <i data-lucide="${board.icon}"></i>
      <span><strong>${escapeHtml(board.label)}</strong><small>${escapeHtml(board.hint)}</small></span>
      <em>${counts[board.id] || 0}</em>
    </button>
  `).join('');
  window.lucide?.createIcons();
}

function renderEventSelects() {
  renderStats();
}

function filteredThreads() {
  const term = normalize(state.search);
  const filtered = state.threads.filter((thread) => {
    const parsed = parseThreadTitle(thread.title);
    const board = threadBoard(thread);
    const eventTitle = threadEventTitle(thread);
    const haystack = normalize(`${parsed.title} ${parsed.detail} ${thread.title} ${eventTitle} ${thread.author?.full_name || ''}`);

    if (state.selectedBoard !== 'all' && board !== state.selectedBoard) return false;
    if (state.focusedEventId && String(thread.event_id) !== String(state.focusedEventId)) return false;
    if (term && !haystack.includes(term)) return false;
    return true;
  });

  return filtered.sort((a, b) => {
    if (state.sort === 'pinned') return Number(b.pinned) - Number(a.pinned) || new Date(b.created_at) - new Date(a.created_at);
    if (state.sort === 'newest') return new Date(b.created_at) - new Date(a.created_at);
    return new Date(b.last_activity || b.created_at) - new Date(a.last_activity || a.created_at);
  });
}

function renderStats() {
  $('#forumThreadCount').textContent = state.threads.length;
  $('#forumEventCount').textContent = state.events.length;
  $('#forumOpportunityCount').textContent = state.threads.filter((thread) => threadBoard(thread) === 'opportunity').length;
}

function renderThreads() {
  renderBoards();
  renderStats();

  const list = $('#forumThreads');
  const status = $('#forumStatus');
  const threads = filteredThreads();

  if (!threads.length) {
    status.className = 'forum-status';
    status.innerHTML = '<i data-lucide="search-x"></i> No forum threads match this view.';
    list.innerHTML = '';
    window.lucide?.createIcons();
    return;
  }

  status.className = 'forum-status hidden';
  list.innerHTML = threads.map((thread) => {
    const parsed = parseThreadTitle(thread.title);
    const board = threadBoard(thread);
    const active = String(thread.id) === String(state.selectedThreadId);
    const authorName = formatName(thread.author);
    const avatar = thread.author?.public_avatar_url
      ? `<img src="${thread.author.public_avatar_url}" alt="">`
      : `<span>${initialLetter(authorName)}</span>`;

    return `
      <article class="forum-thread-card ${active ? 'active' : ''}" data-thread-id="${thread.id}">
        <div class="forum-thread-card-main">
          <button class="forum-avatar" type="button" data-open-profile="${thread.author?.id || ''}">${avatar}</button>
          <div class="forum-thread-card-copy">
            <div class="forum-card-badges">
              <span class="forum-badge ${board}">${escapeHtml(board === 'opportunity' && parsed.detail ? parsed.detail : board)}</span>
              ${thread.pinned ? '<span class="forum-badge pinned">Pinned</span>' : ''}
              ${thread.event_id ? `<span class="forum-badge event">${escapeHtml(threadEventTitle(thread))}</span>` : ''}
            </div>
            <h3>${escapeHtml(parsed.title)}</h3>
            <p>${escapeHtml(authorName)} · ${fmtDateTime(thread.created_at)} · ${thread.comment_count || 0} replies</p>
          </div>
        </div>
        <i data-lucide="chevron-right"></i>
      </article>
    `;
  }).join('');
  window.lucide?.createIcons();
}

async function loadEvents() {
  const { data, error } = await supabase
    .from('events')
    .select('id, title_en, title_es, description_en, description_es, start_time, end_time, topic_tags, host_org, language, zoom_url, recording_url, event_speakers(name, affiliation, primary_speaker, profile:profiles(id, avatar_url, country))')
    .order('start_time', { ascending: false });
  if (error) {
    console.warn('Could not load events for forum', error);
    state.events = [];
  } else {
    state.events = data || [];
  }
  renderEventSelects();
}

async function loadThreads() {
  const status = $('#forumStatus');
  status.className = 'forum-status';
  status.innerHTML = '<span class="forum-spinner"></span> Loading forum threads...';

  const { data, error } = await supabase
    .from('threads')
    .select('id, event_id, title, created_by, created_at, pinned')
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    status.innerHTML = '<i data-lucide="lock"></i> Sign in may be required to load forum discussions.';
    window.lucide?.createIcons();
    return;
  }

  let threads = await resolveProfiles(data || []);
  const threadIds = threads.map((thread) => thread.id);

  if (threadIds.length) {
    const { data: comments } = await supabase
      .from('comments')
      .select('id, thread_id, created_at')
      .in('thread_id', threadIds);

    const activity = {};
    (comments || []).forEach((comment) => {
      const key = comment.thread_id;
      activity[key] ||= { count: 0, last: null };
      activity[key].count += 1;
      if (!activity[key].last || new Date(comment.created_at) > new Date(activity[key].last)) activity[key].last = comment.created_at;
    });

    threads = threads.map((thread) => ({
      ...thread,
      comment_count: activity[thread.id]?.count || 0,
      last_activity: activity[thread.id]?.last || thread.created_at
    }));
  }

  state.threads = threads;
  renderThreads();

  if (state.selectedThreadId && state.threads.some((thread) => String(thread.id) === String(state.selectedThreadId))) {
    await selectThread(state.selectedThreadId, { keepUrl: true });
  }
}

async function loadComments(threadId) {
  const { data, error } = await supabase
    .from('comments')
    .select('id, event_id, thread_id, parent_id, content, created_by, created_at, updated_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error(error);
    $('#forumComments').innerHTML = '<div class="forum-comment-empty">Could not load replies.</div>';
    return;
  }

  state.comments = await resolveProfiles(data || [], 'created_by');

  if (state.comments.length) {
    const commentIds = state.comments.map((comment) => comment.id);
    const { data: likes } = await supabase
      .from('comment_likes')
      .select('comment_id, profile_id')
      .in('comment_id', commentIds);
    const counts = {};
    const likedByMe = new Set();
    (likes || []).forEach((like) => {
      counts[like.comment_id] = (counts[like.comment_id] || 0) + 1;
      if (like.profile_id === authState.profile?.id) likedByMe.add(like.comment_id);
    });
    state.comments = state.comments.map((comment) => ({
      ...comment,
      likes_count: counts[comment.id] || 0,
      liked_by_me: likedByMe.has(comment.id)
    }));
  }

  renderComments();
}

function renderComments() {
  const container = $('#forumComments');
  if (!state.comments.length) {
    container.innerHTML = '<div class="forum-comment-empty"><i data-lucide="message-circle"></i><span>No replies yet. Start the conversation.</span></div>';
    window.lucide?.createIcons();
    return;
  }

  const byParent = state.comments.reduce((acc, comment) => {
    (acc[comment.parent_id || 'root'] ||= []).push(comment);
    return acc;
  }, {});

  const renderTree = (parentId, depth = 0) => (byParent[parentId] || []).map((comment) => {
    const name = formatName(comment.author);
    const isMe = authState.profile?.id === comment.author?.id;
    const canModerate = isMe || isOrganizerOrAdmin();
    const avatar = comment.author?.public_avatar_url
      ? `<img src="${comment.author.public_avatar_url}" alt="">`
      : `<span>${initialLetter(name)}</span>`;
    const edited = comment.updated_at && comment.updated_at !== comment.created_at ? ` · edited ${fmtDateTime(comment.updated_at)}` : '';

    return `
      <div class="forum-comment ${depth ? 'nested' : ''}" data-comment-id="${comment.id}">
        <button class="forum-avatar" type="button" data-open-profile="${comment.author?.id || ''}">${avatar}</button>
        <div class="forum-comment-body">
          <div class="forum-comment-bubble">
            <div class="forum-comment-topline">
              <button type="button" data-open-profile="${comment.author?.id || ''}">${escapeHtml(name)}</button>
              <span>${fmtDateTime(comment.created_at)}${edited}</span>
            </div>
            <div class="forum-comment-content">${formatCommentContent(comment.content)}</div>
          </div>
          <div class="forum-comment-actions">
            <button type="button" data-reply-comment="${comment.id}" data-reply-name="${escapeHtml(name)}">Reply</button>
            <button type="button" class="${comment.liked_by_me ? 'liked' : ''}" data-like-comment="${comment.id}">
              Like${comment.likes_count ? ` (${comment.likes_count})` : ''}
            </button>
            ${isMe ? `<button type="button" data-edit-comment="${comment.id}">Edit</button>` : ''}
            ${canModerate ? `<button type="button" class="danger" data-delete-comment="${comment.id}">Delete</button>` : ''}
          </div>
          ${byParent[comment.id]?.length ? `<div class="forum-comment-children">${renderTree(comment.id, depth + 1)}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = renderTree('root');
  window.lucide?.createIcons();
}

async function selectThread(threadId, options = {}) {
  const thread = state.threads.find((item) => String(item.id) === String(threadId));
  if (!thread) return;
  state.selectedThreadId = threadId;
  state.replyTargetId = null;
  $('#forumReplyTarget').classList.add('hidden');

  const parsed = parseThreadTitle(thread.title);
  const board = threadBoard(thread);
  $('#forumEmptyThread').classList.add('hidden');
  $('#forumThreadDetail').classList.remove('hidden');
  $('#forumThreadTitle').textContent = parsed.title;
  $('#forumThreadMeta').innerHTML = `
    <span class="forum-badge ${board}">${escapeHtml(board === 'opportunity' && parsed.detail ? parsed.detail : board)}</span>
    <span>${escapeHtml(formatName(thread.author))}</span>
    <span>${fmtDateTime(thread.created_at)}</span>
  `;

  const eventLink = $('#forumEventLink');
  if (thread.event_id) {
    eventLink.dataset.eventId = thread.event_id;
    show(eventLink);
  } else {
    delete eventLink.dataset.eventId;
    hide(eventLink);
  }

  const canModerate = isOrganizerOrAdmin() || authState.profile?.id === thread.created_by;
  ['#forumEditThread', '#forumDeleteThread'].forEach((selector) => canModerate ? show($(selector)) : hide($(selector)));
  isOrganizerOrAdmin() ? show($('#forumPinThread')) : hide($('#forumPinThread'));
  $('#forumPinThread span').textContent = thread.pinned ? 'Unpin' : 'Pin';

  renderThreads();
  await loadComments(threadId);

  if (!options.keepUrl) {
    const url = new URL(window.location.href);
    url.searchParams.set('thread', threadId);
    window.history.replaceState({ thread: threadId }, '', url);
  }
}

async function uploadImage(file, editor) {
  if (!file || !editor) return;
  if (!requireMemberAction()) return;
  if (!file.type.startsWith('image/')) return setFlash('Please choose an image file.');
  if (file.size > 8 * 1024 * 1024) return setFlash('Image is too large. Max 8MB.');

  const safeName = file.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const path = `forum/${authState.session.user.id}/${crypto.randomUUID()}-${safeName}`;
  setFlash('Uploading image...', -1);

  const { error } = await supabase.storage.from('attachments').upload(path, file, { contentType: file.type });
  if (error) {
    console.error(error);
    setFlash('Image upload failed.');
    return;
  }

  const { data: { publicUrl } } = supabase.storage.from('attachments').getPublicUrl(path);
  const range = editor.getSelection(true) || { index: editor.getLength(), length: 0 };
  editor.insertEmbed(range.index, 'image', publicUrl, 'user');
  editor.setSelection(range.index + 1, 0);
  setFlash('Image added.');
}

async function createThread(e) {
  e.preventDefault();
  if (!requireMemberAction()) return;

  const board = $('#forumTopicBoard').value;
  const eventId = null;
  const title = $('#forumTopicTitle').value.trim();
  const detail = board === 'opportunity' ? $('#forumOpportunityType').value.trim() : '';
  const deadline = $('#forumOpportunityDeadline').value.trim();
  let body = getEditorHtml(topicEditor);

  if (!title) return;
  if (board === 'opportunity' && deadline) {
    body = sanitizeRichText(`<p><strong>Timing:</strong> ${escapeHtml(deadline)}</p>${body}`);
  }

  const storedTitle = buildStoredTitle(board, title, detail);
  const basePayload = { title: storedTitle, event_id: eventId, created_by: authState.session.user.id };
  let { data, error } = await supabase.from('threads').insert(basePayload).select().single();

  if (error && !eventId) {
    const fallbackEvent = state.events.find((event) => (event.topic_tags || []).map(normalize).includes('forum'));
    if (fallbackEvent) {
      ({ data, error } = await supabase.from('threads').insert({ ...basePayload, event_id: fallbackEvent.id }).select().single());
    }
  }

  if (error) {
    console.error(error);
    setFlash('Could not publish. If general topics require an event channel, ask an organizer to create a forum event.');
    return;
  }

  if (body) {
    const commentPayload = { content: body, thread_id: data.id, created_by: authState.session.user.id, event_id: data.event_id || null };
    const { error: commentError } = await supabase.from('comments').insert(commentPayload);
    if (commentError) console.warn('Thread created but first post failed', commentError);
  }

  $('#forumTopicDialog').close();
  $('#forumTopicTitle').value = '';
  $('#forumOpportunityDeadline').value = '';
  clearEditor(topicEditor);
  await loadThreads();
  await selectThread(data.id);
  setFlash('Forum post published.');
}

async function createReply(e) {
  e.preventDefault();
  if (!requireMemberAction()) return;
  const thread = state.threads.find((item) => String(item.id) === String(state.selectedThreadId));
  if (!thread) return;
  const content = getEditorHtml(replyEditor);
  if (!stripHtml(content).trim() && !/<img/i.test(content)) return;

  const payload = {
    content,
    thread_id: thread.id,
    event_id: thread.event_id || null,
    parent_id: state.replyTargetId || null,
    created_by: authState.session.user.id
  };

  const { error } = await supabase.from('comments').insert(payload);
  if (error) {
    console.error(error);
    setFlash('Could not post reply.');
    return;
  }

  clearEditor(replyEditor);
  state.replyTargetId = null;
  $('#forumReplyTarget').classList.add('hidden');
  await loadComments(thread.id);
  await loadThreads();
}

async function updateThread(action) {
  const thread = state.threads.find((item) => String(item.id) === String(state.selectedThreadId));
  if (!thread || !requireMemberAction()) return;
  const parsed = parseThreadTitle(thread.title);

  let error;
  if (action === 'edit') {
    const title = prompt('Update thread title', parsed.title);
    if (!title || title.trim() === parsed.title) return;
    ({ error } = await supabase.from('threads').update({ title: buildStoredTitle(threadBoard(thread), title, parsed.detail) }).eq('id', thread.id));
  } else if (action === 'pin') {
    ({ error } = await supabase.from('threads').update({ pinned: !thread.pinned }).eq('id', thread.id));
  } else if (action === 'delete') {
    if (!confirm('Delete this thread and its replies?')) return;
    ({ error } = await supabase.from('threads').delete().eq('id', thread.id));
    if (!error) {
      state.selectedThreadId = null;
      show($('#forumEmptyThread'));
      hide($('#forumThreadDetail'));
    }
  }

  if (error) setFlash('Thread action failed.');
  else await loadThreads();
}

function openTopicDialog(prefillBoard = null) {
  if (!requireMemberAction()) return;
  const board = prefillBoard || (state.selectedBoard === 'all' || state.selectedBoard === 'event' ? 'general' : state.selectedBoard);
  $('#forumTopicBoard').value = board;
  toggleOpportunityFields();
  $('#forumTopicDialog').showModal();
  setTimeout(() => $('#forumTopicTitle').focus(), 50);
}

function toggleOpportunityFields() {
  $('#forumTopicBoard').value === 'opportunity' ? show($('#forumOpportunityFields')) : hide($('#forumOpportunityFields'));
}

function bindEvents() {
  $('#newForumTopicHero').addEventListener('click', () => openTopicDialog());
  $('#forumBoardAdminButton').addEventListener('click', () => {
    if (!isOrganizerOrAdmin()) return;
    setFlash('Board taxonomy is admin-managed. Edit forum.js to add a permanent board.');
  });
  $('#forumTopicClose').addEventListener('click', () => $('#forumTopicDialog').close());
  $('#forumTopicCancel').addEventListener('click', () => $('#forumTopicDialog').close());
  $('#forumTopicBoard').addEventListener('change', toggleOpportunityFields);
  $('#forumTopicForm').addEventListener('submit', createThread);
  $('#forumReplyForm').addEventListener('submit', createReply);

  $('#forumSearch').addEventListener('input', (e) => {
    state.search = e.target.value;
    renderThreads();
  });
  $('#forumSort').addEventListener('change', (e) => {
    state.sort = e.target.value;
    renderThreads();
  });
  $('#forumBoards').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-board]');
    if (!btn) return;
    state.selectedBoard = btn.dataset.board;
    state.focusedEventId = null;
    renderThreads();
  });
  $('#forumThreads').addEventListener('click', (e) => {
    const profileBtn = e.target.closest('[data-open-profile]');
    if (profileBtn) return;
    const card = e.target.closest('[data-thread-id]');
    if (card) selectThread(card.dataset.threadId);
  });

  $('#forumReplyImageButton').addEventListener('click', () => $('#forumReplyImageInput').click());
  $('#forumTopicImageButton').addEventListener('click', () => $('#forumTopicImageInput').click());
  $('#forumReplyImageInput').addEventListener('change', (e) => uploadImage(e.target.files?.[0], replyEditor).finally(() => { e.target.value = ''; }));
  $('#forumTopicImageInput').addEventListener('change', (e) => uploadImage(e.target.files?.[0], topicEditor).finally(() => { e.target.value = ''; }));

  $('#forumComments').addEventListener('click', async (e) => {
    const profileBtn = e.target.closest('[data-open-profile]');
    if (profileBtn) return;

    const replyBtn = e.target.closest('[data-reply-comment]');
    if (replyBtn) {
      if (!requireMemberAction()) return;
      state.replyTargetId = replyBtn.dataset.replyComment;
      const target = $('#forumReplyTarget');
      target.innerHTML = `<span>Replying to <strong>${escapeHtml(replyBtn.dataset.replyName)}</strong></span><button type="button" data-clear-reply>&times;</button>`;
      show(target);
      replyEditor?.focus();
      return;
    }

    if (e.target.closest('[data-clear-reply]')) {
      state.replyTargetId = null;
      hide($('#forumReplyTarget'));
      return;
    }

    const likeBtn = e.target.closest('[data-like-comment]');
    if (likeBtn) {
      if (!requireMemberAction()) return;
      const commentId = likeBtn.dataset.likeComment;
      const comment = state.comments.find((item) => String(item.id) === String(commentId));
      if (comment?.liked_by_me) await supabase.from('comment_likes').delete().match({ comment_id: commentId, profile_id: authState.profile.id });
      else await supabase.from('comment_likes').insert({ comment_id: commentId, profile_id: authState.profile.id });
      await loadComments(state.selectedThreadId);
      return;
    }

    const deleteBtn = e.target.closest('[data-delete-comment]');
    if (deleteBtn) {
      if (!requireMemberAction() || !confirm('Delete this reply?')) return;
      await supabase.from('comments').delete().eq('id', deleteBtn.dataset.deleteComment);
      await loadComments(state.selectedThreadId);
      await loadThreads();
      return;
    }

    const editBtn = e.target.closest('[data-edit-comment]');
    if (editBtn) {
      const comment = state.comments.find((item) => String(item.id) === String(editBtn.dataset.editComment));
      if (!comment) return;
      const next = prompt('Edit reply', stripHtml(comment.content));
      if (next && next.trim()) {
        await supabase.from('comments').update({ content: next.trim(), updated_at: new Date().toISOString() }).eq('id', comment.id);
        await loadComments(state.selectedThreadId);
      }
    }
  });

  document.addEventListener('click', async (e) => {
    const profileBtn = e.target.closest('[data-open-profile]');
    if (!profileBtn) return;
    const profile = await ensureProfileInCache(profileBtn.dataset.openProfile);
    if (profile) openProfileModal({ ...profile });
  });

  $('#forumEditThread').addEventListener('click', () => updateThread('edit'));
  $('#forumDeleteThread').addEventListener('click', () => updateThread('delete'));
  $('#forumPinThread').addEventListener('click', () => updateThread('pin'));
  $('#forumEventLink').addEventListener('click', (e) => {
    const eventId = e.currentTarget.dataset.eventId;
    if (eventId) openEventPreview(eventId);
  });
  $('#forumEventDialogClose').addEventListener('click', () => $('#forumEventDialog').close());
  $('#forumEventDialogFocusThreads').addEventListener('click', () => {
    const eventId = $('#forumEventDialog').dataset.eventId;
    if (!eventId) return;
    state.focusedEventId = eventId;
    state.selectedBoard = 'event';
    $('#forumEventDialog').close();
    renderThreads();
  });
}

async function openEventPreview(eventId) {
  const event = getEvent(eventId);
  if (!event) return;

  const title = state.language === 'es' ? (event.title_es || event.title_en) : event.title_en;
  const description = state.language === 'es' ? (event.description_es || event.description_en) : event.description_en;
  const speakers = await Promise.all((event.event_speakers || []).map(async (speaker) => {
    const img = speaker.profile?.avatar_url ? await getAvatarUrl(speaker.profile.avatar_url) : null;
    const avatar = img
      ? `<img src="${img}" alt="">`
      : `<span>${initialLetter(speaker.name)}</span>`;
    return `
      <div class="forum-event-speaker">
        <div class="forum-avatar">${avatar}</div>
        <div>
          <strong>${escapeHtml(speaker.name || 'Speaker')}</strong>
          ${speaker.affiliation ? `<small>${escapeHtml(speaker.affiliation)}</small>` : ''}
        </div>
      </div>
    `;
  }));

  $('#forumEventDialog').dataset.eventId = event.id;
  $('#forumEventDialogTitle').textContent = title;
  $('#forumEventDialogMeta').textContent = `${fmtDateTime(event.start_time)}${event.host_org ? ` · ${event.host_org}` : ''}`;
  $('#forumEventDialogBody').innerHTML = `
    <div class="forum-event-preview-grid">
      <section>
        <h3>About</h3>
        ${description ? formatRichText(description) : '<p class="forum-event-muted">No event description is available yet.</p>'}
      </section>
      <aside>
        <h3>Access</h3>
        <div class="forum-event-access">
          ${event.zoom_url ? `<a class="forum-primary-action small" href="${event.zoom_url}" target="_blank" rel="noopener noreferrer"><i data-lucide="video"></i>Join live</a>` : ''}
          ${event.recording_url ? `<a class="forum-secondary-action small" href="${event.recording_url}" target="_blank" rel="noopener noreferrer"><i data-lucide="play-circle"></i>Recording</a>` : ''}
          ${!event.zoom_url && !event.recording_url ? '<span class="forum-event-muted">No access links posted.</span>' : ''}
        </div>
        <h3>Speakers</h3>
        <div class="forum-event-speakers">${speakers.length ? speakers.join('') : '<span class="forum-event-muted">Speakers TBA.</span>'}</div>
      </aside>
    </div>
  `;
  $('#forumEventDialog').showModal();
  window.lucide?.createIcons();
}

function subscribeRealtime() {
  state.channels.forEach((channel) => supabase.removeChannel(channel));
  state.channels = [
    supabase.channel('forum:threads').on('postgres_changes', { event: '*', schema: 'public', table: 'threads' }, loadThreads),
    supabase.channel('forum:comments').on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, () => {
      loadThreads();
      if (state.selectedThreadId) loadComments(state.selectedThreadId);
    }),
    supabase.channel('forum:likes').on('postgres_changes', { event: '*', schema: 'public', table: 'comment_likes' }, () => {
      if (state.selectedThreadId) loadComments(state.selectedThreadId);
    }),
  ];
  state.channels.forEach((channel) => channel.subscribe());
}

function handleLangSwitch() {
  state.language = state.language === 'en' ? 'es' : 'en';
  localStorage.setItem('lang', state.language);
  applyI18n(t, state.language);
  renderStats();
  renderThreads();
}

(async function main() {
  setupEditors();
  bindEvents();
  initSharedUI({ onLangSwitch: handleLangSwitch, onSignOut: signOut });
  applyI18n(t, state.language);

  await initAuth({
    onAuthReady: async () => { await renderHeader(authState, t, state.language); renderAdminControls(); },
    onAuthChange: async () => { await renderHeader(authState, t, state.language); renderAdminControls(); }
  });

  await loadEvents();
  await loadThreads();
  subscribeRealtime();

  const requestedThread = new URLSearchParams(window.location.search).get('thread');
  if (requestedThread) await selectThread(requestedThread, { keepUrl: true });

  window.lucide?.createIcons();
})();
