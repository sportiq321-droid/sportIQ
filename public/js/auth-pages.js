// public/js/auth-pages.js
import API from "./api.js";
import { loadData, saveData } from "./core/storage.js";

document.addEventListener("DOMContentLoaded", () => {
  const page = document.body.dataset.page;
  switch (page) {
    case "register":
      initRegister();
      break;
    case "login":
      initLogin();
      break;
    case "details":
      initDetails();
      break;
  }
});

/* ============== Bridge: backend user -> localStorage session ============== */
function syncLocalSession(apiUser) {
  if (!apiUser) return;
  const data = loadData();
  if (!Array.isArray(data.users)) data.users = [];
  let idx = data.users.findIndex(
    (u) => u.id === apiUser.id || u.email === apiUser.email
  );
  const local = idx !== -1 ? { ...data.users[idx] } : {};
  const merged = {
    ...local,
    id: apiUser.id,
    username: apiUser.username,
    email: apiUser.email,
    role: apiUser.role || local.role || "Player",
    sport: apiUser.sport ?? local.sport ?? "",
    name: apiUser.name ?? local.name ?? "",
    dob: apiUser.dob ? apiUser.dob.slice(0, 10) : local.dob || "",
    gender: apiUser.gender ?? local.gender ?? "",
    mobile: apiUser.mobile ?? local.mobile ?? "",
    profilePic: apiUser.profilePic ?? local.profilePic ?? "",
    height: apiUser.height ?? local.height ?? null,
    weight: apiUser.weight ?? local.weight ?? null,
    bloodgroup: apiUser.bloodgroup ?? local.bloodgroup ?? "",
    address: apiUser.address ?? local.address ?? "",
    achievements: Array.isArray(local.achievements) ? local.achievements : [],
    registeredTournaments: Array.isArray(local.registeredTournaments)
      ? local.registeredTournaments
      : [],
  };
  if (idx === -1) data.users.push(merged);
  else data.users[idx] = merged;
  data.currentUser = merged.id;
  saveData(data);
}

/* ========================= REGISTER ========================= */
function initRegister() {
  const form = document.getElementById("registerForm");
  if (!form) return;
  const msg = document.getElementById("msg");
  const usernameEl = document.getElementById("regUsername");
  const emailEl = document.getElementById("regEmail");
  const passEl = document.getElementById("regPass");
  const pass2El = document.getElementById("regPass2");
  const pass2ErrorEl = document.getElementById("regPass2Error");
  const emailErrorEl = document.getElementById("regEmailError");

  form.onsubmit = async (e) => {
    e.preventDefault();
    if (msg) msg.textContent = "";
    if (pass2ErrorEl) pass2ErrorEl.textContent = "";
    if (emailErrorEl) emailErrorEl.textContent = "";

    const username = usernameEl.value.trim();
    const email = emailEl.value.trim().toLowerCase();
    const pass = passEl.value;
    const pass2 = pass2El.value;

    if (pass !== pass2) {
      if (pass2ErrorEl) pass2ErrorEl.textContent = "Passwords do not match.";
      return;
    }

    const btn = form.querySelector('button[type="submit"]');
    if (window.setButtonLoading) window.setButtonLoading(btn, true);

    try {
      const me = await API.register({ username, email, password: pass });
      syncLocalSession(me);
      if (msg) {
        msg.textContent = "✅ Registered! Redirecting...";
        msg.style.color = "green";
      }
      setTimeout(() => (window.location.href = "details.html"), 800);
    } catch (err) {
      if (window.setButtonLoading) window.setButtonLoading(btn, false);
      
      // Check HTTP Status Code for exact error routing
      if (err.status === 409) {
        if (emailErrorEl) emailErrorEl.textContent = "Email or username already exists.";
        else if (msg) {
          msg.textContent = "❌ Email or username already exists.";
          msg.style.color = "red";
        }
      } else if (err.message && err.message.includes("Failed to fetch")) {
        if (msg) {
          msg.textContent = "❌ Network error. Please check your connection.";
          msg.style.color = "red";
        }
      } else {
        if (msg) {
          msg.textContent = "❌ " + (err.message || "Registration failed. Please try again.");
          msg.style.color = "red";
        }
      }
    }
  };
}

