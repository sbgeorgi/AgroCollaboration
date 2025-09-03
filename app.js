import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* ================== CONFIG ================== */
const SUPABASE_URL = "https://iuzgfldgvueuehybgntm.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1emdmbGRndnVldWVoeWJnbnRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY4Mjc0MjUsImV4cCI6MjA3MjQwMzQyNX0.do919Hvw2AK-Ql-2V5guoRRH2yx4Rmset4eeVXi__o8";

const REDIRECT_TO = window.location.origin + window.location.pathname;
/* ============================================ */

// Keep the working auth flow exactly as-is
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true, // crucial for magic links
  },
});

let isCreatingEvent = false;
let isUpdatingEvent = false;

const state = {
  session: null,
  profile: null,
  language: localStorage.getItem("lang") || "en",
  events: [],
  selectedEvent: null,
  threads: [],
  commentsByThread: new Map(),
  commentLikes: new Map(), // comment_id -> Set(profile_ids)
  profileCache: new Map(),
  files: [],
  rsvpStatus: null,
  isFollowing: false,
  speakers: [],
  counts: { followers: 0, going: 0, interested: 0 },
  calendarMonth: new Date(), // for schedule calendar
  adminCalendarMonth: new Date(), // preview in admin
};

// Basic i18n
const t = {
  en: {
    tagline:
      "An informal seminar series to share advances in agrivoltaics in Latin America",
    intro:
      "Agrivoltaics (agrivoltaics) is an emerging field that integrates solar energy with crop/livestock production. This bilingual seminar focuses on Latin America. Hosted by UNAM and University of Arizona.",
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
    profile: {
      title: "Your profile",
      full_name: "Full name",
      username: "Username",
      affiliation: "Affiliation",
      save: "Save profile",
      saved: "Profile updated",
    },
    schedule: {
      title: "Upcoming Talks",
      empty: "No events yet. Check back soon.",
      list: "List",
      calendar: "Calendar",
    },
    search: { placeholder: "Search..." },
    back: { schedule: "Back to schedule" },
    tabs: { discussion: "Discussion", files: "Files", about: "About" },
    thread: {
      placeholder: "New topic title…",
      create: "Create Topic",
      empty: "No topics yet. Start the discussion!",
    },
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
      edit: "Edit",
      delete: "Delete",
      edit_title: "Edit event",
    },
    footer: {
      note: "Bilingual, community-driven seminar on agrivoltaics in Latin America.",
    },
    rsvp: {
      going: "Going",
      interested: "Interested",
      notgoing: "Not going",
      saved: "RSVP updated",
    },
    follow: "Follow",
    legend: { scheduled: "Scheduled", completed: "Completed", canceled: "Canceled" },
    speakers: {
      title: "Speakers",
      link_me: "Link to my profile",
      add: "Add speaker",
      remove: "Remove",
      added: "Speaker added",
      removed: "Speaker removed",
    },
    slots: {
      title: "Existing time slots",
      blocked: "Blocked/conflicting times",
      suggestions: "Suggested open 1-hr slots",
    },
    save: "Save",
    cancel: "Cancel",
    errors: {
      overlap: "Selected time overlaps an existing event.",
      load_events: "Error loading events",
      create_event: "Could not create event",
      update_event: "Could not update event",
      delete_event: "Could not delete event",
      upload: "Upload failed",
    },
    labels: { followers: "followers", going: "going", interested: "interested" },
    open: "Open",
    join_zoom: "Join link",
    members_only: "members only",
  },
  es: {
    tagline:
      "Serie de seminarios informales para compartir avances en agrofotovoltaica en América Latina",
    intro:
      "La agrofotovoltaica integra energía solar con producción agrícola/ganadera. Este seminario bilingüe se enfoca en América Latina. Organizado por UNAM y University of Arizona.",
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
    profile: {
      title: "Tu perfil",
      full_name: "Nombre completo",
      username: "Usuario",
      affiliation: "Afiliación",
      save: "Guardar perfil",
      saved: "Perfil actualizado",
    },
    schedule: {
      title: "Próximas charlas",
      empty: "Aún no hay eventos. Vuelve pronto.",
      list: "Lista",
      calendar: "Calendario",
    },
    search: { placeholder: "Buscar..." },
    back: { schedule: "Volver al calendario" },
    tabs: { discussion: "Discusión", files: "Archivos", about: "Acerca de" },
    thread: {
      placeholder: "Título del nuevo tema…",
      create: "Crear tema",
      empty: "Aún no hay temas. ¡Comienza la discusión!",
    },
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
      edit: "Editar",
      delete: "Eliminar",
      edit_title: "Editar evento",
    },
    footer: {
      note: "Seminario bilingüe y comunitario sobre agrofotovoltaica en América Latina.",
    },
    rsvp: {
      going: "Asistiré",
      interested: "Interesado/a",
      notgoing: "No asistiré",
      saved: "Asistencia actualizada",
    },
    follow: "Seguir",
    legend: { scheduled: "Programado", completed: "Completado", canceled: "Cancelado" },
    speakers: {
      title: "Ponentes",
      link_me: "Vincular a mi perfil",
      add: "Agregar ponente",
      remove: "Quitar",
      added: "Ponente agregado",
      removed: "Ponente eliminado",
    },
    slots: {
      title: "Horarios existentes",
      blocked: "Horarios bloqueados/en conflicto",
      suggestions: "Sugerencias (1 hora libre)",
    },
    save: "Guardar",
    cancel: "Cancelar",
    errors: {
      overlap: "El horario seleccionado se cruza con otro evento.",
      load_events: "Error al cargar eventos",
      create_event: "No se pudo crear el evento",
      update_event: "No se pudo actualizar el evento",
      delete_event: "No se pudo eliminar el evento",
      upload: "Fallo al subir",
    },
    labels: { followers: "seguidores", going: "asisten", interested: "interesados" },
    open: "Abrir",
    join_zoom: "Enlace",
    members_only: "solo miembros",
  },
};

