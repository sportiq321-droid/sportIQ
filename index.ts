import express, { Request, Response, NextFunction, CookieOptions } from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import path from "path";
import fs from "fs";
import multer, { FileFilterCallback } from "multer";
import { PrismaClient, User, Prisma } from "@prisma/client";
import axios from "axios";
import FormData from "form-data";
import cors from "cors";
const app = express();
const prisma = new PrismaClient();

/**
 * Logs an audit event. Errors are caught silently to never break main request.
 * @param action - What happened (e.g., "USER_REGISTERED", "TOURNAMENT_PUBLISHED")
 * @param entityType - Type of entity affected (e.g., "User", "Tournament")
 * @param entityId - ID of the affected entity
 * @param userId - ID of the user who performed the action (null for system actions)
 * @param meta - Optional additional context (old values, IP, etc.)
 */
async function logAudit(
  action: string,
  entityType: string,
  entityId: string,
  userId: string | null,
  meta?: object
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        entityType,
        entityId,
        userId,
        meta: meta as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (error) {
    // Log to console but never throw - audit failures should not break main requests
    console.error("AUDIT_LOG_ERROR:", error);
  }
}

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";

// Trust proxy so req.secure works behind proxies (needed for Secure cookies on HTTPS)
app.set("trust proxy", 1);

app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true,
}));

// Paths
const staticRoot = path.join(__dirname, "public");
const uploadsRoot = path.join(__dirname, "uploads");
const certDir = path.join(uploadsRoot, "certificates");
const assessmentsDir = path.join(uploadsRoot, "assessments");

// Ensure upload directories exist
fs.mkdirSync(certDir, { recursive: true });
fs.mkdirSync(assessmentsDir, { recursive: true });

// -------------------- Multer: Certificates (PDF/DOC) --------------------
const certStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, certDir),
  filename: (req, file, cb) => {
    const userId = (req as AuthenticatedRequest).userId || "anon";
    const ext = path.extname(file.originalname) || "";
    cb(null, `${userId}-${Date.now()}${ext}`);
  },
});

const allowedDocMimes = new Set<string>([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const certUpload = multer({
  storage: certStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req: Request, file, cb: FileFilterCallback) => {
    if (allowedDocMimes.has(file.mimetype)) return cb(null, true);
    cb(new Error("Only PDF or DOC/DOCX files are allowed."));
  },
});

// -------------------- Multer: Assessment videos (MP4/WebM) --------------------
const videoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, assessmentsDir),
  filename: (req, file, cb) => {
    const userId = (req as AuthenticatedRequest).userId || "anon";
    const ext = path.extname(file.originalname) || "";
    cb(null, `${userId}-${Date.now()}${ext}`);
  },
});

const allowedVideoMimes = new Set<string>(["video/mp4", "video/webm"]);

const videoUpload = multer({
  storage: videoStorage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req: Request, file, cb: FileFilterCallback) => {
    if (allowedVideoMimes.has(file.mimetype)) return cb(null, true);
    cb(new Error("Only MP4 or WebM videos up to 20MB are allowed."));
  },
});

// -------------- Middleware --------------
app.use(express.json({ limit: "8mb" }));
app.use(cookieParser());
app.use("/uploads", express.static(uploadsRoot));

// Extend Request with userId
interface AuthenticatedRequest extends Request {
  userId?: string;
}

// Helpers
function signToken(userId: string) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: "7d" });
}

// Per-request cookie options (mobile-safe)
function getCookieOptions(req: Request): CookieOptions {
  const hostname = req.hostname || "";
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
  
  // If it's strictly local HTTP, use lax/false. 
  // If it's Codespaces (.github.dev) or Production (Vercel/HF), use none/true.
  if (isLocalhost) {
    return {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      secure: false, 
      sameSite: "lax",
    };
  } else {
    return {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      secure: true, 
      sameSite: "none",
    };
  }
}

function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const token = req.cookies?.sid;
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string };
    req.userId = payload.sub;
    next();
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
}

async function requireCoach(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.userId) return res.status(401).json({ error: "Unauthorized" });
  const me = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!me || me.role !== "Coach")
    return res.status(403).json({ error: "Forbidden" });
  next();
}

// ==================== NEW: Admin Middleware ====================
async function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.userId) return res.status(401).json({ error: "Unauthorized" });
  const me = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!me || me.role !== "Admin")
    return res.status(403).json({ error: "Forbidden" });
  next();
}
// ==================== END NEW ====================
// ==================== GOVERNMENT OFFICIAL MIDDLEWARE ====================
async function requireGovOfficial(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.userId) return res.status(401).json({ error: "Unauthorized" });
  const me = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!me || me.role !== "Government Official")
    return res.status(403).json({ error: "Forbidden" });
  next();
}
// ==================== END GOVERNMENT OFFICIAL MIDDLEWARE ====================
// ==================== NEW: Email Notification Helper (Stub) ====================
/**
 * Email notification service (stub for future SMTP integration)
 * Currently logs to console; ready for Nodemailer/SendGrid integration
 */
async function sendRegistrationEmail(params: {
  playerEmail: string;
  playerName: string;
  tournamentName: string;
  status: "CONFIRMED" | "REJECTED";
  reason?: string;
}) {
  const { playerEmail, playerName, tournamentName, status, reason } = params;

  // TODO: Replace with actual email service (Nodemailer, SendGrid, etc.)
  console.log("📧 [EMAIL NOTIFICATION]");
  console.log(`To: ${playerEmail}`);
  console.log(`Subject: Tournament Registration ${status}`);
  console.log(`---`);

  if (status === "CONFIRMED") {
    console.log(`Dear ${playerName},`);
    console.log(
      `Your registration for "${tournamentName}" has been APPROVED! ✅`
    );
    console.log(`We look forward to seeing you at the event.`);
  } else {
    console.log(`Dear ${playerName},`);
    console.log(
      `Your registration for "${tournamentName}" has been REJECTED. ❌`
    );
    if (reason) {
      console.log(`Reason: ${reason}`);
    }
    console.log(`You may re-register after addressing the concerns.`);
  }

  console.log(`---\n`);

  // Return success (for future actual email sending)
  return { success: true };
}
// ==================== END EMAIL HELPER ====================

// ==================== SPORTIQ IMPACT SCORE ALGORITHM ====================

interface ScoreAssessment {
  drill: string;
  score: number;
  createdAt: Date;
  status: string;
}

interface ScoreMatchStat {
  battingRuns?: number | null;
  bowlingWickets?: number | null;
  catches?: number | null;
  runOuts?: number | null;
  createdAt: Date;
  match: {
    tournamentId: string;
    winner?: string | null;
    teamAId?: string | null;
    teamBId?: string | null;
    tournament?: {
      name: string;
    } | null;
  };
}

function calculateImpactScore(
  assessments: ScoreAssessment[],
  matchStats: ScoreMatchStat[],
  playerId: string
) {
  // --- A) FITNESS SCORE (30%) ---
  // Group by drill, take most recent
  const latestDrills: { [key: string]: ScoreAssessment } = {};
  assessments.forEach((a) => {
    const drill = a.drill.toLowerCase();
    if (
      !latestDrills[drill] ||
      new Date(a.createdAt) > new Date(latestDrills[drill].createdAt)
    ) {
      latestDrills[drill] = a;
    }
  });

  const drillScores: { [key: string]: number } = {};
  const fitnessValues: number[] = [];

  Object.values(latestDrills).forEach((a) => {
    const drill = a.drill.toLowerCase();
    let normalized = 0;
    let isRecognized = false;

    if (drill === "situps") {
      // Benchmark 50 reps
      normalized = Math.min((a.score / 50) * 100, 100);
      isRecognized = true;
    } else if (drill === "pushups") {
      // Benchmark 40 reps
      normalized = Math.min((a.score / 40) * 100, 100);
      isRecognized = true;
    } else if (drill === "run") {
      // Benchmark 300s (lower is better)
      if (a.score <= 300) normalized = 100;
      else normalized = Math.min((300 / a.score) * 100, 100);
      isRecognized = true;
    }

    if (isRecognized) {
      drillScores[drill] = normalized;
      fitnessValues.push(normalized);
    }
  });

  const fitnessScore =
    fitnessValues.length > 0
      ? fitnessValues.reduce((a, b) => a + b, 0) / fitnessValues.length
      : 0;

  // --- B) MATCH PERFORMANCE SCORE (50%) ---
  const matchValues: number[] = [];
  let matchesWon = 0;
  let matchesLost = 0;

  matchStats.forEach((stat) => {
    // Raw contribution
    const rawContribution =
      (stat.battingRuns || 0) * 1.0 +
      (stat.bowlingWickets || 0) * 25 +
      (stat.catches || 0) * 10 +
      (stat.runOuts || 0) * 15;

    // Tournament weight
    let tournamentWeight = 1.0;
    const tName = (stat.match.tournament?.name || "").toLowerCase();
    if (tName.includes("national")) tournamentWeight = 3.0;
    else if (tName.includes("state")) tournamentWeight = 2.0;
    else if (tName.includes("district")) tournamentWeight = 1.5;

    // Win multiplier & Failure Penalty tracking
    let winMultiplier = 1.0;
    const winner = stat.match.winner;
    const teamA = stat.match.teamAId;
    const teamB = stat.match.teamBId;

    if (
      (winner === "A" && teamA === playerId) ||
      (winner === "B" && teamB === playerId)
    ) {
      winMultiplier = 1.2;
      matchesWon++;
    } else if (
      (winner === "A" && teamB === playerId) ||
      (winner === "B" && teamA === playerId)
    ) {
      matchesLost++;
    }

    const weightedContribution =
      rawContribution * tournamentWeight * winMultiplier;
    // Normalize against 300 benchmark
    const normalized = Math.min((weightedContribution / 300) * 100, 100);
    matchValues.push(normalized);
  });

  const matchScore =
    matchValues.length > 0
      ? matchValues.reduce((a, b) => a + b, 0) / matchValues.length
      : 0;

  // --- C) CONSISTENCY INDEX (20%) ---
  const calculateCV = (values: number[]) => {
    if (values.length < 2) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    if (mean === 0) return 0;
    const variance =
      values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    return (stdDev / mean) * 100;
  };

  const fitnessCV = calculateCV(fitnessValues);
  const matchCV = calculateCV(matchValues);

  const fitnessConsistency = Math.max(0, 100 - fitnessCV);
  const matchConsistency = Math.max(0, 100 - matchCV);

  let consistencyIndex = 0; // Default - no free points for empty data
  if (fitnessValues.length > 0 && matchValues.length > 0) {
    consistencyIndex = (fitnessConsistency + matchConsistency) / 2;
  } else if (fitnessValues.length > 0) {
    consistencyIndex = fitnessConsistency;
  } else if (matchValues.length > 0) {
    consistencyIndex = matchConsistency;
  }

  // --- D) RECENCY BONUS ---
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  let recentActivities = 0;
  assessments.forEach((a) => {
    if (new Date(a.createdAt) >= thirtyDaysAgo) recentActivities++;
  });
  matchStats.forEach((m) => {
    if (new Date(m.createdAt) >= thirtyDaysAgo) recentActivities++;
  });

  let recencyMultiplier = 1.0;
  if (recentActivities >= 3) recencyMultiplier = 1.1;
  else if (recentActivities === 0) recencyMultiplier = 0.9;

  // --- E) FAILURE PENALTY ---
  const totalMatches = matchStats.length;
  let failurePenalty = 0;
  if (totalMatches > 0) {
    const lossRatio = matchesLost / totalMatches;
    failurePenalty = Math.min(80, lossRatio * 100);
  }

  // --- F) FINAL FORMULA ---
  const rawScore =
    fitnessScore * 0.3 +
    matchScore * 0.5 +
    consistencyIndex * 0.2 -
    failurePenalty;

  const adjustedScore = rawScore * recencyMultiplier;
  const impactScore = Math.round(Math.max(0, Math.min(1000, adjustedScore * 10)));

  return {
    impactScore,
    consistencyIndex: Number(consistencyIndex.toFixed(1)),
    fitnessScore: Number(fitnessScore.toFixed(1)),
    matchScore: Number(matchScore.toFixed(1)),
    recencyMultiplier,
    failurePenalty,
    breakdown: {
      drillScores,
      matchContributions: matchValues,
      totalAssessments: assessments.length,
      totalMatches,
      matchesWon,
      matchesLost,
      recentActivities,
    },
  };
}

function toPublicUser(u: User | null) {
  if (!u) return null;
  const { passwordHash, ...rest } = u;
  return rest;
}

function parseDobMaybe(input: any): Date | undefined {
  if (!input) return undefined;
  if (input instanceof Date && !isNaN(input.getTime())) return input;
  if (typeof input === "string") {
    const d = new Date(input);
    if (!isNaN(d.getTime())) return d;
  }
  return undefined;
}

function isTenDigitMobile(s: any): boolean {
  return typeof s === "string" && /^\d{10}$/.test(s);
}

// ---- HEALTH CHECK ----
app.get("/api/health", (_req: Request, res: Response) =>
  res.json({ ok: true })
);

