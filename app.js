import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* ================== CONFIG ================== */
const SUPABASE_URL = "https://iuzgfldgvueuehybgntm.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1emdmbGRndnVldWVoeWJnbnRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY4Mjc0MjUsImV4cCI6MjA3MjQwMzQyNX0.do919Hvw2AK-Ql-2V5guoRRH2yx4Rmset4eeVXi__o8";
const REDIRECT_TO = window.location.origin + window.location.pathname;
/* ============================================ */

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

const state = {
  session: null,
  profile: null,
  language: localStorage.getItem("lang") || "en",
  events: [],
  selectedEvent: null,
  // Filters
  eventTimeFilter: "upcoming", // upcoming, past, all
  eventLangFilter: "all",
  searchQuery: "",
  // User-specific data for events
  userFollows: new Set(),
  userRsvps: new Map(),
  // Event detail data
  threads: [],
  commentsByThread: new Map(),
  likesByComment: new Map(),
  userLikes: new Set(),
  files: [],
  profileCache: new Map(),
  // Realtime subscription channel
  realtimeChannel: null,
};

// Basic i18n
const t = {
  en: {
    tagline: "An informal seminar series to share advances in agrivoltaics in Latin America",
    intro: "Agrivoltaics (agrivoltaics) is an emerging field that integrates solar energy with crop/livestock production. This bilingual seminar focuses on Latin America. Hosted by UNAM and University of Arizona.",
    format: "Online • Monthly • 1 hour (30 min talk + 30 min discussion)",
    hosted: "Hosted by UNAM & University of Arizona",
    nav: { schedule: "Schedule", admin: "Admin" },
    auth: {
      title: "Sign in to participate",
      reason: "You'll need an account to RSVP, follow events, and join the discussion.",
      signin: "Sign in",
      signout: "Sign out",
      google: "Sign in with Google",
      email: "Email",
      magic: "Send magic link",
      magic_hint: "We'll email you a sign-in link. Check your inbox.",
      or: "or",
    },
    schedule: { title: "Event Schedule", empty: "No events match your filters. Check back soon." },
    filter: { upcoming: "Upcoming", past: "Past", all: "All", language: "Language" },
    lang: { all: "All Languages", en: "English", es: "Español", bi: "Bilingual" },
    search: { placeholder: "Search events..." },
    back: { schedule: "Back to schedule" },
    tabs: { discussion: "Discussion", files: "Files", about: "About" },
    thread: { placeholder: "New discussion topic…", create: "Create Topic", empty: "No topics yet. Start the discussion!", pinned: "Pinned" },
    comment: { reply: "Reply", delete: "Delete", placeholder: "Write a comment…", reply_placeholder: "Reply…" },
    files: { upload: "Upload", empty: "No files yet.", choose: "Choose File" },
    admin: { title: "Organizer Tools" },
    event: {
      title_en: "Title (EN)*", title_es: "Title (ES)",
      desc_en: "Description (EN)", desc_es: "Description (ES)",
      start: "Start time*", end: "End time",
      host: "Host org", lang: "Language",
      zoom: "Zoom URL (members only)", reg_url: "Registration URL",
      live_url: "Livestream URL", rec_url: "Recording URL",
      tags: "Tags (comma-separated)", create: "Create Event",
    },
    actions: {
      follow: "Follow", following: "Following", rsvp: "RSVP",
      going: "Going", interested: "Interested", not_going: "Not Going",
      add_gcal: "Add to Google Cal", download_ics: "Download ICS",
      copy_link: "Copy Link", copied: "Copied!",
      register: "Register Now", join_live: "Join Livestream",
      watch_rec: "Watch Recording", join_zoom: "Join with Zoom",
      zoom_soon: "Zoom opens soon", zoom_signin: "Sign in to join",
    },
    footer: { note: "Bilingual, community-driven seminar on agrivoltaics in Latin America." },
  },
  es: {
    tagline: "Serie de seminarios informales para compartir avances en agrofotovoltaica en América Latina",
    intro: "La agrofotovoltaica integra energía solar con producción agrícola/ganadera. Este seminario bilingüe se enfoca en América Latina. Organizado por UNAM y University of Arizona.",
    format: "En línea • Mensual • 1 hora (30 min charla + 30 min discusión)",
    hosted: "Organizado por UNAM y University of Arizona",
    nav: { schedule: "Calendario", admin: "Admin" },
    auth: {
      title: "Inicia sesión para participar",
      reason: "Necesitarás una cuenta para confirmar asistencia, seguir eventos y unirte a la discusión.",
      signin: "Iniciar sesión",
      signout: "Cerrar sesión",
      google: "Iniciar con Google",
      email: "Correo",
      magic: "Enviar enlace mágico",
      magic_hint: "Te enviaremos un enlace de acceso. Revisa tu bandeja.",
      or: "o",
    },
    schedule: { title: "Calendario de Eventos", empty: "No hay eventos que coincidan con tus filtros. Vuelve pronto." },
    filter: { upcoming: "Próximos", past: "Pasados", all: "Todos", language: "Idioma" },
    lang: { all: "Todos los idiomas", en: "Inglés", es: "Español", bi: "Bilingüe" },
    search: { placeholder: "Buscar eventos..." },
    back: { schedule: "Volver al calendario" },
    tabs: { discussion: "Discusión", files: "Archivos", about: "Acerca de" },
    thread: { placeholder: "Título del nuevo tema…", create: "Crear tema", empty: "Aún no hay temas. ¡Comienza la discusión!", pinned: "Fijado" },
    comment: { reply: "Responder", delete: "Eliminar", placeholder: "Escribe un comentario…", reply_placeholder: "Responder…" },
    files: { upload: "Subir", empty: "Aún no hay archivos.", choose: "Elegir Archivo" },
    admin: { title: "Herramientas para organizadores" },
    event: {
      title_en: "Título (EN)*", title_es: "Título (ES)",
      desc_en: "Descripción (EN)", desc_es: "Descripción (ES)",
      start: "Inicio*", end: "Fin",
      host: "Institución anfitriona", lang: "Idioma",
      zoom: "Enlace de Zoom (solo miembros)", reg_url: "URL de Registro",
      live_url: "URL de Transmisión", rec_url: "URL de Grabación",
      tags: "Etiquetas (separadas por comas)", create: "Crear evento",
    },
    actions: {
      follow: "Seguir", following: "Siguiendo", rsvp: "Asistencia",
      going: "Asistiré", interested: "Interesado", not_going: "No asistiré",
      add_gcal: "Añadir a Google Cal", download_ics: "Descargar ICS",
      copy_link: "Copiar enlace", copied: "¡Copiado!",
      register: "Registrarse ahora", join_live: "Ver en vivo",
      watch_rec: "Ver grabación", join_zoom: "Unirse con Zoom",
      zoom_soon: "Zoom abre pronto", zoom_signin: "Inicia sesión para unirte",
    },
    footer: { note: "Seminario bilingüe y comunitario sobre agrofotovoltaica en América Latina." },
  },
};

