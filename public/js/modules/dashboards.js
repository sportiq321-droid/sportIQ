import API from "../api.js";
import {
  getTournamentStats,
  listAdminTournaments,
} from "./tournaments-admin.js";
import { getCurrentUser } from "./users.js";
// Helper: lazy-load districts.js and wait for geo:ready event
async function ensureGeoLoaded() {
  if (typeof window === "undefined") return;
  if (
    window.statesAndDistricts &&
    typeof window.statesAndDistricts === "object"
  )
    return;

  if (document.getElementById("districts-js-loader")) {
    await new Promise((resolve) => {
      const done = () => resolve(true);
      document.addEventListener("geo:ready", done, { once: true });
      setTimeout(done, 1200);
    });
    return;
  }

  await new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "js/districts.js";
    s.id = "districts-js-loader";
    s.onload = () => resolve(true);
    document.head.appendChild(s);

    const onReady = () => {
      document.removeEventListener("geo:ready", onReady);
      resolve(true);
    };
    document.addEventListener("geo:ready", onReady, { once: true });

    // final fallback
    setTimeout(() => resolve(true), 1500);
  });
}

// Tiny global helper to change region filters without reloading the page
if (!window.__govFilterChange) {
  window.__govFilterChange = async function (type, value) {
    try {
      // Update URL without reload
      const u = new window.URL(window.location.href);
      if (type === "state") {
        if (value) u.searchParams.set("state", value);
        else u.searchParams.delete("state");
        // Reset district when state changes
        u.searchParams.delete("district");
      } else if (type === "district") {
        if (value) u.searchParams.set("district", value);
        else u.searchParams.delete("district");
      }
      window.history.pushState(null, "", u.toString());

      // Soft refresh the dashboard content only
      const main = document.querySelector("main");
      if (main) {
        // subtle loading feedback
        main.classList.add("opacity-70", "pointer-events-none");
      }

      // Re-render current gov dashboard view
      const html = await renderGovDashboard();
      if (main) {
        main.innerHTML = html;
        main.classList.remove("opacity-70", "pointer-events-none");
      }
    } catch (e) {
      console.error("GOV_FILTER_CHANGE_ERROR", e);
    }
  };
}

// ==================== PLAYER DASHBOARD ====================
export async function renderPlayerDashboard() {
  const user = getCurrentUser();
  
  // Safe fallbacks for data
  const name = user?.name || user?.username || "Player";
  const sport = (user?.sport || "Not selected").toUpperCase();
  const impactScore = user?.impactScore || 0;

  // Fetch assessments for the bottom section
  const assessments = await API.getMyAssessments().catch(() => null);
  const items = assessments?.data?.items || assessments?.items || [];
  let lastResultText = "";
  if (items.length > 0) {
    lastResultText = "Latest: " + formatLastResult(items[0]);
  }

  return `
    <!-- Top Welcome & Impact Score Banner -->
    <div class="glassmorphic rounded-2xl p-6 shadow-lg border border-white/10 text-white mb-6 relative overflow-hidden">
      <!-- Decorative background glow -->
      <div class="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-blue-500 rounded-full blur-3xl opacity-20 pointer-events-none"></div>
      
      <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative z-10">
        <div>
          <h1 class="text-2xl md:text-3xl font-bold tracking-tight">
            Welcome back, <span class="text-blue-400">${escapeHTML(name)}</span>! 👋
          </h1>
          <p class="text-white/70 text-sm mt-1 tracking-wider font-medium">
            ROLE: PLAYER &nbsp;•&nbsp; SPORT: ${escapeHTML(sport)}
          </p>
        </div>
        
        <div class="text-right border-l border-white/10 pl-6">
          <p class="text-4xl font-black text-blue-400 leading-none">${impactScore}</p>
          <p class="text-white/50 text-xs font-bold tracking-widest mt-1 uppercase">Impact Score</p>
        </div>
      </div>
    </div>

    <!-- Assessments Section -->
    <div class="flex items-center gap-2 mb-4">
      <span class="text-yellow-500">🏆</span>
      <h2 class="text-white text-lg font-bold tracking-wider">ASSESSMENTS</h2>
    </div>
    
    <section class="glassmorphic rounded-2xl p-5 shadow-lg border border-white/10 text-white transition hover:border-white/20">
      <div class="flex items-start gap-4">
        <div class="w-12 h-12 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
          <span class="material-symbols-outlined">fitness_center</span>
        </div>
        <div class="flex-1">
          <h3 class="text-xl font-semibold">Start Assessment</h3>
          <p class="text-white/60 text-sm mt-1">Sit-ups • 800m/1.6km Run • Broad Jump</p>
          <p class="text-green-400 text-sm mt-2 font-medium ${!lastResultText ? "hidden" : ""}">${lastResultText}</p>
          <div class="mt-5 flex gap-3">
            <a href="assess.html" class="px-6 py-2.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-500 transition shadow-lg shadow-blue-500/30">Start</a>
            <a href="my-assessments.html" class="px-6 py-2.5 rounded-lg bg-white/5 text-white hover:bg-white/10 border border-white/10 transition">History</a>
          </div>
        </div>
      </div>
    </section>
  `;
}