// -------------------- AUTH API --------------------

// Register
app.post("/api/auth/register", async (req: Request, res: Response) => {
  try {
    const username = String(req.body?.username || "").trim();
    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();
    const password = String(req.body?.password || "");

    if (!username || !email || !password) {
      return res
        .status(400)
        .json({ error: "Missing username, email, or password" });
    }
    if (password.length < 6) {
      return res
        .status(400)
        .json({ error: "Password must be at least 6 characters" });
    }

    // Uniqueness check
    const exists = await prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
      select: { id: true },
    });
    if (exists) {
      return res
        .status(409)
        .json({ error: "Email or username already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const created = await prisma.user.create({
      data: {
        username,
        email,
        passwordHash,
        role: "Player", // default; onboarding may request change (restricted)
      },
    });

    // MAKE SURE THESE 3 LINES EXIST:
    const token = signToken(created.id);
    const opts = getCookieOptions(req);
    res.cookie("sid", token, opts);

    await logAudit("USER_REGISTERED", "User", created.id, created.id, {
      email: created.email,
      role: created.role,
    });

    return res.status(201).json(toPublicUser(created));
  } catch (e: any) {
    // Prisma unique constraint safety-net
    if (e?.code === "P2002") {
      return res
        .status(409)
        .json({ error: "Email or username already exists" });
    }
    console.error("REGISTER_ERROR", e);
    return res.status(500).json({ error: "Server error" });
  }
});

// Login (email or username)
app.post("/api/auth/login", async (req: Request, res: Response) => {
  try {
    const identifierRaw = String(req.body?.identifier || "").trim();
    const password = String(req.body?.password || "");
    if (!identifierRaw || !password) {
      return res.status(400).json({ error: "Missing credentials" });
    }

    const idLower = identifierRaw.toLowerCase();
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: idLower },
          { username: identifierRaw },
          { username: idLower }, // case-insensitive helper
        ],
      },
    });

    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    const token = signToken(user.id);
    const opts = getCookieOptions(req);
    res.cookie("sid", token, { ...opts });

    await logAudit("USER_LOGIN", "User", user.id, user.id);

    return res.json(toPublicUser(user));
  } catch (e) {
    console.error("LOGIN_ERROR", e);
    return res.status(500).json({ error: "Server error" });
  }
});

// Logout
app.post("/api/auth/logout", (req: Request, res: Response) => {
  const opts = getCookieOptions(req);
  res.clearCookie("sid", { ...opts });
  return res.json({ ok: true });
});

// Me
app.get(
  "/api/me",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const me = await prisma.user.findUnique({ where: { id: req.userId! } });
    return res.json(toPublicUser(me));
  }
);

// Update Me (restricted role change)
app.patch(
  "/api/me",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const me = await prisma.user.findUnique({ where: { id: req.userId! } });
      if (!me) return res.status(401).json({ error: "Unauthorized" });

      const {
        name,
        dob,
        gender,
        mobile,
        role, // restricted
        sport,
        profilePic,
        height,
        weight,
        bloodgroup,
        address,
      } = req.body || {};

      // Validate mobile strictly (if provided)
      if (mobile !== undefined && !isTenDigitMobile(mobile)) {
        return res
          .status(400)
          .json({ error: "Mobile must be exactly 10 digits" });
      }

      // Restrict role changes:
      // - If role provided and differs from existing role:
      //   Allow only if there exists an onboarding doc for the requested role.
      let newRole: string | undefined = undefined;
      if (role !== undefined) {
        const requested = String(role).trim();

        if (requested && requested !== me.role) {
          // ENV-GATED relax rule for Admin/Government Official
          const allowNoDocs =
            String(
              process.env.ALLOW_ROLE_CHANGE_NO_DOCS || ""
            ).toLowerCase() === "true";

          const isAdminOrGov =
            requested === "Admin" || requested === "Government Official";

          if (allowNoDocs && isAdminOrGov) {
            // allow change without onboarding doc
            newRole = requested;
          } else {
            // original requirement: onboarding doc for requested role
            const doc = await prisma.onboardingDoc.findFirst({
              where: {
                userId: me.id,
                forRole: requested,
              },
              select: { id: true },
            });
            if (!doc) {
              return res.status(403).json({ error: "Role change not allowed" });
            }
            newRole = requested;
          }
        } else {
          // no change
          newRole = me.role;
        }
      }

      const dobDate = parseDobMaybe(dob);

      // Coerce numeric fields if provided
      const heightNum =
        height !== undefined && height !== null && height !== ""
          ? Number(height)
          : undefined;
      const weightNum =
        weight !== undefined && weight !== null && weight !== ""
          ? Number(weight)
          : undefined;

      const updated = await prisma.user.update({
        where: { id: me.id },
        data: {
          name: name !== undefined ? String(name) : undefined,
          dob: dobDate !== undefined ? dobDate : undefined,
          gender: gender !== undefined ? String(gender) : undefined,
          mobile: mobile !== undefined ? String(mobile) : undefined,
          role: newRole !== undefined ? newRole : undefined,
          sport: sport !== undefined ? String(sport) : undefined,
          profilePic: profilePic !== undefined ? String(profilePic) : undefined,
          height:
            height !== undefined
              ? Number.isFinite(heightNum)
                ? (heightNum as number)
                : null
              : undefined,
          weight:
            weight !== undefined
              ? Number.isFinite(weightNum)
                ? (weightNum as number)
                : null
              : undefined,
          bloodgroup: bloodgroup !== undefined ? String(bloodgroup) : undefined,
          address: address !== undefined ? String(address) : undefined,
        },
      });

      return res.json(toPublicUser(updated));
    } catch (e) {
      console.error("UPDATE_ME_ERROR", e);
      return res.status(500).json({ error: "Server error" });
    }
  }
);

// ==================== ACHIEVEMENTS API (NEW) ====================
// Create achievement
app.post(
  "/api/achievements",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId as string;
      const { title, sport, date, venue, description, proof } = req.body || {};

      // Validation
      if (!title?.trim()) {
        return res.status(400).json({ error: "Title is required" });
      }
      if (!sport?.trim()) {
        return res.status(400).json({ error: "Sport is required" });
      }
      if (!date) {
        return res.status(400).json({ error: "Date is required" });
      }
      if (!venue?.trim()) {
        return res.status(400).json({ error: "Venue is required" });
      }

      const achievementDate = new Date(date);
      if (isNaN(achievementDate.getTime())) {
        return res.status(400).json({ error: "Invalid date format" });
      }

      const created = await prisma.achievement.create({
        data: {
          ownerId: userId,
          title: String(title).trim(),
          sport: String(sport).trim(),
          date: achievementDate,
          venue: String(venue).trim(),
          description: String(description || "").trim(),
          proof: String(proof || ""),
          status: "PENDING",
        },
      });

      res.status(201).json(created);
    } catch (e) {
      console.error("ACHIEVEMENT_CREATE_ERROR", e);
      res.status(500).json({ error: "Server error" });
    }
  }
);

// Get my achievements
app.get(
  "/api/achievements/my",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId as string;
      const items = await prisma.achievement.findMany({
        where: { ownerId: userId },
        orderBy: { createdAt: "desc" },
      });
      res.json(items);
    } catch (e) {
      console.error("ACHIEVEMENT_MY_ERROR", e);
      res.status(500).json({ error: "Server error" });
    }
  }
);

// Update achievement
app.put(
  "/api/achievements/:id",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId as string;
      const id = String(req.params.id || "");

      const existing = await prisma.achievement.findUnique({
        where: { id },
      });

      if (!existing) {
        return res.status(404).json({ error: "Achievement not found" });
      }
      if (existing.ownerId !== userId) {
        return res.status(403).json({ error: "Forbidden" });
      }

      if (existing.status === "APPROVED") {
        return res
          .status(409)
          .json({ error: "Cannot edit approved achievement" });
      }

      const { title, sport, date, venue, description } = req.body || {};

      const achievementDate = date ? new Date(date) : undefined;
      if (achievementDate && isNaN(achievementDate.getTime())) {
        return res.status(400).json({ error: "Invalid date format" });
      }

      const updated = await prisma.achievement.update({
        where: { id },
        data: {
          title: title !== undefined ? String(title).trim() : undefined,
          sport: sport !== undefined ? String(sport).trim() : undefined,
          date: achievementDate,
          venue: venue !== undefined ? String(venue).trim() : undefined,
          description:
            description !== undefined ? String(description).trim() : undefined,
        },
      });

      res.json(updated);
    } catch (e) {
      console.error("ACHIEVEMENT_UPDATE_ERROR", e);
      res.status(500).json({ error: "Server error" });
    }
  }
);

// Delete achievement
app.delete(
  "/api/achievements/:id",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId as string;
      const id = String(req.params.id || "");

      const existing = await prisma.achievement.findUnique({
        where: { id },
      });

      if (!existing) {
        return res.status(404).json({ error: "Achievement not found" });
      }
      if (existing.ownerId !== userId) {
        return res.status(403).json({ error: "Forbidden" });
      }

      if (existing.status === "APPROVED") {
        return res
          .status(409)
          .json({ error: "Cannot delete approved achievement" });
      }

      await prisma.achievement.delete({
        where: { id },
      });

      res.status(204).send();
    } catch (e) {
      console.error("ACHIEVEMENT_DELETE_ERROR", e);
      res.status(500).json({ error: "Server error" });
    }
  }
);

// Get pending achievements (Coach)
app.get(
  "/api/achievements/pending", // Keep same URL for backward compatibility
  requireAuth,
  requireCoach,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.userId as string;
      const coach = await prisma.user.findUnique({
        where: { id: coachId },
      });

      // ✅ NEW: Read status from query parameter, default to PENDING
      const requestedStatus = String(
        req.query.status || "PENDING"
      ).toUpperCase();

      // ✅ NEW: Validate status
      const validStatuses = ["PENDING", "APPROVED", "REJECTED"];
      if (!validStatuses.includes(requestedStatus)) {
        return res.status(400).json({
          error: "Invalid status. Must be PENDING, APPROVED, or REJECTED",
        });
      }

      const where: any = { status: requestedStatus }; // ✅ CHANGED: Use query param
      if (coach?.sport) {
        where.sport = coach.sport;
      }

      const items = await prisma.achievement.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: {
          owner: {
            select: {
              id: true,
              name: true,
              username: true,
              profilePic: true,
              sport: true,
            },
          },
        },
      });

      res.json({ items });
    } catch (e) {
      console.error("ACHIEVEMENT_QUERY_ERROR", e);
      res.status(500).json({ error: "Server error" });
    }
  }
);

// Verify achievement (Coach)
app.patch(
  "/api/achievements/:id/verify",
  requireAuth,
  requireCoach,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.userId as string;
      const id = String(req.params.id || "");
      const { decision, reason } = req.body || {};

      if (!["APPROVED", "REJECTED"].includes(String(decision).toUpperCase())) {
        return res.status(400).json({ error: "Invalid decision" });
      }

      const achievement = await prisma.achievement.findUnique({
        where: { id },
        include: { owner: true },
      });

      if (!achievement) {
        return res.status(404).json({ error: "Achievement not found" });
      }

      if (achievement.status !== "PENDING") {
        return res.status(409).json({ error: "Achievement already reviewed" });
      }

      const coach = await prisma.user.findUnique({
        where: { id: coachId },
      });
      if (
        coach?.sport &&
        achievement.sport &&
        coach.sport !== achievement.sport
      ) {
        return res
          .status(403)
          .json({ error: "Can only verify achievements in your sport" });
      }

      const updated = await prisma.achievement.update({
        where: { id },
        data: {
          status: String(decision).toUpperCase(),
          decisionReason: String(reason || ""),
          verifiedById: coachId,
          verifiedByName: coach?.name || coach?.username || "",
          verifiedAt: new Date(),
        },
      });

      await logAudit(
        "ACHIEVEMENT_VERIFIED",
        "Achievement",
        req.params.id,
        req.userId!,
        { newStatus: updated.status }
      );

      res.json(updated);
    } catch (e) {
      console.error("ACHIEVEMENT_VERIFY_ERROR", e);
      res.status(500).json({ error: "Server error" });
    }
  }
);
// ==================== END ACHIEVEMENTS API ====================

// --- Onboarding: Get Certificate Endpoint ---
app.get(
  "/api/onboarding/certificate",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const doc = await prisma.onboardingDoc.findFirst({
        where: { userId: req.userId! },
        orderBy: { uploadedAt: "desc" },
        select: {
          id: true,
          forRole: true,
          fileName: true,
          mimeType: true,
          size: true,
          url: true,
          status: true,
          uploadedAt: true,
        },
      });

      return res.json(doc);
    } catch (e) {
      console.error("GET_CERT_ERROR", e);
      return res.status(500).json({ error: "Server error" });
    }
  }
);

