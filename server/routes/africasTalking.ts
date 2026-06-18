/**
 * LitSecure Sentinel — Africa's Talking Routes
 * Handles: SMS API, USSD webhook, OTP endpoints, admin broadcast
 */
import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  isConfigured,
  getConfig,
  sendSMS,
  sendOTP,
  verifyOTP,
  handleUSSD,
  smsAlertAnalysts,
  smsCampaignAlert,
  smsLockdownAlert,
  smsCitizenReceipt,
} from "../services/africasTalking.js";
import db from "../db/index.js";
import crypto from "crypto";

const router = Router();

// ─── GET /api/at/status ───────────────────────────────────────────────────────
// Check AT configuration and connection health
router.get("/status", requireAuth, (_req, res) => {
  const config = getConfig();
  res.json({
    configured:  config.configured,
    sandbox:     config.sandbox,
    username:    config.configured ? config.username : "NOT SET",
    senderId:    config.senderId,
    ussdCode:    config.ussdCode,
    services: {
      sms:       config.configured,
      ussd:      config.configured,
      otp:       config.configured,
    },
    setupInstructions: config.configured ? null : {
      step1: "Add to your .env file:",
      vars: [
        "AT_API_KEY=your_key_from_africastalking.com",
        "AT_USERNAME=your_username (use 'sandbox' for testing)",
        "AT_SENDER_ID=LitSecure",
        "AT_USSD_CODE=*860#",
      ],
      step2: "Restart the server after adding .env variables.",
    },
  });
});

// ─── POST /api/at/sms/send ────────────────────────────────────────────────────
// Manual SMS send (admin/SOC only)
router.post("/sms/send", requireAuth, async (req, res) => {
  const allowedRoles = ["admin", "soc_manager", "gov_admin", "super_admin"];
  if (!allowedRoles.includes(req.user!.role)) {
    return res.status(403).json({ message: "Insufficient permissions to send SMS." });
  }

  const { to, message } = req.body;
  if (!to || !message) {
    return res.status(400).json({ message: "to (phone or array) and message are required." });
  }

  const result = await sendSMS(to, message);

  // Audit log
  try {
    db.prepare(`
      INSERT INTO audit_logs (id, timestamp, user_name, user_role, action, details, entity_type, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `AUD-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
      new Date().toISOString(),
      req.user!.name || req.user!.email,
      req.user!.role,
      "SMS_SENT",
      `Manual SMS sent to ${Array.isArray(to) ? to.length + " recipients" : to}. OK: ${result.ok}`,
      "sms",
      req.ip || "unknown",
      req.headers["user-agent"] || "unknown"
    );
  } catch {}

  res.json(result);
});

