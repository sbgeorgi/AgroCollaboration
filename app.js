import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* ================== CONFIG ================== */
const SUPABASE_URL = "https://iuzgfldgvueuehybgntm.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1emdmbGRndnVldWVoeWJnbnRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY4Mjc0MjUsImV4cCI6MjA3MjQwMzQyNX0.do919Hvw2AK-Ql-2V5guoRRH2yx4Rmset4eeVXi__o8";

const REDIRECT_TO = window.location.origin + window.location.pathname;
/* ============================================ */

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

let isCreatingEvent = false;
let activeChannel = null;

const state = {
  session: null,
  profile: null,
  language: localStorage.getItem("lang") || "en",
  events: [],
  selectedEvent: null,
  threads: [],
  commentsByThread: new Map(),
  profileCache: new Map(),
  files: [],
  // New
  viewFilter: localStorage.getItem("viewFilter") || "upcoming", // upcoming | past | all
  langFilter: localStorage.getItem("langFilter") || "all", // all | en | es | bi
  followedEventIds: new Set(),
  rsvpsByEvent: new Map(), // eventId -> going|interested|not_going
  likesCount: new Map(), // commentId -> number
  likedComments: new Set(), // commentIds the current user liked
};

// Basic i18n
const t = {
  en: {
    tagline: "An informal seminar series to share advances in agrivoltaics in Latin America",
    intro: "Agrivoltaics (agrivoltaics) is an emerging field that integrates solar energy with crop/livestock production. This bilingual seminar focuses on Latin America. Hosted by UNAM and University of Arizona.",
    format: "Online • Monthly • 1 hour (30 min talk + 30 min discussion)",
    hosted: "Hosted by UNAM & University of Arizona",
    nav: { schedule: "Schedule", community: "Community", admin: "Admin" },
    auth: {
      title: "Sign in to participate",
      signin: "Sign in",
      signout: "Sign out",
      email: "Email",
      magic: "Send magic link",
      magic_hint: "We'll email you a sign-in link. Check your inbox.",
      or: "or",
      google: "Sign in with Google",
    },
    schedule: { title: "Upcoming Talks", empty: "No events yet. Check back soon." },
    search: { placeholder: "Search..." },
    back: { schedule: "Back to schedule" },
    tabs: { discussion: "Discussion", files: "Files", about: "About" },
    thread: { placeholder: "New topic title…", create: "Create Topic", empty: "No topics yet. Start the discussion!" },
    files: { upload: "Upload", empty: "No files yet." },
    admin: { title: "Organizer Tools" },
    event: {
      title_en: "Title (EN)",
      title_es: "Title (ES)",
      desc_en: "Description (EN)",
      desc_es: "Description (ES)",
      start: "Start time",
      end: "End time",
      host: "Host org",
      zoom: "Zoom URL (members only)",
      lang: "Language",
      create: "Create Event",
      registration: "Registration URL",
      livestream: "Livestream URL",
      recording: "Recording URL",
      tags: "Tags",
    },
    footer: { note: "Bilingual, community-driven seminar on agrivoltaics in Latin America." },
    filters: { upcoming: "Upcoming", past: "Past", all: "All", lang_all: "All languages" },
    actions: {
      follow: "Follow",
      unfollow: "Unfollow",
      add_to_cal: "Add to calendar",
      google_cal: "Google Calendar",
      download_ics: "Download .ics",
      share: "Share",
      open: "Open",
      view: "View",
      join_zoom: "Join Zoom",
      sign_in_zoom: "Sign in to access Zoom",
      copy_link: "Copy link",
      copied: "Copied!",
      recording: "Recording",
      livestream: "Livestream",
      registration: "Registration",
    },
    rsvp: { none: "RSVP", going: "Going", interested: "Interested", not_going: "Not going", saved: "RSVP saved" },
    discuss: { sign_in: "Sign in to participate in the discussion." },
    realtime: { live_updates: "Live updates enabled" },
    likes: { like: "Like", unlike: "Unlike" },
    moderator: { pin: "Pin", unpin: "Unpin", delete: "Delete" }
  },
  es: {
    tagline: "Serie de seminarios informales para compartir avances en agrofotovoltaica en América Latina",
    intro: "La agrofotovoltaica integra energía solar con producción agrícola/ganadera. Este seminario bilingüe se enfoca en América Latina. Organizado por UNAM y University of Arizona.",
    format: "En línea • Mensual • 1 hora (30 min charla + 30 min discusión)",
    hosted: "Organizado por UNAM y University of Arizona",
    nav: { schedule: "Calendario", community: "Comunidad", admin: "Admin" },
    auth: {
      title: "Inicia sesión para participar",
      signin: "Iniciar sesión",
      signout: "Cerrar sesión",
      email: "Correo",
      magic: "Enviar enlace mágico",
      magic_hint: "Te enviaremos un enlace de acceso. Revisa tu bandeja.",
      or: "o",
      google: "Entrar con Google",
    },
    schedule: { title: "Próximas charlas", empty: "Aún no hay eventos. Vuelve pronto." },
    search: { placeholder: "Buscar..." },
    back: { schedule: "Volver al calendario" },
    tabs: { discussion: "Discusión", files: "Archivos", about: "Acerca de" },
    thread: { placeholder: "Título del nuevo tema…", create: "Crear tema", empty: "Aún no hay temas. ¡Comienza la discusión!" },
    files: { upload: "Subir", empty: "Aún no hay archivos." },
    admin: { title: "Herramientas para organizadores" },
    event: {
      title_en: "Título (EN)",
      title_es: "Título (ES)",
      desc_en: "Descripción (EN)",
      desc_es: "Descripción (ES)",
      start: "Inicio",
      end: "Fin",
      host: "Institución anfitriona",
      zoom: "Enlace de Zoom (solo miembros)",
      lang: "Idioma",
      create: "Crear evento",
      registration: "URL de registro",
      livestream: "URL de transmisión",
      recording: "URL de grabación",
      tags: "Etiquetas",
    },
    footer: { note: "Seminario bilingüe y comunitario sobre agrofotovoltaica en América Latina." },
    filters: { upcoming: "Próximos", past: "Pasados", all: "Todos", lang_all: "Todos los idiomas" },
    actions: {
      follow: "Seguir",
      unfollow: "Dejar de seguir",
      add_to_cal: "Agregar al calendario",
      google_cal: "Google Calendar",
      download_ics: "Descargar .ics",
      share: "Compartir",
      open: "Abrir",
      view: "Ver",
      join_zoom: "Entrar a Zoom",
      sign_in_zoom: "Inicia sesión para acceder a Zoom",
      copy_link: "Copiar enlace",
      copied: "¡Copiado!",
      recording: "Grabación",
      livestream: "Transmisión",
      registration: "Registro",
    },
    rsvp: { none: "Confirmar", going: "Asistiré", interested: "Interesado", not_going: "No asistiré", saved: "Confirmación guardada" },
    discuss: { sign_in: "Inicia sesión para participar en la discusión." },
    realtime: { live_updates: "Actualizaciones en vivo activadas" },
    likes: { like: "Me gusta", unlike: "Quitar me gusta" },
    moderator: { pin: "Fijar", unpin: "Desfijar", delete: "Eliminar" }
  },
};

