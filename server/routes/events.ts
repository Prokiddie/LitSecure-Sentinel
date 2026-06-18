import { Router } from "express";
import { db, queries, generateId } from "../db/index.js";

const router = Router();

// GET /api/events
router.get("/", (req, res) => {
  const rows = queries.getAllEvents.all() as any[];
  return res.json(rows.map(r => ({
    id: r.id, type: r.type, timestamp: r.timestamp, severity: r.severity,
    location: r.location, status: r.status, details: r.details, cameraId: r.camera_id,
  })));
});

// POST /api/events/:id/acknowledge
router.post("/:eventId/acknowledge", (req, res) => {
  const ev = queries.getEventById.get(req.params.eventId) as any;
  if (!ev) return res.status(404).json({ error: "NOT_FOUND", message: "Event not found." });
  queries.acknowledgeEvent.run(ev.id);
  db.prepare("INSERT INTO simulated_logs (id,timestamp,source,event,severity,details,indicator) VALUES (?,?,?,?,?,?,?)")
    .run(generateId("log"), new Date().toISOString(), "Malawi Gov Gateway", "Security Alarm Cleared", "clean", `Staff acknowledged and locked down event case ${ev.id}.`, ev.id);
  return res.json({ ...ev, status: "Acknowledged" });
});

// POST /api/events/trigger — simulate new random security alert
router.post("/trigger", (req, res) => {
  const allCams = (queries.getAllCameras.all() as any[]).filter(c => c.status === "Online");
  if (allCams.length === 0) return res.status(400).json({ error: "ALL_OFFLINE", message: "All CCTV nodes are currently offline." });

  const targetCam  = allCams[Math.floor(Math.random() * allCams.length)];
  const allSites   = queries.getAllSites.all() as any[];
  const targetSite = allSites.find(s => s.id === targetCam.site_id) || allSites[0];

  const types = ["MOTION_DETECTED", "INTRUSION_ALERT", "FACE_MATCH", "TAMPER_ALERT"] as const;
  const randomType = types[Math.floor(Math.random() * types.length)];

  let severity: string = "Medium";
  let details  = "";

  switch (randomType) {
    case "INTRUSION_ALERT":
      severity = "Critical";
      details  = `Intrusion barrier breach tracked at ${targetSite.name}. Multi-vector motion trigger on ${targetCam.name}.`;
      break;
    case "FACE_MATCH":
      severity = "High";
      details  = `Blacklisted face matching index positive (94.2% correlation score) recorded in ${targetCam.name} corridor.`;
      break;
    case "TAMPER_ALERT":
      severity = "High";
      details  = `Lens obscure or hardware tilt detected on ${targetCam.name} (Camera Tampering alarm).`;
      break;
    default:
      severity = "Low";
      details  = `Minor motion detected on ${targetCam.name} during expected low-traffic hours.`;
  }

  const newEvent = {
    id: generateId("EVT"),
    type: randomType,
    timestamp: new Date().toISOString(),
    severity,
    location: targetSite.name,
    status: "Airing",
    details,
    camera_id: targetCam.id,
  };

  queries.insertEvent.run(newEvent);

  db.prepare("INSERT INTO simulated_logs (id,timestamp,source,event,severity,details,indicator) VALUES (?,?,?,?,?,?,?)")
    .run(generateId("log"), new Date().toISOString(), targetSite.org_id, randomType.replace("_", " "), severity === "Critical" ? "malicious" : "suspicious", details, targetCam.id);

  if (randomType === "INTRUSION_ALERT") {
    queries.insertAccessLog.run({ id: generateId("ACS"), timestamp: new Date().toISOString(), device_name: `${targetCam.name} Smart Gate`, device_type: "Smart Lock", user_name: "Unknown Suspect", action: "Force Door Break Alarm", status: "Denied" });
  }

  return res.status(201).json({ ...newEvent, cameraId: newEvent.camera_id });
});

// GET /api/access/logs
router.get("/access/logs", (req, res) => {
  const rows = queries.getAllAccessLogs.all() as any[];
  return res.json(rows.map(r => ({ id: r.id, timestamp: r.timestamp, deviceName: r.device_name, deviceType: r.device_type, user: r.user_name, action: r.action, status: r.status })));
});

export default router;