// --- Onboarding: Upload Certificate Endpoint ---
app.post(
  "/api/onboarding/certificate",
  requireAuth,
  certUpload.single("file"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId as string;
      const file = req.file;
      const forRole = String(req.body?.forRole || "").trim() || "Coach";
      if (!file) return res.status(400).json({ error: "File is required" });

      const url = `/uploads/certificates/${file.filename}`;
      const doc = await prisma.onboardingDoc.create({
        data: {
          userId,
          forRole,
          fileName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          url,
          status: "SUBMITTED",
        },
      });

      res.status(201).json(doc);
    } catch (e) {
      console.error("CERT_UPLOAD_ERROR", e);
      res.status(500).json({ error: "Server error" });
    }
  }
);

// -------------------- Assessments API (MVP) --------------------
const DRILLS = new Set(["SIT_UPS", "RUN_800M", "RUN_1_6K", "BROAD_JUMP"]);
const STATUSES = new Set([
  "AUTO_VERIFIED",
  "PENDING_REVIEW",
  "APPROVED",
  "REJECTED",
]);

// Create assessment (JSON)
app.post(
  "/api/assessments",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId as string;
      const { drill, rawMetrics, score, unit, confidence, status } =
        req.body || {};

      if (!DRILLS.has(String(drill))) {
        return res.status(400).json({ error: "Invalid drill" });
      }
      if (!STATUSES.has(String(status))) {
        return res.status(400).json({ error: "Invalid status" });
      }
      if (typeof score !== "number" || !unit) {
        return res.status(400).json({ error: "Missing score or unit" });
      }

      const created = await prisma.assessment.create({
        data: {
          userId,
          drill: String(drill),
          rawMetrics: rawMetrics ?? {},
          score: Number(score),
          unit: String(unit),
          confidence: typeof confidence === "number" ? confidence : null,
          status: String(status),
        },
      });

      res.status(201).json(created);
    } catch (e) {
      console.error("ASSESSMENT_CREATE_ERROR", e);
      res.status(500).json({ error: "Server error" });
    }
  }
);

// Upload assessment media (multipart)
app.post(
  "/api/assessments/upload",
  requireAuth,
  videoUpload.single("file"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId as string;
      const file = req.file;
      const assessmentId = String(req.body?.assessmentId || "");
      if (!file) return res.status(400).json({ error: "File is required" });
      if (!assessmentId)
        return res.status(400).json({ error: "assessmentId is required" });

      const a = await prisma.assessment.findUnique({
        where: { id: assessmentId },
      });
      if (!a || a.userId !== userId) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const mediaUrl = `/uploads/assessments/${file.filename}`;
      const updated = await prisma.assessment.update({
        where: { id: assessmentId },
        data: { mediaUrl },
      });

      res.json(updated);
    } catch (e: any) {
      if (e?.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ error: "File too large (max 20MB)" });
      }
      console.error("ASSESSMENT_UPLOAD_ERROR", e);
      res.status(500).json({ error: "Server error" });
    }
  }
);

// List my assessments
app.get(
  "/api/assessments/my",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId as string;
      const items = await prisma.assessment.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
      });
      res.json({ items });
    } catch (e) {
      console.error("ASSESSMENT_MY_ERROR", e);
      res.status(500).json({ error: "Server error" });
    }
  }
);

// List pending assessments (Coach) ← UPDATED WITH USER DATA
app.get(
  "/api/assessments/pending",
  requireAuth,
  requireCoach,
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const items = await prisma.assessment.findMany({
        where: { status: "PENDING_REVIEW" },
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              username: true,
              profilePic: true,
              sport: true,
            },
          },
        },
      });
      res.json({ items });
    } catch (e) {
      console.error("ASSESSMENT_PENDING_ERROR", e);
      res.status(500).json({ error: "Server error" });
    }
  }
);

// Review assessment (Coach)
app.patch(
  "/api/assessments/:id/review",
  requireAuth,
  requireCoach,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = String(req.params.id || "");
      const { decision, reason } = req.body || {};
      if (!["APPROVED", "REJECTED"].includes(String(decision))) {
        return res.status(400).json({ error: "Invalid decision" });
      }

      const a = await prisma.assessment.findUnique({ where: { id } });
      if (!a) return res.status(404).json({ error: "Not found" });
      if (a.status !== "PENDING_REVIEW") {
        return res
          .status(409)
          .json({ error: "Already reviewed or not pending" });
      }

      const updated = await prisma.assessment.update({
        where: { id },
        data: {
          status: String(decision),
          reviewNote: reason ? String(reason) : null,
          reviewedBy: req.userId!,
          reviewedAt: new Date(),
        },
      });

      await logAudit(
        "ASSESSMENT_REVIEWED",
        "Assessment",
        req.params.id,
        req.userId!,
        { newStatus: updated.status }
      );

      res.json(updated);
    } catch (e) {
      console.error("ASSESSMENT_REVIEW_ERROR", e);
      res.status(500).json({ error: "Server error" });
    }
  }
);
// ==================== SCHEDULES API ====================

// Create schedule (Coach only)
app.post(
  "/api/schedules",
  requireAuth,
  requireCoach,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.userId as string;
      const { sport, date, startTime, endTime, venue, entrance } =
        req.body || {};

      // Validation
      if (!date) {
        return res.status(400).json({ error: "Date is required" });
      }
      if (!startTime) {
        return res.status(400).json({ error: "Start time is required" });
      }
      if (!venue?.trim()) {
        return res.status(400).json({ error: "Venue is required" });
      }
      if (!["OPEN", "APPROVAL"].includes(String(entrance))) {
        return res.status(400).json({ error: "Invalid entrance type" });
      }

      const scheduleDate = new Date(date);
      if (isNaN(scheduleDate.getTime())) {
        return res.status(400).json({ error: "Invalid date format" });
      }

      // Validate end time if provided
      if (endTime && startTime && endTime <= startTime) {
        return res
          .status(400)
          .json({ error: "End time must be after start time" });
      }

      const created = await prisma.schedule.create({
        data: {
          coachId,
          sport: String(sport || "").trim(),
          date: scheduleDate,
          startTime: String(startTime).trim(),
          endTime: endTime ? String(endTime).trim() : null,
          venue: String(venue).trim(),
          entrance: String(entrance),
        },
      });

      res.status(201).json(created);
    } catch (e) {
      console.error("SCHEDULE_CREATE_ERROR", e);
      res.status(500).json({ error: "Server error" });
    }
  }
);

// Get coach's schedules
app.get(
  "/api/schedules/coach/:coachId",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = String(req.params.coachId || "");

      // Only allow coaches to view their own schedules (or same user)
      if (req.userId !== coachId) {
        const user = await prisma.user.findUnique({
          where: { id: req.userId! },
        });
        if (user?.role !== "Coach" && user?.role !== "Admin") {
          return res.status(403).json({ error: "Forbidden" });
        }
      }

      const schedules = await prisma.schedule.findMany({
        where: { coachId },
        orderBy: { createdAt: "desc" },
        include: {
          _count: {
            select: { requests: true },
          },
        },
      });

      res.json({ items: schedules });
    } catch (e) {
      console.error("SCHEDULE_LIST_ERROR", e);
      res.status(500).json({ error: "Server error" });
    }
  }
);

// Get schedule requests (Coach only)
app.get(
  "/api/schedules/:scheduleId/requests",
  requireAuth,
  requireCoach,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const scheduleId = String(req.params.scheduleId || "");
      const status = String(req.query.status || "PENDING");

      // Verify ownership
      const schedule = await prisma.schedule.findUnique({
        where: { id: scheduleId },
      });

      if (!schedule) {
        return res.status(404).json({ error: "Schedule not found" });
      }

      if (schedule.coachId !== req.userId) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const where: any = { scheduleId };
      if (status) {
        where.status = status;
      }

      const requests = await prisma.scheduleRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: {
          player: {
            select: {
              id: true,
              name: true,
              username: true,
              profilePic: true,
              sport: true,
              dob: true,
            },
          },
        },
      });

      res.json({ items: requests });
    } catch (e) {
      console.error("SCHEDULE_REQUESTS_ERROR", e);
      res.status(500).json({ error: "Server error" });
    }
  }
);

// Update request status (Approve/Reject)
app.patch(
  "/api/requests/:requestId",
  requireAuth,
  requireCoach,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const requestId = String(req.params.requestId || "");
      const { status } = req.body || {};

      if (!["APPROVED", "REJECTED", "PENDING"].includes(String(status))) {
        return res.status(400).json({ error: "Invalid status" });
      }

      const request = await prisma.scheduleRequest.findUnique({
        where: { id: requestId },
        include: { schedule: true },
      });

      if (!request) {
        return res.status(404).json({ error: "Request not found" });
      }

      // Verify coach owns the schedule
      if (request.schedule.coachId !== req.userId) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const updated = await prisma.scheduleRequest.update({
        where: { id: requestId },
        data: {
          status: String(status),
          updatedAt: new Date(),
        },
      });

      res.json(updated);
    } catch (e) {
      console.error("REQUEST_UPDATE_ERROR", e);
      res.status(500).json({ error: "Server error" });
    }
  }
);

// ==================== END SCHEDULES API ====================
// ==================== PLAYER SCHEDULES API ====================

// Get available schedules (Player)
app.get(
  "/api/schedules/available",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.userId as string;
      const player = await prisma.user.findUnique({
        where: { id: playerId },
      });

      // Get schedules for the player's sport
      const where: any = {
        date: { gte: new Date() }, // Only future schedules
      };

      if (player?.sport) {
        where.sport = player.sport;
      }

      const schedules = await prisma.schedule.findMany({
        where,
        orderBy: { date: "asc" },
        include: {
          coach: {
            select: {
              id: true,
              name: true,
              username: true,
              profilePic: true,
            },
          },
          requests: {
            where: { playerId },
            select: {
              id: true,
              status: true,
            },
          },
          _count: {
            select: {
              requests: {
                where: { status: "APPROVED" },
              },
            },
          },
        },
      });

      // Add helper field for frontend
      const enriched = schedules.map((s: any) => ({
        ...s,
        myRequest: s.requests[0] || null,
        approvedCount: s._count.requests,
      }));

      res.json({ items: enriched });
    } catch (e) {
      console.error("AVAILABLE_SCHEDULES_ERROR", e);
      res.status(500).json({ error: "Server error" });
    }
  }
);

// Join a schedule (Player)
app.post(
  "/api/schedules/:scheduleId/join",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.userId as string;
      const scheduleId = String(req.params.scheduleId || "");

      // Verify schedule exists
      const schedule = await prisma.schedule.findUnique({
        where: { id: scheduleId },
        include: {
          coach: {
            select: { name: true, username: true, sport: true },
          },
        },
      });

      if (!schedule) {
        return res.status(404).json({ error: "Schedule not found" });
      }

      // Check if player's sport matches
      const player = await prisma.user.findUnique({
        where: { id: playerId },
      });

      if (player?.sport && schedule.sport && player.sport !== schedule.sport) {
        return res.status(400).json({
          error: "This schedule is for a different sport",
        });
      }

      // Check if request already exists
      const existing = await prisma.scheduleRequest.findUnique({
        where: {
          scheduleId_playerId: { scheduleId, playerId },
        },
      });

      if (existing) {
        return res.status(409).json({
          error: "You have already requested to join this schedule",
          request: existing,
        });
      }

      // Auto-approve if entrance is OPEN
      const status = schedule.entrance === "OPEN" ? "APPROVED" : "PENDING";

      const request = await prisma.scheduleRequest.create({
        data: {
          scheduleId,
          playerId,
          status,
        },
        include: {
          schedule: {
            select: {
              venue: true,
              date: true,
              startTime: true,
              endTime: true,
              sport: true,
            },
          },
        },
      });

      res.status(201).json(request);
    } catch (e) {
      console.error("JOIN_SCHEDULE_ERROR", e);
      res.status(500).json({ error: "Server error" });
    }
  }
);

// Cancel/Leave a schedule (Player)
app.delete(
  "/api/schedules/:scheduleId/leave",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.userId as string;
      const scheduleId = String(req.params.scheduleId || "");

      const request = await prisma.scheduleRequest.findUnique({
        where: {
          scheduleId_playerId: { scheduleId, playerId },
        },
      });

      if (!request) {
        return res.status(404).json({ error: "Request not found" });
      }

      await prisma.scheduleRequest.delete({
        where: {
          scheduleId_playerId: { scheduleId, playerId },
        },
      });

      res.status(204).send();
    } catch (e) {
      console.error("LEAVE_SCHEDULE_ERROR", e);
      res.status(500).json({ error: "Server error" });
    }
  }
);

// Get my schedule requests (Player)
app.get(
  "/api/schedules/my-requests",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.userId as string;

      const requests = await prisma.scheduleRequest.findMany({
        where: { playerId },
        orderBy: { createdAt: "desc" },
        include: {
          schedule: {
            include: {
              coach: {
                select: {
                  id: true,
                  name: true,
                  username: true,
                  profilePic: true,
                },
              },
            },
          },
        },
      });

      res.json({ items: requests });
    } catch (e) {
      console.error("MY_REQUESTS_ERROR", e);
      res.status(500).json({ error: "Server error" });
    }
  }
);