function tr(key, fallback="") {
  const lang = state.language;
  const parts = key.split(".");
  let obj = t[lang];
  for (const p of parts) obj = obj?.[p];
  return obj ?? fallback;
}

/* ============== UI helpers ============== */
const $ = sel => document.querySelector(sel);

function setFlash(msg, timeout = 3000) {
  const el = $("#flash");
  if (!el) return;
  el.textContent = msg;
  el.style.display = "block";
  clearTimeout(setFlash._t);
  setFlash._t = setTimeout(() => (el.style.display = "none"), timeout);
}

function fmtDateTime(iso) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch(_) { return iso; }
}

function toYmdHisZ(iso) {
  try {
    const d = new Date(iso);
    return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  } catch (_) {
    return "";
  }
}

function bytesToSize(bytes = 0) {
  if (bytes === 0) return "0 B";
  const k = 1024, sizes = ["B","KB","MB","GB","TB"];
  const i = Math.floor(Math.log(bytes)/Math.log(k));
  return parseFloat((bytes/Math.pow(k,i)).toFixed(2)) + " " + sizes[i];
}

function applyI18n() {
  document.querySelectorAll("[data-i18n]").forEach(el => {
    el.textContent = tr(el.dataset.i18n, el.textContent);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    el.placeholder = tr(el.dataset.i18nPlaceholder, el.placeholder);
  });
  document.querySelectorAll('.lang-switch .chip').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === state.language);
  });

  // Update dynamic labels
  $("#scheduleTitle")?.textContent = tr("schedule.title");
}

function toIsoOrNull(v) {
  if (!v) return null;
  try {
    const localDate = new Date(v);
    if (isNaN(localDate.getTime())) return null;
    return localDate.toISOString();
  } catch(e) {
    console.error("Date conversion error:", e);
    return null;
  }
}

function escapeHtml(s="") {
  return s.replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[m]));
}

function linkify(text="") {
  // Very light linkify
  return escapeHtml(text).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
}

function genSlug(s="") {
  const base = (s || "").toLowerCase().trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  const suffix = Math.random().toString(36).slice(2, 6); // ensure uniqueness
  return base ? `${base}-${suffix}` : `event-${suffix}`;
}

function isPast(ev) {
  const end = ev.end_time ? new Date(ev.end_time) : new Date(ev.start_time);
  return end.getTime() < Date.now();
}

function isSoon(ev, mins = 60) {
  const start = new Date(ev.start_time).getTime();
  return start - Date.now() <= mins * 60 * 1000 && start - Date.now() > -mins * 60 * 1000;
}

/* ============= Auth ============= */
async function initAuth() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    state.session = session;
    if (session) {
      await ensureProfile();
      await loadFollows();
      await loadMyRsvps();
    }
  } catch (err) {
    console.error("Session check error:", err);
  }

  supabase.auth.onAuthStateChange(async (_event, session) => {
    state.session = session;
    if (session) {
      await ensureProfile();
      await loadFollows();
      await loadMyRsvps();
      setFlash(state.language === "es" ? "Sesión iniciada" : "Signed in");
    } else {
      state.profile = null;
      state.followedEventIds.clear();
      state.rsvpsByEvent.clear();
      setFlash(state.language === "es" ? "Sesión cerrada" : "Signed out");
    }
    renderHeader();
    renderAuthUI();
    renderEventsList();
    if (state.selectedEvent) renderEventHeader();
  });
}

function renderAuthUI() {
  const authSection = $("#auth");
  const heroSection = $("#hero");
  const btnSignIn = $("#btnSignIn");
  const btnSignOut = $("#btnSignOut");
  const userName = $("#userName");

  // Show hero always, show auth if not signed in
  if (state.session) {
    if (authSection) authSection.style.display = "none";
    if (heroSection) heroSection.style.display = "block";
    btnSignIn.style.display = "none";
    btnSignOut.style.display = "inline-block";
    userName.style.display = "inline";
    userName.textContent = state.profile?.full_name ? `@${state.profile.full_name}` : "";
  } else {
    if (authSection) authSection.style.display = "block";
    if (heroSection) heroSection.style.display = "block";
    btnSignIn.style.display = "inline-block";
    btnSignOut.style.display = "none";
    userName.style.display = "none";
  }
}

async function ensureProfile() {
  const uid = state.session?.user?.id;
  if (!uid) return;
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", uid)
      .single();
    if (error) {
      console.error("Profile fetch error:", error);
      return;
    }
    state.profile = data;
  } catch (err) {
    console.error("Profile error:", err);
  }
}

async function sendMagicLink(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: REDIRECT_TO },
  });
  if (error) setFlash(`Error: ${error.message}`);
  else setFlash(state.language === "es" ? "Enlace enviado. Revisa tu correo." : "Magic link sent. Check your email.");
}

async function oauth(provider) {
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: REDIRECT_TO }
  });
  if (error) setFlash(`Error: ${error.message}`);
}

