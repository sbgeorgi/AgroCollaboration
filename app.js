import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* ================== CONFIG ================== */
const SUPABASE_URL = "https://iuzgfldgvueuehybgntm.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1emdmbGRndnVldWVoeWJnbnRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY4Mjc0MjUsImV4cCI6MjA3MjQwMzQyNX0.do919Hvw2AK-Ql-2V5guoRRH2yx4Rmset4eeVXi__o8";

const REDIRECT_TO = window.location.origin + window.location.pathname;
/* ============================================ */

// V V V THIS IS THE FIX V V V
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true, // This is crucial for magic links
  },
});
// ^ ^ ^ THIS IS THE FIX ^ ^ ^

let isCreatingEvent = false;


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

// Helper: safely convert datetime-local to ISO
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

/* ============= Auth ============= */
async function initAuth() {
  console.log("Initializing auth...");
  
  // Check for existing session
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    console.log("Session check:", session ? "Found" : "None", error);
    
    if (session) {
      state.session = session;
      await ensureProfile();
      renderAuthUI();
    } else {
      state.session = null;
      state.profile = null;
      renderAuthUI();
    }
  } catch (err) {
    console.error("Session check error:", err);
    renderAuthUI();
  }

  // Listen for auth changes
  supabase.auth.onAuthStateChange(async (event, session) => {
    console.log("Auth state change:", event, session ? "Session exists" : "No session");
    
    state.session = session;
    
    if (session) {
      await ensureProfile();
      setFlash(state.language === "es" ? "Sesión iniciada" : "Signed in");
    } else {
      state.profile = null;
      setFlash(state.language === "es" ? "Sesión cerrada" : "Signed out");
    }
    
    renderAuthUI();
    renderHeader();
    await loadEvents();
  });
}

function renderAuthUI() {
  const authSection = $("#auth");
  const btnSignIn = $("#btnSignIn");
  const btnSignOut = $("#btnSignOut");
  const userName = $("#userName");
  
  if (state.session) {
    // User is signed in
    authSection.style.display = "none";
    btnSignIn.style.display = "none";
    btnSignOut.style.display = "inline-block";
    userName.style.display = "inline";
    userName.textContent = state.profile?.full_name ? `@${state.profile.full_name}` : "";
  } else {
    // User is not signed in
    authSection.style.display = "none"; // Hidden by default, shown when clicking Sign In
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
      // If profile doesn't exist, it will be created by the trigger
      return;
    }
    
    state.profile = data;
    console.log("Profile loaded:", data);
    console.log("User role:", data?.role);
  } catch (err) {
    console.error("Profile error:", err);
  }
}

async function sendMagicLink(email) {
  console.log("Sending magic link to:", email);
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { 
      emailRedirectTo: REDIRECT_TO 
    },
  });
  
  if (error) {
    console.error("Magic link error:", error);
    setFlash(`Error: ${error.message}`);
  } else {
    setFlash(state.language === "es" ? "Enlace enviado. Revisa tu correo." : "Magic link sent. Check your email.");
  }
}

async function oauth(provider) {
  console.log("OAuth login with:", provider);
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: REDIRECT_TO,
    }
  });
  if (error) {
    console.error("OAuth error:", error);
    setFlash(`Error: ${error.message}`);
  }
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
  if (!list || !empty) return;
  
  list.innerHTML = "";
  const term = ($("#search")?.value || "").toLowerCase().trim();

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
  
  const header = $("#eventHeader");
  const about = $("#eventAbout");
  
  if (header) {
    header.innerHTML = `
      <div class="event-title">${title}</div>
      <div class="event-attrs">
        <span>${fmtDateTime(ev.start_time)}${ev.end_time ? " – " + fmtDateTime(ev.end_time) : ""}</span>
        ${ev.host_org ? `<span>• ${ev.host_org}</span>` : ""}
        <span>• ${ev.language?.toUpperCase?.()}</span>
        ${ev.zoom_url ? `<span>• 🔒 Zoom</span>` : ""}
      </div>
    `;
  }
  
  if (about) {
    about.innerHTML = `
      <p>${desc ? desc.replace(/\n/g, "<br/>") : ""}</p>
      ${ev.zoom_url ? `<p><strong>Zoom:</strong> <a href="${ev.zoom_url}" target="_blank" rel="noopener">Join link</a> (members only)</p>` : ""}
    `;
  }
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
  const empty = $("#emptyThreads");
  if (empty) empty.style.display = state.threads.length ? "none" : "block";
  renderThreads();
}

