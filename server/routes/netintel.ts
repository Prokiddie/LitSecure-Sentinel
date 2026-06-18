/**
 * LitSecure Sentinel — Network Intelligence API Routes
 *
 * Endpoints:
 *   GET  /api/netintel/fingerprints          → All cached OS fingerprints
 *   POST /api/netintel/fingerprint            → Fingerprint a specific IP (or current request IP)
 *   POST /api/netintel/vpn                   → VPN/TOR/proxy detection for an IP
 *   GET  /api/netintel/vlan/alerts           → Recent VLAN hopping alerts
 *   GET  /api/netintel/vlan/stats            → VLAN alert type statistics
 *   POST /api/netintel/vlan/simulate         → Simulate a VLAN attack (demo)
 *   POST /api/netintel/vlan/resolve/:id      → Mark a VLAN alert as resolved
 *   POST /api/netintel/vlan/packet           → Ingest a VLAN packet event
 *   POST /api/netintel/analyze               → Combined threat analysis for an IP
 */

import { Router, Request, Response } from "express";
import { validate } from "../middleware/validate.js";
import {
  fingerprintSchema,
  vpnDetectSchema,
  netAnalyzeSchema,
  vlanSimulateSchema,
} from "../schemas/index.js";
import {
  fingerprintFromRequest,
  getAllFingerprints,
  getFingerprint,
  analyzePacketData,
} from "../services/osFingerprint.js";
import { detectVPN }          from "../services/vpnDetection.js";
import {
  getRecentAlerts,
  getAllVLANAlerts,
  getVLANStats,
  resolveAlert,
  simulateVLANEvent,
  analyzeVLANPacket,
  type VLANAlertType,
} from "../services/vlanDetection.js";

const router = Router();

// ─── Helper: extract real IP ─────────────────────────────────────────────────
function realIP(req: Request): string {
  return (
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
    || req.socket.remoteAddress
    || "127.0.0.1"
  );
}

// ─── GET /api/netintel/fingerprints ──────────────────────────────────────────
router.get("/fingerprints", (_req: Request, res: Response) => {
  const fps = getAllFingerprints();
  return res.json({ count: fps.length, fingerprints: fps });
});

// ─── POST /api/netintel/fingerprint ─────────────────────────────────────────────────────────────
router.post("/fingerprint", validate(fingerprintSchema), async (req: Request, res: Response) => {
  const { target: ip } = req.body;
  const targetIP = ip || realIP(req);

  const cached = getFingerprint(targetIP);
  if (cached) return res.json({ cached: true, fingerprint: cached });

  const { ttl, windowSize, userAgent } = req.body;
  if (ttl !== undefined && windowSize !== undefined) {
    const fp = analyzePacketData({
      srcIP:      targetIP,
      ttl:        Number(ttl),
      windowSize: Number(windowSize),
      userAgent:  userAgent || (req.headers["user-agent"] as string),
    });
    if (fp) return res.json({ cached: false, fingerprint: fp });
  }

  const fp = fingerprintFromRequest(targetIP, req.headers as Record<string, string>);
  return res.json({ cached: false, fingerprint: fp });
});

// ─── POST /api/netintel/vpn ────────────────────────────────────────────────────────────────────
router.post("/vpn", validate(vpnDetectSchema), async (req: Request, res: Response) => {
  const { ip } = req.body;
  try {
    const result = await detectVPN(ip);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: "Detection failed", message: err.message });
  }
});

