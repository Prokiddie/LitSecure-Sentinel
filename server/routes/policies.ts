/**
 * LitSecure Sentinel — Policy Management Module (Phase 2)
 * CRUD for sector security policies, rule conditions, and push to endpoints.
 *
 * Prefix: /api/policies
 */
import { Router } from "express";
import db, { generateId } from "../db/index.js";
import { validate } from "../middleware/validate.js";
import {
  createSecurityPolicySchema,
  updateSecurityPolicySchema,
  deployPolicySchema,
  evaluateIncidentPolicySchema,
} from "../schemas/index.js";
import {
  isSupabaseEnabled,
  upsertPolicyToSupabase,
  deletePolicyFromSupabase,
  insertPolicyDeploymentToSupabase,
} from "../db/supabase-client.js";

const router = Router();

// ─── Map helper (defined first so all routes can use it) ──────────────────────
function mapPolicy(p: any) {
  return {
    ...p,
    rules:   JSON.parse(p.rules   ?? "[]"),
    actions: JSON.parse(p.actions ?? "[]"),
  };
}

// ─── Schema (idempotent additions) ────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS security_policies (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    sector      TEXT NOT NULL DEFAULT 'all',
    category    TEXT NOT NULL DEFAULT 'DETECTION',
    rules       TEXT NOT NULL DEFAULT '[]',   -- JSON array of rule conditions
    actions     TEXT NOT NULL DEFAULT '[]',   -- JSON array of actions on match
    status      TEXT NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE | DISABLED | DRAFT
    priority    INTEGER NOT NULL DEFAULT 50,
    created_by  TEXT NOT NULL DEFAULT 'admin',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS policy_deployments (
    id          TEXT PRIMARY KEY,
    policy_id   TEXT NOT NULL REFERENCES security_policies(id) ON DELETE CASCADE,
    agent_id    TEXT,
    sector      TEXT,
    status      TEXT NOT NULL DEFAULT 'PENDING',  -- PENDING | DEPLOYED | FAILED
    deployed_at TEXT NOT NULL
  );
