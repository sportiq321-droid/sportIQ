// public/js/assessments/my.js
import { requireLogin } from "../core/auth.js";
import API from "../api.js";

document.addEventListener("DOMContentLoaded", () => {
  requireLogin();
  document.documentElement.classList.add("dark");

  const drillFilter = document.getElementById("drillFilter");
  const timeFilter = document.getElementById("timeFilter");
  const listEl = document.getElementById("assessList");
  const loadingEl = document.getElementById("loading");
  const emptyEl = document.getElementById("emptyState");

  const KNOWN_DRILLS = ["SIT_UPS", "RUN_800M", "RUN_1_6K", "BROAD_JUMP"];
  let allItems = [];

  // Ensure drill options exist (prevents “only All” issue if HTML was stale)
  ensureDrillOptions();

  // Bind filters
  drillFilter?.addEventListener("change", render);
  timeFilter?.addEventListener("change", render);

  // Initial load
  load().catch(() => {
    if (loadingEl) loadingEl.classList.add("hidden");
    if (emptyEl) emptyEl.classList.remove("hidden");
  });

  async function load() {
    if (loadingEl) loadingEl.classList.remove("hidden");
    if (emptyEl) emptyEl.classList.add("hidden");
    listEl.innerHTML = "";

    const data = await API.getMyAssessments();
    allItems = Array.isArray(data?.items) ? data.items : [];

    // If new/unknown drills appear in data, add them to the dropdown once
    addUnknownDrillsToFilter(allItems);

    if (loadingEl) loadingEl.classList.add("hidden");
    render();
  }

  function render() {
    listEl.innerHTML = "";

    const drill = drillFilter?.value || "ALL";
    const days = timeFilter?.value || "ALL";

    const now = Date.now();
    let items = [...allItems];

    // Filter by drill
    if (drill !== "ALL") {
      items = items.filter((a) => String(a.drill) === drill);
    }

    // Filter by timeframe
    if (days !== "ALL") {
      const win = Number(days);
      items = items.filter((a) => {
        const t = new Date(a.createdAt || a.updatedAt || Date.now()).getTime();
        return now - t <= win * 24 * 60 * 60 * 1000;
      });
    }

    if (!items.length) {
      emptyEl?.classList.remove("hidden");
      return;
    } else {
      emptyEl?.classList.add("hidden");
    }

    items.forEach((a) => listEl.appendChild(renderCard(a)));
  }

  function renderCard(a) {
    const wrap = document.createElement("div");
    wrap.className =
      "glassmorphic rounded-2xl p-5 border border-white/10 hover:shadow-xl transition";

    const top = document.createElement("div");
    top.className = "flex items-start justify-between gap-3";

    const left = document.createElement("div");
    const h = document.createElement("h3");
    h.className = "text-lg font-semibold";
    h.textContent = drillLabel(a.drill);

    const sub = document.createElement("p");
    sub.className = "text-white/70 text-sm";
    sub.textContent = summarize(a);

    left.appendChild(h);
    left.appendChild(sub);

    const badge = document.createElement("span");
    badge.className =
      "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold";
    styleStatusBadge(badge, a.status);
    badge.textContent = statusLabel(a.status);

    top.appendChild(left);
    top.appendChild(badge);

    const bottom = document.createElement("div");
    bottom.className = "mt-3 flex items-center gap-3";

    if (a.mediaUrl) {
      const link = document.createElement("a");
      link.href = a.mediaUrl;
      link.target = "_blank";
      link.rel = "noopener";
      link.className =
        "px-4 py-2 rounded-lg bg-white/10 border border-white/10 hover:bg-white/15 transition text-sm";
      link.textContent = "View Video";
      bottom.appendChild(link);
    }

    wrap.appendChild(top);
    wrap.appendChild(bottom);
    return wrap;
  }

  // ---- helpers ----
  function ensureDrillOptions() {
    if (!drillFilter) return;
    const have = new Set(
      Array.from(drillFilter.options || []).map((o) => o.value)
    );
    // Ensure "ALL"
    if (!have.has("ALL")) {
      const opt = document.createElement("option");
      opt.value = "ALL";
      opt.textContent = "All";
      drillFilter.appendChild(opt);
    }
    // Ensure known drills
    KNOWN_DRILLS.forEach((d) => {
      if (!have.has(d)) {
        const opt = document.createElement("option");
        opt.value = d;
        opt.textContent = drillLabel(d);
        drillFilter.appendChild(opt);
      }
    });
  }

  function addUnknownDrillsToFilter(items) {
    if (!drillFilter) return;
    const have = new Set(
      Array.from(drillFilter.options || []).map((o) => o.value)
    );
    const found = new Set(items.map((a) => String(a.drill)));
    found.forEach((d) => {
      if (!have.has(d) && d && d !== "ALL") {
        const opt = document.createElement("option");
        opt.value = d;
        opt.textContent = drillLabel(d);
        drillFilter.appendChild(opt);
      }
    });
  }

  function drillLabel(d) {
    switch (String(d)) {
      case "SIT_UPS":
        return "Sit-ups";
      case "RUN_800M":
        return "Run 800m";
      case "RUN_1_6K":
        return "Run 1.6km";
      case "BROAD_JUMP":
        return "Broad Jump";
      default:
        return String(d || "Assessment");
    }
  }

  function summarize(a) {
    const t = new Date(a.createdAt || a.updatedAt || Date.now());
    const when = t.toLocaleString();

    if (a.drill === "SIT_UPS") {
      const reps = a?.rawMetrics?.reps ?? Math.round(a.score || 0);
      const dur = a?.rawMetrics?.durationSec ?? 30;
      const conf = a?.confidence ?? null;
      const confText =
        typeof conf === "number" ? ` • ${confidenceLabel(conf)}` : "";
      return `${reps} sit-ups • ${formatSec(dur)}${confText} • ${when}`;
    }
    if (a.drill === "RUN_800M" || a.drill === "RUN_1_6K") {
      const label = a.drill === "RUN_800M" ? "800m" : "1.6km";
      const time = formatSec(Math.round(a.score || 0));
      return `${time} • ${label} • ${when}`;
    }
    if (a.drill === "BROAD_JUMP") {
      const dist = a?.rawMetrics?.distanceCm ?? Math.round(a.score || 0);
      return `${dist} cm • ${when}`;
    }
    if (a.unit === "SECONDS")
      return `${formatSec(Math.round(a.score || 0))} • ${when}`;
    if (a.unit === "REPS") return `${Math.round(a.score || 0)} reps • ${when}`;
    if (a.unit === "CM") return `${Math.round(a.score || 0)} cm • ${when}`;
    return when;
  }

  function confidenceLabel(c) {
    if (c >= 0.85) return "High confidence";
    if (c >= 0.6) return "Okay confidence";
    return "Low confidence";
  }

  function formatSec(total) {
    const t = Math.max(0, Number(total) || 0);
    const m = Math.floor(t / 60);
    const s = t % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function statusLabel(s) {
    const v = String(s || "").toUpperCase();
    if (v === "AUTO_VERIFIED") return "Auto Verified";
    if (v === "PENDING_REVIEW") return "Pending Review";
    if (v === "APPROVED") return "Approved";
    if (v === "REJECTED") return "Rejected";
    return v || "Unknown";
  }

  function styleStatusBadge(el, s) {
    const v = String(s || "").toUpperCase();
    let color = "bg-white/10 border-white/10 text-white";
    if (v === "AUTO_VERIFIED")
      color = "bg-emerald-600/80 border-emerald-500 text-white";
    if (v === "PENDING_REVIEW")
      color = "bg-amber-500/80 border-amber-400 text-black";
    if (v === "APPROVED") color = "bg-blue-600/80 border-blue-500 text-white";
    if (v === "REJECTED") color = "bg-rose-600/80 border-rose-500 text-white";
    el.className = `inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${color}`;
  }
});