function renderThreads() {
  const list = $("#threadsList");
  if (!list) return;
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
  const hasRole = ["organizer","admin"].includes(state.profile?.role);
  console.log("Role check:", state.profile?.role, "->", hasRole);
  return hasRole;
}

async function createEvent(payload) {
  if (isCreatingEvent) {
    console.log("Already creating an event, please wait...");
    return false;
  }
  
  isCreatingEvent = true;
  console.log("Creating event:", payload);
  
  try {
    // Add timeout to prevent infinite hanging
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Request timeout after 10 seconds')), 10000)
    );
    
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
        status: "scheduled",
        created_by: state.session.user.id,
      }])
      .select()
      .single();
    
    // Race between the insert and timeout
    const result = await Promise.race([insertPromise, timeoutPromise]);
    
    const { data, error } = result;
    
    if (error) {
      console.error("Event creation error:", error);
      
      // More specific error messages
      if (error.code === '42501') {
        setFlash("Permission denied. Check RLS policies.");
      } else if (error.code === '23505') {
        setFlash("Duplicate event.");
      } else if (error.message?.includes('policies')) {
        setFlash("RLS policy error. Admin access may be needed.");
      } else {
        setFlash(`Error: ${error.message || 'Unknown error'}`);
      }
      return false;
    }
    
    console.log("Event created successfully:", data);
    setFlash("Event created successfully!");
    
    // Clear form
    const form = $("#createEventForm");
    if (form) form.reset();
    
    // Reload and switch view
    await loadEvents();
    setTimeout(() => showView("schedule"), 100);
    
    return true;
    
  } catch (err) {
    console.error("Unexpected error:", err);
    
    if (err.message === 'Request timeout after 10 seconds') {
      setFlash("Request timed out. Check database policies.");
      
      // Log diagnostic info
      console.log("Timeout occurred. Checking connection...");
      
      // Test if we can read from the database
      const { error: testError } = await supabase
        .from("events")
        .select("id")
        .limit(1);
      
      if (testError) {
        console.error("Can't even read events:", testError);
        setFlash("Database connection issue detected.");
      } else {
        console.log("Can read but not write - likely RLS issue");
        setFlash("Can read but not write - check RLS policies.");
      }
    } else {
      setFlash(`Error: ${err.message}`);
    }
    
    return false;
  } finally {
    isCreatingEvent = false;
  }
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
    if (auth && !state.session) auth.style.display = "none";
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

