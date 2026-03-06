import { requireLogin } from "./core/auth.js";
import { getCurrentUser } from "./modules/users.js";
import { loadData } from "./core/storage.js";
import {
  publishTournament,
  unpublishTournament,
  deleteTournament,
} from "./modules/tournaments-admin.js";
import API from "./api.js"; // ✨ NEW: Import API client

document.addEventListener("DOMContentLoaded", () => {
  requireLogin();
  const admin = getCurrentUser();
  if (!admin || admin.role !== "Admin") {
    window.location.href = "dashboard.html";
    return;
  }

  const DEFAULT_AVATAR =
    "https://cdn-icons-png.flaticon.com/512/149/149071.png";

  // Elements
  const tSearch = document.getElementById("tSearch");
  const showAll = document.getElementById("showAll");
  const picker = document.getElementById("tournamentPicker");
  const noTournaments = document.getElementById("noTournaments");

  const registrantsList = document.getElementById("registrantsList");
  const noRegistrations = document.getElementById("noRegistrations");

  // Support both legacy ".chip" and new ".filter-chip"
  const chips = Array.from(document.querySelectorAll(".chip, .filter-chip"));
  const regSearch = document.getElementById("regSearch");

  const countAll = document.getElementById("countAll");
  const countPending = document.getElementById("countPending");
  const countConfirmed = document.getElementById("countConfirmed");
  const countRejected = document.getElementById("countRejected");

  // Reject modal
  const rejectModal = document.getElementById("rejectModal");
  const rejectClose = document.getElementById("rejectClose");
  const rejectCancel = document.getElementById("rejectCancel");
  const rejectConfirm = document.getElementById("rejectConfirm");
  const rejectReason = document.getElementById("rejectReason");

  // Profile modal
  const profileModal = document.getElementById("profileModal");
  const profileClose = document.getElementById("profileClose");
  const peekAvatar = document.getElementById("peekAvatar");
  const peekName = document.getElementById("peekName");
  const peekSport = document.getElementById("peekSport");
  const peekEmail = document.getElementById("peekEmail");
  const peekMobile = document.getElementById("peekMobile");

  // Bulk actions
  const bulkApprove = document.getElementById("bulkApprove");
  const bulkReject = document.getElementById("bulkReject");
  const exportCsv = document.getElementById("exportCsv");

  // State
  let selectedTournamentId = null;
  let allAdminTournaments = [];
  let registrants = [];
  let statusFilter = "ALL";
  let searchText = "";
  let pendingReject = { ids: [], mode: "single" }; // ✨ CHANGED: Now stores registrationIds
  let isLoading = false; // ✨ NEW: Loading state

  // ✨ NEW: Helper to show toast notifications
  function showToast(message, type = "info") {
    // Simple console notification (can be replaced with actual toast UI)
    console.log(`[${type.toUpperCase()}] ${message}`);
    // TODO: Implement actual toast notification UI if needed
  }

  // ✨ NEW: Prefer backend _count if available; fallback to localStorage
  function hasRegistrationsBackendAware(t) {
    if (t && t._count && typeof t._count.registrations === "number") {
      return t._count.registrations > 0;
    }
    return hasRegistrationsLocal(t?.id);
  }

  // Helper: does a tournament have (non-rejected) registrations? (local fallback)
  function hasRegistrationsLocal(tournamentId) {
    const data = loadData();
    return (data.users || []).some(
      (u) =>
        Array.isArray(u.registeredTournaments) &&
        u.registeredTournaments.some(
          (r) => r.id === tournamentId && r.regStatus !== "REJECTED"
        )
    );
  }

  // ✨ UPDATED: Load admin tournaments from backend (fallback to localStorage)
  async function loadTournaments() {
    try {
      const statusFilterParam = showAll.checked ? "" : "PUBLISHED";
      const search = (tSearch.value || "").trim();

      // Fetch from backend
      const resp = await API.getAdminTournaments({
        status: statusFilterParam,
        search,
        page: 1,
        limit: 50,
      });
      const items = resp?.data?.items || [];
      allAdminTournaments = items;
      renderTournamentPicker(allAdminTournaments);
    } catch (err) {
      console.error("LOAD_TOURNAMENTS_ERROR", err);
      // Fallback to localStorage
      const data = loadData();
      const mine = (data.tournaments || []).filter(
        (t) => t.createdBy === admin.id
      );
      const onlyPublished = mine.filter((t) => t.status === "PUBLISHED");
      allAdminTournaments = showAll.checked ? mine : onlyPublished;

      const q = tSearch.value.trim().toLowerCase();
      const filtered = allAdminTournaments
        .filter((t) => (t.name || "").toLowerCase().includes(q))
        .sort((a, b) =>
          (a.startDateTime || "").localeCompare(b.startDateTime || "")
        );

      renderTournamentPicker(filtered);
    }
  }

  function renderTournamentPicker(list) {
    picker.innerHTML = "";
    if (!list.length) {
      noTournaments.classList.remove("hidden");
      return;
    }
    noTournaments.classList.add("hidden");

    list.forEach((t) => {
      const item = document.createElement("div");
      item.className = "t-item";
      if (t.id === selectedTournamentId) item.classList.add("selected");

      const statusBadge = badgeForStatus(t.status);
      const dateRange = formatRange(t.startDateTime, t.endDateTime);
      const hasRegs = hasRegistrationsBackendAware(t);

      // Buttons depend on status
      const canPublish = t.status === "DRAFT" || t.status === "APPROVED";
      const isPublished = t.status === "PUBLISHED";

      const publishBtn = canPublish
        ? `<button class="btn-tiny edit" data-act="publish" data-id="${t.id}">Publish</button>`
        : "";
      const unpublishBtn = isPublished
        ? `<button class="btn-tiny danger" data-act="unpublish" data-id="${t.id}">Unpublish</button>`
        : "";

      const fixturesBtn = isPublished
        ? `<a href="/fixtures.html?id=${t.id}" class="btn-tiny" style="text-decoration:none;">📋 Fixtures</a>`
        : "";

      const editBtn = `<button class="btn-tiny" data-act="edit" data-id="${t.id}">Edit</button>`;
      const delDisabledAttr = hasRegs
        ? "disabled title='Cannot delete with registrations'"
        : "";
      const deleteBtn = `<button class="btn-tiny danger" data-act="delete" data-id="${t.id}" ${delDisabledAttr}>Delete</button>`;

      const actions = [publishBtn, unpublishBtn, fixturesBtn, editBtn, deleteBtn]
        .filter(Boolean)
        .join(" ");

      item.innerHTML = `
        <div class="row1">
          <strong>${escapeHTML(t.name)}</strong>
          <span class="badge ${statusBadge.cls}">${statusBadge.label}</span>
        </div>
        <div class="row2">
          ${escapeHTML(t.sport || "-")} • ${escapeHTML(
        t.state || "-"
      )}, ${escapeHTML(t.district || "-")} • ${escapeHTML(dateRange)}
          ${
            t.needsApproval
              ? ' • <span class="badge pending">Needs approval</span>'
              : ""
          }
        </div>
        <div class="row3">
          ${actions}
        </div>
      `;

      // Selecting the tournament
      item.addEventListener("click", () => {
        selectedTournamentId = t.id;
        Array.from(picker.children).forEach((el) =>
          el.classList.remove("selected")
        );
        item.classList.add("selected");
        loadRegistrations();
      });

      // Publish/Unpublish/Edit/Delete actions (await backend ops)
      item.querySelectorAll("button[data-act]").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
          e.stopPropagation();
          const act = btn.getAttribute("data-act");
          const id = btn.getAttribute("data-id");
          if (!id) return;

          if (act === "publish") {
            await publishTournament(id, admin.id);
            const wasSelected = selectedTournamentId === id;
            await loadTournaments();
            if (wasSelected && !showAll.checked) {
              const stillVisible = allAdminTournaments.some(
                (tt) => tt.id === id
              );
              if (!stillVisible) {
                selectedTournamentId = null;
                registrants = [];
                renderRegistrants();
              }
            }
            return;
          }

          if (act === "unpublish") {
            await unpublishTournament(id, admin.id);
            const wasSelected = selectedTournamentId === id;
            await loadTournaments();
            if (wasSelected) {
              const stillVisible = allAdminTournaments.some(
                (tt) => tt.id === id
              );
              if (!stillVisible) {
                selectedTournamentId = null;
                registrants = [];
                renderRegistrants();
              }
            }
            return;
          }

          if (act === "edit") {
            window.location.href = `admintournament.html?edit=${encodeURIComponent(
              id
            )}`;
            return;
          }

          if (act === "delete") {
            // Backend-aware guard
            const tObj = allAdminTournaments.find((tt) => tt.id === id);
            if (hasRegistrationsBackendAware(tObj)) {
              alert(
                "Cannot delete tournament with existing registrations.\nPlease process refunds and remove registrations first."
              );
              return;
            }
            const ok = confirm(
              "Are you sure you want to delete this tournament? This action cannot be undone."
            );
            if (!ok) return;
            const res = await deleteTournament(id); // ✨ await
            if (!res?.success) {
              alert(res?.error || "Failed to delete tournament.");
              return;
            }
            if (selectedTournamentId === id) {
              selectedTournamentId = null;
              registrants = [];
              renderRegistrants();
            }
            await loadTournaments();
            return;
          }
        });
      });

      picker.appendChild(item);
    });
  }

  // ✨ UPDATED: Now async and uses backend API
  async function loadRegistrations() {
    if (!selectedTournamentId) {
      registrants = [];
      renderRegistrants();
      return;
    }

    if (isLoading) return; // Prevent double-loading
    isLoading = true;

    try {
      // Show loading state (optional)
      registrantsList.innerHTML =
        '<p class="text-center text-white/60">Loading registrations...</p>';

      // ✨ NEW: Fetch from backend with current filters
      const response = await API.getAdminRegistrations(
        selectedTournamentId,
        statusFilter === "ALL" ? "" : statusFilter,
        searchText
      );

      // ✨ NEW: Map backend data to UI format
      registrants = (response?.data?.items || []).map((reg) => ({
        registrationId: reg.id, // ✨ NEW: Store registration ID for API calls
        userId: reg.player.id,
        name: reg.player.name || reg.player.username || "Player",
        email: reg.player.email || "",
        mobile: reg.player.mobile || "",
        sport: reg.player.sport || "",
        avatar: reg.player.profilePic || DEFAULT_AVATAR,
        registeredAt: reg.registeredAt || "",
        regStatus: reg.regStatus || "PENDING",
        regDecisionAt: reg.regDecisionAt || "",
        regDecisionBy: reg.regDecisionBy || "",
        regDecisionReason: reg.regDecisionReason || "",
      }));

      renderRegistrants();
    } catch (error) {
      console.error("Failed to load registrations:", error);
      showToast(error.message || "Failed to load registrations", "error");
      registrants = [];
      renderRegistrants();
    } finally {
      isLoading = false;
    }
  }

  function filteredRegistrants() {
    // ✨ REMOVED: Backend now handles filtering, but keep for client-side search
    let list = registrants.slice();

    // Client-side search is now redundant since backend handles it,
    // but keeping for immediate UI responsiveness
    if (searchText) {
      list = list.filter(
        (r) =>
          (r.name || "").toLowerCase().includes(searchText) ||
          (r.email || "").toLowerCase().includes(searchText)
      );
    }

    // Sort by status priority
    const order = { PENDING: 0, CONFIRMED: 1, REJECTED: 2 };
    list.sort((a, b) => {
      const sa = order[normalizeStatus(a.regStatus)] ?? 9;
      const sb = order[normalizeStatus(b.regStatus)] ?? 9;
      if (sa !== sb) return sa - sb;
      return (b.registeredAt || "").localeCompare(a.registeredAt || "");
    });
    return list;
  }

  function renderCounts() {
    const all = registrants.length;
    const p = registrants.filter(
      (r) => normalizeStatus(r.regStatus) === "PENDING"
    ).length;
    const c = registrants.filter(
      (r) => normalizeStatus(r.regStatus) === "CONFIRMED"
    ).length;
    const r = registrants.filter(
      (r) => normalizeStatus(r.regStatus) === "REJECTED"
    ).length;
    countAll.textContent = `All: ${all}`;
    countPending.textContent = `Pending: ${p}`;
    countConfirmed.textContent = `Confirmed: ${c}`;
    countRejected.textContent = `Rejected: ${r}`;
  }

  function renderRegistrants() {
    renderCounts();
    const list = filteredRegistrants();
    registrantsList.innerHTML = "";
    if (!list.length) {
      noRegistrations.classList.remove("hidden");
      return;
    }
    noRegistrations.classList.add("hidden");

    list.forEach((r) => {
      const photo = r.avatar || DEFAULT_AVATAR;
      const meta = statusMeta(normalizeStatus(r.regStatus));
      const card = document.createElement("div");
      card.className = "reg-card";
      card.innerHTML = `
        <div class="reg-main">
          <h4>${escapeHTML(r.name)}</h4>
          <p><strong>Email:</strong> ${escapeHTML(r.email || "-")}</p>
          <p><strong>Mobile:</strong> ${escapeHTML(
            r.mobile || "-"
          )} • <strong>Sport:</strong> ${escapeHTML(r.sport || "-")}</p>
          <p class="muted"><strong>Registered:</strong> ${formatDate(
            r.registeredAt
          )}</p>
          <span class="${meta.cls}">${meta.label}</span>
        </div>
        <div class="reg-photo"><img src="${photo}" alt="avatar"/></div>
        <div class="reg-actions-row">
          <button class="btn-tiny" data-act="profile" data-id="${
            r.userId
          }">View profile</button>
          <span style="flex:1"></span>
          <button class="btn-tiny edit" data-act="approve" data-regid="${
            r.registrationId
          }">Approve</button>
          <button class="btn-tiny danger" data-act="reject" data-regid="${
            r.registrationId
          }">Reject</button>
        </div>
      `;
      registrantsList.appendChild(card);
    });

    registrantsList.querySelectorAll("button[data-act]").forEach((btn) => {
      btn.addEventListener("click", onRowAction);
    });
  }

  // ✨ UPDATED: Now async and uses backend API
  async function onRowAction(e) {
    const act = e.currentTarget.getAttribute("data-act");
    const registrationId = e.currentTarget.getAttribute("data-regid");
    const userId = e.currentTarget.getAttribute("data-id");

    if (!selectedTournamentId) return;

    if (act === "profile") {
      const r = registrants.find((x) => x.userId === userId);
      if (!r) return;
      peekAvatar.src = r.avatar || DEFAULT_AVATAR;
      peekName.textContent = r.name || "Player";
      peekSport.textContent = r.sport || "-";
      peekEmail.textContent = r.email || "-";
      peekMobile.textContent = r.mobile || "-";
      openModal(profileModal);
      return;
    }

    if (act === "approve") {
      if (isLoading) return;
      isLoading = true;

      try {
        // ✨ NEW: Call backend API
        await API.updateRegistration(registrationId, "CONFIRMED");
        showToast("Registration approved successfully", "success");
        await loadRegistrations(); // Reload list
      } catch (error) {
        console.error("Failed to approve registration:", error);
        showToast(error.message || "Failed to approve registration", "error");
      } finally {
        isLoading = false;
      }
      return;
    }

    if (act === "reject") {
      // ✨ CHANGED: Store registrationId instead of userId
      pendingReject = { ids: [registrationId], mode: "single" };
      rejectReason.value = "";
      openModal(rejectModal);
      return;
    }
  }

  // ✨ UPDATED: Bulk approve now async
  bulkApprove.addEventListener("click", async () => {
    if (!selectedTournamentId || isLoading) return;

    const pending = filteredRegistrants().filter(
      (r) => normalizeStatus(r.regStatus) === "PENDING"
    );

    if (!pending.length) {
      showToast("No pending registrations to approve", "info");
      return;
    }

    const registrationIds = pending.map((r) => r.registrationId);

    // ✨ NEW: Enforce max 10 limit
    if (registrationIds.length > 10) {
      const ok = confirm(
        `You can only approve up to 10 registrations at once.\n\nApprove the first 10 of ${registrationIds.length} pending registrations?`
      );
      if (!ok) return;
      registrationIds.splice(10); // Keep only first 10
    }

    isLoading = true;

    try {
      // ✨ NEW: Call backend bulk API
      await API.bulkUpdateRegistrations(registrationIds, "CONFIRMED");
      showToast(
        `${registrationIds.length} registration(s) approved successfully`,
        "success"
      );
      await loadRegistrations(); // Reload list
    } catch (error) {
      console.error("Failed to bulk approve:", error);
      showToast(
        error.message || "Failed to bulk approve registrations",
        "error"
      );
    } finally {
      isLoading = false;
    }
  });

  // ✨ UPDATED: Bulk reject modal trigger
  bulkReject.addEventListener("click", () => {
    if (!selectedTournamentId || isLoading) return;

    const pending = filteredRegistrants().filter(
      (r) => normalizeStatus(r.regStatus) === "PENDING"
    );

    if (!pending.length) {
      showToast("No pending registrations to reject", "info");
      return;
    }

    const registrationIds = pending.map((r) => r.registrationId);

    // ✨ NEW: Enforce max 10 limit
    if (registrationIds.length > 10) {
      alert(
        `You can only reject up to 10 registrations at once.\n\nShowing reject form for the first 10 of ${registrationIds.length} pending registrations.`
      );
      registrationIds.splice(10); // Keep only first 10
    }

    pendingReject = { ids: registrationIds, mode: "bulk" };
    rejectReason.value = "";
    openModal(rejectModal);
  });

  // ✨ UPDATED: Reject modal confirmation now async
  async function doReject() {
    const reason = rejectReason.value.trim();
    if (!reason) {
      alert("Please provide a reason for rejection");
      return;
    }

    if (isLoading) return;
    isLoading = true;

    try {
      if (pendingReject.mode === "single") {
        // ✨ NEW: Single rejection via API
        await API.updateRegistration(pendingReject.ids[0], "REJECTED", reason);
        showToast("Registration rejected", "success");
      } else {
        // ✨ NEW: Bulk rejection via API
        await API.bulkUpdateRegistrations(
          pendingReject.ids,
          "REJECTED",
          reason
        );
        showToast(
          `${pendingReject.ids.length} registration(s) rejected`,
          "success"
        );
      }

      closeModal(rejectModal);
      await loadRegistrations(); // Reload list
    } catch (error) {
      console.error("Failed to reject registration(s):", error);
      showToast(error.message || "Failed to reject registration(s)", "error");
    } finally {
      isLoading = false;
    }
  }

  rejectConfirm.addEventListener("click", doReject);
  rejectClose.addEventListener("click", () => closeModal(rejectModal));
  rejectCancel.addEventListener("click", () => closeModal(rejectModal));
  rejectModal.addEventListener("click", (e) => {
    if (e.target === rejectModal) closeModal(rejectModal);
  });

  // CSV export (unchanged)
  exportCsv.addEventListener("click", () => {
    const list = registrants.slice();
    const rows = [
      [
        "tournamentId",
        "registrationId",
        "playerId",
        "playerName",
        "email",
        "mobile",
        "sport",
        "registeredAt",
        "regStatus",
        "regDecisionAt",
        "regDecisionBy",
        "regDecisionReason",
      ],
    ];
    list.forEach((r) => {
      rows.push([
        selectedTournamentId,
        r.registrationId || "",
        r.userId,
        r.name || "",
        r.email || "",
        r.mobile || "",
        r.sport || "",
        r.registeredAt || "",
        normalizeStatus(r.regStatus),
        r.regDecisionAt || "",
        r.regDecisionBy || "",
        r.regDecisionReason || "",
      ]);
    });
    const csv = rows.map((arr) => arr.map(csvEscape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "registrations.csv";
    a.click();
  });

  // ✨ UPDATED: Status filter chips now reload from backend
  chips.forEach((chip) =>
    chip.addEventListener("click", () => {
      chips.forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      statusFilter = chip.getAttribute("data-status") || "ALL";
      loadRegistrations(); // ✨ CHANGED: Reload from backend with new filter
    })
  );

  // ✨ UPDATED: Search now reloads from backend
  regSearch.addEventListener("input", () => {
    searchText = (regSearch.value || "").trim().toLowerCase();
    loadRegistrations(); // ✨ CHANGED: Reload from backend with search query
  });

  // Picker search/toggle
  tSearch.addEventListener("input", loadTournaments);
  showAll.addEventListener("change", loadTournaments);

  // Modal helpers
  function openModal(m) {
    m.classList.remove("hidden");
  }
  function closeModal(m) {
    m.classList.add("hidden");
  }

  // Utils (unchanged)
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
  function formatDate(iso) {
    if (!iso) return "-";
    const d = new Date(iso);
    return d.toLocaleString();
  }
  function normalizeStatus(s) {
    const v = String(s || "CONFIRMED").toUpperCase();
    return v === "PENDING" || v === "REJECTED" || v === "CONFIRMED"
      ? v
      : "CONFIRMED";
  }
  function statusMeta(s) {
    switch (s) {
      case "PENDING":
        return { label: "Pending", cls: "badge pending" };
      case "REJECTED":
        return { label: "Rejected", cls: "badge rejected" };
      case "CONFIRMED":
      default:
        return { label: "Confirmed", cls: "badge approved" };
    }
  }
  function badgeForStatus(st) {
    const v = String(st || "").toUpperCase();
    switch (v) {
      case "DRAFT":
        return { label: "Draft", cls: "pending" };
      case "PUBLISHED":
      case "APPROVED":
        return { label: "Published", cls: "approved" };
      case "SUBMITTED":
        return { label: "Submitted", cls: "pending" };
      case "REJECTED":
        return { label: "Rejected", cls: "rejected" };
      default:
        return { label: st || "-", cls: "" };
    }
  }
  function csvEscape(val) {
    const s = String(val ?? "");
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
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

  // Init
  loadTournaments();
  renderRegistrants(); // Initial empty render
});
