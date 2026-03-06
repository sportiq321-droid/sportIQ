// js/notify-dot.js
// Shows a small red dot on any element with [data-notify-bell]
// when the player has at least one tournament with reminder=true.

import { getCurrentUser } from "./modules/users.js";

function ensureStyle() {
  if (document.getElementById("notify-dot-style")) return;
  const style = document.createElement("style");
  style.id = "notify-dot-style";
  style.textContent = `
    .notify-bell-dot {
      position: absolute;
      top: 2px;
      right: 2px;
      width: 9px;
      height: 9px;
      border-radius: 9999px;
      background: #ef4444; /* red */
      box-shadow: 0 0 0 2px rgba(15,19,35,0.85); /* dark halo */
      pointer-events: none;
    }
  `;
  document.head.appendChild(style);
}

function countReminders() {
  try {
    const u = getCurrentUser();
    if (!u || !Array.isArray(u.registeredTournaments)) return 0;
    return u.registeredTournaments.filter((r) => !!r.reminder).length;
  } catch {
    return 0;
  }
}

export function updateNotifyDots() {
  ensureStyle();
  const count = countReminders();
  document.querySelectorAll("[data-notify-bell]").forEach((el) => {
    el.classList.add("relative");
    let dot = el.querySelector(".notify-bell-dot");
    if (count > 0) {
      if (!dot) {
        dot = document.createElement("span");
        dot.className = "notify-bell-dot";
        el.appendChild(dot);
      }
    } else if (dot) {
      dot.remove();
    }
  });
}

// Initial render after DOM ready
document.addEventListener("DOMContentLoaded", updateNotifyDots);

// Update dots when localStorage changes (e.g., reminder toggled elsewhere)
window.addEventListener("storage", (e) => {
  if (e.key === "sportiqData") updateNotifyDots();
});