// ─── POST /api/netintel/analyze (combined) ────────────────────────────────────
// Body: { ip: string, ttl?: number, windowSize?: number }
router.post("/analyze", async (req: Request, res: Response) => {
  const { ip, ttl, windowSize } = req.body ?? {};
  const targetIP = ip || realIP(req);

  try {
    // Run OS fingerprint + VPN detection in parallel
    const [vpnResult, osFP] = await Promise.all([
      detectVPN(targetIP),
      Promise.resolve(
        ttl && windowSize
          ? analyzePacketData({ srcIP: targetIP, ttl: Number(ttl), windowSize: Number(windowSize) })
          : fingerprintFromRequest(targetIP, req.headers as Record<string, string>)
      ),
    ]);

    const vlanHopping = req.body?.checkVLAN
      ? getRecentAlerts(5).filter(a => a.sourceIP === targetIP)
      : [];

    // Composite risk score
    let riskScore = 0;
    const flags: string[] = [];

    if (osFP) {
      if (osFP.os === "Unknown" || osFP.confidence < 0.5) { riskScore += 15; flags.push("Unidentified OS"); }
      osFP.behaviorPatterns.forEach(b => flags.push(b));
    }
    if (vpnResult.isVPN)    { riskScore += 30; flags.push(`VPN: ${vpnResult.provider || "unknown"}`); }
    if (vpnResult.isTOR)    { riskScore += 40; flags.push("TOR exit node"); }
    if (vpnResult.isProxy)  { riskScore += 25; flags.push("Proxy / anonymizer"); }
    if (vpnResult.cveTunnelvision) { riskScore += 20; flags.push("CVE-2024-3661 TunnelVision indicator"); }
    if (vlanHopping.length) { riskScore += 35; flags.push(`Active VLAN hopping: ${vlanHopping.length} alerts`); }

    const riskLevel = riskScore >= 80 ? "CRITICAL"
      : riskScore >= 55 ? "HIGH"
      : riskScore >= 30 ? "MEDIUM"
      : "LOW";

    const recommendations: string[] = [];
    if (vpnResult.isVPN)          recommendations.push("Correlate VPN exit-node with known threat actor IPs");
    if (vpnResult.cveTunnelvision)recommendations.push("Enable DHCP snooping; enforce network namespace isolation on VPN endpoints");
    if (vlanHopping.length)       recommendations.push("Immediately isolate the source MAC; review trunk port configuration");
    if (osFP?.family === "Unknown")recommendations.push("Capture additional packets for deeper TCP/IP analysis");
    if (vpnResult.distanceKm && vpnResult.distanceKm > 5000)
      recommendations.push(`Geolocation anomaly: IP is ${vpnResult.distanceKm} km from Malawi — likely spoofed origin`);

    return res.json({
      ip:              targetIP,
      osFingerprint:   osFP,
      vpnDetection:    vpnResult,
      vlanAlerts:      vlanHopping,
      riskScore:       Math.min(riskScore, 100),
      riskLevel,
      flags,
      recommendations,
      analyzedAt:      new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("[netintel/analyze] error:", err.message);
    return res.status(500).json({ error: "Analysis failed", message: err.message });
  }
});

// ─── GET /api/netintel/vlan/alerts ───────────────────────────────────────────
router.get("/vlan/alerts", (req: Request, res: Response) => {
  const minutes = parseInt((req.query.minutes as string) || "60", 10);
  const all     = req.query.all === "true";
  const data    = all ? getAllVLANAlerts() : getRecentAlerts(minutes);
  return res.json({ count: data.length, alerts: data });
});

// ─── GET /api/netintel/vlan/stats ─────────────────────────────────────────────
router.get("/vlan/stats", (_req: Request, res: Response) => {
  return res.json(getVLANStats());
});

// ─── POST /api/netintel/vlan/simulate ────────────────────────────────────────
// Body: { type: VLANAlertType }
router.post("/vlan/simulate", validate(vlanSimulateSchema), (req: Request, res: Response) => {
  const type = req.body.type as VLANAlertType;
  const newAlerts = simulateVLANEvent(type);
  return res.json({ simulated: newAlerts.length, alerts: newAlerts });
});

// ─── POST /api/netintel/vlan/resolve/:id ─────────────────────────────────────
router.post("/vlan/resolve/:id", (req: Request, res: Response) => {
  const ok = resolveAlert(req.params.id);
  if (!ok) return res.status(404).json({ error: "Alert not found" });
  return res.json({ success: true, id: req.params.id });
});

// ─── POST /api/netintel/vlan/packet ──────────────────────────────────────────
// Body: VLANPacketEvent
router.post("/vlan/packet", (req: Request, res: Response) => {
  try {
    const pkt = req.body;
    const newAlerts = analyzeVLANPacket(pkt);
    return res.json({ alertsGenerated: newAlerts.length, alerts: newAlerts });
  } catch (err: any) {
    return res.status(400).json({ error: "Invalid packet data", message: err.message });
  }
});

export default router;
