// js/coachVerify.js
// Coach achievement verification controller (API-based)
// Fetches pending achievements, displays cards, handles modal review (approve/reject)

import { requireLogin } from "./core/auth.js";
import { getCurrentUser } from "./modules/users.js";
import API from "/js/api.js"; // Absolute path for CodeSandbox

document.addEventListener("DOMContentLoaded", () => {
  requireLogin();
  init();
});

async function init() {
  // Guard: Coach-only
  const user = getCurrentUser();
  if (!user || user.role !== "Coach") {
    alert("Access denied. Coach role required.");
    window.location.href = "dashboard.html";
    return;
  }

  document.documentElement.classList.add("dark");

  // Modern DOM refs
  const loadingState = byId("loadingState");
  const emptyState = byId("emptyState");
  const cardsContainer = byId("cardsContainer");
  const pendingCount = byId("pendingCount");

  const modal = byId("achievementModal");
  const modalOverlay = byId("modalOverlay");
  const modalClose = byId("modalClose");

  const modalAvatar = byId("modalAvatar");
  const modalTitle = byId("modalTitle");
  const modalSport = byId("modalSport");
  const modalAchTitle = byId("modalAchTitle");
  const modalDate = byId("modalDate");
  const modalVenue = byId("modalVenue");
  const modalDescription = byId("modalDescription");
  const modalProofContainer = byId("modalProofContainer");
  const modalProofContent = byId("modalProofContent");

  const approveBtn = byId("approveBtn");
  const rejectBtn = byId("rejectBtn");
  const actionButtons = byId("actionButtons");
  const rejectReasonContainer = byId("rejectReasonContainer");
  const rejectReason = byId("rejectReason");
  const rejectReasonError = byId("rejectReasonError");
  const cancelRejectBtn = byId("cancelRejectBtn");
  const submitRejectBtn = byId("submitRejectBtn");
  const submitRejectContainer = byId("submitRejectContainer");
  const modalError = byId("modalError");

  let currentAchievement = null;

  // Fetch and render
  await loadPending();

  async function loadPending() {
    try {
      loadingState?.classList.remove("hidden");
      emptyState?.classList.add("hidden");
      cardsContainer?.classList.add("hidden");
      if (cardsContainer) cardsContainer.innerHTML = "";

      const data = await API.getPendingAchievements();
      const items = Array.isArray(data?.items)
        ? data.items
        : Array.isArray(data)
        ? data
        : [];

      loadingState?.classList.add("hidden");

      if (pendingCount) pendingCount.textContent = String(items.length);

      if (!items.length) {
        emptyState?.classList.remove("hidden");
        return;
      }

      cardsContainer?.classList.remove("hidden");

      items.forEach((item, idx) => {
        const card = renderCard(item, idx === 0);
        if (cardsContainer) cardsContainer.appendChild(card);
      });
    } catch (e) {
      loadingState?.classList.add("hidden");
      emptyState?.classList.remove("hidden");
      console.error("LOAD_PENDING_ERROR", e);
    }
  }

  function renderCard(item, glow = false) {
    const wrap = document.createElement("div");
    wrap.className = `glassmorphic rounded-xl p-4 flex items-center gap-4 cursor-pointer hover:bg-white/10 transition-colors ${
      glow ? "glow" : ""
    }`;
    wrap.dataset.id = item.id;

    const playerName = item.owner?.name || item.owner?.username || "Unknown";
    const avatarUrl = item.owner?.profilePic || "img/defaultavatar.jpg";
    const achievementTitle = item.title || "Achievement";
    const sport = item.sport || "—";
    const submittedDate = formatDate(item.createdAt);

    wrap.innerHTML = `
      <img 
        alt="${playerName}" 
        class="size-12 rounded-full border-2 ${
          glow ? "border-primary/50" : "border-white/20"
        }" 
        src="${escapeHtml(avatarUrl)}"
      />
      <div class="flex-grow min-w-0">
        <p class="font-bold text-white truncate">${escapeHtml(playerName)}</p>
        <p class="text-sm text-gray-300 truncate">${escapeHtml(
          achievementTitle
        )}</p>
        <p class="text-xs text-gray-400">${escapeHtml(
          sport
        )} • ${submittedDate}</p>
      </div>
      <button 
        class="flex items-center justify-center size-10 rounded-full ${
          glow ? "bg-primary/20 text-primary" : "bg-white/10 text-white/70"
        } hover:bg-primary/30 transition-colors shrink-0"
        aria-label="View details"
      >
        <span class="material-symbols-outlined">visibility</span>
      </button>
    `;

    wrap.addEventListener("click", () => openModal(item));
    return wrap;
  }

  function openModal(item) {
    if (!modal) return;
    currentAchievement = item;

    const playerName = item.owner?.name || item.owner?.username || "Unknown";
    const avatarUrl = item.owner?.profilePic || "img/defaultavatar.jpg";
    const playerSport = item.owner?.sport || "—";

    if (modalAvatar) modalAvatar.src = avatarUrl;
    if (modalTitle) modalTitle.textContent = playerName;
    if (modalSport) modalSport.textContent = playerSport;
    if (modalAchTitle) modalAchTitle.textContent = item.title || "—";
    if (modalDate) modalDate.textContent = formatDate(item.date);
    if (modalVenue) modalVenue.textContent = item.venue || "—";
    if (modalDescription)
      modalDescription.textContent =
        item.description || "No description provided";

    // Handle proof
    if (item.proof && modalProofContainer && modalProofContent) {
      modalProofContainer.classList.remove("hidden");
      const proofUrl = String(item.proof);

      if (
        proofUrl.includes("pdf") ||
        proofUrl.startsWith("data:application/pdf")
      ) {
        modalProofContent.innerHTML = `
          <button 
            onclick="window.open('${escapeHtml(proofUrl)}', '_blank')"
            class="w-full py-3 bg-primary/20 text-primary hover:bg-primary/30 transition-colors rounded-lg font-semibold"
          >
            <span class="flex items-center justify-center gap-2">
              <span class="material-symbols-outlined">picture_as_pdf</span>
              View PDF Proof
            </span>
          </button>
        `;
      } else {
        modalProofContent.innerHTML = `
          <img 
            src="${escapeHtml(proofUrl)}" 
            alt="Achievement proof" 
            class="w-full h-auto rounded-lg"
          />
        `;
      }
    } else if (modalProofContainer) {
      modalProofContainer.classList.add("hidden");
    }

    // Reset UI
    if (actionButtons) actionButtons.classList.remove("hidden");
    if (rejectReasonContainer) rejectReasonContainer.classList.add("hidden");
    if (submitRejectContainer) submitRejectContainer.classList.add("hidden");
    if (rejectReason) rejectReason.value = "";
    if (rejectReasonError) rejectReasonError.classList.add("hidden");
    if (modalError) modalError.classList.add("hidden");

    modal.classList.remove("hidden");
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.add("hidden");
    currentAchievement = null;
  }

  // Event listeners with optional chaining
  if (modalClose) modalClose.addEventListener("click", closeModal);
  if (modalOverlay) modalOverlay.addEventListener("click", closeModal);

  // Approve
  if (approveBtn) {
    approveBtn.addEventListener("click", async () => {
      if (!currentAchievement) return;
      try {
        approveBtn.disabled = true;
        approveBtn.textContent = "Approving...";

        await API.verifyAchievement(currentAchievement.id, {
          decision: "APPROVED",
        });

        closeModal();
        alert("Achievement approved successfully!");
        await loadPending();
      } catch (e) {
        showModalError(e?.message || "Failed to approve. Please try again.");
      } finally {
        approveBtn.disabled = false;
        approveBtn.innerHTML = `
          <span class="flex items-center justify-center gap-2">
            <span class="material-symbols-outlined text-lg">check_circle</span>
            Approve
          </span>
        `;
      }
    });
  }

  // Reject (show reason form)
  if (rejectBtn) {
    rejectBtn.addEventListener("click", () => {
      if (actionButtons) actionButtons.classList.add("hidden");
      if (rejectReasonContainer)
        rejectReasonContainer.classList.remove("hidden");
      if (submitRejectContainer)
        submitRejectContainer.classList.remove("hidden");
      if (rejectReason) rejectReason.focus();
    });
  }

  // Cancel reject
  if (cancelRejectBtn) {
    cancelRejectBtn.addEventListener("click", () => {
      if (actionButtons) actionButtons.classList.remove("hidden");
      if (rejectReasonContainer) rejectReasonContainer.classList.add("hidden");
      if (submitRejectContainer) submitRejectContainer.classList.add("hidden");
      if (rejectReason) rejectReason.value = "";
      if (rejectReasonError) rejectReasonError.classList.add("hidden");
    });
  }

  // Submit reject
  if (submitRejectBtn) {
    submitRejectBtn.addEventListener("click", async () => {
      if (!currentAchievement) return;

      const reason = rejectReason?.value.trim() || "";
      if (!reason) {
        if (rejectReasonError) rejectReasonError.classList.remove("hidden");
        if (rejectReason) rejectReason.focus();
        return;
      }

      if (rejectReasonError) rejectReasonError.classList.add("hidden");

      try {
        if (submitRejectBtn) {
          submitRejectBtn.disabled = true;
          submitRejectBtn.textContent = "Submitting...";
        }

        await API.verifyAchievement(currentAchievement.id, {
          decision: "REJECTED",
          reason,
        });

        closeModal();
        alert("Achievement rejected.");
        await loadPending();
      } catch (e) {
        showModalError(e?.message || "Failed to reject. Please try again.");
      } finally {
        if (submitRejectBtn) {
          submitRejectBtn.disabled = false;
          submitRejectBtn.textContent = "Submit Rejection";
        }
      }
    });
  }

  function showModalError(msg) {
    if (modalError) {
      modalError.textContent = msg;
      modalError.classList.remove("hidden");
    }
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = String(str || "");
    return div.innerHTML;
  }

  function formatDate(iso) {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return "—";
    }
  }
}