// ==================== COACH DASHBOARD ====================
export async function renderCoachDashboard() {
  const user = getCurrentUser();
  
  // Safe fallbacks for data
  const name = user?.name || user?.username || "Coach";
  const sport = (user?.sport || "Not selected").toUpperCase();

  // Safely fetch available KPI data
  let assessmentsCount = 0;
  try {
    if (typeof API.getPendingAssessments === "function") {
      const pendingAssessments = await API.getPendingAssessments().catch(() => null);
      assessmentsCount = pendingAssessments?.items?.length || 0;
    }
  } catch (err) {
    console.error("Failed to load assessments count", err);
  }

  let achievementsCount = 0;
  try {
    if (typeof API.getPendingAchievements === "function") {
      const pendingAchievements = await API.getPendingAchievements().catch(() => null);
      achievementsCount = pendingAchievements?.items?.length || 0;
    }
  } catch (err) {
    console.error("Failed to load achievements count", err);
  }

  let activeSchedulesCount = 0;
  try {
    if (typeof API.getCoachReport === "function") {
      const report = await API.getCoachReport().catch(() => null);
      activeSchedulesCount = report?.upcomingSessions7d || 0;
    } else if (typeof API.getCoachSchedules === "function" && user?.id) {
      const schedules = await API.getCoachSchedules(user.id).catch(() => null);
      activeSchedulesCount = schedules?.items?.length || 0;
    }
  } catch (err) {
    console.error("Failed to load active schedules count", err);
  }

  const bannerHtml = await getVerificationBannerHtml(user, "Upload your verification document to unlock trusted coach status.");

  return `
    <!-- Top Welcome Banner -->
    <div class="glassmorphic rounded-2xl p-6 shadow-lg border border-white/10 text-white mb-6 relative overflow-hidden">
      <!-- Decorative background glow -->
      <div class="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-green-500 rounded-full blur-3xl opacity-20 pointer-events-none"></div>
      
      <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative z-10">
        <div>
          <h1 class="text-2xl md:text-3xl font-bold tracking-tight">
            Welcome back, <span class="text-green-400">${escapeHTML(name)}</span>! 👋
          </h1>
          <p class="text-white/70 text-sm mt-1 tracking-wider font-medium">
            ROLE: COACH &nbsp;•&nbsp; SPORT: ${escapeHTML(sport)}
          </p>
        </div>
      </div>
    </div>

    ${bannerHtml}

    <!-- KPI Grid -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
      <div class="glassmorphic rounded-xl p-5 border border-white/10 flex items-center justify-between hover:border-white/20 transition">
        <div>
          <p class="text-white/70 text-sm font-medium mb-1">Pending Assessments</p>
          <p class="text-white text-3xl font-bold">${assessmentsCount}</p>
        </div>
        <div class="w-12 h-12 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400">
          <span class="material-symbols-outlined">fitness_center</span>
        </div>
      </div>

      <div class="glassmorphic rounded-xl p-5 border border-white/10 flex items-center justify-between hover:border-white/20 transition">
        <div>
          <p class="text-white/70 text-sm font-medium mb-1">Pending Achievements</p>
          <p class="text-white text-3xl font-bold">${achievementsCount}</p>
        </div>
        <div class="w-12 h-12 rounded-lg bg-yellow-500/20 flex items-center justify-center text-yellow-400">
          <span class="material-symbols-outlined">emoji_events</span>
        </div>
      </div>

      <div class="glassmorphic rounded-xl p-5 border border-white/10 flex items-center justify-between hover:border-white/20 transition">
        <div>
          <p class="text-white/70 text-sm font-medium mb-1">Active Schedules</p>
          <p class="text-white text-3xl font-bold">${activeSchedulesCount}</p>
        </div>
        <div class="w-12 h-12 rounded-lg bg-purple-500/20 flex items-center justify-center text-purple-400">
          <span class="material-symbols-outlined">calendar_month</span>
        </div>
      </div>
    </div>

    <!-- Quick Actions -->
    <div class="mb-8">
      <h2 class="text-white text-xl font-semibold mb-4">Quick Actions</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        <a href="coachVerifyLand.html" class="rounded-xl p-5 border bg-gradient-to-br from-green-600/20 to-green-400/10 border-green-400/30 hover:from-green-600/25 hover:to-green-400/15 transition group">
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 rounded-lg bg-green-500/20 flex items-center justify-center text-green-300 group-hover:bg-green-500/30 transition">
              <span class="material-symbols-outlined">verified</span>
            </div>
            <div>
              <h3 class="text-white font-semibold">Verify</h3>
              <p class="text-white/70 text-sm">Review pending items</p>
            </div>
          </div>
        </a>
        
        <a href="schedulesLand.html" class="rounded-xl p-5 border bg-gradient-to-br from-blue-600/20 to-blue-400/10 border-blue-400/30 hover:from-blue-600/25 hover:to-blue-400/15 transition group">
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-300 group-hover:bg-blue-500/30 transition">
              <span class="material-symbols-outlined">calendar_month</span>
            </div>
            <div>
              <h3 class="text-white font-semibold">Schedules</h3>
              <p class="text-white/70 text-sm">Manage team events</p>
            </div>
          </div>
        </a>

        <a href="coach-reports.html" class="rounded-xl p-5 border bg-gradient-to-br from-purple-600/20 to-purple-400/10 border-purple-400/30 hover:from-purple-600/25 hover:to-purple-400/15 transition group">
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 rounded-lg bg-purple-500/20 flex items-center justify-center text-purple-300 group-hover:bg-purple-500/30 transition">
              <span class="material-symbols-outlined">insights</span>
            </div>
            <div>
              <h3 class="text-white font-semibold">Reports</h3>
              <p class="text-white/70 text-sm">View player analytics</p>
            </div>
          </div>
        </a>

        <a href="viewPlayers.html" class="rounded-xl p-5 border bg-gradient-to-br from-orange-600/20 to-orange-400/10 border-orange-400/30 hover:from-orange-600/25 hover:to-orange-400/15 transition group">
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 rounded-lg bg-orange-500/20 flex items-center justify-center text-orange-300 group-hover:bg-orange-500/30 transition">
              <span class="material-symbols-outlined">groups</span>
            </div>
            <div>
              <h3 class="text-white font-semibold">My Players</h3>
              <p class="text-white/70 text-sm">Manage your roster</p>
            </div>
          </div>
        </a>

      </div>
    </div>
  `;
}

