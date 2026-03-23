// js/nav.js
// Shared bottom nav + header injection for Player, Admin, Coach, and Government Official.

import { getCurrentUser } from "./modules/users.js";

(function initNav() {
  const user = getCurrentUser();
  if (!user) return;

  // Force dark visuals for all roles to match the rest of the app
  document.documentElement.classList.add("dark");

  const role = String(user.role || "").trim();
  const path = (location.pathname.split("/").pop() || "").toLowerCase();

  // Active state helpers
  const activeClass = (isActive) =>
    isActive ? "text-primary" : "text-white/60 hover:text-white";
  const aria = (isActive) => (isActive ? "page" : "false");

  // SVG icon set (simple and consistent for all roles)
  const svg = {
    home: `
      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" fill="currentColor" viewBox="0 0 256 256" aria-hidden="true">
        <path d="M224,115.55V208a16,16,0,0,1-16,16H168a16,16,0,0,1-16-16V168a8,8,0,0,0-8-8H112a8,8,0,0,0-8,8v40a16,16,0,0,1-16,16H48a16,16,0,0,1-16-16V115.55a16,16,0,0,1,5.17-11.78l80-75.48.11-.11a16,16,0,0,1,21.53,0l80,75.48A16,16,0,0,1,224,115.55Z"/>
      </svg>`,
    tournaments: `
      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" fill="currentColor" viewBox="0 0 256 256" aria-hidden="true">
        <path d="M232,64H208V56a16,16,0,0,0-16-16H64A16,16,0,0,0,48,56v8H24A16,16,0,0,0,8,80V96a40,40,0,0,0,40,40h3.65A80.13,80.13,0,0,0,120,191.61V216H96a8,8,0,0,0,0,16h64a8,8,0,0,0,0-16H136V191.58c31.94-3.23,58.44-25.64,68.08-55.58H208a40,40,0,0,0,40-40V80A16,16,0,0,0,232,64ZM48,120A24,24,0,0,1,24,96V80H48v32q0,4,.39,8Zm144-8.9c0,35.52-28.49,64.64-63.51,64.9H128a64,64,0,0,1-64-64V56H192ZM232,96a24,24,0,0,1-24,24h-.5a81.81,81.81,0,0,0,.5-8.9V80h24Z"/>
      </svg>`,
    achievements: `
      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" fill="currentColor" viewBox="0 0 256 256" aria-hidden="true">
        <path d="M224,88h-4V48a16,16,0,0,0-16-16H56a16,16,0,0,0-16,16v40H32a16,16,0,0,0-16,16V216a16,16,0,0,0,16,16H224a16,16,0,0,0,16-16V104A16,16,0,0,0,224,88Zm-88,96a32,32,0,1,1,32-32A32,32,0,0,1,136,184ZM224,216H32V104H80a16,16,0,0,0,16-16V48H200V88a16,16,0,0,0,16,16h8Z"/>
      </svg>`,
    explore: `
      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" fill="currentColor" viewBox="0 0 256 256" aria-hidden="true">
        <path d="M128,24a104,104,0,1,0,104,104A104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216ZM184.49,91.51a12,12,0,0,1,0,17l-56,56a12,12,0,0,1-17,0l-24-24a12,12,0,0,1,17-17L120,139l47.51-47.52A12,12,0,0,1,184.49,91.51Z" opacity="0.6"/>
      </svg>`,
    schedules: `
      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" fill="currentColor" viewBox="0 0 256 256" aria-hidden="true">
        <path d="M208,32H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32ZM48,48H80V80H48ZM96,48h64V80H96Zm80,0h32V80H176Zm32,48v64H176V96Zm-16,80v32H176V176Zm-32,0h64v32H160Zm-16,0V176H96v32Zm-32,0v-32H48v32Zm0-48h64v32H96Zm-16-48v64H48V96Z"/>
      </svg>`,
    notifications: `
      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" fill="currentColor" viewBox="0 0 256 256" aria-hidden="true">
        <path d="M221.8,175.94C216.25,166.38,208,139.33,208,104a80,80,0,1,0-160,0c0,35.33-8.25,62-13.8,71.94A16,16,0,0,0,48,200H208a16,16,0,0,0,13.8-24.06ZM128,232a24,24,0,0,1-24-24h48A24,24,0,0,1,128,232Z"/>
      </svg>`,
    // Icons for Admin/Gov/Coach
    create: `
      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" fill="currentColor" viewBox="0 0 256 256" aria-hidden="true">
        <path d="M216,48H184V32a8,8,0,0,0-16,0V48H88V32a8,8,0,0,0-16,0V48H40A16,16,0,0,0,24,64V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V64A16,16,0,0,0,216,48ZM208,192H48V96H208Z"/>
      </svg>`,
    registrations: `
      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" fill="currentColor" viewBox="0 0 256 256" aria-hidden="true">
        <path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm0,160H40V56H216ZM72,88H184a8,8,0,0,1,0,16H72a8,8,0,0,1,0-16Zm0,32H160a8,8,0,0,1,0,16H72a8,8,0,0,1,0-16Z"/>
      </svg>`,
    upload: `
      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" fill="currentColor" viewBox="0 0 256 256" aria-hidden="true">
        <path d="M176,152a8,8,0,0,1-8,8H136v48a8,8,0,0,1-16,0V160H88a8,8,0,0,1,0-16h32V96a8,8,0,0,1,16,0v48h32A8,8,0,0,1,176,152ZM224,208H32a8,8,0,0,0,0,16H224a8,8,0,0,0,0-16Z"/>
      </svg>`,
    announcements: `
      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" fill="currentColor" viewBox="0 0 256 256" aria-hidden="true">
        <path d="M232,88H208V56a16,16,0,0,0-16-16H64A16,16,0,0,0,48,56V88H24A16,16,0,0,0,8,104v48a16,16,0,0,0,16,16H48v32a8,8,0,0,0,13.66,5.66L96,168h96a16,16,0,0,0,16-16V104A16,16,0,0,0,232,88ZM64,56H192V88H64Z"/>
      </svg>`,
    verify: `
      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" fill="currentColor" viewBox="0 0 256 256" aria-hidden="true">
        <path d="M128,24,32,64V120c0,57.44,37.64,110.2,89.6,126.68a8,8,0,0,0,4.8,0C186.36,230.2,224,177.44,224,120V64ZM112,168l-32-32,11.31-11.31L112,145.37l54.34-54.34L177.66,102Z"/>
      </svg>`,
    reports: `
      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" fill="currentColor" viewBox="0 0 256 256" aria-hidden="true">
        <path d="M216,48H40A16,16,0,0,0,24,64V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V64A16,16,0,0,0,216,48ZM88,184H64V120H88Zm48,0H112V96h24Zm48,0H160V136h24Z"/>
      </svg>`,
    analytics: `
      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" fill="currentColor" viewBox="0 0 256 256" aria-hidden="true">
        <path d="M224,208H32a8,8,0,0,1,0-16H224a8,8,0,0,1,0,16Zm-96-32H104V88h24Zm64,0H168V48h24ZM96,176H72V120H96Z"/>
      </svg>`,
  };

  // Shared header injection for safe top-level pages
  function injectHeader() {
    const headerAllowedPages = new Set([
      "dashboard.html",
      "explore.html",
      "leaderboard.html"
    ]);
    if (!headerAllowedPages.has(path)) return;
    if (document.getElementById("navProfileBtn")) return; // avoid duplicate
    const header = document.createElement("header");
    header.className = "flex justify-between items-center p-4 z-20 relative";
    header.innerHTML = `
      <div class="w-12 h-12 rounded-full overflow-hidden border-2 border-primary cursor-pointer" id="navProfileBtn" title="Profile">
        <img src="${(user.profilePic || "img/defaultavatar.jpg").replace(
          /"/g,
          "%22"
        )}" alt="Profile" class="w-full h-full object-cover"/>
      </div>
      <a href="notifications.html" class="relative w-12 h-12 flex items-center justify-center text-white/80 hover:text-white transition-colors" title="Notifications" aria-label="Notifications">
        ${svg.notifications}
      </a>`;
    document.body.prepend(header);

    const bg = document.createElement("div");
    bg.className =
      "absolute top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none";
    bg.innerHTML = `
      <div class="absolute -top-1/4 -left-1/4 w-1/2 h-1/2 bg-primary/20 rounded-full blur-3xl"></div>
      <div class="absolute -bottom-1/4 -right-1/4 w-1/2 h-1/2 bg-primary/20 rounded-full blur-3xl"></div>`;
    document.body.appendChild(bg);

    header.querySelector("#navProfileBtn")?.addEventListener("click", () => {
      window.location.href = "profile.html";
    });
  }

  // Shared sub-header injection for safe deep pages
  function injectSubHeader() {
    const subPageConfig = {
      "myachieve.html": { title: "My Achievements", back: "achievements.html" },
      "govverifiy.html": { title: "Verification", back: "dashboard.html" }
    };
    const config = subPageConfig[path];
    if (!config) return;
    if (document.getElementById("navSubHeader")) return; // avoid duplicate

    const header = document.createElement("header");
    header.id = "navSubHeader";
    header.className = "sticky top-0 z-20 flex justify-between items-center p-3.5 px-4 bg-[#020B18]/92 backdrop-blur-xl border-b border-blue-500/10";
    
    header.innerHTML = `
      <a href="${config.back}" id="dynamicBackBtn" class="w-[38px] h-[38px] rounded-full flex items-center justify-center bg-blue-500/10 border border-blue-500/20 text-white/60 hover:text-white hover:bg-blue-500/20 hover:border-blue-400 transition-colors" aria-label="Back">
        <span class="material-symbols-outlined text-[20px]">arrow_back</span>
      </a>
      <h1 class="flex-1 text-center text-white text-[1.1rem] font-bold tracking-[0.16em] uppercase" style="font-family: 'Oswald', sans-serif;">
        ${config.title}
      </h1>
      <a href="notifications.html" class="relative w-[38px] h-[38px] rounded-full flex items-center justify-center bg-blue-500/10 border border-blue-500/20 text-white/60 hover:text-white hover:bg-blue-500/20 hover:border-blue-400 transition-colors" aria-label="Notifications">
        <span class="material-symbols-outlined text-[20px]">notifications</span>
        <span class="absolute top-[2px] right-[2px] w-2 h-2 bg-red-500 rounded-full border-[1.5px] border-[#020B18]"></span>
      </a>
    `;
    
    // Inject into .page-wrap to prevent breaking grid/flex layouts on sub-pages
    const targetContainer = document.querySelector(".page-wrap") || document.body;
    targetContainer.prepend(header);

    const backBtn = header.querySelector("#dynamicBackBtn");
    if (backBtn) {
      backBtn.addEventListener("click", (e) => {
        e.preventDefault();
        try {
          const ref = document.referrer || "";
          const hasHistory = window.history.length > 1;
          const sameOrigin = ref && new URL(ref, window.location.href).origin === window.location.origin;
          if ((sameOrigin && ref !== window.location.href) || hasHistory) {
            window.history.back();
            return;
          }
        } catch {}
        window.location.href = config.back;
      });
    }
  }

  // Shared bottom bar renderer
  function injectFooter(links) {
    if (document.getElementById("roleBottomNav")) return; // avoid duplicate
    const footer = document.createElement("footer");
    footer.id = "roleBottomNav";
    footer.className = "fixed bottom-0 left-0 right-0 p-2 z-50";
    const items = links
      .map((l) => {
        const glowClass = l.glow ? "nav-glow" : "";
        return `
        <a href="${l.href}" aria-label="${l.label}"
           class="group flex flex-col items-center justify-center min-w-0 ${activeClass(
             l.active
           )} transition-colors ${glowClass}"
           aria-current="${aria(l.active)}">
          <span class="nav-icon">${l.icon}</span>
          <span class="nav-label mt-1">${l.label}</span>
        </a>`;
      })
      .join("");

    footer.innerHTML = `
      <div class="glassmorphic grid grid-cols-5 items-center rounded-xl w-full px-1 nav-shell text-white">
        ${items}
      </div>`;

    document.body.appendChild(footer);
    // Record last clicked bottom-nav section for smart back (non-invasive)
    try {
      footer.querySelectorAll("a[href]").forEach((a) => {
        a.addEventListener(
          "click",
          () => {
            try {
              const href = a.getAttribute("href") || "";
              const labelEl = a.querySelector(".nav-label");
              const label = (
                labelEl ? labelEl.textContent : href || "Section"
              ).trim();
              sessionStorage.setItem(
                "lastSection",
                JSON.stringify({ href, label, ts: Date.now() })
              );
            } catch {}
          },
          { passive: true }
        );
      });
    } catch {}
    // Safe-area + responsive label behavior
    if (!document.getElementById("roleBottomNavStyle")) {
      const style = document.createElement("style");
      style.id = "roleBottomNavStyle";
      style.textContent = `
        @supports (padding: max(0px)) {
          footer {
            padding-left: max(0.5rem, env(safe-area-inset-left));
            padding-right: max(0.5rem, env(safe-area-inset-right));
            padding-bottom: max(0.75rem, env(safe-area-inset-bottom));
          }
        }
        body { padding-bottom: 104px; }
        footer .nav-label {
          font-size: 12px;
          line-height: 1rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          text-align: center;
          max-width: 100%;
          display: block;
        }
        
        /* Glow animation for verify button toggle */
        .nav-glow {
          animation: pulse-glow 2s ease-in-out infinite;
        }
        .nav-glow .nav-icon {
          filter: drop-shadow(0 0 8px rgba(51, 101, 250, 0.8));
        }
        @keyframes pulse-glow {
          0%, 100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.05);
          }
        }
        
        @media (max-width: 419px) and (min-width: 340px) {
          footer .nav-shell { height: 88px; }
          footer .nav-label {
            font-size: 11px;
            line-height: 1rem;
            white-space: normal;
            overflow: hidden;
            text-overflow: clip;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            text-align: center;
          }
        }
        @media (max-width: 339px) {
          footer .nav-shell { height: 64px; }
          footer .nav-label { display: none; }
          footer .nav-icon { margin-bottom: 0; }
        }
        @media (min-width: 420px) {
          footer .nav-shell { height: 80px; }
        }`;
      document.head.appendChild(style);
    }
  }

  // --- ROLE-BASED NAVIGATION ---
  // PLAYER
  if (role === "Player") {
    injectHeader();
    injectSubHeader();
    const tournamentsPages = new Set([
      "tournaments.html",
      "find-tournament.html",
      "mytournaments.html",
    ]);
    const achievementsPages = new Set([
      "achievements.html",
      "upload.html",
      "myachieve.html",
    ]);

    const isHome = path === "dashboard.html";
    const isTournaments = tournamentsPages.has(path);
    const isAchievements = achievementsPages.has(path);
    const isExplore = path === "explore.html";

    // Player schedules active on both landing and details
    const isPlayerSchedules =
      path === "playerschedulesland.html" || path === "player-schedules.html";

    const links = [
      { href: "dashboard.html", label: "Home", icon: svg.home, active: isHome },
      {
        href: "find-tournament.html",
        label: "Tournaments",
        icon: svg.tournaments,
        active: isTournaments,
      },
      {
        href: "achievements.html",
        label: "Achievement",
        icon: svg.achievements,
        active: isAchievements,
      },
      {
        href: "explore.html",
        label: "Explore",
        icon: svg.explore,
        active: isExplore,
      },
      {
        href: "leaderboard.html",
        label: "Leaderboard",
        icon: svg.achievements, // Reusing achievement icon for now
        active: path === "leaderboard.html",
      },
      {
        href: "playerschedulesLand.html",
        label: "Schedules",
        icon: svg.schedules,
        active: isPlayerSchedules,
      },
    ];
    injectFooter(links);
    return;
  }

  // ADMIN
  if (role === "Admin") {
    injectHeader();
    injectSubHeader();
    const links = [
      {
        href: "dashboard.html",
        label: "Home",
        icon: svg.home,
        active: path === "dashboard.html",
      },
      {
        href: "admintournament.html",
        label: "Create",
        icon: svg.create,
        active: path === "admintournament.html",
      },
      {
        href: "adminregistrations.html",
        label: "Registrations",
        icon: svg.registrations,
        active: path === "adminregistrations.html",
      },
      {
        href: "uploadresults.html",
        label: "Upload Results",
        icon: svg.upload,
        active: path === "uploadresults.html",
      },
      {
        href: "announcements.html",
        label: "Announcements",
        icon: svg.announcements,
        active: path === "announcements.html",
      },
      {
        href: "leaderboard.html",
        label: "Leaderboard",
        icon: svg.achievements,
        active: path === "leaderboard.html",
      },
    ];
    injectFooter(links);
    return;
  }

  // COACH
  if (role === "Coach") {
    injectHeader();
    injectSubHeader();

    // Smart Verify button toggle logic
    const isOnAssessments = path === "coach-assessments.html";
    const isOnAchievements = path === "coachverify.html";
    const isOnLanding = path === "coachverifyland.html";

    // Determine verify button behavior
    let verifyHref = "coachVerifyLand.html"; // Default to landing
    let verifyGlow = false;

    if (isOnAssessments) {
      verifyHref = "coachVerify.html"; // Toggle to achievements
      verifyGlow = true;
    } else if (isOnAchievements) {
      verifyHref = "coach-assessments.html"; // Toggle to assessments
      verifyGlow = true;
    }

    // Schedules active check (landing or legacy)
    const isOnSchedules =
      path === "schedulesland.html" || path === "schedules.html";

    // NEW: mark Reports active on both overview and details page
    const isReports = path === "reports.html" || path === "coach-reports.html";

    const links = [
      {
        href: "dashboard.html",
        label: "Home",
        icon: svg.home,
        active: path === "dashboard.html",
      },
      {
        href: verifyHref,
        label: "Verify",
        icon: svg.verify,
        active: isOnLanding || isOnAssessments || isOnAchievements,
        glow: verifyGlow,
      },
      {
        href: "schedulesLand.html", // landing first
        label: "Schedules",
        icon: svg.schedules,
        active: isOnSchedules,
      },
      {
        href: "reports.html",
        label: "Reports",
        icon: svg.reports,
        active: isReports, // highlight on both reports.html and coach-reports.html
      },
      {
        href: "explore.html",
        label: "Explore",
        icon: svg.explore,
        active: path === "explore.html",
      },
      {
        href: "leaderboard.html",
        label: "Leaderboard",
        icon: svg.achievements,
        active: path === "leaderboard.html",
      },
    ];
    injectFooter(links);
    return;
  }

  // GOVERNMENT OFFICIAL
  if (role === "Government Official") {
    injectHeader();
    injectSubHeader();
    const links = [
      {
        href: "dashboard.html",
        label: "Home",
        icon: svg.home,
        active: path === "dashboard.html",
      },
      {
        href: "govverifiy.html",
        label: "Verification",
        icon: svg.verify,
        active: path === "govverifiy.html",
      },
      {
        href: "reports.html",
        label: "Reports",
        icon: svg.reports,
        active: path === "reports.html",
      },
      {
        href: "analytics.html",
        label: "Analytics",
        icon: svg.analytics,
        active: path === "analytics.html",
      },
      {
        href: "govtour.html",
        label: "Tournaments",
        icon: svg.tournaments,
        active: path === "govtour.html",
      },
      {
        href: "leaderboard.html",
        label: "Leaderboard",
        icon: svg.achievements,
        active: path === "leaderboard.html",
      },
    ];
    injectFooter(links);
    return;
  }
})();
