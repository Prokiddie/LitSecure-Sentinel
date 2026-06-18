/**
 * LitSecure Sentinel — Malawian Reputation Database (Phase 2)
 * Local reputation scoring for MW phone numbers, IP addresses, and domains.
 * Cross-references AbuseIPDB threat intel, watchlist, blocklist, and incident history.
 *
 * Prefix: /api/reputation
 */
import { Router } from "express";
import db from "../db/index.js";

const router = Router();

// ─── Phone number reputation ───────────────────────────────────────────────────
router.get("/phone/:number", (req, res) => {
  const phone = req.params.number.replace(/\s+/g, "").replace(/[^+\d]/g, "");

  // Check watchlist
  const watchlisted = db.prepare(
    "SELECT * FROM watchlist WHERE value = ? AND type = 'phone'"
  ).get(phone) as any;

  // Check telecom alerts (SIM swap, fraud)
  const telecomAlerts = db.prepare(
    "SELECT * FROM telecom_alerts WHERE phone_number = ? ORDER BY timestamp DESC LIMIT 5"
  ).all(phone) as any[];

  // Check incidents mentioning this number
  const incidentCount = (db.prepare(`
    SELECT COUNT(*) as c FROM incidents
    WHERE compromised_indicators LIKE ?
  `).get(`%${phone}%`) as any)?.c ?? 0;

  // Calculate reputation score (0 = clean, 100 = malicious)
  let score = 0;
  const flags: string[] = [];

  if (watchlisted) {
    score += watchlisted.risk_level === "Critical" ? 80 : watchlisted.risk_level === "High" ? 60 : 40;
    flags.push(`Watchlisted (${watchlisted.risk_level}): ${watchlisted.reason}`);
  }
  if (telecomAlerts.some(a => a.type === "SIM Swap")) { score += 30; flags.push("SIM Swap detected"); }
  if (telecomAlerts.some(a => a.type === "Fraud Report")) { score += 25; flags.push("Fraud reported"); }
  if (telecomAlerts.some(a => a.type === "Wallet Anomalies")) { score += 20; flags.push("Wallet anomaly"); }
  if (incidentCount > 0) { score += Math.min(incidentCount * 10, 30); flags.push(`Cited in ${incidentCount} incident(s)`); }

  const riskLevel = score >= 80 ? "CRITICAL" : score >= 60 ? "HIGH" : score >= 30 ? "MEDIUM" : "CLEAN";

  return res.json({
    phone,
    score: Math.min(score, 100),
    riskLevel,
    flags,
    watchlisted:    !!watchlisted,
    telecomAlerts:  telecomAlerts.length,
    incidentCount,
    mwCarrier:      phone.startsWith("+2659") || phone.startsWith("09") ? "TNM" :
                    phone.startsWith("+2658") || phone.startsWith("08") ? "Airtel" : "Unknown",
    checkedAt:      new Date().toISOString(),
  });
});

// ─── IP address reputation ─────────────────────────────────────────────────────
router.get("/ip/:address", (req, res) => {
  const ip = req.params.address.trim();

  // Check threat intel
  const threatRecord = db.prepare(
    "SELECT * FROM threat_intel WHERE value = ? AND type = 'IP'"
  ).get(ip) as any;

  // Check blocklist
  const blocked = db.prepare(
    "SELECT * FROM blocklist WHERE value = ? AND type = 'IP'"
  ).get(ip) as any;

  // Check watchlist
  const watchlisted = db.prepare(
    "SELECT * FROM watchlist WHERE value = ? AND type = 'ip'"
  ).get(ip) as any;

  // Check incidents
  const incidentCount = (db.prepare(
    "SELECT COUNT(*) as c FROM incidents WHERE compromised_indicators LIKE ?"
  ).get(`%${ip}%`) as any)?.c ?? 0;

  // Score calculation
  let score = 0;
  const flags: string[] = [];

  if (threatRecord) {
    score += threatRecord.confidence ?? 50;
    flags.push(`Threat intel: ${threatRecord.description || threatRecord.source}`);
    if (threatRecord.abuse_score > 0) { score = Math.max(score, threatRecord.abuse_score); flags.push(`AbuseIPDB score: ${threatRecord.abuse_score}`); }
  }
  if (blocked) { score = Math.max(score, blocked.confidence ?? 80); flags.push(`Blocklisted (${blocked.category}) via ${blocked.source}`); }
  if (watchlisted) { score += 20; flags.push(`Watchlisted: ${watchlisted.reason}`); }
  if (incidentCount > 0) { score += Math.min(incidentCount * 5, 20); flags.push(`Cited in ${incidentCount} incident(s)`); }

  const riskLevel = score >= 80 ? "CRITICAL" : score >= 60 ? "HIGH" : score >= 30 ? "MEDIUM" : "CLEAN";
  const isMalawiASN = ip.startsWith("41.70.") || ip.startsWith("196.43.") || ip.startsWith("196.201.");

  return res.json({
    ip,
    score: Math.min(score, 100),
    riskLevel,
    flags,
    isBlocked:      !!blocked,
    isWatchlisted:  !!watchlisted,
    isMalawiASN,
    geoCountry:     threatRecord?.geo_country || (isMalawiASN ? "MW" : "Unknown"),
    geoISP:         threatRecord?.geo_isp || "Unknown",
    incidentCount,
    abuseScore:     threatRecord?.abuse_score ?? null,
    source:         threatRecord?.source || "local",
    checkedAt:      new Date().toISOString(),
  });
});