// ==================== ADMIN DASHBOARD (NEW - COMPLETE IMPLEMENTATION) ====================
export async function renderAdminDashboard() {
  const admin = getCurrentUser();
  if (!admin || admin.role !== "Admin") {
    return `
      <div class="text-center text-white/50 py-16">
        <p class="text-xl">Access Denied</p>
        <p class="mt-2">Admin access required</p>
      </div>
    `;
  }

  try {
    // Fetch stats
    const stats = await getTournamentStats(admin.id);

    // Fetch recent tournaments (last 5)
    const recent = await listAdminTournaments({
      adminId: admin.id,
      page: 1,
      limit: 5,
    });

    const total = stats?.totalTournaments ?? 0;
    const published = stats?.publishedTournaments ?? 0;
    const draft = stats?.draftTournaments ?? 0;
    const active = stats?.activeTournaments ?? 0;
    const pending = stats?.pendingApprovals ?? 0;
    const registrations = stats?.totalRegistrations ?? 0;

    const localFormatDate = (isoString) => {
      if (!isoString) return "-";
      const d = new Date(isoString);
      return d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    };
    
    const bannerHtml = await getVerificationBannerHtml(admin, "Upload a verification document to activate your organizer credibility.");

    return `
    <div class="admin-dashboard-container px-4 py-6 max-w-7xl mx-auto">
      
      <!-- Welcome Section -->
      <div class="mb-6">
        <h1 class="text-white text-3xl font-bold mb-2">Welcome back, ${escapeHTML(
          admin.name || admin.username
        )}!</h1>
        <p class="text-white/60">ROLE: ADMIN • Here's what's happening with your tournaments</p>
      </div>

      ${bannerHtml}

      <!-- Metrics Grid -->
      <div class="metrics-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        
        <!-- Total Tournaments -->
        <div class="metric-card glassmorphic rounded-xl p-5 border border-white/10 hover:border-white/20 transition">
          <div class="flex items-start justify-between mb-3">
            <span class="text-white/70 text-sm font-medium">Total Tournaments</span>
            <div class="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <span class="material-symbols-outlined text-blue-400">sports_score</span>
            </div>
          </div>
          <p class="text-white text-3xl font-bold">${total}</p>
        </div>

        <!-- Published Tournaments -->
        <div class="metric-card glassmorphic rounded-xl p-5 border border-white/10 hover:border-white/20 transition">
          <div class="flex items-start justify-between mb-3">
            <span class="text-white/70 text-sm font-medium">Published</span>
            <div class="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
              <span class="material-symbols-outlined text-green-400">task_alt</span>
            </div>
          </div>
          <p class="text-white text-3xl font-bold">${published}</p>
        </div>

        <!-- Draft Tournaments -->
        <div class="metric-card glassmorphic rounded-xl p-5 border border-white/10 hover:border-white/20 transition">
          <div class="flex items-start justify-between mb-3">
            <span class="text-white/70 text-sm font-medium">Drafts</span>
            <div class="w-10 h-10 rounded-lg bg-gray-500/20 flex items-center justify-center">
              <span class="material-symbols-outlined text-gray-400">draft</span>
            </div>
          </div>
          <p class="text-white text-3xl font-bold">${draft}</p>
        </div>

        <!-- Total Registrations -->
        <div class="metric-card glassmorphic rounded-xl p-5 border border-white/10 hover:border-white/20 transition">
          <div class="flex items-start justify-between mb-3">
            <span class="text-white/70 text-sm font-medium">Total Registrations</span>
            <div class="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <span class="material-symbols-outlined text-purple-400">groups</span>
            </div>
          </div>
          <p class="text-white text-3xl font-bold">${registrations}</p>
        </div>

        <!-- Pending Approvals -->
        <div class="metric-card glassmorphic rounded-xl p-5 border border-white/10 hover:border-white/20 transition">
          <div class="flex items-start justify-between mb-3">
            <span class="text-white/70 text-sm font-medium">Pending Approvals</span>
            <div class="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
              <span class="material-symbols-outlined text-orange-400">hourglass_top</span>
            </div>
          </div>
          <p class="text-white text-3xl font-bold">${pending}</p>
        </div>

        <!-- Active Tournaments -->
        <div class="metric-card glassmorphic rounded-xl p-5 border border-white/10 hover:border-white/20 transition">
          <div class="flex items-start justify-between mb-3">
            <span class="text-white/70 text-sm font-medium">Active Now</span>
            <div class="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
              <span class="material-symbols-outlined text-red-400">play_circle</span>
            </div>
          </div>
          <p class="text-white text-3xl font-bold">${active}</p>
        </div>

      </div>

      <!-- Quick Actions -->
      <div class="quick-actions mb-8">
        <h2 class="text-white text-xl font-semibold mb-4">Quick Actions</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
        <a href="admintournament.html" class="rounded-xl p-5 border bg-gradient-to-br from-indigo-600/20 to-indigo-400/10 border-indigo-400/30 hover:from-indigo-600/25 hover:to-indigo-400/15 transition group">
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-300 group-hover:bg-indigo-500/30 transition">
              <span class="material-symbols-outlined">add_circle</span>
            </div>
            <div>
              <h3 class="text-white font-semibold">Create</h3>
              <p class="text-white/70 text-sm">New tournament</p>
            </div>
          </div>
        </a>
        
        <a href="adminregistrations.html" class="rounded-xl p-5 border bg-gradient-to-br from-fuchsia-600/20 to-fuchsia-400/10 border-fuchsia-400/30 hover:from-fuchsia-600/25 hover:to-fuchsia-400/15 transition group">
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 rounded-lg bg-fuchsia-500/20 flex items-center justify-center text-fuchsia-300 group-hover:bg-fuchsia-500/30 transition">
              <span class="material-symbols-outlined">list_alt</span>
            </div>
            <div>
              <h3 class="text-white font-semibold">Registrations</h3>
              <p class="text-white/70 text-sm">Manage signups</p>
            </div>
          </div>
        </a>

        <a href="fixtures.html" class="rounded-xl p-5 border bg-gradient-to-br from-emerald-600/20 to-emerald-400/10 border-emerald-400/30 hover:from-emerald-600/25 hover:to-emerald-400/15 transition group">
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-300 group-hover:bg-emerald-500/30 transition">
              <span class="material-symbols-outlined">grid_view</span>
            </div>
            <div>
              <h3 class="text-white font-semibold">Fixtures</h3>
              <p class="text-white/70 text-sm">Manage matches</p>
            </div>
          </div>
        </a>

        <a href="uploadresults.html" class="rounded-xl p-5 border bg-gradient-to-br from-amber-600/20 to-amber-400/10 border-amber-400/30 hover:from-amber-600/25 hover:to-amber-400/15 transition group">
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-300 group-hover:bg-amber-500/30 transition">
              <span class="material-symbols-outlined">upload_file</span>
            </div>
            <div>
              <h3 class="text-white font-semibold">Results</h3>
              <p class="text-white/70 text-sm">Upload scores</p>
            </div>
          </div>
        </a>

        </div>
      </div>

      <!-- Recent Tournaments -->
      <div class="recent-tournaments">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-white text-xl font-semibold">Recent Tournaments</h2>
          ${
            recent.pagination.total > 5
              ? `
            <a href="adminregistrations.html" class="text-primary hover:text-primary/80 text-sm font-medium">
              View All (${recent.pagination.total}) →
            </a>
          `
              : ""
          }
        </div>
        
        <div class="glassmorphic rounded-xl border border-white/10 overflow-hidden">
          ${
            recent.items.length === 0
              ? `
            <div class="p-8 text-center">
              <span class="material-symbols-outlined text-6xl text-white/20 mb-4 block">event_busy</span>
              <p class="text-white/60 mb-4">No tournaments yet</p>
              <p class="text-white/40 text-sm mb-6">Create your first tournament to get started</p>
              <a href="admintournament.html" class="inline-block px-6 py-3 bg-primary rounded-lg text-white font-semibold hover:bg-primary/90 transition">
                Create Tournament
              </a>
            </div>
          `
              : `
            <table class="w-full">
              <thead class="bg-white/5 border-b border-white/5">
                <tr>
                  <th class="text-left px-4 py-3 text-white/70 text-sm font-medium">Tournament</th>
                  <th class="text-left px-4 py-3 text-white/70 text-sm font-medium hidden md:table-cell">Sport</th>
                  <th class="text-left px-4 py-3 text-white/70 text-sm font-medium hidden lg:table-cell">Date</th>
                  <th class="text-left px-4 py-3 text-white/70 text-sm font-medium">Status</th>
                  <th class="text-right px-4 py-3 text-white/70 text-sm font-medium">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-white/5">
                ${recent.items
                  .map(
                    (t) => `
                  <tr class="hover:bg-white/5 transition">
                    <td class="px-4 py-3">
                      <p class="text-white font-medium">${escapeHTML(
                        t.name
                      )}</p>
                      <p class="text-white/60 text-sm">${escapeHTML(
                        t.venue
                      )}</p>
                    </td>
                    <td class="px-4 py-3 text-white/80 hidden md:table-cell">${escapeHTML(
                      t.sport
                    )}</td>
                    <td class="px-4 py-3 text-white/80 text-sm hidden lg:table-cell">${localFormatDate(
                      t.startDateTime
                    )}</td>
                    <td class="px-4 py-3">
                      <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        t.status === "PUBLISHED"
                          ? "bg-green-500/20 text-green-400"
                          : "bg-gray-500/20 text-gray-400"
                      }">
                        ${t.status}
                      </span>
                    </td>
                    <td class="px-4 py-3 text-right">
                      <a href="adminregistrations.html?id=${t.id}" class="text-primary hover:text-primary/80 text-sm font-medium">
                        View →
                      </a>
                    </td>
                  </tr>
                `
                  )
                  .join("")}
              </tbody>
            </table>
          `
          }
        </div>
      </div>

    </div>
  `;
  } catch (error) {
    console.error("Failed to render admin dashboard:", error);
    return `
      <div class="text-center text-white/50 py-16">
        <p class="text-xl">Dashboard unavailable</p>
        <p class="mt-2 text-sm text-white/40">${error.message}</p>
      </div>
    `;
  }
}

