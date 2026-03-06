// js/coachSchedules.js
// Handles schedule creation and player requests management

import { requireLogin } from "./core/auth.js";
import { getCurrentUser } from "./modules/users.js";
import {
  addSchedule,
  listSchedulesByCoach,
  listRequestsBySchedule,
  setRequestStatus,
} from "./modules/schedules.js";

document.addEventListener("DOMContentLoaded", async () => {
  requireLogin();

  const coach = getCurrentUser();
  if (!coach || coach.role !== "Coach") {
    window.location.href = "dashboard.html";
    return;
  }

  // Get URL parameters to determine view
  const urlParams = new URLSearchParams(window.location.search);
  const view = urlParams.get("view");

  // View containers
  const createView = document.getElementById("schedCreate");
  const requestsView = document.getElementById("schedRequests");
  const pageTitle = document.getElementById("pageTitle");

  // Check if elements exist (they might not on landing page)
  if (!createView || !requestsView) {
    console.log("Views not found - likely on landing page");
    return;
  }

  // Create form elements
  const schSport = document.getElementById("schSport");
  const schDate = document.getElementById("schDate");
  const schStart = document.getElementById("schStart");
  const schEnd = document.getElementById("schEnd");
  const schVenue = document.getElementById("schVenue");
  const schEntrance = document.getElementById("schEntrance");
  const formMsg = document.getElementById("formMsg");

  const saveBtn = document.getElementById("saveSchedule");
  const cancelBtn = document.getElementById("cancelCreate");

  // My schedules list
  const mySchedulesList = document.getElementById("mySchedulesList");
  const mySchedulesEmpty = document.getElementById("mySchedulesEmpty");

  // Requests view elements
  const coachSchedulesGrid = document.getElementById("coachSchedulesGrid");
  const coachSchedulesEmpty = document.getElementById("coachSchedulesEmpty");
  const requestsGrid = document.getElementById("requestsGrid");
  const noRequestsMsg = document.getElementById("noRequestsMsg");

  const DEFAULT_AVATAR =
    "https://cdn-icons-png.flaticon.com/512/149/149071.png";

  // Venues list (generic)
  const VENUES = [
    "National Sports Complex",
    "City Stadium",
    "Indoor Arena",
    "University Ground",
    "High School Field",
  ];

  // Prefill sport and venues
  if (schSport) schSport.value = coach.sport || "-";
  if (schVenue) {
    schVenue.innerHTML =
      `<option value="">Select venue</option>` +
      VENUES.map((v) => `<option value="${v}">${v}</option>`).join("");
  }

  // ===========================
  // VIEW SWITCHING
  // ===========================
  function showView(viewName) {
    if (!createView || !requestsView) return;

    createView.classList.add("hidden");
    requestsView.classList.add("hidden");

    if (viewName === "create") {
      createView.classList.remove("hidden");
      if (pageTitle) pageTitle.textContent = "Create Schedule";
      renderMySchedules();
    } else if (viewName === "requests") {
      requestsView.classList.remove("hidden");
      if (pageTitle) pageTitle.textContent = "Player Requests";
      renderCoachSchedules();
      clearRequestsPanel();
    }
  }

  // Initialize view based on URL parameter
  if (view === "create") {
    showView("create");
  } else if (view === "requests") {
    showView("requests");
  } else {
    // Default to create if no parameter
    showView("create");
  }

  // ===========================
  // CANCEL BUTTON
  // ===========================
  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      clearForm();
      window.location.href = "schedulesLand.html";
    });
  }

  // ===========================
  // FORM HANDLING
  // ===========================
  function clearForm() {
    if (schDate) schDate.value = "";
    if (schStart) schStart.value = "";
    if (schEnd) schEnd.value = "";
    if (schVenue) schVenue.value = "";
    if (schEntrance) schEntrance.value = "";
    if (formMsg) formMsg.textContent = "";
  }

  function validateForm() {
    const date = schDate?.value;
    const start = schStart?.value;
    const entrance = schEntrance?.value;
    const venue = schVenue?.value;

    if (!date || !start || !venue || !entrance) {
      if (formMsg) {
        formMsg.textContent =
          "Please fill all required fields (Date, Start time, Venue, Entrance).";
        formMsg.classList.remove("hidden");
      }
      return null;
    }

    // Optional end time validation
    const end = schEnd?.value;
    if (end && start && end <= start) {
      if (formMsg) {
        formMsg.textContent = "End time must be after start time.";
        formMsg.classList.remove("hidden");
      }
      return null;
    }

    if (formMsg) {
      formMsg.textContent = "";
      formMsg.classList.add("hidden");
    }

    return {
      date,
      startTime: start,
      endTime: end || "",
      venue,
      entrance,
    };
  }

  // ===========================
  // SAVE SCHEDULE
  // ===========================
  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      const vals = validateForm();
      if (!vals) return;

      try {
        await addSchedule({
          coachId: coach.id,
          sport: coach.sport || "",
          date: vals.date,
          startTime: vals.startTime,
          endTime: vals.endTime,
          venue: vals.venue,
          entrance: vals.entrance,
        });

        // Update UI immediately
        await renderMySchedules();
        await renderCoachSchedules();
        clearForm();

        // Show success message
        if (formMsg) {
          formMsg.textContent = "Schedule created successfully!";
          formMsg.classList.remove("hidden", "text-red-400");
          formMsg.classList.add("text-green-400");

          setTimeout(() => {
            formMsg.textContent = "";
            formMsg.classList.add("hidden");
            formMsg.classList.remove("text-green-400");
            formMsg.classList.add("text-red-400");
          }, 3000);
        }
      } catch (error) {
        if (formMsg) {
          formMsg.textContent = "Failed to create schedule. Please try again.";
          formMsg.classList.remove("hidden");
        }
      }
    });
  }

  // ===========================
  // RENDER MY SCHEDULES
  // ===========================
  async function renderMySchedules() {
    if (!mySchedulesList || !mySchedulesEmpty) return;

    const list = await listSchedulesByCoach(coach.id);
    mySchedulesList.innerHTML = "";

    if (!list.length) {
      mySchedulesEmpty.classList.remove("hidden");
      return;
    }
    mySchedulesEmpty.classList.add("hidden");

    list.forEach((s) => {
      const card = document.createElement("div");
      card.className = "schedule-card";
      const schedDate = new Date(s.date).toLocaleDateString();
      card.innerHTML = `
        <h4>${escapeHTML(s.venue)}</h4>
        <p><strong>${escapeHTML(s.sport)}</strong></p>
        <p>${schedDate} • ${escapeHTML(s.startTime)}${
        s.endTime ? " - " + escapeHTML(s.endTime) : ""
      }</p>
        <div class="meta">
          <span class="badge badge-${
            s.entrance === "OPEN" ? "open" : "pending"
          }">
            ${s.entrance === "OPEN" ? "Open to all" : "Approval needed"}
          </span>
        </div>
      `;
      mySchedulesList.appendChild(card);
    });
  }

  // ===========================
  // RENDER COACH SCHEDULES (Requests View)
  // ===========================
  async function renderCoachSchedules() {
    if (!coachSchedulesGrid || !coachSchedulesEmpty) return;

    const list = await listSchedulesByCoach(coach.id);
    coachSchedulesGrid.innerHTML = "";

    if (!list.length) {
      coachSchedulesEmpty.classList.remove("hidden");
      return;
    }
    coachSchedulesEmpty.classList.add("hidden");

    list.forEach((s) => {
      const card = document.createElement("div");
      card.className = "schedule-card cursor-pointer";
      card.tabIndex = 0;
      const schedDate = new Date(s.date).toLocaleDateString();
      card.innerHTML = `
        <h4>${escapeHTML(s.venue)}</h4>
        <p><strong>${escapeHTML(s.sport)}</strong></p>
        <p>${schedDate} • ${escapeHTML(s.startTime)}${
        s.endTime ? " - " + escapeHTML(s.endTime) : ""
      }</p>
        <div class="meta">
          <span class="badge badge-${
            s.entrance === "OPEN" ? "open" : "pending"
          }">
            ${s.entrance === "OPEN" ? "Open to all" : "Approval needed"}
          </span>
        </div>
      `;
      card.addEventListener("click", () => loadRequestsFor(s.id));
      card.addEventListener("keypress", (e) => {
        if (e.key === "Enter") loadRequestsFor(s.id);
      });
      coachSchedulesGrid.appendChild(card);
    });
  }

  // ===========================
  // REQUESTS PANEL
  // ===========================
  function clearRequestsPanel() {
    if (noRequestsMsg) noRequestsMsg.classList.remove("hidden");
    if (requestsGrid) requestsGrid.innerHTML = "";
  }

  async function loadRequestsFor(scheduleId) {
    if (!requestsGrid || !noRequestsMsg) return;

    const reqs = await listRequestsBySchedule(scheduleId, "PENDING");
    requestsGrid.innerHTML = "";

    if (!reqs.length) {
      clearRequestsPanel();
      return;
    }

    noRequestsMsg.classList.add("hidden");

    reqs.forEach((rq) => {
      const player = rq.player;
      const age = calcAge(player?.dob);
      const photo = player?.profilePic || DEFAULT_AVATAR;

      const card = document.createElement("div");
      card.className = "request-card";
      card.innerHTML = `
        <div>
          <h5>${escapeHTML(player?.name || player?.username || "Player")}</h5>
          <p><strong>Sport:</strong> ${escapeHTML(player?.sport || "-")}</p>
          <p><strong>Age:</strong> ${age != null ? age : "-"}</p>
        </div>
        <div class="request-photo">
          <img src="${photo}" alt="player photo" />
        </div>
        <div class="request-actions">
          <button class="px-3 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-medium transition" data-act="approve" data-id="${
            rq.id
          }">Approve</button>
          <button class="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition" data-act="reject" data-id="${
            rq.id
          }">Reject</button>
        </div>
      `;
      requestsGrid.appendChild(card);
    });

    // Bind actions
    requestsGrid.querySelectorAll("button[data-act]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-id");
        const act = btn.getAttribute("data-act");
        await setRequestStatus(id, act === "approve" ? "APPROVED" : "REJECTED");
        // Re-render pending list
        await loadRequestsFor(scheduleId);
      });
    });
  }

  // ===========================
  // UTILITY FUNCTIONS
  // ===========================
  function calcAge(dob) {
    if (!dob) return null;
    const today = new Date();
    const birth = new Date(dob);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
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
});
