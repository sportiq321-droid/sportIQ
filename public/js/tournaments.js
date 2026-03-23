// js/tournaments.js
// In-page results list (no hero). Hide search UI on show. One sample fallback.
// Admin-published ribbon only for admin (_source === "admin"). Use banner or sport placeholder.
// Now with sport-specific image resolver: local thumb (webp/jpg) → Unsplash fallback.

import { requireLogin } from "./core/auth.js";
import { getCurrentUser } from "./modules/users.js";
import { loadData } from "./core/storage.js";
import {
  registerForTournament,
  isRegistered,
  getPublishedTournamentsByLocation,
} from "./modules/tournaments.js";

requireLogin();
const user = getCurrentUser();
if (!user || user.role !== "Player") {
  window.location.href = "dashboard.html";
}

let selectedState = "";
let selectedDistrict = "";
let currentList = [];
let searchQ = "";

window.addEventListener("DOMContentLoaded", () => {
  const dataset =
    window.statesAndDistricts && Object.keys(window.statesAndDistricts).length
      ? window.statesAndDistricts
      : fallbackStatesAndDistricts();

  // Elements
  const stateList = document.getElementById("stateList");
  const stateInput = document.getElementById("stateInput");
  const districtList = document.getElementById("districtList");
  const districtInput = document.getElementById("districtInput");
  const stateErr = document.getElementById("stateErr");
  const districtErr = document.getElementById("districtErr");
  const queryInput = document.getElementById("query");
  const showRow = document.getElementById("showRow");
  const showBtn = document.getElementById("showBtn");
  const searchBlock = document.getElementById("searchBlock");

  // Populate states once
  Object.keys(dataset).forEach((state) => {
    const opt = document.createElement("option");
    opt.value = state;
    stateList.appendChild(opt);
  });

  // Show CTA only when both valid
  const updateShowRow = () => {
    const cs = resolveState(dataset, stateInput.value || selectedState);
    const cd = cs
      ? matchDistrict(dataset, cs, districtInput.value || selectedDistrict)
      : null;
    const ok = !!(cs && cd);
    showRow?.classList.toggle("hidden", !ok);
  };

  // Autofill from search
  const onQueryInput = () => {
    const q = (queryInput?.value || "").trim();
    if (q.length < 2) {
      updateShowRow();
      return;
    }

    let qState = null;
    let qDistrict = null;

    if (q.length < 4) {
      const gd = findUniqueDistrictGlobal(dataset, q);
      if (gd) {
        qState = gd.state;
        qDistrict = gd.district;
      }
    }
    if (!qState) qState = resolveStateFromQuery(dataset, q);

    if (qState) {
      if (selectedState !== qState) {
        selectedState = qState;
        stateInput.value = qState;

        districtList.innerHTML = "";
        (dataset[qState] || []).forEach((d) => {
          const opt = document.createElement("option");
          opt.value = d;
          districtList.appendChild(opt);
        });
        stateErr.textContent = "";

        switchStep(2);
      }
    }

    if (!qDistrict && selectedState) {
      qDistrict = matchDistrict(dataset, selectedState, q);
    }
    if (qDistrict) {
      selectedDistrict = qDistrict;
      districtInput.value = qDistrict;
      districtErr.textContent = "";
      switchStep(2);
    }

    updateShowRow();
  };

  // State handlers
  const onStateInput = () => {
    stateErr.textContent = "";
    const cs = resolveState(dataset, stateInput.value || "");
    selectedState = cs || "";

    districtList.innerHTML = "";
    if (cs) {
      (dataset[cs] || []).forEach((d) => {
        const opt = document.createElement("option");
        opt.value = d;
        districtList.appendChild(opt);
      });
      switchStep(2);
    }
    updateShowRow();
  };
  stateInput.addEventListener("input", onStateInput);
  stateInput.addEventListener("change", onStateInput);

  // District handlers
  const onDistrictInput = () => {
    districtErr.textContent = "";
    const cs = resolveState(dataset, stateInput.value || selectedState);
    if (cs) switchStep(2);
    updateShowRow();
  };
  districtInput.addEventListener("input", onDistrictInput);
  districtInput.addEventListener("change", onDistrictInput);

  // Search handler
  queryInput?.addEventListener("input", onQueryInput);

  // Legacy Next still supported
  document.getElementById("nextBtn")?.addEventListener("click", () => {
    const cs = resolveState(dataset, stateInput.value || "");
    if (!cs) {
      stateErr.textContent = "Please pick a valid state from the list.";
      return;
    }
    selectedState = cs;

    districtList.innerHTML = "";
    (dataset[cs] || []).forEach((d) => {
      const opt = document.createElement("option");
      opt.value = d;
      districtList.appendChild(opt);
    });
    districtErr.textContent = "";
    switchStep(2);
    updateShowRow();
  });

  // Core show handler → render list in-place and hide searchBlock
  const handleShow = () => {
    const cs = resolveState(dataset, stateInput.value || selectedState);
    if (!cs) {
      stateErr.textContent = "Please pick a valid state from the list.";
      return;
    }
    selectedState = cs;

    const rawDistrict = districtInput.value || selectedDistrict || "";
    const cd = matchDistrict(dataset, selectedState, rawDistrict);
    if (!cd) {
      districtErr.textContent = "Please pick a valid district from the list.";
      return;
    }
    selectedDistrict = cd;

    searchQ = (queryInput?.value || "").trim();

    const adminList = getPublishedTournamentsByLocation(
      selectedState,
      selectedDistrict
    );

    const hint = document.getElementById("fallbackHint");
    const list = adminList.length
      ? adminList
      : makeSampleTournaments(selectedState, selectedDistrict, user?.sport); // one sample only

    currentList = applyQFilter(list, searchQ);

    // Hide search UI and show list section
    if (searchBlock) searchBlock.classList.add("hidden");
    switchStep(2);
    updateResultsBadge(currentList.length);

    if (!adminList.length) {
      hint.textContent =
        "No admin-published tournaments found. Showing a sample.";
      hint.classList.remove("hidden");
    } else {
      hint.classList.add("hidden");
    }

    renderTournamentsList(currentList);
  };

  showBtn.onclick = handleShow;

  // Back from details
  document.getElementById("backToList").onclick = () => switchStep(2);

  // URL param prefill + auto-run
  const params = new URLSearchParams(window.location.search);
  const pState = params.get("state") || "";
  const pDistrict = params.get("district") || "";
  searchQ = (params.get("q") || "").trim();
  if (queryInput && searchQ) queryInput.value = searchQ;

  if (pState) {
    const cs = resolveState(dataset, pState);
    if (cs) {
      selectedState = cs;
      stateInput.value = cs;

      districtList.innerHTML = "";
      (dataset[cs] || []).forEach((d) => {
        const opt = document.createElement("option");
        opt.value = d;
        districtList.appendChild(opt);
      });

      switchStep(2);
      updateShowRow();

      if (pDistrict) {
        const cd = matchDistrict(dataset, cs, pDistrict);
        if (cd) {
          selectedDistrict = cd;
          districtInput.value = cd;
          handleShow(); // auto-run for deep link
          return;
        }
      }
    }
  }

  // Initial
  updateShowRow();
});

