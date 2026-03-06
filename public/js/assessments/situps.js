// public/js/assessments/situps.js
// Final fix: This script now uses a single, dynamically created modal for all results,
// solving the "double modal" issue and ensuring a consistent UX.

import { requireLogin } from "../core/auth.js";
import API from "../api.js";

const DEBUG = true;
function log(...args) {
  if (DEBUG) console.log(...args);
}

// --- NAV HIDE HELPER ---
let navHiddenFlag = false;
const NAV_OBSERVER_KEY = "__navHideObserver";
function hideInjectedNav() {
  const injected = document.querySelector("footer .nav-shell");
  const footer = injected
    ? injected.closest("footer")
    : document.querySelector("footer");
  if (footer) footer.style.display = "none";
}
function showInjectedNav() {
  const footers = document.querySelectorAll("footer");
  footers.forEach((f) => {
    if (f) f.style.display = "";
  });
}
function setNavHidden(hide) {
  navHiddenFlag = hide;
  if (hide) {
    hideInjectedNav();
    if (!window[NAV_OBSERVER_KEY]) {
      const obs = new MutationObserver(() => {
        if (navHiddenFlag) hideInjectedNav();
      });
      obs.observe(document.body, { childList: true, subtree: true });
      window[NAV_OBSERVER_KEY] = obs;
    }
  } else {
    showInjectedNav();
    if (window[NAV_OBSERVER_KEY]) {
      window[NAV_OBSERVER_KEY].disconnect();
      window[NAV_OBSERVER_KEY] = null;
    }
  }
}
// -------------------------

// --- UNIFIED RESULTS MODAL ---
function showResultsInNewModal(results) {
  // Lock scroll and hide nav
  document.body.style.overflow = "hidden";
  setNavHidden(true);

  let sheet = document.getElementById("finalSummaryModal");
  if (!sheet) {
    sheet = document.createElement("div");
    sheet.id = "finalSummaryModal";
    Object.assign(sheet.style, {
      position: "fixed",
      inset: "0",
      background: "rgba(0,0,0,0.8)",
      backdropFilter: "blur(4px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: "9999",
    });

    const card = document.createElement("div");
    Object.assign(card.style, {
      maxWidth: "22rem",
      width: "90%",
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: "16px",
      background: "linear-gradient(135deg, #0f172a 0%, #111827 100%)",
      boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
      color: "white",
      overflow: "hidden",
    });

    const header = document.createElement("div");
    Object.assign(header.style, {
      padding: "20px",
      borderBottom: "1px solid rgba(255,255,255,0.1)",
    });
    header.innerHTML = `
      <div style="display:flex;justify-content:center;margin-bottom:8px;">
        <div style="width:56px;height:56px;border-radius:50%;
          background:rgba(59,130,246,0.2);display:flex;align-items:center;justify-content:center;">
          <span style="font-size:28px;color:#60a5fa;">✓</span>
        </div>
      </div>
      <h2 style="font-size:20px;font-weight:700;text-align:center;">Assessment Complete</h2>
      <p style="font-size:12px;color:rgba(255,255,255,0.7);text-align:center;margin-top:4px;">
        Your results are ready
      </p>
    `;

    const body = document.createElement("div");
    Object.assign(body.style, { padding: "16px 20px" });
    body.innerHTML = `
      <div style="text-align:center;padding:14px;border:1px solid rgba(59,130,246,0.3);
        background:rgba(59,130,246,0.1);border-radius:12px;margin-bottom:12px;">
        <div style="font-size:12px;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;">
          Sit-Up Assessment
        </div>
        <div id="finalSummaryReps" style="font-size:24px;font-weight:800;">—</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px;border-radius:10px;background:rgba(255,255,255,0.05);">
          <div style="display:flex;align-items:center;gap:10px;"><div style="width:36px;height:36px;border-radius:8px;background:rgba(59,130,246,0.2);display:flex;align-items:center;justify-content:center;color:#93c5fd;">⏱</div><div><div style="font-size:11px;color:rgba(255,255,255,0.7);">Cadence</div><div id="finalSummaryCadence" style="font-weight:600;">— rpm</div></div></div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px;border-radius:10px;background:rgba(255,255,255,0.05);">
          <div style="display:flex;align-items:center;gap:10px;"><div style="width:36px;height:36px;border-radius:8px;background:rgba(16,185,129,0.2);display:flex;align-items:center;justify-content:center;color:#6ee7b7;">📐</div><div><div style="font-size:11px;color:rgba(255,255,255,0.7);">Range of Motion</div><div id="finalSummaryRom" style="font-weight:600;">—°</div></div></div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px;border-radius:10px;background:rgba(255,255,255,0.05);">
          <div style="display:flex;align-items:center;gap:10px;"><div style="width:36px;height:36px;border-radius:8px;background:rgba(147,51,234,0.2);display:flex;align-items:center;justify-content:center;color:#c084fc;">★</div><div><div style="font-size:11px;color:rgba(255,255,255,0.7);">Confidence</div><div id="finalSummaryConfidence" style="font-weight:600;">—</div></div></div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px;border-radius:10px;background:rgba(255,255,255,0.05);">
          <div style="display:flex;align-items:center;gap:10px;"><div id="finalSummaryStatusIcon" style="width:36px;height:36px;border-radius:8px;background:rgba(16,185,129,0.2);display:flex;align-items:center;justify-content:center;color:#6ee7b7;">✔</div><div><div style="font-size:11px;color:rgba(255,255,255,0.7);">Status</div><div id="finalSummaryStatus" style="font-weight:600;">—</div></div></div>
        </div>
      </div>
    `;

    const footer = document.createElement("div");
    Object.assign(footer.style, { padding: "16px 20px 20px" });
    footer.innerHTML = `<button id="finalSummaryNextBtn" style="width:100%;padding:12px 16px;border:none;border-radius:12px;background:#3365fa;color:white;font-weight:800;box-shadow:0 8px 20px rgba(51,101,250,0.35);transition:.2s;">Next</button><p id="finalSummaryError" style="color:#fca5a5;font-size:12px;text-align:center;margin-top:8px;"></p>`;
    sheet.appendChild(card);
    card.appendChild(header);
    card.appendChild(body);
    card.appendChild(footer);
    document.body.appendChild(sheet);
  }

  // Populate metrics
  const repsEl = document.getElementById("finalSummaryReps");
  const cadEl = document.getElementById("finalSummaryCadence");
  const romEl = document.getElementById("finalSummaryRom");
  const confEl = document.getElementById("finalSummaryConfidence");
  const statusEl = document.getElementById("finalSummaryStatus");
  const statusIconEl = document.getElementById("finalSummaryStatusIcon");
  const nextBtn = document.getElementById("finalSummaryNextBtn");

  if (repsEl)
    repsEl.textContent = `${results.reps} reps in ${results.durationSec}s`;
  if (cadEl) cadEl.textContent = `${results.cadenceRpm.toFixed(1)} rpm`;
  if (romEl) romEl.textContent = `${results.romScore.toFixed(1)}°`;
  if (confEl) {
    const label =
      results.confidence >= 0.9
        ? "Excellent"
        : results.confidence >= 0.8
        ? "Good"
        : results.confidence >= 0.75
        ? "Fair"
        : "Poor";
    confEl.textContent = `${label} (${(results.confidence * 100).toFixed(0)}%)`;
  }
  if (statusEl && statusIconEl) {
    const isAuto = results.status === "AUTO_VERIFIED";
    statusEl.textContent = isAuto ? "Auto Verified" : "Pending Review";
    statusIconEl.style.background = isAuto
      ? "rgba(16,185,129,0.2)"
      : "rgba(245,158,11,0.2)";
    statusIconEl.style.color = isAuto ? "#6ee7b7" : "#fbbf24";
    statusIconEl.textContent = isAuto ? "✔" : "⏳";
  }

  if (nextBtn) {
    nextBtn.onclick = async () => {
      if (results.videoFile) {
        await saveUploadAssessment(results);
      } else {
        await saveCameraAssessment(results);
      }
    };
  }
}