function tr(key, fallback = "") {
  const lang = state.language;
  const parts = key.split(".");
  let obj = t[lang];
  for (const p of parts) obj = obj?.[p];
  return obj ?? fallback;
}

/* ============== UI helpers ============== */
const $ = (sel) => document.querySelector(sel);

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
  } catch (_) {
    return iso;
  }
}

function fmtDate(iso) {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
      new Date(iso)
    );
  } catch (_) {
    return iso;
  }
}

function bytesToSize(bytes = 0) {
  if (bytes === 0) return "0 B";
  const k = 1024,
    sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function escapeHtml(s = "") {
  return s.replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

function applyI18n() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = tr(el.dataset.i18n, el.textContent);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = tr(el.dataset.i18nPlaceholder, el.placeholder);
  });
  document.querySelectorAll(".lang-switch .chip").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.lang === state.language);
  });
}

function toIsoOrNull(v) {
  if (!v) return null;
  const localDate = new Date(v);
  if (isNaN(localDate.getTime())) return null;
  return localDate.toISOString();
}

function toLocalInputValue(iso) {
  if (!iso) return "";
  // convert ISO to yyyy-MM-ddThh:mm for datetime-local
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  const aS = new Date(aStart).getTime();
  const aE = aEnd ? new Date(aEnd).getTime() : aS + 60 * 60 * 1000; // default 1h
  const bS = new Date(bStart).getTime();
  const bE = bEnd ? new Date(bEnd).getTime() : bS + 60 * 60 * 1000;
  return Math.max(aS, bS) < Math.min(aE, bE);
}

function suggestOpenSlots(durationMinutes = 60, count = 5, fromDate = new Date()) {
  const events = state.events.filter((e) => e.status !== "canceled");
  const slots = [];
  let cursor = new Date(fromDate);
  cursor.setMinutes(0, 0, 0);
  cursor.setHours(cursor.getHours() + 1); // next whole hour

  const endLimit = new Date();
  endLimit.setDate(endLimit.getDate() + 45);

  while (slots.length < count && cursor < endLimit) {
    const start = new Date(cursor);
    const end = new Date(cursor.getTime() + durationMinutes * 60000);
    const conflict = events.some((ev) => overlaps(start, end, ev.start_time, ev.end_time));
    if (!conflict) slots.push({ start, end });
    cursor.setHours(cursor.getHours() + 1);
  }
  return slots;
}

