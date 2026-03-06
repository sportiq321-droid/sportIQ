// /public/js/govtour.js
import API from "./api.js";
import { requireLogin } from "./core/auth.js";
import { getCurrentUser } from "./modules/users.js";

document.addEventListener("DOMContentLoaded", init);

async function init() {
  requireLogin();
  const me = getCurrentUser();
  if (!me || me.role !== "Government Official") {
    window.location.href = "dashboard.html";
    return;
  }

  // Elements
  const stateEl = byId("fState");
  const districtEl = byId("fDistrict");
  const statusEl = byId("fStatus");
  const searchEl = byId("fSearch");
  const btnReset = byId("btnReset");
  const btnExport = byId("btnExport");

  const listEl = byId("list");
  const emptyEl = byId("empty");
  const pagerEl = byId("pager");
  const pageInfo = byId("pageInfo");
  const prevPage = byId("prevPage");
  const nextPage = byId("nextPage");
  const resultMeta = byId("resultMeta");

  // Modal Elements
  const regModal = byId("regModal");
  const regClose = byId("regClose");
  const regCloseBottom = byId("regCloseBottom");
  const regTitle = byId("regTitle");
  const regTbody = byId("regTbody");
  const regCounts = byId("regCounts");

  // ========================================================
  // ✨ SNIPPET START: Smart Back Handler
  // ========================================================
  const backBtn = byId("backBtn");
  if (backBtn) {
    backBtn.addEventListener(
      "click",
      (e) => {
        e.preventDefault();
        e.stopImmediatePropagation(); // Override inline script

        const last = getLastSection();
        // 1. Go to last-clicked nav section if it exists and isn't this page
        if (last && last.href && !/govtour\.html/i.test(last.href)) {
          window.location.href = last.href;
          return;
        }

        // 2. Fallback to referrer if it's safe
        try {
          const ref = document.referrer || "";
          const sameOrigin = ref && new URL(ref, window.location.href).origin === window.location.origin;
          const notSelf = ref && !/govtour\.html/i.test(ref);
          if (sameOrigin && notSelf) {
            window.history.back();
            return;
          }
        } catch {}

        // 3. Final fallback to dashboard
        window.location.href = "dashboard.html";
      },
      true // capture to run before any bubble-phase listeners
    );
  }
  // ========================================================
  // ✨ SNIPPET END
  // ========================================================

  // Build State/District options
  populateStates(stateEl);
  hydrateFiltersFromURL();

  // Listeners (non-reload)
  stateEl.addEventListener("change", () => {
    const st = stateEl.value || "";
    populateDistricts(districtEl, st);
    updateQuery({ state: st, district: "" });
  });

  districtEl.addEventListener("change", () => {
    updateQuery({ district: districtEl.value || "" });
  });

  statusEl.addEventListener("change", () => {
    updateQuery({ status: statusEl.value || "", page: 1 });
  });

  searchEl.addEventListener(
    "input",
    debounce(() => {
      updateQuery({ search: searchEl.value.trim(), page: 1 });
    }, 300)
  );

  btnReset.addEventListener("click", () => {
    updateQuery({ state: "", district: "", status: "", search: "", page: 1 });
  });

  btnExport.addEventListener("click", async () => {
    const { state, district } = readFiltersFromURL();
    try {
      await API.exportGovData("tournaments", { state, district });
    } catch (e) {
      console.error("EXPORT_TOURNAMENTS_ERROR", e);
      alert("Export failed. Please try again.");
    }
  });

  prevPage.addEventListener("click", () => {
    const { page } = readFiltersFromURL();
    updateQuery({ page: Math.max(1, page - 1) });
  });
  nextPage.addEventListener("click", () => {
    const { page } = readFiltersFromURL();
    updateQuery({ page: page + 1 });
  });

  // Modal listeners
  [regClose, regCloseBottom].forEach((btn) =>
    btn?.addEventListener("click", closeRegModal)
  );
  regModal?.querySelector(".modal-overlay")?.addEventListener("click", closeRegModal);
  regModal?.querySelectorAll("[data-regstatus]").forEach((chip) => {
    chip.addEventListener("click", () => {
      regModal.querySelectorAll("[data-regstatus]").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      const status = chip.getAttribute("data-regstatus") || "ALL";
      const tId = regModal.dataset.tournamentId;
      if (tId) loadRegistrations(tId, status);
    });
  });

  // Back/forward support
  window.addEventListener("popstate", () => {
    hydrateFiltersFromURL();
    renderList();
  });

  // First render
  await renderList();

  // Helpers
  function hydrateFiltersFromURL() {
    const { state, district, status, search } = readFiltersFromURL();
    if (stateEl) stateEl.value = state;
    populateDistricts(districtEl, state);
    if (districtEl) districtEl.value = district;
    if (statusEl) statusEl.value = status;
    if (searchEl) searchEl.value = search;
  }

  async function renderList() {
    try {
      const { state, district, status, search, page, limit } = readFiltersFromURL();
      if (resultMeta) resultMeta.textContent = "Loading…";
      listEl.innerHTML = "";
      emptyEl.classList.add("hidden");

      const resp = await API.getGovTournaments({ state, district, status, search, page, limit });
      const items = resp?.data?.items || [];
      const pagination = resp?.data?.pagination || { page: 1, limit, total: 0, totalPages: 1 };

      if (items.length === 0) {
        emptyEl.classList.remove("hidden");
        if (resultMeta) resultMeta.textContent = "No results";
      } else {
        listEl.innerHTML = items.map(cardHTML).join("");
        listEl.querySelectorAll("[data-act='regs']").forEach((btn) => {
          btn.addEventListener("click", () => {
            openRegModal(btn.getAttribute("data-id"), btn.getAttribute("data-name"));
          });
        });
        const start = (pagination.page - 1) * pagination.limit + 1;
        const end = start + items.length - 1;
        if (resultMeta) resultMeta.textContent = `Showing ${start}–${end} of ${pagination.total}`;
      }

      if (pagination.totalPages > 1) {
        pagerEl.classList.remove("hidden");
        pageInfo.textContent = `Page ${pagination.page} of ${pagination.totalPages}`;
        prevPage.disabled = pagination.page <= 1;
        nextPage.disabled = pagination.page >= pagination.totalPages;
      } else {
        pagerEl.classList.add("hidden");
      }
    } catch (e) {
      console.error("GOVTOUR_LIST_ERROR", e);
      emptyEl.classList.remove("hidden");
      listEl.innerHTML = "";
      if (resultMeta) resultMeta.textContent = "Failed to load";
    }
  }

  function cardHTML(t) {
    const regs = t?._count?.registrations ?? 0;
    const statusBadge =
      t.status === "PUBLISHED" ? "bg-green-500/20 text-green-400" : "bg-gray-500/20 text-gray-400";
    return `
      <article class="glassmorphic rounded-xl p-4 border border-white/10 hover:border-white/20 transition">
        <header class="flex items-start justify-between gap-3">
          <div>
            <h3 class="text-white font-semibold">${escapeHTML(t.name || "Tournament")}</h3>
            <p class="text-white/60 text-sm">${escapeHTML(t.sport || "-")} • ${escapeHTML(t.state || "-")}, ${escapeHTML(t.district || "-")}</p>
            <p class="text-white/50 text-xs mt-1">${formatRange(t.startDateTime, t.endDateTime)}</p>
          </div>
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusBadge}">${escapeHTML(t.status || "-")}</span>
        </header>
        <div class="mt-3 flex items-center justify-between">
          <p class="text-white/80 text-sm"><strong>${regs}</strong> registrations</p>
          <div class="flex gap-2">
            <button data-act="regs" data-id="${t.id}" data-name="${escapeHTML(t.name || "Registrations")}" class="btn-admin btn-admin-secondary">View registrations</button>
          </div>
        </div>
      </article>
    `;
  }

  async function openRegModal(tournamentId, title) {
    if (!tournamentId) return;
    regModal.dataset.tournamentId = tournamentId;
    regTitle.textContent = title;
    regModal.querySelectorAll("[data-regstatus]").forEach((c) => c.classList.remove("active"));
    regModal.querySelector("[data-regstatus='ALL']")?.classList.add("active");
    regModal.classList.remove("hidden");
    await loadRegistrations(tournamentId, "ALL");
  }

  async function loadRegistrations(tournamentId, status = "ALL") {
    try {
      regTbody.innerHTML = `<tr><td colspan="5" class="text-subtle p-4">Loading…</td></tr>`;
      const resp = await API.getGovTournamentRegistrations(tournamentId, status === "ALL" ? "" : status);
      const data = resp?.data || {};
      const items = data.items || [];
      const stats = data.stats || { total: 0, pending: 0, confirmed: 0, rejected: 0 };
      if (regCounts) regCounts.textContent = `${stats.total} total • ${stats.pending} pending • ${stats.confirmed} confirmed • ${stats.rejected} rejected`;
      regTbody.innerHTML = items.length ? items.map(regRowHTML).join("") : `<tr><td colspan="5" class="text-subtle p-4">No registrations found</td></tr>`;
    } catch (e) {
      console.error("GOVTOUR_REGS_ERROR", e);
      regTbody.innerHTML = `<tr><td colspan="5" class="text-subtle p-4">Failed to load registrations</td></tr>`;
    }
  }

  function regRowHTML(r) {
    const player = r.player || {};
    const status = String(r.regStatus || "").toUpperCase();
    const badge = status === "CONFIRMED" ? "badge-confirmed" : status === "PENDING" ? "badge-pending" : "badge-rejected";
    return `
      <tr>
        <td class="table-cell-primary">${escapeHTML(player.name || player.username || "Player")}</td>
        <td class="table-cell-secondary">${escapeHTML(player.email || "-")}</td>
        <td class="table-cell-secondary hide-mobile">${escapeHTML(player.sport || "-")}</td>
        <td><span class="${badge} inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold">${status}</span></td>
        <td class="table-cell-secondary hide-mobile">${formatDateTime(r.registeredAt)}</td>
      </tr>
    `;
  }

  function closeRegModal() {
    regModal.classList.add("hidden");
    regModal.dataset.tournamentId = "";
    regTbody.innerHTML = "";
    regCounts.textContent = "";
  }

  function readFiltersFromURL() {
    const u = new window.URL(window.location.href);
    const state = u.searchParams.get("state") || "";
    const district = u.searchParams.get("district") || "";
    const status = u.searchParams.get("status") || "";
    const search = u.searchParams.get("search") || "";
    const page = Math.max(1, parseInt(u.searchParams.get("page") || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(u.searchParams.get("limit") || "12", 10)));
    return { state, district, status, search, page, limit };
  }

  function updateQuery(patch = {}) {
    const u = new window.URL(window.location.href);
    Object.entries(patch).forEach(([k, v]) => {
      if (v === "" || v === null || v === undefined) u.searchParams.delete(k);
      else u.searchParams.set(k, String(v));
    });
    window.history.pushState(null, "", u.toString());
    hydrateFiltersFromURL();
    renderList();
  }

  function populateStates(sel) {
    if (!sel) return;
    const ds = window.statesAndDistricts || {};
    const states = Object.keys(ds).sort((a, b) => a.localeCompare(b));
    sel.innerHTML = `<option value="">All India</option>` + states.map((s) => `<option value="${escapeHTML(s)}">${escapeHTML(s)}</option>`).join("");
  }

  function populateDistricts(sel, state) {
    if (!sel) return;
    const ds = window.statesAndDistricts || {};
    const dists = Array.isArray(ds[state]) ? ds[state] : [];
    sel.innerHTML = `<option value="">All Districts</option>` + dists.map((d) => `<option value="${escapeHTML(d)}">${escapeHTML(d)}</option>`).join("");
    sel.disabled = !(state && dists.length);
    sel.title = sel.disabled ? "Select a state first" : "";
  }
}