// ─── Domain reputation ─────────────────────────────────────────────────────────
router.get("/domain/:domain", (req, res) => {
  const domain = req.params.domain.toLowerCase().trim();

  // Check threat intel
  const threatRecord = db.prepare(
    "SELECT * FROM threat_intel WHERE value = ? AND type = 'DOMAIN'"
  ).get(domain) as any;

  // Check blocklist
  const blocked = db.prepare(
    "SELECT * FROM blocklist WHERE value = ? AND type = 'DOMAIN'"
  ).get(domain) as any;

  // Check watchlist
  const watchlisted = db.prepare(
    "SELECT * FROM watchlist WHERE value = ? AND type = 'domain'"
  ).get(domain) as any;

  // Typosquat detection for Malawian domains
  const mwLegitDomains = ["macra.org.mw", "rbm.mw", "tnm.co.mw", "airtel.mw", "sbm.mw", "standardbank.co.mw", "fpo.mw", "malawi.gov.mw"];
  const typosquatOf = mwLegitDomains.find(legit => {
    if (domain === legit) return false;
    const base = legit.replace(".mw", "");
    return domain.includes(base.replace(/[aeiou]/g, "")) || levenshtein(domain, legit) <= 2;
  });

  // Check incidents
  const incidentCount = (db.prepare(
    "SELECT COUNT(*) as c FROM incidents WHERE compromised_indicators LIKE ?"
  ).get(`%${domain}%`) as any)?.c ?? 0;

  let score = 0;
  const flags: string[] = [];

  if (threatRecord) { score += threatRecord.confidence ?? 60; flags.push(`Threat intel: ${threatRecord.description || "Malicious domain"}`); }
  if (blocked) { score = Math.max(score, blocked.confidence ?? 80); flags.push(`Blocklisted (${blocked.category})`); }
  if (watchlisted) { score += 25; flags.push(`Watchlisted: ${watchlisted.reason}`); }
  if (typosquatOf) { score += 40; flags.push(`Possible typosquat of ${typosquatOf}`); }
  if (incidentCount > 0) { score += Math.min(incidentCount * 8, 25); flags.push(`Cited in ${incidentCount} incident(s)`); }

  const riskLevel = score >= 80 ? "CRITICAL" : score >= 60 ? "HIGH" : score >= 30 ? "MEDIUM" : "CLEAN";

  return res.json({
    domain,
    score: Math.min(score, 100),
    riskLevel,
    flags,
    isBlocked:    !!blocked,
    isWatchlisted:!!watchlisted,
    typosquatOf:  typosquatOf || null,
    isMalawiDomain: domain.endsWith(".mw"),
    incidentCount,
    checkedAt:    new Date().toISOString(),
  });
});

// ─── Bulk lookup ───────────────────────────────────────────────────────────────
router.post("/bulk", async (req, res) => {
  const { indicators } = req.body as { indicators: Array<{ type: "ip" | "domain" | "phone"; value: string }> };
  if (!Array.isArray(indicators) || indicators.length === 0) {
    return res.status(400).json({ error: "indicators array required" });
  }
  if (indicators.length > 50) {
    return res.status(400).json({ error: "Maximum 50 indicators per bulk request" });
  }

  const results: any[] = [];
  for (const ind of indicators) {
    const { type, value } = ind;
    try {
      const r = await fetch(`http://localhost:${process.env.PORT || 3000}/api/reputation/${type}/${encodeURIComponent(value)}`, {
        headers: { Authorization: req.headers.authorization || "" },
      });
      results.push({ type, value, ...(await r.json()) });
    } catch {
      results.push({ type, value, error: "lookup failed" });
    }
  }
  return res.json(results);
});

// ─── MW threat heatmap data ────────────────────────────────────────────────────
router.get("/mw-heatmap", (_req, res) => {
  // District-level risk aggregation
  const districtKeywords: Record<string, string[]> = {
    "Lilongwe":    ["lilongwe", "area 18", "area 47", "area 25"],
    "Blantyre":    ["blantyre", "limbe", "chirimba"],
    "Mzuzu":       ["mzuzu", "ekwendeni"],
    "Zomba":       ["zomba", "chancellor"],
    "Kasungu":     ["kasungu"],
    "Mangochi":    ["mangochi"],
    "Salima":      ["salima"],
    "Dedza":       ["dedza"],
    "Mulanje":     ["mulanje", "thyolo"],
    "Nkhata Bay":  ["nkhata bay", "nkhata"],
  };

  const districtRisks: Array<{ district: string; incidentCount: number; riskLevel: string }> = [];
  for (const [district, keywords] of Object.entries(districtKeywords)) {
    let count = 0;
    for (const kw of keywords) {
      const r = (db.prepare(
        "SELECT COUNT(*) as c FROM incidents WHERE LOWER(description) LIKE ? OR LOWER(title) LIKE ?"
      ).get(`%${kw}%`, `%${kw}%`) as any)?.c ?? 0;
      count += r;
    }
    districtRisks.push({
      district,
      incidentCount: count,
      riskLevel: count >= 5 ? "HIGH" : count >= 2 ? "MEDIUM" : "LOW",
    });
  }

  return res.json(districtRisks.sort((a, b) => b.incidentCount - a.incidentCount));
});

// ─── Helpers ───────────────────────────────────────────────────────────────────
function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[a.length][b.length];
}

export default router;