/* ============= Data ============= */
async function loadEvents() {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .order("start_time", { ascending: true });
  if (error) {
    console.error("Load events error:", error);
    setFlash("Error loading events");
    return;
  }
  state.events = data || [];
  renderEventsList();

  // If routing has an event in hash, open it
  handleRouting();
}

function renderEventsList() {
  const list = $("#eventsList");
  const empty = $("#emptyEvents");
  if (!list || !empty) return;

  list.innerHTML = "";
  const term = ($("#search")?.value || "").toLowerCase().trim();

  const filtered = state.events.filter(e => {
    // filter: viewFilter
    if (state.viewFilter === "upcoming" && isPast(e)) return false;
    if (state.viewFilter === "past" && !isPast(e)) return false;
    // language filter
    if (state.langFilter !== "all" && (e.language || "bi") !== state.langFilter) return false;
    // term filter
    if (!term) return true;
    return [e.title_en, e.title_es, e.description_en, e.description_es, e.host_org]
      .filter(Boolean).some(v => v.toLowerCase().includes(term));
  });

  empty.style.display = filtered.length ? "none" : "block";

  for (const ev of filtered) {
    const card = document.createElement("div");
    card.className = "event-card";

    const title = state.language === "es" ? (ev.title_es || ev.title_en) : (ev.title_en || ev.title_es);
    const desc = state.language === "es" ? (ev.description_es || ev.description_en) : (ev.description_en || ev.description_es);
    const isFollowed = state.followedEventIds.has(ev.id);

    card.innerHTML = `
      <div class="when">${fmtDateTime(ev.start_time)}${ev.end_time ? " – " + fmtDateTime(ev.end_time) : ""}</div>
      <div class="event-title">${escapeHtml(title)}</div>
      ${desc ? `<div class="event-desc">${escapeHtml(desc.substring(0, 160))}${desc.length > 160 ? "…" : ""}</div>` : ""}
      <div class="tags">
        <span class="tag">${(ev.language || "bi").toUpperCase()}</span>
        <span class="tag">${ev.status || (isPast(ev) ? "completed" : "scheduled")}</span>
        ${ev.host_org ? `<span class="tag">${escapeHtml(ev.host_org)}</span>` : ""}
      </div>
      <div class="actions">
        <button class="btn-secondary" data-open="${ev.id}">${tr("actions.open","Open")}</button>
        <div class="dropdown">
          <button class="btn-ghost" data-cal="${ev.id}">📅 ${tr("actions.add_to_cal")}</button>
          <div class="dropdown-menu" data-cal-menu="${ev.id}" style="display:none;">
            <button class="dropdown-item" data-cal-google="${ev.id}">${tr("actions.google_cal")}</button>
            <button class="dropdown-item" data-cal-ics="${ev.id}">${tr("actions.download_ics")}</button>
          </div>
        </div>
        <button class="btn-ghost" data-follow="${ev.id}">${isFollowed ? "★" : "☆"} ${isFollowed ? tr("actions.unfollow") : tr("actions.follow")}</button>
      </div>
    `;

    card.querySelector("[data-open]")?.addEventListener("click", () => openEvent(ev.id));
    const calBtn = card.querySelector(`[data-cal="${ev.id}"]`);
    const calMenu = card.querySelector(`[data-cal-menu="${ev.id}"]`);
    calBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (calMenu) calMenu.style.display = calMenu.style.display === "none" ? "block" : "none";
    });
    card.querySelector(`[data-cal-google="${ev.id}"]`)?.addEventListener("click", () => openGoogleCal(ev));
    card.querySelector(`[data-cal-ics="${ev.id}"]`)?.addEventListener("click", () => downloadICS(ev));

    card.querySelector("[data-follow]")?.addEventListener("click", () => toggleFollow(ev.id));

    list.appendChild(card);
  }
}

async function openEvent(eventIdOrSlug) {
  let ev = state.events.find(e => e.id === eventIdOrSlug || e.slug === eventIdOrSlug);
  if (!ev) {
    // Try fetch by slug or id
    let q = supabase.from("events").select("*").limit(1);
    if (typeof eventIdOrSlug === "string" && eventIdOrSlug.length > 20) {
      const { data } = await supabase.from("events").select("*").eq("id", eventIdOrSlug).single();
      ev = data || null;
    } else {
      const { data } = await supabase.from("events").select("*").eq("slug", eventIdOrSlug).single();
      ev = data || null;
    }
    if (!ev) return;
    // Add to local cache
    if (!state.events.find(x => x.id === ev.id)) state.events.push(ev);
  }

  state.selectedEvent = ev;
  // Update hash for deep link
  window.location.hash = `#/e/${encodeURIComponent(ev.slug || ev.id)}`;

  renderEventHeader();
  await loadThreads(ev.id);
  await loadFiles(ev.id);
  showView("event");
  subscribeToEvent(ev.id);
}

