// js/mytournaments.js
// My Tournaments page controller (UI-only):
// - Filters: All | Pending | Confirmed | Rejected
// - Reminder toggle per tournament (persists via toggleReminder)
// - Inline details overlay (Step 3-like) on card click; Back returns to list
// - Bell dot updates when reminders change
// - Overlay animates (fade/slide) and locks scroll during view

import { requireLogin } from "./core/auth.js";
import { getCurrentUser } from "./modules/users.js";
import { listMyTournaments, toggleReminder } from "./modules/tournaments.js";
import { updateNotifyDots } from "./notify-dot.js";

requireLogin();
const user = getCurrentUser();
if (!user || user.role !== "Player") {
  window.location.href = "dashboard.html";
}

const listEl = document.getElementById("myTournamentsList");

// Filters UI state
let activeFilter = "ALL";

// Wire filter chips
document.querySelectorAll(".flt-chip").forEach((btn) => {
  btn.addEventListener("click", () => {
    activeFilter = String(
      btn.getAttribute("data-filter") || "ALL"
    ).toUpperCase();
    setActiveChip(activeFilter);
    render();
  });
});

// Default chip styling on load
setActiveChip(activeFilter);

// Overlay refs (inline details)
const overlay = document.getElementById("mtOverlay");
const overlayBg = document.getElementById("mtOverlayBg");
const overlayPanel = document.getElementById("mtOverlayPanel");
const btnClose = document.getElementById("mtClose");

// Render list
function render() {
  const all = listMyTournaments();
  const filtered = all.filter((t) => {
    const s = normalizeStatus(t.regStatus);
    return activeFilter === "ALL" ? true : s === activeFilter;
  });

  if (!filtered.length) {
    listEl.innerHTML = `
      <div class="glassmorphic rounded-xl p-4 text-center text-white/80">
        No tournaments in this filter.
        <div class="btn-group mt-3">
          <a class="btn-small" href="find-tournament.html">+ Find Tournaments</a>
        </div>
      </div>`;
    return;
  }

  listEl.innerHTML = filtered
    .map((t, idx) => {
      const status = normalizeStatus(t.regStatus);
      const badge = badgeMeta(status);

      const toggleId = `rem-${idx}-${sanitizeId(t.id)}`;
      const sport = t.sport || "";
      const thumb = thumbUrlForSport(sport);

      return `
        <div class="mt-card flex items-center gap-4 rounded-xl bg-background-light/50 dark:bg-white/5 p-4 shadow-sm cursor-pointer"
             data-id="${escapeAttr(t.id)}">
          <div class="bg-center bg-no-repeat aspect-square bg-cover rounded-lg size-14"
               style="background-image:url('${thumb}')"></div>
          <div class="flex-grow min-w-0">
            <p class="font-bold text-gray-900 dark:text-white truncate">${escapeHtml(
              t.name || "Tournament"
            )}</p>
            <span class="inline-flex items-center rounded-full ${
              badge.cls
            } px-2.5 py-0.5 text-xs font-semibold">${badge.label}</span>
          </div>
          <div class="shrink-0" onclick="event.stopPropagation()">
            <label class="relative inline-flex cursor-pointer items-center">
              <input class="peer sr-only reminder-toggle" type="checkbox"
                     id="${toggleId}" data-id="${escapeAttr(t.id)}" ${
        t.reminder ? "checked" : ""
      }/>
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

  // Toggle handlers (persist + update bell dot)
  listEl.querySelectorAll(".reminder-toggle").forEach((inp) => {
    inp.addEventListener("change", (e) => {
      const id = e.currentTarget.getAttribute("data-id");
      toggleReminder(id); // persists localStorage
      updateNotifyDots(); // refresh header bell dot
      if (activeFilter !== "ALL") render(); // re-render if filter removes item
    });
  });

  // Card click → open inline details overlay
  listEl.querySelectorAll(".mt-card").forEach((card) => {
    card.addEventListener("click", () => {
      const id = card.getAttribute("data-id");
      const item = filtered.find((x) => x.id === id);
      if (item) openDetails(item);
    });
  });
}

/* Inline Details (overlay, animated) */
function openDetails(t) {
  // Fill fields from snapshot
  setText("mtName", t.name || "-");
  setText("mtDate", t.date || "-");
  setText("mtVenue", t.venue || "-");
  setText("mtSport", t.sport || "-");
  setText("mtDesc", t.description || "");

  const bannerEl = document.getElementById("mtBanner");
  if (bannerEl) {
    bannerEl.style.backgroundImage = `url('${thumbUrlForSport(t.sport)}')`;
  }

  // Show overlay above nav + lock page scroll
  overlay.classList.remove("hidden");
  document.documentElement.style.overflow = "hidden";
  document.body.style.overflow = "hidden";

  // Ensure initial hidden state for animation
  overlayBg?.classList.add("opacity-0");
  overlayPanel?.classList.add("opacity-0", "translate-y-3");
  overlayPanel?.classList.remove("opacity-100", "translate-y-0");

  // Next frame → animate in (fade backdrop + slide/fade panel)
  requestAnimationFrame(() => {
    overlayBg?.classList.remove("opacity-0");
    overlayPanel?.classList.remove("opacity-0", "translate-y-3");
    overlayPanel?.classList.add("opacity-100", "translate-y-0");
  });
}

function closeDetails() {
  // Animate out
  overlayBg?.classList.add("opacity-0");
  overlayPanel?.classList.add("opacity-0", "translate-y-3");
  overlayPanel?.classList.remove("opacity-100", "translate-y-0");

  // After transition, hide and restore scroll
  setTimeout(() => {
    overlay.classList.add("hidden");
    document.documentElement.style.overflow = "";
    document.body.style.overflow = "";
  }, 220); // matches Tailwind duration-200 with small buffer
}

btnClose?.addEventListener("click", closeDetails);
overlayBg?.addEventListener("click", closeDetails);

/* ---------- Helpers ---------- */
function setActiveChip(val) {
  document.querySelectorAll(".flt-chip").forEach((b) => {
    const isActive =
      String(b.getAttribute("data-filter") || "").toUpperCase() === val;
    b.classList.toggle("bg-primary", isActive);
    b.classList.toggle("text-white", isActive);
    b.classList.toggle("shadow-lg", isActive);
    b.classList.toggle("shadow-primary/20", isActive);
    b.classList.toggle("bg-primary/10", !isActive);
    b.classList.toggle("dark:bg-primary/20", !isActive);
    b.classList.toggle("text-primary", !isActive);
  });
}

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

// Local sport thumb or Unsplash fallback
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
  // Prefer webp; your find flow already handles jpg fallback if needed
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
function setText(id, v) {
  const el = document.getElementById(id);
  if (el) el.textContent = v;
}

// Initial render
render();