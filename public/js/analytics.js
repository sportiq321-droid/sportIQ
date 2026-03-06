// /public/js/analytics.js
import API from "./api.js";
import { requireLogin } from "./core/auth.js";
import { getCurrentUser } from "./modules/users.js";

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
    setTimeout(() => resolve(true), 1500); // final fallback
  });
}

const App = {
  // State
  user: null,
  state: {
    view: "players", // players | coaches | achievements
    filters: {
      state: "",
      district: "",
      sport: "",
      search: "",
      page: 1,
    },
  },

  // Elements
  els: {},

  async init() {
    this.user = getCurrentUser();
    if (
      !this.user ||
      !["Government Official", "Admin", "Coach"].includes(this.user.role)
    ) {
      window.location.href = "dashboard.html";
      return;
    }

    this.cacheElements();
    this.readStateFromURL();
    await this.render();

    this.attachListeners();
  },

  cacheElements() {
    const ids = [
      "tabs",
      "panels",
      "fState",
      "fDistrict",
      "fSport",
      "fSearch",
      "stateFilterContainer",
      "districtFilterContainer",
      "sportFilterContainer",
      "playersPanel",
      "coachesPanel",
      "achievementsPanel",
      "playersContent",
      "coachesContent",
      "achievementsContent",
      "btnReset",
    ];
    ids.forEach((id) => {
      this.els[id] = document.getElementById(id);
    });
  },

  readStateFromURL() {
    const params = new URLSearchParams(window.location.search);
    this.state.view = params.get("view") || "players";
    this.state.filters.state = params.get("state") || "";
    this.state.filters.district = params.get("district") || "";
    this.state.filters.sport = params.get("sport") || "";
    this.state.filters.search = params.get("search") || "";
    this.state.filters.page = parseInt(params.get("page") || "1", 10);
  },

  updateURL() {
    const params = new URLSearchParams();
    params.set("view", this.state.view);
    Object.entries(this.state.filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    window.history.pushState(null, "", `?${params.toString()}`);
  },

  attachListeners() {
    this.els.fState?.addEventListener("change", (e) =>
      this.handleFilterChange("state", e.target.value)
    );
    this.els.fDistrict?.addEventListener("change", (e) =>
      this.handleFilterChange("district", e.target.value)
    );
    this.els.fSport?.addEventListener("change", (e) =>
      this.handleFilterChange("sport", e.target.value)
    );
    this.els.fSearch?.addEventListener(
      "input",
      debounce((e) => this.handleFilterChange("search", e.target.value), 300)
    );
    this.els.btnReset?.addEventListener("click", () =>
      this.handleFilterChange("reset")
    );
    window.addEventListener("popstate", () => this.init());
  },

  handleFilterChange(key, value) {
    if (key === "reset") {
      this.state.filters = {
        state: "",
        district: "",
        sport: "",
        search: "",
        page: 1,
      };
    } else {
      this.state.filters[key] = value;
      this.state.filters.page = 1; // Reset page on filter change
      if (key === "state") this.state.filters.district = ""; // Reset district if state changes
    }
    this.updateURL();
    this.render();
  },

  async render() {
    await this.renderFilters();
    this.renderTabs();
    this.renderActivePanel();
  },

  async renderFilters() {
    await ensureGeoLoaded();
    const geo = window.statesAndDistricts || {};
    const { state, district, sport, search } = this.state.filters;
    const role = this.user.role;

    // Visibility
    this.els.stateFilterContainer.style.display =
      role === "Government Official" ? "block" : "none";
    this.els.districtFilterContainer.style.display =
      role === "Government Official" ? "block" : "none";

    // Populate States
    const states = Object.keys(geo).sort();
    this.els.fState.innerHTML =
      `<option value="">All India</option>` +
      states
        .map(
          (s) =>
            `<option value="${escapeHTML(s)}" ${
              s === state ? "selected" : ""
            }>${escapeHTML(s)}</option>`
        )
        .join("");

    // Populate Districts
    const districts = state && geo[state] ? geo[state] : [];
    this.els.fDistrict.innerHTML =
      `<option value="">All Districts</option>` +
      districts
        .map(
          (d) =>
            `<option value="${escapeHTML(d)}" ${
              d === district ? "selected" : ""
            }>${escapeHTML(d)}</option>`
        )
        .join("");
    this.els.fDistrict.disabled = !state;

    // Populate Sports (can be hardcoded or fetched)
    const sports = [
      "Cricket",
      "Football",
      "Kabaddi",
      "Volleyball",
      "Badminton",
      "Hockey",
      "Basketball",
      "Athletics",
    ];
    this.els.fSport.innerHTML =
      `<option value="">All Sports</option>` +
      sports
        .map(
          (s) =>
            `<option value="${s}" ${
              s === sport ? "selected" : ""
            }>${s}</option>`
        )
        .join("");

    // Set search value
    this.els.fSearch.value = search;
  },

  renderTabs() {
    const availableTabs = {
      "Government Official": ["players", "coaches", "achievements"],
      Admin: ["players", "coaches"],
      Coach: ["players", "achievements"],
    };
    const userTabs = availableTabs[this.user.role] || [];
    const tabHTML = userTabs
      .map((tabId) => {
        const label = tabId.charAt(0).toUpperCase() + tabId.slice(1);
        const isActive = this.state.view === tabId;
        return `
        <button role="tab" id="${tabId}Tab" aria-selected="${isActive}" aria-controls="${tabId}Panel"
          class="px-4 py-2 text-sm font-medium transition-colors ${
            isActive
              ? "text-white border-b-2 border-primary"
              : "text-white/60 hover:text-white border-b-2 border-transparent"
          }">
          ${label}
        </button>
      `;
      })
      .join("");
    this.els.tabs.innerHTML = tabHTML;

    // Attach listeners to newly created tabs
    this.els.tabs.querySelectorAll('[role="tab"]').forEach((tab) => {
      tab.addEventListener("click", () => {
        this.state.view = tab.id.replace("Tab", "");
        this.state.filters.page = 1; // Reset page on tab change
        this.updateURL();
        this.render();
      });
    });
  },

  async renderActivePanel() {
    // Hide all panels
    ["playersPanel", "coachesPanel", "achievementsPanel"].forEach((id) =>
      this.els[id]?.classList.add("hidden")
    );

    const activePanelId = `${this.state.view}Panel`;
    const activePanel = this.els[activePanelId];
    if (!activePanel) return;

    activePanel.classList.remove("hidden");
    const contentContainer = this.els[`${this.state.view}Content`];
    contentContainer.innerHTML = `<p class="text-white/50 text-center py-8">Loading ${this.state.view}...</p>`;

    switch (this.state.view) {
      case "players":
        contentContainer.innerHTML = await this.renderTablePanel({
          fetch: () => API.getGovPlayers(this.state.filters),
          columns: ["Player", "Email", "Sport", "Activity"],
          rowHTML: (item) => `
                <td class="table-cell-primary">${escapeHTML(
                  item.name || item.username
                )}</td>
                <td class="table-cell-secondary hide-mobile">${escapeHTML(
                  item.email
                )}</td>
                <td class="table-cell-secondary">${escapeHTML(
                  item.sport || "-"
                )}</td>
                <td>${item._count.registrations} Tournaments / ${
            item._count.achievements
          } Achievements</td>
            `,
        });
        break;
      case "coaches":
        contentContainer.innerHTML = await this.renderTablePanel({
          fetch: () => API.getGovCoaches(this.state.filters),
          columns: ["Coach", "Email", "Sport", "Schedules"],
          rowHTML: (item) => `
                <td class="table-cell-primary">${escapeHTML(
                  item.name || item.username
                )}</td>
                <td class="table-cell-secondary hide-mobile">${escapeHTML(
                  item.email
                )}</td>
                <td class="table-cell-secondary">${escapeHTML(
                  item.sport || "-"
                )}</td>
                <td>${item._count.schedules}</td>
            `,
        });
        break;
      case "achievements":
        contentContainer.innerHTML = await this.renderAchievementsPanel();
        break;
    }

    // Re-attach pagination listeners if they exist in the rendered HTML
    this.attachPaginationListeners(contentContainer);
  },

  async renderTablePanel({ fetch, columns, rowHTML }) {
    try {
      const resp = await fetch();
      const items = resp?.data?.items || [];
      const pagination = resp?.data?.pagination || {
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 1,
      };

      if (items.length === 0)
        return `<div class="empty-state"><p>No data found for the current filters.</p></div>`;

      const header = columns.map((c) => `<th>${c}</th>`).join("");
      const rows = items.map((item) => `<tr>${rowHTML(item)}</tr>`).join("");

      return `
        <div class="admin-table-container">
            <table class="admin-table">
                <thead><tr>${header}</tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
        ${this.renderPagination(pagination)}
      `;
    } catch (e) {
      return `<div class="empty-state"><p class="text-red-400">Error: ${e.message}</p></div>`;
    }
  },

  async renderAchievementsPanel() {
    try {
      const resp = await API.getGovAchievementStats(this.state.filters);
      const stats = resp?.data || {
        total: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
        approvalRate: 0,
        bySport: [],
      };

      const kpiHTML = `
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          ${metricBadgeCard("Pending", stats.pending, "warning")}
          ${metricBadgeCard("Approved", stats.approved, "success")}
          ${metricBadgeCard("Rejected", stats.rejected, "danger")}
          ${metricBadgeCard("Approval Rate", `${stats.approvalRate}%`, "info")}
        </div>
      `;

      const tableHTML = `
        <h3 class="text-xl font-semibold mb-4">Achievements by Sport</h3>
        <div class="admin-table-container">
            <table class="admin-table">
                <thead><tr><th>Sport</th><th>Count</th></tr></thead>
                <tbody>
                    ${stats.bySport
                      .map(
                        (s) =>
                          `<tr><td class="table-cell-primary">${escapeHTML(
                            s.sport
                          )}</td><td>${s.count}</td></tr>`
                      )
                      .join("")}
                </tbody>
            </table>
        </div>
      `;

      return kpiHTML + tableHTML;
    } catch (e) {
      return `<div class="empty-state"><p class="text-red-400">Error: ${e.message}</p></div>`;
    }
  },

  renderPagination(pagination) {
    if (pagination.totalPages <= 1) return "";
    return `
      <nav class="admin-pagination mt-4" aria-label="Pagination">
        <div class="pagination-info">Page ${pagination.page} of ${
      pagination.totalPages
    }</div>
        <div class="pagination-controls">
          <button data-page="${pagination.page - 1}" class="pagination-btn" ${
      pagination.page <= 1 ? "disabled" : ""
    }>Prev</button>
          <button data-page="${pagination.page + 1}" class="pagination-btn" ${
      pagination.page >= pagination.totalPages ? "disabled" : ""
    }>Next</button>
        </div>
      </nav>
    `;
  },

  attachPaginationListeners(container) {
    container.querySelectorAll(".pagination-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const page = btn.dataset.page;
        if (page) this.handleFilterChange("page", page);
      });
    });
  },
};

// Start the app
document.addEventListener("DOMContentLoaded", () => {
  // Global login check (redundant but safe)
  requireLogin();
  App.init();
});
