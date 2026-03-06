// js/dashboard.js
// This file is now a "router" that dynamically builds the dashboard UI based on the user's role.

import { requireLogin } from "./core/auth.js";
import { getCurrentUser } from "./modules/users.js";
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
  const user = getCurrentUser();
  if (!user) {
    // Should be caught by requireLogin, but as a fallback
    window.location.href = "login.html";
    return;
  }

  // 2. Ensure dark mode is set for all roles that have a dashboard
  document.documentElement.classList.add("dark");

  // 3. Create a single <main> container for all dashboard content
  const main = document.createElement("main");

  // Wider responsive container for ALL roles (mobile/tablet unchanged)
  // - starts compact on small screens
  // - expands progressively at md, lg
  // - extra-wide at xl and 2xl only
  main.className =
    "px-4 pt-4 pb-28 mx-auto w-full max-w-4xl md:max-w-6xl lg:max-w-7xl xl:max-w-[1400px] 2xl:max-w-[1600px]";

  document.body.appendChild(main);

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
