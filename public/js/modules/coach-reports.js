// js/modules/coach-reports.js
// Controller for coach-reports.html detail views
// Adds common range (7D/30D/90D) + per-view filters without changing backend.

import API from "../api.js";
import { requireLogin } from "../core/auth.js";
import { getCurrentUser } from "./users.js";
import { listRegistrationsForTournament } from "./tournaments.js";
import { loadData } from "../core/storage.js";

/* ---------- Local state ---------- */
const state = {
  view: "attendance",
  range: "30d", // 7d | 30d | 90d
  filters: {
    attendance: { statuses: new Set(["APPROVED", "PENDING", "REJECTED"]) },
    achievements: { showApproved: true, showPending: true },
    players: { minSessions: 0 },
    schedules: { entrance: "ALL" }, // ALL | OPEN | APPROVAL
    tournaments: { status: "ALL" }, // ALL | PENDING | CONFIRMED
  },
};

const viewContainer = () => document.getElementById("viewContainer");
const loadingEl = () => document.getElementById("loading");
const viewFiltersEl = () => document.getElementById("viewFilters");

const VIEWS = {
  attendance: renderAttendanceView,
  achievements: renderAchievementsView,
  players: renderPlayersView,
  schedules: renderSchedulesView,
  tournaments: renderTournamentsView,
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  requireLogin();
  const coach = getCurrentUser();
  if (!coach || coach.role !== "Coach") {
    window.location.href = "dashboard.html";
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const view = (params.get("view") || "attendance").toLowerCase();
  state.view = view;

  setPageTitle(view);
  highlightViewChip(view);

  buildFilterBar(view); // NEW: build common + per-view filters
  highlightRangeChip(); // NEW: show active range

  if (typeof VIEWS[view] === "function") {
    showLoading(true);
    try {
      await VIEWS[view](coach);
    } catch (err) {
      console.error("Reports view error:", err);
      renderError("Failed to load report details. Please try again.");
    } finally {
      showLoading(false);
    }
  } else {
    renderError("Unknown view parameter.");
  }
}

/* ---------- Filter bar (common + per-view) ---------- */
function buildFilterBar(view) {
  // Bind range chips
  document.querySelectorAll("[data-range]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.range = btn.getAttribute("data-range") || "30d";
      highlightRangeChip();
      rerender();
    });
  });

  // Inject per-view controls
  renderViewSpecificFilters(view);
}

function renderViewSpecificFilters(view) {
  const vf = viewFiltersEl();
  if (!vf) return;
  vf.innerHTML = ""; // reset

  // Helpers to create controls quickly
  const mkLabel = (txt) => {
    const span = document.createElement("span");
    span.className = "text-xs text-white/60";
    span.textContent = txt;
    return span;
  };

  if (view === "attendance") {
    // Status multi-select: Approved, Pending, Rejected
    vf.appendChild(mkLabel("Status"));
    ["APPROVED", "PENDING", "REJECTED"].forEach((st) => {
      const id = `att-${st.toLowerCase()}`;
      const label = document.createElement("label");
      label.className = "flex items-center gap-1 text-xs";
      label.innerHTML = `
        <input type="checkbox" id="${id}" class="rounded bg-white/10" ${
        state.filters.attendance.statuses.has(st) ? "checked" : ""
      }/>
        <span>${st.charAt(0) + st.slice(1).toLowerCase()}</span>`;
      label.querySelector("input").addEventListener("change", (e) => {
        if (e.target.checked) state.filters.attendance.statuses.add(st);
        else state.filters.attendance.statuses.delete(st);
        rerender();
      });
      vf.appendChild(label);
    });
  }

  if (view === "achievements") {
    // Toggle show approved / pending
    vf.appendChild(mkLabel("Show"));
    const mkToggle = (key, labelText) => {
      const id = `ach-${key}`;
      const wrap = document.createElement("label");
      wrap.className = "flex items-center gap-1 text-xs";
      wrap.innerHTML = `
        <input type="checkbox" id="${id}" class="rounded bg-white/10" ${
        state.filters.achievements[key] ? "checked" : ""
      }/>
        <span>${labelText}</span>`;
      wrap.querySelector("input").addEventListener("change", (e) => {
        state.filters.achievements[key] = !!e.target.checked;
        rerender();
      });
      vf.appendChild(wrap);
    };
    mkToggle("showApproved", "Approved");
    mkToggle("showPending", "Pending");
  }

  if (view === "players") {
    // Min sessions in range (last N days)
    vf.appendChild(mkLabel("Min sessions"));
    const inp = document.createElement("input");
    inp.type = "number";
    inp.min = "0";
    inp.value = String(state.filters.players.minSessions || 0);
    inp.className =
      "w-16 rounded bg-white/10 border border-white/10 px-2 py-1 text-xs";
    inp.addEventListener("input", (e) => {
      const v = Math.max(0, parseInt(e.target.value || "0", 10) || 0);
      state.filters.players.minSessions = v;
      rerender();
    });
    vf.appendChild(inp);
  }

  if (view === "schedules") {
    // Entrance: ALL | OPEN | APPROVAL
    vf.appendChild(mkLabel("Entrance"));
    const sel = document.createElement("select");
    sel.className =
      "rounded bg-white/10 border border-white/10 px-2 py-1 text-xs";
    sel.innerHTML = `
      <option value="ALL">All</option>
      <option value="OPEN">Open</option>
      <option value="APPROVAL">Approval</option>`;
    sel.value = state.filters.schedules.entrance;
    sel.addEventListener("change", (e) => {
      state.filters.schedules.entrance = e.target.value;
      rerender();
    });
    vf.appendChild(sel);
  }

  if (view === "tournaments") {
    // Status: ALL | PENDING | CONFIRMED
    vf.appendChild(mkLabel("Status"));
    const sel = document.createElement("select");
    sel.className =
      "rounded bg-white/10 border border-white/10 px-2 py-1 text-xs";
    sel.innerHTML = `
      <option value="ALL">All</option>
      <option value="PENDING">Pending</option>
      <option value="CONFIRMED">Confirmed</option>`;
    sel.value = state.filters.tournaments.status;
    sel.addEventListener("change", (e) => {
      state.filters.tournaments.status = e.target.value;
      rerender();
    });
    vf.appendChild(sel);
  }
}

