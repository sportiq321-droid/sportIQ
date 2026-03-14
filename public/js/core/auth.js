import { loadData, saveData } from "./storage.js";

export function syncLocalSession(apiUser) {
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

export function registerUser(user) {
  const data = loadData();

  const email = String(user.email || "")
    .trim()
    .toLowerCase();
  const username = String(user.username || "").trim();
  const password = String(user.password || "");

  if (!email) throw new Error("Email is required");
  if (!username) throw new Error("Username is required");
  if (!password || password.length < 6)
    throw new Error("Password must be at least 6 characters");

  if (data.users.find((u) => u.email === email)) {
    throw new Error("Email already exists");
  }

  const id = "u" + Date.now();
  const newUser = {
    id,
    username,
    email,
    password,
    achievements: [],
    registeredTournaments: [],
    // name, dob, gender, mobile, role, sport, profilePic filled in Details
  };

  data.users.push(newUser);
  data.currentUser = id;
  saveData(data);
  return newUser;
}

// Allow login with email OR username (case-insensitive)
export function loginUser(identifier, password) {
  const data = loadData();
  const idLower = String(identifier || "")
    .trim()
    .toLowerCase();

  const u = data.users.find((user) => {
    const emailMatch = user.email === idLower;
    const usernameMatch =
      String(user.username || "")
        .trim()
        .toLowerCase() === idLower;
    return (emailMatch || usernameMatch) && user.password === password;
  });

  if (!u) throw new Error("Invalid email or password");

  data.currentUser = u.id;
  saveData(data);
  return u;
}

export function getCurrentSession() {
  return loadData().currentUser;
}
export function requireLogin() {
  if (!getCurrentSession()) window.location.href = "login.html";
}
export function logoutUser() {
  const data = loadData();
  data.currentUser = null;
  saveData(data);
  window.location.href = "login.html";
}
