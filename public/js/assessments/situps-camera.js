// public/js/assessments/situps-camera.js
// IMPROVED: Calibration, multi-point validation, confidence filtering, rear/front camera toggle
// New: configurable duration (query param), auto-stop with on-page summary modal, end cues (beep/vibrate/flash)

const DEBUG = true;
function log(...args) {
  if (DEBUG) console.log(...args);
}

// DOM Elements
const $ = (id) => document.getElementById(id);
const dom = {
  loading: $("loading"),
  loadingText: $("loadingText"),
  error: $("error"),
  errorText: $("errorText"),
  backBtn: $("backBtn"),
  setupOverlay: $("setupOverlay"),
  calibrationBtn: $("calibrationBtn"),
  calibrationFeedback: $("calibrationFeedback"),
  startTestBtn: $("startTestBtn"),
  videoContainer: $("videoContainer"),
  cameraPreview: $("cameraPreview"),
  overlayCanvas: $("overlayCanvas"),
  repFlash: $("repFlash"),
  hudWarning: $("hudWarning"),
  phaseText: $("phaseText"),
  repCount: $("repCount"),
  timerText: $("timerText"),
  confidenceText: $("confidenceText"),
  controls: $("controls"),
  stopBtn: $("stopBtn"),
  cameraSwitchBtn: $("cameraSwitchBtn"),
};

// State
const state = {
  // Camera
  stream: null,
  facing: "environment", // default to rear camera on mobiles
  hasMultipleCameras: false,
  selectedDeviceId: null,

  // MediaPipe
  landmarker: null,
  ctx: null,
  drawer: null,

  // Flow
  rafId: null,
  phase: "calibration", // calibration | running | finished
  testRunning: false,
  totalMs: 30000, // configurable on start via query param
  startMs: 0,
  elapsedMs: 0,

  // Rep counting
  repCount: 0,
  repPhase: "down", // down | up

  // Calibration data
  calibrationReps: [],
  calibrationComplete: false,
  downThreshold: 150, // personalized after calibration
  upThreshold: 100, // personalized after calibration

  // Tracking windows
  trunkAngles: [],
  shoulderHeights: [],
  confidences: [],
  maxWindow: 10,

  // Quality tracking
  lastRepTime: 0,
  minRepInterval: 400, // ms - prevent too-fast double count
  visibilityAvg: 0,

  // Frame skip for performance
  frameCount: 0,
  processEveryNFrames: 2,

  // Cue control
  lastCueSecond: null,

  // Audio context (lazy)
  audioCtx: null,
};

// Utilities
const utils = {
  formatCountdown: (ms) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  },

  // Angle at b between points a-b-c
  calculateAngle: (a, b, c) => {
    const radians =
      Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs((radians * 180.0) / Math.PI);
    if (angle > 180.0) angle = 360 - angle;
    return angle;
  },

  // Trunk angle (shoulder->hip vs ground horizontal)
  getTrunkAngle: (shoulder, hip) => {
    const dx = hip.x - shoulder.x;
    const dy = hip.y - shoulder.y;
    const radians = Math.atan2(dy, dx);
    return Math.abs((radians * 180) / Math.PI);
  },

  avgVisibility: (landmarks) => {
    let sum = 0, count = 0;
    for (const lm of landmarks) {
      if (lm?.visibility !== undefined) {
        sum += lm.visibility;
        count++;
      }
    }
    return count > 0 ? sum / count : 0;
  },

  median: (arr) => {
    if (arr.length === 0) return 0;
    const s = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
  },

  confidenceLabel: (conf) => {
    if (conf >= 0.9) return "Excellent";
    if (conf >= 0.8) return "Good";
    if (conf >= 0.75) return "Fair";
    return "Poor";
  },

  round2: (num) => Math.round(num * 100) / 100,

  flashRepFeedback: () => {
    dom.repFlash.style.display = "block";
    dom.repFlash.style.background = "rgba(16, 185, 129, 0.3)";
    setTimeout(() => {
      dom.repFlash.style.display = "none";
    }, 300);
  },
};