`);

// Seed default policies if none exist
const count = (db.prepare("SELECT COUNT(*) as c FROM security_policies").get() as any).c;
if (count === 0) {
  const now = new Date().toISOString();
  const defaultPolicies = [
    {
      id: generateId("pol"), name: "Banking Sector — Mandatory 2h Reporting",
      description: "All banking incidents classified Critical or High must be reported within 2 hours",
      sector: "Banking", category: "COMPLIANCE",
      rules: JSON.stringify([{ field: "severity", operator: "IN", value: ["Critical", "High"] }, { field: "sector", operator: "EQ", value: "Banking" }]),
      actions: JSON.stringify([{ type: "ALERT", message: "2h reporting window triggered" }, { type: "ESCALATE", target: "gov_admin" }]),
      status: "ACTIVE", priority: 90, created_by: "admin", created_at: now, updated_at: now,
    },
    {
      id: generateId("pol"), name: "Ransomware Auto-Response",
      description: "Automatically quarantine endpoint on ransomware detection",
      sector: "all", category: "RESPONSE",
      rules: JSON.stringify([{ field: "category", operator: "EQ", value: "Ransomware" }]),
      actions: JSON.stringify([{ type: "QUARANTINE_AGENT", message: "Ransomware detected — isolating endpoint" }, { type: "ALERT", message: "Ransomware response activated" }]),
      status: "ACTIVE", priority: 100, created_by: "admin", created_at: now, updated_at: now,
    },
    {
      id: generateId("pol"), name: "Telecom SIM Swap Alert",
      description: "Escalate all SIM swap incidents to investigator",
      sector: "Telecom", category: "ESCALATION",
      rules: JSON.stringify([{ field: "category", operator: "EQ", value: "SIM Swap" }]),
      actions: JSON.stringify([{ type: "ESCALATE", target: "investigator" }, { type: "NOTIFY_SMS", message: "SIM swap incident detected" }]),
      status: "ACTIVE", priority: 80, created_by: "admin", created_at: now, updated_at: now,
    },
    {
      id: generateId("pol"), name: "Gov Portal — Critical Incident Response",
      description: "Critical government system incidents require immediate war-room activation",
      sector: "Government", category: "RESPONSE",
      rules: JSON.stringify([{ field: "severity", operator: "EQ", value: "Critical" }, { field: "sector", operator: "EQ", value: "Government" }]),
      actions: JSON.stringify([{ type: "WARROOM_ACTIVATE", message: "Critical gov incident — war room opening" }, { type: "NOTIFY_ALL", message: "CRITICAL GOV INCIDENT" }]),
      status: "ACTIVE", priority: 95, created_by: "admin", created_at: now, updated_at: now,
    },
  ];
  for (const p of defaultPolicies) {
    db.prepare(`
      INSERT OR IGNORE INTO security_policies (id,name,description,sector,category,rules,actions,status,priority,created_by,created_at,updated_at)
      VALUES (@id,@name,@description,@sector,@category,@rules,@actions,@status,@priority,@created_by,@created_at,@updated_at)
    `).run(p);
  }
}

// ─── CRUD ──────────────────────────────────────────────────────────────────────

router.get("/meta/stats", (_req, res) => {
  const total    = (db.prepare("SELECT COUNT(*) as c FROM security_policies").get() as any).c;
  const active   = (db.prepare("SELECT COUNT(*) as c FROM security_policies WHERE status = 'ACTIVE'").get() as any).c;
  const deployed = (db.prepare("SELECT COUNT(*) as c FROM policy_deployments WHERE status = 'DEPLOYED'").get() as any).c;
  const byCategory = db.prepare("SELECT category, COUNT(*) as count FROM security_policies GROUP BY category").all();
  return res.json({ total, active, deployed, byCategory });
});

router.get("/", (_req, res) => {
  const policies = db.prepare("SELECT * FROM security_policies ORDER BY priority DESC, created_at DESC").all();
  return res.json(policies.map(mapPolicy));
});

router.get("/:id", (req, res) => {
  const p = db.prepare("SELECT * FROM security_policies WHERE id = ?").get(req.params.id) as any;
  if (!p) return res.status(404).json({ error: "Policy not found" });
  return res.json(mapPolicy(p));
});

router.post("/", validate(createSecurityPolicySchema), (req, res) => {
  const { name, description, sector, category, rules, actions, status, priority } = req.body;

  const now  = new Date().toISOString();
  const id   = generateId("pol");
  const user = (req as any).user;

  db.prepare(`
    INSERT INTO security_policies (id,name,description,sector,category,rules,actions,status,priority,created_by,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    id, name, description ?? "", sector ?? "all", category ?? "DETECTION",
    JSON.stringify(rules ?? []), JSON.stringify(actions ?? []),
    status ?? "ACTIVE", priority ?? 50,
    user?.name || "admin", now, now,
  );

  const created = db.prepare("SELECT * FROM security_policies WHERE id = ?").get(id) as any;
  if (isSupabaseEnabled()) upsertPolicyToSupabase(created).catch(() => {});

  return res.status(201).json({ id, success: true });
});

router.put("/:id", validate(updateSecurityPolicySchema), (req, res) => {
  const existing = db.prepare("SELECT id FROM security_policies WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Policy not found" });

  const { name, description, sector, category, rules, actions, status, priority } = req.body;
  db.prepare(`
    UPDATE security_policies
    SET name=?,description=?,sector=?,category=?,rules=?,actions=?,status=?,priority=?,updated_at=?
    WHERE id=?
  `).run(
    name, description, sector, category,
    JSON.stringify(rules), JSON.stringify(actions),
    status, priority, new Date().toISOString(), req.params.id,
  );
  const updated = db.prepare("SELECT * FROM security_policies WHERE id = ?").get(req.params.id) as any;
  if (isSupabaseEnabled()) upsertPolicyToSupabase(updated).catch(() => {});
  return res.json({ success: true });
});