// --- Main Init Function ---
document.addEventListener("DOMContentLoaded", () => {
  requireLogin();
  document.documentElement.classList.add("dark");
  init();
});

async function init() {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("results") === "true") {
    showResultsFromSession();
    return;
  }

  const $ = (id) => document.getElementById(id);
  const dom = {
    liveCameraBtn: $("liveCameraBtn"),
    uploadVideoBtn: $("uploadVideoBtn"),
    uploadSection: $("uploadSection"),
    videoFileInput: $("videoFileInput"),
    chooseVideoBtn: $("chooseVideoBtn"),
    uploadFileName: $("uploadFileName"),
    uploadError: $("uploadError"),
    startUploadBtn: $("startUploadBtn"),
    uploadControls: $("uploadControls"), // <-- THIS WAS MISSING
  };

  let selectedFile = null;

  // Mode switching
  dom.liveCameraBtn?.addEventListener("click", () => {
    // Advise user to use upload for better accuracy but still allow live
    alert(
      "Live camera mode uses a less accurate model. For best results, use Upload Video."
    );
    window.location.href = "assess-situps-camera.html";
  });

  dom.uploadVideoBtn?.addEventListener("click", () => {
    dom.uploadSection.classList.remove("hidden");
  });

  // Handle file selection
  dom.chooseVideoBtn?.addEventListener("click", () =>
    dom.videoFileInput.click()
  );

  dom.videoFileInput?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 20 * 1024 * 1024) {
      showError("Video must be under 20MB.");
      dom.videoFileInput.value = "";
      return;
    }
    if (!/^video\/(mp4|webm)$/.test(file.type)) {
      showError("Only MP4 or WebM videos supported.");
      dom.videoFileInput.value = "";
      return;
    }

    selectedFile = file;
    dom.uploadFileName.textContent = file.name;
    dom.uploadFileName.classList.remove("hidden");

    // CRITICAL FIX: Show the upload controls div which contains the start button
    if (dom.uploadControls) {
      dom.uploadControls.classList.remove("hidden");
    }

    dom.chooseVideoBtn.textContent = "Change Video";
  });

  // ---- NEW CORE LOGIC: Send video to backend for analysis ----
  dom.startUploadBtn?.addEventListener("click", async () => {
    if (!selectedFile) {
      showError("Please select a video first.");
      return;
    }

    dom.startUploadBtn.disabled = true;
    dom.startUploadBtn.textContent = "Analyzing...";
    setNavHidden(true);
    showError("");

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      log("🚀 Sending video to backend for analysis...");
      const backendResult = await API.analyzeVideoBackend(formData);
      log("✅ Backend analysis complete:", backendResult);

      const results = {
        drill: "SIT_UPS",
        reps: backendResult.reps,
        durationSec: null,
        cadenceRpm: null,
        romScore: null,
        confidence: 1.0,
        status: "AUTO_VERIFIED",
        hasVideo: true,
        videoFile: selectedFile,
      };

      showResultsInNewModal(results);
    } catch (e) {
      console.error("❌ Backend analysis failed:", e);
      showError(e.message || "Failed to analyze video.");
    } finally {
      dom.startUploadBtn.disabled = false;
      dom.startUploadBtn.textContent = "Start Analysis";
      setNavHidden(false);
    }
  });

  function showError(msg) {
    if (dom.uploadError) {
      dom.uploadError.textContent = msg;
      dom.uploadError.classList.remove("hidden");
    }
  }
}

