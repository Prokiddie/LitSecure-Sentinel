/**
 * LitSecure Sentinel — Endpoint Agent Routes (Phase 1)
 * REST API for agent registration, heartbeat, activity reporting,
 * command retrieval, and quarantine management.
 *
 * Prefix: /api/agent
 */
import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  registerAgent, heartbeat, getAgent, getAllAgents,
  reportSuspiciousActivity, issueCommand, getPendingCommands,
  markCommandExecuted, getQuarantineLog, getBlocklist,
  addToBlocklist, quarantineAgent, getAgentStats,
  getSuspiciousActivities, markInactiveAgents,
} from "../services/endpointAgent.js";
import db, { generateId } from "../db/index.js";

const router = Router();

// ── Agent Registration (no auth — agent uses org API key header) ────────────
router.post("/register", async (req, res) => {
  const { organization, sector, hostname, ipAddress, os, version } = req.body;
  const orgApiKey = req.headers["x-org-api-key"] as string;

  if (!organization || !sector || !hostname || !ipAddress) {
    return res.status(400).json({ error: "organization, sector, hostname, ipAddress required" });
  }

  // Verify org API key
  const org = orgApiKey
    ? db.prepare("SELECT id FROM organizations WHERE api_key = ?").get(orgApiKey)
    : null;

  const agentId = `agent-${hostname.replace(/\W/g, "-").toLowerCase()}-${generateId("").slice(0, 6)}`;
  registerAgent({ agentId, organization, sector, hostname, ipAddress, os: os ?? "", version: version ?? "1.0.0" });

  return res.json({ agentId, status: "REGISTERED", message: "Agent registered successfully" });
});

// ── Heartbeat (agent → server) ───────────────────────────────────────────────
router.post("/heartbeat", (req, res) => {
  const { agentId } = req.body;
  if (!agentId) return res.status(400).json({ error: "agentId required" });
  const found = heartbeat(agentId, req.body.metadata);
  if (!found) return res.status(404).json({ error: "Agent not found" });
  return res.json({ status: "OK", pendingCommands: getPendingCommands(agentId).length });
});

// ── Get pending commands for an agent ────────────────────────────────────────
router.get("/commands/:agentId", (req, res) => {
  const commands = getPendingCommands(req.params.agentId);
  return res.json(commands);
});

// ── Mark command as executed ──────────────────────────────────────────────────
router.post("/commands/:commandId/executed", (req, res) => {
  markCommandExecuted(req.params.commandId);
  return res.json({ success: true });
});

// ── Report suspicious activity ────────────────────────────────────────────────
router.post("/activity", (req, res) => {
  const { agentId, type, data, confidence = 0.8 } = req.body;
  if (!agentId || !type || !data) {
    return res.status(400).json({ error: "agentId, type, data required" });
  }
  const result = reportSuspiciousActivity({ agentId, type, data, confidence });
  return res.json(result);
});

// ─── Authenticated routes (MACRA analysts / admin only) ──────────────────────

// List all agents
router.get("/list", requireAuth, (req, res) => {
  markInactiveAgents();
  const agents = getAllAgents();
  return res.json(agents);
});

// Agent stats
router.get("/stats", requireAuth, (_req, res) => {
  markInactiveAgents();
  return res.json(getAgentStats());
});

// Get specific agent
router.get("/:agentId", requireAuth, (req, res) => {
  const agent = getAgent(req.params.agentId);
  if (!agent) return res.status(404).json({ error: "Agent not found" });
  return res.json(agent);
});

// Quarantine an agent
router.post("/:agentId/quarantine", requireAuth, (req, res) => {
  const agent = getAgent(req.params.agentId);
  if (!agent) return res.status(404).json({ error: "Agent not found" });
  quarantineAgent(req.params.agentId);
  return res.json({ success: true, status: "QUARANTINED" });
});

// Issue a manual command to an agent
router.post("/:agentId/command", requireAuth, (req, res) => {
  const { type, params } = req.body;
  if (!type) return res.status(400).json({ error: "type required" });
  const commandId = issueCommand(req.params.agentId, type, params ?? {});
  return res.json({ commandId });
});

// Suspicious activity log
router.get("/activities/recent", requireAuth, (req, res) => {
  const limit = parseInt(req.query.limit as string ?? "100");
  return res.json(getSuspiciousActivities(limit));
});

// Quarantine log
router.get("/quarantine/log", requireAuth, (_req, res) => {
  return res.json(getQuarantineLog());
});

// Blocklist
router.get("/blocklist/all", requireAuth, (_req, res) => {
  return res.json(getBlocklist());
});

router.post("/blocklist/add", requireAuth, (req, res) => {
  const { type, value, category, source, confidence } = req.body;
  if (!type || !value || !category) {
    return res.status(400).json({ error: "type, value, category required" });
  }
  addToBlocklist(type, value, category, source ?? "manual", confidence ?? 80);
  return res.json({ success: true });
});

export default router;