/* -------- Render list (no hero) -------- */
function renderTournamentsList(list) {
  const wrap = document.getElementById("tournamentList");
  if (!wrap) return;

  if (!list.length) {
    wrap.innerHTML =
      '<div class="glassmorphic rounded-lg p-4 text-white/80">No tournaments found.</div>';
    return;
  }

  const data = loadData(); // for admin banner lookup
  const html = list
    .map((t, idx) => {
      // Admin banner or resolve to sport-specific thumb (local → Unsplash)
      let banner = t.media?.banner || t.banner;
      let hasBanner = !!banner;

      if (!banner && t._source === "admin") {
        const tt = (data.tournaments || []).find((x) => x.id === t.id);
        banner = tt?.media?.banner;
        hasBanner = !!banner;
      }

      // Initial URL: if no banner, use Unsplash placeholder now; we'll upgrade to local if found
      if (!banner) banner = sportThumbPlaceholder(t.sport);

      const publishedRibbon =
        t._source === "admin"
          ? '<span class="ml-auto rounded-full bg-primary/80 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur-sm">Admin Published</span>'
          : "";

      const dateStr =
        t.date || formatShortRange(t.startDateTime, t.endDateTime);
      const venue = t.venue || "-";

      return `
      <div class="glassmorphic flex items-center gap-4 rounded-lg p-3 cursor-pointer" data-id="${escapeAttr(
        t.id
      )}" data-sport="${escapeAttr(t.sport || "")}" data-hasbanner="${
        hasBanner ? "1" : "0"
      }">
        <div class="h-20 w-20 flex-shrink-0 rounded bg-cover bg-center thumb-img" style="background-image:url('${banner}')"></div>
        <div class="min-w-0">
          <div class="flex items-start gap-2">
            <h3 class="font-bold text-white truncate">${escapeHtml(t.name)}</h3>
            ${publishedRibbon}
          </div>
          <p class="text-sm text-white/70 truncate">${escapeHtml(
            dateStr
          )} · ${escapeHtml(venue)}</p>
        </div>
      </div>`;
    })
    .join("");

  wrap.innerHTML = html;

  // Upgrade thumbnails to local images if available (non-blocking)
  wrap.querySelectorAll(".thumb-img").forEach((el) => {
    const parent = el.closest("[data-id]");
    if (!parent) return;
    const hasBanner = parent.getAttribute("data-hasbanner") === "1";
    if (hasBanner) return; // admin banner already set

    const sport = parent.getAttribute("data-sport") || "";
    upgradeThumbToLocal(el, sport);
  });

  // Click to details
  wrap.querySelectorAll("[data-id]").forEach((card) => {
    card.addEventListener("click", () => {
      const id = card.getAttribute("data-id");
      const t = currentList.find((x) => x.id === id);
      if (t) showDetails(t);
    });
  });
}