function tr(key, fallback = "") {
  const parts = key.split(".");
  let obj = t[state.language];
  for (const p of parts) obj = obj?.[p];
  return obj ?? fallback;
}

/* ============== UI helpers ============== */
const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);
function escapeHtml(s = "") { return s.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m])); }
function setFlash(msg, timeout = 3000) {
  const el = $("#flash");
  el.textContent = msg;
  el.style.transform = "translateY(0)";
  clearTimeout(setFlash._t);
  setFlash._t = setTimeout(() => (el.style.transform = "translateY(-150%)"), timeout);
}
function fmtDateTime(iso, style = { dateStyle: "medium", timeStyle: "short" }) {
  try { return new Intl.DateTimeFormat(undefined, style).format(new Date(iso)); }
  catch (_) { return iso; }
}
function bytesToSize(bytes = 0) {
    if (bytes === 0) return "0 B";
    const k = 1024, sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function applyI18n() {
  $$("[data-i18n]").forEach(el => el.textContent = tr(el.dataset.i18n, el.textContent));
  $$("[data-i18n-placeholder]").forEach(el => el.placeholder = tr(el.dataset.i18nPlaceholder, el.placeholder));
  $$('.lang-switch .chip').forEach(btn => btn.classList.toggle('active', btn.dataset.lang === state.language));
}

function toIsoOrNull(v) {
  if (!v) return null;
  try {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d.toISOString();
  } catch (e) { return null; }
}

/* ============= Auth ============= */
async function initAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  state.session = session;
  if (session) await loadProfile();

  supabase.auth.onAuthStateChange(async (event, session) => {
    state.session = session;
    if (session) {
      await loadProfile();
      if (event === 'SIGNED_IN') setFlash(tr('auth.magic_hint'));
    } else {
      state.profile = null;
    }
    renderUI();
    if (state.selectedEvent) {
      renderEventDetail();
    }
  });
}

async function loadProfile() {
  if (!state.session) return;
  const { data, error } = await supabase.from("profiles").select("*").eq("id", state.session.user.id).single();
  if (error) console.error("Profile fetch error:", error);
  else state.profile = data;
}

function isOrganizer() { return ["organizer", "admin"].includes(state.profile?.role); }

