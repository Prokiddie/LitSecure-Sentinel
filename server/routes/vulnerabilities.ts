import { Router, Request, Response } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { db, queries, generateId } from "../db/index.js";

const router = Router();

// Simple CVSS v3.1 Base Score Calculator helper
export function calculateCVSS(metrics: {
  av: "N" | "A" | "L" | "P"; // Attack Vector
  ac: "L" | "H";             // Attack Complexity
  pr: "N" | "L" | "H";       // Privileges Required
  ui: "N" | "R";             // User Interaction
  s:  "U" | "C";             // Scope
  c:  "N" | "L" | "H";       // Confidentiality
  i:  "N" | "L" | "H";       // Integrity
  a:  "N" | "L" | "H";       // Availability
}): number {
  const AV = { N: 0.85, A: 0.62, L: 0.55, P: 0.20 }[metrics.av];
  const AC = { L: 0.77, H: 0.44 }[metrics.ac];
  
  let PR = 0.85;
  if (metrics.pr === "L") PR = metrics.s === "C" ? 0.68 : 0.62;
  else if (metrics.pr === "H") PR = metrics.s === "C" ? 0.50 : 0.27;

  const UI = { N: 0.85, R: 0.62 }[metrics.ui];
  
  const Exploitability = 8.22 * AV * AC * PR * UI;

  const C = { N: 0, L: 0.22, H: 0.56 }[metrics.c];
  const I = { N: 0, L: 0.22, H: 0.56 }[metrics.i];
  const A = { N: 0, L: 0.22, H: 0.56 }[metrics.a];
  
  const ISS = 1 - (1 - C) * (1 - I) * (1 - A);
  
  let Impact = 0;
  if (metrics.s === "U") {
    Impact = 6.42 * ISS;
  } else {
    Impact = 7.52 * (ISS - 0.029) - 3.25 * Math.pow(ISS - 0.02, 15);
  }

  if (Impact <= 0) return 0;

  let baseScore = 0;
  if (metrics.s === "U") {
    baseScore = Math.min(Impact + Exploitability, 10);
  } else {
    baseScore = Math.min(1.08 * (Impact + Exploitability), 10);
  }

  return Math.round(baseScore * 10) / 10;
}

function getSeverity(score: number): string {
  if (score >= 9.0) return "Critical";
  if (score >= 7.0) return "High";
  if (score >= 4.0) return "Medium";
  if (score >= 0.1) return "Low";
  return "None";
}

