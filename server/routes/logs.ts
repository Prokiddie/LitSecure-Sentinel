import { Router } from "express";
import { queryAll, queryRun, generateId } from "../db/index.js";

const router = Router();

type LogSource = 'TNM Mpamba' | 'Airtel Money' | 'Standard Bank MW' | 'Airtel Network' | 'National Bank MW' | 'FDH Bank' | 'Malawi Gov Gateway' | 'Skyband ISP';

const SOURCES: LogSource[] = ["TNM Mpamba", "Airtel Money", "Standard Bank MW", "Airtel Network", "National Bank MW", "FDH Bank", "Malawi Gov Gateway", "Skyband ISP"];
const EVENT_TEMPLATES = [
  { event: "Port Sweep Wave",                   details: "Rapid access attempts scanning high system entry ports",                     severity: "suspicious", indPrfx: "192.168.12." },
  { event: "Unregistered SIM Pin Request",       details: "SIM attempting offline cash transfer without registration card",            severity: "malicious",  indPrfx: "+2658883" },
  { event: "Repeated SQL Injection Probe",       details: "Web input passing character arrays, system scrubbed access",               severity: "suspicious", indPrfx: "41.139." },
  { event: "Bulk Merchant Transfer Initiated",   details: "Standard wallet transactions verifying bulk payout schedules",             severity: "clean",      indPrfx: "+265992" },
  { event: "Unauthorized API Key Usage",         details: "Unknown application using production API key outside authorized IP range", severity: "malicious",  indPrfx: "197.158." },
];

// GET /api/logs
router.get("/", async (req, res) => {
  try {
    const logs = await queryAll("SELECT * FROM simulated_logs ORDER BY timestamp DESC LIMIT 50");
    return res.json(logs);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// POST /api/logs/generate — simulate new random log entry
router.post("/generate", async (req, res) => {
  try {
    const src = SOURCES[Math.floor(Math.random() * SOURCES.length)];
    const ev  = EVENT_TEMPLATES[Math.floor(Math.random() * EVENT_TEMPLATES.length)];

    const newLog = {
      id: generateId("LOG"),
      timestamp: new Date().toISOString(),
      source: src,
      event: ev.event,
      severity: ev.severity,
      details: `${ev.details} on local integration branch.`,
      indicator: `${ev.indPrfx}${Math.floor(10 + Math.random() * 89)}`,
    };

    await queryRun(`
      INSERT INTO simulated_logs (id,timestamp,source,event,severity,details,indicator)
      VALUES (@id,@timestamp,@source,@event,@severity,@details,@indicator)
    `, newLog);
    
    return res.status(201).json(newLog);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

export default router;
