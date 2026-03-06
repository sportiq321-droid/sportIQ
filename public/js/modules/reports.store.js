// public/js/modules/reports.store.js
import API from "../api.js";

export const ReportsStore = (() => {
  let state = {
    range: "30d", // Kept for UI state, though backend logic is fixed for now
    kpis: {
      attendanceRatePct: null,
      achievementsApproved: 0,
      achievementsPending: 0,
      activePlayersThisWeek: 0,
      upcomingSessions7d: 0,
      regPending: 0,
      regConfirmed: 0,
    },
  };

  const subs = new Set();

  function notify() {
    subs.forEach((fn) => fn(state));
  }

  function setRange(range) {
    state.range = range;
    // In the future, you could pass this range to the API
    // For now, it just updates the UI state
    notify();
  }

  async function compute() {
    try {
      // The complex client-side logic is now a single API call
      const kpisFromServer = await API.getCoachReport();
      state.kpis = kpisFromServer;
    } catch (error) {
      console.error("Failed to fetch coach reports:", error);
      // You could set an error state here if needed
    }
    notify();
  }

  function subscribe(fn) {
    subs.add(fn);
    return () => subs.delete(fn);
  }

  // init now calls the async compute function
  function init() {
    compute();
  }

  return { init, subscribe, setRange, getState: () => state };
})();