/* ============= Auth ============= */
async function initAuth() {
  // Check for existing session
  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();
    if (error) console.warn("Session check warning:", error);

    state.session = session;
    if (session) {
      await ensureProfile();
    }
    renderAuthUI();
  } catch (err) {
    console.error("Session check error:", err);
    renderAuthUI();
  }

  // Listen for auth changes
  supabase.auth.onAuthStateChange(async (event, session) => {
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
  const heroSection = $("#hero");
  const profileSection = $("#profile");
  const btnSignIn = $("#btnSignIn");
  const btnSignOut = $("#btnSignOut");
  const userName = $("#userName");
  const btnProfile = $("#btnProfile");

  if (state.session) {
    if (authSection) authSection.style.display = "none";
    if (heroSection) heroSection.style.display = "block";
    if (profileSection) profileSection.style.display = "none"; // CORRECT: Keep profile hidden
    btnSignIn.style.display = "none";
    btnSignOut.style.display = "inline-block";
    if (btnProfile) btnProfile.style.display = "grid";
    userName.style.display = "inline";
    userName.textContent = state.profile?.full_name || state.profile?.username || "";
    $("#userInitial").textContent = (state.profile?.full_name || state.profile?.username || "U").charAt(0).toUpperCase();
    
    // Fill profile form
    $("#fullName").value = state.profile?.full_name || "";
    $("#username").value = state.profile?.username || "";
    $("#affiliation").value = state.profile?.affiliation || "";
  } else {
    if (authSection) authSection.style.display = "block";
    if (heroSection) heroSection.style.display = "block"; // CORRECT: Hero should be visible for everyone on the main page
    if (profileSection) profileSection.style.display = "none";
    btnSignIn.style.display = "inline-block";
    btnSignOut.style.display = "none";
    if (btnProfile) btnProfile.style.display = "none";
    userName.style.display = "none";
  }
}

async function ensureProfile() {
  const uid = state.session?.user?.id;
  if (!uid) return;
  try {
    const { data, error } = await supabase.from("profiles").select("*").eq("id", uid).single();
    if (error) {
      console.warn("Profile fetch warning:", error);
      // A trigger typically creates this row. If not present, attempt an upsert with minimal data.
      const { data: up, error: upErr } = await supabase
        .from("profiles")
        .upsert(
          {
            id: uid,
            username: state.session.user.email?.split("@")[0] || null,
            preferred_language: state.language,
          },
          { onConflict: "id" }
        )
        .select("*")
        .single();
      if (!upErr) state.profile = up;
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
    options: {
      emailRedirectTo: REDIRECT_TO,
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
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: REDIRECT_TO },
  });
  if (error) {
    console.error("OAuth error:", error);
    setFlash(`Error: ${error.message}`);
  }
}

/* ============= Data: Events & Schedule ============= */
async function loadEvents() {
  if (!state.session) {
    $("#eventsList").innerHTML = "";
    $("#emptyEvents").style.display = "block";
    $("#calendar").style.display = "none";
    return;
  }

  const { data, error } = await supabase
    .from("events")
    .select("*")
    .order("start_time", { ascending: true });

  if (error) {
    console.error("Load events error:", error);
    setFlash(tr("errors.load_events", "Error loading events"));
    return;
  }

  state.events = data || [];
  renderEventsList();
  renderScheduleCalendar();
  renderAdminCalendarPreview();
  renderExistingSlots();
  renderSlotSuggestions();
}

function renderEventsList() {
  const list = $("#eventsList");
  const empty = $("#emptyEvents");
  if (!list || !empty) return;

  list.innerHTML = "";
  const term = ($("#search")?.value || "").toLowerCase().trim();

  const filtered = state.events.filter((e) => {
    if (!term) return true;
    return [e.title_en, e.title_es, e.description_en, e.description_es, e.host_org]
      .filter(Boolean)
      .some((v) => v.toLowerCase().includes(term));
  });

  empty.style.display = filtered.length ? "none" : "block";

  for (const ev of filtered) {
    const card = document.createElement("div");
    card.className = "event-card";
    const title =
      state.language === "es" ? ev.title_es || ev.title_en : ev.title_en || ev.title_es;
    const desc =
      state.language === "es"
        ? ev.description_es || ev.description_en
        : ev.description_en || ev.description_es;

    card.innerHTML = `
      <div class="when">${fmtDateTime(ev.start_time)}${
      ev.end_time ? " – " + fmtDateTime(ev.end_time) : ""
    }</div>
      <div class="event-title">${escapeHtml(title || "")}</div>
      ${desc ? `<div class="event-desc">${escapeHtml(desc).substring(0, 140)}${
        desc.length > 140 ? "…" : ""
      }</div>` : ""}
      <div class="tags">
        <span class="tag">${ev.language?.toUpperCase?.() || "BI"}</span>
        <span class="tag status-${ev.status || "scheduled"}">${ev.status || "scheduled"}</span>
        ${ev.host_org ? `<span class="tag">${escapeHtml(ev.host_org)}</span>` : ""}
      </div>
      <div class="actions">
        <button class="btn-secondary" data-open="${ev.id}">${tr("open","Open")}</button>
      </div>
    `;
    card.querySelector("[data-open]").addEventListener("click", () => openEvent(ev.id));
    list.appendChild(card);
  }
}

async function openEvent(eventId) {
  const ev = state.events.find((e) => e.id === eventId);
  if (!ev) return;
  state.selectedEvent = ev;

  // Load additional data
  await Promise.all([loadThreads(ev.id), loadFiles(ev.id), loadSpeakers(ev.id), loadRSVPFollow(ev.id)]);

  renderEventHeader();
  showView("event");
}

function renderEventHeader() {
  const ev = state.selectedEvent;
  if (!ev) return;
  const title =
    state.language === "es" ? ev.title_es || ev.title_en : ev.title_en || ev.title_es;
  const desc =
    state.language === "es"
      ? ev.description_es || ev.description_en
      : ev.description_en || ev.description_es;

  const header = $("#eventHeader");
  const about = $("#eventAbout");

  if (header) {
    header.innerHTML = `
      <div class="event-title">${escapeHtml(title || "")}</div>
      <div class="event-attrs">
        <span>${fmtDateTime(ev.start_time)}${
          ev.end_time ? " – " + fmtDateTime(ev.end_time) : ""
        }</span>
        ${ev.host_org ? `<span>• ${escapeHtml(ev.host_org)}</span>` : ""}
        <span>• ${ev.language?.toUpperCase?.() || "BI"}</span>
        ${ev.zoom_url ? `<span>• 🔒 Zoom</span>` : ""}
      </div>
    `;
  }

  if (about) {
    about.innerHTML = `
      ${desc ? `<p>${escapeHtml(desc).replace(/\n/g, "<br/>")}</p>` : ""}
      ${
        ev.zoom_url
          ? `<p><strong>Zoom:</strong> <a href="${ev.zoom_url}" target="_blank" rel="noopener">${tr(
              "join_zoom",
              "Join link"
            )}</a> (${tr("members_only", "members only")})</p>`
          : ""
      }
    `;
  }

  // Actions
  const rsvpGroup = $("#rsvpGroup");
  const btnFollow = $("#btnFollow");
  const orgActions = $("#organizerActions");
  const counts = $("#eventCounts");

  rsvpGroup.style.display = state.session ? "flex" : "none";
  btnFollow.style.display = state.session ? "inline-flex" : "none";
  btnFollow.classList.toggle("active", state.isFollowing);

  // Update RSVP button states
  ["going", "interested", "not_going"].forEach((k) => {
    const el = document.querySelector(`[data-rsvp="${k}"]`);
    if (el) el.classList.toggle("active", state.rsvpStatus === k);
  });

  counts.innerHTML = `
    <span class="count">${state.counts.followers} ${tr("labels.followers","followers")}</span>
    <span class="count">${state.counts.going} ${tr("labels.going","going")}</span>
    <span class="count">${state.counts.interested} ${tr("labels.interested","interested")}</span>
  `;

  orgActions.style.display = isOrganizer() ? "inline-flex" : "none";
  if (isOrganizer()) fillEditEventForm();
}

/* ===== Calendar rendering (Schedule) ===== */
function monthStart(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function monthEnd(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
function renderScheduleCalendar() {
  const wrapper = $("#calendar");
  const grid = $("#calendarGrid");
  const label = $("#calLabel");
  if (!wrapper || !grid || !label) return;

  const m = state.calendarMonth;
  label.textContent = m.toLocaleString(undefined, { month: "long", year: "numeric" });

  const start = monthStart(m);
  const end = monthEnd(m);

  // Determine start day for grid (Monday-based)
  const firstDayIndex = (start.getDay() + 6) % 7;
  const daysInMonth = end.getDate();

  grid.innerHTML = `
    <div class="dow">Mon</div><div class="dow">Tue</div><div class="dow">Wed</div><div class="dow">Thu</div><div class="dow">Fri</div><div class="dow">Sat</div><div class="dow">Sun</div>
  `;

  // Fill blanks
  for (let i = 0; i < firstDayIndex; i++) {
    grid.appendChild(document.createElement("div"));
  }

  // Events by day
  const byDay = new Map();
  for (const ev of state.events) {
    const d = new Date(ev.start_time);
    if (d.getMonth() !== m.getMonth() || d.getFullYear() !== m.getFullYear()) continue;
    const day = d.getDate();
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(ev);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const cell = document.createElement("div");
    cell.className = "cal-cell";
    cell.innerHTML = `<div class="cal-day">${day}</div>`;
    (byDay.get(day) || []).forEach((ev) => {
      const title =
        state.language === "es" ? ev.title_es || ev.title_en : ev.title_en || ev.title_es;
      const badge = document.createElement("button");
      badge.className = `cal-badge status-${ev.status}`;
      badge.title = title || "";
      badge.textContent = (ev.language || "bi").toUpperCase();
      badge.addEventListener("click", () => openEvent(ev.id));
      cell.appendChild(badge);
    });
    grid.appendChild(cell);
  }
}

/* ===== Admin calendar preview + slot tools ===== */
function renderAdminCalendarPreview() {
  const grid = $("#adminCalendarGrid");
  const label = $("#adminCalLabel");
  if (!grid || !label) return;
  const m = state.adminCalendarMonth;
  label.textContent = m.toLocaleString(undefined, { month: "long", year: "numeric" });

  const start = monthStart(m);
  const end = monthEnd(m);
  const firstDayIndex = (start.getDay() + 6) % 7;
  const daysInMonth = end.getDate();

  grid.innerHTML = `
    <div class="dow">Mon</div><div class="dow">Tue</div><div class="dow">Wed</div><div class="dow">Thu</div><div class="dow">Fri</div><div class="dow">Sat</div><div class="dow">Sun</div>
  `;
  for (let i = 0; i < firstDayIndex; i++) grid.appendChild(document.createElement("div"));

  const byDay = new Map();
  for (const ev of state.events) {
    const d = new Date(ev.start_time);
    if (d.getMonth() !== m.getMonth() || d.getFullYear() !== m.getFullYear()) continue;
    const day = d.getDate();
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(ev);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const cell = document.createElement("div");
    cell.className = "cal-cell";
    cell.innerHTML = `<div class="cal-day">${day}</div>`;
    (byDay.get(day) || []).forEach((ev) => {
      const title =
        state.language === "es" ? ev.title_es || ev.title_en : ev.title_en || ev.title_es;
      const badge = document.createElement("div");
      badge.className = `cal-badge status-${ev.status}`;
      badge.title = title || "";
      badge.textContent = (ev.language || "bi").toUpperCase();
      cell.appendChild(badge);
    });
    grid.appendChild(cell);
  }
}

function renderExistingSlots() {
  const slotList = $("#slotList");
  if (!slotList) return;
  const items = state.events
    .slice()
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
    .map(
      (e) =>
        `<div class="slot-item"><span>${fmtDateTime(e.start_time)}${
          e.end_time ? " – " + fmtDateTime(e.end_time) : ""
        }</span> <span class="tag status-${e.status}">${e.status}</span> <span class="tag">${(
          e.language || "bi"
        ).toUpperCase()}</span></div>`
    )
    .join("");
  slotList.innerHTML = items || `<div class="empty">${tr("schedule.empty")}</div>`;
}

function checkCreateFormConflicts() {
  const startIso = toIsoOrNull($("#startTime").value);
  const endIso = toIsoOrNull($("#endTime").value);
  const conflicts = findConflicts(startIso, endIso);
  const conflictDiv = $("#slotConflicts");
  if (!conflictDiv) return false;
  if (startIso && conflicts.length) {
    conflictDiv.innerHTML = conflicts
      .map(
        (ev) =>
          `<div class="conflict-row">⚠️ ${fmtDateTime(ev.start_time)}${
            ev.end_time ? " – " + fmtDateTime(ev.end_time) : ""
          } — ${escapeHtml(ev.title_en || ev.title_es || "")}</div>`
      )
      .join("");
    return true;
  } else {
    conflictDiv.innerHTML = `<div class="muted">—</div>`;
    return false;
  }
}

function findConflicts(startIso, endIso, excludeEventId = null) {
  if (!startIso) return [];
  return state.events.filter((ev) => {
    if (excludeEventId && ev.id === excludeEventId) return false;
    if (ev.status === "canceled") return false;
    return overlaps(startIso, endIso, ev.start_time, ev.end_time);
  });
}

function renderSlotSuggestions() {
  const container = $("#slotSuggestions");
  if (!container) return;
  const sugg = suggestOpenSlots(60, 5);
  container.innerHTML =
    sugg
      .map(
        (s) =>
          `<button class="chip" data-suggest="${s.start.toISOString()}">${fmtDateTime(
            s.start.toISOString()
          )}</button>`
      )
      .join("") || `<div class="muted">—</div>`;
  container.querySelectorAll("[data-suggest]").forEach((btn) => {
    btn.addEventListener("click", () => {
      $("#startTime").value = toLocalInputValue(btn.dataset.suggest);
      $("#endTime").value = "";
      checkCreateFormConflicts();
    });
  });
}

/* ====== Threads and comments (with likes) ====== */
async function loadThreads(eventId) {
  const { data, error } = await supabase
    .from("threads")
    .select("*")
    .eq("event_id", eventId)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) {
    console.error(error);
    setFlash("Error loading topics");
    return;
  }
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
      <div class="thread-title">${th.pinned ? "📌 " : ""}${escapeHtml(th.title)}</div>
      <div class="comments" id="c_${th.id}"></div>
      <form class="reply-form" data-thread="${th.id}">
        <textarea placeholder="${state.language === "es" ? "Escribe un comentario…" : "Write a comment…"}" required></textarea>
        <button class="btn-primary" type="submit">${state.language === "es" ? "Comentar" : "Comment"}</button>
      </form>
      <div class="thread-controls">
        ${
          isOrganizer() || state.session?.user?.id === th.created_by
            ? `<button class="btn-ghost btn-sm" data-del-thread="${th.id}">${
                state.language === "es" ? "Eliminar tema" : "Delete topic"
              }</button>`
            : ""
        }
        ${
          isOrganizer()
            ? `<button class="btn-ghost btn-sm" data-pin-thread="${th.id}" data-pinned="${th.pinned ? "1" : "0"}">${
                th.pinned ? (state.language === "es" ? "Desfijar" : "Unpin") : (state.language === "es" ? "Fijar" : "Pin")
              }</button>`
            : ""
        }
      </div>
    `;
    list.appendChild(wrap);
    loadComments(th.id);

    // Safe reply handling
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

    // Delete thread
    wrap.querySelectorAll("[data-del-thread]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("Delete this topic?")) return;
        const { error } = await supabase.from("threads").delete().eq("id", btn.dataset.delThread);
        if (error) return setFlash(error.message);
        await loadThreads(state.selectedEvent.id);
      });
    });

    // Pin/unpin
    wrap.querySelectorAll("[data-pin-thread]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.pinThread;
        const next = btn.dataset.pinned !== "1";
        const { error } = await supabase.from("threads").update({ pinned: next }).eq("id", id);
        if (error) return setFlash(error.message);
        await loadThreads(state.selectedEvent.id);
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
  if (error) {
    console.error(error);
    return;
  }
  state.commentsByThread.set(threadId, data || []);
  await loadCommentLikesForThread(threadId);
  renderComments(threadId);
}

async function loadCommentLikesForThread(threadId) {
  const comments = state.commentsByThread.get(threadId) || [];
  const ids = comments.map((c) => c.id);
  if (!ids.length) return;
  const { data, error } = await supabase
    .from("comment_likes")
    .select("comment_id, profile_id")
  .in("comment_id", ids);
  if (error) return;
  // Build map
  const likesMap = new Map();
  ids.forEach((id) => likesMap.set(id, new Set()));
  for (const row of data) {
    if (!likesMap.has(row.comment_id)) likesMap.set(row.comment_id, new Set());
    likesMap.get(row.comment_id).add(row.profile_id);
  }
  // Merge into state map
  for (const [cid, set] of likesMap) {
    state.commentLikes.set(cid, set);
  }
}

function renderComments(threadId) {
  const container = document.getElementById(`c_${threadId}`);
  if (!container) return;
  container.innerHTML = "";
  const comments = state.commentsByThread.get(threadId) || [];

  const byParent = new Map();
  comments.forEach((c) => {
    const pid = c.parent_id || "_root";
    if (!byParent.has(pid)) byParent.set(pid, []);
    byParent.get(pid).push(c);
  });

  (byParent.get("_root") || []).forEach((root) => {
    container.appendChild(renderComment(root, byParent, 0));
  });
}

function renderComment(comment, byParent, level) {
  const el = document.createElement("div");
  el.className = "comment";
  const authorName = resolveProfileName(comment.created_by);
  const likeSet = state.commentLikes.get(comment.id) || new Set();
  const likedByMe = state.session?.user?.id ? likeSet.has(state.session.user.id) : false;

  el.innerHTML = `
    <div class="author">${escapeHtml(authorName)} • ${fmtDateTime(comment.created_at)}</div>
    <div class="text">${comment.is_deleted ? "<em>(deleted)</em>" : escapeHtml(comment.content)}</div>
    <div class="comment-actions">
      <button class="btn-ghost btn-sm" data-like="${comment.id}">${likedByMe ? "💚" : "🤍"} ${likeSet.size}</button>
      ${
        canEditComment(comment)
          ? `<button class="btn-ghost btn-sm" data-del="${comment.id}">${
              state.language === "es" ? "Eliminar" : "Delete"
            }</button>`
          : ""
      }
    </div>
  `;

  // Like handler
  el.querySelectorAll("[data-like]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!state.session) return;
      const cid = btn.dataset.like;
      const liked = state.commentLikes.get(cid)?.has(state.session.user.id);
      if (liked) {
        await supabase.from("comment_likes").delete().eq("comment_id", cid).eq("profile_id", state.session.user.id);
      } else {
        await supabase.from("comment_likes").insert({ comment_id: cid, profile_id: state.session.user.id });
      }
      await loadComments(comment.thread_id);
    });
  });

  // Delete handler
  el.querySelectorAll("[data-del]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await deleteComment(btn.dataset.del, comment.thread_id);
    });
  });

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

  (byParent.get(comment.id) || []).forEach((child) => {
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
  supabase
    .from("profiles")
    .select("id,full_name,username")
    .eq("id", uid)
    .single()
    .then(({ data }) => {
      if (data) {
        state.profileCache.set(uid, data);
        // Re-render threads/comments subtly when cache updated
        if (state.selectedEvent) renderThreads();
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
  if (error) {
    setFlash(error.message);
    return;
  }
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

/* ===== Files (attachments) ===== */
async function loadFiles(eventId) {
  const { data, error } = await supabase
    .from("attachments")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error(error);
    setFlash("Error loading files");
    return;
  }
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
  if (upErr) {
    setFlash(tr("errors.upload"));
    return;
  }

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
  const { data, error } = await supabase.storage.from("attachments").createSignedUrl(path, 60 * 60);
  if (error) return null;
  return data.signedUrl;
}

function renderFiles() {
  const grid = $("#filesList");
  const empty = $("#emptyFiles");
  if (!grid || !empty) return;

  grid.innerHTML = "";
  empty.style.display = state.files.length ? "none" : "block";

  state.files.forEach(async (f) => {
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
        ${
          canDeleteFile(f)
            ? `<button class="btn-danger" data-del="${f.object_path}">${
                state.language === "es" ? "Eliminar" : "Delete"
              }</button>`
            : ""
        }
      </div>
    `;
    div.querySelectorAll("[data-del]").forEach((btn) => {
      btn.addEventListener("click", () => deleteFile(f));
    });
    grid.appendChild(div);
  });
}

