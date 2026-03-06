import { requireLogin } from "./core/auth.js";
import { getCurrentUser } from "./modules/users.js";

document.addEventListener("DOMContentLoaded", () => {
  // Session + role guard
  requireLogin();
  const official = getCurrentUser();
  if (!official || official.role !== "Government Official") {
    window.location.href = "dashboard.html";
    return;
  }

  // Back button → dashboard
  document.getElementById("backBtn")?.addEventListener("click", () => {
    window.location.href = "dashboard.html";
  });

  // This page is now informational only.
  // No verification list/actions are rendered anymore.
});