// ─── POST /api/at/sms/broadcast ───────────────────────────────────────────────
// Broadcast SMS to all users with a given role
router.post("/sms/broadcast", requireAuth, async (req, res) => {
  if (!["admin", "super_admin", "gov_admin"].includes(req.user!.role)) {
    return res.status(403).json({ message: "Only Super Admin or Gov Admin can broadcast SMS." });
  }

  const { message, targetRoles } = req.body;
  if (!message || !targetRoles?.length) {
    return res.status(400).json({ message: "message and targetRoles[] are required." });
  }

  // Get phone numbers from DB for the target roles
  try {
    const placeholders = targetRoles.map(() => "?").join(",");
    const users = db.prepare(
      `SELECT phone FROM users WHERE role IN (${placeholders}) AND is_active = 1 AND phone IS NOT NULL`
    ).all(...targetRoles) as { phone: string }[];

    const phones = users.map(u => u.phone).filter(Boolean);

    if (!phones.length) {
      return res.json({ ok: false, message: "No users with phone numbers found for the specified roles." });
    }

    const result = await sendSMS(phones, message);
    res.json({ ...result, totalPhones: phones.length });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// ─── POST /api/at/otp/send ────────────────────────────────────────────────────
// Send OTP for MFA (called during login flow)
router.post("/otp/send", async (req, res) => {
  const { phone, purpose } = req.body;
  if (!phone) return res.status(400).json({ message: "phone is required." });

  const result = await sendOTP(phone, purpose || "login");

  // Return only success/fail — NEVER return the OTP itself
  res.json({
    ok:      result.ok,
    message: result.ok
      ? `OTP sent to ${phone.replace(/\d(?=\d{4})/g, "*")}.`
      : result.message,
  });
});

// ─── POST /api/at/otp/verify ──────────────────────────────────────────────────
// Verify OTP entered by user
router.post("/otp/verify", async (req, res) => {
  const { phone, code } = req.body;
  if (!phone || !code) {
    return res.status(400).json({ message: "phone and code are required." });
  }

  const result = verifyOTP(phone, code);
  if (result.valid) {
    res.json({ ok: true, message: "OTP verified successfully." });
  } else {
    res.status(401).json({ ok: false, message: result.reason });
  }
});

// ─── POST /api/at/sms/receipt ─────────────────────────────────────────────────
// Send confirmation SMS to citizen after incident submission
router.post("/sms/receipt", requireAuth, async (req, res) => {
  const { phone, referenceId, category } = req.body;
  if (!phone || !referenceId) {
    return res.status(400).json({ message: "phone and referenceId are required." });
  }

  const result = await smsCitizenReceipt(phone, referenceId, category || "incident");
  res.json(result);
});

// ─── POST /api/at/sms/incident-alert ─────────────────────────────────────────
// Alert analysts when a critical incident is created
router.post("/sms/incident-alert", requireAuth, async (req, res) => {
  const { phones, incidentId, title, severity } = req.body;
  if (!phones?.length || !incidentId || !title) {
    return res.status(400).json({ message: "phones[], incidentId, title are required." });
  }

  const result = await smsAlertAnalysts(phones, incidentId, title, severity || "High");
  res.json(result);
});

// ─── POST /api/at/sms/campaign-alert ─────────────────────────────────────────
// Alert SOC on campaign detection
router.post("/sms/campaign-alert", requireAuth, async (req, res) => {
  const { phones, campaignName, riskScore, sectors } = req.body;
  if (!phones?.length || !campaignName) {
    return res.status(400).json({ message: "phones[], campaignName are required." });
  }

  const result = await smsCampaignAlert(phones, campaignName, riskScore || 0, sectors || []);
  res.json(result);
});

// ─── POST /api/at/ussd ────────────────────────────────────────────────────────
// Africa's Talking USSD webhook — NO AUTH (public endpoint, AT calls this)
// Configure this URL in AT Dashboard: https://yourdomain.com/api/at/ussd
router.post("/ussd", (req, res) => {
  const { sessionId, serviceCode, phoneNumber, text } = req.body;

  if (!sessionId || !phoneNumber) {
    return res.status(400).send("END Invalid USSD request.");
  }

  const response = handleUSSD({ sessionId, serviceCode, phoneNumber, text: text || "" });

  // AT requires plain text response, not JSON
  res.set("Content-Type", "text/plain");
  res.send(response);
});

// ─── POST /api/at/sms/incoming ────────────────────────────────────────────────
// Africa's Talking SMS incoming callback (citizen SMSes in a report)
// Configure this URL in AT Dashboard: https://yourdomain.com/api/at/sms/incoming
router.post("/sms/incoming", (req, res) => {
  const { from, text, date } = req.body;

  console.log(`[AT] Incoming SMS from ${from}: ${text}`);

  // Simple keyword parsing for citizen reports via SMS
  const lower = (text || "").toLowerCase().trim();
  let category = "Other Cyber Crime";

  if (lower.includes("sim swap") || lower.includes("simswap"))             category = "SIM Swap";
  else if (lower.includes("fraud") || lower.includes("scam"))              category = "Mobile Money Fraud";
  else if (lower.includes("phishing") || lower.includes("fake link"))      category = "Phishing";
  else if (lower.includes("hacked") || lower.includes("account taken"))    category = "Account Takeover";

  // TODO: queue for full incident creation via incidents API
  const refId = `LIT-SMS-${Date.now().toString().slice(-6)}`;

  // Send acknowledgement back
  smsCitizenReceipt(from, refId, category).catch(console.error);

  console.log(`[AT] Auto-created SMS report: ${refId} | ${category} | from ${from}`);

  res.json({ ok: true, referenceId: refId, category });
});

export default router;