function renderEventHeader() {
  const ev = state.selectedEvent;
  if (!ev) return;

  const title = state.language === "es" ? (ev.title_es || ev.title_en) : (ev.title_en || ev.title_es);
  const desc = state.language === "es" ? (ev.description_es || ev.description_en) : (ev.description_en || ev.description_es);
  const header = $("#eventHeader");
  const about = $("#eventAbout");
  const followBtn = $("#btnFollowEvent");
  const rsvpSelect = $("#rsvpSelect");
  const btnAddToCal = $("#btnAddToCal");
  const calMenu = $("#calMenu");
  const btnShare = $("#btnShare");

  const tagsHtml = `
    <div class="event-attrs">
      <span>${fmtDateTime(ev.start_time)}${ev.end_time ? " – " + fmtDateTime(ev.end_time) : ""}</span>
      ${ev.host_org ? `<span>• ${escapeHtml(ev.host_org)}</span>` : ""}
      <span>• ${(ev.language || "bi").toUpperCase()}</span>
      ${ev.zoom_url ? `<span>• 🔒 Zoom</span>` : ""}
      ${isSoon(ev) ? `<span>• ⏰ Soon</span>` : ""}
    </div>
  `;

  if (header) {
    header.innerHTML = `
      <div class="event-title">${escapeHtml(title)}</div>
      ${tagsHtml}
    `;
  }

  if (about) {
    const zoomHtml = ev.zoom_url
      ? (state.session
        ? `<p><strong>Zoom:</strong> <a href="${ev.zoom_url}" target="_blank" rel="noopener">${tr("actions.join_zoom")}</a></p>`
        : `<p>🔒 ${tr("actions.sign_in_zoom")}</p>`)
      : "";

    const regHtml = ev.registration_url ? `<p>📝 <a href="${ev.registration_url}" target="_blank" rel="noopener">${tr("actions.registration")}</a></p>` : "";
    const liveHtml = ev.livestream_url ? `<p>🔴 <a href="${ev.livestream_url}" target="_blank" rel="noopener">${tr("actions.livestream")}</a></p>` : "";
    const recHtml = ev.recording_url ? `<p>🎥 <a href="${ev.recording_url}" target="_blank" rel="noopener">${tr("actions.recording")}</a></p>` : "";

    about.innerHTML = `
      ${desc ? `<p>${linkify(desc).replace(/\n/g, "<br/>")}</p>` : ""}
      ${zoomHtml}
      ${regHtml}
      ${liveHtml}
      ${recHtml}
    `;
  }

  // Follow button
  if (followBtn) {
    const isFollowed = state.followedEventIds.has(ev.id);
    followBtn.innerHTML = `${isFollowed ? "★" : "☆"} ${isFollowed ? tr("actions.unfollow") : tr("actions.follow")}`;
    followBtn.onclick = () => toggleFollow(ev.id);
  }

  // RSVP select
  if (rsvpSelect) {
    const existing = state.rsvpsByEvent.get(ev.id) || "";
    rsvpSelect.value = existing || "";
    rsvpSelect.onchange = async () => {
      if (!state.session) {
        setFlash(state.language === "es" ? "Inicia sesión para confirmar" : "Sign in to RSVP");
        rsvpSelect.value = existing || "";
        return;
      }
      await setRsvp(ev.id, rsvpSelect.value || null);
      setFlash(tr("rsvp.saved"));
    };
  }

  // Calendar dropdown in header
  if (btnAddToCal && calMenu) {
    btnAddToCal.onclick = () => {
      calMenu.style.display = calMenu.style.display === "none" ? "block" : "none";
    };
    $("#calGoogle")?.addEventListener("click", () => openGoogleCal(ev));
    $("#calIcs")?.addEventListener("click", () => downloadICS(ev));
  }

  // Share
  if (btnShare) {
    btnShare.onclick = async () => {
      const url = window.location.href;
      try {
        await navigator.clipboard.writeText(url);
        setFlash(tr("actions.copied"));
      } catch {
        setFlash(url);
      }
    };
  }
}

/* Threads and comments */
async function loadThreads(eventId) {
  const { data, error } = await supabase
    .from("threads")
    .select("*")
    .eq("event_id", eventId)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) { console.error(error); setFlash("Error loading topics"); return; }
  state.threads = data || [];
  const empty = $("#emptyThreads");
  if (empty) empty.style.display = state.threads.length ? "none" : "block";
  renderThreads();
}

function renderThreads() {
  const list = $("#threadsList");
  if (!list) return;
  list.innerHTML = "";

  // Gate thread creation if not logged in
  const newThreadForm = $("#newThreadForm");
  if (newThreadForm) {
    const input = $("#threadTitle");
    newThreadForm.style.display = state.session ? "flex" : "none";
    if (!state.session) {
      const info = document.createElement("div");
      info.className = "empty";
      info.textContent = tr("discuss.sign_in");
      list.appendChild(info);
    }
  }

  for (const th of state.threads) {
    const wrap = document.createElement("div");
    wrap.className = "thread";
    wrap.innerHTML = `
      <div class="thread-header">
        <div class="thread-title">${escapeHtml(th.title)} ${th.pinned ? "📌" : ""}</div>
        <div class="thread-actions">
          ${isOrganizer() ? `<button class="btn-ghost btn-sm" data-pin="${th.id}">${th.pinned ? tr("moderator.unpin") : tr("moderator.pin")}</button>` : ""}
        </div>
      </div>
      <div class="comments" id="c_${th.id}"></div>
      ${state.session ? `
      <form class="reply-form" data-thread="${th.id}">
        <textarea placeholder="${state.language === "es" ? "Escribe un comentario…" : "Write a comment…"}" required></textarea>
        <button class="btn-primary" type="submit">${state.language === "es" ? "Comentar" : "Comment"}</button>
      </form>` : ""}
    `;
    list.appendChild(wrap);
    loadComments(th.id);

    // Reply handler (fixed)
    const replyForm = wrap.querySelector("form.reply-form");
    if (replyForm) {
      replyForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const content = replyForm.querySelector("textarea").value.trim();
        if (!content) return;
        await createComment(th.id, null, content);
        replyForm.reset();
        await loadComments(th.id);
      });
    }

    // Pin/unpin
    wrap.querySelectorAll("[data-pin]").forEach(btn => {
      btn.addEventListener("click", async () => {
        await togglePinThread(btn.getAttribute("data-pin"));
      });
    });
  }
}

async function loadComments(threadId) {
  const { data, error } = await supabase
    .from("comments")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  if (error) { console.error(error); return; }
  state.commentsByThread.set(threadId, data || []);
  // Load likes for these comments
  await loadLikesForComments((data || []).map(c => c.id));
  renderComments(threadId);
}

function renderComments(threadId) {
  const container = document.getElementById(`c_${threadId}`);
  if (!container) return;
  container.innerHTML = "";
  const comments = state.commentsByThread.get(threadId) || [];

  const byParent = new Map();
  comments.forEach(c => {
    const pid = c.parent_id || "_root";
    if (!byParent.has(pid)) byParent.set(pid, []);
    byParent.get(pid).push(c);
  });

  (byParent.get("_root") || []).forEach(root => {
    container.appendChild(renderComment(root, byParent, 0));
  });
}

