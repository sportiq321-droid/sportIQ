import { requireLogin } from "./core/auth.js";
import { getCurrentUser } from "./modules/users.js";
import { createTournament } from "./modules/tournaments-admin.js";

document.addEventListener("DOMContentLoaded", () => {
  requireLogin();

  const admin = getCurrentUser();
  if (!admin || admin.role !== "Admin") {
    window.location.href = "dashboard.html";
    return;
  }

  let step = 1;
  const totalSteps = 6;
  const formData = {
    basic: {},
    rules: {},
    registration: {},
    media: {},
    organizer: {},
    needsApproval: false,
  };

  const steps = Array.from(document.querySelectorAll(".step"));
  const wizardMsg = document.getElementById("wizardMsg");

  // Basic
  const nameEl = document.getElementById("name");
  const sportEl = document.getElementById("sport");
  const startDateEl = document.getElementById("startDate");
  const startTimeEl = document.getElementById("startTime");
  const endDateEl = document.getElementById("endDate");
  const endTimeEl = document.getElementById("endTime");
  const stateEl = document.getElementById("state");
  const districtEl = document.getElementById("district");
  const venueEl = document.getElementById("venue");

  // Rules
  const ageMinEl = document.getElementById("ageMin");
  const ageMaxEl = document.getElementById("ageMax");
  const genderEl = document.getElementById("gender");
  const distRestrictEl = document.getElementById("districtRestriction");
  const maxTeamsEl = document.getElementById("maxTeams");
  const maxPlayersEl = document.getElementById("maxPlayers");
  const formatName = "format";

  // Registration
  const regFeeEl = document.getElementById("regFee");
  const docChks = Array.from(document.querySelectorAll(".docChk"));
  const lastDateEl = document.getElementById("lastDate");
  const needsApprovalEl = document.getElementById("needsApproval");

  // Media
  const bannerEl = document.getElementById("banner");
  const bannerPreview = document.getElementById("bannerPreview");
  const bannerPreviewImg = document.getElementById("bannerPreviewImg");

  // Organizer
  const orgNameEl = document.getElementById("orgName");
  const orgMobileEl = document.getElementById("orgMobile");
  const orgEmailEl = document.getElementById("orgEmail");

  // Submit (UPDATED - new buttons)
  const submitMsg = document.getElementById("submitMsg");
  const saveDraftBtn = document.getElementById("saveDraft");
  const publishTournamentBtn = document.getElementById("publishTournament");
  const createAnotherBtn = document.getElementById("createAnother");
  const cancelWizardBtn = document.getElementById("cancelWizard");

  // Prefill organizer
  orgNameEl.value = admin.name || "";
  orgMobileEl.value = admin.mobile || "";
  orgEmailEl.value = admin.email || "";

  // ==================== NEW: Image Preview ====================
  if (bannerEl && bannerPreview && bannerPreviewImg) {
    bannerEl.addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) {
        try {
          const reader = new FileReader();
          reader.onload = (event) => {
            bannerPreviewImg.src = event.target.result;
            bannerPreview.style.display = "block";
          };
          reader.readAsDataURL(file);
        } catch (error) {
          console.error("Error previewing image:", error);
        }
      } else {
        bannerPreview.style.display = "none";
      }
    });
  }

  // Populate states/districts (object shape)
  try {
    const raw = window.statesAndDistricts || {};
    const states = Object.keys(raw).sort((a, b) => a.localeCompare(b));
    stateEl.innerHTML =
      '<option value="">Select State</option>' +
      states
        .map(
          (s) => `<option value="${escapeHTML(s)}">${escapeHTML(s)}</option>`
        )
        .join("");
    stateEl.addEventListener("change", () => {
      const dists = raw[stateEl.value] || [];
      districtEl.innerHTML =
        '<option value="">Select District</option>' +
        dists
          .map(
            (d) => `<option value="${escapeHTML(d)}">${escapeHTML(d)}</option>`
          )
          .join("");
    });
  } catch (err) {
    console.error("Error loading states/districts:", err);
  }

  // ==================== Navigation ====================
  document.getElementById("next1").onclick = () => {
    if (!validateStep1()) return;
    collectStep1();
    go(2);
  };

  document.getElementById("prev2").onclick = () => go(1);
  document.getElementById("next2").onclick = () => {
    if (!validateStep2()) return;
    collectStep2();
    go(3);
  };

  document.getElementById("prev3").onclick = () => go(2);
  document.getElementById("next3").onclick = () => {
    if (!validateStep3()) return;
    collectStep3();
    go(4);
  };

  document.getElementById("prev4").onclick = () => go(3);
  document.getElementById("next4").onclick = async () => {
    await collectStep4();
    go(5);
  };

  document.getElementById("prev5").onclick = () => go(4);
  document.getElementById("next5").onclick = () => {
    if (!validateStep5()) return;
    collectStep5();
    go(6);
  };

  document.getElementById("prev6").onclick = () => go(5);
  document.getElementById("prev1").disabled = true;

  // ==================== NEW: Save as Draft ====================
  if (saveDraftBtn) {
    saveDraftBtn.onclick = async () => {
      try {
        // Disable buttons during save
        saveDraftBtn.disabled = true;
        publishTournamentBtn.disabled = true;

        // Show loading state
        showMessage("Saving draft...", "info");

        const payload = buildPayload("DRAFT");
        const result = await createTournament(payload); // ✨ await

        // Show success message
        showMessage(
          "✅ Tournament saved as draft! You can publish it anytime from the registrations page.",
          "success"
        );

        // Show "Create Another" button
        createAnotherBtn.style.display = "inline-block";

        // Disable save buttons after successful save
        saveDraftBtn.style.display = "none";
        publishTournamentBtn.style.display = "none";
      } catch (error) {
        console.error("Error saving draft:", error);
        showMessage("❌ Error saving draft. Please try again.", "error");
        saveDraftBtn.disabled = false;
        publishTournamentBtn.disabled = false;
      }
    };
  }

  // ==================== NEW: Publish Tournament ====================
  if (publishTournamentBtn) {
    publishTournamentBtn.onclick = async () => {
      try {
        // Disable buttons during save
        saveDraftBtn.disabled = true;
        publishTournamentBtn.disabled = true;

        // Show loading state
        showMessage("Publishing tournament...", "info");

        const payload = buildPayload("PUBLISHED");
        const result = await createTournament(payload); // ✨ await

        // Show success message
        showMessage(
          "✅ Tournament published successfully! Players can now register.",
          "success"
        );

        // Show "Create Another" button
        createAnotherBtn.style.display = "inline-block";

        // Disable save buttons after successful save
        saveDraftBtn.style.display = "none";
        publishTournamentBtn.style.display = "none";
      } catch (error) {
        console.error("Error publishing tournament:", error);
        showMessage(
          "❌ Error publishing tournament. Please try again.",
          "error"
        );
        saveDraftBtn.disabled = false;
        publishTournamentBtn.disabled = false;
      }
    };
  }

  // ==================== Cancel Button ====================
  if (cancelWizardBtn) {
    cancelWizardBtn.onclick = () => {
      if (
        confirm(
          "Are you sure you want to cancel? All unsaved changes will be lost."
        )
      ) {
        window.location.href = "dashboard.html";
      }
    };
  }

  // ==================== Create Another Button ====================
  if (createAnotherBtn) {
    createAnotherBtn.onclick = () => {
      // Reset all form fields
      document
        .querySelectorAll(
          'input[type="text"], input[type="number"], input[type="date"], input[type="time"], input[type="email"], input[type="tel"]'
        )
        .forEach((i) => (i.value = ""));

      // Reset checkboxes
      docChks.forEach((c) => (c.checked = false));
      needsApprovalEl.checked = false;

      // Reset selects
      sportEl.value = "";
      genderEl.value = "ANY";
      distRestrictEl.value = "DISTRICT_ONLY";

      // Reset radio buttons
      const knockoutRadio = document.querySelector(
        `input[name="${formatName}"][value="KNOCKOUT"]`
      );
      if (knockoutRadio) knockoutRadio.checked = true;

      // Reset file input
      bannerEl.value = "";
      if (bannerPreview) bannerPreview.style.display = "none";

      // Reset messages
      submitMsg.textContent = "";
      submitMsg.className = "";
      wizardMsg.textContent = "";

      // Prefill organizer again
      orgNameEl.value = admin.name || "";
      orgMobileEl.value = admin.mobile || "";
      orgEmailEl.value = admin.email || "";

      // Clear all errors
      document
        .querySelectorAll(".field-error")
        .forEach((e) => (e.textContent = ""));

      // Show buttons again
      if (saveDraftBtn) {
        saveDraftBtn.style.display = "inline-flex";
        saveDraftBtn.disabled = false;
      }
      if (publishTournamentBtn) {
        publishTournamentBtn.style.display = "inline-flex";
        publishTournamentBtn.disabled = false;
      }
      createAnotherBtn.style.display = "none";

      // Go to step 1
      go(1);
    };
  }

  // ==================== Navigation Helper ====================
  function go(n) {
    step = n;
    steps.forEach((s) => s.classList.remove("active"));
    const targetStep = document.querySelector(`.step-${n}`);
    if (targetStep) {
      targetStep.classList.add("active");
      wizardMsg.textContent = `Step ${n} of ${totalSteps}`;

      // Scroll to top of form
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  // ==================== Validation Functions ====================
  function validateStep1() {
    let ok = true;
    clearErrors(
      "e_name",
      "e_sport",
      "e_startDate",
      "e_startTime",
      "e_endDate",
      "e_endTime",
      "e_state",
      "e_district",
      "e_venue"
    );

    if (!nameEl.value.trim()) {
      setErr("e_name", "Tournament name is required");
      ok = false;
    }
    if (!sportEl.value) {
      setErr("e_sport", "Select a sport");
      ok = false;
    }
    if (!startDateEl.value) {
      setErr("e_startDate", "Start date is required");
      ok = false;
    }
    if (!startTimeEl.value) {
      setErr("e_startTime", "Start time is required");
      ok = false;
    }
    if (!endDateEl.value) {
      setErr("e_endDate", "End date is required");
      ok = false;
    }
    if (!endTimeEl.value) {
      setErr("e_endTime", "End time is required");
      ok = false;
    }
    if (!stateEl.value) {
      setErr("e_state", "State is required");
      ok = false;
    }
    if (!districtEl.value) {
      setErr("e_district", "District is required");
      ok = false;
    }
    if (!venueEl.value.trim()) {
      setErr("e_venue", "Venue is required");
      ok = false;
    }

    if (ok) {
      const startIso = toISO(startDateEl.value, startTimeEl.value);
      const endIso = toISO(endDateEl.value, endTimeEl.value);
      if (startIso >= endIso) {
        setErr("e_endTime", "End must be after start");
        ok = false;
      }
    }

    return ok;
  }

  function validateStep2() {
    clearErrors("e_ageRange");
    const min = toNum(ageMinEl.value);
    const max = toNum(ageMaxEl.value);

    if (min && max && min > max) {
      setErr("e_ageRange", "Age Min cannot exceed Age Max");
      return false;
    }

    return true;
  }

  function validateStep3() {
    clearErrors("e_lastDate");

    if (lastDateEl.value) {
      const last = new Date(lastDateEl.value + "T00:00:00");
      const start = new Date(startDateEl.value + "T00:00:00");
      if (last > start) {
        setErr("e_lastDate", "Last date must be on/before start date");
        return false;
      }
    }

    return true;
  }

  function validateStep5() {
    clearErrors("e_orgName", "e_orgMobile", "e_orgEmail");
    let ok = true;

    if (!orgNameEl.value.trim()) {
      setErr("e_orgName", "Organizer name required");
      ok = false;
    }

    if (!/^[0-9]{10}$/.test(orgMobileEl.value.trim())) {
      setErr("e_orgMobile", "Enter 10-digit mobile");
      ok = false;
    }

    if (!orgEmailEl.value.includes("@")) {
      setErr("e_orgEmail", "Enter valid email");
      ok = false;
    }

    return ok;
  }

  // ==================== Data Collection Functions ====================
  function collectStep1() {
    formData.basic = {
      name: nameEl.value.trim(),
      sport: sportEl.value,
      startDateTime: toISO(startDateEl.value, startTimeEl.value),
      endDateTime: toISO(endDateEl.value, endTimeEl.value),
      state: stateEl.value,
      district: districtEl.value,
      venue: venueEl.value.trim(),
    };
  }

  function collectStep2() {
    const formatInput = document.querySelector(
      `input[name="${formatName}"]:checked`
    );
    const format = formatInput ? formatInput.value : "KNOCKOUT";

    formData.rules = {
      eligibility: {
        ageMin: toNum(ageMinEl.value) || null,
        ageMax: toNum(ageMaxEl.value) || null,
        gender: genderEl.value || "ANY",
        districtRestricted: distRestrictEl.value === "DISTRICT_ONLY",
      },
      format,
      limits: {
        maxTeams: toNum(maxTeamsEl.value) || null,
        maxPlayers: toNum(maxPlayersEl.value) || null,
      },
    };
  }

  function collectStep3() {
    const docs = docChks.filter((c) => c.checked).map((c) => c.value);

    formData.registration = {
      fee: toNum(regFeeEl.value) || 0,
      documents: docs,
      lastDate: lastDateEl.value
        ? new Date(lastDateEl.value + "T00:00:00").toISOString()
        : null,
    };

    formData.needsApproval = !!needsApprovalEl.checked;
  }

  async function collectStep4() {
    const file = bannerEl.files && bannerEl.files[0];

    if (!file) {
      formData.media = { banner: "" };
      return;
    }

    try {
      const dataUrl = await compressImage(file, 1280, 0.8);
      formData.media = { banner: dataUrl };
    } catch (error) {
      console.error("Error compressing image:", error);
      formData.media = { banner: "" };
    }
  }

  function collectStep5() {
    formData.organizer = {
      name: orgNameEl.value.trim(),
      mobile: orgMobileEl.value.trim(),
      email: orgEmailEl.value.trim(),
    };
  }

  // ==================== NEW: Build Payload with Status ====================
  function buildPayload(status = "DRAFT") {
    return {
      ...formData.basic,
      ...formData.rules,
      registration: formData.registration,
      media: formData.media,
      organizer: formData.organizer,
      needsApproval: !!formData.needsApproval,
      status: status, // DRAFT or PUBLISHED
      createdBy: admin.id,
    };
  }

  // ==================== Helper Functions ====================
  function toISO(d, t) {
    return new Date(`${d}T${t}:00`).toISOString();
  }

  function toNum(v) {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  }

  function setErr(id, text) {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = text;
      // Add error class to corresponding input
      const input = el.previousElementSibling;
      if (input && (input.tagName === "INPUT" || input.tagName === "SELECT")) {
        input.classList.add("error");
      }
    }
  }

  function clearErrors(...ids) {
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.textContent = "";
        // Remove error class from corresponding input
        const input = el.previousElementSibling;
        if (
          input &&
          (input.tagName === "INPUT" || input.tagName === "SELECT")
        ) {
          input.classList.remove("error");
        }
      }
    });
  }

  function escapeHTML(str = "") {
    return String(str).replace(
      /[&<>"']/g,
      (m) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }[m])
    );
  }

  // ==================== NEW: Message Display Helper ====================
  function showMessage(text, type = "info") {
    if (!submitMsg) return;

    submitMsg.textContent = text;
    submitMsg.className = type; // 'success', 'error', or 'info'
    submitMsg.style.display = "block";
  }

  // ==================== Image Compression ====================
  async function compressImage(file, maxWidth = 1280, quality = 0.8) {
    const img = await fileToImage(file);
    const scale = Math.min(1, maxWidth / img.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    let dataUrl = canvas.toDataURL("image/jpeg", quality);

    // If still too large, reduce quality further
    if (dataUrl.length > 900_000) {
      dataUrl = canvas.toDataURL("image/jpeg", 0.7);
    }

    return dataUrl;
  }

  function fileToImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // ==================== Initialize ====================
  wizardMsg.textContent = `Step 1 of ${totalSteps}`;
});