// ==================== GOVERNMENT DASHBOARD (UNCHANGED) ====================
export async function renderGovDashboard() {
  const me = getCurrentUser();
  if (!me || me.role !== "Government Official") {
    return `
      <div class="text-center text-white/50 py-16">
        <p class="text-xl">Access Denied</p>
        <p class="mt-2">Government Official access required</p>
      </div>
    `;
  }

  // Ensure district/state dataset is available (lazy-loads js/districts.js if needed)
  await ensureGeoLoaded();

  // Read filters from URL (use window.URL to avoid shadowing)
  const url = new window.URL(window.location.href);
  const state = url.searchParams.get("state") || "";
  const district = url.searchParams.get("district") || "";

  // Build state/district options from window.statesAndDistricts
  const geo = typeof window !== "undefined" ? window.statesAndDistricts : null;
  const hasGeo = !!(geo && typeof geo === "object");

  let stateOptions = `<option value="">All India</option>`;
  let districtOptions = `<option value="">All Districts</option>`;

  try {
    if (hasGeo) {
      const states = Object.keys(geo).sort((a, b) => a.localeCompare(b));
      stateOptions += states
        .map(
          (s) =>
            `<option value="${escapeHTML(s)}" ${
              s === state ? "selected" : ""
            }>${escapeHTML(s)}</option>`
        )
        .join("");

      const dists = state && Array.isArray(geo[state]) ? geo[state] : [];
      if (dists.length) {
        districtOptions += dists
          .map(
            (d) =>
              `<option value="${escapeHTML(d)}" ${
                d === district ? "selected" : ""
              }>${escapeHTML(d)}</option>`
          )
          .join("");
      }
    }
  } catch {}

  // Fetch KPIs
  let data = {
    totalTournaments: 0,
    publishedTournaments: 0,
    totalRegistrations: 0,
    totalPlayers: 0,
    totalCoaches: 0,
    totalAchievements: 0,
    pendingAchievements: 0,
    approvedAchievements: 0,
    rejectedAchievements: 0,
    tournamentsByMonth: 0,
    playersByState: [],
    coachesBySport: [],
  };

  try {
    const resp = await API.getGovStats({ state, district });
    if (resp?.success && resp?.data) data = resp.data;
    else if (resp) data = resp;
  } catch (e) {
    console.error("GOV_DASH_FETCH_ERROR", e);
  }

  // Build base params to carry region filters
  const baseParams = new URLSearchParams();
  if (state) baseParams.set("state", state);
  if (district) baseParams.set("district", district);

  const toHref = (base, extra = {}) => {
    const p = new URLSearchParams(baseParams);
    Object.entries(extra).forEach(([k, v]) => {
      if (v !== undefined && v !== null && String(v) !== "") p.set(k, v);
    });
    const s = p.toString();
    return `${base}${s ? `?${s}` : ""}`;
  };

  // KPI links mapping (same-tab)
  const hrefGovTour = toHref("govtour.html");
  const hrefGovTourPublished = toHref("govtour.html", { status: "PUBLISHED" });
  const hrefAnalyticsPlayers = toHref("analytics.html", { view: "players" });
  const hrefAnalyticsAch = toHref("analytics.html", { view: "achievements" });
  const hrefAchPending = toHref("analytics.html", {
    view: "achievements",
    status: "pending",
  });
  const hrefAchApproved = toHref("analytics.html", {
    view: "achievements",
    status: "approved",
  });
  const hrefAchRejected = toHref("analytics.html", {
    view: "achievements",
    status: "rejected",
  });

  // Export qs
  const q = baseParams.toString() ? `?${baseParams.toString()}` : "";

  // Inline onchange handlers -> call global helper (no reload)
  const onChangeState = `window.__govFilterChange && window.__govFilterChange('state', this.value)`;
  const onChangeDistrict = `window.__govFilterChange && window.__govFilterChange('district', this.value)`;

  const bannerHtml = await getVerificationBannerHtml(me, "Upload a verification document to complete official verification.");

  return `
    <div class="px-4 py-6 mx-auto w-full max-w-4xl md:max-w-6xl lg:max-w-7xl xl:max-w-[1400px] 2xl:max-w-[1600px]">
      <!-- Heading -->
      <div class="mb-6">
        <h1 class="text-white text-3xl font-bold mb-2">Welcome back, ${escapeHTML(me.name || me.username || "Official")}!</h1>
        <p class="text-white/60 text-sm">
          ROLE: GOVERNMENT OFFICIAL •
          ${state ? `Region: ${escapeHTML(state)}` : "All India"}
          ${district ? ` • District: ${escapeHTML(district)}` : ""}
        </p>
      </div>

      <!-- Filters -->
      <div class="glassmorphic rounded-xl p-4 border border-white/10 mb-6">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label class="block text-white/70 text-sm mb-1">State</label>
            <select class="w-full select-dark rounded-lg p-2" onchange="${onChangeState}">
              ${stateOptions}
            </select>
            ${
              !hasGeo
                ? `<p class="text-xs text-white/40 mt-2">Tip: Load js/districts.js to enable state/district dropdowns (or add &lt;script src="js/districts.js"&gt; to dashboard.html).</p>`
                : ""
            }
          </div>

          <div>
            <label class="block text-white/70 text-sm mb-1">District</label>
            <select class="w-full select-dark rounded-lg p-2" ${
              state && hasGeo ? "" : "disabled"
            } title="${
    state && hasGeo ? "" : "Select a state first"
  }" onchange="${onChangeDistrict}">
              ${districtOptions}
            </select>
          </div>

          <div>
            <label class="block text-white/70 text-sm mb-1">Export CSV</label>
            <div class="flex flex-wrap gap-2">
              <a href="/api/gov/export/tournaments${q}" class="inline-flex items-center px-3 py-2 rounded-md border border-blue-400/30 bg-blue-500/10 hover:bg-blue-500/15 text-white text-sm">Tournaments</a>
              <a href="/api/gov/export/registrations${q}" class="inline-flex items-center px-3 py-2 rounded-md border border-fuchsia-400/30 bg-fuchsia-500/10 hover:bg-fuchsia-500/15 text-white text-sm">Registrations</a>
              <a href="/api/gov/export/players${q}" class="inline-flex items-center px-3 py-2 rounded-md border border-emerald-400/30 bg-emerald-500/10 hover:bg-emerald-500/15 text-white text-sm">Players</a>
              <a href="/api/gov/export/coaches${q}" class="inline-flex items-center px-3 py-2 rounded-md border border-cyan-400/30 bg-cyan-500/10 hover:bg-cyan-500/15 text-white text-sm">Coaches</a>
              <a href="/api/gov/export/achievements${q}" class="inline-flex items-center px-3 py-2 rounded-md border border-amber-400/30 bg-amber-500/10 hover:bg-amber-500/15 text-white text-sm">Achievements</a>
            </div>
          </div>
        </div>
      </div>

      ${bannerHtml}

      <!-- KPI Grid -->
      <div class="metrics-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        ${metricCard(
          "Total Tournaments",
          data.totalTournaments,
          "blue",
          hrefGovTour
        )}
        ${metricCard(
          "Published",
          data.publishedTournaments,
          "green",
          hrefGovTourPublished
        )}
        ${metricCard(
          "Total Registrations",
          data.totalRegistrations,
          "purple",
          hrefGovTour
        )}
        ${metricCard(
          "Total Players",
          data.totalPlayers,
          "indigo",
          hrefAnalyticsPlayers
        )}
        ${metricCard(
          "Total Coaches",
          data.totalCoaches,
          "cyan",
          toHref("analytics.html", { view: "coaches" })
        )}
        ${metricCard(
          "Achievements",
          data.totalAchievements,
          "slate",
          hrefAnalyticsAch
        )}
        ${metricBadgeCard(
          "Achievements Pending",
          data.pendingAchievements,
          "warning",
          hrefAchPending
        )}
        ${metricBadgeCard(
          "Achievements Approved",
          data.approvedAchievements,
          "success",
          hrefAchApproved
        )}
        ${metricBadgeCard(
          "Achievements Rejected",
          data.rejectedAchievements,
          "danger",
          hrefAchRejected
        )}
      </div>

      <!-- Quick Actions -->
      <div class="mb-8">
        <h2 class="text-white text-xl font-semibold mb-4">Quick Actions</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <a href="${hrefGovTour}" class="rounded-xl p-5 border bg-gradient-to-br from-blue-600/20 to-blue-400/10 border-blue-400/30 hover:from-blue-600/25 hover:to-blue-400/15 transition">
            <div class="flex items-center gap-4">
              <div class="w-12 h-12 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-300">
                <svg class="w-6 h-6" viewBox="0 0 20 20" fill="currentColor"><path d="M4 3a2 2 0 00-2 2v5h2V5h12v10H4v-2H2v3a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4z"/></svg>
              </div>
              <div>
                <h3 class="text-white font-semibold">Monitor Tournaments</h3>
                <p class="text-white/70 text-sm">Filter and review by region</p>
              </div>
            </div>
          </a>

          <a href="${toHref(
            "analytics.html"
          )}" class="rounded-xl p-5 border bg-gradient-to-br from-emerald-600/20 to-emerald-400/10 border-emerald-400/30 hover:from-emerald-600/25 hover:to-emerald-400/15 transition">
            <div class="flex items-center gap-4">
              <div class="w-12 h-12 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-300">
                <svg class="w-6 h-6" viewBox="0 0 20 20" fill="currentColor"><path d="M3 3h2v14H3V3zm6 4h2v10H9V7zm6-6h2v16h-2V1z"/></svg>
              </div>
              <div>
                <h3 class="text-white font-semibold">Open Analytics</h3>
                <p class="text-white/70 text-sm">Players, coaches, achievements</p>
              </div>
            </div>
          </a>
        </div>
      </div>
    </div>
  `;

  function metricCard(label, value, color = "blue", href = "") {
    const colorMap = {
      blue: "bg-blue-500/20 text-blue-400",
      green: "bg-green-500/20 text-green-400",
      purple: "bg-purple-500/20 text-purple-400",
      indigo: "bg-indigo-500/20 text-indigo-400",
      cyan: "bg-cyan-500/20 text-cyan-400",
      slate: "bg-slate-500/20 text-slate-300",
      orange: "bg-orange-500/20 text-orange-400",
      red: "bg-red-500/20 text-red-400",
    };
    const shell = `
      <div class="metric-card glassmorphic rounded-xl p-5 border border-white/10 hover:border-primary/40 transition">
        <div class="flex items-start justify-between mb-3">
          <span class="text-white/70 text-sm font-medium">${escapeHTML(
            label
          )}</span>
          <div class="w-10 h-10 rounded-lg flex items-center justify-center ${
            colorMap[color] || colorMap.blue
          }">
            <svg class="w-5 h-5" viewBox="0 0 20 20" fill="currentColor"><circle cx="10" cy="10" r="8"/></svg>
          </div>
        </div>
        <p class="text-white text-3xl font-bold">${Number(
          value ?? 0
        ).toLocaleString()}</p>
      </div>
    `;
    return href ? `<a href="${href}" class="block">${shell}</a>` : shell;
  }

  function metricBadgeCard(label, value, variant = "success", href = "") {
    const cls =
      variant === "success"
        ? "bg-green-500/20 text-green-400"
        : variant === "warning"
        ? "bg-yellow-500/20 text-yellow-400"
        : "bg-red-500/20 text-red-400";
    const shell = `
      <div class="glassmorphic rounded-xl p-5 border border-white/10">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-white/70 text-sm font-medium">${escapeHTML(
              label
            )}</p>
            <p class="text-white text-3xl font-bold">${Number(
              value ?? 0
            ).toLocaleString()}</p>
          </div>
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls}">
            ${escapeHTML(label)}
          </span>
        </div>
      </div>
    `;
    return href ? `<a href="${href}" class="block">${shell}</a>` : shell;
  }
}