// Audio/vibration cues
function ensureAudioCtx() {
  if (!state.audioCtx) {
    try {
      state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {}
  }
  if (state.audioCtx && state.audioCtx.state === "suspended") {
    state.audioCtx.resume().catch(() => {});
  }
}
function beep(freq = 880, durationMs = 120, gain = 0.05) {
  try {
    ensureAudioCtx();
    if (!state.audioCtx) return;
    const ctx = state.audioCtx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.value = freq;
    osc.type = "sine";
    g.gain.value = gain;
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start();
    setTimeout(() => {
      try {
        osc.stop();
        osc.disconnect();
        g.disconnect();
      } catch {}
    }, durationMs);
  } catch {}
}
function vibrate(pattern = 100) {
  try {
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch {}
}
function cueTick(secondLeft) {
  beep(1000, 120, 0.06);
  vibrate(60);
  dom.repFlash.style.display = "block";
  dom.repFlash.style.background = "rgba(59,130,246,0.25)";
  setTimeout(() => (dom.repFlash.style.display = "none"), 150);
}
function cueFinish() {
  beep(700, 250, 0.08);
  vibrate([120, 60, 120]);
  dom.repFlash.style.display = "block";
  dom.repFlash.style.background = "rgba(59,130,246,0.45)";
  setTimeout(() => (dom.repFlash.style.display = "none"), 250);
}

// Camera helpers
async function listCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videos = devices.filter((d) => d.kind === "videoinput");
    return videos;
  } catch {
    return [];
  }
}

async function startCamera() {
  stopCamera();

  let constraints = {
    audio: false,
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
  };

  if (state.selectedDeviceId) {
    constraints.video.deviceId = { exact: state.selectedDeviceId };
  } else {
    constraints.video.facingMode = { ideal: state.facing };
  }

  try {
    state.stream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err) {
    log("getUserMedia failed with constraints, retrying without facingMode", err);
    delete constraints.video.facingMode;
    try {
      state.stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (e2) {
      const cams = await listCameras();
      if (cams.length > 0) {
        state.selectedDeviceId = cams[0].deviceId;
        state.stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { deviceId: { exact: state.selectedDeviceId } },
        });
      } else {
        throw e2;
      }
    }
  }

  dom.cameraPreview.srcObject = state.stream;
  await new Promise((resolve) => (dom.cameraPreview.onloadedmetadata = resolve));
  await dom.cameraPreview.play();

  if (state.facing === "user") {
    dom.cameraPreview.style.transform = "scaleX(-1)";
    dom.overlayCanvas.style.transform = "scaleX(-1)";
  } else {
    dom.cameraPreview.style.transform = "none";
    dom.overlayCanvas.style.transform = "none";
  }

  dom.overlayCanvas.width = dom.cameraPreview.videoWidth;
  dom.overlayCanvas.height = dom.cameraPreview.videoHeight;

  log("📷 Camera started:", state.facing, state.selectedDeviceId ? `(deviceId: ${state.selectedDeviceId})` : "");
}

function stopCamera() {
  if (state.stream) {
    state.stream.getTracks().forEach((t) => t.stop());
    state.stream = null;
  }
}

async function toggleCamera() {
  if (state.hasMultipleCameras) {
    state.facing = state.facing === "user" ? "environment" : "user";
    state.selectedDeviceId = null;
  } else {
    return;
  }
  try {
    await startCamera();
  } catch (e) {
    log("Toggle camera failed, attempting deviceId fallback", e);
    const cams = await listCameras();
    if (cams.length > 1) {
      const currentId = state.selectedDeviceId;
      const next = cams.find((c) => c.deviceId !== currentId) || cams[0];
      state.selectedDeviceId = next.deviceId;
      await startCamera();
    }
  }
}