/* ---------- Utils ---------- */
function byId(id) {
  return document.getElementById(id);
}
function debounce(fn, ms = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(null, args), ms);
  };
}
function escapeHTML(str = "") {
  return String(str).replace(
    /[&<>"']/g,
    (m) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[m])
  );
}
function formatDateTime(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString();
}
function formatRange(startISO, endISO) {
  if (!startISO) return "-";
  const s = new Date(startISO);
  const e = endISO ? new Date(endISO) : null;
  const dateOpts = { year: "numeric", month: "short", day: "numeric" };
  const timeOpts = { hour: "2-digit", minute: "2-digit" };
  const sDate = s.toLocaleDateString(undefined, dateOpts);
  const sTime = s.toLocaleTimeString(undefined, timeOpts);
  if (!e) return `${sDate} ${sTime}`;
  const eDate = e.toLocaleDateString(undefined, dateOpts);
  const eTime = e.toLocaleTimeString(undefined, timeOpts);
  if (s.toDateString() === e.toDateString())
    return `${sDate} ${sTime}–${eTime}`;
  return `${sDate} ${sTime} → ${eDate} ${eTime}`;
}
// ========================================================
// ✨ SNIPPET START: Helper for Smart Back
// ========================================================
function getLastSection() {
  try {
    const data = sessionStorage.getItem("lastSection");
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}
// ========================================================
// ✨ SNIPPET END
// ========================================================