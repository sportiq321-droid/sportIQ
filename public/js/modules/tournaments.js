// js/modules/tournaments.js
import { getCurrentUser, updateCurrentUser } from "./users.js";
import { loadData, saveData } from "../core/storage.js";
import API from "../api.js"; // ✨ NEW: Import API client

/* Ensure user array exists */
function ensureArray() {
  const u = getCurrentUser();
  if (!u) throw new Error("No user");
  const list = Array.isArray(u.registeredTournaments)
    ? u.registeredTournaments
    : [];
  if (!Array.isArray(u.registeredTournaments))
    updateCurrentUser({ registeredTournaments: list });
  return list;
}

/* Format date range for admin tournaments */
function formatRange(startISO, endISO) {
  if (!startISO) return "";
  const s = new Date(startISO);
  const e = endISO ? new Date(endISO) : null;

  const dateOpts = { year: "numeric", month: "short", day: "numeric" };
  const timeOpts = { hour: "2-digit", minute: "2-digit" };
  const sDate = s.toLocaleDateString(undefined, dateOpts);
  const sTime = s.toLocaleTimeString(undefined, timeOpts);

  if (!e) return `${sDate} ${sTime}`;
  const eDate = e.toLocaleDateString(undefined, dateOpts);
  const eTime = e.toLocaleTimeString(undefined, timeOpts);
  if (s.toDateString() === e.toDateString()) {
    return `${sDate} ${sTime}–${eTime}`;
  }
  return `${sDate} ${sTime} → ${eDate} ${eTime}`;
}

/* 🔄 Helper: merge backend tournaments into localStorage cache (idempotent) */
function mergePublishedIntoLocal(items = []) {
  const data = loadData();
  if (!Array.isArray(data.tournaments)) data.tournaments = [];

  items.forEach((t) => {
    const idx = data.tournaments.findIndex((x) => x.id === t.id);
    const merged = {
      id: t.id,
      name: t.name,
      sport: t.sport,
      venue: t.venue,
      state: t.state,
      district: t.district,
      description: t.description || "",
      startDateTime: t.startDateTime,
      endDateTime: t.endDateTime,
      needsApproval: !!t.needsApproval,
      status: t.status || "PUBLISHED",
      // Keep any existing media/fields if present locally
      ...(idx !== -1 ? data.tournaments[idx] : {}),
    };
    if (idx === -1) {
      data.tournaments.push(merged);
    } else {
      data.tournaments[idx] = merged;
    }
  });

  saveData(data);
}

/* Player: get published tournaments by location (Admin-created)
   ✨ UPDATED: backend-first (fire-and-forget), localStorage fallback
   - Keeps this function synchronous for existing callers.
   - Starts an async fetch to refresh local cache in background. */
export function getPublishedTournamentsByLocation(state, district) {
  try {
    if (
      API &&
      typeof API.getPublishedTournaments === "function" &&
      state &&
      district
    ) {
      // Fire-and-forget: update local cache in background
      API.getPublishedTournaments({ state, district, page: 1, limit: 50 })
        .then((resp) => {
          const items = resp?.data?.items || [];
          if (Array.isArray(items) && items.length) {
            mergePublishedIntoLocal(items);
          }
        })
        .catch(() => {
          // Silently ignore; fallback below will still return something
        });
    }
  } catch {
    // ignore background fetch errors; fallback below
  }

  // Immediate synchronous return from localStorage cache
  const data = loadData();
  const list = (data.tournaments || [])
    .filter(
      (t) =>
        t.status === "PUBLISHED" && t.state === state && t.district === district
    )
    .sort((a, b) =>
      (a.startDateTime || "").localeCompare(b.startDateTime || "")
    )
    .map((t) => ({
      id: t.id,
      name: t.name,
      sport: t.sport,
      venue: t.venue,
      state: t.state,
      district: t.district,
      description: t.description || "",
      date: formatRange(t.startDateTime, t.endDateTime),
      startDateTime: t.startDateTime,
      endDateTime: t.endDateTime,
      needsApproval: !!t.needsApproval,
      _source: "admin",
    }));

  return list;
}

export function listMyTournaments() {
  const list = ensureArray();
  return list
    .slice()
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
}

/* Treat PENDING/CONFIRMED as already registered */
export function isRegistered(tournamentId) {
  const list = ensureArray();
  return list.some((t) => t.id === tournamentId && t.regStatus !== "REJECTED");
}

/* ✨ UPDATED: Register with backend API, respecting needsApproval */
export async function registerForTournament(t) {
  if (!t?.id) throw new Error("Tournament must have an id");

  try {
    // ✨ NEW: Call backend API
    const response = await API.registerForTournament(t.id);

    if (!response?.success) {
      throw new Error(response?.message || "Registration failed");
    }

    // ✨ NEW: Extract registration data from backend response
    const registration = response.data;
    const desiredStatus = registration.regStatus || "PENDING";

    // ✨ NEW: Update localStorage for compatibility with existing UI
    const list = ensureArray();
    const idx = list.findIndex((x) => x.id === t.id);

    const entry = {
      id: t.id,
      name: t.name,
      date: t.date,
      venue: t.venue,
      sport: t.sport,
      state: t.state,
      district: t.district,
      description: t.description || "",
      registeredAt: registration.registeredAt || new Date().toISOString(),
      reminder: false,
      regStatus: desiredStatus,
    };

    if (idx !== -1) {
      // Update existing (e.g., re-registration after rejection)
      const copy = list.slice();
      copy[idx] = entry;
      updateCurrentUser({ registeredTournaments: copy });
    } else {
      // Add new registration
      const updated = [...list, entry];
      updateCurrentUser({ registeredTournaments: updated });
    }

    return {
      success: true,
      status: desiredStatus,
      message: response.message,
    };
  } catch (error) {
    console.error("Registration error:", error);

    // ✨ NEW: Check if already registered error
    if (error.message?.includes("Already registered")) {
      return {
        success: false,
        alreadyRegistered: true,
        message: "You are already registered for this tournament",
      };
    }

    // ✨ NEW: Fallback to localStorage for offline support (optional)
    console.warn("Backend registration failed, falling back to localStorage");
    return registerForTournamentLocalStorage(t);
  }
}

