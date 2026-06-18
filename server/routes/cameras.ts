import { Router } from "express";
import { queries, mapCamera, generateId } from "../db/index.js";
import { requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { registerCameraSchema } from "../schemas/index.js";

const router = Router();

// GET /api/cameras
router.get("/", (req, res) => {
  return res.json((queries.getAllCameras.all() as any[]).map(mapCamera));
});

// POST /api/cameras/register
router.post("/register", requireRole("admin", "analyst"), validate(registerCameraSchema), (req, res) => {
  const { name, rtspUrl, siteId, resolution, model, aiDetectionFlags } = req.body;
  const id = generateId("CAM");
  const cam = {
    id, name,
    rtsp_url: rtspUrl,
    status: "Online",
    site_id: siteId,
    is_recording: 0,
    ai_detection_flags: JSON.stringify(aiDetectionFlags || ["MOTION"]),
    resolution: resolution || "1080p",
    model: model || "LIT-Eye Standard",
  };
  queries.insertCamera.run(cam);
  queries.insertAuditLog.run({
    id: generateId("aud"),
    timestamp: new Date().toISOString(),
    user_name: req.user?.name || "Operator",
    user_role: req.user?.role || "analyst",
    action: "CCTV Registered",
    details: `Camera node [${name}] initialized with RTSP feed handshake established.`,
    entity_type: "camera",
    entity_id: id,
  });
  return res.status(201).json(mapCamera(queries.getCameraById.get(id) as any));
});

// POST /api/cameras/:cameraId/activate
router.post("/:cameraId/activate", requireRole("admin", "analyst"), (req, res) => {
  const cam = queries.getCameraById.get(req.params.cameraId) as any;
  if (!cam) return res.status(404).json({ error: "NOT_FOUND", message: "Camera not found." });
  queries.updateCameraStatus.run({ id: cam.id, status: "Online", is_recording: cam.is_recording });
  queries.insertAuditLog.run({
    id: generateId("aud"), timestamp: new Date().toISOString(),
    user_name: req.user?.name || "Operator", user_role: req.user?.role || "analyst",
    action: "CCTV Activated", details: `Remotely activated camera: ${cam.name} (${cam.id})`,
    entity_type: "camera", entity_id: cam.id,
  });
  return res.json(mapCamera({ ...cam, status: "Online" }));
});

// POST /api/cameras/:cameraId/deactivate
router.post("/:cameraId/deactivate", requireRole("admin", "analyst"), (req, res) => {
  const cam = queries.getCameraById.get(req.params.cameraId) as any;
  if (!cam) return res.status(404).json({ error: "NOT_FOUND", message: "Camera not found." });
  queries.updateCameraStatus.run({ id: cam.id, status: "Offline", is_recording: 0 });
  queries.insertAuditLog.run({
    id: generateId("aud"), timestamp: new Date().toISOString(),
    user_name: req.user?.name || "Operator", user_role: req.user?.role || "analyst",
    action: "CCTV Deactivated", details: `Deactivated camera node: ${cam.name} (${cam.id})`,
    entity_type: "camera", entity_id: cam.id,
  });
  return res.json(mapCamera({ ...cam, status: "Offline", is_recording: 0 }));
});

// POST /api/cameras/:cameraId/record
router.post("/:cameraId/record", requireRole("admin", "analyst"), (req, res) => {
  const cam = queries.getCameraById.get(req.params.cameraId) as any;
  if (!cam) return res.status(404).json({ error: "NOT_FOUND", message: "Camera not found." });
  if (cam.status === "Offline") {
    return res.status(400).json({ error: "CAMERA_OFFLINE", message: "Cannot toggle recording on an offline camera." });
  }
  const newRecording = cam.is_recording === 1 ? 0 : 1;
  queries.updateCameraStatus.run({ id: cam.id, status: cam.status, is_recording: newRecording });
  return res.json(mapCamera({ ...cam, is_recording: newRecording }));
});

export default router;