// GET /api/vulnerabilities — List all vulnerabilities
router.get("/", requireAuth, (req: Request, res: Response) => {
  try {
    const { status, severity, search } = req.query;
    let sql = "SELECT * FROM vulnerabilities";
    const params: any[] = [];
    const clauses: string[] = [];

    if (status) {
      clauses.push(" status = ?");
      params.push(status);
    }
    if (severity) {
      clauses.push(" severity = ?");
      params.push(severity);
    }
    if (search) {
      clauses.push(" (cve_id LIKE ? OR title LIKE ? OR description LIKE ?)");
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    if (clauses.length > 0) {
      sql += " WHERE" + clauses.join(" AND");
    }

    sql += " ORDER BY cvss_score DESC";

    const rows = db.prepare(sql).all(...params) as any[];
    const parsed = rows.map((r: any) => ({
      ...r,
      affected_assets: JSON.parse(r.affected_assets || "[]"),
    }));

    res.json(parsed);
  } catch (err: any) {
    res.status(500).json({ error: "DB_ERROR", message: err.message });
  }
});

// POST /api/vulnerabilities/ingest — Ingest or report a new vulnerability
router.post("/ingest", requireRole("admin", "analyst", "gov_admin", "soc_manager"), (req: Request, res: Response) => {
  const { cveId, title, description, cvssScore, metrics, affectedAssets, remediation } = req.body;

  if (!cveId || !title || !description) {
    return res.status(400).json({ error: "BAD_REQUEST", message: "cveId, title, and description are required." });
  }

  let finalScore = Number(cvssScore);
  if (metrics && typeof metrics === "object") {
    try {
      finalScore = calculateCVSS(metrics);
    } catch (e) {
      return res.status(400).json({ error: "INVALID_METRICS", message: "Invalid CVSS metrics format." });
    }
  }

  if (isNaN(finalScore) || finalScore < 0 || finalScore > 10) {
    return res.status(400).json({ error: "INVALID_SCORE", message: "CVSS score must be a number between 0 and 10." });
  }

  const severity = getSeverity(finalScore);
  const id = generateId("vuln");
  const now = new Date().toISOString();

  try {
    queries.insertVulnerability.run({
      id,
      cve_id: cveId,
      title,
      description,
      cvss_score: finalScore,
      severity,
      status: "Open",
      affected_assets: JSON.stringify(affectedAssets || []),
      remediation: remediation || "",
      detected_at: now,
      updated_at: now,
    });

    // Audit log
    db.prepare(`
      INSERT INTO audit_logs (id, timestamp, user_name, user_role, action, details, entity_type, entity_id)
      VALUES (?, ?, ?, ?, 'VULNERABILITY_INGESTED', ?, 'vulnerabilities', ?)
    `).run(
      generateId("aud"),
      now,
      req.user!.name || req.user!.email,
      req.user!.role,
      `Ingested vulnerability ${cveId} (${severity} CVSS ${finalScore})`,
      id
    );

    res.status(201).json({ success: true, id, cveId, cvssScore: finalScore, severity });
  } catch (err: any) {
    res.status(500).json({ error: "DB_ERROR", message: err.message });
  }
});

// POST /api/vulnerabilities/:id/patch — Update vulnerability status
router.post("/:id/patch", requireRole("admin", "investigator", "analyst", "soc_manager"), (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, remediation } = req.body;

  const validStatuses = ["Open", "In Progress", "Mitigated", "Remediated"];
  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({ error: "INVALID_STATUS", message: `Status must be one of: ${validStatuses.join(", ")}` });
  }

  try {
    const vuln = db.prepare("SELECT * FROM vulnerabilities WHERE id = ?").get(id) as any;
    if (!vuln) return res.status(404).json({ error: "NOT_FOUND", message: "Vulnerability not found." });

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE vulnerabilities
      SET status = ?, remediation = COALESCE(NULLIF(?, ''), remediation), updated_at = ?
      WHERE id = ?
    `).run(status, remediation || "", now, id);

    // Audit log
    db.prepare(`
      INSERT INTO audit_logs (id, timestamp, user_name, user_role, action, details, entity_type, entity_id)
      VALUES (?, ?, ?, ?, 'VULNERABILITY_PATCHED', ?, 'vulnerabilities', ?)
    `).run(
      generateId("aud"),
      now,
      req.user!.name || req.user!.email,
      req.user!.role,
      `Updated vulnerability ${vuln.cve_id} status to ${status}. Remediation: ${remediation || "none"}`,
      id
    );

    res.json({ success: true, id, status });
  } catch (err: any) {
    res.status(500).json({ error: "DB_ERROR", message: err.message });
  }
});

// GET /api/vulnerabilities/stats — Get summary stats
router.get("/stats", requireAuth, (_req: Request, res: Response) => {
  try {
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN severity = 'Critical' THEN 1 ELSE 0 END) as critical,
        SUM(CASE WHEN severity = 'High' THEN 1 ELSE 0 END) as high,
        SUM(CASE WHEN severity = 'Medium' THEN 1 ELSE 0 END) as medium,
        SUM(CASE WHEN severity = 'Low' THEN 1 ELSE 0 END) as low,
        SUM(CASE WHEN status = 'Open' THEN 1 ELSE 0 END) as open,
        SUM(CASE WHEN status = 'In Progress' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN status = 'Mitigated' THEN 1 ELSE 0 END) as mitigated,
        SUM(CASE WHEN status = 'Remediated' THEN 1 ELSE 0 END) as remediated
      FROM vulnerabilities
    `).get() as any;

    res.json({
      total: stats?.total ?? 0,
      severities: {
        critical: stats?.critical ?? 0,
        high: stats?.high ?? 0,
        medium: stats?.medium ?? 0,
        low: stats?.low ?? 0,
      },
      statuses: {
        open: stats?.open ?? 0,
        inProgress: stats?.in_progress ?? 0,
        mitigated: stats?.mitigated ?? 0,
        remediated: stats?.remediated ?? 0,
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: "DB_ERROR", message: err.message });
  }
});

export default router;