// Main initialization
async function init() {
  log("🎥 Camera page initializing...");

  try {
    const cams = await listCameras();
    state.hasMultipleCameras = cams.length > 1;
    if (state.hasMultipleCameras) {
      dom.cameraSwitchBtn.classList.remove("hidden");
    }

    dom.loadingText.textContent = "Loading AI model...";
    const MP_VERSION = "0.10.8";
    const vision = await import(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`);
    const { FilesetResolver, PoseLandmarker, DrawingUtils } = vision;

    const fileset = await FilesetResolver.forVisionTasks(
      `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`
    );

    state.landmarker = await PoseLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    state.ctx = dom.overlayCanvas.getContext("2d");
    state.drawer = new DrawingUtils(state.ctx);
    log("✅ MediaPipe ready");

    dom.loadingText.textContent = "Starting camera...";
    await startCamera();

    dom.loading.classList.add("hidden");
    dom.setupOverlay.classList.remove("hidden");

    if (state.hasMultipleCameras) {
      dom.cameraSwitchBtn.classList.remove("hidden");
    }

    setupLoop();

    dom.calibrationBtn.addEventListener("click", startCalibration);
    dom.startTestBtn.addEventListener("click", startTest);
    dom.stopBtn.addEventListener("click", stopTest);
    dom.cameraSwitchBtn.addEventListener("click", toggleCamera);
    dom.backBtn?.addEventListener("click", () => {
      window.location.href = "assess-situps.html";
    });
  } catch (e) {
    console.error("❌ Init failed:", e);
    showError(e.message || "Camera initialization failed");
  }
}

function setupLoop() {
  if (state.phase !== "calibration") return;
  requestAnimationFrame(setupLoop);

  if (dom.cameraPreview.readyState < 2) return;

  const now = performance.now();
  const results = state.landmarker.detectForVideo(dom.cameraPreview, now);

  state.ctx.clearRect(0, 0, dom.overlayCanvas.width, dom.overlayCanvas.height);
  if (results?.landmarks?.[0]) {
    state.drawer.drawLandmarks(results.landmarks[0], { color: "#00FF00", radius: 6 });
    state.drawer.drawConnectors(
      results.landmarks[0],
      [
        [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
        [11, 23], [12, 24], [23, 24],
        [11, 5], [12, 6], [5, 6],
      ],
      { color: "#00FF00", lineWidth: 2 }
    );
  }
}

function startCalibration() {
  log("🎯 Starting calibration...");
  dom.calibrationBtn.disabled = true;
  dom.calibrationFeedback.classList.remove("hidden");
  dom.calibrationFeedback.textContent = "Do 2 slow sit-ups... (0/2)";

  state.calibrationReps = [];
  state.trunkAngles = [];
  state.repPhase = "down";

  calibrationLoop();
}

function calibrationLoop() {
  if (state.calibrationReps.length >= 2) {
    finishCalibration();
    return;
  }

  requestAnimationFrame(calibrationLoop);
  if (dom.cameraPreview.readyState < 2) return;

  const now = performance.now();
  const results = state.landmarker.detectForVideo(dom.cameraPreview, now);

  state.ctx.clearRect(0, 0, dom.overlayCanvas.width, dom.overlayCanvas.height);
  if (results?.landmarks?.[0]) {
    const lm = results.landmarks[0];
    state.drawer.drawLandmarks(lm, { color: "#3b82f6", radius: 6 });

    const shoulder = lm[11];
    const hip = lm[23];

    if (shoulder && hip) {
      const trunkAngle = utils.getTrunkAngle(shoulder, hip);
      state.trunkAngles.push(trunkAngle);
      if (state.trunkAngles.length > 30) state.trunkAngles.shift();

      const smoothed = utils.median(state.trunkAngles);

      if (state.repPhase === "down" && smoothed < 120) {
        state.repPhase = "up";
      } else if (state.repPhase === "up" && smoothed > 160) {
        state.calibrationReps.push({
          min: Math.min(...state.trunkAngles),
          max: Math.max(...state.trunkAngles),
          range: Math.max(...state.trunkAngles) - Math.min(...state.trunkAngles),
        });
        state.repPhase = "down";
        state.trunkAngles = [];

        log("✅ Calibration rep:", state.calibrationReps.length);
        dom.calibrationFeedback.textContent = `Do 2 slow sit-ups... (${state.calibrationReps.length}/2)`;
        utils.flashRepFeedback();
      }
    }
  }
}

function finishCalibration() {
  log("📊 Calibration complete:", state.calibrationReps);

  const avgMin = state.calibrationReps.reduce((s, r) => s + r.min, 0) / state.calibrationReps.length;
  const avgMax = state.calibrationReps.reduce((s, r) => s + r.max, 0) / state.calibrationReps.length;
  const avgRange = avgMax - avgMin;

  state.upThreshold = avgMin + avgRange * 0.15;   // curled threshold
  state.downThreshold = avgMax - avgRange * 0.15; // extended threshold

  log(`🎯 Thresholds set: UP=${state.upThreshold.toFixed(1)}°, DOWN=${state.downThreshold.toFixed(1)}°`);

  dom.calibrationFeedback.textContent = `✅ Calibrated! Range: ${avgRange.toFixed(1)}°`;
  dom.calibrationBtn.classList.add("hidden");
  dom.startTestBtn.classList.remove("hidden");

  state.calibrationComplete = true;
}

function startTest() {
  log("🚀 Starting test");
  dom.setupOverlay.classList.add("hidden");
  dom.controls.classList.remove("hidden");

  const p = new URLSearchParams(location.search);
  const durSec = Number(p.get("duration"));
  const durMs = Number(p.get("ms"));
  let desiredMs = state.totalMs;
  if (!Number.isNaN(durMs) && durMs > 0) desiredMs = Math.floor(durMs);
  else if (!Number.isNaN(durSec) && durSec > 0) desiredMs = Math.floor(durSec * 1000);
  state.totalMs = desiredMs;

  dom.timerText.textContent = utils.formatCountdown(state.totalMs);

  state.phase = "running";
  state.testRunning = true;
  state.startMs = performance.now();
  state.repCount = 0;
  state.repPhase = "down";
  state.trunkAngles = [];
  state.confidences = [];
  state.visibilityAvg = 0;
  state.frameCount = 0;
  state.lastCueSecond = null;

  testLoop();
}

function testLoop() {
  if (!state.testRunning) return;
  state.rafId = requestAnimationFrame(testLoop);

  const now = performance.now();
  state.elapsedMs = now - state.startMs;
  const remaining = Math.max(0, Math.round(state.totalMs - state.elapsedMs));
  dom.timerText.textContent = utils.formatCountdown(remaining);

  const secLeft = Math.ceil(remaining / 1000);
  if (secLeft <= 3 && secLeft > 0 && state.lastCueSecond !== secLeft) {
    state.lastCueSecond = secLeft;
    cueTick(secLeft);
  }
  if (remaining <= 0) {
    cueFinish();
    stopTest();
    return;
  }

  state.frameCount++;
  if (state.frameCount % state.processEveryNFrames !== 0) return;

  if (dom.cameraPreview.readyState < 2) return;

  const results = state.landmarker.detectForVideo(dom.cameraPreview, now);

  state.ctx.clearRect(0, 0, dom.overlayCanvas.width, dom.overlayCanvas.height);

  if (!results?.landmarks?.[0]) {
    dom.hudWarning.classList.remove("hidden");
    dom.phaseText.textContent = "⚠️ Position yourself in frame";
    return;
  }

  dom.hudWarning.classList.add("hidden");
  const lm = results.landmarks[0];

  const skColor = state.repPhase === "down" ? "#10b981" : "#3b82f6";
  state.drawer.drawLandmarks(lm, { color: skColor, radius: 5 });
  state.drawer.drawConnectors(
    lm,
    [
      [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
      [11, 23], [12, 24], [23, 24],
      [11, 5], [12, 6], [5, 6],
    ],
    { color: skColor, lineWidth: 3 }
  );

  const vis = utils.avgVisibility(lm);
  state.visibilityAvg = state.visibilityAvg ? state.visibilityAvg * 0.9 + vis * 0.1 : vis;
  if (vis < 0.6) {
    dom.phaseText.textContent = "⚠️ Improve lighting or move closer";
    return;
  }

  const leftShoulder = lm[11];
  const leftHip = lm[23];
  if (!leftShoulder || !leftHip) return;

  const trunkAngle = utils.getTrunkAngle(leftShoulder, leftHip);
  state.trunkAngles.push(trunkAngle);
  if (state.trunkAngles.length > state.maxWindow) state.trunkAngles.shift();
  const smoothTrunk = utils.median(state.trunkAngles);

  state.confidences.push(vis);
  if (state.confidences.length > state.maxWindow) state.confidences.shift();
  const avgConf = state.confidences.reduce((a, b) => a + b, 0) / state.confidences.length;

  const timeSinceLast = now - state.lastRepTime;
  if (state.repPhase === "down" && smoothTrunk < state.upThreshold) {
    if (avgConf >= 0.75 && timeSinceLast > state.minRepInterval) {
      state.repPhase = "up";
      dom.phaseText.textContent = "💪 Curled - now go down";
      log(`Phase: DOWN → UP @ ${smoothTrunk.toFixed(1)}°`);
    }
  } else if (state.repPhase === "up" && smoothTrunk > state.downThreshold) {
    if (avgConf >= 0.75 && timeSinceLast > state.minRepInterval) {
      state.repCount++;
      state.lastRepTime = now;
      state.repPhase = "down";

      dom.repCount.textContent = String(state.repCount);
      dom.phaseText.textContent = `✅ Rep ${state.repCount} - keep going!`;
      utils.flashRepFeedback();

      log(`✅ Rep ${state.repCount} @ ${smoothTrunk.toFixed(1)}°`);
    }
  } else {
    dom.phaseText.textContent = state.repPhase === "down" ? "🔽 Curl up" : "🔼 Extend down";
  }

  const qLabel = utils.confidenceLabel(avgConf);
  dom.confidenceText.textContent = qLabel;
  dom.confidenceText.className =
    "stat-value " + (avgConf >= 0.8 ? "good" : avgConf >= 0.75 ? "warning" : "error");
}

function stopTest() {
  if (!state.testRunning) return;
  log("🏁 Test stopped. Reps:", state.repCount);
  state.testRunning = false;
  if (state.rafId) cancelAnimationFrame(state.rafId);

  stopCamera();

  const durationSec = Math.max(1, utils.round2(state.elapsedMs / 1000));
  const cadenceRpm = utils.round2(state.repCount / (durationSec / 60));
  const avgConfidence = utils.round2(state.visibilityAvg);
  const status = avgConfidence >= 0.75 ? "AUTO_VERIFIED" : "PENDING_REVIEW";
  const trunkRange =
    state.trunkAngles.length > 0
      ? Math.max(...state.trunkAngles) - Math.min(...state.trunkAngles)
      : 0;

  const results = {
    drill: "SIT_UPS",
    reps: state.repCount,
    durationSec,
    cadenceRpm,
    romScore: utils.round2(trunkRange),
    visibilityAvg: avgConfidence,
    confidence: avgConfidence,
    status,
  };

  showSummaryModal(results);
}

// FIXED showSummaryModal: no removal of modal after creation, correct element lookups, reliable click handler
function showSummaryModal(results) {
  // Create once or reuse
  let sheet = $("camSummarySheet");
  if (!sheet) {
    sheet = document.createElement("div");
    sheet.id = "camSummarySheet";
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
        <div id="camSummaryReps" style="font-size:24px;font-weight:800;">—</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;
          padding:10px;border-radius:10px;background:rgba(255,255,255,0.05);">
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:36px;height:36px;border-radius:8px;background:rgba(59,130,246,0.2);
              display:flex;align-items:center;justify-content:center;color:#93c5fd;">⏱</div>
            <div>
              <div style="font-size:11px;color:rgba(255,255,255,0.7);">Cadence</div>
              <div id="camSummaryCadence" style="font-weight:600;">— rpm</div>
            </div>
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;
          padding:10px;border-radius:10px;background:rgba(255,255,255,0.05);">
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:36px;height:36px;border-radius:8px;background:rgba(16,185,129,0.2);
              display:flex;align-items:center;justify-content:center;color:#6ee7b7;">📐</div>
            <div>
              <div style="font-size:11px;color:rgba(255,255,255,0.7);">Range of Motion</div>
              <div id="camSummaryRom" style="font-weight:600;">—°</div>
            </div>
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;
          padding:10px;border-radius:10px;background:rgba(255,255,255,0.05);">
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:36px;height:36px;border-radius:8px;background:rgba(147,51,234,0.2);
              display:flex;align-items:center;justify-content:center;color:#c084fc;">★</div>
            <div>
              <div style="font-size:11px;color:rgba(255,255,255,0.7);">Confidence</div>
              <div id="camSummaryConfidence" style="font-weight:600;">—</div>
            </div>
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;
          padding:10px;border-radius:10px;background:rgba(255,255,255,0.05);">
          <div style="display:flex;align-items:center;gap:10px;">
            <div id="camSummaryStatusIcon" style="width:36px;height:36px;border-radius:8px;
              background:rgba(16,185,129,0.2);display:flex;align-items:center;justify-content:center;color:#6ee7b7;">✔</div>
            <div>
              <div style="font-size:11px;color:rgba(255,255,255,0.7);">Status</div>
              <div id="camSummaryStatus" style="font-weight:600;">—</div>
            </div>
          </div>
        </div>
      </div>
    `;

    const footer = document.createElement("div");
    Object.assign(footer.style, { padding: "16px 20px 20px" });
    footer.innerHTML = `
      <button id="camSummaryNextBtn"
        style="width:100%;padding:12px 16px;border:none;border-radius:12px;
          background:#3365fa;color:white;font-weight:800;box-shadow:0 8px 20px rgba(51,101,250,0.35);
          transition:.2s;">
        Next
      </button>
    `;

    sheet.appendChild(card);
    card.appendChild(header);
    card.appendChild(body);
    card.appendChild(footer);
    document.body.appendChild(sheet);
  }

  // Update metrics safely (use IDs without '#')
  const repsEl = $("camSummaryReps");
  const cadEl = $("camSummaryCadence");
  const romEl = $("camSummaryRom");
  const confEl = $("camSummaryConfidence");
  const statusEl = $("camSummaryStatus");
  const statusIconEl = $("camSummaryStatusIcon");
  const nextBtn = $("camSummaryNextBtn");

  if (repsEl) repsEl.textContent = `${results.reps} reps in ${results.durationSec}s`;
  if (cadEl) cadEl.textContent = `${results.cadenceRpm.toFixed(1)} rpm`;
  if (romEl) romEl.textContent = `${results.romScore.toFixed(1)}°`;
  if (confEl) {
    const label =
      results.confidence >= 0.9 ? "Excellent" :
      results.confidence >= 0.8 ? "Good" :
      results.confidence >= 0.75 ? "Fair" : "Poor";
    confEl.textContent = `${label} (${(results.confidence * 100).toFixed(0)}%)`;
  }
  if (statusEl && statusIconEl) {
    const isAuto = results.status === "AUTO_VERIFIED";
    statusEl.textContent = isAuto ? "Auto Verified" : "Pending Review";
    statusIconEl.style.background = isAuto ? "rgba(16,185,129,0.2)" : "rgba(245,158,11,0.2)";
    statusIconEl.style.color = isAuto ? "#6ee7b7" : "#fbbf24";
    statusIconEl.textContent = isAuto ? "✔" : "⏳";
  }

  // Bind Next reliably each time (idempotent)
  if (nextBtn) {
    nextBtn.onclick = () => {
      try {
        sessionStorage.setItem("situpResults", JSON.stringify(results));
      } catch {}
      window.location.href = "assess-situps.html?results=true";
    };
  }
}

function showError(message) {
  dom.loading.classList.add("hidden");
  dom.error.classList.remove("hidden");
  dom.errorText.textContent = message;
}

// Start
init().catch((e) => {
  console.error("Init error:", e);
  showError(e.message || "Failed to start");
});