// public/js/modules/tournaments-admin.js
import { loadData, saveData } from "../core/storage.js";
import API from "../api.js"; // ✨ NEW: Import API client

const nowIso = () => new Date().toISOString();

// ==================== ✨ UPDATED: Create Tournament via Backend ====================
export async function createTournament(payload) {
  try {
    // ✨ NEW: Call backend API
    const response = await API.createTournament(payload);

    if (!response?.success) {
      throw new Error(response?.error || "Failed to create tournament");
    }

    const tournament = response.data;

    // ✨ NEW: Also save to localStorage for compatibility
    const data = loadData();
    if (!Array.isArray(data.tournaments)) data.tournaments = [];

    // Check if already exists in localStorage
    const existingIdx = data.tournaments.findIndex(
      (t) => t.id === tournament.id
    );
    if (existingIdx === -1) {
      data.tournaments.push(tournament);
      saveData(data);
    }

    return tournament;
  } catch (error) {
    console.error("Failed to create tournament via backend:", error);

    // ✨ FALLBACK: Use localStorage if backend fails
    console.warn("Falling back to localStorage");
    return createTournamentLocalStorage(payload);
  }
}

// ✨ NEW: Fallback localStorage creation (for offline support)
function createTournamentLocalStorage(payload) {
  const data = loadData();
  if (!Array.isArray(data.tournaments)) data.tournaments = [];

  const status =
    payload.status === "PUBLISHED" || payload.status === "DRAFT"
      ? payload.status
      : "DRAFT";

  const t = {
    id: "t" + Date.now(),
    ...payload,
    status,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    ...(status === "PUBLISHED" && {
      publishedAt: nowIso(),
      publishedBy: payload.createdBy,
    }),
  };

  data.tournaments.push(t);
  saveData(data);
  return t;
}

// ==================== ✨ UPDATED: Publish Tournament ====================
export async function publishTournament(id, adminId = "") {
  try {
    // ✨ NEW: Call dedicated backend endpoint
    const response = await API.publishTournament(id);

    if (!response?.success) {
      throw new Error(response?.error || "Failed to publish tournament");
    }

    // Update localStorage with backend data
    const data = loadData();
    const idx = (data.tournaments || []).findIndex((t) => t.id === id);
    if (idx !== -1) {
      // Use backend response data if available
      if (response.data) {
        data.tournaments[idx] = response.data;
      } else {
        data.tournaments[idx] = {
          ...data.tournaments[idx],
          status: "PUBLISHED",
          publishedAt: nowIso(),
          publishedBy: adminId,
          updatedAt: nowIso(),
        };
      }
      saveData(data);
    }

    return true;
  } catch (error) {
    console.error("Failed to publish tournament:", error);

    // Fallback to localStorage only
    const data = loadData();
    const idx = (data.tournaments || []).findIndex((t) => t.id === id);
    if (idx === -1) return false;

    data.tournaments[idx] = {
      ...data.tournaments[idx],
      status: "PUBLISHED",
      publishedAt: nowIso(),
      publishedBy: adminId,
      updatedAt: nowIso(),
    };

    saveData(data);
    return true;
  }
}

// ==================== ✨ UPDATED: Unpublish Tournament ====================
export async function unpublishTournament(id, adminId = "") {
  try {
    // ✨ NEW: Call dedicated backend endpoint
    const response = await API.unpublishTournament(id);

    if (!response?.success) {
      throw new Error(response?.error || "Failed to unpublish tournament");
    }

    // Update localStorage with backend data
    const data = loadData();
    const idx = (data.tournaments || []).findIndex((t) => t.id === id);
    if (idx !== -1) {
      // Use backend response data if available
      if (response.data) {
        data.tournaments[idx] = response.data;
      } else {
        data.tournaments[idx] = {
          ...data.tournaments[idx],
          status: "DRAFT",
          updatedAt: nowIso(),
        };
      }
      saveData(data);
    }

    // Show warning if there are registrations
    if (response.warning) {
      console.warn(response.warning);
    }

    return true;
  } catch (error) {
    console.error("Failed to unpublish tournament:", error);

    // Fallback to localStorage only
    const data = loadData();
    const idx = (data.tournaments || []).findIndex((t) => t.id === id);
    if (idx === -1) return false;

    data.tournaments[idx] = {
      ...data.tournaments[idx],
      status: "DRAFT",
      updatedAt: nowIso(),
    };

    saveData(data);
    return true;
  }
}

// ==================== ✨ UPDATED: Delete Tournament ====================
export async function deleteTournament(id) {
  try {
    // ✨ Backend returns 204 No Content on success → req() resolves to null
    const resp = await API.deleteTournament(id);

    // If backend returns an explicit failure shape, handle it (defensive).
    // Note: resp will be null on success.
    if (resp && resp.success === false) {
      return {
        success: false,
        error: resp.error || "Failed to delete tournament",
      };
    }

    // Remove from localStorage cache for compatibility
    const data = loadData();
    const idx = (data.tournaments || []).findIndex((t) => t.id === id);
    if (idx !== -1) {
      data.tournaments.splice(idx, 1);
      saveData(data);
    }

    return { success: true };
  } catch (error) {
    console.error("Failed to delete tournament:", error);
    return {
      success: false,
      error: error.message || "Failed to delete tournament",
    };
  }
}

