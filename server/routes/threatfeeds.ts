/**
 * LitSecure Sentinel — Threat Feed Routes (Phase 1)
 * REST API to query threat indicators, feed statistics, and blocklist.
 *
 * Prefix: /api/threatfeeds
 */
import { Router } from "express";
import { getFeedStats, searchIndicator, getRecentIndicators, detectIOCType } from "../services/threatFeeds.js";
import { addToBlocklist, getBlocklist } from "../services/endpointAgent.js";
import db from "../db/index.js";

const router = Router();

// ── Feed statistics ────────────────────────────────────────────────────────────
router.get("/stats", (_req, res) => {
  return res.json(getFeedStats());
});

// ── Recent indicators (last N from all feeds) ──────────────────────────────────
router.get("/recent", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string ?? "50"), 200);
  return res.json(getRecentIndicators(limit));
});

// ── Search indicator ──────────────────────────────────────────────────────────
router.get("/search", (req, res) => {
  const { q } = req.query;
  if (!q || typeof q !== "string") return res.status(400).json({ error: "q required" });
  return res.json(searchIndicator(q.trim()));
});

// ── Lookup a single indicator ─────────────────────────────────────────────────
router.get("/lookup", async (req, res) => {
  const { value } = req.query;
  if (!value || typeof value !== "string") {
    return res.status(400).json({ error: "value required" });
  }

  const type = detectIOCType(value);

  // Check local threat intel
  const local = db.prepare(
    "SELECT * FROM threat_intel WHERE value = ? LIMIT 1"
  ).get(value.trim()) as any;

  // Check blocklist
  const blocked = db.prepare(
    "SELECT * FROM blocklist WHERE value = ? LIMIT 1"
  ).get(value.trim()) as any;

  return res.json({
    value,
    type,
    localRecord:  local   || null,
    isBlocked:    !!blocked,
    blockRecord:  blocked || null,
  });
});

// ── Indicator breakdown by type + source ──────────────────────────────────────
router.get("/breakdown", (_req, res) => {
  const byType = db.prepare(
    "SELECT type, COUNT(*) as count FROM threat_intel GROUP BY type"
  ).all();

  const bySeverity = db.prepare(
    "SELECT severity, COUNT(*) as count FROM threat_intel GROUP BY severity"
  ).all();

  const bySource = db.prepare(
    "SELECT source, COUNT(*) as count, MAX(confidence) as maxConf, AVG(confidence) as avgConf FROM threat_intel GROUP BY source ORDER BY count DESC"
  ).all();

  const recentActivity = db.prepare(
    "SELECT strftime('%Y-%m-%d', last_seen) as day, COUNT(*) as count FROM threat_intel WHERE last_seen IS NOT NULL GROUP BY day ORDER BY day DESC LIMIT 14"
  ).all();

  return res.json({ byType, bySeverity, bySource, recentActivity });
});

// ── Top IOCs by confidence ─────────────────────────────────────────────────────
router.get("/top", (req, res) => {
  const type = req.query.type as string;
  const limit = Math.min(parseInt(req.query.limit as string ?? "20"), 100);

  const rows = type
    ? db.prepare("SELECT * FROM threat_intel WHERE type = ? ORDER BY confidence DESC LIMIT ?").all(type, limit)
    : db.prepare("SELECT * FROM threat_intel ORDER BY confidence DESC LIMIT ?").all(limit);

  return res.json(rows);
});

// ── Blocklist ─────────────────────────────────────────────────────────────────
router.get("/blocklist", (_req, res) => {
  return res.json(getBlocklist());
});

router.post("/blocklist", (req, res) => {
  const { type, value, category, source, confidence } = req.body;
  if (!type || !value || !category) {
    return res.status(400).json({ error: "type, value, category required" });
  }
  addToBlocklist(type, value, category, source ?? "manual", confidence ?? 80);
  return res.json({ success: true });
});

export default router;
