import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
const __rootdir = path.dirname(fileURLToPath(import.meta.url));
// Load .env.local first (Vite convention), then .env as fallback
dotenv.config({ path: path.resolve(__rootdir, ".env.local") });
dotenv.config({ path: path.resolve(__rootdir, ".env") });

import http from "http";
import express from "express";
import { createServer as createViteServer } from "vite";
import helmet from "helmet";
import cors from "cors";
import { initWarRoomWS } from "./server/websocket/warroom.js";


// ─── DB Init & Seed ───────────────────────────────────────────────────────────
import { db } from "./server/db/index.js";
import { seedDatabase } from "./server/db/seed.js";
seedDatabase();

// ─── Middleware ───────────────────────────────────────────────────────────────
import { requireAuth } from "./server/middleware/auth.js";
import { apiLimiter } from "./server/middleware/rateLimiter.js";
import { auditLogger } from "./server/middleware/auditLogger.js";
import { requestLogger } from "./server/middleware/logger.js";

// ─── Route Modules ────────────────────────────────────────────────────────────
import authRoutes       from "./server/routes/auth.js";
import incidentRoutes   from "./server/routes/incidents.js";
import cameraRoutes     from "./server/routes/cameras.js";
import siteRoutes       from "./server/routes/sites.js";
import eventRoutes      from "./server/routes/events.js";
import logRoutes        from "./server/routes/logs.js";
import threatIntelRoutes from "./server/routes/threatIntel.js";
import auditRoutes      from "./server/routes/audit.js";
import billingRoutes    from "./server/routes/billing.js";
import healthRoutes     from "./server/routes/health.js";
import aiRoutes         from "./server/routes/ai.js";
import edrRoutes        from "./server/routes/edr.js";
import rulesRoutes      from "./server/routes/rules.js";
import gsmRoutes        from "./server/routes/gsm.js";
import recoveryRoutes   from "./server/routes/recovery.js";
import campaignRoutes   from "./server/routes/campaigns.js";
import riskRoutes       from "./server/routes/riskscores.js";
import notificationRoutes from "./server/routes/notifications.js";
import evidenceRoutes   from "./server/routes/evidence.js";
import atRoutes         from "./server/routes/africasTalking.js";
import terminalRoutes   from "./server/routes/terminal.js";
import userRoutes        from "./server/routes/users.js";
import socialRoutes      from "./server/routes/socialMedia.js";
import cyberRoutes       from "./server/routes/cyber.js";
import netIntelRoutes    from "./server/routes/netintel.js";
import agentRoutes       from "./server/routes/agent.js";
import threatFeedsRoutes from "./server/routes/threatfeeds.js";
import globalRoutes      from "./server/routes/global.js";
import reputationRoutes  from "./server/routes/reputation.js";
import policyRoutes      from "./server/routes/policies.js";
import stixRoutes        from "./server/routes/stix.js";
import publicReportRoutes from "./server/routes/publicReport.js";
import aiLearningRoutes  from "./server/routes/aiLearning.js";
import mfaRoutes         from "./server/routes/mfa.js";
import vulnerabilityRoutes from "./server/routes/vulnerabilities.js";
import metricsRoutes from "./server/routes/metrics.js";
import redteamRoutes     from "./server/routes/redteam.js";
import breakGlassRoutes, { killSwitchMiddleware } from "./server/routes/breakGlass.js";
import { isSupabaseEnabled, backfillToSupabase } from "./server/db/supabase-client.js";
import { startThreatFeedScheduler } from "./server/services/threatFeeds.js";
import { startRedTeamScheduler }    from "./server/services/redTeamEngine.js";
import { startAdversarialAIScheduler } from "./server/services/adversarialAITesting.js";
import { recordRequest } from "./server/services/behaviorAnomalyDetection.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || "3000", 10);
const isProd = process.env.NODE_ENV === "production";

const app = express();

