// js/myachieve.js
// My Achievements (API-first, localStorage-assisted banners)
// - Header/back/nav handled in HTML
// - Renders cards with status + actions (View Proof / Edit / Delete)
// - Banner: admin-published tournament banner → sport thumb → Unsplash
// - Proof viewer: images in overlay (white panel); PDFs open new tab
// - Delete disabled for APPROVED; Edit disabled for APPROVED (per request)

import { requireLogin } from "./core/auth.js";
import { loadData } from "./core/storage.js";
import API from "./api.js";

requireLogin();

let achievementsCache = []; // cache for modal operations

// DOM Elements
const listEl = document.getElementById("achievementList");

// Proof overlay (white panel)
const imgModal = document.getElementById("imgModal");
const imgModalClose = document.getElementById("imgModalClose");
const modalImg = document.getElementById("modalImg");
const imgModalBackdrop = document.getElementById("imgModalBackdrop");

// Edit/Delete modals (kept from page)
const editModal = document.getElementById("editModal");
const editModalClose = document.getElementById("editModalClose");
const editForm = document.getElementById("editForm");
const editTitle = document.getElementById("editTitle");
const editSport = document.getElementById("editSport");
const editDate = document.getElementById("editDate");
const editVenue = document.getElementById("editVenue");
const editDescription = document.getElementById("editDescription");
const editCancel = document.getElementById("editCancel");

const deleteModal = document.getElementById("deleteModal");
const deleteModalClose = document.getElementById("deleteModalClose");
const deleteCancel = document.getElementById("deleteCancel");
const deleteConfirm = document.getElementById("deleteConfirm");

let editingId = null;
let pendingDeleteId = null;

/* ---------- Render ---------- */
async function render() {
  try {
    const items = await API.getMyAchievements(); // backend list
    achievementsCache = Array.isArray(items) ? items : [];

    if (!achievementsCache.length) {
      listEl.innerHTML = emptyState();
      // wire CTA
      listEl.querySelector("#emptyUploadBtn")?.addEventListener("click", () => {
        window.location.href = "upload.html";
      });
      return;
    }

    const data = loadData() || {};
    const tournaments = Array.isArray(data.tournaments) ? data.tournaments : [];

    listEl.innerHTML = achievementsCache
      .map((a) => renderCard(a, tournaments))
      .join("");
  } catch (error) {
    console.error("Error fetching achievements:", error);
    listEl.innerHTML = `
      <div class="glassmorphic rounded-xl p-4 text-center">
        <p class="field-error">Could not load achievements. Please try again.</p>
        <div class="btn-group mt-3">
          <a class="btn-small" href="upload.html">+ Upload</a>
        </div>
      </div>`;
  }
}