function canDeleteFile(f) {
  const uid = state.session?.user?.id;
  if (!uid) return false;
  return f.created_by === uid || ["organizer", "admin"].includes(state.profile?.role);
}

async function deleteFile(f) {
  const { error: sErr } = await supabase.storage.from("attachments").remove([f.object_path]);
  if (sErr) {
    setFlash(sErr.message);
    return;
  }
  const { error: dErr } = await supabase
    .from("attachments")
    .delete()
    .eq("bucket_id", "attachments")
    .eq("object_path", f.object_path);
  if (dErr) {
    setFlash(dErr.message);
    return;
  }
  setFlash(state.language === "es" ? "Archivo eliminado" : "File deleted");
  await loadFiles(state.selectedEvent.id);
}

/* ===== RSVPs, Follows, Speakers ===== */
async function loadRSVPFollow(eventId) {
  state.rsvpStatus = null;
  state.isFollowing = false;
  state.counts = { followers: 0, going: 0, interested: 0 };

  // Counts
  const [{ data: follows }, { data: rsvps }] = await Promise.all([
    supabase.from("event_follows").select("event_id").eq("event_id", eventId),
    supabase.from("event_rsvps").select("status").eq("event_id", eventId),
  ]);

  state.counts.followers = follows?.length || 0;
  state.counts.going = rsvps?.filter((r) => r.status === "going").length || 0;
  state.counts.interested = rsvps?.filter((r) => r.status === "interested").length || 0;

  if (state.session) {
    const uid = state.session.user.id;
    const [{ data: myFollow }, { data: myRsvp }] = await Promise.all([
      supabase
        .from("event_follows")
        .select("id")
        .eq("event_id", eventId)
        .eq("profile_id", uid)
        .maybeSingle(),
      supabase
        .from("event_rsvps")
        .select("status")
        .eq("event_id", eventId)
        .eq("profile_id", uid)
        .maybeSingle(),
    ]);
    state.isFollowing = !!myFollow;
    state.rsvpStatus = myRsvp?.status || null;
  }

  renderEventHeader();
}

