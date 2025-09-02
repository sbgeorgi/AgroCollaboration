import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* ================== CONFIG ================== */
const SUPABASE_URL = "https://iuzgfldgvueuehybgntm.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1emdmbGRndnVldWVoeWJnbnRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY4Mjc0MjUsImV4cCI6MjA3MjQwMzQyNX0.do919Hvw2AK-Ql-2V5guoRRH2yx4Rmset4eeVXi__o8";

const REDIRECT_TO = window.location.origin + (window.location.pathname.endsWith("/") ? window.location.pathname : window.location.pathname + "/");
/* ============================================ */

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

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
    },
    footer: { note: "Bilingual, community-driven seminar on agrivoltaics in Latin America." },
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
    },
    footer: { note: "Seminario bilingüe y comunitario sobre agrofotovoltaica en América Latina." },
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

function setFlash(msg, timeout = 2400) {
  const el = $("#flash");
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
}

// Helper: safely convert <input type="datetime-local"> to ISO
function toIsoOrNull(v) {
  if (!v) return null;
  try {
    // datetime-local format is "YYYY-MM-DDTHH:mm"
    // We need to ensure it's properly converted to ISO with timezone
    const localDate = new Date(v);
    if (isNaN(localDate.getTime())) return null;
    return localDate.toISOString();
  } catch(e) {
    console.error("Date conversion error:", e);
    return null;
  }
}

/* ============= Auth ============= */
async function initAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  state.session = session || null;
  if (state.session) {
    await ensureProfile();
  }

  supabase.auth.onAuthStateChange(async (_event, session) => {
    state.session = session || null;
    if (session) {
      await ensureProfile();
      setFlash(state.language === "es" ? "Sesión iniciada" : "Signed in");
      $("#auth").style.display = "none";
    } else {
      state.profile = null;
      setFlash(state.language === "es" ? "Sesión cerrada" : "Signed out");
      $("#auth").style.display = "block";
    }
    renderHeader();
    await loadEvents();
    showView("schedule");
  });

  $("#emailForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("#email").value.trim();
    if (!email) return;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: REDIRECT_TO },
    });
    if (error) setFlash(error.message);
    else setFlash(state.language === "es" ? "Enlace enviado" : "Magic link sent");
  });

  $("#btnGitHub").addEventListener("click", () => oauth("github"));
  $("#btnGoogle").addEventListener("click", () => oauth("google"));

  $("#btnSignIn").addEventListener("click", () => {
    $("#auth").style.display = "block";
    document.getElementById("email").focus();
  });

  $("#btnSignOut").addEventListener("click", async () => {
    await supabase.auth.signOut();
  });

  $("#year").textContent = new Date().getFullYear();
}

async function oauth(provider) {
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: REDIRECT_TO,
      skipBrowserRedirect: false,
    }
  });
  if (error) setFlash(error.message);
}

async function ensureProfile() {
  const uid = state.session?.user?.id;
  if (!uid) return;
  
  const { data, error } = await supabase.from("profiles").select("*").eq("id", uid).single();
  if (error) {
    console.error("Profile fetch error:", error);
    return;
  }
  
  state.profile = data;
  console.log("User profile loaded:", data); // Debug log
  console.log("User role:", data?.role); // Debug log
  
  $("#userName").textContent = data.full_name ? `@${data.full_name}` : "";
  $("#btnSignIn").style.display = "none";
  $("#btnSignOut").style.display = "inline-block";
  $("#auth").style.display = "none";
  
  renderHeader(); // Update header to show/hide admin button
}

/* ============= Data ============= */
async function loadEvents() {
  if (!state.session) {
    $("#eventsList").innerHTML = "";
    $("#emptyEvents").style.display = "block";
    return;
  }
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
}