/* ---------- Card Template ---------- */
function renderCard(a, tournaments) {
  const title = escapeHtml(a.title || "Achievement");
  const sport = String(a.sport || "").trim();
  const when = a.date ? new Date(a.date) : null;
  const dateStr = when ? escapeHtml(when.toLocaleDateString()) : "";
  const venue = a.venue ? ` • ${escapeHtml(a.venue)}` : "";
  const sportStr = sport ? ` • ${escapeHtml(sport)}` : "";

  const st = String(a.status || "PENDING").toUpperCase();
  const meta = statusMeta(st);

  // banner resolution
  const banner = resolveBannerForAchievement(a, tournaments);

  const canDelete = st !== "APPROVED";
  const canEdit = st !== "APPROVED";

  const deleteDisabledAttr = canDelete ? "" : "disabled";
  const deleteDisabledCls = canDelete ? "hover:bg-primary/20" : "text-white/40 cursor-not-allowed";

  const editDisabledAttr = canEdit ? "" : "disabled";
  const editDisabledCls = canEdit ? "hover:bg-primary/20" : "text-white/40 cursor-not-allowed";

  return `
    <div class="rounded-xl glassmorphic overflow-hidden">
      <div class="p-4 flex items-center gap-4">
        <div class="rounded-lg size-14 flex-shrink-0 bg-center bg-cover" style="background-image:url('${escapeAttr(banner)}')"></div>
        <div class="flex-grow min-w-0">
          <p class="font-bold text-lg truncate">${title}</p>
          <div class="flex items-center gap-2 mt-1">
            <span class="relative flex h-3 w-3">
              <span class="relative inline-flex rounded-full h-3 w-3 ${meta.dotCls}"></span>
            </span>
            <p class="${meta.textCls} text-sm font-semibold">${meta.label}</p>
          </div>
          <p class="text-sm text-white/70 mt-1 truncate">${dateStr}${sportStr}${venue}</p>
        </div>
      </div>

      <div class="bg-background-light/50 dark:bg-background-dark/50 grid grid-cols-3 divide-x divide-white/10">
        <button class="py-3 flex flex-col items-center justify-center gap-1 text-white hover:bg-primary/20 transition-colors"
                data-action="view" data-id="${escapeAttr(a.id)}">
          <span class="material-symbols-outlined">visibility</span>
          <span class="text-xs font-medium">View Proof</span>
        </button>

        <button class="py-3 flex flex-col items-center justify-center gap-1 ${editDisabledCls} transition-colors"
                data-action="edit" data-id="${escapeAttr(a.id)}" ${editDisabledAttr}>
          <span class="material-symbols-outlined">edit</span>
          <span class="text-xs font-medium">Edit</span>
        </button>

        <button class="py-3 flex flex-col items-center justify-center gap-1 ${deleteDisabledCls} transition-colors"
                data-action="delete" data-id="${escapeAttr(a.id)}" ${deleteDisabledAttr}>
          <span class="material-symbols-outlined">delete</span>
          <span class="text-xs font-medium">Delete</span>
        </button>
      </div>
    </div>
  `;
}

/* ---------- Status Styling ---------- */
function statusMeta(s) {
  switch (s) {
    case "APPROVED":
      return { label: "APPROVED", dotCls: "bg-teal-400", textCls: "text-teal-400" };
    case "REJECTED":
      return { label: "REJECTED", dotCls: "bg-red-500", textCls: "text-red-400" };
    case "PENDING":
    default:
      return { label: "PENDING", dotCls: "bg-yellow-500", textCls: "text-yellow-400" };
  }
}

/* ---------- Banner Resolver ---------- */
function resolveBannerForAchievement(a, tournaments) {
  const name = String(a.title || "").trim();
  const sport = String(a.sport || "").trim();
  const when = a.date ? new Date(a.date) : null;
  const pubs = (tournaments || []).filter((t) => t && t.status === "PUBLISHED");

  // A) exact case-insensitive name match
  const byName = pubs.filter((t) => canon(t.name) === canon(name));
  if (byName.length) {
    // B) prefer one where achievement date is in tournament range
    if (when) {
      const inRange = byName.find((t) => inTournamentRange(when, t));
      if (inRange) {
        const b = inRange.media?.banner || inRange.banner;
        if (b) return b;
      }
    }
    // C) same name + sport
    const sameSport = byName.find((t) => canon(t.sport) === canon(sport));
    if (sameSport) {
      const b = sameSport.media?.banner || sameSport.banner;
      if (b) return b;
    }
    // name matched but no banner → fallback to sport thumb
    return sportThumb(sport);
  }

  // No name match → fallback sport
  return sportThumb(sport);
}

function inTournamentRange(d, t) {
  try {
    const start = t.startDateTime ? new Date(t.startDateTime) : null;
    const end = t.endDateTime ? new Date(t.endDateTime) : null;
    if (!start || !end) return false;
    return d >= start && d <= end;
  } catch {
    return false;
  }
}

/* ---------- Sport Thumb Fallback ---------- */
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
  return String(s || "").trim().toLowerCase();
}