// Handles results coming back from the live camera page
async function showResultsFromSession() {
  const resultsJson = sessionStorage.getItem("situpResults");
  if (!resultsJson) {
    window.location.href = "assess-situps.html";
    return;
  }
  const results = JSON.parse(resultsJson);
  showResultsInNewModal(results);
  try {
    sessionStorage.removeItem("situpResults");
  } catch {}
}

// --- SAVE FUNCTIONS ---
async function saveUploadAssessment(results) {
  try {
    document.getElementById("finalSummaryNextBtn").disabled = true;
    document.getElementById("finalSummaryNextBtn").textContent = "Saving...";
    const assessmentData = {
      drill: "SIT_UPS",
      rawMetrics: {
        reps: results.reps,
        durationSec: results.durationSec,
        cadenceRpm: results.cadenceRpm,
        romScore: results.romScore,
        visibilityAvg: results.visibilityAvg,
        confidence: results.confidence,
      },
      score: results.reps,
      unit: "REPS",
      confidence: results.confidence,
      status: results.status,
    };
    const response = await API.createAssessment(assessmentData);
    if (results.hasVideo && results.videoFile) {
      const assessmentId =
        response?.id || response?.assessmentId || response?.data?.id;
      if (assessmentId) {
        const formData = new FormData();
        formData.append("file", results.videoFile);
        formData.append("assessmentId", assessmentId);
        await API.uploadAssessmentMedia(formData);
      }
    }
    setNavHidden(false);
    document.body.style.overflow = "";
    alert("Assessment saved successfully! Redirecting...");
    window.location.href = "my-assessments.html";
  } catch (e) {
    const errorEl = document.getElementById("finalSummaryError");
    if (errorEl) errorEl.textContent = e?.message || "Failed to save.";
    document.getElementById("finalSummaryNextBtn").disabled = false;
    document.getElementById("finalSummaryNextBtn").textContent = "Next";
  }
}

async function saveCameraAssessment(results) {
  try {
    document.getElementById("finalSummaryNextBtn").disabled = true;
    document.getElementById("finalSummaryNextBtn").textContent = "Saving...";
    const assessmentData = {
      drill: "SIT_UPS",
      rawMetrics: {
        reps: results.reps,
        durationSec: results.durationSec,
        cadenceRpm: results.cadenceRpm,
        romScore: results.romScore,
        visibilityAvg: results.visibilityAvg,
        confidence: results.confidence,
      },
      score: results.reps,
      unit: "REPS",
      confidence: results.confidence,
      status: results.status,
    };
    await API.createAssessment(assessmentData);
    setNavHidden(false);
    document.body.style.overflow = "";
    alert("Assessment saved successfully! Redirecting...");
    window.location.href = "my-assessments.html";
  } catch (e) {
    const errorEl = document.getElementById("finalSummaryError");
    if (errorEl) errorEl.textContent = e?.message || "Failed to save.";
    document.getElementById("finalSummaryNextBtn").disabled = false;
    document.getElementById("finalSummaryNextBtn").textContent = "Next";
  }
}