function renderComment(comment, byParent, level) {
  const el = document.createElement("div");
  el.className = "comment";
  const authorName = resolveProfileName(comment.created_by);
  const likeCount = state.likesCount.get(comment.id) || 0;
  const userLiked = state.likedComments.has(comment.id);
  el.innerHTML = `
    <div class="author">${escapeHtml(authorName)} • ${fmtDateTime(comment.created_at)}</div>
    <div class="text">${comment.is_deleted ? "<em>(deleted)</em>" : linkify(comment.content)}</div>
    <div class="comment-actions">
      <button class="btn-ghost btn-sm" data-like="${comment.id}">${userLiked ? "♥" : "♡"} ${likeCount}</button>
      ${canEditComment(comment) ? `<button class="btn-ghost btn-sm" data-del="${comment.id}">${tr("moderator.delete")}</button>` : ""}
    </div>
  `;

  // Reply for top-level only
  if (state.session && level < 1) {
    const form = document.createElement("form");
    form.className = "reply-form";
    form.innerHTML = `
      <textarea placeholder="${state.language === "es" ? "Responder…" : "Reply…"}"></textarea>
      <button class="btn-secondary" type="submit">${state.language === "es" ? "Responder" : "Reply"}</button>
    `;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const content = form.querySelector("textarea").value.trim();
      if (!content) return;
      await createComment(comment.thread_id, comment.id, content);
      form.reset();
      await loadComments(comment.thread_id);
    });
    el.appendChild(form);
  }

  el.querySelectorAll("[data-del]").forEach(btn => {
    btn.addEventListener("click", async () => {
      await deleteComment(btn.dataset.del, comment.thread_id);
    });
  });

  el.querySelectorAll("[data-like]").forEach(btn => {
    btn.addEventListener("click", async () => {
      await toggleLike(btn.dataset.like);
      await loadLikesForComments([comment.id]);
      renderComments(comment.thread_id);
    });
  });

  (byParent.get(comment.id) || []).forEach(child => {
    el.appendChild(renderComment(child, byParent, level + 1));
  });
  return el;
}

function resolveProfileName(uid) {
  if (!uid) return "—";
  if (state.profileCache.has(uid)) {
    const p = state.profileCache.get(uid);
    return p.full_name || p.username || "User";
  }
  supabase.from("profiles").select("id,full_name,username").eq("id", uid).single()
    .then(({ data }) => {
      if (data) {
        state.profileCache.set(uid, data);
      }
    });
  return "User";
}

function canEditComment(c) {
  const uid = state.session?.user?.id;
  if (!uid) return false;
  if (c.created_by === uid) return true;
  return ["organizer", "admin"].includes(state.profile?.role);
}

async function createThread(title) {
  if (!title || !state.selectedEvent) return;
  if (!state.session) { setFlash(tr("discuss.sign_in")); return; }
  const { error } = await supabase.from("threads").insert({
    event_id: state.selectedEvent.id,
    title,
    created_by: state.session.user.id,
  });
  if (error) { setFlash(error.message); return; }
  await loadThreads(state.selectedEvent.id);
}

async function createComment(thread_id, parent_id, content) {
  if (!state.session) { setFlash(tr("discuss.sign_in")); return; }
  const { error } = await supabase.from("comments").insert({
    event_id: state.selectedEvent.id,
    thread_id,
    parent_id,
    content,
    created_by: state.session.user.id,
  });
  if (error) setFlash(error.message);
}

async function deleteComment(commentId, threadId) {
  const { error } = await supabase.from("comments").delete().eq("id", commentId);
  if (error) setFlash(error.message);
  else await loadComments(threadId);
}

async function togglePinThread(threadId) {
  if (!isOrganizer()) return;
  const th = state.threads.find(t => t.id === threadId);
  if (!th) return;
  const { error } = await supabase.from("threads").update({ pinned: !th.pinned }).eq("id", threadId);
  if (error) setFlash(error.message);
  else await loadThreads(state.selectedEvent.id);
}

/* Likes */
async function loadLikesForComments(commentIds = []) {
  if (!commentIds.length) return;
  const { data, error } = await supabase
    .from("comment_likes")
    .select("comment_id, profile_id")
    .in("comment_id", commentIds);
  if (error) { console.error(error); return; }

  const counts = new Map();
  const liked = new Set(state.likedComments);
  const uid = state.session?.user?.id;
  (data || []).forEach(row => {
    counts.set(row.comment_id, (counts.get(row.comment_id) || 0) + 1);
    if (uid && row.profile_id === uid) liked.add(row.comment_id);
  });
  // Ensure comments with zero likes are set to zero
  commentIds.forEach(id => {
    if (!counts.has(id)) counts.set(id, 0);
  });

  state.likesCount = counts;
  state.likedComments = liked;
}

async function toggleLike(commentId) {
  if (!state.session) { setFlash(tr("discuss.sign_in")); return; }
  const uid = state.session.user.id;
  const liked = state.likedComments.has(commentId);

  if (liked) {
    const { error } = await supabase
      .from("comment_likes").delete()
      .eq("comment_id", commentId)
      .eq("profile_id", uid);
    if (error) setFlash(error.message);
    else state.likedComments.delete(commentId);
  } else {
    const { error } = await supabase
      .from("comment_likes").insert({ comment_id: commentId, profile_id: uid });
    if (error) setFlash(error.message);
    else state.likedComments.add(commentId);
  }
}

/* Files */
async function loadFiles(eventId) {
  const { data, error } = await supabase
    .from("attachments")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });
  if (error) { console.error(error); setFlash("Error loading files"); return; }
  state.files = data || [];
  renderFiles();
}