/* ============= Wire-up ============= */
function wireUI() {
  // Sign in/out buttons
  const btnSignIn = $("#btnSignIn");
  const btnSignOut = $("#btnSignOut");
  const authSection = $("#auth");
  
  if (btnSignIn) {
    btnSignIn.addEventListener("click", () => {
      console.log("Sign in button clicked");
      if (authSection) {
        authSection.style.display = authSection.style.display === "block" ? "none" : "block";
        const emailInput = $("#email");
        if (emailInput) emailInput.focus();
      }
    });
  }
  
  if (btnSignOut) {
    btnSignOut.addEventListener("click", async () => {
      console.log("Sign out button clicked");
      await supabase.auth.signOut();
    });
  }

  // Email form
  const emailForm = $("#emailForm");
  if (emailForm) {
    emailForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = $("#email")?.value.trim();
      if (!email) return;
      await sendMagicLink(email);
    });
  }

  // OAuth buttons
  const btnGitHub = $("#btnGitHub");
  const btnGoogle = $("#btnGoogle");
  if (btnGitHub) btnGitHub.addEventListener("click", () => oauth("github"));
  if (btnGoogle) btnGoogle.addEventListener("click", () => oauth("google"));

  // Navigation
  const btnSchedule = $("#btnSchedule");
  const btnCommunity = $("#btnCommunity");
  const btnAdmin = $("#btnAdmin");
  const backToSchedule = $("#backToSchedule");
  
  if (btnSchedule) btnSchedule.addEventListener("click", () => showView("schedule"));
  if (btnCommunity) btnCommunity.addEventListener("click", () => showView("schedule"));
  if (btnAdmin) btnAdmin.addEventListener("click", () => showView("admin"));
  if (backToSchedule) backToSchedule.addEventListener("click", () => showView("schedule"));

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

  // Search
  const searchInput = $("#search");
  if (searchInput) searchInput.addEventListener("input", renderEventsList);

  // New thread form
  const newThreadForm = $("#newThreadForm");
  if (newThreadForm) {
    newThreadForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const title = $("#threadTitle")?.value.trim();
      if (!title) return;
      await createThread(title);
      $("#threadTitle").value = "";
    });
  }

  // Upload form
  const uploadForm = $("#uploadForm");
  if (uploadForm) {
    uploadForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fileInput = $("#fileInput");
      const f = fileInput?.files[0];
      if (!f) return;
      await uploadFile(f);
      fileInput.value = "";
    });
  }

  // Create event form - COMPLETELY FIXED VERSION
  const createEventForm = $("#createEventForm");
  if (createEventForm) {
    // Use a named function so we can ensure single attachment
    const handleEventSubmit = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      // Check if already submitting
      if (isCreatingEvent) {
        console.log("Already processing, please wait...");
        return;
      }
      
      console.log("Create event form submitted");
      
      const submitBtn = e.target.querySelector('button[type="submit"]');
      const originalText = submitBtn?.textContent;
      
      try {
        // Disable button
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = "Creating...";
        }
        
        const titleEn = $("#titleEn")?.value.trim();
        const startTime = $("#startTime")?.value;
        const endTime = $("#endTime")?.value;

        console.log("Form values:", { titleEn, startTime, endTime });

        // Validation
        if (!titleEn) {
          setFlash("Title (EN) is required");
          $("#titleEn")?.focus();
          return;
        }

        if (!startTime) {
          setFlash("Start time is required");
          $("#startTime")?.focus();
          return;
        }

        const startIso = toIsoOrNull(startTime);
        const endIso = endTime ? toIsoOrNull(endTime) : null;

        console.log("Converted dates:", { startIso, endIso });

        if (!startIso) {
          setFlash("Invalid start time format");
          $("#startTime")?.focus();
          return;
        }

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
        };

        console.log("Submitting payload:", payload);
        
        const success = await createEvent(payload);
        
        if (success) {
          console.log("Event created, form will be reset");
        }
        
      } catch (err) {
        console.error("Form submission error:", err);
        setFlash(err?.message || "Could not create event");
      } finally {
        // Re-enable button
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = originalText || tr("event.create", "Create Event");
        }
      }
    };
    
    // Remove all existing listeners and add new one
    createEventForm.removeEventListener("submit", handleEventSubmit);
    createEventForm.addEventListener("submit", handleEventSubmit);
  }

  // Year in footer
  const yearEl = $("#year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();
}

/* ============= Bootstrap ============= */
(async function main() {
  console.log("App starting...");
  
  // Apply initial translations
  applyI18n();
  
  // Wire up UI events
  wireUI();
  
  // Initialize auth
  await initAuth();
  
  // Render initial UI state
  renderHeader();
  renderAuthUI();
  
  // Load initial data
  await loadEvents();
  
  console.log("App ready");
})();