/* ============= Routing ============= */
function handleRouting() {
  const hash = window.location.hash;
  if (hash.startsWith("#/e/")) {
    const slug = hash.substring(4);
    openEventBySlug(slug);
  } else {
    showView("schedule");
  }
}

async function openEventBySlug(slug) {
  if (state.events.length === 0) await loadEvents();
  const event = state.events.find(e => e.slug === slug);
  if (event) {
    state.selectedEvent = event;
    renderEventDetail();
    showView("event");
  } else {
    setFlash("Event not found.");
    window.location.hash = "";
    showView("schedule");
  }
}

/* ============= Data Loading ============= */
async function loadEvents() {
  const { data, error } = await supabase.from("events").select("*").order("start_time", { ascending: false });
  if (error) { setFlash("Error loading events"); return; }
  state.events = data || [];
  if (state.session) await loadUserEventData();
  renderEventsList();
}

async function loadUserEventData() {
  if (!state.session) return;
  const userId = state.session.user.id;
  const [follows, rsvps] = await Promise.all([
    supabase.from('event_follows').select('event_id').eq('profile_id', userId),
    supabase.from('event_rsvps').select('event_id, status').eq('profile_id', userId)
  ]);
  state.userFollows = new Set((follows.data || []).map(f => f.event_id));
  state.userRsvps = new Map((rsvps.data || []).map(r => [r.event_id, r.status]));
}


/* ============= UI Rendering ============= */
function renderUI() {
  renderHeader();
  renderAuthView();
  renderEventsList();
  if (state.selectedEvent) renderEventDetail();
}

function renderHeader() {
  $("#btnSignIn").style.display = state.session ? "none" : "inline-block";
  $("#btnSignOut").style.display = state.session ? "inline-block" : "none";
  $("#btnAdmin").style.display = isOrganizer() ? "inline-block" : "none";
  $("#userName").style.display = state.session ? "inline" : "none";
  $("#userName").textContent = state.profile?.username || state.profile?.full_name || '';
}

function renderAuthView() {
const needsAuth = !state.session && (window.location.hash.startsWith('#/auth') || state.view === 'auth' || state.view === 'schedule');
  $("#auth").style.display = needsAuth ? "block" : "none";
}

function renderEventsList() {
  const list = $("#eventsList");
  const empty = $("#emptyEvents");
  if (!list || !empty) return;

  const now = new Date();
  const filtered = state.events.filter(e => {
    const startTime = new Date(e.start_time);
    if (state.eventTimeFilter === "upcoming" && startTime < now) return false;
    if (state.eventTimeFilter === "past" && startTime >= now) return false;
    if (state.eventLangFilter !== "all" && e.language !== state.eventLangFilter) return false;
    if (state.searchQuery) {
      const query = state.searchQuery.toLowerCase();
      return [e.title_en, e.title_es, e.description_en, e.description_es, e.host_org, ...(e.topic_tags || [])]
        .some(v => v?.toLowerCase().includes(query));
    }
    return true;
  });

  empty.style.display = filtered.length ? "none" : "block";
  list.innerHTML = filtered.map(ev => renderEventCard(ev)).join('');
}

function renderEventCard(ev) {
  const title = state.language === "es" ? (ev.title_es || ev.title_en) : (ev.title_en || ev.title_es);
  const rsvpStatus = state.userRsvps.get(ev.id);
  const isFollowing = state.userFollows.has(ev.id);

  return `
    <div class="event-card">
      <div class="when">${fmtDateTime(ev.start_time)}</div>
      <a href="#/e/${ev.slug}" class="event-title">${title}</a>
      <div class="tags">
        <span class="tag">${ev.language?.toUpperCase() || "BI"}</span>
        ${ev.host_org ? `<span class="tag">${ev.host_org}</span>` : ""}
        ${(ev.topic_tags || []).map(t => `<span class="tag tag-topic">${t}</span>`).join('')}
      </div>
      ${state.session ? `
        <div class="user-actions">
          <div class="rsvp-controls">
             <button class="chip ${rsvpStatus === 'going' ? 'active' : ''}" data-rsvp="going" data-id="${ev.id}">${tr('actions.going')}</button>
             <button class="chip ${rsvpStatus === 'interested' ? 'active' : ''}" data-rsvp="interested" data-id="${ev.id}">${tr('actions.interested')}</button>
          </div>
          <button class="follow-btn ${isFollowing ? 'following' : ''}" data-follow="${ev.id}">
            <svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"></path></svg>
            <span>${isFollowing ? tr('actions.following') : tr('actions.follow')}</span>
          </button>
        </div>
      ` : ''}
      <div class="card-footer">
        <button class="btn-ghost btn-sm" data-gcal="${ev.id}">${tr('actions.add_gcal')}</button>
        <button class="btn-ghost btn-sm" data-ics="${ev.id}">${tr('actions.download_ics')}</button>
      </div>
    </div>`;
}


