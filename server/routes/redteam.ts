/**
 * Red Team Engine — REST Routes
 * GET  /api/redteam/results    — latest attack simulation records
 * GET  /api/redteam/stats      — aggregate pass/block/finding stats
 * POST /api/redteam/trigger    — manually kick off a full attack suite (admin only)
 * GET  /api/redteam/anomalies  — behavioral anomaly profiles (top 20 by score)
 * GET  /api/redteam/ai         — adversarial AI test results
 * GET  /api/redteam/ai/stats   — adversarial AI aggregate stats
 * POST /api/redteam/ai/trigger — manually run AI test suite (admin only)
 */

import { Router } from "express";
import {
  getResults,
  getStats,
  triggerManualRun,
} from "../services/redTeamEngine.js";
import {
  getAIResults,
  getAIStats,
  triggerAITestRun,
} from "../services/adversarialAITesting.js";
import { getTopAnomalies } from "../services/behaviorAnomalyDetection.js";
import { requireRole } from "../middleware/auth.js";

const router = Router();

// ─── Red Team Engine Results ──────────────────────────────────────────────────

/**
 * GET /api/redteam/results
 * Returns the most recent N attack simulation records.
 */
router.get("/results", requireRole("investigator"), (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
  res.json({
    results: getResults(limit),
    meta: { limit },
  });
});

/**
 * GET /api/redteam/stats
 * Returns aggregate stats across the current ring buffer.
 */
router.get("/stats", requireRole("investigator"), (_req, res) => {
  res.json(getStats());
});

/**
 * POST /api/redteam/trigger
 * Admin-only manual trigger to run the full attack suite immediately.
 */
router.post("/trigger", requireRole("admin"), (_req, res) => {
  triggerManualRun();
  res.json({ message: "Red team suite triggered. Results will appear in /api/redteam/results within ~2 minutes." });
});

// ─── Behavioral Anomaly Detection ────────────────────────────────────────────

/**
 * GET /api/redteam/anomalies
 * Returns top anomaly profiles sorted by score.
 */
router.get("/anomalies", requireRole("investigator"), (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  res.json({
    anomalies: getTopAnomalies(limit),
    meta: { limit },
  });
});

// ─── Adversarial AI Testing ───────────────────────────────────────────────────

/**
 * GET /api/redteam/ai
 * Returns the most recent adversarial AI test records.
 */
router.get("/ai", requireRole("investigator"), (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 100, 200);
  res.json({
    results: getAIResults(limit),
    meta: { limit },
  });
});

/**
 * GET /api/redteam/ai/stats
 * Returns aggregate adversarial AI test statistics.
 */
router.get("/ai/stats", requireRole("investigator"), (_req, res) => {
  res.json(getAIStats());
});

/**
 * POST /api/redteam/ai/trigger
 * Admin-only manual trigger for the AI test suite.
 */
router.post("/ai/trigger", requireRole("admin"), (_req, res) => {
  triggerAITestRun();
  res.json({ message: "Adversarial AI test suite triggered. Results in /api/redteam/ai shortly." });
});

export default router;