// ==================== END PLAYER SCHEDULES API ====================

// ==================== REPORTS API (FIXED) ====================

// Coach Reports Endpoint
app.get(
  "/api/reports/coach",
  requireAuth,
  requireCoach,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.userId!;
      const coach = await prisma.user.findUnique({ where: { id: coachId } });
      const coachSport = coach?.sport;

      // Define date ranges
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const nextSevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      // 1. Attendance Rate (using schedule requests)
      const scheduleRequests = await prisma.scheduleRequest.findMany({
        where: {
          schedule: { coachId },
          createdAt: { gte: thirtyDaysAgo },
        },
      });
      const totalRequests = scheduleRequests.length;
      const attendedRequests = scheduleRequests.filter(
        (r: any) => r.status === "APPROVED"
      ).length;
      const attendanceRatePct =
        totalRequests > 0 ? (attendedRequests / totalRequests) * 100 : 0;

      // 2. Achievements (approved vs pending) for players of the coach's sport
      const achievements = await prisma.achievement.findMany({
        where: {
          owner: { sport: coachSport ?? undefined },
        },
      });
      const achievementsApproved = achievements.filter(
        (a: any) => a.status === "APPROVED"
      ).length;
      const achievementsPending = achievements.filter(
        (a: any) => a.status === "PENDING"
      ).length;

      // 3. Active Players This Week
      const activePlayersResult = await prisma.scheduleRequest.groupBy({
        by: ["playerId"],
        where: {
          schedule: { coachId },
          createdAt: { gte: sevenDaysAgo },
        },
      });
      const activePlayersThisWeek = activePlayersResult.length;

      // 4. Upcoming Sessions (Next 7 Days)
      const upcomingSessions7d = await prisma.schedule.count({
        where: {
          coachId,
          date: { gte: now, lte: nextSevenDays },
        },
      });

      // 5. Tournament Registrations (for tournaments of the coach's sport)
      const tournaments = await prisma.tournament.findMany({
        where: { sport: coachSport ?? undefined },
        select: {
          _count: {
            select: {
              registrations: {
                where: { regStatus: "PENDING" },
              },
            },
          },
          registrations: {
            where: { regStatus: "CONFIRMED" },
          },
        },
      });

      let regPending = 0;
      let regConfirmed = 0;
      tournaments.forEach((t: any) => {
        regPending += t._count.registrations;
        regConfirmed += t.registrations.length;
      });

      const kpis = {
        attendanceRatePct,
        achievementsApproved,
        achievementsPending,
        activePlayersThisWeek,
        upcomingSessions7d,
        regPending,
        regConfirmed,
      };

      res.json(kpis);
    } catch (error) {
      console.error("COACH_REPORTS_ERROR", error);
      res.status(500).json({ error: "Failed to generate coach report" });
    }
  }
);

// ==================== NEW: ADMIN TOURNAMENTS API ====================

// 1. List Admin Tournaments (with filters, search, pagination)
app.get(
  "/api/admin/tournaments",
  requireAuth,
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId as string;

      // Parse query params
      const page = parseInt(String(req.query.page || "1"));
      const limit = parseInt(String(req.query.limit || "10"));
      const statusParam = String(req.query.status || "").toUpperCase();
      const search = String(req.query.search || "")
        .trim()
        .toLowerCase();

      const skip = (page - 1) * limit;

      // Build where clause
      const where: any = { createdBy: userId };

      // Status filter (only allow DRAFT or PUBLISHED)
      if (statusParam === "DRAFT" || statusParam === "PUBLISHED") {
        where.status = statusParam;
      }

      // Search filter
      if (search) {
        where.OR = [
          { name: { contains: search, mode: "insensitive" } },
          { sport: { contains: search, mode: "insensitive" } },
          { venue: { contains: search, mode: "insensitive" } },
        ];
      }

      // Execute queries in parallel
      const [items, total] = await Promise.all([
        prisma.tournament.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: "desc" },
          include: {
            _count: {
              select: {
                registrations: true,
              },
            },
          },
        }),
        prisma.tournament.count({ where }),
      ]);

      return res.json({
        success: true,
        data: {
          items,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
        },
      });
    } catch (e) {
      console.error("LIST_ADMIN_TOURNAMENTS_ERROR", e);
      return res.status(500).json({ error: "Server error" });
    }
  }
);

// 2. Get Admin Dashboard Stats
app.get(
  "/api/admin/tournaments/stats",
  requireAuth,
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId as string;

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      // Parallel queries for performance
      const [
        totalCount,
        publishedCount,
        draftCount,
        totalRegistrations,
        pendingApprovals,
        activeTournaments,
      ] = await Promise.all([
        // Total tournaments created by this admin
        prisma.tournament.count({
          where: { createdBy: userId },
        }),

        // Published tournaments
        prisma.tournament.count({
          where: { createdBy: userId, status: "PUBLISHED" },
        }),

        // Draft tournaments
        prisma.tournament.count({
          where: { createdBy: userId, status: "DRAFT" },
        }),

        // Total registrations across all admin's tournaments
        prisma.tournamentRegistration.count({
          where: {
            tournament: { createdBy: userId },
          },
        }),

        // Pending approvals (only for tournaments with needsApproval=true)
        prisma.tournamentRegistration.count({
          where: {
            tournament: { createdBy: userId, needsApproval: true },
            regStatus: "PENDING",
          },
        }),

        // Active tournaments (happening today: start <= today <= end)
        prisma.tournament.count({
          where: {
            createdBy: userId,
            status: "PUBLISHED",
            startDateTime: { lte: now },
            endDateTime: { gte: today },
          },
        }),
      ]);

      return res.json({
        success: true,
        data: {
          totalTournaments: totalCount,
          publishedTournaments: publishedCount,
          draftTournaments: draftCount,
          totalRegistrations,
          pendingApprovals,
          activeTournaments,
        },
      });
    } catch (e) {
      console.error("ADMIN_STATS_ERROR", e);
      return res.status(500).json({ error: "Server error" });
    }
  }
);

// 3. Create Tournament (accept status field)
app.post(
  "/api/admin/tournaments",
  requireAuth,
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId as string;

      const {
        name,
        sport,
        startDateTime,
        endDateTime,
        state,
        district,
        venue,
        description,
        needsApproval,
        status,
      } = req.body;

      // Validate required fields
      if (
        !name ||
        !sport ||
        !startDateTime ||
        !endDateTime ||
        !state ||
        !district ||
        !venue
      ) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Validate status (default to DRAFT if not provided)
      const tournamentStatus =
        status === "PUBLISHED" || status === "DRAFT" ? status : "DRAFT";

      const tournament = await prisma.tournament.create({
        data: {
          name: String(name).trim(),
          sport: String(sport).trim(),
          startDateTime: new Date(startDateTime),
          endDateTime: new Date(endDateTime),
          state: String(state).trim(),
          district: String(district).trim(),
          venue: String(venue).trim(),
          description: description ? String(description).trim() : "",
          needsApproval: needsApproval === true,
          status: tournamentStatus,
          createdBy: userId,
          // If status is PUBLISHED, set publishedAt and publishedBy
          ...(tournamentStatus === "PUBLISHED" && {
            publishedAt: new Date(),
            publishedBy: userId,
          }),
        },
      });

      return res.status(201).json({ success: true, data: tournament });
    } catch (e) {
      console.error("CREATE_TOURNAMENT_ERROR", e);
      return res.status(500).json({ error: "Server error" });
    }
  }
);

// 4. Update Tournament (with restrictions if registrations exist)
app.put(
  "/api/admin/tournaments/:id",
  requireAuth,
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId as string;
      const tournamentId = String(req.params.id || "");

      // Fetch tournament with registration count
      const tournament = await prisma.tournament.findUnique({
        where: { id: tournamentId },
        include: {
          _count: { select: { registrations: true } },
        },
      });

      if (!tournament) {
        return res.status(404).json({ error: "Tournament not found" });
      }

      // Only creator can edit
      if (tournament.createdBy !== userId) {
        return res
          .status(403)
          .json({ error: "Only the creator can edit this tournament" });
      }

      const hasRegistrations = tournament._count.registrations > 0;

      const { description, venue, startDateTime, endDateTime } = req.body;

      // If tournament has registrations, restrict to safe fields only
      if (hasRegistrations) {
        const safeUpdates: any = {};

        if (description !== undefined)
          safeUpdates.description = String(description).trim();
        if (venue !== undefined) safeUpdates.venue = String(venue).trim();
        if (startDateTime !== undefined) {
          safeUpdates.startDateTime = new Date(startDateTime);
        }
        if (endDateTime !== undefined) {
          safeUpdates.endDateTime = new Date(endDateTime);
        }

        const updated = await prisma.tournament.update({
          where: { id: tournamentId },
          data: {
            ...safeUpdates,
            updatedAt: new Date(),
          },
        });

        return res.json({
          success: true,
          data: updated,
          warning: "Limited fields updated due to existing registrations",
        });
      }

      // No registrations - allow more extensive updates
      const updateData: any = {
        updatedAt: new Date(),
      };

      if (description !== undefined)
        updateData.description = String(description).trim();
      if (venue !== undefined) updateData.venue = String(venue).trim();
      if (startDateTime !== undefined) {
        updateData.startDateTime = new Date(startDateTime);
      }
      if (endDateTime !== undefined) {
        updateData.endDateTime = new Date(endDateTime);
      }

      const updated = await prisma.tournament.update({
        where: { id: tournamentId },
        data: updateData,
      });

      return res.json({ success: true, data: updated });
    } catch (e) {
      console.error("UPDATE_TOURNAMENT_ERROR", e);
      return res.status(500).json({ error: "Server error" });
    }
  }
);

// 5. Delete Tournament (only if no registrations)
app.delete(
  "/api/admin/tournaments/:id",
  requireAuth,
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId as string;
      const tournamentId = String(req.params.id || "");

      const tournament = await prisma.tournament.findUnique({
        where: { id: tournamentId },
        include: {
          _count: { select: { registrations: true } },
        },
      });

      if (!tournament) {
        return res.status(404).json({ error: "Tournament not found" });
      }

      // Only creator can delete
      if (tournament.createdBy !== userId) {
        return res
          .status(403)
          .json({ error: "Only the creator can delete this tournament" });
      }

      // Check for registrations
      if (tournament._count.registrations > 0) {
        return res.status(409).json({
          error: "Cannot delete tournament with existing registrations",
          detail: `This tournament has ${tournament._count.registrations} registration(s). Please ensure refunds are processed first.`,
        });
      }

      // Delete tournament
      await prisma.tournament.delete({
        where: { id: tournamentId },
      });

      return res.status(204).send();
    } catch (e) {
      console.error("DELETE_TOURNAMENT_ERROR", e);
      return res.status(500).json({ error: "Server error" });
    }
  }
);

// 6. Publish Tournament (dedicated endpoint)
app.patch(
  "/api/admin/tournaments/:id/publish",
  requireAuth,
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId as string;
      const tournamentId = String(req.params.id || "");

      // Fetch tournament
      const tournament = await prisma.tournament.findUnique({
        where: { id: tournamentId },
        include: {
          _count: { select: { registrations: true } },
        },
      });

      if (!tournament) {
        return res.status(404).json({ error: "Tournament not found" });
      }

      // Only creator can publish
      if (tournament.createdBy !== userId) {
        return res
          .status(403)
          .json({ error: "Only the creator can publish this tournament" });
      }

      // Check if already published
      if (tournament.status === "PUBLISHED") {
        return res.status(400).json({
          error: "Tournament is already published",
          data: tournament,
        });
      }

      // Update status to PUBLISHED
      const updated = await prisma.tournament.update({
        where: { id: tournamentId },
        data: {
          status: "PUBLISHED",
          publishedAt: new Date(),
          publishedBy: userId,
          updatedAt: new Date(),
        },
      });

      await logAudit(
        "TOURNAMENT_PUBLISHED",
        "Tournament",
        req.params.id,
        req.userId!
      );

      return res.json({
        success: true,
        data: updated,
        message: "Tournament published successfully",
      });
    } catch (e) {
      console.error("PUBLISH_TOURNAMENT_ERROR", e);
      return res.status(500).json({ error: "Server error" });
    }
  }
);

