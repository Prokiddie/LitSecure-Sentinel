import { Router } from "express";
import { db, generateId } from "../db/index.js";

const router = Router();

// Simulated list of endpoints / assets
const ENDPOINTS = [
  { id: "EP-01", hostname: "MDF-HQ-DESKTOP-09", ip: "10.201.4.15", os: "Windows 11 Pro", status: "Protected", vulnerabilities: 3, lastScan: "2026-06-14T20:00:00Z" },
  { id: "EP-02", hostname: "STDBANK-CORE-SRV", ip: "10.102.1.200", os: "RedHat Enterprise Linux 9", status: "Protected", vulnerabilities: 1, lastScan: "2026-06-14T21:30:00Z" },
  { id: "EP-03", hostname: "MACRA-ADMIN-LAP-04", ip: "192.168.8.44", os: "macOS Sonoma", status: "Protected", vulnerabilities: 0, lastScan: "2026-06-14T18:45:00Z" },
  { id: "EP-04", hostname: "ZOMBA-TREASURY-01", ip: "172.16.45.10", os: "Windows Server 2022", status: "Vulnerable", vulnerabilities: 8, lastScan: "2026-06-11T02:00:00Z" },
  { id: "EP-05", hostname: "AIRTEL-GATEWAY-RT", ip: "10.99.1.1", os: "Cisco IOS-XE", status: "Protected", vulnerabilities: 2, lastScan: "2026-06-14T22:00:00Z" }
];

// Simulated list of active threats
let THREATS = [
  { id: "THR-001", name: "Trojan.MpambaSpoofer.B", file: "C:\\ProgramData\\MpambaVerify.exe", endpoint: "MDF-HQ-DESKTOP-09", severity: "High", status: "Quarantined" },
  { id: "THR-002", name: "Ransomware.Locky.MalawiCrypt", file: "D:\\Shared\\TreasuryData.db.malawicrypt", endpoint: "ZOMBA-TREASURY-01", severity: "Critical", status: "Active" },
  { id: "THR-003", name: "Spyware.KeyLogger.Generic", file: "/usr/local/bin/sshd_monitor", endpoint: "STDBANK-CORE-SRV", severity: "Medium", status: "Intercepted" }
];

// Simulated list of network packets
const PACKETS = [
  { timestamp: "22:31:01", protocol: "TCP", source: "192.168.8.44", destination: "10.201.4.15", length: 64, info: "Standard handshake [SYN]", isMalicious: false },
  { timestamp: "22:31:02", protocol: "HTTP", source: "198.51.100.82", destination: "10.102.1.200", length: 512, info: "POST /api/v1/auth/login SQLi patterns detected", isMalicious: true },
  { timestamp: "22:31:05", protocol: "UDP", source: "10.99.1.1", destination: "8.8.8.8", length: 78, info: "Standard DNS Query - macra.mw", isMalicious: false },
  { timestamp: "22:31:08", protocol: "TCP", source: "41.221.72.109", destination: "172.16.45.10", length: 1420, info: "Ransomware signature payout request transmission", isMalicious: true },
  { timestamp: "22:31:12", protocol: "ICMP", source: "10.201.4.15", destination: "10.99.1.1", length: 32, info: "Echo Request (Ping)", isMalicious: false }
];

// GET /api/edr/endpoints
router.get("/endpoints", (req, res) => {
  return res.json(ENDPOINTS);
});

// GET /api/edr/threats
router.get("/threats", (req, res) => {
  return res.json(THREATS);
});

// GET /api/edr/packets
router.get("/packets", (req, res) => {
  return res.json(PACKETS);
});

// POST /api/edr/scan
router.post("/scan", (req, res) => {
  // Simulate EDR scan across all assets
  const now = new Date().toISOString();
  ENDPOINTS.forEach(e => {
    e.lastScan = now;
    if (e.id === "EP-04") {
      e.status = "Protected"; // Vulnerability scanned and mitigated during EDR run
      e.vulnerabilities = 1;
    }
  });

  // Resolve active threats that can be auto-cleaned
  THREATS = THREATS.map(t => {
    if (t.status === "Active") {
      return { ...t, status: "Cleaned" };
    }
    return t;
  });

  // Log audit event
  db.prepare("INSERT INTO audit_logs (id,timestamp,user_name,user_role,action,details,entity_type,entity_id) VALUES (?,?,?,?,?,?,?,?)")
    .run(generateId("aud"), now, req.user?.name || "Sentinel Analyst", req.user?.role || "analyst", "EDR Active Scan triggered", "Scanned all connected endpoint nodes. Resolved 1 active threat.", "edr", "all");

  return res.json({ success: true, message: "EDR scan successfully executed across 5 active endpoint computers." });
});

// POST /api/edr/action
router.post("/action", (req, res) => {
  const { threatId, action } = req.body; // quarantine | clean | delete
  
  const threatIndex = THREATS.findIndex(t => t.id === threatId);
  if (threatIndex === -1) {
    return res.status(404).json({ error: "NOT_FOUND", message: "Threat signature not found." });
  }

  let status = "Quarantined";
  if (action === "clean") status = "Cleaned";
  if (action === "delete") status = "Deleted";

  THREATS[threatIndex].status = status;

  // Log audit event
  const now = new Date().toISOString();
  db.prepare("INSERT INTO audit_logs (id,timestamp,user_name,user_role,action,details,entity_type,entity_id) VALUES (?,?,?,?,?,?,?,?)")
    .run(generateId("aud"), now, req.user?.name || "Sentinel SOC Manager", req.user?.role || "analyst", `EDR threat action: ${action}`, `Executed EDR cleanup action '${action}' on threat ${threatId} (${THREATS[threatIndex].name})`, "threat", threatId);

  return res.json({ success: true, threat: THREATS[threatIndex] });
});

export default router;