// ─── Security Headers ─────────────────────────────────────────────────────────
const CSP_DIRECTIVES = {
  defaultSrc: ["'self'"],
  scriptSrc:  ["'self'", "'unsafe-inline'", "'unsafe-eval'"],  // Vite needs unsafe-eval in dev
  styleSrc:   ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
  fontSrc:    ["'self'", "https://fonts.gstatic.com"],
  imgSrc:     ["'self'", "data:", "blob:"],
  connectSrc: ["'self'", "wss:", "ws:", "https://zzwknylbnfhpcgldravf.supabase.co"],
  frameSrc:   ["'none'"],
  objectSrc:  ["'none'"],
  upgradeInsecureRequests: isProd ? [] : null,
};

app.use(
  helmet({
    contentSecurityPolicy: isProd
      ? { directives: CSP_DIRECTIVES }
      : false,                          // Disabled in dev for Vite HMR compat
    crossOriginEmbedderPolicy: false,
    hsts: isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  })
);

// ─── CORS ─────────────────────────────────────────────────────────────────────
// In production, set ALLOWED_ORIGINS="https://sentinel.litsecure.mw,https://admin.litsecure.mw"
const rawOrigins = process.env.ALLOWED_ORIGINS || "";
const originAllowlist = rawOrigins
  ? rawOrigins.split(",").map(o => o.trim()).filter(Boolean)
  : [];

app.use(cors({
  origin: (origin, cb) => {
    // Development allows all origins
    if (!isProd) {
      cb(null, true);
      return;
    }
    // Production strict whitelisting
    const appUrl = process.env.APP_URL;
    if (originAllowlist.length > 0) {
      if (!origin || originAllowlist.includes(origin) || origin === appUrl) {
        cb(null, true);
      } else {
        cb(new Error(`CORS: origin '${origin}' not allowed in production`));
      }
    } else if (appUrl) {
      if (!origin || origin === appUrl) {
        cb(null, true);
      } else {
        cb(new Error(`CORS: origin '${origin}' does not match APP_URL`));
      }
    } else {
      // production with no CORS config -> restrict to same-origin only
      if (!origin) {
        cb(null, true);
      } else {
        cb(new Error("CORS: Blocked in production (no origin whitelist configured)"));
      }
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
}));

// ─── Body Parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true }));

// ─── HTTP Request Logger ──────────────────────────────────────────────────────
app.use(requestLogger);

// ─── Break Glass Kill Switch (must be before all routes) ─────────────────────
app.use(killSwitchMiddleware);

// ─── Behavioral Anomaly Detection (passive observer on every API request) ─────
app.use("/api", (req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    recordRequest({
      ip:            req.ip || req.socket.remoteAddress || "unknown",
      userId:        (req as any).user?.id ?? null,
      endpoint:      req.path,
      method:        req.method,
      statusCode:    res.statusCode,
      responseBytes: parseInt(res.getHeader("content-length") as string || "0") || 0,
      requestBytes:  parseInt(req.headers["content-length"] || "0") || 0,
    });
  });
  next();
});

// ─── Global API Rate Limiter ──────────────────────────────────────────────────
app.use("/api", apiLimiter);

// ─── Audit Logger (all authenticated mutations) ───────────────────────────────
app.use("/api", auditLogger);

// ─── Public Routes (no auth) ──────────────────────────────────────────────────
app.use("/api/auth",   authRoutes);
app.use("/api/health", healthRoutes); // includes /live and /ready probes
app.use("/metrics",    metricsRoutes); // Prometheus metrics scraper
app.use("/api/public", publicReportRoutes); // Citizen reporting — rate-limited