async function uploadFile(file) {
  if (!file || !state.selectedEvent) return;
  if (!state.session) { setFlash(state.language === "es" ? "Inicia sesión para subir" : "Sign in to upload"); return; }

  const eventId = state.selectedEvent.id;
  const uniqueName = `${Date.now()}-${file.name}`;
  const object_path = `events/${eventId}/${uniqueName}`;

  const { error: upErr } = await supabase.storage
    .from("attachments")
    .upload(object_path, file, { upsert: false });
  if (upErr) { setFlash(upErr.message); return; }

  const { error: dbErr } = await supabase.from("attachments").insert({
    event_id: eventId,
    bucket_id: "attachments",
    object_path,
    file_name: file.name,
    file_type: file.type,
    file_size: file.size,
    created_by: state.session.user.id,
  });
  if (dbErr) {
    setFlash(dbErr.message);
    return;
  }
  setFlash(state.language === "es" ? "Archivo subido" : "File uploaded");
  await loadFiles(eventId);
}

async function getSignedUrl(path) {
  const { data, error } = await supabase
    .storage
    .from("attachments")
    .createSignedUrl(path, 60 * 60);
  if (error) return null;
  return data.signedUrl;
}

function renderFiles() {
  const grid = $("#filesList");
  const empty = $("#emptyFiles");
  if (!grid || !empty) return;

  grid.innerHTML = "";
  empty.style.display = state.files.length ? "none" : "block";

  state.files.forEach(async f => {
    const div = document.createElement("div");
    div.className = "file";
    const url = await getSignedUrl(f.object_path);
    div.innerHTML = `
      <div class="meta">
        <div class="name">${escapeHtml(f.file_name)}</div>
        <div class="size">${bytesToSize(f.file_size)}</div>
      </div>
      <div class="actions">
        <a class="btn-secondary" href="${url}" target="_blank" rel="noopener">${state.language === "es" ? "Abrir" : "Open"}</a>
        ${canDeleteFile(f) ? `<button class="btn-danger" data-del="${f.object_path}">Delete</button>` : ""}
      </div>
    `;
    div.querySelectorAll("[data-del]").forEach(btn => {
      btn.addEventListener("click", () => deleteFile(f));
    });
    grid.appendChild(div);
  });
}

function canDeleteFile(f) {
  const uid = state.session?.user?.id;
  if (!uid) return false;
  return f.created_by === uid || ["organizer","admin"].includes(state.profile?.role);
}

async function deleteFile(f) {
  const { error: sErr } = await supabase.storage.from("attachments").remove([f.object_path]);
  if (sErr) { setFlash(sErr.message); return; }
  const { error: dErr } = await supabase.from("attachments").delete().eq("bucket_id","attachments").eq("object_path", f.object_path);
  if (dErr) { setFlash(dErr.message); return; }
  setFlash(state.language === "es" ? "Archivo eliminado" : "File deleted");
  await loadFiles(state.selectedEvent.id);
}

/* ============= Admin ============= */
function isOrganizer() {
  return ["organizer","admin"].includes(state.profile?.role);
}

async function createEvent(payload) {
  if (isCreatingEvent) return false;
  isCreatingEvent = true;

  try {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout after 10 seconds')), 10000)
    );

    // Generate slug client-side; DB enforces uniqueness
    const slug = genSlug(payload.title_en || payload.title_es || "event");

    const insertPromise = supabase
      .from("events")
      .insert([{
        title_en: payload.title_en,
        title_es: payload.title_es || null,
        description_en: payload.description_en || null,
        description_es: payload.description_es || null,
        start_time: payload.start_time,
        end_time: payload.end_time || null,
        language: payload.language || "bi",
        host_org: payload.host_org || null,
        zoom_url: payload.zoom_url || null,
        registration_url: payload.registration_url || null,
        livestream_url: payload.livestream_url || null,
        recording_url: payload.recording_url || null,
        topic_tags: payload.topic_tags || [],
        slug,
        status: "scheduled",
        created_by: state.session?.user?.id || null,
      }])
      .select()
      .single();

    const result = await Promise.race([insertPromise, timeoutPromise]);
    const { data, error } = result;

    if (error) {
      // Try a different slug on duplicate
      if (error.code === "23505" && (error.message || "").includes("slug")) {
        const { data: d2, error: e2 } = await supabase
          .from("events")
          .insert([{
            ...payload,
            slug: genSlug(payload.title_en || payload.title_es || "event"),
            status: "scheduled",
            created_by: state.session?.user?.id || null,
          }])
          .select()
          .single();
        if (e2) throw e2;
        setFlash("Event created successfully!");
        await loadEvents();
        setTimeout(() => showView("schedule"), 100);
        return true;
      }
      throw error;
    }

    setFlash("Event created successfully!");
    const form = $("#createEventForm");
    if (form) form.reset();
    await loadEvents();
    setTimeout(() => showView("schedule"), 100);
    return true;
  } catch (err) {
    console.error("Event creation error:", err);
    if (err.message === 'Request timeout after 10 seconds') {
      setFlash("Request timed out. Check database policies.");
      const { error: testError } = await supabase.from("events").select("id").limit(1);
      if (testError) {
        setFlash("Database connection issue detected.");
      } else {
        setFlash("Can read but not write - check RLS policies.");
      }
    } else {
      setFlash(`Error: ${err.message || "Unknown error"}`);
    }
    return false;
  } finally {
    isCreatingEvent = false;
  }
}

/* ============= RSVP & Follow ============= */
async function loadFollows() {
  if (!state.session) return;
  const { data, error } = await supabase
    .from("event_follows")
    .select("event_id")
    .eq("profile_id", state.session.user.id);
  if (error) { console.error(error); return; }
  state.followedEventIds = new Set((data || []).map(r => r.event_id));
  renderEventsList();
  if (state.selectedEvent) renderEventHeader();
}

async function toggleFollow(eventId) {
  if (!state.session) { setFlash(state.language === "es" ? "Inicia sesión para seguir eventos" : "Sign in to follow events"); return; }
  const isFollowed = state.followedEventIds.has(eventId);
  if (isFollowed) {
    const { error } = await supabase
      .from("event_follows")
      .delete()
      .eq("event_id", eventId)
      .eq("profile_id", state.session.user.id);
    if (error) return setFlash(error.message);
    state.followedEventIds.delete(eventId);
  } else {
    const { error } = await supabase
      .from("event_follows")
      .insert({ event_id: eventId, profile_id: state.session.user.id });
    if (error) return setFlash(error.message);
    state.followedEventIds.add(eventId);
  }
  renderEventsList();
  if (state.selectedEvent) renderEventHeader();
}