// ==================== HELPER FUNCTIONS ====================

async function getVerificationBannerHtml(user, roleText) {
  if (!user || user.role === "Player") return "";
  try {
    const cert = await API.getCertificate();
    if (cert) return ""; // Certificate exists, do not show banner
  } catch (e) {
    return ""; // Fail safely if the API request errors out
  }

  const roleParam = encodeURIComponent(user.role);
  return `
    <div class="glassmorphic rounded-2xl p-5 mb-6 border border-yellow-500/30 bg-yellow-500/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
      <div class="flex items-start sm:items-center gap-4">
        <div class="w-12 h-12 rounded-xl bg-yellow-500/20 border border-yellow-500/30 flex items-center justify-center shrink-0">
          <span class="material-symbols-outlined text-yellow-400">verified</span>
        </div>
        <div>
          <h3 class="text-yellow-400 font-bold text-lg leading-tight">Add a certificate to verify yourself</h3>
          <p class="text-yellow-100/80 text-sm mt-1">${escapeHTML(roleText)}</p>
        </div>
      </div>
      <a href="upload-certificate.html?role=${roleParam}&returnTo=${encodeURIComponent('dashboard.html')}" class="shrink-0 px-6 py-2.5 bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-400 hover:to-yellow-500 text-yellow-950 font-bold rounded-xl transition shadow-lg shadow-yellow-500/20 whitespace-nowrap text-sm">
        Upload Certificate
      </a>
    </div>
  `;
}