// 7. Unpublish Tournament (dedicated endpoint)
app.patch(
  "/api/admin/tournaments/:id/unpublish",
  requireAuth,
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId as string;
      const tournamentId = String(req.params.id || "");

      // Fetch tournament
      const tournament = await prisma.tournament.findUnique({
        where: { id: tournamentId },
        include: {
          _count: { select: { registrations: true } },
        },
      });

      if (!tournament) {
        return res.status(404).json({ error: "Tournament not found" });
      }

      // Only creator can unpublish
      if (tournament.createdBy !== userId) {
        return res
          .status(403)
          .json({ error: "Only the creator can unpublish this tournament" });
      }

      // Check if already a draft
      if (tournament.status === "DRAFT") {
        return res.status(400).json({
          error: "Tournament is already a draft",
          data: tournament,
        });
      }

      // Check for registrations - warn but allow
      if (tournament._count.registrations > 0) {
        console.warn(
          `Unpublishing tournament ${tournamentId} with ${tournament._count.registrations} registrations`
        );
      }

      // Update status to DRAFT
      const updated = await prisma.tournament.update({
        where: { id: tournamentId },
        data: {
          status: "DRAFT",
          updatedAt: new Date(),
        },
      });

      await logAudit(
        "TOURNAMENT_UNPUBLISHED",
        "Tournament",
        req.params.id,
        req.userId!
      );

      return res.json({
        success: true,
        data: updated,
        message: "Tournament unpublished successfully",
        warning:
          tournament._count.registrations > 0
            ? `This tournament has ${tournament._count.registrations} existing registrations`
            : undefined,
      });
    } catch (e) {
      console.error("UNPUBLISH_TOURNAMENT_ERROR", e);
      return res.status(500).json({ error: "Server error" });
    }
  }
);

// ==================== END ADMIN TOURNAMENTS API ====================

// ==================== ✨ NEW: TOURNAMENT REGISTRATIONS API ✨ ====================

// 1. Player Registration Endpoint (handles auto-approval)
app.post(
  "/api/tournaments/:tournamentId/register",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.userId as string;
      const tournamentId = String(req.params.tournamentId || "");

      // Fetch tournament
      const tournament = await prisma.tournament.findUnique({
        where: { id: tournamentId },
      });

      if (!tournament) {
        return res.status(404).json({ error: "Tournament not found" });
      }

      // Only allow registration for PUBLISHED tournaments
      if (tournament.status !== "PUBLISHED") {
        return res.status(400).json({
          error: "This tournament is not published yet",
        });
      }

      // Check if already registered
      const existing = await prisma.tournamentRegistration.findUnique({
        where: {
          tournamentId_playerId: { tournamentId, playerId },
        },
      });

      if (existing) {
        // If previously REJECTED, allow re-registration (UPDATE)
        if (existing.regStatus === "REJECTED") {
          const desiredStatus = tournament.needsApproval
            ? "PENDING"
            : "CONFIRMED";

          const updated = await prisma.tournamentRegistration.update({
            where: { id: existing.id },
            data: {
              regStatus: desiredStatus,
              registeredAt: new Date(),
              regDecisionAt: null,
              regDecisionBy: null,
              regDecisionReason: null,
            },
            include: {
              tournament: {
                select: { name: true, startDateTime: true, venue: true },
              },
            },
          });

          return res.status(200).json({
            success: true,
            data: updated,
            message: "Re-registered successfully",
          });
        } else {
          // Already registered (PENDING or CONFIRMED)
          return res.status(409).json({
            error: "Already registered for this tournament",
            currentStatus: existing.regStatus,
          });
        }
      }

      // Create new registration
      // Auto-approve if needsApproval = false
      const desiredStatus = tournament.needsApproval ? "PENDING" : "CONFIRMED";

      const registration = await prisma.tournamentRegistration.create({
        data: {
          tournamentId,
          playerId,
          regStatus: desiredStatus,
        },
        include: {
          tournament: {
            select: { name: true, startDateTime: true, venue: true },
          },
          player: {
            select: { name: true, username: true, email: true },
          },
        },
      });

      // Send email notification if auto-confirmed
      if (desiredStatus === "CONFIRMED") {
        await sendRegistrationEmail({
          playerEmail: registration.player.email,
          playerName: registration.player.name || registration.player.username,
          tournamentName: registration.tournament.name,
          status: "CONFIRMED",
        });
      }

      return res.status(201).json({
        success: true,
        data: registration,
        message:
          desiredStatus === "CONFIRMED"
            ? "Registration confirmed!"
            : "Registration submitted for approval",
      });
    } catch (e) {
      console.error("TOURNAMENT_REGISTER_ERROR", e);
      return res.status(500).json({ error: "Server error" });
    }
  }
);

// 2. List Registrations for a Tournament (Admin only, with filters)
app.get(
  "/api/admin/tournaments/:tournamentId/registrations",
  requireAuth,
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const adminId = req.userId as string;
      const tournamentId = String(req.params.tournamentId || "");
      const statusFilter = String(req.query.status || "").toUpperCase();
      const searchQuery = String(req.query.search || "")
        .trim()
        .toLowerCase();

      // Verify admin owns this tournament
      const tournament = await prisma.tournament.findUnique({
        where: { id: tournamentId },
      });

      if (!tournament) {
        return res.status(404).json({ error: "Tournament not found" });
      }

      if (tournament.createdBy !== adminId) {
        return res.status(403).json({
          error: "You can only view registrations for your own tournaments",
        });
      }

      // Build where clause
      const where: any = { tournamentId };

      // Status filter
      if (["PENDING", "CONFIRMED", "REJECTED"].includes(statusFilter)) {
        where.regStatus = statusFilter;
      }

      // Fetch registrations with player data
      let registrations = await prisma.tournamentRegistration.findMany({
        where,
        orderBy: { registeredAt: "desc" },
        include: {
          player: {
            select: {
              id: true,
              name: true,
              username: true,
              email: true,
              mobile: true,
              sport: true,
              profilePic: true,
              dob: true,
            },
          },
        },
      });

      // Search filter (in-memory for simplicity)
      if (searchQuery) {
        registrations = registrations.filter((reg: any) => {
          const playerName = (reg.player.name || "").toLowerCase();
          const playerEmail = (reg.player.email || "").toLowerCase();
          const playerUsername = (reg.player.username || "").toLowerCase();

          return (
            playerName.includes(searchQuery) ||
            playerEmail.includes(searchQuery) ||
            playerUsername.includes(searchQuery)
          );
        });
      }

      return res.json({
        success: true,
        data: { items: registrations },
      });
    } catch (e) {
      console.error("LIST_REGISTRATIONS_ERROR", e);
      return res.status(500).json({ error: "Server error" });
    }
  }
);

// 3. Get Registration Stats for a Tournament (Admin only)
app.get(
  "/api/admin/tournaments/:tournamentId/registrations/stats",
  requireAuth,
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const adminId = req.userId as string;
      const tournamentId = String(req.params.tournamentId || "");

      // Verify ownership
      const tournament = await prisma.tournament.findUnique({
        where: { id: tournamentId },
      });

      if (!tournament) {
        return res.status(404).json({ error: "Tournament not found" });
      }

      if (tournament.createdBy !== adminId) {
        return res.status(403).json({ error: "Forbidden" });
      }

      // Get counts
      const [total, pending, confirmed, rejected] = await Promise.all([
        prisma.tournamentRegistration.count({ where: { tournamentId } }),
        prisma.tournamentRegistration.count({
          where: { tournamentId, regStatus: "PENDING" },
        }),
        prisma.tournamentRegistration.count({
          where: { tournamentId, regStatus: "CONFIRMED" },
        }),
        prisma.tournamentRegistration.count({
          where: { tournamentId, regStatus: "REJECTED" },
        }),
      ]);

      return res.json({
        success: true,
        data: {
          total,
          pending,
          confirmed,
          rejected,
        },
      });
    } catch (e) {
      console.error("REGISTRATION_STATS_ERROR", e);
      return res.status(500).json({ error: "Server error" });
    }
  }
);

// 4. Approve/Reject Single Registration (Admin only)
app.patch(
  "/api/admin/registrations/:registrationId",
  requireAuth,
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const adminId = req.userId as string;
      const registrationId = String(req.params.registrationId || "");
      const { status, reason } = req.body || {};

      // Validate status
      if (!["CONFIRMED", "REJECTED"].includes(String(status).toUpperCase())) {
        return res.status(400).json({
          error: "Invalid status. Must be CONFIRMED or REJECTED",
        });
      }

      const desiredStatus = String(status).toUpperCase();

      // Validate reason for rejection
      if (desiredStatus === "REJECTED" && !String(reason || "").trim()) {
        return res.status(400).json({
          error: "Reason is required for rejections",
        });
      }

      // Fetch registration with tournament
      const registration = await prisma.tournamentRegistration.findUnique({
        where: { id: registrationId },
        include: {
          tournament: { select: { createdBy: true, name: true } },
          player: { select: { email: true, name: true, username: true } },
        },
      });

      if (!registration) {
        return res.status(404).json({ error: "Registration not found" });
      }

      // Verify admin owns the tournament
      if (registration.tournament.createdBy !== adminId) {
        return res.status(403).json({
          error: "You can only manage registrations for your own tournaments",
        });
      }

      // Update registration
      const updated = await prisma.tournamentRegistration.update({
        where: { id: registrationId },
        data: {
          regStatus: desiredStatus,
          regDecisionAt: new Date(),
          regDecisionBy: adminId,
          regDecisionReason:
            desiredStatus === "REJECTED" ? String(reason).trim() : null,
        },
      });

      // Send email notification
      await sendRegistrationEmail({
        playerEmail: registration.player.email,
        playerName: registration.player.name || registration.player.username,
        tournamentName: registration.tournament.name,
        status: desiredStatus as "CONFIRMED" | "REJECTED",
        reason:
          desiredStatus === "REJECTED" ? String(reason).trim() : undefined,
      });

      await logAudit(
        "REGISTRATION_STATUS_CHANGED",
        "TournamentRegistration",
        req.params.registrationId,
        req.userId!,
        { newStatus: updated.regStatus }
      );

      return res.json({
        success: true,
        data: updated,
        message: `Registration ${desiredStatus.toLowerCase()}`,
      });
    } catch (e) {
      console.error("UPDATE_REGISTRATION_ERROR", e);
      return res.status(500).json({ error: "Server error" });
    }
  }
);

// 5. Bulk Approve/Reject Registrations (Admin only, max 10)
app.patch(
  "/api/admin/registrations/bulk",
  requireAuth,
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const adminId = req.userId as string;
      const { registrationIds, status, reason } = req.body || {};

      // Validate input
      if (!Array.isArray(registrationIds) || registrationIds.length === 0) {
        return res.status(400).json({
          error: "registrationIds must be a non-empty array",
        });
      }

      // Enforce max 10 limit
      if (registrationIds.length > 10) {
        return res.status(400).json({
          error: "Cannot process more than 10 registrations at once",
        });
      }

      // Validate status
      if (!["CONFIRMED", "REJECTED"].includes(String(status).toUpperCase())) {
        return res.status(400).json({
          error: "Invalid status. Must be CONFIRMED or REJECTED",
        });
      }

      const desiredStatus = String(status).toUpperCase();

      // Validate reason for bulk rejection
      if (desiredStatus === "REJECTED" && !String(reason || "").trim()) {
        return res.status(400).json({
          error: "Reason is required for bulk rejections",
        });
      }

      // Fetch all registrations with tournament data
      const registrations = await prisma.tournamentRegistration.findMany({
        where: { id: { in: registrationIds } },
        include: {
          tournament: { select: { createdBy: true, name: true } },
          player: { select: { email: true, name: true, username: true } },
        },
      });

      if (registrations.length === 0) {
        return res.status(404).json({ error: "No registrations found" });
      }

      // Verify admin owns all tournaments
      const unauthorized = registrations.find(
        (reg: any) => reg.tournament.createdBy !== adminId
      );

      if (unauthorized) {
        return res.status(403).json({
          error: "You can only manage registrations for your own tournaments",
        });
      }

      // Bulk update
      await prisma.tournamentRegistration.updateMany({
        where: { id: { in: registrationIds } },
        data: {
          regStatus: desiredStatus,
          regDecisionAt: new Date(),
          regDecisionBy: adminId,
          regDecisionReason:
            desiredStatus === "REJECTED" ? String(reason).trim() : null,
        },
      });

      // Send email notifications
      const emailPromises = registrations.map((reg: any) =>
        sendRegistrationEmail({
          playerEmail: reg.player.email,
          playerName: reg.player.name || reg.player.username,
          tournamentName: reg.tournament.name,
          status: desiredStatus as "CONFIRMED" | "REJECTED",
          reason:
            desiredStatus === "REJECTED" ? String(reason).trim() : undefined,
        })
      );

      await Promise.all(emailPromises);

      return res.json({
        success: true,
        message: `${
          registrations.length
        } registration(s) ${desiredStatus.toLowerCase()}`,
        count: registrations.length,
      });
    } catch (e) {
      console.error("BULK_UPDATE_REGISTRATION_ERROR", e);
      return res.status(500).json({ error: "Server error" });
    }
  }
);

// ==================== ✨ END TOURNAMENT REGISTRATIONS API ✨ ====================
// ==================== PUBLIC TOURNAMENTS API (PUBLISHED) ====================