/* -------- Details + Register (updated UI-only bindings) -------- */
function showDetails(t) {
  // Core fields (unchanged behavior)
  document.getElementById("dName").textContent = t.name || "-";
  document.getElementById("dDate").textContent =
    t.date || formatShortRange(t.startDateTime, t.endDateTime) || "-";
  document.getElementById("dVenue").textContent = t.venue || "-";
  document.getElementById("dSport").textContent = t.sport || "-";
  document.getElementById("dDesc").textContent = t.description || "";

  // NEW: Banner background (UI-only)
  const bannerEl = document.getElementById("dBanner");
  if (bannerEl) {
    const banner =
      (t.media && t.media.banner) ||
      t.banner ||
      sportThumbPlaceholder(t.sport, 1200, 480);
    bannerEl.style.backgroundImage = `url('${banner}')`;
  }

  // NEW: Required Documents (always render; show "None" if empty)
  const docsList = document.getElementById("dDocsList");
  const docsNone = document.getElementById("dDocsNone");
  if (docsList && docsNone) {
    docsList.innerHTML = "";
    const docs =
      t.registration && Array.isArray(t.registration.documents)
        ? t.registration.documents
        : [];
    if (docs.length) {
      docs.forEach((d) => {
        const li = document.createElement("li");
        li.textContent = String(d || "").trim() || "-";
        docsList.appendChild(li);
      });
      docsNone.classList.add("hidden");
    } else {
      docsNone.classList.remove("hidden");
    }
  }

  // NEW: Fees & Deadlines (always render; show "None" if missing)
  const feeRow = document.getElementById("dFeeRow");
  const feeEl = document.getElementById("dFee");
  const deadlineRow = document.getElementById("dDeadlineRow");
  const deadlineEl = document.getElementById("dDeadline");
  const feesNone = document.getElementById("dFeesNone");

  let hasAnyFees = false;

  if (feeRow && feeEl) {
    const fee = t.registration && t.registration.fee;
    if (fee !== undefined && fee !== null && String(fee).trim() !== "") {
      const feeStr =
        typeof fee === "number"
          ? `₹${fee}`
          : String(fee).trim().startsWith("₹")
          ? String(fee).trim()
          : `₹${String(fee).trim()}`;
      feeEl.textContent = feeStr;
      feeRow.classList.remove("hidden");
      hasAnyFees = true;
    } else {
      feeRow.classList.add("hidden");
    }
  }

  if (deadlineRow && deadlineEl) {
    const lastDate = t.registration && t.registration.lastDate;
    if (lastDate) {
      const d = new Date(lastDate);
      if (!isNaN(d)) {
        deadlineEl.textContent = d.toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        });
        deadlineRow.classList.remove("hidden");
        hasAnyFees = true;
      } else {
        deadlineRow.classList.add("hidden");
      }
    } else {
      deadlineRow.classList.add("hidden");
    }
  }

  if (feesNone) {
    feesNone.classList.toggle("hidden", hasAnyFees);
  }

  // Register button (UPDATED per your redirect flow)
  // ✨ UPDATED: Register button with async backend support
  const btn = document.getElementById("registerBtn");
  const note = document.getElementById("dRegistrationNote");

  if (isRegistered(t.id)) {
    btn.textContent = "✅ Registered";
    btn.disabled = true;
  } else {
    btn.textContent = "Register";
    btn.disabled = false;

    // ✨ NEW: Async handler with loading state
    btn.onclick = async () => {
      // Prevent double-clicks
      if (btn.disabled) return;

      // Show loading state
      btn.disabled = true;
      btn.textContent = "⏳ Registering...";

      try {
        // ✨ NEW: Call async backend API
        const result = await registerForTournament(t);

        if (!result.success) {
          // Registration failed
          btn.disabled = false;
          btn.textContent = "Register";

          if (result.alreadyRegistered) {
            if (note) {
              note.textContent =
                "You are already registered for this tournament";
              note.classList.remove("hidden");
            } else {
              alert("You are already registered for this tournament");
            }
          } else {
            if (note) {
              note.textContent =
                result.message || "Registration failed. Please try again.";
              note.classList.remove("hidden");
            } else {
              alert(result.message || "Registration failed. Please try again.");
            }
          }
          return;
        }

        // ✨ NEW: Success - show different messages based on status
        btn.textContent = "✅ Registered";
        btn.disabled = true;

        if (note) {
          if (result.status === "PENDING") {
            note.textContent =
              "Registration submitted for approval. Check 'My Tournaments' for status.";
          } else {
            note.textContent =
              "Registration confirmed!";
          }
          note.classList.remove("hidden");
        }
      } catch (error) {
        console.error("Registration error:", error);

        // Reset button state
        btn.disabled = false;
        btn.textContent = "Register";

        // Show error message
        if (note) {
          note.textContent =
            error.message || "Registration failed. Please try again.";
          note.classList.remove("hidden");
        } else {
          alert(error.message || "Registration failed. Please try again.");
        }
      }
    };
  }

  // Show details step (unchanged)
  switchStep(3);
}

