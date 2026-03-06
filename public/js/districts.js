// js/districts.js
// Single-file dataset (no external JSON).
// Exposes a case-insensitive window.statesAndDistricts = { "State Name": [ "District", ... ], ... }
// Works with existing finder logic (tournaments.js) without any other changes.

(function () {
  // Paste your full India mapping (28 states + 8 UTs) below, in the exact shape:
  // { "State Name": ["District 1","District 2", ...], ... }
  // Example entries are included; replace/extend with your complete list.
  const STATES_AND_DISTRICTS = {
    // --- EXAMPLES (keep the shape; replace with your full data) ---
    "Andhra Pradesh": [
      "Alluri Sitharama Raju","Anakapalle","Anantapuramu","Annamayya","Bapatla",
      "Chittoor","East Godavari","Eluru","Guntur","Kakinada","Konaseema",
      "Krishna","Kurnool","Nandyal","NTR","Palnadu","Parvathipuram Manyam",
      "Prakasam","Srikakulam","Sri Potti Sriramulu Nellore","Sri Sathya Sai",
      "Tirupati","Visakhapatnam","Vizianagaram","West Godavari","YSR Kadapa"
    ],
    "Tamil Nadu": [
      "Chennai","Coimbatore","Madurai","Tiruchirappalli","Tirunelveli","Vellore"
    ],
    "Maharashtra": [
      "Ahmednagar","Akola","Amravati","Aurangabad","Beed","Bhandara","Buldhana",
      "Chandrapur","Dhule","Gadchiroli","Gondia","Hingoli","Jalgaon","Jalna",
      "Kolhapur","Latur","Mumbai City","Mumbai Suburban","Nagpur","Nanded",
      "Nandurbar","Nashik","Osmanabad","Palghar","Parbhani","Pune","Raigad",
      "Ratnagiri","Sangli","Satara","Sindhudurg","Solapur","Thane","Wardha",
      "Washim","Yavatmal"
    ],
    "Delhi": [
      "Central Delhi","East Delhi","New Delhi","North Delhi","South Delhi","West Delhi"
    ],
    // --- END EXAMPLES ---

    // Paste the rest of your complete mapping here...
  };

  // Case-insensitive access helpers
  const canon = (s) => String(s || "").trim().toLowerCase();
  const squash = (s) => canon(s).replace(/[\s._\-&()]/g, "");

  function makeCaseInsensitiveProxy(obj) {
    const index = new Map();
    Object.keys(obj).forEach((k) => {
      const c = canon(k);
      const q = squash(k);
      if (!index.has(c)) index.set(c, k);
      if (!index.has(q)) index.set(q, k);
    });
    return new Proxy(obj, {
      get(target, prop, receiver) {
        if (prop in target) return Reflect.get(target, prop, receiver);
        if (typeof prop === "string") {
          const hit = index.get(canon(prop)) || index.get(squash(prop));
          if (hit) return target[hit];
        }
        return Reflect.get(target, prop, receiver);
      },
      has(target, prop) {
        if (prop in target) return true;
        if (typeof prop === "string") {
          return index.has(canon(prop)) || index.has(squash(prop));
        }
        return false;
      },
    });
  }

  // Expose globally (no fetch, no cache)
  window.statesAndDistricts = makeCaseInsensitiveProxy(STATES_AND_DISTRICTS);

  // Optional signal if any listener wants to react after dataset is ready
  try {
    document.dispatchEvent(new Event("geo:ready"));
    console.debug(
      "statesAndDistricts loaded (inline):",
      Object.keys(STATES_AND_DISTRICTS).length,
      "states/UTs"
    );
  } catch {}
})();