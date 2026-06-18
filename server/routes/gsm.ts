import { Router } from "express";
import { db, generateId } from "../db/index.js";
import { notifySimSwapCluster } from "../services/notifications.js";

const router = Router();

// GET /api/gsm/ussd-logs
router.get("/ussd-logs", (req, res) => {
  try {
    const alerts = db.prepare("SELECT * FROM telecom_alerts ORDER BY timestamp DESC").all();
    return res.json(alerts);
  } catch (err) {
    console.error("Failed to query telecom alerts:", err);
    return res.status(500).json({ error: "DB_ERROR", message: "Failed to fetch telecom alerts." });
  }
});

// POST /api/gsm/block-swap
router.post("/block-swap", (req, res) => {
  const { alertId } = req.body;
  if (!alertId) {
    return res.status(400).json({ error: "BAD_REQUEST", message: "alertId is required." });
  }

  const now = new Date().toISOString();
  try {
    const row = db.prepare("SELECT * FROM telecom_alerts WHERE id = ?").get(alertId) as any;
    if (!row) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Telecom alert signature not found." });
    }

    db.prepare("UPDATE telecom_alerts SET status = 'Intercepted' WHERE id = ?").run(alertId);

    // ── SIM Swap Cluster Detection ──────────────────────────────────────────────────
    try {
      const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // last hour
      const activeCluster = (db.prepare(
        "SELECT COUNT(*) as c, source FROM telecom_alerts WHERE alert_type LIKE '%SIM%' AND timestamp > ? GROUP BY source ORDER BY c DESC LIMIT 1"
      ).get(cutoff) as any);
      const clusterCount = activeCluster?.c ?? 0;
      if (clusterCount >= 3) {
        notifySimSwapCluster(clusterCount, activeCluster.source || row.source || "Unknown Operator");
      }
    } catch {}

    // Add Audit Log
    db.prepare("INSERT INTO audit_logs (id,timestamp,user_name,user_role,action,details,entity_type,entity_id) VALUES (?,?,?,?,?,?,?,?)")
      .run(
        generateId("aud"), 
        now, 
        req.user?.name || "Sentinel SOC Manager", 
        req.user?.role || "analyst", 
        "GSM / USSD SIM Swap Blocked", 
        `Triggered telecom carrier override to block active SIM swap on ${row.phone_number} (Carrier: ${row.source}).`, 
        "telecom_alert", 
        alertId
      );

    return res.json({ success: true, message: `Successfully isolated node and blocked SIM swap on ${row.phone_number}.` });
  } catch (err) {
    console.error("Failed to block SIM swap:", err);
    return res.status(500).json({ error: "DB_ERROR", message: "Database operation failed." });
  }
});

export default router;