async function toggleFollow() {
  if (!state.session || !state.selectedEvent) return;
  const uid = state.session.user.id;
  const eventId = state.selectedEvent.id;
  if (state.isFollowing) {
    await supabase.from("event_follows").delete().eq("event_id", eventId).eq("profile_id", uid);
  } else {
    await supabase.from("event_follows").insert({ event_id: eventId, profile_id: uid });
  }
  await loadRSVPFollow(eventId);
}

async function setRSVP(status) {
  if (!state.session || !state.selectedEvent) return;
  const uid = state.session.user.id;
  const eventId = state.selectedEvent.id;
  const { error } = await supabase
    .from("event_rsvps")
    .upsert(
      { event_id: eventId, profile_id: uid, status },
      { onConflict: "event_id,profile_id" }
    );
  if (error) return setFlash(error.message);
  setFlash(tr("rsvp.saved"));
  await loadRSVPFollow(eventId);
}

async function loadSpeakers(eventId) {
  const { data, error } = await supabase
    .from("event_speakers")
    .select("id,event_id,profile_id,name,affiliation,language,primary_speaker,created_at,profiles(full_name,username)")
    .eq("event_id", eventId)
    .order("primary_speaker", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) {
    console.error("speakers error:", error);
    return;
  }
  state.speakers = (data || []).map((s) => ({
    ...s,
    profile: s.profiles || null,
  }));
  renderSpeakers();
}