function highlightRangeChip() {
  document.querySelectorAll("[data-range]").forEach((btn) => {
    btn.classList.remove("bg-primary/20", "text-white");
    const v = btn.getAttribute("data-range");
    if (v === state.range) {
      btn.classList.add("bg-primary/20", "text-white");
    }
  });
}

/* ---------- Common helpers ---------- */
function rerender() {
  // re-run current view with filters applied
  const coach = getCurrentUser();
  if (!coach) return;
  if (typeof VIEWS[state.view] !== "function") return;
  showLoading(true);
  VIEWS[state.view](coach).finally(() => showLoading(false));
}

function showLoading(isLoading) {
  const el = loadingEl();
  if (!el) return;
  el.style.display = isLoading ? "block" : "none";
}

function renderError(message) {
  const c = viewContainer();
  if (!c) return;
  c.innerHTML = `
    <div class="glassmorphic rounded-xl p-6 text-center text-red-300">
      ${escapeHtml(message || "Something went wrong.")}
    </div>`;
}

function setPageTitle(view) {
  const titleMap = {
    attendance: "Attendance Details",
    achievements: "Achievements Details",
    players: "Active Players",
    schedules: "Upcoming Schedules",
    tournaments: "Tournament Registrations",
  };
  const h1 = document.getElementById("pageTitle");
  if (h1) h1.textContent = titleMap[view] || "Reports";
}

function highlightViewChip(view) {
  document.querySelectorAll("[data-chip]").forEach((chip) => {
    chip.classList.remove("bg-primary/20", "text-white");
    if (chip.getAttribute("data-chip") === view) {
      chip.classList.add("bg-primary/20", "text-white");
    }
  });
}

function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
function daysFromNow(n) {
  const x = new Date();
  x.setDate(x.getDate() + n);
  return x;
}
function getRangeDays() {
  return state.range === "7d" ? 7 : state.range === "90d" ? 90 : 30;
}
function getWindowForView(view) {
  const n = getRangeDays();
  const today = new Date();
  if (view === "schedules") {
    // Upcoming
    const start = startOfDay(today);
    const end = endOfDay(daysFromNow(n - 1));
    return { start, end };
  }
  // Past window for attendance/players
  const start = startOfDay(daysFromNow(-(n - 1)));
  const end = endOfDay(today);
  return { start, end };
}
function inRange(dateStr, start, end) {
  const d = new Date(dateStr);
  return d >= start && d <= end;
}