// HTML escaping
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

// Date formatting
function formatDate(isoString) {
  if (!isoString) return "-";
  const date = new Date(isoString);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// Player dashboard helpers (unchanged)
function formatLastResult(a) {
  try {
    const drill = String(a.drill || "");
    if (drill === "SIT_UPS") {
      const reps = a?.rawMetrics?.reps ?? Math.round(a.score);
      const dur = a?.rawMetrics?.durationSec ?? 30;
      const conf = a?.confidence ?? 0;
      return `${reps} sit-ups · ${formatSec(dur)} (${confidenceLabel(conf)})`;
    }
    if (drill === "RUN_800M" || drill === "RUN_1_6K") {
      const time = Math.round(a.score);
      const label = drill === "RUN_800M" ? "800m" : "1.6km";
      return `${formatSec(time)} • ${label}`;
    }
    if (drill === "BROAD_JUMP") {
      const dist = a?.rawMetrics?.distanceCm ?? Math.round(a.score);
      const st = String(a.status || "").replace("_", " ");
      return `${dist} cm (${capitalize(st)})`;
    }
    return null;
  } catch {
    return null;
  }
}

function formatSec(total) {
  const t = Math.max(0, Number(total) || 0);
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function confidenceLabel(c) {
  if (c >= 0.85) return "High confidence";
  if (c >= 0.6) return "Okay confidence";
  return "Low confidence";
}

function capitalize(s) {
  return (
    String(s || "")
      .charAt(0)
      .toUpperCase() +
    String(s || "")
      .slice(1)
      .toLowerCase()
  );
}