/* ✨ NEW: Fallback localStorage registration (for offline/migration) */
function registerForTournamentLocalStorage(t) {
  const list = ensureArray();
  const idx = list.findIndex((x) => x.id === t.id);
  const needsApproval = !!t.needsApproval;
  const desiredStatus = needsApproval ? "PENDING" : "CONFIRMED";

  if (idx !== -1) {
    // If previously rejected, allow re-apply
    if (list[idx].regStatus === "REJECTED") {
      const updated = {
        ...list[idx],
        regStatus: desiredStatus,
        registeredAt: new Date().toISOString(),
      };
      const copy = list.slice();
      copy[idx] = updated;
      updateCurrentUser({ registeredTournaments: copy });
      return {
        success: true,
        status: desiredStatus,
        message: "Re-registered successfully (localStorage)",
      };
    }
    return {
      success: false,
      alreadyRegistered: true,
      message: "Already registered (localStorage)",
    };
  }

  const entry = {
    id: t.id,
    name: t.name,
    date: t.date,
    venue: t.venue,
    sport: t.sport,
    state: t.state,
    district: t.district,
    description: t.description || "",
    registeredAt: new Date().toISOString(),
    reminder: false,
    regStatus: desiredStatus,
  };

  const updated = [...list, entry];
  updateCurrentUser({ registeredTournaments: updated });
  return {
    success: true,
    status: desiredStatus,
    message: "Registered successfully (localStorage)",
  };
}

/* Toggle reminder unchanged */
export function toggleReminder(tournamentId) {
  const u = getCurrentUser();
  if (!u) return;
  const list = Array.isArray(u.registeredTournaments)
    ? u.registeredTournaments
    : [];
  const updated = list.map((t) =>
    t.id === tournamentId ? { ...t, reminder: !t.reminder } : t
  );
  updateCurrentUser({ registeredTournaments: updated });
  return updated.find((t) => t.id === tournamentId)?.reminder || false;
}

/* ⚠️ DEPRECATED: Admin helper (use API.updateRegistration instead)
 * Kept for backward compatibility during migration
 */
export function setRegistrationStatus(
  userId,
  tournamentId,
  status,
  reason = "",
  deciderId = ""
) {
  console.warn(
    "⚠️ setRegistrationStatus is deprecated. Use API.updateRegistration instead."
  );

  const allowed = new Set(["PENDING", "CONFIRMED", "REJECTED"]);
  const s = String(status || "").toUpperCase();
  if (!allowed.has(s)) throw new Error("Invalid status");

  const data = loadData();
  const uIdx = (data.users || []).findIndex((u) => u.id === userId);
  if (uIdx === -1) return false;

  const list = Array.isArray(data.users[uIdx].registeredTournaments)
    ? data.users[uIdx].registeredTournaments
    : [];
  const rIdx = list.findIndex((r) => r.id === tournamentId);
  if (rIdx === -1) return false;

  const updated = {
    ...list[rIdx],
    regStatus: s,
    regDecisionReason: s === "REJECTED" ? reason : "",
    regDecisionAt: new Date().toISOString(),
    regDecisionBy: deciderId || "",
  };

  data.users[uIdx].registeredTournaments = [
    ...list.slice(0, rIdx),
    updated,
    ...list.slice(rIdx + 1),
  ];
  saveData(data);
  return true;
}

/* ⚠️ DEPRECATED: Admin helper (use API.getAdminRegistrations instead)
 * Kept for backward compatibility during migration
 */
export function listRegistrationsForTournament(tournamentId) {
  console.warn(
    "⚠️ listRegistrationsForTournament is deprecated. Use API.getAdminRegistrations instead."
  );

  const data = loadData();
  const users = data.users || [];
  const players = users.filter((u) => u.role === "Player");
  const out = [];

  players.forEach((u) => {
    const regs = Array.isArray(u.registeredTournaments)
      ? u.registeredTournaments
      : [];
    const r = regs.find((x) => x.id === tournamentId);
    if (!r) return;

    const normStatus = (r.regStatus || "CONFIRMED").toUpperCase();

    out.push({
      userId: u.id,
      name: u.name || u.username || "Player",
      email: u.email || "",
      mobile: u.mobile || "",
      sport: u.sport || "",
      avatar: u.profilePic || "",
      registeredAt: r.registeredAt || "",
      regStatus: normStatus,
      regDecisionAt: r.regDecisionAt || "",
      regDecisionBy: r.regDecisionBy || "",
      regDecisionReason: r.regDecisionReason || "",
    });
  });

  return out;
}