/* ========================= LOGIN ========================= */
function initLogin() {
  const form = document.getElementById("loginForm");
  if (!form) return;
  form.setAttribute("novalidate", "");
  const msg = document.getElementById("loginMessage");
  const identifierEl = document.getElementById("email");
  const passEl = document.getElementById("password");
  const showToggle = document.getElementById("showLoginPass");

  // Read optional returnTo for post-login redirection (e.g., assess-situps.html?results=true)
  const params = new URLSearchParams(window.location.search);
  const returnToRaw = params.get("returnTo");
  const returnTo = returnToRaw ? decodeURIComponent(returnToRaw) : null;

  if (showToggle) {
    showToggle.addEventListener("change", () => {
      passEl.type = showToggle.checked ? "text" : "password";
    });
  }

  form.onsubmit = async (e) => {
    e.preventDefault();
    const identifier = identifierEl.value.trim();
    const pass = passEl.value;
    const btn = form.querySelector('button[type="submit"]');

    // Use the global utility to prevent double-clicks
    if (window.setButtonLoading) window.setButtonLoading(btn, true);
    
    if (msg) {
      msg.textContent = "";
      msg.style.color = "red";
    }

    try {
      const me = await API.login({ identifier, password: pass });
      syncLocalSession(me);
      if (msg) {
        msg.textContent = "✅ Login successful!";
        msg.style.color = "green";
      }
      setTimeout(() => {
        // --- PROGRESSIVE ONBOARDING GUARD ---
        let needsOnboarding = false;

        // Helper to check if a value is truly empty (handles primitive null and string "null")
        const isEmpty = (val) => !val || String(val).trim() === "" || String(val).trim() === "null";

        // 1. Check Step 1 (Must have DOB to prove they passed the wizard)
        if (isEmpty(me.dob)) {
          needsOnboarding = true;
        } 
        // 2. Check Step 2 (Everyone must select a sport)
        else if (isEmpty(me.sport)) {
          needsOnboarding = true;
        }

        // Route the user
        if (needsOnboarding) {
          window.location.href = "details.html";
        } else {
          const urlParams = new URLSearchParams(window.location.search);
          const redirectUrl = urlParams.get("returnTo");
          window.location.href = redirectUrl ? decodeURIComponent(redirectUrl) : "dashboard.html";
        }
        // ------------------------------------
      }, 800);
    } catch (err) {
      if (window.setButtonLoading) window.setButtonLoading(btn, false);

      if (msg) {
        if (err.message && err.message.includes("Failed to fetch")) {
          msg.textContent = "❌ Network error. Please check your connection.";
        } else {
          msg.textContent = `❌ ${err.message || "Invalid email or password"}`;
        }
        msg.style.color = "red";
      }
    }
  };
}