function renderEventsList() {
  const list = $("#eventsList");
  const empty = $("#emptyEvents");
  list.innerHTML = "";

  const term = ($("#search").value || "").toLowerCase().trim();

  const filtered = state.events.filter(e => {
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

    card.innerHTML = `
      <div class="when">${fmtDateTime(ev.start_time)}${ev.end_time ? " – " + fmtDateTime(ev.end_time) : ""}</div>
      <div class="event-title">${title}</div>
      ${desc ? `<div class="event-desc">${desc.substring(0, 140)}${desc.length > 140 ? "…" : ""}</div>` : ""}
      <div class="tags">
        <span class="tag">${ev.language?.toUpperCase?.() || "BI"}</span>
        <span class="tag">${ev.status || "scheduled"}</span>
        ${ev.host_org ? `<span class="tag">${ev.host_org}</span>` : ""}
      </div>
      <div class="actions">
        <button class="btn-secondary" data-open="${ev.id}">${state.language === "es" ? "Ver" : "Open"}</button>
      </div>
    `;
    card.querySelector("[data-open]").addEventListener("click", () => openEvent(ev.id));
    list.appendChild(card);
  }
}

async function openEvent(eventId) {
  const ev = state.events.find(e => e.id === eventId);
  if (!ev) return;
  state.selectedEvent = ev;
  renderEventHeader();

  await loadThreads(ev.id);
  await loadFiles(ev.id);

  showView("event");
}

function renderEventHeader() {
  const ev = state.selectedEvent;
  const title = state.language === "es" ? (ev.title_es || ev.title_en) : (ev.title_en || ev.title_es);
  const desc = state.language === "es" ? (ev.description_es || ev.description_en) : (ev.description_en || ev.description_es);
  $("#eventHeader").innerHTML = `
    <div class="event-title">${title}</div>
    <div class="event-attrs">
      <span>${fmtDateTime(ev.start_time)}${ev.end_time ? " – " + fmtDateTime(ev.end_time) : ""}</span>
      ${ev.host_org ? `<span>• ${ev.host_org}</span>` : ""}
      <span>• ${ev.language?.toUpperCase?.()}</span>
      ${ev.zoom_url ? `<span>• 🔒 Zoom</span>` : ""}
    </div>
  `;
  $("#eventAbout").innerHTML = `
    <p>${desc ? desc.replace(/\n/g, "<br/>") : ""}</p>
    ${ev.zoom_url ? `<p><strong>Zoom:</strong> <a href="${ev.zoom_url}" target="_blank" rel="noopener">Join link</a> (members only)</p>` : ""}
  `;
}

/* Threads and comments */
async function loadThreads(eventId) {
  const { data, error } = await supabase
    .from("threads")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });
  if (error) { console.error(error); setFlash("Error loading topics"); return; }
  state.threads = data || [];
  $("#emptyThreads").style.display = state.threads.length ? "none" : "block";
  renderThreads();
}