/* -------- Helpers -------- */
function canon(s) {
  return String(s || "")
    .trim()
    .toLowerCase();
}
function squash(s) {
  return canon(s).replace(/[\s._\-&()]/g, "");
}
const STATE_ABBREV = {
  AP: "Andhra Pradesh",
  AS: "Assam",
  BR: "Bihar",
  DL: "Delhi",
  DEL: "Delhi",
  GA: "Goa",
  GJ: "Gujarat",
  HR: "Haryana",
  HP: "Himachal Pradesh",
  JK: "Jammu and Kashmir",
  "J&K": "Jammu and Kashmir",
  JH: "Jharkhand",
  KA: "Karnataka",
  KAR: "Karnataka",
  KL: "Kerala",
  MP: "Madhya Pradesh",
  MH: "Maharashtra",
  OR: "Odisha",
  OD: "Odisha",
  PB: "Punjab",
  RJ: "Rajasthan",
  SK: "Sikkim",
  TN: "Tamil Nadu",
  TS: "Telangana",
  TG: "Telangana",
  TR: "Tripura",
  UP: "Uttar Pradesh",
  UK: "Uttarakhand",
  UT: "Uttarakhand",
  WB: "West Bengal",
  CH: "Chandigarh",
  CT: "Chhattisgarh",
  CG: "Chhattisgarh",
  AN: "Andaman and Nicobar Islands",
  DN: "Dadra and Nagar Haveli and Daman and Diu",
  DD: "Dadra and Nagar Haveli and Daman and Diu",
  LD: "Lakshadweep",
  PY: "Puducherry",
};

function resolveState(dataset, input) {
  const key = canon(input);
  if (!key) return null;

  const code = squash(input).toUpperCase();
  if (STATE_ABBREV[code] && dataset[STATE_ABBREV[code]])
    return STATE_ABBREV[code];

  const states = Object.keys(dataset || {});
  let found =
    states.find((st) => canon(st) === key || squash(st) === squash(input)) ||
    states.find(
      (st) => squash(st).startsWith(squash(input)) || key.startsWith(canon(st))
    );

  if (found) return found;

  if (squash(input).length >= 5) {
    found = states.find(
      (st) => squash(st).includes(squash(input)) || canon(st).includes(key)
    );
    if (found) return found;
  }
  return null;
}