/* ---------- View: Attendance (past N days) ---------- */
async function renderAttendanceView(coach) {
  state.view = "attendance";
  renderViewSpecificFilters("attendance");

  const c = viewContainer();
  if (!c) return;

  const res = await API.getCoachSchedules(coach.id);
  const schedules = (res?.items || []).slice();

  const { start, end } = getWindowForView("attendance");

  const recent = schedules
    .filter((s) => inRange(s.date, start, end))
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const rows = [];
  for (const s of recent) {
    const [appr, pend, rej] = await Promise.all([
      API.getScheduleRequests(s.id, "APPROVED"),
      API.getScheduleRequests(s.id, "PENDING"),
      API.getScheduleRequests(s.id, "REJECTED"),
    ]);
    const counts = {
      approved: (appr?.items || []).length,
      pending: (pend?.items || []).length,
      rejected: (rej?.items || []).length,
    };
    // Apply status filter: keep if at least one of selected statuses exists
    const sel = state.filters.attendance.statuses;
    const hasSelected =
      (sel.has("APPROVED") && counts.approved > 0) ||
      (sel.has("PENDING") && counts.pending > 0) ||
      (sel.has("REJECTED") && counts.rejected > 0);
    if (!hasSelected) continue;

    const total = counts.approved + counts.pending + counts.rejected;
    const pct = total > 0 ? Math.round((counts.approved / total) * 100) : 0;

    rows.push(`
      <article class="glassmorphic rounded-xl p-4">
        <header class="flex items-center justify-between gap-3">
          <div>
            <h3 class="text-base font-bold text-white">${escapeHtml(
              s.venue
            )}</h3>
            <p class="text-xs text-white/70">${fmtDate(
              s.date
            )} • ${fmtTimeRange(s.startTime, s.endTime)} • ${escapeHtml(
      s.sport
    )}</p>
          </div>
          <div class="text-2xl font-extrabold">${pct}%</div>
        </header>
        <div class="mt-3 h-2 w-full rounded-full bg-white/10 overflow-hidden">
          <div class="h-2 rounded-full bg-primary" style="width:${pct}%"></div>
        </div>
        <div class="mt-3 flex gap-3 text-xs text-white/80">
          <span class="inline-flex items-center gap-1 bg-green-500/15 text-green-300 px-2 py-0.5 rounded-full">✓ ${
            counts.approved
          } Approved</span>
          <span class="inline-flex items-center gap-1 bg-yellow-500/15 text-yellow-300 px-2 py-0.5 rounded-full">⏳ ${
            counts.pending
          } Pending</span>
          <span class="inline-flex items-center gap-1 bg-red-500/15 text-red-300 px-2 py-0.5 rounded-full">✗ ${
            counts.rejected
          } Rejected</span>
        </div>
      </article>
    `);
  }

  c.innerHTML = rows.length
    ? rows.join("")
    : `<div class="glassmorphic rounded-xl p-6 text-center text-white/70">No sessions in the selected range.</div>`;
}

/* ---------- View: Achievements ---------- */
async function renderAchievementsView() {
  state.view = "achievements";
  renderViewSpecificFilters("achievements");

  const c = viewContainer();
  if (!c) return;

  const [pending, approved] = await Promise.all([
    API.getPendingAchievements("PENDING"),
    API.getPendingAchievements("APPROVED"),
  ]);

  const pItems = pending?.items || [];
  const aItems = approved?.items || [];

  const showA = state.filters.achievements.showApproved;
  const showP = state.filters.achievements.showPending;

  const approvedHtml = aItems.length
    ? aItems.map((a) => achievementCard(a, "approved")).join("")
    : `<div class="glassmorphic rounded-xl p-4 text-white/70">No approved achievements.</div>`;

  const pendingHtml = pItems.length
    ? pItems.map((a) => achievementCard(a, "pending")).join("")
    : `<div class="glassmorphic rounded-xl p-4 text-white/70">No pending achievements.</div>`;

  c.innerHTML =
    `
    ${
      showA
        ? `<section class="space-y-3">
      <h2 class="text-lg font-bold text-white">Approved</h2>
      ${approvedHtml}
    </section>`
        : ""
    }

    ${
      showP
        ? `<section class="space-y-3 mt-6">
      <h2 class="text-lg font-bold text-white">Pending</h2>
      ${pendingHtml}
    </section>`
        : ""
    }
  ` ||
    `<div class="glassmorphic rounded-xl p-4 text-white/70">No sections selected.</div>`;
}