function renderEventDetail() {
    if (!state.selectedEvent) return;
    const ev = state.selectedEvent;

    renderEventHeader(ev);
    renderEventActions(ev);
    renderEventAbout(ev);

    const isLoggedIn = !!state.session;
    $('#newThreadForm').style.display = isLoggedIn ? 'flex' : 'none';
    $('#uploadForm').style.display = isLoggedIn ? 'flex' : 'none';
    
    if (state.realtimeChannel?.topic !== `realtime:public:event:${ev.id}`) {
        unsubscribeFromEvent();
        loadThreads(ev.id);
        loadFiles(ev.id);
        subscribeToEvent(ev.id);
    }
}


function renderEventHeader(ev) {
  const title = state.language === "es" ? (ev.title_es || ev.title_en) : (ev.title_en || ev.title_es);
  $('#eventHeader').innerHTML = `
    <div class="title-bar">
      <h1 class="event-title">${title}</h1>
      <button class="btn-ghost" data-copy-link="${ev.id}">
        <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"></path></svg>
        <span>${tr('actions.copy_link')}</span>
      </button>
    </div>
    <div class="event-attrs">
      <span>${fmtDateTime(ev.start_time)}</span>
      ${ev.host_org ? `<span>• ${ev.host_org}</span>` : ""}
      <span>• ${ev.language?.toUpperCase()}</span>
    </div>`;
}

function renderEventActions(ev) {
  const actions = $('#eventActions');
  actions.innerHTML = '';
  const now = Date.now();
  const startTime = new Date(ev.start_time).getTime();
  const diffMinutes = (startTime - now) / (1000 * 60);

  if (ev.registration_url) actions.innerHTML += `<a href="${ev.registration_url}" target="_blank" rel="noopener" class="btn-primary">${tr('actions.register')}</a>`;
  if (ev.livestream_url) actions.innerHTML += `<a href="${ev.livestream_url}" target="_blank" rel="noopener" class="btn-secondary">${tr('actions.join_live')}</a>`;
  if (ev.recording_url) actions.innerHTML += `<a href="${ev.recording_url}" target="_blank" rel="noopener" class="btn-secondary">${tr('actions.watch_rec')}</a>`;
  
  if (ev.zoom_url) {
    if (state.session) {
      if (diffMinutes < 60 && diffMinutes > -120) {
        actions.innerHTML += `<a href="${ev.zoom_url}" target="_blank" rel="noopener" class="btn-primary">${tr('actions.join_zoom')}</a>`;
      } else {
        actions.innerHTML += `<button class="btn-primary" disabled>${tr('actions.zoom_soon')}</button>`;
      }
    } else {
      actions.innerHTML += `<button class="btn-primary" data-auth-prompt>${tr('actions.zoom_signin')}</button>`;
    }
  }
}

function renderEventAbout(ev) {
  const desc = state.language === "es" ? (ev.description_es || ev.description_en) : (ev.description_en || ev.description_es);
  $('#eventAbout').innerHTML = `<p>${desc ? desc.replace(/\n/g, "<br/>") : ""}</p>`;
}

/* ============= Discussion: Threads & Comments ============= */

async function loadThreads(eventId) {
    const { data, error } = await supabase.from("threads").select("*").eq("event_id", eventId).order("pinned", { ascending: false }).order("created_at", { ascending: true });
    if (error) { setFlash("Error loading topics"); return; }
    state.threads = data || [];
    $("#emptyThreads").style.display = state.threads.length ? "none" : "block";
    renderThreads();
}

function renderThreads() {
    const list = $("#threadsList");
    if (!list) return;
    list.innerHTML = "";
    for (const th of state.threads) {
        const wrap = document.createElement("div");
        wrap.className = `thread ${th.pinned ? 'pinned' : ''}`;
        wrap.innerHTML = `
          <div class="thread-title">
            ${escapeHtml(th.title)}
            ${th.pinned ? `<span class="tag">${tr('thread.pinned')}</span>` : ''}
          </div>
          <div class="comments" id="c_${th.id}"></div>
          ${state.session ? `
          <form class="reply-form" data-thread-id="${th.id}" data-parent-id="">
            <textarea placeholder="${tr('comment.placeholder')}" required></textarea>
            <button class="btn-primary" type="submit">${tr('comment.reply')}</button>
          </form>` : ''}
        `;
        list.appendChild(wrap);
        loadComments(th.id);
    }
}