// List published tournaments (Player-facing)
app.get(
  "/api/tournaments/published",
  requireAuth, // If you want to allow unauthenticated discovery, remove requireAuth
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        state = "",
        district = "",
        search = "",
        page = "1",
        limit = "10",
      } = req.query as any;

      const pageNum = Math.max(1, parseInt(String(page) || "1", 10));
      const limitNum = Math.min(
        50,
        Math.max(1, parseInt(String(limit) || "10", 10))
      );
      const skip = (pageNum - 1) * limitNum;

      const where: any = { status: "PUBLISHED" };

      if (state) where.state = String(state);
      if (district) where.district = String(district);
      if (search) {
        const s = String(search).trim();
        where.OR = [
          { name: { contains: s, mode: "insensitive" } },
          { venue: { contains: s, mode: "insensitive" } },
          { sport: { contains: s, mode: "insensitive" } },
          { district: { contains: s, mode: "insensitive" } },
          { state: { contains: s, mode: "insensitive" } },
        ];
      }

      const [items, total] = await Promise.all([
        prisma.tournament.findMany({
          where,
          skip,
          take: limitNum,
          orderBy: { startDateTime: "asc" },
          select: {
            id: true,
            name: true,
            sport: true,
            venue: true,
            state: true,
            district: true,
            description: true,
            startDateTime: true,
            endDateTime: true,
            needsApproval: true,
            status: true,
            // If you later add media/banner columns, you can select here
          },
        }),
        prisma.tournament.count({ where }),
      ]);

      return res.json({
        success: true,
        data: {
          items,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            totalPages: Math.ceil(total / limitNum),
          },
        },
      });
    } catch (e) {
      console.error("LIST_PUBLISHED_TOURNAMENTS_ERROR", e);
      return res.status(500).json({ error: "Server error" });
    }
  }
);

// Get a single published tournament (Player-facing)
app.get(
  "/api/tournaments/:id",
  requireAuth, // Remove if you want public access
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = String(req.params.id || "");
      const t = await prisma.tournament.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          sport: true,
          venue: true,
          state: true,
          district: true,
          description: true,
          startDateTime: true,
          endDateTime: true,
          needsApproval: true,
          status: true,
        },
      });

      if (!t || t.status !== "PUBLISHED") {
        return res.status(404).json({ error: "Tournament not found" });
      }

      return res.json({ success: true, data: t });
    } catch (e) {
      console.error("GET_TOURNAMENT_ERROR", e);
      return res.status(500).json({ error: "Server error" });
    }
  }
);

// ==================== END PUBLIC TOURNAMENTS API (PUBLISHED) ====================

// ==================== ✨ GOVERNMENT OFFICIALS API ✨ ====================

/**
 * Government Officials Dashboard API
 * National-level monitoring with regional filtering
 * Read-only access with CSV export capabilities
 */

// ==================== 1. Dashboard Stats ====================
app.get(
  "/api/gov/stats",
  requireAuth,
  requireGovOfficial,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const stateFilter = String(req.query.state || "").trim();
      const districtFilter = String(req.query.district || "").trim();

      // Build tournament where clause with regional filters
      const tournamentWhere: any = { status: "PUBLISHED" };
      if (stateFilter) tournamentWhere.state = stateFilter;
      if (districtFilter) tournamentWhere.district = districtFilter;

      // Build user where clause (players/coaches)
      // Note: User table doesn't have state/district, so we filter by tournaments they're registered in
      const userWhere: any = { role: "Player" };
      const coachWhere: any = { role: "Coach" };

      // Parallel queries for performance
      const [
        totalTournaments,
        publishedTournaments,
        totalRegistrations,
        totalPlayers,
        totalCoaches,
        totalAchievements,
        pendingAchievements,
        approvedAchievements,
        rejectedAchievements,
      ] = await Promise.all([
        // Tournaments
        prisma.tournament.count({ where: tournamentWhere }),
        prisma.tournament.count({
          where: { ...tournamentWhere, status: "PUBLISHED" },
        }),

        // Registrations (for filtered tournaments)
        prisma.tournamentRegistration.count({
          where: {
            tournament: tournamentWhere,
          },
        }),

        // Players (all - no regional filter on User table)
        prisma.user.count({ where: userWhere }),

        // Coaches (all - no regional filter on User table)
        prisma.user.count({ where: coachWhere }),

        // Achievements (all)
        prisma.achievement.count(),

        // Achievements by status
        prisma.achievement.count({ where: { status: "PENDING" } }),
        prisma.achievement.count({ where: { status: "APPROVED" } }),
        prisma.achievement.count({ where: { status: "REJECTED" } }),
      ]);
      // Additional analytics: Registrations by state
      const regsByState = await prisma.tournamentRegistration.groupBy({
        by: ["tournamentId"],
        where: {
          tournament: tournamentWhere,
        },
        _count: true,
      });

      // Map tournament IDs to states
      const tournamentStates = await prisma.tournament.findMany({
        where: tournamentWhere,
        select: {
          id: true,
          state: true,
        },
      });

      const stateMap = new Map<string, number>();
      regsByState.forEach((reg) => {
        const tournament = tournamentStates.find(
          (t) => t.id === reg.tournamentId
        );
        if (tournament?.state) {
          stateMap.set(
            tournament.state,
            (stateMap.get(tournament.state) || 0) + reg._count
          );
        }
      });

      const playersByState = Array.from(stateMap.entries()).map(
        ([state, count]) => ({
          state,
          count,
        })
      );
      // Coaches by sport
      const coachesBySport = await prisma.user.groupBy({
        by: ["sport"],
        where: coachWhere,
        _count: {
          id: true, // Count by a unique field like id
        },
      });

      // Tournaments by month (last 12 months)
      const twelveMonthsAgo = new Date();
      twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

      const tournamentsByMonth = await prisma.tournament.groupBy({
        by: ["startDateTime"],
        where: {
          ...tournamentWhere,
          startDateTime: { gte: twelveMonthsAgo },
        },
        _count: true,
      });

      return res.json({
        success: true,
        data: {
          // Core KPIs
          totalTournaments,
          publishedTournaments,
          totalRegistrations,
          totalPlayers,
          totalCoaches,
          totalAchievements,
          pendingAchievements,
          approvedAchievements,
          rejectedAchievements,

          // Analytics
          playersByState: playersByState, // Already formatted above
          coachesBySport: coachesBySport.map((c) => ({
            sport: c.sport || "Unspecified",
            count: c._count.id, // Match the corrected count field
          })),
          tournamentsByMonth: tournamentsByMonth.length,

          // Filters applied
          filters: {
            state: stateFilter || null,
            district: districtFilter || null,
          },
        },
      });
    } catch (e) {
      console.error("GOV_STATS_ERROR", e);
      return res.status(500).json({ error: "Server error" });
    }
  }
);

// ==================== 2. Tournament Monitoring ====================
app.get(
  "/api/gov/tournaments",
  requireAuth,
  requireGovOfficial,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const stateFilter = String(req.query.state || "").trim();
      const districtFilter = String(req.query.district || "").trim();
      const statusFilter = String(req.query.status || "").toUpperCase();
      const searchQuery = String(req.query.search || "").trim();
      const page = parseInt(String(req.query.page || "1"));
      const limit = Math.min(50, parseInt(String(req.query.limit || "20")));

      const skip = (page - 1) * limit;

      // ========================================================
      // ✨ SNIPPET START: Corrected Where Clause
      // ========================================================
      const where: any = {
        AND: [],
      };

      // Regional filters
      if (stateFilter) where.AND.push({ state: stateFilter });
      if (districtFilter) where.AND.push({ district: districtFilter });

      // Status filter
      if (statusFilter === "PUBLISHED" || statusFilter === "DRAFT") {
        where.AND.push({ status: statusFilter });
      }

      // Search filter
      if (searchQuery) {
        where.AND.push({
          OR: [
            { name: { contains: searchQuery, mode: "insensitive" } },
            { sport: { contains: searchQuery, mode: "insensitive" } },
            { venue: { contains: searchQuery, mode: "insensitive" } },
          ],
        });
      }

      // If no filters were added, remove the empty AND to prevent errors
      if (where.AND.length === 0) {
        delete where.AND;
      }
      // ========================================================
      // ✨ SNIPPET END
      // ========================================================
      // If no filters were added, remove the empty AND
      if (where.AND.length === 0) {
        delete where.AND;
      }
      // ========================================================
      // ✨ SNIPPET END
      // ========================================================

      // Execute queries in parallel
      const [items, total] = await Promise.all([
        prisma.tournament.findMany({
          where,
          skip,
          take: limit,
          orderBy: { startDateTime: "desc" },
          include: {
            _count: {
              select: {
                registrations: true,
              },
            },
            creator: {
              select: {
                id: true,
                name: true,
                username: true,
                email: true,
              },
            },
          },
        }),
        prisma.tournament.count({ where }),
      ]);

      return res.json({
        success: true,
        data: {
          items,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
        },
      });
    } catch (e) {
      console.error("GOV_TOURNAMENTS_ERROR", e);
      return res.status(500).json({ error: "Server error" });
    }
  }
);

// ==================== 3. Tournament Registrations Detail ====================
app.get(
  "/api/gov/tournaments/:tournamentId/registrations",
  requireAuth,
  requireGovOfficial,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const tournamentId = String(req.params.tournamentId || "");
      const statusFilter = String(req.query.status || "").toUpperCase();

      // Fetch tournament
      const tournament = await prisma.tournament.findUnique({
        where: { id: tournamentId },
        select: {
          id: true,
          name: true,
          sport: true,
          state: true,
          district: true,
          venue: true,
          startDateTime: true,
          endDateTime: true,
        },
      });

      if (!tournament) {
        return res.status(404).json({ error: "Tournament not found" });
      }

      // Build where clause for registrations
      const where: any = { tournamentId };
      if (["PENDING", "CONFIRMED", "REJECTED"].includes(statusFilter)) {
        where.regStatus = statusFilter;
      }

      // Fetch registrations
      const registrations = await prisma.tournamentRegistration.findMany({
        where,
        orderBy: { registeredAt: "desc" },
        include: {
          player: {
            select: {
              id: true,
              name: true,
              username: true,
              email: true,
              mobile: true,
              sport: true,
              profilePic: true,
            },
          },
        },
      });

      // Get stats
      const [total, pending, confirmed, rejected] = await Promise.all([
        prisma.tournamentRegistration.count({
          where: { tournamentId },
        }),
        prisma.tournamentRegistration.count({
          where: { tournamentId, regStatus: "PENDING" },
        }),
        prisma.tournamentRegistration.count({
          where: { tournamentId, regStatus: "CONFIRMED" },
        }),
        prisma.tournamentRegistration.count({
          where: { tournamentId, regStatus: "REJECTED" },
        }),
      ]);

      return res.json({
        success: true,
        data: {
          tournament,
          stats: { total, pending, confirmed, rejected },
          items: registrations,
        },
      });
    } catch (e) {
      console.error("GOV_TOURNAMENT_REGISTRATIONS_ERROR", e);
      return res.status(500).json({ error: "Server error" });
    }
  }
);

// ==================== 4. Player Directory ====================
app.get(
  "/api/gov/players",
  requireAuth,
  requireGovOfficial,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const sportFilter = String(req.query.sport || "").trim();
      const searchQuery = String(req.query.search || "").trim();
      const page = parseInt(String(req.query.page || "1"));
      const limit = Math.min(50, parseInt(String(req.query.limit || "20")));

      const skip = (page - 1) * limit;

      // Build where clause
      const where: any = { role: "Player" };

      if (sportFilter) where.sport = sportFilter;

      if (searchQuery) {
        where.OR = [
          { name: { contains: searchQuery, mode: "insensitive" } },
          { username: { contains: searchQuery, mode: "insensitive" } },
          { email: { contains: searchQuery, mode: "insensitive" } },
        ];
      }

      // Execute queries in parallel
      const [items, total] = await Promise.all([
        prisma.user.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            name: true,
            username: true,
            email: true,
            mobile: true,
            sport: true,
            profilePic: true,
            createdAt: true,
            _count: {
              select: {
                achievements: true,
                registrations: true,
              },
            },
          },
        }),
        prisma.user.count({ where }),
      ]);

      // Get stats
      const totalPlayers = await prisma.user.count({
        where: { role: "Player" },
      });

      const playersBySport = await prisma.user.groupBy({
        by: ["sport"],
        where: { role: "Player" },
        _count: {
          sport: true,
        },
      });

      return res.json({
        success: true,
        data: {
          items,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
          stats: {
            totalPlayers,
            bySport: playersBySport.map((p) => ({
              sport: p.sport || "Unspecified",
              count: p._count.sport,
            })),
          },
        },
      });
    } catch (e) {
      console.error("GOV_PLAYERS_ERROR", e);
      return res.status(500).json({ error: "Server error" });
    }
  }
);