function renderSpeakers() {
  const list = $("#speakersList");
  if (!list) return;
  list.innerHTML =
    state.speakers
      .map((s) => {
        const display = s.profile?.full_name || s.name;
        const aff = s.affiliation ? ` — <span class="muted">${escapeHtml(s.affiliation)}</span>` : "";
        const primaryTag = s.primary_speaker ? ` <span class="tag">Primary</span>` : "";
        const byProfile =
          s.profile_id && s.profile
            ? ` <span class="tag">@${escapeHtml(s.profile.username || "")}</span>`
            : "";
        const removeBtn = isOrganizer()
          ? `<button class="btn-ghost btn-sm" data-remove-speaker="${s.id}">${tr(
              "speakers.remove",
              "Remove"
            )}</button>`
          : "";
        return `<div class="speaker">
            <div class="speaker-name">${escapeHtml(display)}${byProfile}${primaryTag}${aff}</div>
            ${removeBtn}
          </div>`;
      })
      .join("") || `<div class="muted">—</div>`;

  list.querySelectorAll("[data-remove-speaker]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Remove speaker?")) return;
      const { error } = await supabase
        .from("event_speakers")
        .delete()
        .eq("id", btn.dataset.removeSpeaker);
      if (error) return setFlash(error.message);
      setFlash(tr("speakers.removed"));
      await loadSpeakers(state.selectedEvent.id);
    });
  });

  $("#manageSpeakers").style.display = isOrganizer() ? "block" : "none";
}

/* ===== Admin: create/update/delete events ===== */
function isOrganizer() {
  return ["organizer", "admin"].includes(state.profile?.role);
}