function sportSlug(sport = "") {
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

function sportThumb(sport) {
  const slug = sportSlug(sport);
  // Prefer local asset; if not present, browser will still request it — can extend to try jpg if needed
  return `img/sports/thumb/${slug}.webp`;
}

/* ---------- Empty State ---------- */
function emptyState() {
  return `
    <div class="flex flex-col items-center justify-center text-center py-12">
      <div class="relative w-64 h-64 mb-8">
        <div class="absolute inset-0 bg-primary/20 rounded-full animate-ping"></div>
        <div class="relative flex items-center justify-center w-full h-full glassmorphic rounded-full border-2 border-primary/30">
          <span class="material-symbols-outlined text-primary/60" style="font-size:80px">military_tech</span>
        </div>
      </div>
      <h2 class="text-2xl font-bold mb-2">Your Trophy Case is Empty</h2>
      <p class="text-white/60 max-w-xs mb-8">It looks like you haven't uploaded any achievements yet. Let's change that!</p>
      <button id="emptyUploadBtn" class="bg-primary text-white font-bold py-3 px-6 rounded-full shadow hover:scale-105 transition duration-200">
        Upload Your First Achievement!
      </button>
    </div>
  `;
}

/* ---------- Event Delegation for List ---------- */
listEl.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const id = btn.dataset.id;
  const action = btn.dataset.action;
  if (!id || !action) return;

  if (action === "view") {
    const ach = achievementsCache.find((x) => x.id === id);
    if (ach?.proof) {
      const p = String(ach.proof);
      const isPdf =
        p.startsWith("data:application/pdf") ||
        p.toLowerCase().endsWith(".pdf");
      if (isPdf) {
        window.open(p, "_blank", "noopener,noreferrer");
      } else {
        modalImg.src = p;
        imgModal.classList.remove("hidden");
      }
    }
  } else if (action === "delete") {
    if (btn.hasAttribute("disabled")) return; // disabled for APPROVED
    pendingDeleteId = id;
    openModal(deleteModal);
  } else if (action === "edit") {
    if (btn.hasAttribute("disabled")) return; // disabled for APPROVED
    openEdit(id);
  }
});

/* ---------- Proof overlay close ---------- */
imgModalClose?.addEventListener("click", () => imgModal.classList.add("hidden"));
imgModalBackdrop?.addEventListener("click", () => imgModal.classList.add("hidden"));

/* ---------- Delete Modal ---------- */
deleteModalClose?.addEventListener("click", () => closeModal(deleteModal));
deleteCancel?.addEventListener("click", () => closeModal(deleteModal));
deleteModal?.addEventListener("click", (e) => {
  if (e.target === deleteModal) closeModal(deleteModal);
});
deleteConfirm?.addEventListener("click", async () => {
  if (!pendingDeleteId) return;
  try {
    await API.deleteAchievement(pendingDeleteId);
    pendingDeleteId = null;
    closeModal(deleteModal);
    render();
  } catch (error) {
    alert(`Error deleting: ${error.message}`);
  }
});

/* ---------- Edit Modal ---------- */
editModalClose?.addEventListener("click", () => closeModal(editModal));
editCancel?.addEventListener("click", () => closeModal(editModal));
editModal?.addEventListener("click", (e) => {
  if (e.target === editModal) closeModal(editModal);
});
editForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!editingId) return;
  const payload = {
    title: editTitle.value.trim(),
    sport: editSport.value.trim(),
    date: editDate.value,
    venue: editVenue.value.trim(),
    description: editDescription.value.trim(),
  };

  if (!payload.title || !payload.sport || !payload.date || !payload.venue) {
    alert("Please fill Title, Sport, Date, and Venue.");
    return;
  }

  try {
    await API.updateAchievement(editingId, payload);
    closeModal(editModal);
    render();
  } catch (error) {
    alert(`Error updating: ${error.message}`);
  }
});

function openEdit(id) {
  const ach = achievementsCache.find((x) => x.id === id);
  if (!ach) return;
  // Guard against APPROVED (should be disabled in UI as well)
  if (String(ach.status || "").toUpperCase() === "APPROVED") return;

  editingId = id;

  editTitle.value = ach.title || "";
  editSport.value = ach.sport || "";
  editDate.value = ach.date ? new Date(ach.date).toISOString().split("T")[0] : "";
  editVenue.value = ach.venue || "";
  editDescription.value = ach.description || "";

  openModal(editModal);
}

/* ---------- Modal Helpers ---------- */
function openModal(modal) {
  modal.classList.remove("hidden");
}
function closeModal(modal) {
  modal.classList.add("hidden");
}

/* ---------- Utilities ---------- */
function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function escapeAttr(str) {
  return String(str).replace(/"/g, "&quot;");
}

/* ---------- Init ---------- */
render();