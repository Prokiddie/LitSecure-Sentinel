import { Router } from "express";
import { db, generateId, isPgReady } from "../db/index.js";
import { getAdminClient, isSupabaseEnabled } from "../db/supabase-client.js";
import os from "os";

const router  = Router();
const START   = Date.now();
const VERSION = process.env.npm_package_version || "1.4.0";

// ─── GET /api/health — Full status (Dockerfile HEALTHCHECK + dashboards) ──────
router.get("/", async (_req, res) => {
  const dbStart = Date.now();
  let dbStatus  = "connected";
  let dbLatency = -1;
  try {
    db.prepare("SELECT 1").get();
    dbLatency = Date.now() - dbStart;
  } catch { dbStatus = "error"; }

  let supabaseStatus: "connected" | "disabled" | "error" = "disabled";
  let supabaseLatency = -1;
  if (isSupabaseEnabled()) {
    try {
      const client = getAdminClient();
      const t0     = Date.now();
      const ctrl   = new AbortController();
      const tid    = setTimeout(() => ctrl.abort(), 3000);
      const { error } = await client!.from("seed_meta").select("key").limit(1).abortSignal(ctrl.signal);
      clearTimeout(tid);
      supabaseLatency = Date.now() - t0;
      supabaseStatus  = error ? "error" : "connected";
    } catch { supabaseStatus = "error"; }
  }

  const pgT0 = Date.now();
  const pgUp = await isPgReady();
  const pgLatency = pgUp ? Date.now() - pgT0 : -1;
  const pgStatus  = process.env.SUPABASE_DB_URL
    ? (pgUp ? "connected" : "error")
    : "disabled";

  const allHealthy = dbStatus === "connected";
  res.status(allHealthy ? 200 : 503).json({
    status:         allHealthy ? "ok" : "degraded",
    service:        "LitSecure Sentinel API",
    version:        VERSION,
    uptime:         Math.floor((Date.now() - START) / 1000),
    timestamp:      new Date().toISOString(),
    environment:    process.env.NODE_ENV || "development",
    sqlite:         { status: dbStatus,       latencyMs: dbLatency },
    postgresql:     { status: pgStatus,       latencyMs: pgLatency },
    supabase:       { status: supabaseStatus, latencyMs: supabaseLatency },
    lockdownActive: (global as any).lockdownEnabled || false,
    memory: {
      usedMb:  Math.round(process.memoryUsage().heapUsed  / 1024 / 1024),
      totalMb: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
    },
    system: {
      platform:    process.platform,
      nodeVersion: process.version,
      cpus:        os.cpus().length,
    },
  });
});

// ─── GET /api/health/live — Kubernetes liveness probe ────────────────────────
// "Is the process alive?" — no DB check, just confirms the event loop is running
router.get("/live", (_req, res) => {
  res.status(200).json({ status: "alive", uptime: Math.floor((Date.now() - START) / 1000) });
});

// ─── GET /api/health/ready — Kubernetes readiness probe ──────────────────────
// "Ready for traffic?" — fails if DB unreachable (prevents routing to broken pod)
router.get("/ready", async (_req, res) => {
  let ready = false;
  try { db.prepare("SELECT 1").get(); ready = true; } catch { ready = false; }
  res.status(ready ? 200 : 503).json({
    status:    ready ? "ready" : "not_ready",
    timestamp: new Date().toISOString(),
  });
});

// ─── GET /api/health/lockdown ─────────────────────────────────────────────────
router.get("/lockdown", (_req, res) => {
  res.json({ enabled: (global as any).lockdownEnabled || false });
});

// ─── POST /api/health/lockdown ────────────────────────────────────────────────
router.post("/lockdown", (req, res) => {
  const { enabled } = req.body;
  (global as any).lockdownEnabled = !!enabled;

  try {
    db.prepare(
      "INSERT INTO audit_logs (id,timestamp,user_name,user_role,action,details,entity_type,entity_id) VALUES (?,?,?,?,?,?,?,?)"
    ).run(
      generateId("aud"), new Date().toISOString(),
      req.user?.name || "Sentinel Gov Admin",
      req.user?.role || "admin",
      enabled ? "National Alert Mode Activated" : "National Alert Mode Deactivated",
      `National Cyber Emergency Lockdown Switch toggled to: ${enabled ? "ACTIVE" : "INACTIVE"}.`,
      "system", "lockdown"
    );
  } catch { /* non-blocking audit */ }

  res.json({ success: true, enabled: (global as any).lockdownEnabled });
});

export default router;