function achievementCard(a, kind = "approved") {
  const owner = a?.owner || {};
  const statusBadge =
    kind === "approved"
      ? `<span class="inline-block rounded-full bg-green-500/15 text-green-300 text-xs font-semibold px-2 py-0.5">APPROVED</span>`
      : `<span class="inline-block rounded-full bg-yellow-500/15 text-yellow-300 text-xs font-semibold px-2 py-0.5">PENDING</span>`;
  return `
    <article class="glassmorphic rounded-xl p-4">
      <header class="flex items-start justify-between gap-3">
        <div>
          <h3 class="text-base font-bold text-white">${escapeHtml(
            a.title || "Achievement"
          )}</h3>
          <p class="text-xs text-white/70">${escapeHtml(
            owner.name || owner.username || "Player"
          )} • ${escapeHtml(a.sport || "-")} • ${fmtDate(a.date)}</p>
        </div>
        ${statusBadge}
      </header>
      <p class="text-sm text-white/80 mt-2">${escapeHtml(a.venue || "-")}</p>
      ${
        a.decisionReason
          ? `<p class="text-xs text-white/60 mt-1">Note: ${escapeHtml(
              a.decisionReason || ""
            )}</p>`
          : ""
      }
    </article>
  `;
}

/* ---------- View: Players (past N days) ---------- */
async function renderPlayersView(coach) {
  state.view = "players";
  renderViewSpecificFilters("players");

  const c = viewContainer();
  if (!c) return;

  const res = await API.getCoachSchedules(coach.id);
  const schedules = (res?.items || []).slice();

  const { start } = getWindowForView("players");
  const minSessions = state.filters.players.minSessions || 0;

  const playerMap = new Map(); // playerId -> { player, count }

  // count APPROVED requests made within the last N days (by createdAt)
  for (const s of schedules) {
    const rq = await API.getScheduleRequests(s.id, "APPROVED");
    for (const r of rq?.items || []) {
      const created = new Date(r.createdAt);
      if (created >= start) {
        const p = r.player || {};
        const key = p.id || r.playerId;
        if (!key) continue;
        const prev = playerMap.get(key) || { player: p, count: 0 };
        prev.count += 1;
        prev.player = p;
        playerMap.set(key, prev);
      }
    }
  }

  const players = Array.from(playerMap.values())
    .filter((x) => x.count >= minSessions)
    .sort((a, b) => b.count - a.count);

  const cards = players
    .map(({ player, count }) => playerCard(player, count))
    .join("");

  c.innerHTML = cards.length
    ? cards
    : `<div class="glassmorphic rounded-xl p-6 text-center text-white/70">No players match the filters.</div>`;
}

function playerCard(player, weekCount = 0) {
  const avatar = player?.profilePic || "img/defaultavatar.jpg";
  const name = player?.name || player?.username || "Player";
  const sport = player?.sport || "-";
  const email = player?.email || "";
  const mobile = player?.mobile || "";

  return `
    <article class="glassmorphic rounded-xl p-4 flex items-center gap-4">
      <img src="${escapeHtml(
        avatar
      )}" alt="Avatar" class="w-14 h-14 rounded-lg object-cover border border-white/10" />
      <div class="flex-1 min-w-0">
        <h3 class="text-white font-bold truncate">${escapeHtml(name)}</h3>
        <p class="text-xs text-white/70 truncate">${escapeHtml(sport)}</p>
        <div class="mt-2 flex flex-wrap gap-2 text-xs">
          <span class="inline-flex items-center gap-1 bg-primary/20 text-white px-2 py-0.5 rounded-full">📅 ${weekCount} sessions in range</span>
          ${
            email
              ? `<span class="inline-flex items-center gap-1 bg-white/10 text-white px-2 py-0.5 rounded-full">📧 ${escapeHtml(
                  email
                )}</span>`
              : ""
          }
          ${
            mobile
              ? `<span class="inline-flex items-center gap-1 bg-white/10 text-white px-2 py-0.5 rounded-full">📱 ${escapeHtml(
                  mobile
                )}</span>`
              : ""
          }
        </div>
      </div>
    </article>
  `;
}