async function loadComments(threadId) {
    const { data: comments, error: cErr } = await supabase.from("comments").select("*").eq("thread_id", threadId).order("created_at", { ascending: true });
    if (cErr) { console.error(cErr); return; }
    state.commentsByThread.set(threadId, comments || []);

    const commentIds = (comments || []).map(c => c.id);
    if (commentIds.length > 0) {
        const { data: likes, error: lErr } = await supabase.from("comment_likes").select("*").in("comment_id", commentIds);
        if (lErr) { console.error(lErr); }
        else {
            const likesMap = new Map();
            for (const like of likes) {
                if (!likesMap.has(like.comment_id)) likesMap.set(like.comment_id, []);
                likesMap.get(like.comment_id).push(like.profile_id);
            }
            state.likesByComment.set(threadId, likesMap);
            if (state.session) {
                state.userLikes = new Set(likes.filter(l => l.profile_id === state.session.user.id).map(l => l.comment_id));
            }
        }
    }
    renderComments(threadId);
}

function renderComments(threadId) {
    const container = $(`#c_${threadId}`);
    if (!container) return;
    container.innerHTML = "";
    const comments = state.commentsByThread.get(threadId) || [];
    const byParent = new Map([['_root', []]]);
    comments.forEach(c => {
        const pid = c.parent_id || "_root";
        if (!byParent.has(pid)) byParent.set(pid, []);
        byParent.get(pid).push(c);
    });
    (byParent.get("_root") || []).forEach(root => {
        container.appendChild(renderComment(root, byParent, threadId, 0));
    });
}

function renderComment(comment, byParent, threadId, level) {
    const el = document.createElement("div");
    el.className = "comment";
    const authorName = resolveProfileName(comment.created_by);
    const likesMap = state.likesByComment.get(threadId);
    const likeCount = likesMap?.get(comment.id)?.length || 0;
    const userHasLiked = state.userLikes.has(comment.id);

    el.innerHTML = `
      <div class="author">${authorName} • ${fmtDateTime(comment.created_at)}</div>
      <div class="text">${comment.is_deleted ? `<em>(deleted)</em>` : escapeHtml(comment.content)}</div>
      <div class="comment-actions">
        ${state.session ? `<button class="btn-like ${userHasLiked ? 'liked' : ''}" data-like="${comment.id}">
          <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path></svg>
          <span>${likeCount}</span>
        </button>` : ''}
        ${canEditComment(comment) ? `<button class="btn-ghost btn-sm" data-del-comment="${comment.id}" data-thread-id="${threadId}">${tr('comment.delete')}</button>` : ""}
      </div>
    `;

    if (level < 2 && state.session) {
        const form = document.createElement("form");
        form.className = "reply-form reply-form-nested";
        form.dataset.threadId = threadId;
        form.dataset.parentId = comment.id;
        form.innerHTML = `
          <textarea placeholder="${tr('comment.reply_placeholder')}"></textarea>
          <button class="btn-secondary" type="submit">${tr('comment.reply')}</button>
        `;
        el.appendChild(form);
    }
    
    (byParent.get(comment.id) || []).forEach(child => {
        el.appendChild(renderComment(child, byParent, threadId, level + 1));
    });
    return el;
}

function resolveProfileName(uid) {
    if (!uid) return "—";
    if (state.profileCache.has(uid)) {
        const p = state.profileCache.get(uid);
        return p.full_name || p.username || `User...`;
    }
    supabase.from("profiles").select("id,full_name,username").eq("id", uid).single()
        .then(({ data }) => {
            if (data) {
                state.profileCache.set(uid, data);
                // Re-render comments to show the fetched name
                if(state.selectedEvent) {
                    state.threads.forEach(t => renderComments(t.id));
                }
            }
        });
    return `User...`;
}

function canEditComment(c) {
    const uid = state.session?.user?.id;
    if (!uid) return false;
    return c.created_by === uid || isOrganizer();
}

async function createThread(title) {
    if (!title || !state.selectedEvent) return;
    const { error } = await supabase.from("threads").insert({
        event_id: state.selectedEvent.id, title, created_by: state.session.user.id,
    });
    if (error) { setFlash(error.message); return; }
    $("#threadTitle").value = "";
    await loadThreads(state.selectedEvent.id);
}

async function createComment(thread_id, parent_id, content) {
    const { error } = await supabase.from("comments").insert({
        event_id: state.selectedEvent.id, thread_id, parent_id, content, created_by: state.session.user.id,
    });
    if (error) setFlash(error.message);
    else await loadComments(thread_id);
}

async function deleteComment(commentId, threadId) {
    if (!confirm("Are you sure you want to delete this comment?")) return;
    const { error } = await supabase.from("comments").delete().eq("id", commentId);
    if (error) setFlash(error.message);
    else await loadComments(threadId);
}

