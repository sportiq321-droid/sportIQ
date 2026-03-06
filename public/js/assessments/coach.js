// public/js/assessments/coach.js
// Coach assessment review controller
// Fetches pending assessments, displays cards, handles modal review (approve/reject)

import { requireLogin } from "../core/auth.js";
import { getCurrentUser } from "../modules/users.js";
import API from "../api.js";

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

  // DOM refs
  const loadingState = byId("loadingState");
  const emptyState = byId("emptyState");
  const cardsContainer = byId("cardsContainer");
  const pendingCount = byId("pendingCount");

  const modal = byId("assessModal");
  const modalOverlay = byId("modalOverlay");
  const modalClose = byId("modalClose");

  const modalAvatar = byId("modalAvatar");
  const modalTitle = byId("modalTitle");
  const modalSport = byId("modalSport");
  const modalDrill = byId("modalDrill");
  const modalScore = byId("modalScore");
  const modalDate = byId("modalDate");
  const modalMetrics = byId("modalMetrics");
  const modalVideoContainer = byId("modalVideoContainer");
  const modalVideo = byId("modalVideo");

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

  let currentAssessment = null;

  // Fetch and render
  await loadPending();

  async function loadPending() {
    try {
      loadingState?.classList.remove("hidden");
      emptyState?.classList.add("hidden");
      cardsContainer.classList.add("hidden");
      cardsContainer.innerHTML = "";

      const data = await API.getPendingAssessments();
      const items = Array.isArray(data?.items) ? data.items : [];

      loadingState?.classList.add("hidden");

      if (pendingCount) pendingCount.textContent = String(items.length);

      if (!items.length) {
        emptyState?.classList.remove("hidden");
        return;
      }

      cardsContainer.classList.remove("hidden");

      items.forEach((item, idx) => {
        const card = renderCard(item, idx === 0); // glow on first
        cardsContainer.appendChild(card);
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

    const playerName = item.user?.name || item.user?.username || "Unknown";
    const avatarUrl =
      item.user?.profilePic || "img/defaultavatar.jpg";
    const drillLabel = formatDrill(item.drill);
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
        <p class="text-sm text-gray-300 truncate">${drillLabel}</p>
        <p class="text-xs text-gray-400">Submitted: ${submittedDate}</p>
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
    currentAssessment = item;

    const playerName = item.user?.name || item.user?.username || "Unknown";
    const avatarUrl = item.user?.profilePic || "img/defaultavatar.jpg";
    const playerSport = item.user?.sport || "—";
    const drillLabel = formatDrill(item.drill);
    const scoreText = formatScore(item);
    const submittedDate = formatDate(item.createdAt);

    modalAvatar.src = avatarUrl;
    modalTitle.textContent = playerName;
    modalSport.textContent = playerSport;
    modalDrill.textContent = drillLabel;
    modalScore.textContent = scoreText;
    modalDate.textContent = submittedDate;

    // Render metrics
    modalMetrics.innerHTML = renderMetrics(item);

    // Video
    if (item.mediaUrl) {
      modalVideoContainer.classList.remove("hidden");
      const sources = modalVideo.querySelectorAll("source");
      sources.forEach((s) => (s.src = item.mediaUrl));
      modalVideo.load();
    } else {
      modalVideoContainer.classList.add("hidden");
    }

    // Reset UI
    actionButtons.classList.remove("hidden");
    rejectReasonContainer.classList.add("hidden");
    submitRejectContainer.classList.add("hidden");
    rejectReason.value = "";
    rejectReasonError.classList.add("hidden");
    modalError.classList.add("hidden");

    modal.classList.remove("hidden");
  }

  function closeModal() {
    modal.classList.add("hidden");
    currentAssessment = null;
    // Pause video if playing
    if (modalVideo) {
      modalVideo.pause();
      modalVideo.currentTime = 0;
    }
  }

  modalClose?.addEventListener("click", closeModal);
  modalOverlay?.addEventListener("click", closeModal);

  // Approve
  approveBtn?.addEventListener("click", async () => {
    if (!currentAssessment) return;
    try {
      approveBtn.disabled = true;
      approveBtn.textContent = "Approving...";

      await API.reviewAssessment(currentAssessment.id, {
        decision: "APPROVED",
      });

      closeModal();
      alert("Assessment approved successfully!");
      await loadPending(); // refresh list
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

  // Reject (show reason form)
  rejectBtn?.addEventListener("click", () => {
    actionButtons.classList.add("hidden");
    rejectReasonContainer.classList.remove("hidden");
    submitRejectContainer.classList.remove("hidden");
    rejectReason.focus();
  });

  // Cancel reject
  cancelRejectBtn?.addEventListener("click", () => {
    actionButtons.classList.remove("hidden");
    rejectReasonContainer.classList.add("hidden");
    submitRejectContainer.classList.add("hidden");
    rejectReason.value = "";
    rejectReasonError.classList.add("hidden");
  });

  // Submit reject
  submitRejectBtn?.addEventListener("click", async () => {
    if (!currentAssessment) return;

    const reason = rejectReason.value.trim();
    if (!reason) {
      rejectReasonError.classList.remove("hidden");
      rejectReason.focus();
      return;
    }

    rejectReasonError.classList.add("hidden");

    try {
      submitRejectBtn.disabled = true;
      submitRejectBtn.textContent = "Submitting...";

      await API.reviewAssessment(currentAssessment.id, {
        decision: "REJECTED",
        reason,
      });

      closeModal();
      alert("Assessment rejected.");
      await loadPending(); // refresh list
    } catch (e) {
      showModalError(e?.message || "Failed to reject. Please try again.");
    } finally {
      submitRejectBtn.disabled = false;
      submitRejectBtn.textContent = "Submit Rejection";
    }
  });

  function showModalError(msg) {
    modalError.textContent = msg;
    modalError.classList.remove("hidden");
  }

  // ---- Helpers ----
  function byId(id) {
    return document.getElementById(id);
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = String(str || "");
    return div.innerHTML;
  }

  function formatDrill(drill) {
    switch (String(drill)) {
      case "SIT_UPS":
        return "Sit-ups";
      case "RUN_800M":
        return "Run 800m";
      case "RUN_1_6K":
        return "Run 1.6km";
      case "BROAD_JUMP":
        return "Broad Jump";
      default:
        return String(drill || "Assessment");
    }
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

  function formatScore(item) {
    const drill = String(item.drill);
    const score = Number(item.score) || 0;
    const unit = String(item.unit || "");

    if (drill === "SIT_UPS") {
      const reps = item.rawMetrics?.reps ?? Math.round(score);
      return `${reps} reps`;
    }
    if (drill === "RUN_800M" || drill === "RUN_1_6K") {
      return formatTime(Math.round(score));
    }
    if (drill === "BROAD_JUMP") {
      const dist = item.rawMetrics?.distanceCm ?? Math.round(score);
      return `${dist} cm`;
    }

    // Fallback
    if (unit === "SECONDS") return formatTime(Math.round(score));
    if (unit === "REPS") return `${Math.round(score)} reps`;
    if (unit === "CM") return `${Math.round(score)} cm`;
    return `${Math.round(score)} ${unit.toLowerCase()}`;
  }

  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function renderMetrics(item) {
    const drill = String(item.drill);
    const m = item.rawMetrics || {};
    const rows = [];

    if (drill === "SIT_UPS") {
      rows.push(
        metricRow("Duration", formatTimeSec(m.durationSec)),
        metricRow("Cadence", formatCadence(m.cadenceRpm)),
        metricRow("ROM Proxy", formatRom(m.romScore)),
        metricRow("Confidence", formatConfidence(m.confidence))
      );
    } else if (drill === "RUN_800M" || drill === "RUN_1_6K") {
      rows.push(
        metricRow("Distance", formatDistanceM(m.distanceMeters)),
        metricRow("Pace", formatPace(m.pace)),
        metricRow("GPS Samples", String(m.samples || 0)),
        metricRow("GPS Quality", formatQuality(m.gpsQuality))
      );
    } else if (drill === "BROAD_JUMP") {
      rows.push(
        metricRow("Distance", `${m.distanceCm || 0} cm`),
        metricRow("Surface", String(m.surface || "—")),
        metricRow("Notes", String(m.notes || "—"))
      );
    }

    return rows.join("");
  }

  function metricRow(label, value) {
    return `
      <div class="flex justify-between text-sm">
        <span class="text-gray-400">${escapeHtml(label)}:</span>
        <span class="text-white font-medium">${escapeHtml(value)}</span>
      </div>
    `;
  }

  function formatTimeSec(s) {
    if (s == null) return "—";
    return `${Number(s).toFixed(1)}s`;
  }

  function formatCadence(rpm) {
    if (rpm == null) return "—";
    return `${Number(rpm).toFixed(1)} rpm`;
  }

  function formatRom(r) {
    if (r == null) return "—";
    return Number(r).toFixed(1);
  }

  function formatConfidence(c) {
    if (c == null) return "—";
    const v = Number(c);
    if (v >= 0.85) return `${(v * 100).toFixed(0)}% (High)`;
    if (v >= 0.6) return `${(v * 100).toFixed(0)}% (Okay)`;
    return `${(v * 100).toFixed(0)}% (Low)`;
  }

  function formatDistanceM(m) {
    if (m == null) return "—";
    return `${(Number(m) / 1000).toFixed(2)} km`;
  }

  function formatPace(p) {
    if (p == null || !isFinite(p)) return "—";
    const min = Math.floor(p);
    const sec = Math.round((p - min) * 60);
    return `${min}:${String(sec).padStart(2, "0")} /km`;
  }

  function formatQuality(q) {
    if (q == null) return "—";
    const v = Number(q);
    if (v >= 0.8) return `${(v * 100).toFixed(0)}% (Good)`;
    if (v >= 0.6) return `${(v * 100).toFixed(0)}% (OK)`;
    return `${(v * 100).toFixed(0)}% (Poor)`;
  }
}