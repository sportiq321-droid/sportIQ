// js/dashboard.js
// This file is now a "router" that dynamically builds the dashboard UI based on the user's role.

import { requireLogin, syncLocalSession } from "./core/auth.js";
import { getCurrentUser } from "./modules/users.js";
import API from "./api.js";
// Import the new renderer functions for each role
import {
  renderPlayerDashboard,
  renderCoachDashboard,
  renderAdminDashboard,
  renderGovDashboard,
} from "./modules/dashboards.js";

document.addEventListener("DOMContentLoaded", async () => {
  // 1. Authenticate and get user
  requireLogin();

  // 1. Fetch the absolute freshest user data from the backend
  try {
    const freshUser = await API.me();
    // 2. Update the local storage so the rest of the app uses fresh data
    syncLocalSession(freshUser);
  } catch (err) {
    console.error("Failed to refresh user session on dashboard load", err);
  }

  const user = getCurrentUser();
  if (!user) {
    // Should be caught by requireLogin, but as a fallback
    window.location.href = "login.html";
    return;
  }

  // 2. Ensure dark mode is set for all roles that have a dashboard
  document.documentElement.classList.add("dark");

  // 3. Get or create a single <main> container for all dashboard content
  let main = document.getElementById("dashboardContent");
  if (!main) {
    main = document.createElement("main");
    document.body.appendChild(main);
  }

  // Wider responsive container for ALL roles (mobile/tablet unchanged)
  // - starts compact on small screens
  // - expands progressively at md, lg
  // - extra-wide at xl and 2xl only
  main.className = "px-4 pt-4 pb-28 mx-auto w-full max-w-4xl md:max-w-6xl lg:max-w-7xl xl:max-w-[1400px] 2xl:max-w-[1600px] dashboard-content pb-24";

  // 4. Show a loading message while data is being fetched
  main.innerHTML = `<p class="text-white/50 text-center py-16">Loading your dashboard...</p>`;

  // 5. Call the correct rendering function based on the user's role
  try {
    let dashboardHtml = "";
    switch (user.role) {
      case "Player":
        dashboardHtml = await renderPlayerDashboard();
        break;
      case "Coach":
        dashboardHtml = await renderCoachDashboard(); // ✨ FIX: Added await
        break;
      case "Admin":
        dashboardHtml = await renderAdminDashboard();
        break;
      case "Government Official":
        dashboardHtml = await renderGovDashboard();
        break;
      default:
        dashboardHtml = `<p class="text-red-400 text-center">Error: Unknown user role "${user.role}".</p>`;
    }
    // 6. Inject the final HTML into the main container
    main.innerHTML = dashboardHtml;
  } catch (error) {
    console.error("Failed to render dashboard:", error);
    main.innerHTML = `<p class="text-red-400 text-center">Could not load dashboard content. Please try again later.</p>`;
  }
});
