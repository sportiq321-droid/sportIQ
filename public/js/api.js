// js/api.js
// Small API client for backend auth/onboarding/profile/assessments.
// All requests send/receive JSON and include the httpOnly cookie automatically.

const API_BASE = "";

const API = {
  // ==================== AUTH ====================
  register: (body) => req("/api/auth/register", "POST", body),
  login: (body) => req("/api/auth/login", "POST", body),
  logout: () => req("/api/auth/logout", "POST"),

  // ==================== USER (ME) ====================
  me: () => req("/api/me", "GET"),
  updateMe: (body) => req("/api/me", "PATCH", body),

  // ==================== ACHIEVEMENTS ====================
  // Achievements (if/when backend endpoints exist)
  getMyAchievements: () => req("/api/achievements/my", "GET"),
  addAchievement: (body) => req("/api/achievements", "POST", body),
  updateAchievement: (id, body) => req(`/api/achievements/${id}`, "PUT", body),
  deleteAchievement: (id) => req(`/api/achievements/${id}`, "DELETE"),

  // Coach specific (achievements)
  getPendingAchievements: (status = "PENDING") =>
    req(`/api/achievements/pending?status=${status}`, "GET"),
  verifyAchievement: (id, body) =>
    req(`/api/achievements/${id}/verify`, "PATCH", body),

  // ==================== ONBOARDING ====================
  // Onboarding certificate
  getCertificate: () => req("/api/onboarding/certificate", "GET"),
  uploadCertificate: (formData) =>
    reqForm("/api/onboarding/certificate", "POST", formData),

  // ==================== SCHEDULES ====================
  // Schedules (Coach)
  createSchedule: (body) => req("/api/schedules", "POST", body),
  getCoachSchedules: (coachId) => req(`/api/schedules/coach/${coachId}`, "GET"),
  getScheduleRequests: (scheduleId, status = "PENDING") =>
    req(`/api/schedules/${scheduleId}/requests?status=${status}`, "GET"),
  updateRequestStatus: (requestId, status) =>
    req(`/api/requests/${requestId}`, "PATCH", { status }),

  // Player Schedules
  getAvailableSchedules: () => req("/api/schedules/available", "GET"),
  joinSchedule: (scheduleId) =>
    req(`/api/schedules/${scheduleId}/join`, "POST"),
  leaveSchedule: (scheduleId) =>
    req(`/api/schedules/${scheduleId}/leave`, "DELETE"),
  getMyScheduleRequests: () => req("/api/schedules/my-requests", "GET"),

  // ==================== ASSESSMENTS (MVP) ====================
  // (New) Upload video for high-accuracy BACKEND analysis
  analyzeVideoBackend: (formData) =>
    reqForm("/api/assessments/analyze-backend", "POST", formData),

  // Create an assessment record
  createAssessment: (body) => req("/api/assessments", "POST", body),

  // Upload assessment video proof (multipart FormData with fields: file, assessmentId)
  uploadAssessmentMedia: (formData) =>
    reqForm("/api/assessments/upload", "POST", formData),

  // List my assessments
  getMyAssessments: () => req("/api/assessments/my", "GET"),

  // Coach: list pending assessments for review
  getPendingAssessments: () => req("/api/assessments/pending", "GET"),

  // Coach: review an assessment (approve/reject)
  reviewAssessment: (id, body) =>
    req(`/api/assessments/${id}/review`, "PATCH", body),

  // ==================== REPORTS ====================
  getCoachReport: () => req("/api/reports/coach", "GET"),

  // ==================== PUBLIC TOURNAMENTS (PLAYER) ====================
  // Player: list published tournaments
  getPublishedTournaments: ({
    state = "",
    district = "",
    search = "",
    page = 1,
    limit = 10,
  } = {}) => {
    const params = new URLSearchParams();
    if (state) params.append("state", state);
    if (district) params.append("district", district);
    if (search) params.append("search", search);
    params.append("page", String(page));
    params.append("limit", String(limit));
    const query = params.toString();
    return req(`/api/tournaments/published?${query}`, "GET");
  },

  // Player: get tournament details
  getTournamentDetails: (id) => req(`/api/tournaments/${id}`, "GET"),

  // ==================== ✨ TOURNAMENT MANAGEMENT ✨ ====================

  // Admin: Create tournament
  createTournament: (body) => req("/api/admin/tournaments", "POST", body),

  // Admin: List tournaments with filters
  getAdminTournaments: ({
    status = "",
    search = "",
    page = 1,
    limit = 10,
  } = {}) => {
    const params = new URLSearchParams();
    if (status) params.append("status", status);
    if (search) params.append("search", search);
    params.append("page", String(page));
    params.append("limit", String(limit));
    const query = params.toString();
    return req(`/api/admin/tournaments?${query}`, "GET");
  },

  // Admin: Get tournament statistics
  getAdminTournamentStats: () => req("/api/admin/tournaments/stats", "GET"),

  // Admin: Update tournament
  updateTournament: (id, body) =>
    req(`/api/admin/tournaments/${id}`, "PUT", body),

  // Admin: Delete tournament
  deleteTournament: (id) => req(`/api/admin/tournaments/${id}`, "DELETE"),

  // ✨ UPDATED: Admin: Publish tournament (dedicated endpoint)
  publishTournament: (id) =>
    req(`/api/admin/tournaments/${id}/publish`, "PATCH"),

  // ✨ UPDATED: Admin: Unpublish tournament (dedicated endpoint)
  unpublishTournament: (id) =>
    req(`/api/admin/tournaments/${id}/unpublish`, "PATCH"),

  // ==================== END TOURNAMENT MANAGEMENT ====================

  // ==================== ✨ TOURNAMENT REGISTRATIONS ✨ ====================

  // Player: Register for a tournament
  registerForTournament: (tournamentId) =>
    req(`/api/tournaments/${tournamentId}/register`, "POST"),

  // Admin: List registrations for a tournament (with filters)
  getAdminRegistrations: (tournamentId, status = "", search = "") => {
    const params = new URLSearchParams();
    if (status) params.append("status", status);
    if (search) params.append("search", search);
    const query = params.toString();
    return req(
      `/api/admin/tournaments/${tournamentId}/registrations${
        query ? `?${query}` : ""
      }`,
      "GET"
    );
  },

  // Admin: Get registration statistics for a tournament
  getRegistrationStats: (tournamentId) =>
    req(`/api/admin/tournaments/${tournamentId}/registrations/stats`, "GET"),

  // Admin: Approve/Reject a single registration
  updateRegistration: (registrationId, status, reason = "") =>
    req(`/api/admin/registrations/${registrationId}`, "PATCH", {
      status,
      reason,
    }),

  // Admin: Bulk approve/reject registrations (max 10)
  bulkUpdateRegistrations: (registrationIds, status, reason = "") => {
    if (!Array.isArray(registrationIds) || registrationIds.length === 0) {
      throw new Error("registrationIds must be a non-empty array");
    }
    if (registrationIds.length > 10) {
      throw new Error("Cannot process more than 10 registrations at once");
    }
    return req("/api/admin/registrations/bulk", "PATCH", {
      registrationIds,
      status,
      reason,
    });
  },

  // ==================== END TOURNAMENT REGISTRATIONS ====================
  // ==================== END TOURNAMENT REGISTRATIONS ====================

  // ==================== ✨ GOVERNMENT OFFICIALS API ✨ ====================

  /**
   * Government Officials Dashboard API
   * National-level monitoring with regional filtering
   * Read-only access with CSV export capabilities
   */

  // 1. Dashboard Stats (KPIs with regional filtering)
  getGovStats: ({ state = "", district = "" } = {}) => {
    const params = new URLSearchParams();
    if (state) params.append("state", state);
    if (district) params.append("district", district);
    const query = params.toString();
    return req(`/api/gov/stats${query ? `?${query}` : ""}`, "GET");
  },

  // 2. Tournament Monitoring (with regional filters)
  getGovTournaments: ({
    state = "",
    district = "",
    status = "",
    search = "",
    page = 1,
    limit = 20,
  } = {}) => {
    const params = new URLSearchParams();
    if (state) params.append("state", state);
    if (district) params.append("district", district);
    if (status) params.append("status", status);
    if (search) params.append("search", search);
    params.append("page", String(page));
    params.append("limit", String(limit));
    const query = params.toString();
    return req(`/api/gov/tournaments?${query}`, "GET");
  },

  // 3. Tournament Registration Details (Gov view)
  getGovTournamentRegistrations: (tournamentId, status = "") => {
    const params = new URLSearchParams();
    if (status) params.append("status", status);
    const query = params.toString();
    return req(
      `/api/gov/tournaments/${tournamentId}/registrations${
        query ? `?${query}` : ""
      }`,
      "GET"
    );
  },

  // 4. Player Directory (with filters)
  getGovPlayers: ({ sport = "", search = "", page = 1, limit = 20 } = {}) => {
    const params = new URLSearchParams();
    if (sport) params.append("sport", sport);
    if (search) params.append("search", search);
    params.append("page", String(page));
    params.append("limit", String(limit));
    const query = params.toString();
    return req(`/api/gov/players?${query}`, "GET");
  },

  // 5. Coach Directory (with filters)
  getGovCoaches: ({ sport = "", search = "", page = 1, limit = 20 } = {}) => {
    const params = new URLSearchParams();
    if (sport) params.append("sport", sport);
    if (search) params.append("search", search);
    params.append("page", String(page));
    params.append("limit", String(limit));
    const query = params.toString();
    return req(`/api/gov/coaches?${query}`, "GET");
  },

  // 6. Achievement Analytics (with sport filter)
  getGovAchievementStats: ({ sport = "" } = {}) => {
    const params = new URLSearchParams();
    if (sport) params.append("sport", sport);
    const query = params.toString();
    return req(`/api/gov/achievements/stats${query ? `?${query}` : ""}`, "GET");
  },

  // 7. Data Export (CSV download)
  exportGovData: async (type, { state = "", district = "" } = {}) => {
    const params = new URLSearchParams();
    if (state) params.append("state", state);
    if (district) params.append("district", district);
    const query = params.toString();

    const url = `/api/gov/export/${type}${query ? `?${query}` : ""}`;

    try {
      const response = await fetch(`${API_BASE}${url}`, {
        method: "GET",
        credentials: "same-origin",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Export failed");
      }

      // Get filename from Content-Disposition header
      const contentDisposition = response.headers.get("Content-Disposition");
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
      const filename = filenameMatch ? filenameMatch[1] : `export_${type}.csv`;

      // Download the CSV
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);

      return { success: true, filename };
    } catch (error) {
      console.error("EXPORT_ERROR", error);
      throw error;
    }
  },

  // ==================== ✨ END GOVERNMENT OFFICIALS API ✨ ====================

  // ==================== FIXTURES & MATCHES ====================

  generateFixtures: async (tournamentId) => {
    const res = await fetch(`${API_BASE}/api/admin/tournaments/${tournamentId}/generate-fixtures`, {
      method: 'POST',
      credentials: 'include'
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to generate fixtures');
    }
    return res.json();
  },

  getFixtures: async (tournamentId) => {
    const res = await fetch(`${API_BASE}/api/admin/tournaments/${tournamentId}/fixtures`, {
      credentials: 'include'
    });
    if (!res.ok) throw new Error('Failed to fetch fixtures');
    return res.json();
  },

  updateMatchScore: async (matchId, data) => {
    const res = await fetch(`${API_BASE}/api/admin/matches/${matchId}/score`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to update score');
    }
    return res.json();
  },

  addPlayerMatchStats: async (matchId, data) => {
    const res = await fetch(`${API_BASE}/api/admin/matches/${matchId}/player-stats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to add player stats');
    }
    return res.json();
  },

  getTournamentLeaderboard: async (tournamentId) => {
    const res = await fetch(`${API_BASE}/api/tournaments/${tournamentId}/leaderboard`, {
      credentials: 'include'
    });
    if (!res.ok) throw new Error('Failed to fetch tournament leaderboard');
    return res.json();
  },

  recalculateImpactScore: async (playerId) => {
    const res = await fetch(`${API_BASE}/api/player/${playerId}/impact-score`, {
      method: 'POST',
      credentials: 'include'
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to calculate impact score');
    }
    return res.json();
  },

  getGlobalLeaderboard: async (params = {}) => {
    const query = new URLSearchParams();
    if (params.sport) query.set('sport', params.sport);
    if (params.district) query.set('district', params.district);
    if (params.state) query.set('state', params.state);
    if (params.limit) query.set('limit', params.limit);
    if (params.offset) query.set('offset', params.offset);
    
    const res = await fetch(`${API_BASE}/api/leaderboard?${query.toString()}`, {
      credentials: 'include'
    });
    if (!res.ok) throw new Error('Failed to fetch leaderboard');
    return res.json();
  },
};

export default API;
// ==================== INTERNALS ====================

async function req(url, method = "GET", body) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin", // send/receive cookie "sid"
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${API_BASE}${url}`, opts);

  // Handle 204 No Content for DELETE
  if (res.status === 204) {
    return null;
  }

  const data = await safeJson(res);

  if (!res.ok) {
    const msg = data?.error || res.statusText || "Request failed";
    const error = new Error(msg);
    error.status = res.status; // Attach the HTTP status code
    throw error;
  }
  return data;
}

async function reqForm(url, method = "POST", formData) {
  const opts = {
    method,
    body: formData,
    credentials: "same-origin", // send/receive cookie "sid"
    // Note: do NOT set Content-Type; the browser sets the correct multipart boundary
  };

  const res = await fetch(`${API_BASE}${url}`, opts);
  const data = await safeJson(res);

  if (!res.ok) {
    const msg = data?.error || res.statusText || "Request failed";
    const error = new Error(msg);
    error.status = res.status; // Attach the HTTP status code
    throw error;
  }
  return data;
}

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}
