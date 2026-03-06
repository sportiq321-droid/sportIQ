// public/js/assessments/home.js
import { requireLogin } from "../core/auth.js";

document.addEventListener("DOMContentLoaded", () => {
  requireLogin();

  // Ensure dark class in case nav.js didn't run yet
  document.documentElement.classList.add("dark");

  const CONSENT_KEY = "assessConsentAccepted";
  const banner = document.getElementById("consentBanner");
  const acceptBtn = document.getElementById("consentAccept");

  try {
    const accepted = localStorage.getItem(CONSENT_KEY) === "1";
    if (!accepted && banner) banner.classList.remove("hidden");
    if (acceptBtn) {
      acceptBtn.addEventListener("click", (e) => {
        e.preventDefault();
        localStorage.setItem(CONSENT_KEY, "1");
        banner?.classList.add("hidden");
      });
    }
  } catch {
    // ignore storage errors
  }
});
