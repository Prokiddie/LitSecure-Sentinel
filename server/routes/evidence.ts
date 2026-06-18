/**
 * LitSecure Sentinel — Evidence Management Service
 * Handles file uploads, SHA-256 integrity hashing, and chain-of-custody tracking
 */
import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth.js";
import { db } from "../db/index.js";
import { scanEvidenceBuffer } from "../services/evidenceScanner.js";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const EVIDENCE_DIR = path.resolve(__dirname, "../../data/evidence");
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

const router = Router();

// ─── Helper: parse base64 upload ─────────────────────────────────────────────
function saveBase64File(base64Data: string, fileName: string): { diskPath: string; size: number; sha256: string } {
  // Strip data URI prefix if present
  const base64 = base64Data.replace(/^data:[^;]+;base64,/, "");
  const buffer = Buffer.from(base64, "base64");

  // Sanitize filename and add timestamp
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const diskName = `${Date.now()}_${safe}`;
  const diskPath = path.join(EVIDENCE_DIR, diskName);

  fs.writeFileSync(diskPath, buffer);

  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");

  return { diskPath: diskName, size: buffer.length, sha256 };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/evidence/:incidentId — list evidence for an incident
router.get("/:incidentId", requireAuth, (req, res) => {
  try {
    const rows = db.prepare(
      "SELECT * FROM incident_evidence WHERE incident_id = ? ORDER BY uploaded_at DESC"
    ).all(req.params.incidentId);

    const parsed = rows.map((r: any) => ({
      ...r,
      chain_of_custody: JSON.parse(r.chain_of_custody || "[]"),
      tags: JSON.parse(r.tags || "[]"),
    }));

    res.json(parsed);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/evidence/:incidentId/upload — upload evidence file
router.post("/:incidentId/upload", requireAuth, async (req: Request, res: Response) => {
  try {
    const { incidentId } = req.params;
    const { fileName, fileType, fileData, tags, description } = req.body;

    if (!fileName || !fileType || !fileData) {
      return res.status(400).json({ message: "fileName, fileType, and fileData (base64) are required." });
    }

    // Verify incident exists
    const incident = db.prepare("SELECT id, title FROM incidents WHERE id = ?").get(incidentId) as any;
    if (!incident) return res.status(404).json({ message: "Incident not found." });

    // Save file, compute hash
    const base64 = fileData.replace(/^data:[^;]+;base64,/, "");
    const buffer = Buffer.from(base64, "base64");

    // ─── Malware Scan ─────────────────────────────────────────────────────────
    const scanResult = await scanEvidenceBuffer(buffer, fileName);
    if (!scanResult.safe) {
      // Audit the rejected upload
      const auditId = `AUD-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
      db.prepare(`
        INSERT INTO audit_logs (id, timestamp, user_name, user_role, action, details, entity_type, entity_id, ip_address, user_agent)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        auditId, new Date().toISOString(),
        req.user!.name || req.user!.email, req.user!.role,
        "EVIDENCE_MALWARE_BLOCKED",
        `Malicious file blocked: "${fileName}" — ${scanResult.threat}. ${scanResult.details || ""}`,
        "incident_evidence", incidentId,
        req.ip || "unknown", req.headers["user-agent"] || "unknown"
      );
      return res.status(422).json({
        error:   "MALWARE_DETECTED",
        message: `Upload rejected: ${scanResult.threat}`,
        details: scanResult.details,
        sha256:  scanResult.sha256,
      });
    }

    // Save file to disk (scan passed)
    const { diskPath, size, sha256 } = saveBase64File(fileData, fileName);

    const id  = `EVD-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
    const now = new Date().toISOString();

    // Initial chain-of-custody entry
    const custodyEntry = {
      action:    "UPLOADED",
      actor:     req.user!.name || req.user!.email,
      actorRole: req.user!.role,
      actorId:   req.user!.id,
      timestamp: now,
      note:      description || `File uploaded and SHA-256 hash computed.`,
      ipAddress: req.ip || "unknown",
    };

    db.prepare(`
      INSERT INTO incident_evidence
        (id, incident_id, file_name, file_url, file_type, file_size, sha256_hash, chain_of_custody, tags, uploaded_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, incidentId, fileName, diskPath,
      fileType, size, sha256,
      JSON.stringify([custodyEntry]),
      JSON.stringify(tags || []),
      now
    );

    // Log to audit
    db.prepare(`
      INSERT INTO audit_logs (id, timestamp, user_name, user_role, action, details, entity_type, entity_id, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `AUD-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
      now,
      req.user!.name || req.user!.email,
      req.user!.role,
      "EVIDENCE_UPLOAD",
      `Uploaded evidence file "${fileName}" (${(size / 1024).toFixed(1)} KB) for incident ${incidentId}. SHA-256: ${sha256}`,
      "incident_evidence",
      id,
      req.ip || "unknown",
      req.headers["user-agent"] || "unknown"
    );

    res.json({
      id,
      fileName,
      fileType,
      fileSize: size,
      sha256Hash: sha256,
      uploadedAt: now,
      chainOfCustody: [custodyEntry],
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/evidence/:incidentId/:evidenceId/custody — add custody entry
router.post("/:incidentId/:evidenceId/custody", requireAuth, (req, res) => {
  try {
    const { evidenceId } = req.params;
    const { action, note } = req.body;

    const row = db.prepare("SELECT * FROM incident_evidence WHERE id = ?").get(evidenceId) as any;
    if (!row) return res.status(404).json({ message: "Evidence not found." });

    const custody: any[] = JSON.parse(row.chain_of_custody || "[]");
    const now = new Date().toISOString();

    const entry = {
      action: action || "REVIEWED",
      actor:    req.user!.name || req.user!.email,
      actorRole: req.user!.role,
      actorId:  req.user!.id,
      timestamp: now,
      note: note || "Evidence reviewed.",
      ipAddress: req.ip || "unknown",
    };

    custody.push(entry);

    db.prepare("UPDATE incident_evidence SET chain_of_custody = ? WHERE id = ?")
      .run(JSON.stringify(custody), evidenceId);

    res.json({ ok: true, entry, totalEntries: custody.length });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/evidence/:incidentId/:evidenceId/verify — re-verify file integrity
router.post("/:incidentId/:evidenceId/verify", requireAuth, (req, res) => {
  try {
    const { evidenceId } = req.params;
    const row = db.prepare("SELECT * FROM incident_evidence WHERE id = ?").get(evidenceId) as any;
    if (!row) return res.status(404).json({ message: "Evidence not found." });

    const filePath = path.join(EVIDENCE_DIR, row.file_url);
    if (!fs.existsSync(filePath)) {
      return res.json({ verified: false, reason: "File not found on disk — possible tampering." });
    }

    const buffer  = fs.readFileSync(filePath);
    const current = crypto.createHash("sha256").update(buffer).digest("hex");
    const original = row.sha256_hash;
    const verified = current === original;

    // Log this verification in custody
    const custody: any[] = JSON.parse(row.chain_of_custody || "[]");
    custody.push({
      action:    verified ? "INTEGRITY_VERIFIED" : "INTEGRITY_FAILED",
      actor:     req.user!.name || req.user!.email,
      actorRole: req.user!.role,
      actorId:   req.user!.id,
      timestamp: new Date().toISOString(),
      note:      verified ? `File integrity confirmed. SHA-256 matches original.` : `⚠️ Hash mismatch! File may have been tampered with.`,
      ipAddress: req.ip || "unknown",
    });
    db.prepare("UPDATE incident_evidence SET chain_of_custody = ? WHERE id = ?")
      .run(JSON.stringify(custody), evidenceId);

    res.json({
      verified,
      originalHash: original,
      currentHash:  current,
      message: verified ? "✅ File integrity confirmed." : "⚠️ Hash mismatch — possible tampering detected.",
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/evidence/:incidentId/:evidenceId — requires admin + logs deletion attempt
router.delete("/:incidentId/:evidenceId", requireAuth, (req, res) => {
  try {
    const allowed = ["admin", "investigator"];
    if (!allowed.includes(req.user!.role)) {
      return res.status(403).json({ message: "Only Admin or Investigator can delete evidence." });
    }
    const { evidenceId } = req.params;
    const row = db.prepare("SELECT * FROM incident_evidence WHERE id = ?").get(evidenceId) as any;
    if (!row) return res.status(404).json({ message: "Evidence not found." });

    // Audit the deletion BEFORE deleting
    db.prepare(`
      INSERT INTO audit_logs (id, timestamp, user_name, user_role, action, details, entity_type, entity_id, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `AUD-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
      new Date().toISOString(),
      req.user!.name || req.user!.email,
      req.user!.role,
      "EVIDENCE_DELETED",
      `Evidence "${row.file_name}" (SHA-256: ${row.sha256_hash}) deleted from incident ${req.params.incidentId}.`,
      "incident_evidence",
      evidenceId,
      req.ip || "unknown",
      req.headers["user-agent"] || "unknown"
    );

    db.prepare("DELETE FROM incident_evidence WHERE id = ?").run(evidenceId);

    // Also remove file from disk
    const filePath = path.join(EVIDENCE_DIR, row.file_url);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
