// public/js/assessments/run.js
import { requireLogin } from "../core/auth.js";
import API from "../api.js";

document.addEventListener("DOMContentLoaded", () => {
  requireLogin();
  document.documentElement.classList.add("dark");
  init().catch((e) => showGpsError(e?.message || "Failed to initialize"));
});

async function init() {
  // Sections
  const setupSection = byId("setupSection");
  const trackingSection = byId("trackingSection");
  const summarySection = byId("summarySection");

  // Setup elements
  const target800Btn = byId("target800Btn");
  const target1600Btn = byId("target1600Btn");
  const permText = byId("permText");
  const accText = byId("accText");
  const requestGpsBtn = byId("requestGpsBtn");
  const startRunBtn = byId("startRunBtn");
  const gpsError = byId("gpsError");

  // Tracking HUD
  const timeText = byId("timeText");
  const distText = byId("distText");
  const paceText = byId("paceText");
  const samplesText = byId("samplesText");
  const qualityText = byId("qualityText");
  const targetText = byId("targetText");

  // Tracking controls
  const pauseRunBtn = byId("pauseRunBtn");
  const resumeRunBtn = byId("resumeRunBtn");
  const stopRunBtn = byId("stopRunBtn");

  // Summary
  const sumTarget = byId("sumTarget");
  const sumDistance = byId("sumDistance");
  const sumTime = byId("sumTime");
  const sumPace = byId("sumPace");
  const sumSamples = byId("sumSamples");
  const sumStatus = byId("sumStatus");
  const saveRunBtn = byId("saveRunBtn");
  const retakeRunBtn = byId("retakeRunBtn");
  const summaryError = byId("summaryError");

  // State
  let targetMeters = 800;
  let watchId = null;
  let runStarted = false;
  let paused = false;

  let runStartMs = 0;
  let pauseStartMs = 0;
  let pausedTotalMs = 0;

  let lastPos = null;
  let distanceMeters = 0;
  let samples = 0;
  let outlierCount = 0;

  let accSum = 0;
  let accCount = 0;

  // Target selectors
  target800Btn?.addEventListener("click", () => setTarget(800));
  target1600Btn?.addEventListener("click", () => setTarget(1600));

  function setTarget(m) {
    targetMeters = m;
    if (targetText) targetText.textContent = m === 800 ? "800 m" : "1.6 km";
    if (sumTarget) sumTarget.textContent = targetText?.textContent || "";
    // Toggle button styles/aria
    const active = m === 800 ? target800Btn : target1600Btn;
    const inactive = m === 800 ? target1600Btn : target800Btn;
    if (active) {
      active.classList.remove("bg-white/10", "border", "border-white/10");
      active.classList.add("bg-primary", "text-white", "font-semibold");
      active.setAttribute("aria-pressed", "true");
    }
    if (inactive) {
      inactive.classList.remove("bg-primary", "text-white", "font-semibold");
      inactive.classList.add("bg-white/10", "border", "border-white/10");
      inactive.setAttribute("aria-pressed", "false");
    }
  }

  // Initial target display
  setTarget(800);

  // GPS permission + watch
  requestGpsBtn?.addEventListener("click", () => {
    startWatch()
      .then(() => {
        // Enabled when first fix arrives in onPosition
      })
      .catch((e) => showGpsError(e?.message || "Unable to start GPS"));
  });

  startRunBtn?.addEventListener("click", () => {
    // Start live tracking (requires watch active and at least one fix)
    if (!lastPos) {
      showGpsError("Waiting for first GPS fix. Please try again in a moment.");
      return;
    }
    runStarted = true;
    paused = false;
    pausedTotalMs = 0;
    runStartMs = performance.now();

    // Reset counters
    distanceMeters = 0;
    samples = 0;
    outlierCount = 0;
    accSum = 0;
    accCount = 0;

    // Reset HUD
    timeText.textContent = "00:00";
    distText.textContent = "0.00 km";
    paceText.textContent = "—";
    samplesText.textContent = "0";
    qualityText.textContent = "—";

    // Toggle UI
    setupSection.classList.add("hidden");
    trackingSection.classList.remove("hidden");
    pauseRunBtn.classList.remove("hidden");
    stopRunBtn.classList.remove("hidden");

    // Ensure we have a GPS watch
    if (!watchId) {
      startWatch().catch(() => {
        // If it fails here, we still proceed; user may stop/retake
      });
    }
  });

  pauseRunBtn?.addEventListener("click", () => {
    paused = true;
    pauseStartMs = performance.now();
    pauseRunBtn.classList.add("hidden");
    resumeRunBtn.classList.remove("hidden");
  });

  resumeRunBtn?.addEventListener("click", () => {
    paused = false;
    if (pauseStartMs) {
      pausedTotalMs += performance.now() - pauseStartMs;
      pauseStartMs = 0;
    }
    resumeRunBtn.classList.add("hidden");
    pauseRunBtn.classList.remove("hidden");
  });

  stopRunBtn?.addEventListener("click", () => {
    // Manual end
    finishRun();
  });

  retakeRunBtn?.addEventListener("click", () => {
    // Reset back to setup
    summarySection.classList.add("hidden");
    setupSection.classList.remove("hidden");
    // Keep watch alive so Start remains quick
  });

  saveRunBtn?.addEventListener("click", async () => {
    // Compose metrics and POST
    const timeSec = parseTime(sumTime.textContent); // fallback guarded below
    const kmStr = sumDistance.textContent || "0.00 km";
    const distKm =
      parseFloat(kmStr.replace(" km", "")) || distanceMeters / 1000;
    const paceStr = sumPace.textContent || "—";
    const paceMinPerKm = paceStrToNumber(paceStr); // may be null

    const gpsQuality = computeGpsQuality(); // ensure recomputed
    const status = gpsQuality >= 0.6 ? "AUTO_VERIFIED" : "PENDING_REVIEW";
    const drill = targetMeters === 800 ? "RUN_800M" : "RUN_1_6K";

    try {
      await API.createAssessment({
        drill,
        rawMetrics: {
          targetMeters,
          distanceMeters: Math.round(distKm * 1000),
          timeSec: Math.round(timeSec),
          pace: paceMinPerKm ?? null,
          samples,
          gpsQuality: round2(gpsQuality),
        },
        score: Math.round(timeSec), // seconds
        unit: "SECONDS",
        confidence: null,
        status,
      });
      alert("Saved! View it in My Assessments.");
      window.location.href = "my-assessments.html";
    } catch (e) {
      showSummaryError(e?.message || "Failed to save. Please try again.");
    }
  });

  // Geolocation watcher
  async function startWatch() {
    clearWatch();
    if (!("geolocation" in navigator)) {
      throw new Error("Geolocation not supported on this device");
    }
    permText.textContent = "Requesting…";
    return new Promise((resolve, reject) => {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          permText.textContent = "Granted";
          gpsError.classList.add("hidden");

          // Update accuracy display (meters)
          const acc = Number(pos.coords.accuracy || 0);
          if (accText) accText.textContent = acc ? `${acc.toFixed(0)} m` : "—";

          // Enable Start after first fix
          if (!startRunBtn.disabled) {
            // already enabled
          } else {
            startRunBtn.disabled = false;
          }

          // If run hasn't started, just keep lastPos fresh and resolve
          if (!runStarted) {
            lastPos = toFix(pos);
            resolve();
            return;
          }

          // Live tracking path
          onPosition(pos);
        },
        (err) => {
          permText.textContent =
            err.code === err.PERMISSION_DENIED ? "Denied" : "Error";
          showGpsError(
            err.code === err.PERMISSION_DENIED
              ? "GPS permission denied. Enable location to proceed."
              : "Unable to acquire GPS. Try again outdoors."
          );
          startRunBtn.disabled = true;
          clearWatch();
          reject(err);
        },
        {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 10000,
        }
      );
    });
  }

  function clearWatch() {
    if (watchId != null && "geolocation" in navigator) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
  }

  function onPosition(position) {
    if (!runStarted || paused) return;

    const fix = toFix(position);

    // Discard if no previous fix
    if (!lastPos) {
      lastPos = fix;
      return;
    }

    // Compute delta
    const dd = haversineMeters(lastPos.lat, lastPos.lon, fix.lat, fix.lon);
    const dt = Math.max(0.001, (fix.ts - lastPos.ts) / 1000); // seconds
    const speed = dd / dt; // m/s

    // Quality heuristics
    const acc = Number(position.coords.accuracy || 0);
    accSum += acc;
    accCount += 1;

    // Spike filtering
    const isOutlier = acc > 50 || speed > 8; // >50m accuracy or >8 m/s
    if (!isOutlier && dd > 0) {
      distanceMeters += dd;
      samples += 1;
    } else {
      outlierCount += 1;
    }

    lastPos = fix;

    // Update HUD
    const elapsedSec = getElapsedSec();
    timeText.textContent = formatTime(elapsedSec);
    distText.textContent = `${(distanceMeters / 1000).toFixed(2)} km`;
    samplesText.textContent = String(samples);

    // Pace (show when >50m traveled)
    if (distanceMeters > 50) {
      const pace = paceMinPerKm(elapsedSec, distanceMeters);
      paceText.textContent = formatPace(pace);
    } else {
      paceText.textContent = "—";
    }

    // Live GPS quality indicator
    qualityText.textContent = qualityLabel(computeGpsQuality());

    // Auto-stop
    if (distanceMeters >= targetMeters) {
      finishRun();
    }
  }

  function finishRun() {
    if (!runStarted) return;
    runStarted = false;

    // Compute summary metrics
    const elapsedSec = getElapsedSec();
    const distKm = distanceMeters / 1000;
    const pace =
      distKm > 0.05 ? paceMinPerKm(elapsedSec, distanceMeters) : null;
    const quality = computeGpsQuality();

    // Fill summary
    sumTarget.textContent = targetMeters === 800 ? "800 m" : "1.6 km";
    sumDistance.textContent = `${distKm.toFixed(2)} km`;
    sumTime.textContent = formatTime(elapsedSec);
    sumPace.textContent = pace ? formatPace(pace) : "—";
    sumSamples.textContent = String(samples);
    sumStatus.textContent = quality >= 0.6 ? "Auto Verified" : "Pending Review";

    // Toggle UI
    trackingSection.classList.add("hidden");
    summarySection.classList.remove("hidden");

    // Keep watch active so user can retake quickly, but we won't accumulate since runStarted=false
  }

  // Cleanup
  window.addEventListener("pagehide", clearWatch);
  window.addEventListener("beforeunload", clearWatch);

  // ---- helpers ----
  function byId(id) {
    return document.getElementById(id);
  }

  function showGpsError(msg) {
    if (!gpsError) return;
    gpsError.textContent = msg;
    gpsError.classList.remove("hidden");
  }

  function showSummaryError(msg) {
    if (!summaryError) return;
    summaryError.textContent = msg;
    summaryError.classList.remove("hidden");
  }

  function toFix(pos) {
    return {
      lat: pos.coords.latitude,
      lon: pos.coords.longitude,
      ts: Date.now(),
    };
  }

  function getElapsedSec() {
    if (!runStartMs) return 0;
    const now = performance.now();
    const pausedMs = paused
      ? pausedTotalMs + (now - (pauseStartMs || now))
      : pausedTotalMs;
    const activeMs = now - runStartMs - pausedMs;
    return Math.max(0, Math.round(activeMs / 1000));
  }

  function formatTime(sec) {
    const s = Math.max(0, Number(sec) || 0);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  }

  function parseTime(str) {
    // "mm:ss"
    if (!str || typeof str !== "string" || !str.includes(":")) return 0;
    const [m, s] = str.split(":").map((x) => parseInt(x, 10) || 0);
    return m * 60 + s;
  }

  function paceMinPerKm(timeSec, distMeters) {
    const km = distMeters / 1000;
    if (km <= 0) return null;
    return timeSec / 60 / km; // minutes per km
  }

  function formatPace(p) {
    if (p == null || !isFinite(p)) return "—";
    const min = Math.floor(p);
    const sec = Math.round((p - min) * 60);
    return `${min}:${String(sec).padStart(2, "0")} /km`;
  }

  function paceStrToNumber(str) {
    // "m:ss /km" -> minutes as float
    if (!str || !str.includes("/km")) return null;
    const mmss = str.replace(" /km", "");
    const [m, s] = mmss.split(":").map((x) => parseInt(x, 10) || 0);
    return m + s / 60;
  }

  function computeGpsQuality() {
    // Accuracy factor: avg accuracy from 5..50m maps to 1..0
    const avgAcc = accCount ? accSum / accCount : 999;
    const accScore = clamp01(1 - (avgAcc - 5) / 45); // 5m->1, 50m->0

    // Sample factor: expect ~1 fix every 2s (lenient)
    const elapsedSec = getElapsedSec() || 1;
    const expected = Math.max(1, elapsedSec / 2);
    const sampleScore = clamp01(samples / expected);

    // Jitter/outlier factor
    const total = samples + outlierCount || 1;
    const jitterScore = clamp01(1 - outlierCount / total);

    // Weighted score
    const quality = 0.5 * accScore + 0.3 * sampleScore + 0.2 * jitterScore;
    return clamp01(quality);
  }

  function qualityLabel(q) {
    const v = clamp01(q);
    if (v >= 0.8) return "Good";
    if (v >= 0.6) return "OK";
    return "Poor";
  }

  function clamp01(x) {
    return Math.max(0, Math.min(1, Number(x) || 0));
  }

  function round2(x) {
    return Math.round((Number(x) || 0) * 100) / 100;
  }

  // Haversine distance in meters
  function haversineMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000; // meters
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}