async function createEvent(payload) {
  if (isCreatingEvent) return false;
  isCreatingEvent = true;
  try {
    // Block if conflicts
    const conflicts = findConflicts(payload.start_time, payload.end_time);
    if (conflicts.length) {
      setFlash(tr("errors.overlap"));
      return false;
    }

    // Insert
    const insertPromise = supabase
      .from("events")
      .insert([
        {
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
        },
      ])
      .select()
      .single();

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Request timeout after 10 seconds")), 10000)
    );

    const result = await Promise.race([insertPromise, timeoutPromise]);

    if (result?.error) {
      const error = result.error;
      if (error.code === "42501") {
        setFlash("Permission denied. Check RLS policies.");
      } else if (error.code === "23505") {
        setFlash("Duplicate event.");
      } else {
        setFlash(`Error: ${error.message || "Unknown error"}`);
      }
      return false;
    }

    setFlash("Event created successfully!");
    const form = $("#createEventForm");
    if (form) form.reset();
    await loadEvents();
    setTimeout(() => showView("schedule"), 100);
    return true;
  } catch (err) {
    if (err.message === "Request timeout after 10 seconds") {
      setFlash("Request timed out. Check database policies.");
    } else {
      setFlash(tr("errors.create_event"));
    }
    return false;
  } finally {
    isCreatingEvent = false;
  }
}

function fillEditEventForm() {
  const ev = state.selectedEvent;
  if (!ev) return;
  $("#editTitleEn").value = ev.title_en || "";
  $("#editTitleEs").value = ev.title_es || "";
  $("#editDescEn").value = ev.description_en || "";
  $("#editDescEs").value = ev.description_es || "";
  $("#editStartTime").value = toLocalInputValue(ev.start_time);
  $("#editEndTime").value = toLocalInputValue(ev.end_time);
  $("#editEventLang").value = ev.language || "bi";
  $("#editHostOrg").value = ev.host_org || "";
  $("#editZoomUrl").value = ev.zoom_url || "";
}

async function updateEvent(payload) {
  if (isUpdatingEvent) return false;
  isUpdatingEvent = true;
  try {
    const ev = state.selectedEvent;
    // block conflicts, excluding the same event id
    const conflicts = findConflicts(payload.start_time, payload.end_time, ev.id);
    if (conflicts.length) {
      setFlash(tr("errors.overlap"));
      return false;
    }
    const { error } = await supabase
      .from("events")
      .update({
        title_en: payload.title_en,
        title_es: payload.title_es,
        description_en: payload.description_en,
        description_es: payload.description_es,
        start_time: payload.start_time,
        end_time: payload.end_time,
        language: payload.language,
        host_org: payload.host_org,
        zoom_url: payload.zoom_url,
      })
      .eq("id", ev.id);
    if (error) {
      setFlash(tr("errors.update_event"));
      return false;
    }
    setFlash(tr("save", "Save") + "d");
    await loadEvents();
    // refresh the selected event reference
    state.selectedEvent = state.events.find((e) => e.id === ev.id) || ev;
    renderEventHeader();
    $("#editEventPanel").style.display = "none";
    return true;
  } finally {
    isUpdatingEvent = false;
  }
}

async function deleteEvent() {
  if (!state.selectedEvent) return;
  if (!confirm(state.language === "es" ? "¿Eliminar evento?" : "Delete event?")) return;
  const { error } = await supabase.from("events").delete().eq("id", state.selectedEvent.id);
  if (error) return setFlash(tr("errors.delete_event"));
  await loadEvents();
  showView("schedule");
}

/* ===== Speakers: organizers manage ===== */
async function addSpeaker({ name, affiliation, linkMyProfile }) {
  if (!state.selectedEvent) return;
  const payload = {
    event_id: state.selectedEvent.id,
    name: name || null,
    affiliation: affiliation || null,
    profile_id: linkMyProfile ? state.session?.user?.id : null,
    language: state.selectedEvent.language || "bi",
    primary_speaker: false,
  };
  const { error } = await supabase.from("event_speakers").insert(payload);
  if (error) return setFlash(error.message);
  setFlash(tr("speakers.added"));
  await loadSpeakers(state.selectedEvent.id);
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
  const profile = $("#profile");

  // Default to hiding all main sections, then show the correct ones.
  // This prevents state from "leaking" between view changes.
  schedule.style.display = "none";
  eventDetail.style.display = "none";
  admin.style.display = "none";
  hero.style.display = "none";
  auth.style.display = "none";
  profile.style.display = "none";

  if (which === "schedule") {
    hero.style.display = "block";
    schedule.style.display = "block";
    if (!state.session) {
      auth.style.display = "block";
    }
  } else if (which === "event") {
    eventDetail.style.display = "block";
  } else if (which === "admin") {
    if (!isOrganizer()) {
      setFlash("Access denied. You need organizer or admin privileges.");
      showView("schedule"); // Redirect to schedule if not an organizer
      return;
    }
    admin.style.display = "block";
  } else if (which === "profile") {
    profile.style.display = "block";
  }
}

