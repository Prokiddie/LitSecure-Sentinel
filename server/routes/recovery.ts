import { Router } from "express";
import db, { generateId } from "../db/index.js";

const router = Router();

// Simulated list of snapshots
const SNAPSHOTS = [
  { id: "SNP-001", timestamp: "2026-06-14T00:00:00Z", type: "Automated", description: "Daily midnight database backup", size: "12.4 MB", status: "Verified" },
  { id: "SNP-002", timestamp: "2026-06-14T12:00:00Z", type: "Automated", description: "Mid-day differential synchronization snapshot", size: "12.6 MB", status: "Verified" }
];

// GET /api/recovery/snapshots
router.get("/snapshots", (req, res) => {
  return res.json(SNAPSHOTS);
});

// POST /api/recovery/snapshot
router.post("/snapshot", (req, res) => {
  const { description } = req.body;
  
  const now = new Date().toISOString();
  const newSnapshot = {
    id: generateId("SNP"),
    timestamp: now,
    type: "Manual",
    description: description || "User-triggered manual snapshot",
    size: "12.8 MB",
    status: "Verified"
  };

  SNAPSHOTS.unshift(newSnapshot);

  // Add Audit Log
  db.prepare("INSERT INTO audit_logs (id,timestamp,user_name,user_role,action,details,entity_type,entity_id) VALUES (?,?,?,?,?,?,?,?)")
    .run(
      generateId("aud"), 
      now, 
      req.user?.name || "Sentinel Super Admin", 
      req.user?.role || "admin", 
      "Database Backup Snapshot Created", 
      `Manually backup created: '${newSnapshot.description}'`, 
      "recovery", 
      newSnapshot.id
    );

  return res.status(201).json({ success: true, snapshot: newSnapshot });
});

// POST /api/recovery/restore
router.post("/restore", (req, res) => {
  const { snapshotId } = req.body;
  if (!snapshotId) {
    return res.status(400).json({ error: "BAD_REQUEST", message: "snapshotId is required." });
  }

  const snapshot = SNAPSHOTS.find(s => s.id === snapshotId);
  if (!snapshot) {
    return res.status(404).json({ error: "NOT_FOUND", message: "Backup snapshot file not found." });
  }

  const now = new Date().toISOString();
  
  // Simulate restoring database state (Zomba Council database set back to Operational)
  try {
    db.prepare("UPDATE critical_assets SET status = 'Operational', risk_score = 35 WHERE id = 'AST-004'").run();
    
    // Add Audit Log
    db.prepare("INSERT INTO audit_logs (id,timestamp,user_name,user_role,action,details,entity_type,entity_id) VALUES (?,?,?,?,?,?,?,?)")
      .run(
        generateId("aud"), 
        now, 
        req.user?.name || "Sentinel Super Admin", 
        req.user?.role || "admin", 
        "Database Recovery Restored", 
        `Restored database cluster state using backup ${snapshotId} (${snapshot.description}).`, 
        "recovery", 
        snapshotId
      );

    return res.json({ success: true, message: `Successfully recovered system database registry to state recorded on ${snapshot.timestamp}.` });
  } catch (err) {
    console.error("Recovery failed:", err);
    return res.status(500).json({ error: "DB_ERROR", message: "Database restore failed." });
  }
});

export default router;
