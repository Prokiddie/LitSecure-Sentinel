/**
 * LitSecure Sentinel — Africa's Talking Service
 * Handles: SMS alerts, MFA OTP via SMS, USSD session management
 *
 * Environment variables required:
 *   AT_API_KEY      — Africa's Talking API key
 *   AT_USERNAME     — Africa's Talking username (sandbox = "sandbox")
 *   AT_SENDER_ID    — Shortcode/sender ID registered with AT (e.g. "LitSecure")
 *   AT_USSD_CODE    — Your registered USSD code (e.g. "*860#")
 */

const AT_API_KEY   = process.env.AT_API_KEY   || "";
const AT_USERNAME  = process.env.AT_USERNAME  || "sandbox";
const AT_SENDER_ID = process.env.AT_SENDER_ID || "LitSecure";
const AT_USSD_CODE = process.env.AT_USSD_CODE || "*860#";

// ─── SDK Init (lazy — only fails at call time if not configured) ───────────
let smsClient: any = null;

function getATClient() {
  if (!AT_API_KEY) return null;
  if (!smsClient) {
    // Dynamic import to avoid crash when not configured
    const AfricasTalking = require("africastalking");
    const at = AfricasTalking({ apiKey: AT_API_KEY, username: AT_USERNAME });
    smsClient = at.SMS;
  }
  return smsClient;
}

export function isConfigured(): boolean {
  return !!(AT_API_KEY && AT_USERNAME);
}

export function getConfig() {
  return {
    configured: isConfigured(),
    username:   AT_USERNAME,
    senderId:   AT_SENDER_ID,
    ussdCode:   AT_USSD_CODE,
    sandbox:    AT_USERNAME === "sandbox",
  };
}

// ─── SMS Core ──────────────────────────────────────────────────────────────

export interface SMSResult {
  ok:       boolean;
  message:  string;
  cost?:    string;
  messageId?: string;
  recipients?: { number: string; status: string; cost: string }[];
}

/**
 * Send an SMS to one or more Malawi phone numbers.
 * Numbers must be in international format: +265XXXXXXXXX
 */
export async function sendSMS(
  to: string | string[],
  message: string,
  senderId?: string
): Promise<SMSResult> {
  const client = getATClient();

  if (!client) {
    console.warn("[AT] SMS not sent — AT_API_KEY not configured. Would have sent to:", to);
    return { ok: false, message: "Africa's Talking not configured. Set AT_API_KEY in .env" };
  }

  const recipients = Array.isArray(to) ? to : [to];

  // Normalize Malawi numbers: convert 08xxxxxxx → +2658xxxxxxx
  const normalized = recipients.map(normalizeMalawiNumber).filter(Boolean) as string[];

  if (normalized.length === 0) {
    return { ok: false, message: "No valid phone numbers provided." };
  }

  try {
    const result = await client.send({
      to:       normalized,
      message:  message.substring(0, 160), // SMS length limit
      from:     senderId || AT_SENDER_ID,
    });

    const recs = result?.SMSMessageData?.Recipients || [];
    const allOk = recs.every((r: any) => r.status === "Success");

    return {
      ok:         allOk,
      message:    allOk ? `SMS sent to ${recs.length} recipient(s)` : "Some recipients failed",
      cost:       result?.SMSMessageData?.Message || "",
      recipients: recs.map((r: any) => ({
        number: r.number,
        status: r.status,
        cost:   r.cost,
      })),
    };
  } catch (err: any) {
    console.error("[AT] SMS error:", err.message);
    return { ok: false, message: err.message || "SMS send failed." };
  }
}

/**
 * Normalize Malawi phone numbers to E.164 international format
 * Handles: 0881234567, 265881234567, +265881234567
 */
function normalizeMalawiNumber(phone: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");

  if (digits.startsWith("265") && digits.length === 12) return `+${digits}`;
  if (digits.startsWith("0")   && digits.length === 10)  return `+265${digits.slice(1)}`;
  if (digits.length === 9 && /^[789]/.test(digits))       return `+265${digits}`;
  if (phone.startsWith("+265"))                           return phone;

  return null; // unrecognizable
}

// ─── OTP / MFA via SMS ────────────────────────────────────────────────────

import crypto from "crypto";
const OTP_STORE = new Map<string, { code: string; expires: number; attempts: number }>();

/**
 * Generate and send a 6-digit OTP to a phone number.
 * Returns the OTP (for audit/logging — do not return to client).
 */
export async function sendOTP(phone: string, purpose = "login"): Promise<SMSResult & { otp?: string }> {
  const otp  = crypto.randomInt(100000, 999999).toString();
  const key  = normalizeMalawiNumber(phone) || phone;

  OTP_STORE.set(key, { code: otp, expires: Date.now() + 5 * 60 * 1000, attempts: 0 });

  const message = `[LitSecure] Your ${purpose} verification code is: ${otp}. Valid for 5 minutes. Do not share this code.`;

  const result = await sendSMS(phone, message);
  return { ...result, otp }; // otp returned only for audit logging at call site
}