// ─── Protected Routes (JWT required) ─────────────────────────────────────────
app.use("/api/incidents",    requireAuth, incidentRoutes);
app.use("/api/cameras",      requireAuth, cameraRoutes);
app.use("/api/sites",        requireAuth, siteRoutes);
app.use("/api/events",       requireAuth, eventRoutes);
app.use("/api/access",       requireAuth, eventRoutes);     // /api/access/logs handled inside eventRoutes
app.use("/api/logs",         requireAuth, logRoutes);
app.use("/api/threat-intel", requireAuth, threatIntelRoutes);
app.use("/api/audit-logs",   requireAuth, auditRoutes);
app.use("/api/billing",      requireAuth, billingRoutes);
app.use("/api/ai",           requireAuth, aiRoutes);
app.use("/api/edr",          requireAuth, edrRoutes);
app.use("/api/rules",         requireAuth, rulesRoutes);
app.use("/api/gsm",          requireAuth, gsmRoutes);
app.use("/api/recovery",     requireAuth, recoveryRoutes);
app.use("/api/campaigns",      requireAuth, campaignRoutes);
app.use("/api/risk",           requireAuth, riskRoutes);
app.use("/api/notifications",  requireAuth, notificationRoutes);
app.use("/api/evidence",       requireAuth, evidenceRoutes);
// Africa's Talking: USSD + incoming SMS are public webhooks (AT calls them);
// auth is enforced per-route inside the handler
app.use("/api/at",             atRoutes);
app.use("/api/terminal",       requireAuth, terminalRoutes);
app.use("/api/users",          requireAuth, userRoutes);
app.use("/api/social",         requireAuth, socialRoutes);
app.use("/api/cyber/vulnerabilities", requireAuth, vulnerabilityRoutes);
app.use("/api/cyber",          requireAuth, cyberRoutes);
app.use("/api/netintel",       requireAuth, netIntelRoutes);

// ─── Phase 1: Kaspersky-inspired active protection ───────────────────────────
// Agent registration/heartbeat is public (org API key auth inside handler)
// Management routes inside are protected via requireAuth
app.use("/api/agent",          agentRoutes);
app.use("/api/threatfeeds",    requireAuth, threatFeedsRoutes);
app.use("/api/global",         requireAuth, globalRoutes);

// ─── Phase 2: Reputation Database & Policy Management ─────────────────
// Reputation lookup is read-only (analyst safe)
// Policy management requires auth (admin/soc_manager enforced inside)
app.use("/api/reputation",     requireAuth, reputationRoutes);
app.use("/api/policies",       requireAuth, policyRoutes);

// ─── Phase 3: STIX/TAXII Intelligence Sharing ─────────────────────────────────────────────
app.use("/api/stix",           requireAuth, stixRoutes);

// ─── Phase 4: AI Continuous Learning ─────────────────────────────────────────────────
app.use("/api/ai-learning",    requireAuth, aiLearningRoutes);

// ─── Phase 5: MFA endpoints (under /api/auth/mfa/*) ─────────────────────────
app.use("/api/auth/mfa",       mfaRoutes);

// ─── Phase 5: Vulnerability Management endpoints ────────────────────────────
app.use("/api/vulnerabilities", requireAuth, vulnerabilityRoutes);

// ─── Phase 6: Continuous Adversarial Security Engine ─────────────────────────
// Red Team results, AI test loop, behavioral anomalies — all require auth
app.use("/api/redteam",        requireAuth, redteamRoutes);
// Break Glass: status read needs auth; mutating ops need soc_manager/admin (enforced inside)
app.use("/api/break-glass",    requireAuth, breakGlassRoutes);

// ─── Backward Compat: /api/stats → /api/incidents/meta/stats ─────────────────
// Inline handler avoids HTTP redirect that would drop the Authorization header
app.get("/api/stats", requireAuth, (req, res, next) => {
  req.url = "/meta/stats";
  (incidentRoutes as any).handle(req, res, next);
});