/* ========================= DETAILS ========================= */
function initDetails() {
  guard().then((me) => runDetails(me));

  async function guard() {
    try {
      const me = await API.me();
      syncLocalSession(me);
      return me;
    } catch {
      window.location.href = "login.html";
      return null;
    }
  }

  function runDetails(me) {
    if (!me) return;

    const steps = {
      1: document.getElementById("step-1"),
      2: document.getElementById("step-2"),
      3: document.getElementById("step-3"),
    };

    // Step 1 refs
    const nameEl = document.getElementById("name");
    const dobEl = document.getElementById("dob");
    const ageEl = document.getElementById("age");
    const genderEl = document.getElementById("gender");
    const mobileEl = document.getElementById("mobile");
    const otpEl = document.getElementById("otp");
    const step1ErrorEl = document.getElementById("step1Error");
    const otpErrorEl = document.getElementById("otpError");
    const mobileErrorEl = document.getElementById("mobileError");

    // Step 2 refs
    const roleRadios = document.querySelectorAll('input[name="role"]');
    const primarySportBlock = document.getElementById("primarySportBlock");
    const sportSearch = document.getElementById("sportSearch");
    const sportChips = document.getElementById("sportChips");
    const sportError = document.getElementById("sportError");

    const certificateBlock = document.getElementById("certificateBlock");
    const addCertificateBtn = document.getElementById("addCertificateBtn");
    const certificateStatus = document.getElementById("certificateStatus");
    const certError = document.getElementById("certError");

    // Step 3 refs
    // NEW: support dual inputs (camera vs library) with fallback
    const profilePicInput = document.getElementById("profilePic"); // fallback (legacy single input)
    const profilePicInputCamera = document.getElementById("profilePicCamera"); // optional new input
    const profilePicInputLibrary = document.getElementById("profilePicLibrary"); // optional new input

    const profilePreview = document.getElementById("profilePreview");
    const avatarErrorEl = document.getElementById("avatarError");
    const cameraBtn = document.getElementById("cameraBtn");
    const libraryBtn = document.getElementById("libraryBtn");
    const removePhotoBtn = document.getElementById("removePhotoBtn");
    const previewOverlay = document.getElementById("previewOverlay");

    const defaultAvatarSrc =
      "https://lh3.googleusercontent.com/aida-public/AB6AXuCaRTUM1oLCpSsqn0-Jy4ehP-j6TP_dGHS8IC7ZxPzqc7eYfXpPo8C9qF8zL8XslcWuz_lj0qhlS2ecYL6B1s7T2GN72j4mOee-8-63FLWDOlvBUFYwLWwsDEfTB0v0gj-5lUqjRuyo36z5k3qiH-1jb4kHbDa4ZMAb3AyrmtRMwSfa-u6lpEENQlFnk2ZoPmH1glHvcNG0S2Sh5ZKkm6c54naVvy_B52BXDOD6V7Gs-Sg9Uzpwomz1fn2HnJDzU5Va1VYD7j-hOeU";

    const showStep = (n) => {
      Object.values(steps).forEach((s) => s.classList.remove("active"));
      if (steps[n]) steps[n].classList.add("active");
    };

    // Navigation
    document.getElementById("nextToRole").onclick = handleStep1Submit;
    document.getElementById("backToStep1").onclick = () => showStep(1);
    document.getElementById("nextToPic").onclick = handleStep2Submit;
    document.getElementById("backToStep2").onclick = () => showStep(2);
    document.getElementById("finishBtn").onclick = handleStep3Submit;
    document.getElementById("skipBtn").onclick = finishOnboarding;

    // Upload certificate button (Option B: persist role before redirect)
    if (addCertificateBtn) {
      addCertificateBtn.addEventListener("click", async () => {
        const role = getSelectedRole();
        if (!role) {
          alert("Please select a role.");
          return;
        }

        let sportValue = "";
        if (role === "Player") {
          const chipSelected = document.querySelector('input[name="sport"]:checked');
          sportValue = chipSelected ? chipSelected.value : "";
        } else if (role === "Coach") {
          const sportSearch = document.getElementById("sportSearch");
          sportValue = sportSearch?.value?.trim() || "";
        }

        if ((role === "Player" || role === "Coach") && !sportValue) {
          if (sportError) sportError.textContent = "Please select or type a sport before adding a certificate.";
          else alert("Please select or type a sport before uploading your certificate.");
          return;
        }

        try {
          const payload = { role };
          if (sportValue) payload.sport = sportValue;
          await API.updateMe(payload);
        } catch {
          // Non-fatal; proceed anyway
        }
        const q = role ? `?role=${encodeURIComponent(role)}` : "";
        window.location.href = `upload-certificate.html${q}`;
      });
    }

    // Age auto-calc (Step 1)
    dobEl.addEventListener("input", () => {
      if (dobEl.value) {
        const birthDate = new Date(dobEl.value);
        if (!isNaN(birthDate.getTime())) {
          const today = new Date();
          let age = today.getFullYear() - birthDate.getFullYear();
          const m = today.getMonth() - birthDate.getMonth();
          if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate()))
            age--;
          ageEl.value = age >= 0 ? age : "";
        } else {
          ageEl.value = "";
        }
      } else {
        ageEl.value = "";
      }
    });

    // Helper to update preview + clear overlay/error
    function updatePreview(src) {
      if (profilePreview) profilePreview.src = src;
      if (avatarErrorEl) avatarErrorEl.textContent = "";
      if (previewOverlay) {
        if (src === defaultAvatarSrc) previewOverlay.classList.remove("hidden");
        else previewOverlay.classList.add("hidden");
      }
    }

    // Step 3 — bind Camera/Library to distinct inputs when available (fallback to single)
    // --- CROSS-PLATFORM CAMERA UI FIX ---
    // Detect if the user is on a mobile device (iOS/Android)
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    if (cameraBtn) {
      if (!isMobile) {
        // Hide the camera button on desktops, as they don't support HTML native capture
        cameraBtn.style.display = "none";
      } else {
        cameraBtn.addEventListener("click", () => {
          const input = document.getElementById("profilePicCamera") || document.getElementById("profilePic");
          input?.click();
        });
      }
    }
    // ------------------------------------
    if (libraryBtn) {
      libraryBtn.addEventListener("click", () => {
        const input = profilePicInputLibrary || profilePicInput;
        input?.click();
      });
    }
    if (removePhotoBtn) {
      removePhotoBtn.addEventListener("click", () => {
        if (profilePicInput) profilePicInput.value = "";
        if (profilePicInputCamera) profilePicInputCamera.value = "";
        if (profilePicInputLibrary) profilePicInputLibrary.value = "";
        updatePreview(defaultAvatarSrc);
      });
    }

    // Attach change handlers to each present input
    function bindInputChange(inputEl) {
      if (!inputEl) return;
      inputEl.addEventListener("change", (event) => {
        const file = event.target.files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (e) => {
            updatePreview(e.target.result);
          };
          reader.readAsDataURL(file);
        }
      });
    }
    bindInputChange(profilePicInput); // legacy fallback
    bindInputChange(profilePicInputCamera); // camera input
    bindInputChange(profilePicInputLibrary); // library input

    // Clear mobile error on input
    if (mobileEl && mobileErrorEl) {
      mobileEl.addEventListener(
        "input",
        () => (mobileErrorEl.textContent = "")
      );
    }

    // Step 2 — Role toggles
    roleRadios.forEach((r) => {
      r.addEventListener("change", () => {
        sportError.textContent = "";
        certError.textContent = "";
        toggleRoleUI();
      });
    });

    // Helper: selected role
    function getSelectedRole() {
      const r = document.querySelector('input[name="role"]:checked');
      return r ? r.value : null;
    }

    // Helper: fetch and update certificate status pill
    async function refreshCertificateStatus() {
      const urlParams = new URLSearchParams(window.location.search);
      const justUploaded = urlParams.get("cert") === "uploaded";

      if (justUploaded && certificateStatus) {
        certificateStatus.classList.remove("hidden");
        certificateStatus.innerHTML = `<span class="material-symbols-outlined" style="font-size:16px">check_circle</span><span>Successfully uploaded</span>`;
        certificateStatus.style.color = "#4ade80"; // text-green-400
        certificateStatus.style.background = "rgba(74, 222, 128, 0.12)";
        certificateStatus.style.borderColor = "rgba(74, 222, 128, 0.3)";
        return true;
      }

      try {
        const doc = await API.getCertificate();
        if (doc && certificateStatus) {
          certificateStatus.classList.remove("hidden");
        } else {
          certificateStatus?.classList.add("hidden");
        }
        return !!doc;
      } catch {
        certificateStatus?.classList.add("hidden");
        return false;
      }
    }

    // Toggle UI based on role
    async function toggleRoleUI() {
      const role = getSelectedRole();

      primarySportBlock.classList.add("hidden");
      sportChips.classList.add("hidden");
      certificateBlock.classList.add("hidden");

      if (role === "Player") {
        primarySportBlock.classList.remove("hidden");
        sportChips.classList.remove("hidden");
        certificateStatus?.classList.add("hidden");
      } else if (role === "Coach") {
        primarySportBlock.classList.remove("hidden");
        sportChips.classList.add("hidden"); // search-only
        certificateBlock.classList.remove("hidden");
        await refreshCertificateStatus();
      } else if (role === "Admin" || role === "Government Official") {
        certificateBlock.classList.remove("hidden");
        await refreshCertificateStatus();
      }
    }

    // --- Step 1 handler ---
    async function handleStep1Submit() {
      if (step1ErrorEl) step1ErrorEl.textContent = "";
      if (otpErrorEl) otpErrorEl.textContent = "";
      if (mobileErrorEl) mobileErrorEl.textContent = "";

      // 1. Manual Validation
      if (!nameEl.value.trim()) return alert("Please enter your full name.");
      if (!dobEl.value) return alert("Please select your date of birth.");
      if (!genderEl.value) return alert("Please select your gender.");
      if (!mobileEl.value.trim() || mobileEl.value.length < 10) return alert("Please enter a valid mobile number.");

      // 2. Safe Date Parsing
      let isoDate;
      try {
        const parsedDate = new Date(dobEl.value);
        const year = parsedDate.getFullYear();
        const currentYear = new Date().getFullYear();
        
        if (year < 1900 || year > currentYear) {
          return alert(`Please enter a valid year of birth (between 1900 and ${currentYear}).`);
        }
        isoDate = parsedDate.toISOString();
      } catch (e) {
        return alert("Invalid date format. Please select a valid date.");
      }

      const otpClean = otpEl.value.replace(/\s+/g, "").trim();
      if (otpClean !== "123456") {
        if (otpErrorEl) otpErrorEl.textContent = "Invalid OTP (use 123456).";
        otpEl.focus();
        return;
      }

      try {
        const payload = {
          name: nameEl.value.trim(),
          dob: isoDate,
          gender: genderEl.value,
          mobile: mobileEl.value.trim(),
        };
        const updated = await API.updateMe(payload);
        syncLocalSession(updated);
        showStep(2);
        toggleRoleUI();
      } catch (err) {
        const msg = (err && err.message) || "An error occurred.";
        if (step1ErrorEl) step1ErrorEl.textContent = msg;
        if (mobileErrorEl && typeof msg === "string") {
          const low = msg.toLowerCase();
          if (low.includes("mobile") || low.includes("10")) {
            mobileErrorEl.textContent = msg;
            mobileEl?.focus();
          }
        }
      }
    }

    // --- Step 2 handler ---
    async function handleStep2Submit() {
      const role = getSelectedRole();
      const chipSelected = document.querySelector(
        'input[name="sport"]:checked'
      );
      const searchValue = sportSearch?.value?.trim() || "";

      if (!role) {
        alert("Please select a role.");
        return;
      }

      let needsCert = false; // keep variable for compatibility; no roles require certificate now
      let needsSport = false;
      let sportValue = "";

      if (role === "Player") {
        needsSport = true;
        sportValue = chipSelected ? chipSelected.value : "";
      } else if (role === "Coach") {
        needsSport = true;
        sportValue = searchValue;
        // certificate no longer required for Coach
      } else if (role === "Admin" || role === "Government Official") {
        // certificate no longer required for Admin/Government
      }

      sportError.textContent = "";
      certError.textContent = "";

      if (needsSport && !sportValue) {
        sportError.textContent = "Please select or type a sport.";
        return;
      }

      try {
        const payload = { role };
        if (sportValue) payload.sport = sportValue;
        const updated = await API.updateMe(payload);
        syncLocalSession(updated);
        showStep(3);
      } catch (err) {
        alert(`Error: ${err.message}`);
      }
    }

    // --- Step 3 handler ---
    async function handleStep3Submit() {
      // Prefer camera, then library, then fallback single
      const file =
        (profilePicInputCamera &&
          profilePicInputCamera.files &&
          profilePicInputCamera.files[0]) ||
        (profilePicInputLibrary &&
          profilePicInputLibrary.files &&
          profilePicInputLibrary.files[0]) ||
        (profilePicInput && profilePicInput.files && profilePicInput.files[0]);

      if (file) {
        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            const updated = await API.updateMe({ profilePic: e.target.result });
            syncLocalSession(updated);
            finishOnboarding();
          } catch (err) {
            alert(`Error uploading image: ${err.message}`);
          }
        };
        reader.readAsDataURL(file);
      } else {
        finishOnboarding();
      }
    }

    function finishOnboarding() {
      alert("Profile setup complete! Please log in.");
      window.location.href = "login.html";
    }

    // Prefill Step 1/2
    const u = me || {};
    if (u.name) nameEl.value = u.name;
    if (u.dob) {
      dobEl.value = u.dob.slice(0, 10);
      dobEl.dispatchEvent(new Event("change"));
    }
    if (u.gender) genderEl.value = u.gender;
    if (u.mobile) mobileEl.value = u.mobile;
    if (u.role) {
      const roleRadio = document.querySelector(
        `input[name="role"][value="${u.role}"]`
      );
      if (roleRadio) roleRadio.checked = true;
    }
    if (u.sport) {
      const sportRadio = document.querySelector(
        `input[name="sport"][value="${u.sport}"]`
      );
      if (sportRadio) sportRadio.checked = true;
      if (sportSearch) sportSearch.value = u.sport;
    }

    // Initial step choice (honor hash to force Step 2 on return)
    const isEmpty = (val) => !val || String(val).trim() === "" || String(val).trim() === "null";
    const hasStep1Data = !isEmpty(u.name) && !isEmpty(u.dob) && !isEmpty(u.gender) && !isEmpty(u.mobile);
    const hasStep2Data = Boolean(u.role && u.sport && String(u.sport).trim() !== "" && String(u.sport).trim() !== "null");
    const hash = (window.location.hash || "").toLowerCase();

    if (hash === "#step-1") {
      showStep(1);
    } else if (hash === "#step-2") {
      showStep(2);
      toggleRoleUI();
    } else if (!hasStep1Data) {
      showStep(1);
    } else if (!hasStep2Data) {
      showStep(2);
      toggleRoleUI();
    } else {
      showStep(3);
    }
  }
}