async function handleLike(commentId, threadId) {
    if (!state.session) { showView('auth'); return; }
    const hasLiked = state.userLikes.has(commentId);
    const profile_id = state.session.user.id;

    if (hasLiked) {
        const { error } = await supabase.from('comment_likes').delete().match({ comment_id: commentId, profile_id });
        if (error) { setFlash(error.message); return; }
    } else {
        const { error } = await supabase.from('comment_likes').insert({ comment_id: commentId, profile_id });
        if (error) { setFlash(error.message); return; }
    }
    await loadComments(threadId);
}

/* ============= Files ============= */
async function loadFiles(eventId) {
    const { data, error } = await supabase.from("attachments").select("*").eq("event_id", eventId).order("created_at", { ascending: false });
    if (error) { setFlash("Error loading files"); return; }
    state.files = data || [];
    renderFiles();
}

async function renderFiles() {
    const grid = $("#filesList");
    const empty = $("#emptyFiles");
    if (!grid || !empty) return;

    grid.innerHTML = "";
    empty.style.display = state.files.length ? "none" : "block";

    for (const f of state.files) {
        const { data } = await supabase.storage.from("attachments").createSignedUrl(f.object_path, 60);
        const url = data?.signedUrl;
        const div = document.createElement("div");
        div.className = "file";
        div.innerHTML = `
          <div class="meta">
            <div class="name">${escapeHtml(f.file_name)}</div>
            <div class="size">${bytesToSize(f.file_size)}</div>
          </div>
          <div class="actions">
            <a class="btn-secondary" href="${url}" target="_blank" rel="noopener">Open</a>
            ${canDeleteFile(f) ? `<button class="btn-danger" data-del-file-id="${f.id}">Delete</button>` : ""}
          </div>
        `;
        grid.appendChild(div);
    };
}

async function uploadFile(file) {
    if (!file || !state.selectedEvent) return;
    const eventId = state.selectedEvent.id;
    const uniqueName = `${Date.now()}-${file.name}`;
    const object_path = `events/${eventId}/${uniqueName}`;

    const { error: upErr } = await supabase.storage.from("attachments").upload(object_path, file);
    if (upErr) { setFlash(upErr.message); return; }

    const { error: dbErr } = await supabase.from("attachments").insert({
        event_id: eventId, bucket_id: "attachments", object_path, file_name: file.name,
        file_type: file.type, file_size: file.size, created_by: state.session.user.id,
    });
    if (dbErr) { setFlash(dbErr.message); return; }
    
    setFlash("File uploaded");
    $("#uploadForm").reset();
    $("#fileName").textContent = "";
    await loadFiles(eventId);
}

async function deleteFile(fileId) {
    if (!confirm("Are you sure you want to delete this file?")) return;
    const fileToDelete = state.files.find(f => f.id === fileId);
    if (!fileToDelete) return;

    const { error: sErr } = await supabase.storage.from("attachments").remove([fileToDelete.object_path]);
    if (sErr) { setFlash(sErr.message); return; }

    const { error: dErr } = await supabase.from("attachments").delete().eq("id", fileId);
    if (dErr) { setFlash(dErr.message); return; }
    
    setFlash("File deleted");
    await loadFiles(state.selectedEvent.id);
}

function canDeleteFile(f) {
    const uid = state.session?.user?.id;
    if (!uid) return false;
    return f.created_by === uid || isOrganizer();
}

/* ============= General Actions & Calendar ============= */
async function handleRsvp(eventId, status) {
  if (!state.session) { showView('auth'); return; }
  const currentStatus = state.userRsvps.get(eventId);
  const newStatus = currentStatus === status ? null : status; // Toggle off

  const { error } = await supabase.from('event_rsvps').upsert({
      event_id: eventId, profile_id: state.session.user.id, status: newStatus
  }, { onConflict: 'event_id, profile_id' });
  
  if (error) { setFlash(error.message); return; }
  if (newStatus) state.userRsvps.set(eventId, newStatus);
  else state.userRsvps.delete(eventId);
  renderEventsList();
}

async function handleFollow(eventId) {
    if (!state.session) { showView('auth'); return; }
    const isFollowing = state.userFollows.has(eventId);
    if (isFollowing) {
        const { error } = await supabase.from('event_follows').delete().match({ event_id: eventId, profile_id: state.session.user.id });
        if (error) { setFlash(error.message); return; }
        state.userFollows.delete(eventId);
    } else {
        const { error } = await supabase.from('event_follows').insert({ event_id: eventId, profile_id: state.session.user.id });
        if (error) { setFlash(error.message); return; }
        state.userFollows.add(eventId);
    }
    renderEventsList();
}