/* ============= Wire-up ============= */
/* ============= Wire-up ============= */
function wireUI() {
  // Sign out
  const btnSignOut = $("#btnSignOut");
  if (btnSignOut) {
    btnSignOut.addEventListener("click", async () => {
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

  // OAuth
  const btnGoogle = $("#btnGoogle");
  if (btnGoogle) btnGoogle.addEventListener("click", () => oauth("google"));
  
  // FIX: Add this block for profile navigation
  const btnProfile = $("#btnProfile");
  if (btnProfile) {
    btnProfile.addEventListener("click", () => showView("profile"));
  }
  const backFromProfile = $("#backFromProfile");
  if (backFromProfile) {
    backFromProfile.addEventListener("click", () => showView("schedule"));
  }

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
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const tabId = tab.dataset.tab;
      document.querySelectorAll(".tab-panel").forEach((p) => (p.style.display = "none"));
      const panel = $("#tab_" + tabId);
      if (panel) panel.style.display = "block";
    });
  });

  // Language
  document.querySelectorAll(".lang-switch .chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.language = btn.dataset.lang;
      localStorage.setItem("lang", state.language);
      applyI18n();
      renderEventsList();
      if (state.selectedEvent) renderEventHeader();
      renderFiles();
      renderThreads();
      renderScheduleCalendar();
      renderAdminCalendarPreview();
      renderExistingSlots();
    });
  });

  // Search
  const searchInput = $("#search");
  if (searchInput) searchInput.addEventListener("input", renderEventsList);

  // View switch (list / calendar)
  $("#viewList")?.addEventListener("click", () => {
    $("#viewList").classList.add("active");
    $("#viewCalendar").classList.remove("active");
    $("#eventsList").style.display = "grid";
    $("#calendar").style.display = "none";
  });
  $("#viewCalendar")?.addEventListener("click", () => {
    $("#viewCalendar").classList.add("active");
    $("#viewList").classList.remove("active");
    $("#eventsList").style.display = "none";
    $("#calendar").style.display = "block";
  });

  // Calendar navigation
  $("#calPrev")?.addEventListener("click", () => {
    state.calendarMonth = new Date(
      state.calendarMonth.getFullYear(),
      state.calendarMonth.getMonth() - 1,
      1
    );
    renderScheduleCalendar();
  });
  $("#calNext")?.addEventListener("click", () => {
    state.calendarMonth = new Date(
      state.calendarMonth.getFullYear(),
      state.calendarMonth.getMonth() + 1,
      1
    );
    renderScheduleCalendar();
  });

  // Profile form
  $("#profileForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!state.session) return;
    const payload = {
      full_name: $("#fullName").value.trim() || null,
      username: $("#username").value.trim() || null,
      affiliation: $("#affiliation").value.trim() || null,
    };
    const { error } = await supabase.from("profiles").update(payload).eq("id", state.session.user.id);
    if (error) return setFlash(error.message);
    setFlash(tr("profile.saved"));
    await ensureProfile();
    renderAuthUI();
  });

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

  // Create event form
  const createEventForm = $("#createEventForm");
  if (createEventForm) {
    createEventForm.addEventListener("input", checkCreateFormConflicts);
    createEventForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (isCreatingEvent) return;
      const submitBtn = e.target.querySelector('button[type="submit"]');
      const originalText = submitBtn?.textContent;
      try {
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = "Creating...";
        }
        const payload = {
          title_en: $("#titleEn")?.value.trim(),
          title_es: $("#titleEs")?.value.trim() || null,
          description_en: $("#descEn")?.value.trim() || null,
          description_es: $("#descEs")?.value.trim() || null,
          start_time: toIsoOrNull($("#startTime")?.value),
          end_time: toIsoOrNull($("#endTime")?.value),
          language: $("#eventLang")?.value || "bi",
          host_org: $("#hostOrg")?.value.trim() || null,
          zoom_url: $("#zoomUrl")?.value.trim() || null,
        };
        if (!payload.title_en) {
          setFlash("Title (EN) is required");
          $("#titleEn")?.focus();
          return;
        }
        if (!payload.start_time) {
          setFlash("Start time is required");
          $("#startTime")?.focus();
          return;
        }
        const conflicts = checkCreateFormConflicts();
        if (conflicts) {
          setFlash(tr("errors.overlap"));
          return;
        }
        await createEvent(payload);
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = originalText || tr("event.create", "Create Event");
        }
      }
    });
  }

  // Event actions
  $("#btnFollow")?.addEventListener("click", toggleFollow);
  document.querySelectorAll("[data-rsvp]").forEach((btn) =>
    btn.addEventListener("click", () => setRSVP(btn.dataset.rsvp))
  );

  $("#btnEditEvent")?.addEventListener("click", () => {
    $("#editEventPanel").style.display = "block";
  });
  $("#btnCancelEdit")?.addEventListener("click", () => {
    $("#editEventPanel").style.display = "none";
    fillEditEventForm();
  });
  $("#editEventForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      title_en: $("#editTitleEn").value.trim() || null,
      title_es: $("#editTitleEs").value.trim() || null,
      description_en: $("#editDescEn").value.trim() || null,
      description_es: $("#editDescEs").value.trim() || null,
      start_time: toIsoOrNull($("#editStartTime").value),
      end_time: toIsoOrNull($("#editEndTime").value),
      language: $("#editEventLang").value,
      host_org: $("#editHostOrg").value.trim() || null,
      zoom_url: $("#editZoomUrl").value.trim() || null,
    };
    await updateEvent(payload);
  });
  $("#btnDeleteEvent")?.addEventListener("click", deleteEvent);

  // Manage speakers
  $("#linkMyProfile")?.addEventListener("click", () => {
    $("#speakerName").value = state.profile?.full_name || "";
  });
  $("#addSpeakerForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = $("#speakerName").value.trim();
    const affiliation = $("#speakerAffiliation").value.trim();
    const linkMyProfile = !name && state.profile?.full_name; // if name empty, link profile
    await addSpeaker({ name, affiliation, linkMyProfile });
    $("#speakerName").value = "";
    $("#speakerAffiliation").value = "";
  });

  // Year in footer
  const yearEl = $("#year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();
}

/* ============= Bootstrap ============= */
(async function main() {
  applyI18n();
  wireUI();
  await initAuth();
  renderHeader();
  renderAuthUI();
  await loadEvents();
  // default to list view
  $("#eventsList").style.display = "grid";
  $("#calendar").style.display = "none";
})();