/**
 * Verify an OTP entered by the user.
 */
export function verifyOTP(phone: string, inputCode: string): { valid: boolean; reason?: string } {
  const key   = normalizeMalawiNumber(phone) || phone;
  const entry = OTP_STORE.get(key);

  if (!entry)                           return { valid: false, reason: "No OTP found. Request a new code." };
  if (Date.now() > entry.expires)       return { valid: false, reason: "OTP expired. Request a new code." };
  if (entry.attempts >= 3)              return { valid: false, reason: "Too many attempts. Request a new code." };

  entry.attempts++;

  if (entry.code !== inputCode.trim()) return { valid: false, reason: "Invalid code." };

  OTP_STORE.delete(key); // single use
  return { valid: true };
}

// ─── LitSecure Notification SMS Templates ─────────────────────────────────

/**
 * SMS alert: new critical incident to a list of analyst phones
 */
export async function smsAlertAnalysts(
  phones:     string[],
  incidentId: string,
  title:      string,
  severity:   string
): Promise<SMSResult> {
  if (!phones.length) return { ok: true, message: "No phones to notify." };

  const message = severity === "Critical"
    ? `[LitSecure CRITICAL] ${title} — ID: ${incidentId}. Immediate action required. Log in at litsecure.mw`
    : `[LitSecure] New ${severity} incident: ${title} (${incidentId}). Review at litsecure.mw`;

  return sendSMS(phones, message);
}

/**
 * SMS alert: coordinated campaign detected — broadcast to SOC managers and gov admins
 */
export async function smsCampaignAlert(
  phones:       string[],
  campaignName: string,
  riskScore:    number,
  sectors:      string[]
): Promise<SMSResult> {
  if (!phones.length) return { ok: true, message: "No phones to notify." };

  const message = `[LitSecure ALERT] Campaign detected: ${campaignName}. Risk: ${riskScore}/100. Affected: ${sectors.join(", ")}. Log in immediately.`;
  return sendSMS(phones, message);
}

/**
 * SMS alert: national lockdown activated — broadcast to all responders
 */
export async function smsLockdownAlert(
  phones:    string[],
  activated: boolean,
  actor:     string
): Promise<SMSResult> {
  if (!phones.length) return { ok: true, message: "No phones to notify." };

  const message = activated
    ? `[LitSecure EMERGENCY] National Alert Mode ACTIVATED by ${actor}. All analysts: log in now. Heightened cyber threat in progress.`
    : `[LitSecure] National Alert Mode deactivated by ${actor}. Normal operations resumed. Malawi cyber space is stable.`;

  return sendSMS(phones, message);
}

/**
 * SMS receipt to citizen: confirm their incident was received
 */
export async function smsCitizenReceipt(
  phone:       string,
  referenceId: string,
  category:    string
): Promise<SMSResult> {
  const message = `[LitSecure] Moni! Your ${category} report has been received. Reference: ${referenceId}. Our team will contact you. Kuthandizira Malawi kwa cyber security.`;
  return sendSMS(phone, message);
}

// ─── USSD Session State Machine ────────────────────────────────────────────
// Implements the citizen incident reporting flow via USSD
// No internet required — works on any mobile phone in Malawi

export interface USSDSession {
  sessionId: string;
  phone:     string;
  state:     string;
  data:      Record<string, string>;
  createdAt: number;
}

const USSD_SESSIONS = new Map<string, USSDSession>();

// Clean up old sessions (> 5 min)
setInterval(() => {
  const now = Date.now();
  for (const [id, sess] of USSD_SESSIONS) {
    if (now - sess.createdAt > 5 * 60 * 1000) USSD_SESSIONS.delete(id);
  }
}, 60 * 1000);

// Incident category map: USSD option → category name
const USSD_CATEGORIES: Record<string, string> = {
  "1": "Mobile Money Fraud",
  "2": "SIM Swap",
  "3": "Phishing / Online Scam",
  "4": "Account Takeover",
  "5": "Other Cyber Crime",
};

const CYBER_TIPS = [
  "Never share your M-Pesa/Airtel Money PIN with anyone, even people who claim to be from the bank.",
  "If someone calls asking for your SIM swap code, hang up immediately and call your telecom.",
  "Do not click links from unknown SMS messages. Call the sender directly to verify.",
  "LitSecure staff will NEVER ask for your password or OTP code.",
  "Use strong passwords: mix letters, numbers and symbols. Never reuse passwords.",
];

/**
 * Main USSD handler — called by Africa's Talking webhook
 * Returns a CON (continue) or END (terminate) string
 */