// ─── API Versioning: /api/v1/* mirrors /api/* ─────────────────────────────────
// External integrators (MACRA, partner agencies) should target /api/v1/*.
// The /api/* prefix remains active for backward compatibility.
// When breaking changes are needed, create /api/v2/* with new route modules.
app.use("/api/v1/auth",         authRoutes);
app.use("/api/v1/health",       healthRoutes);
app.use("/api/v1/incidents",    requireAuth, incidentRoutes);
app.use("/api/v1/threat-intel", requireAuth, threatIntelRoutes);
app.use("/api/v1/users",        requireAuth, userRoutes);
app.use("/api/v1/audit-logs",   requireAuth, auditRoutes);
app.use("/api/v1/policies",     requireAuth, policyRoutes);
app.use("/api/v1/stix",         requireAuth, stixRoutes);
app.use("/api/v1/reputation",   requireAuth, reputationRoutes);
app.use("/api/v1/edr",          requireAuth, edrRoutes);
app.use("/api/v1/netintel",     requireAuth, netIntelRoutes);
app.use("/api/v1/public",       publicReportRoutes);
app.use("/api/v1/vulnerabilities", requireAuth, vulnerabilityRoutes);

// ─── Vite Dev / Static Serving ────────────────────────────────────────────────
async function startServer() {
  if (isProd) {
    const distPath = path.resolve(__dirname, "dist", "client");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  // ─── Attach WebSocket server to the same HTTP port ─────────────────────────
  const httpServer = http.createServer(app);
  initWarRoomWS(httpServer);

  httpServer.listen(PORT, () => {
    console.log(`\n🛡️  LitSecure Sentinel API — PORT ${PORT}`);
    console.log(`   Health:      http://localhost:${PORT}/api/health`);
    console.log(`   Environment: ${isProd ? "production" : "development"}`);
    console.log(`   Auth:        JWT (${process.env.JWT_EXPIRY || "8h"} expiry) + Token Revocation`);
    console.log(`   Security:    Helmet + CORS + Rate Limiting + Brute-Force Protection`);
    console.log(`   MFA:         TOTP (otplib) — enable per-user via /api/auth/mfa/setup`);
    console.log(`   WebSocket:   ws://localhost:${PORT}/ws/warroom\n`);
    console.log(`   DB:          SQLite (primary) ${isSupabaseEnabled() ? "+ Supabase (dual-write ✓)" : "— Supabase offline"}`);
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "YOUR_GEMINI_API_KEY_HERE") {
      console.warn("   ⚠️  GEMINI_API_KEY not set — AI using rule-based fallback.");
    }
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.includes("CHANGE") || process.env.JWT_SECRET.includes("dev-secret")) {
      console.warn("   ⚠️  JWT_SECRET is using dev default — MUST be changed before production deployment!");
    }
    console.log("   ⚠️  First run? Copy .env.example → .env, set strong secrets, then seed via /api/health/seed\n");

    // ─── Start background services ───────────────────────────────────────────
    startThreatFeedScheduler();
    startRedTeamScheduler();
    startAdversarialAIScheduler();

    // ─── Hourly cleanup: purge expired revoked tokens ────────────────────────
    setInterval(() => {
      try {
        const deleted = db.prepare(
          "DELETE FROM revoked_tokens WHERE expires_at < ?"
        ).run(new Date().toISOString());
        if ((deleted.changes ?? 0) > 0) {
          console.log(`[Security] Purged ${deleted.changes} expired revoked tokens.`);
        }
      } catch {}
    }, 60 * 60_000); // every hour
  });
}

startServer().catch(err => {
  console.error("❌ Fatal server startup error:", err);
  process.exit(1);
});

// ─── Global Error Handler (must be last) ─────────────────────────────────────
// Never leaks stack traces to clients. Log correlation via X-Request-ID header.
import { Request, Response, NextFunction } from "express";
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  const requestId = req.headers["x-request-id"] || "unknown";
  const status = err.status || err.statusCode || 500;

  // Always log full error server-side
  console.error(`[ERROR] ${req.method} ${req.path} — ${status} — reqId:${requestId}`, err);

  // Never expose internals in production
  const message = isProd
    ? status < 500 ? err.message : "An internal server error occurred."
    : (err.message || "Internal Server Error");

  res.status(status).json({
    error:     err.code || "SERVER_ERROR",
    message,
    requestId,
    ...(isProd ? {} : { stack: err.stack }),
  });
});