router.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM security_policies WHERE id = ?").run(req.params.id);
  if (isSupabaseEnabled()) deletePolicyFromSupabase(req.params.id).catch(() => {});
  return res.json({ success: true });
});

// ─── Deploy policy to agents/sector ──────────────────────────────────────────

router.post("/:id/deploy", (req, res) => {
  const policy = db.prepare("SELECT * FROM security_policies WHERE id = ?").get(req.params.id) as any;
  if (!policy) return res.status(404).json({ error: "Policy not found" });

  const { agentId, sector } = req.body;
  const now = new Date().toISOString();
  const deployId = generateId("dep");

  // If targeting specific agents
  let targetAgents: any[] = [];
  if (agentId) {
    targetAgents = [db.prepare("SELECT * FROM endpoint_agents WHERE agent_id = ?").get(agentId)].filter(Boolean);
  } else if (sector && sector !== "all") {
    targetAgents = db.prepare("SELECT * FROM endpoint_agents WHERE sector = ? AND status = 'ACTIVE'").all(sector) as any[];
  } else if (policy.sector && policy.sector !== "all") {
    targetAgents = db.prepare("SELECT * FROM endpoint_agents WHERE sector = ? AND status = 'ACTIVE'").all(policy.sector) as any[];
  }

  // Record deployment
  db.prepare(`
    INSERT INTO policy_deployments (id, policy_id, agent_id, sector, status, deployed_at)
    VALUES (?, ?, ?, ?, 'DEPLOYED', ?)
  `).run(deployId, policy.id, agentId ?? null, sector ?? policy.sector, now);

  // For each targeted agent, issue a policy command
  let commandsSent = 0;
  for (const agent of targetAgents) {
    db.prepare(`
      INSERT INTO agent_commands (id, agent_id, command, status, issued_at)
      VALUES (?, ?, ?, 'PENDING', ?)
    `).run(generateId("cmd"), agent.agent_id, JSON.stringify({ type: "APPLY_POLICY", policyId: policy.id, policyName: policy.name, rules: JSON.parse(policy.rules), actions: JSON.parse(policy.actions) }), now);
    commandsSent++;
  }

  if (isSupabaseEnabled()) {
    insertPolicyDeploymentToSupabase({
      policy_id:   policy.id,
      sector:      sector ?? policy.sector,
      deployed_by: (req as any).user?.name ?? null,
      deployed_at: now,
      status:      "DEPLOYED",
    }).catch(() => {});
  }

  return res.json({ deployId, commandsSent, targetAgents: targetAgents.length });
});

// ─── Evaluate a policy against an incident ────────────────────────────────────

router.post("/evaluate", validate(evaluateIncidentPolicySchema), (req, res) => {
  const { incident } = req.body;

  const policies = db.prepare(
    "SELECT * FROM security_policies WHERE status = 'ACTIVE' ORDER BY priority DESC"
  ).all() as any[];

  const triggered: Array<{ policy: any; matchedRules: string[]; actions: any[] }> = [];

  for (const p of policies) {
    const rules: any[] = JSON.parse(p.rules);
    const actions: any[] = JSON.parse(p.actions);
    const matchedRules: string[] = [];

    const allMatch = rules.every(rule => {
      const val = incident[rule.field];
      let match = false;
      if (rule.operator === "EQ")   match = val === rule.value;
      if (rule.operator === "IN")   match = Array.isArray(rule.value) && rule.value.includes(val);
      if (rule.operator === "LIKE") match = String(val ?? "").toLowerCase().includes(String(rule.value).toLowerCase());
      if (match) matchedRules.push(`${rule.field} ${rule.operator} ${JSON.stringify(rule.value)}`);
      return match;
    });

    if (allMatch && matchedRules.length > 0) {
      triggered.push({ policy: mapPolicy(p), matchedRules, actions });
    }
  }

  return res.json({ triggered, total: triggered.length });
});

export default router;
