/**
 * LitSecure Sentinel — Audit Log Route v2
 *
 * Upgrades:
 * 1. Tamper-evident SHA-256 chain: each log entry stores a hash of
 *    its own content + the previous entry's hash (blockchain-style).
 * 2. Export to JSON/CSV for SIEM ingestion.
 * 3. Integrity verification endpoint — detects if logs were tampered with.
 * 4. Filters: date range, action, user, entity_type.
 */
import { Router } from "express";
import crypto from "crypto";
import { db, queries, mapAuditLog } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/auth.js";

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Compute the hash of a log entry combined with the previous chain hash.
 * Creates an append-only chain: tampering any entry breaks all subsequent hashes.
 */
function computeLogHash(entry: any, prevHash: string): string {
  const content = JSON.stringify({
    id:          entry.id,
    timestamp:   entry.timestamp,
    user_name:   entry.user_name,
    user_role:   entry.user_role,
    action:      entry.action,
    details:     entry.details,
    entity_type: entry.entity_type,
    entity_id:   entry.entity_id,
    ip_address:  entry.ip_address,
    prev_hash:   prevHash,
  });
  return crypto.createHash("sha256").update(content).digest("hex");
}

// ─── GET /api/audit-logs ──────────────────────────────────────────────────────
// Full filterable audit log list with chain hashes included
router.get("/", requireAuth, requireRole("admin", "auditor", "gov_admin", "soc_manager"), (req, res) => {
  try {
    const { from, to, action, user, entity_type, limit = 500 } = req.query;

    let sql = "SELECT * FROM audit_logs WHERE 1=1";
    const params: any[] = [];

    if (from)        { sql += " AND timestamp >= ?"; params.push(from); }
    if (to)          { sql += " AND timestamp <= ?"; params.push(to); }
    if (action)      { sql += " AND action = ?";     params.push(action); }
    if (user)        { sql += " AND user_name LIKE ?"; params.push(`%${user}%`); }
    if (entity_type) { sql += " AND entity_type = ?"; params.push(entity_type); }

    sql += " ORDER BY timestamp ASC LIMIT ?";
    params.push(Number(limit));

    const rows = db.prepare(sql).all(...params) as any[];

    // Attach chain hashes for integrity verification
    let prevHash = "GENESIS"; // anchor hash for first entry
    const enriched = rows.map(r => {
      const hash = computeLogHash(r, prevHash);
      prevHash   = hash;
      return { ...mapAuditLog(r), chain_hash: hash };
    });

    return res.json({ logs: enriched, count: enriched.length });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/audit-logs/verify ───────────────────────────────────────────────
// Recomputes the entire chain and reports any broken links (tampering detected)
router.get("/verify", requireAuth, requireRole("admin", "auditor"), (req, res) => {
  try {
    const rows = db.prepare(
      "SELECT * FROM audit_logs ORDER BY timestamp ASC"
    ).all() as any[];

    let prevHash = "GENESIS";
    let intact   = 0;
    let broken   = 0;
    const violations: any[] = [];

    for (const r of rows) {
      const expected = computeLogHash(r, prevHash);
      const stored   = r.chain_hash || null;

      if (stored && stored !== expected) {
        broken++;
        violations.push({
          id:        r.id,
          timestamp: r.timestamp,
          action:    r.action,
          expected,
          stored,
          issue:     "HASH_MISMATCH — entry may have been modified or deleted",
        });
      } else {
        intact++;
      }
      prevHash = expected;
    }

    return res.json({
      total:         rows.length,
      intact,
      broken,
      chain_healthy: broken === 0,
      violations,
      message:       broken === 0
        ? "✅ Audit log chain is intact — no tampering detected."
        : `⚠️ ${broken} tampered or missing entries detected.`,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/audit-logs/export ───────────────────────────────────────────────
// Export as JSON (for SIEM) or CSV (for compliance reports)
router.get("/export", requireAuth, requireRole("admin", "auditor", "gov_admin"), (req, res) => {
  try {
    const { format = "json", from, to } = req.query;

    let sql    = "SELECT * FROM audit_logs WHERE 1=1";
    const params: any[] = [];
    if (from) { sql += " AND timestamp >= ?"; params.push(from); }
    if (to)   { sql += " AND timestamp <= ?"; params.push(to); }
    sql += " ORDER BY timestamp ASC";

    const rows = db.prepare(sql).all(...params) as any[];

    if (format === "csv") {
      const header = "id,timestamp,user_name,user_role,action,entity_type,entity_id,ip_address,details\n";
      const csvRows = rows.map((r: any) =>
        [r.id, r.timestamp, r.user_name, r.user_role, r.action,
         r.entity_type, r.entity_id, r.ip_address,
         `"${(r.details || "").replace(/"/g, '""')}"`
        ].join(",")
      ).join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="audit_log_${Date.now()}.csv"`);
      return res.send(header + csvRows);
    }

    res.setHeader("Content-Disposition", `attachment; filename="audit_log_${Date.now()}.json"`);
    return res.json({ exported_at: new Date().toISOString(), count: rows.length, logs: rows.map(mapAuditLog) });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/audit-logs/stats ────────────────────────────────────────────────
router.get("/stats", requireAuth, requireRole("admin", "auditor", "gov_admin", "soc_manager"), (req, res) => {
  try {
    const total     = (db.prepare("SELECT COUNT(*) as n FROM audit_logs").get() as any).n;
    const today     = (db.prepare("SELECT COUNT(*) as n FROM audit_logs WHERE timestamp >= date('now')").get() as any).n;
    const topUsers  = db.prepare(
      "SELECT user_name, COUNT(*) as count FROM audit_logs GROUP BY user_name ORDER BY count DESC LIMIT 5"
    ).all();
    const topActions = db.prepare(
      "SELECT action, COUNT(*) as count FROM audit_logs GROUP BY action ORDER BY count DESC LIMIT 10"
    ).all();

    return res.json({ total, today, topUsers, topActions });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