// ==================== 5. Coach Directory ====================
app.get(
  "/api/gov/coaches",
  requireAuth,
  requireGovOfficial,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const sportFilter = String(req.query.sport || "").trim();
      const searchQuery = String(req.query.search || "").trim();
      const page = parseInt(String(req.query.page || "1"));
      const limit = Math.min(50, parseInt(String(req.query.limit || "20")));

      const skip = (page - 1) * limit;

      // Build where clause
      const where: any = { role: "Coach" };

      if (sportFilter) where.sport = sportFilter;

      if (searchQuery) {
        where.OR = [
          { name: { contains: searchQuery, mode: "insensitive" } },
          { username: { contains: searchQuery, mode: "insensitive" } },
          { email: { contains: searchQuery, mode: "insensitive" } },
        ];
      }

      // Execute queries in parallel
      const [items, total] = await Promise.all([
        prisma.user.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            name: true,
            username: true,
            email: true,
            mobile: true,
            sport: true,
            profilePic: true,
            createdAt: true,
            _count: {
              select: {
                schedules: true,
              },
            },
          },
        }),
        prisma.user.count({ where }),
      ]);

      // Get stats
      const totalCoaches = await prisma.user.count({
        where: { role: "Coach" },
      });

      const coachesBySport = await prisma.user.groupBy({
        by: ["sport"],
        where: { role: "Coach" },
        _count: {
          sport: true,
        },
      });

      return res.json({
        success: true,
        data: {
          items,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
          stats: {
            totalCoaches,
            bySport: coachesBySport.map((c) => ({
              sport: c.sport || "Unspecified",
              count: c._count.sport,
            })),
          },
        },
      });
    } catch (e) {
      console.error("GOV_COACHES_ERROR", e);
      return res.status(500).json({ error: "Server error" });
    }
  }
);

// ==================== 6. Achievement Analytics ====================
app.get(
  "/api/gov/achievements/stats",
  requireAuth,
  requireGovOfficial,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const sportFilter = String(req.query.sport || "").trim();

      // Build where clause
      const where: any = {};
      if (sportFilter) where.sport = sportFilter;

      // Get achievement counts by status
      const [total, pending, approved, rejected] = await Promise.all([
        prisma.achievement.count({ where }),
        prisma.achievement.count({ where: { ...where, status: "PENDING" } }),
        prisma.achievement.count({ where: { ...where, status: "APPROVED" } }),
        prisma.achievement.count({ where: { ...where, status: "REJECTED" } }),
      ]);

      // Achievements by sport
      const bySport = await prisma.achievement.groupBy({
        by: ["sport"],
        where,
        _count: {
          sport: true,
        },
      });

      // Calculate approval rate
      const totalReviewed = approved + rejected;
      const approvalRate =
        totalReviewed > 0 ? (approved / totalReviewed) * 100 : 0;

      // Trends by month (last 6 months)
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const trendsByMonth = await prisma.achievement.groupBy({
        by: ["createdAt"],
        where: {
          ...where,
          createdAt: { gte: sixMonthsAgo },
        },
        _count: true,
      });

      return res.json({
        success: true,
        data: {
          total,
          pending,
          approved,
          rejected,
          approvalRate: Math.round(approvalRate * 10) / 10, // 1 decimal place
          bySport: bySport.map((a) => ({
            sport: a.sport,
            count: a._count.sport,
          })),
          trendsByMonth: trendsByMonth.length,
        },
      });
    } catch (e) {
      console.error("GOV_ACHIEVEMENTS_STATS_ERROR", e);
      return res.status(500).json({ error: "Server error" });
    }
  }
);

