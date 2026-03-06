// js/notifications.js
// Notifications page controller (UI-only):
// - Lists only tournaments with reminder=true (from user.registeredTournaments snapshot)
// - Shows name, short date, venue, sport, and regStatus badge
// - Allows toggling reminder OFF directly here (removes the item)
// - Updates header bell dots via notify-dot.js
// - No backend or business-logic changes

import { requireLogin } from "./core/auth.js";
import { getCurrentUser } from "./modules/users.js";
import { toggleReminder } from "./modules/tournaments.js";
import { updateNotifyDots } from "./notify-dot.js";

requireLogin();

const listEl = document.getElementById("notifList");

function render() {
  const u = getCurrentUser();
  const reminders = (u?.registeredTournaments || []).filter(
    (r) => !!r.reminder
  );

  if (!reminders.length) {
    listEl.innerHTML = `
      <div class="glassmorphic rounded-xl p-4 text-center text-white/80">
        No notifications yet.
        <div class="btn-group mt-3">
          <a class="btn-small" href="mytournaments.html">Manage reminders</a>
        </div>
      </div>`;
    return;
  }

  listEl.innerHTML = reminders
    .map((t, idx) => {
      const status = normalizeStatus(t.regStatus);
      const badge = badgeMeta(status);
      const toggleId = `notif-${idx}-${sanitizeId(t.id)}`;
      const thumb = thumbUrlForSport(t.sport || "");

      return `
        <div class="flex items-center gap-4 rounded-xl bg-background-light/50 dark:bg-white/5 p-4 shadow-sm">
          <div class="bg-center bg-no-repeat aspect-square bg-cover rounded-lg size-14"
               style="background-image:url('${thumb}')"></div>
          <div class="flex-grow min-w-0">
            <p class="font-bold text-gray-900 dark:text-white truncate">${escapeHtml(
              t.name || "Tournament"
            )}</p>
            <p class="text-xs text-white/70 truncate">
              ${escapeHtml(t.date || "-")} • ${escapeHtml(
        t.venue || "-"
      )} • ${escapeHtml(t.sport || "-")}
            </p>
            <span class="inline-flex items-center rounded-full ${
              badge.cls
            } px-2.5 py-0.5 text-xs font-semibold mt-1">${badge.label}</span>
          </div>
          <div class="shrink-0">
            <label class="relative inline-flex cursor-pointer items-center">
              <input class="peer sr-only notif-toggle" type="checkbox"
                     id="${toggleId}" data-id="${escapeAttr(t.id)}" checked/>
              <div class="peer h-6 w-11 rounded-full bg-gray-200 dark:bg-gray-700 peer-checked:bg-primary"></div>
              <div class="absolute left-[2px] top-[2px] h-5 w-5 rounded-full bg-white transition-all peer-checked:translate-x-full dark:bg-gray-300"></div>
              <span class="material-symbols-outlined text-sm absolute left-1.5 top-1.5 text-gray-500 dark:text-gray-800 transition-opacity peer-checked:opacity-0">notifications_off</span>
              <span class="material-symbols-outlined text-sm absolute right-1.5 top-1.5 text-white transition-opacity opacity-0 peer-checked:opacity-100">notifications_active</span>
            </label>
          </div>
        </div>
      `;
    })
    .join("");

  // Toggle OFF handler: removes from reminders and updates bell dot
  listEl.querySelectorAll(".notif-toggle").forEach((inp) => {
    inp.addEventListener("change", (e) => {
      const id = e.currentTarget.getAttribute("data-id");
      toggleReminder(id); // persists localStorage
      updateNotifyDots(); // refresh header dots on other pages
      render(); // re-render list to reflect removal
    });
  });
}

/* ---------- Helpers ---------- */
function normalizeStatus(s) {
  const v = String(s || "CONFIRMED").toUpperCase();
  return v === "PENDING" || v === "REJECTED" || v === "CONFIRMED"
    ? v
    : "CONFIRMED";
}
function badgeMeta(s) {
  switch (s) {
    case "PENDING":
      return { label: "PENDING", cls: "bg-yellow-500/20 text-yellow-500" };
    case "REJECTED":
      return { label: "REJECTED", cls: "bg-red-500/20 text-red-500" };
    case "CONFIRMED":
    default:
      return { label: "CONFIRMED", cls: "bg-green-500/20 text-green-500" };
  }
}

const SPORT_SLUGS = {
  cricket: ["cricket"],
  football: ["football", "soccer"],
  volleyball: ["volleyball"],
  kabaddi: ["kabaddi"],
  badminton: ["badminton"],
  basketball: ["basketball"],
  hockey: ["hockey", "field hockey"],
  tennis: ["tennis"],
  athletics: ["athletics", "track and field", "track", "running"],
  swimming: ["swimming", "swim"],
};

function canon(s) {
  return String(s || "")
    .trim()
    .toLowerCase();
}
function sportSlug(sport) {
  const s = canon(sport);
  if (!s) return "sports";
  for (const [slug, list] of Object.entries(SPORT_SLUGS)) {
    if (list.some((alias) => s === alias)) return slug;
  }
  for (const [slug, list] of Object.entries(SPORT_SLUGS)) {
    if (list.some((alias) => s.includes(alias))) return slug;
  }
  return "sports";
}
function thumbUrlForSport(sport) {
  const slug = sportSlug(sport);
  return `img/sports/thumb/${slug}.webp`;
}

function sanitizeId(s = "") {
  return String(s).replace(/[^a-zA-Z0-9_-]/g, "");
}
function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function escapeAttr(str = "") {
  return String(str).replace(/"/g, "&quot;");
}

render();