// ==================== ⚠️ DEPRECATED: Legacy functions (kept for compatibility) ====================

export function updateTournamentStatus(id, status) {
  console.warn(
    "⚠️ updateTournamentStatus is deprecated. Use publishTournament/unpublishTournament instead."
  );
  const data = loadData();
  const idx = (data.tournaments || []).findIndex((t) => t.id === id);
  if (idx === -1) return false;
  data.tournaments[idx].status = status;
  data.tournaments[idx].updatedAt = nowIso();
  saveData(data);
  return true;
}

export function updateTournament(id, updates) {
  console.warn("⚠️ updateTournament is deprecated. Use backend API instead.");
  const data = loadData();
  const idx = (data.tournaments || []).findIndex((t) => t.id === id);
  if (idx === -1) return null;

  const hasRegistrations = (data.users || []).some(
    (u) =>
      Array.isArray(u.registeredTournaments) &&
      u.registeredTournaments.some(
        (r) => r.id === id && r.regStatus !== "REJECTED"
      )
  );

  if (hasRegistrations) {
    const safeFields = [
      "description",
      "venue",
      "startDateTime",
      "endDateTime",
      "media",
    ];
    const safeUpdates = {};

    safeFields.forEach((field) => {
      if (updates[field] !== undefined) {
        safeUpdates[field] = updates[field];
      }
    });

    data.tournaments[idx] = {
      ...data.tournaments[idx],
      ...safeUpdates,
      updatedAt: nowIso(),
    };

    saveData(data);
    return {
      tournament: data.tournaments[idx],
      warning: "Limited fields updated due to existing registrations",
    };
  } else {
    data.tournaments[idx] = {
      ...data.tournaments[idx],
      ...updates,
      updatedAt: nowIso(),
    };

    saveData(data);
    return { tournament: data.tournaments[idx] };
  }
}

// ==================== ✨ UPDATED: Get Admin Tournament Stats ====================
export async function getTournamentStats(adminId) {
  try {
    // ✨ NEW: Try backend first
    const response = await API.getAdminTournamentStats();
    if (response?.success) {
      return response.data;
    }
  } catch (error) {
    console.warn(
      "Failed to fetch stats from backend, using localStorage:",
      error
    );
  }

  // Fallback to localStorage
  const data = loadData();
  const adminTournaments = (data.tournaments || []).filter(
    (t) => t.createdBy === adminId
  );

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const stats = {
    totalTournaments: adminTournaments.length,
    publishedTournaments: adminTournaments.filter(
      (t) => t.status === "PUBLISHED"
    ).length,
    draftTournaments: adminTournaments.filter((t) => t.status === "DRAFT")
      .length,
    totalRegistrations: 0,
    pendingApprovals: 0,
    activeTournaments: 0,
  };

  adminTournaments.forEach((t) => {
    const tournamentRegs = (data.users || []).flatMap((u) =>
      Array.isArray(u.registeredTournaments)
        ? u.registeredTournaments.filter((r) => r.id === t.id)
        : []
    );

    stats.totalRegistrations += tournamentRegs.length;

    if (t.needsApproval) {
      stats.pendingApprovals += tournamentRegs.filter(
        (r) => r.regStatus === "PENDING"
      ).length;
    }

    if (
      t.status === "PUBLISHED" &&
      t.startDateTime &&
      t.endDateTime &&
      new Date(t.startDateTime) <= now &&
      new Date(t.endDateTime) >= today
    ) {
      stats.activeTournaments++;
    }
  });

  return stats;
}

// ==================== ✨ UPDATED: List Admin Tournaments ====================
export async function listAdminTournaments({
  adminId,
  status,
  search,
  page = 1,
  limit = 10,
}) {
  try {
    // ✨ NEW: Try backend first
    const response = await API.getAdminTournaments({
      status,
      search,
      page,
      limit,
    });
    if (response?.success) {
      return response.data;
    }
  } catch (error) {
    console.warn(
      "Failed to fetch tournaments from backend, using localStorage:",
      error
    );
  }

  // Fallback to localStorage
  const data = loadData();
  let tournaments = (data.tournaments || []).filter(
    (t) => t.createdBy === adminId
  );

  if (status === "DRAFT" || status === "PUBLISHED") {
    tournaments = tournaments.filter((t) => t.status === status);
  }

  if (search) {
    const searchLower = search.toLowerCase();
    tournaments = tournaments.filter(
      (t) =>
        (t.name || "").toLowerCase().includes(searchLower) ||
        (t.sport || "").toLowerCase().includes(searchLower) ||
        (t.venue || "").toLowerCase().includes(searchLower)
    );
  }

  tournaments.sort((a, b) =>
    (b.createdAt || "").localeCompare(a.createdAt || "")
  );

  const total = tournaments.length;
  const start = (page - 1) * limit;
  const items = tournaments.slice(start, start + limit);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

// ==================== HELPER: Format date range ====================
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