// ==================== 7. Data Export (CSV) ====================
app.get(
  "/api/gov/export/:type",
  requireAuth,
  requireGovOfficial,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const exportType = String(req.params.type || "").toLowerCase();
      const stateFilter = String(req.query.state || "").trim();
      const districtFilter = String(req.query.district || "").trim();

      let csvData = "";
      let filename = "export.csv";

      switch (exportType) {
        case "tournaments": {
          const where: any = {};
          if (stateFilter) where.state = stateFilter;
          if (districtFilter) where.district = districtFilter;

          const tournaments = await prisma.tournament.findMany({
            where,
            orderBy: { startDateTime: "desc" },
            include: {
              _count: { select: { registrations: true } },
              creator: { select: { name: true, email: true } },
            },
          });

          csvData =
            "ID,Name,Sport,State,District,Venue,Start Date,End Date,Status,Registrations,Created By,Creator Email\n";
          tournaments.forEach((t) => {
            csvData += [
              t.id,
              `"${t.name}"`,
              t.sport,
              t.state,
              t.district,
              `"${t.venue}"`,
              new Date(t.startDateTime).toISOString(),
              new Date(t.endDateTime).toISOString(),
              t.status,
              t._count.registrations,
              t.creator.name || "N/A",
              t.creator.email,
            ].join(",");
            csvData += "\n";
          });

          filename = `tournaments_${stateFilter || "all"}_${
            new Date().toISOString().split("T")[0]
          }.csv`;
          break;
        }

        case "players": {
          const players = await prisma.user.findMany({
            where: { role: "Player" },
            orderBy: { createdAt: "desc" },
            include: {
              _count: {
                select: { achievements: true, registrations: true },
              },
            },
          });

          csvData =
            "ID,Name,Username,Email,Mobile,Sport,Achievements,Registrations,Joined Date\n";
          players.forEach((p) => {
            csvData += [
              p.id,
              `"${p.name || "N/A"}"`,
              p.username,
              p.email,
              p.mobile || "N/A",
              p.sport || "N/A",
              p._count.achievements,
              p._count.registrations,
              new Date(p.createdAt).toISOString(),
            ].join(",");
            csvData += "\n";
          });

          filename = `players_${new Date().toISOString().split("T")[0]}.csv`;
          break;
        }

        case "coaches": {
          const coaches = await prisma.user.findMany({
            where: { role: "Coach" },
            orderBy: { createdAt: "desc" },
            include: {
              _count: { select: { schedules: true } },
            },
          });

          csvData =
            "ID,Name,Username,Email,Mobile,Sport,Schedules,Joined Date\n";
          coaches.forEach((c) => {
            csvData += [
              c.id,
              `"${c.name || "N/A"}"`,
              c.username,
              c.email,
              c.mobile || "N/A",
              c.sport || "N/A",
              c._count.schedules,
              new Date(c.createdAt).toISOString(),
            ].join(",");
            csvData += "\n";
          });

          filename = `coaches_${new Date().toISOString().split("T")[0]}.csv`;
          break;
        }

        case "achievements": {
          const achievements = await prisma.achievement.findMany({
            orderBy: { createdAt: "desc" },
            include: {
              owner: {
                select: { name: true, username: true, email: true },
              },
            },
          });

          csvData =
            "ID,Title,Sport,Venue,Date,Status,Player Name,Player Email,Created Date\n";
          achievements.forEach((a) => {
            csvData += [
              a.id,
              `"${a.title}"`,
              a.sport,
              `"${a.venue}"`,
              new Date(a.date).toISOString(),
              a.status,
              a.owner.name || a.owner.username,
              a.owner.email,
              new Date(a.createdAt).toISOString(),
            ].join(",");
            csvData += "\n";
          });

          filename = `achievements_${
            new Date().toISOString().split("T")[0]
          }.csv`;
          break;
        }

        case "registrations": {
          const where: any = {};
          if (stateFilter || districtFilter) {
            where.tournament = {};
            if (stateFilter) where.tournament.state = stateFilter;
            if (districtFilter) where.tournament.district = districtFilter;
          }

          const registrations = await prisma.tournamentRegistration.findMany({
            where,
            orderBy: { registeredAt: "desc" },
            include: {
              player: {
                select: {
                  name: true,
                  username: true,
                  email: true,
                  mobile: true,
                },
              },
              tournament: {
                select: {
                  name: true,
                  sport: true,
                  state: true,
                  district: true,
                },
              },
            },
          });

          csvData =
            "ID,Tournament,Sport,State,District,Player Name,Player Email,Player Mobile,Status,Registered Date\n";
          registrations.forEach((r) => {
            csvData += [
              r.id,
              `"${r.tournament.name}"`,
              r.tournament.sport,
              r.tournament.state,
              r.tournament.district,
              r.player.name || r.player.username,
              r.player.email,
              r.player.mobile || "N/A",
              r.regStatus,
              new Date(r.registeredAt).toISOString(),
            ].join(",");
            csvData += "\n";
          });

          filename = `registrations_${stateFilter || "all"}_${
            new Date().toISOString().split("T")[0]
          }.csv`;
          break;
        }

        default:
          return res.status(400).json({
            error:
              "Invalid export type. Must be: tournaments, players, coaches, achievements, or registrations",
          });
      }

      // Set headers for CSV download
      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`
      );
      return res.send(csvData);
    } catch (e) {
      console.error("GOV_EXPORT_ERROR", e);
      return res.status(500).json({ error: "Server error" });
    }
  }
);

// ==================== 8. Audit Logs (Gov Only) ====================
app.get(
  "/api/gov/audit-logs",
  requireAuth,
  requireGovOfficial,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        entityType,
        entityId,
        userId: filterUserId,
        action,
        limit = "100",
        offset = "0",
      } = req.query;

      // Build where clause
      const where: Prisma.AuditLogWhereInput = {};

      if (entityType) {
        where.entityType = String(entityType);
      }
      if (entityId) {
        where.entityId = String(entityId);
      }
      if (filterUserId) {
        where.userId = String(filterUserId);
      }
      if (action) {
        where.action = { contains: String(action) };
      }

      // Cap limit at 500
      const take = Math.min(500, Math.max(1, Number(limit) || 100));
      const skip = Math.max(0, Number(offset) || 0);

      // Get total count for pagination
      const total = await prisma.auditLog.count({ where });

      // Fetch logs
      const logs = await prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take,
        skip,
        include: {
          user: {
            select: {
              username: true,
              role: true,
            },
          },
        },
      });

      return res.json({
        items: logs,
        pagination: {
          total,
          limit: take,
          offset: skip,
          hasMore: skip + logs.length < total,
        },
      });
    } catch (error) {
      console.error("AUDIT_LOG_QUERY_ERROR:", error);
      return res.status(500).json({ error: "Failed to fetch audit logs" });
    }
  }
);

// ==================== ✨ END GOVERNMENT OFFICIALS API ✨ ====================

// ==================== SPORTIQ IMPACT SCORE API ====================

// Calculate Impact Score
app.post(
  "/api/player/:id/impact-score",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const targetPlayerId = req.params.id;
      const requestorId = req.userId!;

      // Authorization Check
      const requestor = await prisma.user.findUnique({
        where: { id: requestorId },
      });

      if (
        requestorId !== targetPlayerId &&
        requestor?.role !== "Admin" &&
        requestor?.role !== "Coach"
      ) {
        return res
          .status(403)
          .json({ error: "Not authorized to calculate this player's score" });
      }

      // Verify target player exists
      const player = await prisma.user.findUnique({
        where: { id: targetPlayerId },
      });

      if (!player || player.role !== "Player") {
        return res.status(404).json({ error: "Player not found" });
      }

      // Fetch Assessments
      const assessments = await prisma.assessment.findMany({
        where: { userId: targetPlayerId, status: "APPROVED" },
        orderBy: { createdAt: "desc" },
      });

      // Fetch Match Stats
      const matchStats = await prisma.playerMatchStats.findMany({
        where: { playerId: targetPlayerId },
        include: {
          match: {
            include: {
              tournament: true,
            },
          },
        },
      });

      // Calculate Score
      const result = calculateImpactScore(
        assessments as ScoreAssessment[],
        matchStats as unknown as ScoreMatchStat[],
        targetPlayerId
      );

      // Update User
      await prisma.user.update({
        where: { id: targetPlayerId },
        data: {
          impactScore: result.impactScore,
          consistencyIndex: result.consistencyIndex,
        },
      });

      return res.json(result);
    } catch (e) {
      console.error("IMPACT_SCORE_ERROR", e);
      return res.status(500).json({ error: "Failed to calculate impact score" });
    }
  }
);

// Leaderboard
app.get(
  "/api/leaderboard",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { sport, limit = "50" } = req.query;
      const take = Math.min(100, Math.max(1, Number(limit)));

      const where: Prisma.UserWhereInput = { role: "Player" };
      if (sport) where.sport = { contains: String(sport) };
      if (req.query.district) where.district = { contains: String(req.query.district) };
      if (req.query.state) where.state = { contains: String(req.query.state) };

      const players = await prisma.user.findMany({
        where,
        orderBy: { impactScore: "desc" },
        take,
        select: {
          id: true,
          username: true,
          name: true,
          sport: true,
          district: true,
          state: true,
          impactScore: true,
          consistencyIndex: true,
          profilePic: true,
        },
      });

      const ranked = players.map((p, index) => ({
        ...p,
        rank: index + 1,
      }));

      return res.json(ranked);
    } catch (e) {
      console.error("LEADERBOARD_ERROR", e);
      return res.status(500).json({ error: "Failed to fetch leaderboard" });
    }
  }
);

// ==================== TOURNAMENT FIXTURES & SCORING API ====================

// Helper: Fisher-Yates Shuffle
function fisherYatesShuffle<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// TASK 1: Generate Fixtures (Round 1)
app.post(
  "/api/admin/tournaments/:id/generate-fixtures",
  requireAuth,
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const tournamentId = req.params.id;
      const adminId = req.userId!;

      // 1. Validation
      const tournament = await prisma.tournament.findUnique({
        where: { id: tournamentId },
        include: { _count: { select: { matches: true } } },
      });

      if (!tournament) {
        return res.status(404).json({ error: "Tournament not found" });
      }

      if (tournament.createdBy !== adminId) {
        return res
          .status(403)
          .json({ error: "Not authorized to manage this tournament" });
      }

      if (tournament.status !== "PUBLISHED") {
        return res.status(400).json({
          error: "Can only generate fixtures for published tournaments",
        });
      }

      if (tournament.format && tournament.format !== "KNOCKOUT") {
        return res
          .status(400)
          .json({ error: "League and points formats not yet supported" });
      }

      if (tournament._count.matches > 0) {
        return res
          .status(409)
          .json({ error: "Fixtures already generated for this tournament" });
      }

      // 2. Fetch confirmed registrations
      const registrations = await prisma.tournamentRegistration.findMany({
        where: {
          tournamentId,
          regStatus: "CONFIRMED",
        },
        include: { player: true },
      });

      if (registrations.length < 2) {
        return res.status(400).json({
          error: "Need at least 2 confirmed players to generate fixtures",
        });
      }

      // 3. Build and shuffle players
      const players = registrations.map((r) => ({
        id: r.playerId,
        username: r.player.username,
      }));

      const shuffled = fisherYatesShuffle(players);

      // 4. Generate Round 1 matches
      const fixtures = [];

      for (let i = 0; i < shuffled.length; i += 2) {
        const playerA = shuffled[i];
        const playerB = shuffled[i + 1];

        if (playerB) {
          // Normal match
          fixtures.push({
            tournamentId,
            round: 1,
            matchNumber: Math.floor(i / 2) + 1,
            teamA: playerA.username,
            teamAId: playerA.id,
            teamB: playerB.username,
            teamBId: playerB.id,
            status: "SCHEDULED",
          });
        } else {
          // BYE — odd number of players
          fixtures.push({
            tournamentId,
            round: 1,
            matchNumber: Math.floor(i / 2) + 1,
            teamA: playerA.username,
            teamAId: playerA.id,
            teamB: "BYE",
            teamBId: null,
            winner: "A",
            scoreA: 0,
            scoreB: 0,
            status: "COMPLETED", // Auto-completed
          });
        }
      }

      // 5. Insert matches
      await prisma.match.createMany({ data: fixtures });

      await logAudit(
        "FIXTURES_GENERATED",
        "Tournament",
        req.params.id,
        req.userId!,
        { matchCount: fixtures.length }
      );

      return res.status(201).json({
        message: "Fixtures generated successfully",
        count: fixtures.length,
        round: 1,
      });
    } catch (e) {
      console.error("GENERATE_FIXTURES_ERROR", e);
      return res.status(500).json({ error: "Failed to generate fixtures" });
    }
  }
);

// TASK 2: Get Fixtures
app.get(
  "/api/admin/tournaments/:id/fixtures",
  requireAuth,
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const matches = await prisma.match.findMany({
        where: { tournamentId: req.params.id },
        orderBy: [{ round: "asc" }, { matchNumber: "asc" }],
        include: {
          teamAPlayer: {
            select: { username: true, profilePic: true },
          },
          teamBPlayer: {
            select: { username: true, profilePic: true },
          },
        },
      });

      return res.json(matches);
    } catch (e) {
      console.error("GET_FIXTURES_ERROR", e);
      return res.status(500).json({ error: "Failed to fetch fixtures" });
    }
  }
);

// TASK 3: Enter Match Score
app.patch(
  "/api/admin/matches/:id/score",
  requireAuth,
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const matchId = req.params.id;
      const adminId = req.userId!;
      const { scoreA, scoreB, winner } = req.body;

      // 1. Validation
      const match = await prisma.match.findUnique({
        where: { id: matchId },
        include: { tournament: true },
      });

      if (!match) {
        return res.status(404).json({ error: "Match not found" });
      }

      if (match.tournament.createdBy !== adminId) {
        return res
          .status(403)
          .json({ error: "Not authorized to manage this tournament" });
      }

      if (match.status === "COMPLETED") {
        return res.status(400).json({ error: "Match already completed" });
      }

      if (
        typeof scoreA !== "number" ||
        typeof scoreB !== "number" ||
        scoreA < 0 ||
        scoreB < 0
      ) {
        return res.status(400).json({ error: "Invalid scores" });
      }

      if (!["A", "B", "DRAW"].includes(winner)) {
        return res.status(400).json({ error: "Invalid winner" });
      }

      // Consistency checks
      if (winner === "A" && scoreA <= scoreB) {
        return res
          .status(400)
          .json({ error: "Team A cannot win with lower or equal score" });
      }
      if (winner === "B" && scoreB <= scoreA) {
        return res
          .status(400)
          .json({ error: "Team B cannot win with lower or equal score" });
      }
      if (winner === "DRAW" && scoreA !== scoreB) {
        return res.status(400).json({ error: "Draw requires equal scores" });
      }

      // 2. Update match
      const updated = await prisma.match.update({
        where: { id: matchId },
        data: {
          scoreA,
          scoreB,
          winner,
          status: "COMPLETED",
        },
      });

      await logAudit(
        "MATCH_SCORE_ENTERED",
        "Match",
        req.params.id,
        req.userId!,
        {
          scoreA: updated.scoreA,
          scoreB: updated.scoreB,
          winner: updated.winner,
        }
      );

      // 3. Recalculate Impact Scores
      const playersToRecalculate = [updated.teamAId, updated.teamBId].filter(
        (id): id is string => !!id
      );

      for (const playerId of playersToRecalculate) {
        try {
          const assessments = await prisma.assessment.findMany({
            where: { userId: playerId, status: "APPROVED" },
            orderBy: { createdAt: "desc" },
            select: { drill: true, score: true, createdAt: true, status: true },
          });

          const matchStats = await prisma.playerMatchStats.findMany({
            where: { playerId },
            include: {
              match: {
                include: {
                  tournament: {
                    select: { name: true },
                  },
                },
              },
            },
          });

          const result = calculateImpactScore(
            assessments as ScoreAssessment[],
            matchStats as unknown as ScoreMatchStat[],
            playerId
          );

          await prisma.user.update({
            where: { id: playerId },
            data: {
              impactScore: result.impactScore,
              consistencyIndex: result.consistencyIndex,
            },
          });
        } catch (e) {
          console.error(
            `Failed to recalculate score for player ${playerId}:`,
            e
          );
        }
      }

      return res.json(updated);
    } catch (e) {
      console.error("UPDATE_MATCH_SCORE_ERROR", e);
      return res.status(500).json({ error: "Failed to update match score" });
    }
  }
);

// TASK 4: Record Player Stats
app.post(
  "/api/admin/matches/:id/player-stats",
  requireAuth,
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const matchId = req.params.id;
      const adminId = req.userId!;
      const {
        playerId,
        battingRuns,
        bowlingWickets,
        catches,
        runOuts,
        economyRate,
        strikeRate,
      } = req.body;

      // 1. Validation
      const match = await prisma.match.findUnique({
        where: { id: matchId },
        include: { tournament: true },
      });

      if (!match) {
        return res.status(404).json({ error: "Match not found" });
      }

      if (match.tournament.createdBy !== adminId) {
        return res
          .status(403)
          .json({ error: "Not authorized to manage this tournament" });
      }

      if (match.teamAId !== playerId && match.teamBId !== playerId) {
        return res
          .status(400)
          .json({ error: "Player is not a participant in this match" });
      }

      const existing = await prisma.playerMatchStats.findFirst({
        where: { matchId, playerId },
      });

      if (existing) {
        return res.status(409).json({
          error:
            "Stats already recorded for this player in this match. Use update endpoint instead.",
        });
      }

      // 2. Create stats
      const stats = await prisma.playerMatchStats.create({
        data: {
          matchId,
          playerId,
          battingRuns: battingRuns ?? null,
          bowlingWickets: bowlingWickets ?? null,
          catches: catches ?? null,
          runOuts: runOuts ?? null,
          economyRate: economyRate ?? null,
          strikeRate: strikeRate ?? null,
        },
      });

      // 3. Recalculate Impact Score
      try {
        const assessments = await prisma.assessment.findMany({
          where: { userId: playerId, status: "APPROVED" },
          orderBy: { createdAt: "desc" },
          select: { drill: true, score: true, createdAt: true, status: true },
        });

        const matchStats = await prisma.playerMatchStats.findMany({
          where: { playerId },
          include: {
            match: {
              include: {
                tournament: {
                  select: { name: true },
                },
              },
            },
          },
        });

        const result = calculateImpactScore(
          assessments as ScoreAssessment[],
          matchStats as unknown as ScoreMatchStat[],
          playerId
        );

        await prisma.user.update({
          where: { id: playerId },
          data: {
            impactScore: result.impactScore,
            consistencyIndex: result.consistencyIndex,
          },
        });
      } catch (e) {
        console.error(`Failed to recalculate score for player ${playerId}:`, e);
      }

      return res.status(201).json(stats);
    } catch (e) {
      console.error("RECORD_PLAYER_STATS_ERROR", e);
      return res.status(500).json({ error: "Failed to record player stats" });
    }
  }
);

// TASK 5: Tournament Leaderboard
app.get(
  "/api/tournaments/:id/leaderboard",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const tournamentId = req.params.id;

      // 1. Fetch all matches in tournament
      const tournamentMatches = await prisma.match.findMany({
        where: { tournamentId },
        select: { id: true },
      });

      const matchIds = tournamentMatches.map((m) => m.id);

      // 2. Fetch all stats for these matches
      const allStats = await prisma.playerMatchStats.findMany({
        where: { matchId: { in: matchIds } },
        include: {
          player: {
            select: { id: true, username: true, profilePic: true },
          },
          match: {
            select: { winner: true, teamAId: true, teamBId: true },
          },
        },
      });

      // 3. Aggregate stats
      const playerMap = new Map<
        string,
        {
          playerId: string;
          username: string;
          profilePic: string | null;
          totalRuns: number;
          totalWickets: number;
          totalCatches: number;
          totalRunOuts: number;
          matchesPlayed: number;
          matchesWon: number;
        }
      >();

      allStats.forEach((stat) => {
        const pid = stat.playerId;

        if (!playerMap.has(pid)) {
          playerMap.set(pid, {
            playerId: pid,
            username: stat.player.username,
            profilePic: stat.player.profilePic,
            totalRuns: 0,
            totalWickets: 0,
            totalCatches: 0,
            totalRunOuts: 0,
            matchesPlayed: 0,
            matchesWon: 0,
          });
        }

        const data = playerMap.get(pid)!;

        data.totalRuns += stat.battingRuns || 0;
        data.totalWickets += stat.bowlingWickets || 0;
        data.totalCatches += stat.catches || 0;
        data.totalRunOuts += stat.runOuts || 0;
        data.matchesPlayed += 1;

        // Determine if won
        const match = stat.match;
        const isWon =
          (match.winner === "A" && match.teamAId === pid) ||
          (match.winner === "B" && match.teamBId === pid);

        if (isWon) {
          data.matchesWon += 1;
        }
      });

      // 4. Sort and Rank
      const ranked = Array.from(playerMap.values())
        .sort((a, b) => {
          if (b.totalRuns !== a.totalRuns) return b.totalRuns - a.totalRuns;
          return b.totalWickets - a.totalWickets;
        })
        .map((p, index) => ({
          ...p,
          rank: index + 1,
        }));

      return res.json(ranked);
    } catch (e) {
      console.error("TOURNAMENT_LEADERBOARD_ERROR", e);
      return res
        .status(500)
        .json({ error: "Failed to fetch tournament leaderboard" });
    }
  }
);

// ----------------------
// Serve frontend + Start
// ----------------------
app.use(express.static(staticRoot));
const START_PORT = Number(process.env.PORT) || 3001;

function startServer(port: number) {
  const server = app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      const nextPort = port + 1;
      console.warn(`Port ${port} in use, trying ${nextPort}...`);
      startServer(nextPort);
    } else {
      console.error("Server error:", err);
      process.exit(1);
    }
  });
}

startServer(START_PORT);

// NEW ENDPOINT for backend analysis
app.post(
  "/api/assessments/analyze-backend",
  requireAuth,
  videoUpload.single("file"), // Use your existing multer for video
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.file) {
      return res.status(400).json({ error: "No video file uploaded." });
    }

    try {
      // Create a new form to forward the file to the Python worker
      const form = new FormData();
      const videoBuffer = fs.readFileSync(req.file.path);
      form.append("file", videoBuffer, {
        filename: req.file.originalname,
        contentType: req.file.mimetype,
      });

      // Call the Python AI worker
      // Assumes the Python worker is running on localhost:8000
      const aiResponse = await axios.post(
        "http://localhost:8000/analyze/situp",
        form,
        {
          headers: form.getHeaders(),
        }
      );

      // Clean up the temporarily stored file
      fs.unlinkSync(req.file.path);

      // TODO: Save aiResponse.data (e.g., { reps: 15 }) to your Prisma database
      // For now, just return it to the user
      return res.json(aiResponse.data);
    } catch (error: any) {
      console.error("Error calling AI worker:", error.message);
      // Clean up file on error as well
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(500).json({ error: "Failed to analyze video." });
    }
  }
);