function resolveStateFromQuery(dataset, q) {
  const tokens = canon(q)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  for (const t of tokens) {
    const name = STATE_ABBREV[t.toUpperCase()];
    if (name && dataset[name]) return name;
  }
  let st = resolveState(dataset, q);
  if (st) return st;
  for (let i = 0; i < tokens.length; i++) {
    for (let j = i; j < Math.min(tokens.length, i + 3); j++) {
      const seg = tokens.slice(i, j + 1).join(" ");
      st = resolveState(dataset, seg);
      if (st) return st;
    }
  }
  return null;
}

function findUniqueDistrictGlobal(dataset, input) {
  const key = canon(input);
  if (key.length < 3) return null;

  let hit = null;
  let hits = 0;
  const states = Object.keys(dataset || {});
  for (const st of states) {
    const list = dataset[st] || [];
    const norm = list.map((d) => ({
      raw: d,
      full: canon(d),
      base: canon(d.split("(")[0]),
    }));
    const found =
      norm.find((n) => n.full === key || n.base === key) ||
      norm.find((n) => n.full.startsWith(key) || n.base.startsWith(key)) ||
      (key.length >= 5 &&
        norm.find((n) => n.full.includes(key) || n.base.includes(key)));
    if (found) {
      hits++;
      hit = { state: st, district: found.raw };
      if (hits > 1) break;
    }
  }
  return hits === 1 ? hit : null;
}

function matchDistrict(dataset, stateKey, input) {
  if (!stateKey) return null;
  const list = dataset[stateKey] || [];
  const key = canon(input);
  if (!key) return null;
  const norm = list.map((d) => ({
    raw: d,
    full: canon(d),
    base: canon(d.split("(")[0]),
  }));
  let found =
    norm.find((n) => n.full === key) || norm.find((n) => n.base === key);
  if (found) return found.raw;
  found = norm.find(
    (n) =>
      n.full.startsWith(key) ||
      key.startsWith(n.full) ||
      n.base.startsWith(key) ||
      key.startsWith(n.base)
  );
  if (found) return found.raw;
  found = norm.find((n) => n.full.includes(key) || n.base.includes(key));
  return found ? found.raw : null;
}

function updateResultsBadge(n) {
  const b = document.getElementById("findResultsBadge");
  if (!b) return;
  b.textContent = n;
  b.classList.remove("hidden");
}

function applyQFilter(list, q) {
  const qn = canon(q);
  if (!qn) return list;
  return list.filter((t) => {
    const hitName = canon(t.name).includes(qn);
    const hitVenue = canon(t.venue).includes(qn);
    const hitDistrict = canon(t.district).includes(qn);
    const hitState = canon(t.state).includes(qn);
    return hitName || hitVenue || hitDistrict || hitState;
  });
}

function switchStep(step) {
  document
    .querySelectorAll(".t-step")
    .forEach((s) => s.classList.add("hidden"));
  const el = document.querySelector(`.t-step-${step}`);
  if (el) el.classList.remove("hidden");
  if (el) el.classList.add("active");
}

/* ---------- Formatting & placeholders ---------- */
function formatShortRange(startISO, endISO) {
  if (!startISO) return "";
  const s = new Date(startISO);
  const e = endISO ? new Date(endISO) : null;
  const mo = (d) =>
    d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (!e) return mo(s);
  if (s.toDateString() === e.toDateString()) return mo(s);
  return `${mo(s)} - ${mo(e)}`;
}

// Initial Unsplash placeholder (sync)
function sportThumbPlaceholder(sport = "", w = 160, h = 160) {
  const q = sportSlug(sport) || "sports";
  return `https://source.unsplash.com/featured/${w}x${h}/?${encodeURIComponent(
    q
  )},stadium`;
}

/* ---------- Sport → slug + thumbnail resolver ---------- */
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

function sportSlug(sport) {
  const s = canon(sport);
  if (!s) return "sports";
  for (const [slug, list] of Object.entries(SPORT_SLUGS)) {
    if (list.some((alias) => s === alias)) return slug;
  }
  // loose contains as last resort
  for (const [slug, list] of Object.entries(SPORT_SLUGS)) {
    if (list.some((alias) => s.includes(alias))) return slug;
  }
  return "sports";
}