function renderThreads() {
  const list = $("#threadsList");
  list.innerHTML = "";
  for (const th of state.threads) {
    const wrap = document.createElement("div");
    wrap.className = "thread";
    wrap.innerHTML = `
      <div class="thread-title">${escapeHtml(th.title)}</div>
      <div class="comments" id="c_${th.id}"></div>
      <form class="reply-form" data-thread="${th.id}">
        <textarea placeholder="${state.language === "es" ? "Escribe un comentario…" : "Write a comment…"}" required></textarea>
        <button class="btn-primary" type="submit">${state.language === "es" ? "Comentar" : "Comment"}</button>
      </form>
    `;
    list.appendChild(wrap);
    loadComments(th.id);
    wrap.querySelector("form.reply-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const content = e.currentTarget.querySelector("textarea").value.trim();
      if (!content) return;
      await createComment(th.id, null, content);
      e.currentTarget.reset();
      loadComments(th.id);
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
  el.innerHTML = `
    <div class="author">${authorName} • ${fmtDateTime(comment.created_at)}</div>
    <div class="text">${comment.is_deleted ? "<em>(deleted)</em>" : escapeHtml(comment.content)}</div>
    <div class="comment-actions">
      ${canEditComment(comment) ? `<button class="btn-ghost btn-sm" data-del="${comment.id}">${state.language === "es" ? "Eliminar" : "Delete"}</button>` : ""}
    </div>
  `;

  if (level < 1) {
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
  const { error } = await supabase.from("threads").insert({
    event_id: state.selectedEvent.id,
    title,
    created_by: state.session.user.id,
  });
  if (error) { setFlash(error.message); return; }
  await loadThreads(state.selectedEvent.id);
}

async function createComment(thread_id, parent_id, content) {
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

/* Files (Storage + attachments table) */
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
  const eventId = state.selectedEvent.id;
  const uniqueName = `${crypto.randomUUID?.() || Date.now()}-${file.name}`;
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
  const hasRole = ["organizer","admin"].includes(state.profile?.role);
  console.log("isOrganizer check:", state.profile?.role, "->", hasRole); // Debug log
  return hasRole;
}

async function createEvent(payload) {
  console.log("Creating event with payload:", payload); // Debug log
  
  const { data, error } = await supabase.from("events").insert({
    title_en: payload.title_en,
    title_es: payload.title_es,
    description_en: payload.description_en,
    description_es: payload.description_es,
    start_time: payload.start_time,
    end_time: payload.end_time || null,
    language: payload.language || "bi",
    host_org: payload.host_org || null,
    zoom_url: payload.zoom_url || null,
    status: "scheduled",
    created_by: state.session.user.id,
  });
  
  if (error) {
    console.error("Event creation error:", error);
    setFlash(`Error: ${error.message}`);
    return;
  }
  
  console.log("Event created successfully:", data);
  setFlash(state.language === "es" ? "Evento creado" : "Event created");
  await loadEvents();
  showView("schedule");
}

/* ============= Views ============= */
function renderHeader() {
  $("#btnSignIn").style.display = state.session ? "none" : "inline-block";
  $("#btnSignOut").style.display = state.session ? "inline-block" : "none";
  $("#btnAdmin").style.display = state.session && isOrganizer() ? "inline-block" : "none";
  $("#userName").style.display = state.session ? "inline" : "none";
}

function showView(which) {
  if (which === "schedule") {
    $("#schedule").style.display = "block";
    $("#eventDetail").style.display = "none";
    $("#admin").style.display = "none";
    $("#hero").style.display = "block";
  } else if (which === "event") {
    $("#schedule").style.display = "none";
    $("#eventDetail").style.display = "block";
    $("#admin").style.display = "none";
    $("#hero").style.display = "none";
  } else if (which === "admin") {
    if (!isOrganizer()) {
      setFlash("Access denied. You need organizer or admin privileges.");
      showView("schedule");
      return;
    }
    $("#schedule").style.display = "none";
    $("#eventDetail").style.display = "none";
    $("#admin").style.display = "block";
    $("#hero").style.display = "none";
  }
}

function escapeHtml(s="") {
  return s.replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[m]));
}

/* ============= Wire-up ============= */
function wireUI() {
  // nav
  $("#btnSchedule").addEventListener("click", () => showView("schedule"));
  $("#btnCommunity").addEventListener("click", () => {
    showView("schedule");
  });
  $("#btnAdmin").addEventListener("click", () => showView("admin"));
  $("#backToSchedule").addEventListener("click", () => showView("schedule"));

  // tabs
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      const tabId = tab.dataset.tab;
      document.querySelectorAll(".tab-panel").forEach(p => p.style.display = "none");
      $("#tab_" + tabId).style.display = "block";
    });
  });

  // language
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

  // search
  $("#search").addEventListener("input", renderEventsList);

  // new thread
  $("#newThreadForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = $("#threadTitle").value.trim();
    if (!title) return;
    await createThread(title);
    $("#threadTitle").value = "";
  });

  // upload
  $("#uploadForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = $("#fileInput").files[0];
    if (!f) return;
    await uploadFile(f);
    $("#fileInput").value = "";
  });

  // create event (admin) - FIXED VERSION
  $("#createEventForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    
    console.log("Event form submitted"); // Debug log
    
    const form = e.currentTarget;
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    try {
      const titleEn = $("#titleEn").value.trim();
      const startTime = $("#startTime").value;
      const endTime = $("#endTime").value;

      console.log("Form values:", { titleEn, startTime, endTime }); // Debug log

      if (!titleEn) {
        setFlash("Title (EN) is required");
        $("#titleEn").focus();
        return;
      }

      if (!startTime) {
        setFlash("Start time is required");
        $("#startTime").focus();
        return;
      }

      const startIso = toIsoOrNull(startTime);
      const endIso = toIsoOrNull(endTime);

      console.log("Converted dates:", { startIso, endIso }); // Debug log

      if (!startIso) {
        setFlash("Invalid start time format");
        $("#startTime").focus();
        return;
      }

      const payload = {
        title_en: titleEn,
        title_es: $("#titleEs").value.trim() || null,
        description_en: $("#descEn").value.trim() || null,
        description_es: $("#descEs").value.trim() || null,
        start_time: startIso,
        end_time: endIso,
        language: $("#eventLang").value,
        host_org: $("#hostOrg").value.trim() || null,
        zoom_url: $("#zoomUrl").value.trim() || null,
      };

      console.log("Submitting payload:", payload); // Debug log
      
      await createEvent(payload);
      form.reset();
    } catch (err) {
      console.error("Form submission error:", err);
      setFlash(err?.message || "Could not create event");
    }
  });
}

/* ============= Bootstrap ============= */
(async function main() {
  console.log("App initializing..."); // Debug log
  applyI18n();
  wireUI();
  renderHeader();
  await initAuth();
  await loadEvents();
  $("#auth").style.display = state.session ? "none" : "block";
  console.log("App initialized. Session:", !!state.session, "Profile:", state.profile); // Debug log
})();