/* ---------- View: Schedules (next N days) ---------- */
async function renderSchedulesView(coach) {
  state.view = "schedules";
  renderViewSpecificFilters("schedules");

  const c = viewContainer();
  if (!c) return;

  const res = await API.getCoachSchedules(coach.id);
  const schedules = (res?.items || []).slice();

  const { start, end } = getWindowForView("schedules");
  const entrance = state.filters.schedules.entrance || "ALL";

  const upcoming = schedules
    .filter((s) => inRange(s.date, start, end))
    .filter((s) => (entrance === "ALL" ? true : s.entrance === entrance))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const cards = [];
  for (const s of upcoming) {
    const approved = await API.getScheduleRequests(s.id, "APPROVED");
    const count = (approved?.items || []).length;

    cards.push(`
      <article class="glassmorphic rounded-xl p-4">
        <header class="flex items-center justify-between gap-3">
          <div>
            <h3 class="text-base font-bold text-white">${fmtDate(s.date)}</h3>
            <p class="text-xs text-white/70">${fmtTimeRange(
              s.startTime,
              s.endTime
            )} • ${escapeHtml(s.venue)} • ${escapeHtml(s.sport)}</p>
          </div>
          <span class="inline-flex items-center gap-1 bg-white/10 px-2 py-0.5 rounded-full text-xs">👥 ${count} players</span>
        </header>
        <div class="mt-2">
          <span class="inline-block text-xs rounded-full ${
            s.entrance === "OPEN"
              ? "bg-green-500/15 text-green-300"
              : "bg-yellow-500/15 text-yellow-300"
          } px-2 py-0.5">
            ${s.entrance === "OPEN" ? "OPEN" : "APPROVAL"}
          </span>
        </div>
      </article>
    `);
  }

  c.innerHTML = cards.length
    ? cards.join("")
    : `<div class="glassmorphic rounded-xl p-6 text-center text-white/70">No upcoming sessions in the selected range.</div>`;
}

/* ---------- View: Tournaments ---------- */
async function renderTournamentsView(coach) {
  state.view = "tournaments";
  renderViewSpecificFilters("tournaments");

  const c = viewContainer();
  if (!c) return;

  const data = loadData();
  const tournaments = (data.tournaments || []).filter(
    (t) => !coach.sport || t.sport === coach.sport
  );

  const selStatus = state.filters.tournaments.status || "ALL";

  const sections = tournaments
    .map((t) => {
      const regs = listRegistrationsForTournament(t.id) || [];
      const pending = regs.filter((r) => r.regStatus === "PENDING").length;
      const confirmed = regs.filter((r) => r.regStatus === "CONFIRMED").length;

      // Apply status filter: show only tournaments with at least one of selected status
      if (selStatus === "PENDING" && pending === 0) return "";
      if (selStatus === "CONFIRMED" && confirmed === 0) return "";

      const dateRange = formatRange(t.startDateTime, t.endDateTime);
      return `
      <article class="glassmorphic rounded-xl p-4">
        <header class="flex items-center justify-between gap-3">
          <div>
            <h3 class="text-base font-bold text-white">${escapeHtml(
              t.name || "Tournament"
            )}</h3>
            <p class="text-xs text-white/70">${escapeHtml(
              dateRange || fmtDate(t.date || "")
            )} • ${escapeHtml(t.venue || "-")} • ${escapeHtml(
        t.sport || "-"
      )}</p>
          </div>
          <div class="flex gap-2">
            <span class="inline-block glassmorphic text-yellow-300 text-xs font-semibold px-2 py-0.5 rounded-full">⏳ ${pending} Pending</span>
            <span class="inline-block glassmorphic text-green-300 text-xs font-semibold px-2 py-0.5 rounded-full">✅ ${confirmed} Confirmed</span>
          </div>
        </header>
      </article>
    `;
    })
    .filter(Boolean);

  c.innerHTML = sections.length
    ? sections.join("")
    : `<div class="glassmorphic rounded-xl p-6 text-center text-white/70">No tournaments match the filters.</div>`;
}

function fmtDate(d) {
  try {
    const date = new Date(d);
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "-";
  }
}
function fmtTimeRange(start, end) {
  const opt = { hour: "2-digit", minute: "2-digit" };
  const s = start ? new Date(`1970-01-01T${start}:00`) : null;
  const e = end ? new Date(`1970-01-01T${end}:00`) : null;
  const st = s ? s.toLocaleTimeString(undefined, opt) : "";
  const et = e ? e.toLocaleTimeString(undefined, opt) : "";
  return end ? `${st} – ${et}` : st;
}
function formatRange(startISO, endISO) {
  if (!startISO) return "";
  const s = new Date(startISO);
  const e = endISO ? new Date(endISO) : null;
  const dOpt = { year: "numeric", month: "short", day: "numeric" };
  const tOpt = { hour: "2-digit", minute: "2-digit" };
  const sDate = s.toLocaleDateString(undefined, dOpt);
  const sTime = s.toLocaleTimeString(undefined, tOpt);
  if (!e) return `${sDate} ${sTime}`;
  const eDate = e.toLocaleDateString(undefined, dOpt);
  const eTime = e.toLocaleTimeString(undefined, tOpt);
  if (s.toDateString() === e.toDateString()) {
    return `${sDate} ${sTime}–${eTime}`;
  }
  return `${sDate} ${sTime} → ${eDate} ${eTime}`;
}