async function loadMyRsvps() {
  if (!state.session) return;
  const { data, error } = await supabase
    .from("event_rsvps")
    .select("event_id, status")
    .eq("profile_id", state.session.user.id);
  if (error) { console.error(error); return; }
  state.rsvpsByEvent.clear();
  (data || []).forEach(r => state.rsvpsByEvent.set(r.event_id, r.status));
}

async function setRsvp(eventId, status) {
  if (!state.session) return;
  if (!status) {
    // delete RSVP
    await supabase.from("event_rsvps")
      .delete()
      .eq("event_id", eventId)
      .eq("profile_id", state.session.user.id);
    state.rsvpsByEvent.delete(eventId);
  } else {
    // upsert RSVP
    const { error } = await supabase
      .from("event_rsvps")
      .upsert({ event_id: eventId, profile_id: state.session.user.id, status }, { onConflict: "event_id,profile_id" });
    if (error) setFlash(error.message);
    else state.rsvpsByEvent.set(eventId, status);
  }
  renderEventHeader();
}

/* ============= Calendar ============= */
function buildICS(ev) {
  const dtstart = toYmdHisZ(ev.start_time);
  const dtend = toYmdHisZ(ev.end_time || ev.start_time);
  const title = (state.language === "es" ? (ev.title_es || ev.title_en) : (ev.title_en || ev.title_es)) || "Seminar";
  const desc = (state.language === "es" ? (ev.description_es || ev.description_en) : (ev.description_en || ev.description_es)) || "";
  const url = `${window.location.origin}${window.location.pathname}#/e/${encodeURIComponent(ev.slug || ev.id)}`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Almuerzo Agrivoltaico//Seminars//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${ev.id}@almuerzo-agrivoltaico`,
    `DTSTAMP:${toYmdHisZ(new Date().toISOString())}`,
    `DTSTART:${dtstart}`,
    `DTEND:${dtend}`,
    `SUMMARY:${escapeICS(title)}`,
    `DESCRIPTION:${escapeICS(desc + "\\n" + url)}`,
    `URL:${url}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n");
}

function escapeICS(v="") {
  return v.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function downloadICS(ev) {
  const ics = buildICS(ev);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const baseTitle = (ev.title_en || ev.title_es || "seminar").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  a.download = `${baseTitle}.ics`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 100);
}

function openGoogleCal(ev) {
  const dtstart = toYmdHisZ(ev.start_time);
  const dtend = toYmdHisZ(ev.end_time || ev.start_time);
  const title = encodeURIComponent((ev.title_en || ev.title_es || "Seminar"));
  const desc = encodeURIComponent((ev.description_en || ev.description_es || "") + "\n" + `${window.location.origin}${window.location.pathname}#/e/${encodeURIComponent(ev.slug || ev.id)}`);
  const gcal = `https://calendar.google.com/calendar/u/0/r/eventedit?text=${title}&dates=${dtstart}/${dtend}&details=${desc}`;
  window.open(gcal, "_blank", "noopener");
}