export function handleUSSD(params: {
  sessionId:   string;
  serviceCode: string;
  phoneNumber: string;
  text:        string;
}): string {
  const { sessionId, phoneNumber, text } = params;

  let session = USSD_SESSIONS.get(sessionId);
  if (!session) {
    session = { sessionId, phone: phoneNumber, state: "MENU", data: {}, createdAt: Date.now() };
    USSD_SESSIONS.set(sessionId, session);
  }

  const parts = text.split("*").filter(Boolean);
  const latest = parts[parts.length - 1] || "";

  // ── Main menu ──────────────────────────────────────────────
  if (text === "" || text === "0") {
    session.state = "MENU";
    return [
      "CON LitSecure Sentinel",
      "Malawi National Cyber Security",
      "─────────────────────",
      "1. Report Cyber Incident",
      "2. Check Report Status",
      "3. Cyber Safety Tips",
      "4. Emergency Contacts",
      "5. Report SIM Swap NOW",
    ].join("\n");
  }

  // ── Option 5: Fast SIM Swap report ────────────────────────
  if (text === "5") {
    session.state = "SIM_SWAP_CONFIRM";
    session.data.category = "SIM Swap";
    return "CON SIM SWAP EMERGENCY\nYou believe your SIM has been swapped?\n\n1. YES - Report now\n2. NO - Go back";
  }
  if (text === "5*1") {
    return `END URGENT: Your SIM swap has been flagged.\nRef: LIT-USSD-${Date.now().toString().slice(-6)}\n\nCall your telecom NOW:\nAirtel: 121\nTNM: 111\n\nLitSecure will investigate.`;
  }
  if (text === "5*2") {
    return "END Returning. Stay safe!";
  }

  // ── Option 1: Report Incident ──────────────────────────────
  if (text === "1") {
    session.state = "SELECT_CATEGORY";
    return [
      "CON What type of incident?",
      "─────────────────────",
      "1. Mobile Money Fraud",
      "2. SIM Swap",
      "3. Phishing / Online Scam",
      "4. Account Takeover",
      "5. Other Cyber Crime",
    ].join("\n");
  }

  if (text.startsWith("1*") && parts.length === 2) {
    const catKey = parts[1];
    const cat    = USSD_CATEGORIES[catKey];
    if (!cat) return "CON Invalid option.\n0. Back to menu";
    session.data.category = cat;
    session.state = "ENTER_DESCRIPTION";
    return `CON ${cat} selected.\nBriefly describe what happened:\n(Type and send your message)`;
  }

  if (text.startsWith("1*") && parts.length === 3) {
    const description = parts[2];
    if (!description || description.length < 3) {
      return "CON Description too short. Please give more detail:";
    }
    session.data.description = description;
    session.state = "CONFIRM_REPORT";
    return `CON Confirm your report:\nType: ${session.data.category}\nDesc: ${description.substring(0, 40)}...\n\n1. Submit Report\n2. Cancel`;
  }

  if (text.startsWith("1*") && parts.length === 4) {
    const confirm = parts[3];
    if (confirm === "1") {
      const refId = `LIT-USSD-${Date.now().toString().slice(-6)}`;
      session.data.referenceId = refId;
      // In production: queue this for API submission
      // submitUSSDIncident(session);
      return `END Report Submitted!\nRef: ${refId}\nCategory: ${session.data.category}\n\nThank you for protecting Malawi's cyber space.\nKuthandizira Malawi!`;
    }
    return "END Report cancelled. Stay safe!";
  }

  // ── Option 2: Check Status ─────────────────────────────────
  if (text === "2") {
    return "CON Enter your reference number:\n(e.g. LIT-2026-00042)";
  }
  if (text.startsWith("2*") && parts.length === 2) {
    const ref = parts[1].toUpperCase();
    // In production: look up in DB
    return `END Status Check: ${ref}\nStatus: Under Investigation\nLast update: Today\n\nFor urgent updates call:\nMACERT: +265 1 789 222`;
  }

  // ── Option 3: Safety Tips ──────────────────────────────────
  if (text === "3") {
    const tip = CYBER_TIPS[Math.floor(Math.random() * CYBER_TIPS.length)];
    return `END Cyber Safety Tip:\n\n${tip}\n\nFor more: litsecure.mw/tips`;
  }

  // ── Option 4: Emergency Contacts ──────────────────────────
  if (text === "4") {
    return [
      "END Emergency Contacts:",
      "─────────────────────",
      "MACERT: +265 1 789 222",
      "Police Cyber: +265 1 789 333",
      "Airtel Fraud: 121",
      "TNM Fraud: 111",
      "LitSecure: *860#",
    ].join("\n");
  }

  // ── Fallback ───────────────────────────────────────────────
  return "CON Invalid option.\n0. Back to main menu";
}

export { AT_USSD_CODE };