async function createEvent(payload) {
    const { error } = await supabase.from("events").insert([payload]);
    if (error) { setFlash(`Error: ${error.message}`); return false; }
    setFlash("Event created successfully!");
    $("#createEventForm").reset();
    await loadEvents();
    showView("schedule");
    return true;
}

function generateGCalLink(ev) {
    const format = d => d.toISOString().replace(/[-:.]/g, '');
    const start = format(new Date(ev.start_time));
    const end = ev.end_time ? format(new Date(ev.end_time)) : format(new Date(new Date(ev.start_time).getTime() + 60*60*1000));
    const title = encodeURIComponent(state.language === "es" ? ev.title_es || ev.title_en : ev.title_en || ev.title_es);
    const desc = encodeURIComponent(state.language === "es" ? ev.description_es || ev.description_en : ev.description_en || ev.description_es);
    return `https://www.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${start}/${end}&details=${desc}`;
}
function generateIcsFile(ev) {
    const format = d => d.toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';
    const start = format(new Date(ev.start_time));
    const end = ev.end_time ? format(new Date(ev.end_time)) : format(new Date(new Date(ev.start_time).getTime() + 60*60*1000));
    const title = state.language === "es" ? ev.title_es || ev.title_en : ev.title_en || ev.title_es;
    const desc = state.language === "es" ? ev.description_es || ev.description_en : ev.description_en || ev.description_es;
    const ics = `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:${ev.id}@agrivoltaico.seminar\nDTSTAMP:${format(new Date())}\nDTSTART:${start}\nDTEND:${end}\nSUMMARY:${title}\nDESCRIPTION:${desc}\nEND:VEVENT\nEND:VCALENDAR`;
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${ev.slug || 'event'}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

/* Realtime Subscriptions */
function subscribeToEvent(eventId) {
    if (state.realtimeChannel) unsubscribeFromEvent();
    state.realtimeChannel = supabase.channel(`event:${eventId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'threads', filter: `event_id=eq.${eventId}` }, () => loadThreads(eventId))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'comments', filter: `event_id=eq.${eventId}` }, p => loadComments(p.new.thread_id || p.old.thread_id))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'comment_likes' }, async (p) => {
            const c = await supabase.from('comments').select('thread_id').eq('id', p.new?.comment_id || p.old?.comment_id).single();
            if (c.data) loadComments(c.data.thread_id);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'attachments', filter: `event_id=eq.${eventId}` }, () => loadFiles(eventId))
        .subscribe();
}

function unsubscribeFromEvent() {
    if (state.realtimeChannel) {
        supabase.removeChannel(state.realtimeChannel);
        state.realtimeChannel = null;
    }
}

/* ============= Views ============= */
function showView(view) {
    state.view = view;
    $$("#hero, #auth, #schedule, #eventDetail, #admin").forEach(el => el.style.display = "none");
    if (view === 'schedule') {
        $("#schedule").style.display = 'block';
        if (window.location.hash) window.location.hash = "";
        unsubscribeFromEvent();
        state.selectedEvent = null;
    } else if (view === 'event') {
        $("#eventDetail").style.display = 'block';
    } else if (view === 'admin') {
        if (!isOrganizer()) { showView('schedule'); return; }
        $("#admin").style.display = 'block';
    } else if (view === 'auth') {
        $("#auth").style.display = 'block';
        if (window.location.hash !== '#/auth') window.location.hash = "#/auth";
    }
}

/* ============= Wire-up ============= */
function wireUI() {
  // Auth
  $("#btnSignIn").addEventListener("click", () => showView('auth'));
  $("#btnSignOut").addEventListener("click", () => supabase.auth.signOut());
  $("#emailForm").addEventListener("submit", async e => {
    e.preventDefault();
    const email = $("#email").value.trim();
    if (!email) return;
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: REDIRECT_TO } });
    if (error) setFlash(error.message); else setFlash(tr('auth.magic_hint'));
  });
  $("#btnGoogle").addEventListener("click", () => supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: REDIRECT_TO } }));

  // Navigation
  $(".brand a").addEventListener("click", e => { e.preventDefault(); showView('schedule'); });
  $("#btnSchedule").addEventListener("click", () => showView('schedule'));
  $("#btnAdmin").addEventListener("click", () => showView('admin'));
  $("#backToSchedule").addEventListener("click", () => showView('schedule'));

  // Language Switcher
  $$(".lang-switch .chip").forEach(btn => btn.addEventListener("click", () => {
      state.language = btn.dataset.lang; localStorage.setItem("lang", state.language);
      applyI18n(); renderUI();
  }));

  // Event List Filters & Search
  $("#eventTimeFilter").addEventListener("click", e => {
    if (e.target.dataset.filter) {
      state.eventTimeFilter = e.target.dataset.filter;
      $$("#eventTimeFilter .chip").forEach(b => b.classList.remove('active'));
      e.target.classList.add('active'); renderEventsList();
    }
  });
  $("#langFilter").addEventListener("change", e => { state.eventLangFilter = e.target.value; renderEventsList(); });
  $("#search").addEventListener("input", e => { state.searchQuery = e.target.value; renderEventsList(); });

  // Event handlers on body for dynamic content
  document.body.addEventListener('click', e => {
      const gcal = e.target.closest('[data-gcal]')?.dataset.gcal;
      const ics = e.target.closest('[data-ics]')?.dataset.ics;
      const rsvp = e.target.closest('[data-rsvp]')?.dataset;
      const follow = e.target.closest('[data-follow]')?.dataset.follow;
      const copyLink = e.target.closest('[data-copy-link]')?.dataset.copyLink;
      const authPrompt = e.target.closest('[data-auth-prompt]');
      const like = e.target.closest('[data-like]')?.dataset.like;
      const delComment = e.target.closest('[data-del-comment]')?.dataset;
      const delFile = e.target.closest('[data-del-file-id]')?.dataset.delFileId;

      if(gcal) { e.preventDefault(); window.open(generateGCalLink(state.events.find(ev=>ev.id===gcal))); }
      if(ics) { e.preventDefault(); generateIcsFile(state.events.find(ev=>ev.id===ics)); }
      if(rsvp) { e.preventDefault(); handleRsvp(rsvp.id, rsvp.rsvp); }
      if(follow) { e.preventDefault(); handleFollow(follow); }
      if(authPrompt) { showView('auth'); }
      if(copyLink) {
          navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}#/e/${state.selectedEvent.slug}`);
          const button = e.target.closest('button');
          const span = button.querySelector('span');
          span.textContent = tr('actions.copied');
          setTimeout(() => span.textContent = tr('actions.copy_link'), 2000);
      }
      if(like) { handleLike(like, state.threads.find(t => t.comments?.has(like))?.id); }
      if(delComment) { deleteComment(delComment.delComment, delComment.threadId); }
      if(delFile) { deleteFile(delFile); }
  });

  // Discussion & File Forms
  document.body.addEventListener('submit', async e => {
      const form = e.target.closest('form');
      if (!form) return;
      e.preventDefault();
      
      const threadId = form.dataset.threadId;
      const parentId = form.dataset.parentId;
      if (threadId !== undefined) { // Is a comment form
          const content = form.querySelector('textarea').value.trim();
          if (content) {
              await createComment(threadId, parentId || null, content);
              form.reset();
          }
      }
  });

  $("#newThreadForm").addEventListener("submit", async e => {
    e.preventDefault();
    const title = $("#threadTitle").value.trim();
    if(title) await createThread(title);
  });

  $("#uploadForm").addEventListener("submit", async e => {
    e.preventDefault();
    const file = $("#fileInput").files[0];
    if(file) await uploadFile(file);
  });
  $("#fileInput").addEventListener('change', () => {
    $("#fileName").textContent = $("#fileInput").files[0]?.name || '';
  });

  // Tabs
  $$(".tab").forEach(tab => tab.addEventListener("click", () => {
      $$(".tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      $$(".tab-panel").forEach(p => p.style.display = "none");
      $("#tab_" + tab.dataset.tab).style.display = "block";
  }));
  
  // Admin Form
  $("#createEventForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const payload = {
        title_en: $("#titleEn").value.trim(), title_es: $("#titleEs").value.trim() || null,
        description_en: $("#descEn").value.trim() || null, description_es: $("#descEs").value.trim() || null,
        start_time: toIsoOrNull($("#startTime").value), end_time: toIsoOrNull($("#endTime").value),
        language: $("#eventLang").value, host_org: $("#hostOrg").value.trim() || null,
        zoom_url: $("#zoomUrl").value.trim() || null, registration_url: $("#registrationUrl").value.trim() || null,
        livestream_url: $("#livestreamUrl").value.trim() || null, recording_url: $("#recordingUrl").value.trim() || null,
        topic_tags: $("#topicTags").value.split(',').map(t => t.trim()).filter(Boolean),
        created_by: state.session.user.id,
      };
      if (!payload.title_en || !payload.start_time) { setFlash("Title (EN) and Start Time are required."); return; }
      await createEvent(payload);
  });
  
  $("#year").textContent = new Date().getFullYear();
}

/* ============= Bootstrap ============= */
async function main() {
  wireUI();
  applyI18n();
  await initAuth();
  await loadEvents();
  handleRouting();
  window.addEventListener('hashchange', handleRouting);
  renderUI();
}

main();