/* ============= Realtime ============= */
function subscribeToEvent(eventId) {
  // Clean old subscription
  if (activeChannel) {
    supabase.removeChannel(activeChannel);
    activeChannel = null;
  }

  activeChannel = supabase.channel(`evt-${eventId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "threads", filter: `event_id=eq.${eventId}` }, async () => {
      await loadThreads(eventId);
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "comments", filter: `event_id=eq.${eventId}` }, async () => {
      // Reload current thread comments efficiently
      const openThreadIds = state.threads.map(t => t.id);
      for (const tid of openThreadIds) await loadComments(tid);
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "attachments", filter: `event_id=eq.${eventId}` }, async () => {
      await loadFiles(eventId);
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") setFlash(tr("realtime.live_updates"), 1500);
    });
}

/* ============= Views ============= */
function renderHeader() {
  const btnSignIn = $("#btnSignIn");
  const btnSignOut = $("#btnSignOut");
  const btnAdmin = $("#btnAdmin");
  const userName = $("#userName");

  if (btnSignIn) btnSignIn.style.display = state.session ? "none" : "inline-block";
  if (btnSignOut) btnSignOut.style.display = state.session ? "inline-block" : "none";
  if (btnAdmin) btnAdmin.style.display = state.session && isOrganizer() ? "inline-block" : "none";
  if (userName) userName.style.display = state.session ? "inline" : "none";
}

function showView(which) {
  const schedule = $("#schedule");
  const eventDetail = $("#eventDetail");
  const admin = $("#admin");
  const hero = $("#hero");
  const auth = $("#auth");

  if (which === "schedule") {
    if (schedule) schedule.style.display = "block";
    if (eventDetail) eventDetail.style.display = "none";
    if (admin) admin.style.display = "none";
    if (hero) hero.style.display = "block";
    if (auth && !state.session) auth.style.display = "block";
  } else if (which === "event") {
    if (schedule) schedule.style.display = "none";
    if (eventDetail) eventDetail.style.display = "block";
    if (admin) admin.style.display = "none";
    if (hero) hero.style.display = "none";
    if (auth) auth.style.display = "none";
  } else if (which === "admin") {
    if (!isOrganizer()) {
      setFlash("Access denied. You need organizer or admin privileges.");
      showView("schedule");
      return;
    }
    if (schedule) schedule.style.display = "none";
    if (eventDetail) eventDetail.style.display = "none";
    if (admin) admin.style.display = "block";
    if (hero) hero.style.display = "none";
    if (auth) auth.style.display = "none";
  }
}

/* ============= Routing ============= */
function handleRouting() {
  const hash = window.location.hash || "";
  const m = hash.match(/^#\/e\/([^/]+)$/);
  if (m) {
    const slugOrId = decodeURIComponent(m[1]);
    if (state.selectedEvent?.slug === slugOrId || state.selectedEvent?.id === slugOrId) return;
    openEvent(slugOrId);
  } else {
    showView("schedule");
  }
}

/* ============= Wire-up ============= */
function wireUI() {
  // Sign in/out
  $("#btnSignOut")?.addEventListener("click", async () => {
    await supabase.auth.signOut();
    // Return to schedule
    window.location.hash = "";
    showView("schedule");
  });
  $("#btnSignIn")?.addEventListener("click", () => {
    document.getElementById("auth")?.scrollIntoView({ behavior: "smooth" });
  });

  // Email form
  $("#emailForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("#email")?.value.trim();
    if (!email) return;
    await sendMagicLink(email);
  });

  // OAuth
  $("#btnGoogle")?.addEventListener("click", () => oauth("google"));

  // Navigation
  $("#btnSchedule")?.addEventListener("click", () => { window.location.hash = ""; showView("schedule"); });
  $("#btnCommunity")?.addEventListener("click", () => { window.location.hash = ""; state.viewFilter = "past"; persistFilters(); renderEventsList(); showView("schedule"); });
  $("#btnAdmin")?.addEventListener("click", () => showView("admin"));
  $("#backToSchedule")?.addEventListener("click", () => { window.location.hash = ""; showView("schedule"); });

  // Tabs
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      const tabId = tab.dataset.tab;
      document.querySelectorAll(".tab-panel").forEach(p => p.style.display = "none");
      const panel = $("#tab_" + tabId);
      if (panel) panel.style.display = "block";
    });
  });

  // Language switcher
  document.querySelectorAll(".lang-switch .chip").forEach(btn => {
    btn.addEventListener("click", () => {
      state.language = btn.dataset.lang;
      localStorage.setItem("lang", state.language);
      applyI18n();
      renderEventsList();
      if (state.selectedEvent) renderEventHeader();
      renderFiles();
      renderThreads();
    });
  });

  // Filters
  $("#filterUpcoming")?.addEventListener("click", () => { setViewFilter("upcoming"); });
  $("#filterPast")?.addEventListener("click", () => { setViewFilter("past"); });
  $("#filterAll")?.addEventListener("click", () => { setViewFilter("all"); });

  $("#fltLangAll")?.addEventListener("click", () => { setLangFilter("all"); });
  $("#fltLangEn")?.addEventListener("click", () => { setLangFilter("en"); });
  $("#fltLangEs")?.addEventListener("click", () => { setLangFilter("es"); });
  $("#fltLangBi")?.addEventListener("click", () => { setLangFilter("bi"); });

  // Search
  $("#search")?.addEventListener("input", renderEventsList);

  // New thread
  $("#newThreadForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = $("#threadTitle")?.value.trim();
    if (!title) return;
    await createThread(title);
    $("#threadTitle").value = "";
  });

  // Upload
  $("#uploadForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fileInput = $("#fileInput");
    const f = fileInput?.files[0];
    if (!f) return;
    await uploadFile(f);
    fileInput.value = "";
  });

  // Create event form
  const createEventForm = $("#createEventForm");
  if (createEventForm) {
    const handleEventSubmit = async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (isCreatingEvent) return;

      const submitBtn = e.target.querySelector('button[type="submit"]');
      const originalText = submitBtn?.textContent;

      try {
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Creating..."; }

        const titleEn = $("#titleEn")?.value.trim();
        const startTime = $("#startTime")?.value;
        const endTime = $("#endTime")?.value;

        if (!titleEn) { setFlash("Title (EN) is required"); $("#titleEn")?.focus(); return; }
        if (!startTime) { setFlash("Start time is required"); $("#startTime")?.focus(); return; }

        const startIso = toIsoOrNull(startTime);
        const endIso = endTime ? toIsoOrNull(endTime) : null;
        if (!startIso) { setFlash("Invalid start time format"); $("#startTime")?.focus(); return; }

        const payload = {
          title_en: titleEn,
          title_es: $("#titleEs")?.value.trim() || null,
          description_en: $("#descEn")?.value.trim() || null,
          description_es: $("#descEs")?.value.trim() || null,
          start_time: startIso,
          end_time: endIso,
          language: $("#eventLang")?.value || "bi",
          host_org: $("#hostOrg")?.value.trim() || null,
          zoom_url: $("#zoomUrl")?.value.trim() || null,
          registration_url: $("#registrationUrl")?.value.trim() || null,
          livestream_url: $("#livestreamUrl")?.value.trim() || null,
          recording_url: $("#recordingUrl")?.value.trim() || null,
          topic_tags: ($("#tags")?.value || "").split(",").map(s => s.trim()).filter(Boolean),
        };

        const success = await createEvent(payload);
        if (success) console.log("Event created");
      } catch (err) {
        console.error("Form submission error:", err);
        setFlash(err?.message || "Could not create event");
      } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = originalText || tr("event.create", "Create Event"); }
      }
    };
    createEventForm.removeEventListener("submit", handleEventSubmit);
    createEventForm.addEventListener("submit", handleEventSubmit);
  }

  // Year in footer
  const yearEl = $("#year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Routing
  window.addEventListener("hashchange", handleRouting);
}

function setViewFilter(v) {
  state.viewFilter = v;
  localStorage.setItem("viewFilter", v);
  document.querySelectorAll('[data-filter]').forEach(btn => {
    btn.setAttribute('aria-pressed', btn.getAttribute('data-filter') === v ? "true" : "false");
  });
  renderEventsList();
}

function setLangFilter(v) {
  state.langFilter = v;
  localStorage.setItem("langFilter", v);
  document.querySelectorAll('[data-langfilter]').forEach(btn => {
    btn.setAttribute('aria-pressed', btn.getAttribute('data-langfilter') === v ? "true" : "false");
  });
  renderEventsList();
}

function persistFilters() {
  localStorage.setItem("viewFilter", state.viewFilter);
  localStorage.setItem("langFilter", state.langFilter);
}

/* ============= Bootstrap ============= */
(async function main() {
  applyI18n();
  wireUI();
  await initAuth();
  renderHeader();
  renderAuthUI();
  await loadEvents();
  // If already had a hash
  handleRouting();
})();