// Try to upgrade a thumb from Unsplash to local (webp/jpg) if present
function upgradeThumbToLocal(el, sport) {
  const slug = sportSlug(sport);
  const candidates = [
    `img/sports/thumb/${slug}.webp`,
    `img/sports/thumb/${slug}.jpg`,
    // optional generic fallback if you add it later:
    // `img/sports/thumb/generic.webp`,
    // `img/sports/thumb/generic.jpg`,
  ];
  tryLoadSequential(candidates).then((url) => {
    if (url) {
      // Update only if still present
      el.style.backgroundImage = `url('${url}')`;
    }
  });
}

function tryLoadSequential(urls) {
  return new Promise((resolve) => {
    const tryNext = (i) => {
      if (i >= urls.length) return resolve(null);
      const img = new Image();
      img.onload = () => resolve(urls[i]);
      img.onerror = () => tryNext(i + 1);
      img.src = urls[i];
    };
    tryNext(0);
  });
}

/* ---------- Samples (one only) ---------- */
function makeSampleTournaments(state, district, preferSport) {
  const d1 = new Date(); d1.setDate(d1.getDate() + 7);
  const d2 = new Date(); d2.setDate(d2.getDate() + 9);
  const d3 = new Date(); d3.setDate(d3.getDate() + 14);
  const d4 = new Date(); d4.setDate(d4.getDate() + 16);
  const d5 = new Date(); d5.setDate(d5.getDate() + 21);
  const d6 = new Date(); d6.setDate(d6.getDate() + 22);

  const fmt = (d) => d.toLocaleString(undefined, { month: "short", day: "numeric" });

  return [
    {
      id: `sample_1_${Date.now()}`,
      name: `${district} Premier ${preferSport || 'Cricket'} League`,
      date: `${fmt(d1)} - ${fmt(d2)}`,
      venue: `${district} Central Stadium`,
      sport: preferSport || 'Cricket',
      state,
      district,
      description: `The biggest ${preferSport || 'Cricket'} tournament in ${district}. Open to all local clubs and academies.`,
      needsApproval: false,
      _source: "sample",
      registration: { fee: "₹500", lastDate: d1.toISOString() }
    },
    {
      id: `sample_2_${Date.now()}`,
      name: `State Level Football Cup`,
      date: `${fmt(d3)} - ${fmt(d4)}`,
      venue: `${district} Sports Complex`,
      sport: 'Football',
      state,
      district,
      description: `A competitive state-level football cup hosted in ${district}. Show your skills on the big stage.`,
      needsApproval: true,
      _source: "sample",
      registration: { fee: "₹1000", lastDate: d3.toISOString() }
    },
    {
      id: `sample_3_${Date.now()}`,
      name: `${district} Badminton Open`,
      date: `${fmt(d5)} - ${fmt(d6)}`,
      venue: `${district} Indoor Arena`,
      sport: 'Badminton',
      state,
      district,
      description: `Open badminton tournament for singles and doubles categories. Exciting prizes to be won.`,
      needsApproval: false,
      _source: "sample",
      registration: { fee: "₹300", lastDate: d5.toISOString() }
    },
    {
      id: `sample_4_${Date.now()}`,
      name: `Youth Athletics Meet`,
      date: `${fmt(d1)}`,
      venue: `${district} University Ground`,
      sport: 'Athletics',
      state,
      district,
      description: `Track and field events for U-18 athletes. A great platform for young talent.`,
      needsApproval: false,
      _source: "sample",
      registration: { fee: "Free", lastDate: d1.toISOString() }
    },
    {
      id: `sample_5_${Date.now()}`,
      name: `Pro Kabaddi Challenge`,
      date: `${fmt(d3)} - ${fmt(d5)}`,
      venue: `${district} Community Hall`,
      sport: 'Kabaddi',
      state,
      district,
      description: `High-octane Kabaddi action featuring top teams from the district and surrounding areas.`,
      needsApproval: true,
      _source: "sample",
      registration: { fee: "₹800", lastDate: d3.toISOString() }
    },
  ];
}

/* ---------- Fallback dataset ---------- */
function fallbackStatesAndDistricts() {
  return {
    "Andhra Pradesh": ["Guntur", "Krishna"],
    Delhi: ["Central Delhi", "South Delhi", "West Delhi"],
    Karnataka: ["Bengaluru Urban", "Mysuru"],
    Maharashtra: ["Mumbai Suburban", "Pune"],
    "Tamil Nadu": ["Chennai", "Coimbatore"],
    Telangana: ["Hyderabad", "Warangal"],
  };
}

/* ---------- Escapes ---------- */
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
