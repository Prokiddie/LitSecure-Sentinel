/**
 * LitSecure Sentinel — Local Pattern Engine
 * Stage 2: Heuristic / regex-based risk scoring. Fully offline.
 * Detects urgency signals, IOC patterns, MITRE ATT&CK hints — no API calls.
 */
import type { PatternResult } from "./types.js";
import { identifyMalawianCarrier, detectCodeSwitching } from "./offlineRules.js";
import { db } from "../db/index.js";



// ─── Regex patterns ───────────────────────────────────────────────────────────
const URGENCY_PATTERNS: Array<[RegExp, number, string]> = [
  // [pattern, score, label]
  [/urgent.*action/i,           15, "Urgency + action combo"],
  [/account.*locked/i,          15, "Account locked warning"],
  [/account.*suspended/i,       15, "Account suspended warning"],
  [/verify.*immediately/i,      12, "Immediate verification demand"],
  [/click.*link/i,              12, "Click-link social engineering"],
  [/\botp\b/i,                  18, "OTP mention — likely social engineering"],
  [/\bpin\b.*share|share.*\bpin\b/i, 20, "PIN sharing request"],
  [/\bpassword\b.*reset|reset.*\bpassword\b/i, 10, "Password reset"],
  [/do not tell anyone/i,       20, "Secrecy instruction — red flag"],
  [/within \d+ (?:hour|minute|day)/i, 10, "Time pressure deadline"],
  [/your account.*(?:will|shall).*(?:close|delete|suspend)/i, 15, "Account closure threat"],
  [/you have won|congratulations.*win/i, 15, "Lottery/prize scam signal"],
  [/free.*(?:money|airtime|data)/i, 12, "Free reward scam"],
  [/send.*money|transfer.*amount/i, 10, "Money transfer request"],
  [/withdraw.*fail|failed.*withdrawal/i, 12, "Withdrawal failure narrative"],
  // Social media / account theft urgency
  [/account.*hacked|hacked.*account/i,   20, "Account hacked claim"],
  [/someone.*logged.*(?:in|into)/i,      18, "Unauthorized login detected"],
  [/fake.*(?:account|profile)/i,         15, "Fake account/impersonation"],
  [/(?:facebook|whatsapp|tiktok).*(?:hack|stolen|taken)/i, 20, "Social platform account theft"],
  [/blackmail|threatened.*images|intimate.*photo/i, 25, "Sextortion / blackmail signal"],
  // Chichewa urgency markers
  [/aphwanya.*account|alanda.*account/i, 22, "Chichewa account theft phrase"],
  [/kubethela|kupanga.*sim/i,            22, "Chichewa SIM swap phrase"],
  [/anatulutsa.*ndalama|anachotsa.*ndalama/i, 18, "Chichewa money taken phrase"],
];


const MITRE_PATTERNS: Array<[RegExp, string, string]> = [
  [/phish|spoof|fake.*email|fake.*website/i, "T1566", "Phishing"],
  [/\botp\b|sim swap|sim card/i,             "T1078", "Valid Accounts (SIM/OTP abuse)"],
  [/ransom|encrypt.*file/i,                  "T1486", "Data Encrypted for Impact"],
  [/brute.?force|password.*attempt/i,        "T1110", "Brute Force"],
  [/remote.*access|rdp|vnc|teamviewer/i,     "T1021", "Remote Services"],
  [/keylog|screenshot|screen.*capture/i,     "T1056", "Input Capture"],
  [/sql.?inject/i,                           "T1190", "Exploit Public-Facing Application"],
  [/c2|command.*control|beacon/i,            "T1071", "Application Layer Protocol (C2)"],
  [/data.*exfil|upload.*stolen|send.*data/i, "T1041", "Exfiltration Over C2 Channel"],
  [/lateral.*mov|pivot.*network/i,           "T1570", "Lateral Tool Transfer"],
  [/account.*hacked|(?:facebook|instagram|tiktok).*taken/i, "T1528", "Steal Application Access Token"],
  [/fake.*profile|impersonat/i,              "T1585", "Establish Accounts (Impersonation)"],
  [/blackmail|extort/i,                      "T1657", "Financial Theft / Extortion"],
];


// ─── IOC extractors ───────────────────────────────────────────────────────────
const IOC_PATTERNS = {
  phones:  /(?:\+?265|0)(?:88|99|111|88[1-9]|99[1-9])\d{6,7}/g,
  ips:     /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g,
  domains: /\b[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.(?:mw|com|net|online|org|gov|xyz|info|biz)\b/g,
  hashes:  /\b[a-fA-F0-9]{32,64}\b/g,
  amounts: /(?:MWK|K|USD|\$)\s?[\d,]+(?:\.\d{2})?/gi,
};

// ─── Run pattern engine ───────────────────────────────────────────────────────
export function runPatternEngine(text: string): PatternResult {
  let riskScore = 0;
  const urgencyFlags: string[] = [];
  const mitreHints: string[] = [];

  // Score urgency patterns
  for (const [pattern, score, label] of URGENCY_PATTERNS) {
    if (pattern.test(text)) {
      riskScore += score;
      urgencyFlags.push(label);
    }
  }

  // Detect MITRE hints
  for (const [pattern, code, name] of MITRE_PATTERNS) {
    if (pattern.test(text)) {
      mitreHints.push(`${code} — ${name}`);
    }
  }

  // Extract IOC hints
  const dedupe = (arr: string[]) => [...new Set(arr)];
  const rawPhones = dedupe(text.match(IOC_PATTERNS.phones) || []);

  // Tag each Malawian phone with its carrier
  const phonesWithCarrier = rawPhones.map(p => {
    const carrier = identifyMalawianCarrier(p);
    return carrier !== "Unknown" ? `${p} [${carrier}]` : p;
  });

  const iocHints = {
    phones:  phonesWithCarrier,
    ips:     dedupe(text.match(IOC_PATTERNS.ips)     || []),
    domains: dedupe(text.match(IOC_PATTERNS.domains) || []),
    hashes:  dedupe(text.match(IOC_PATTERNS.hashes)  || []),
    amounts: dedupe(text.match(IOC_PATTERNS.amounts)  || []),
  };

  // IOC presence boosts risk
  riskScore += rawPhones.length    * 8;
  riskScore += iocHints.ips.length     * 5;
  riskScore += iocHints.domains.length * 6;
  riskScore += iocHints.hashes.length  * 10;
  riskScore += iocHints.amounts.length * 4;

  // MITRE hits boost risk
  riskScore += mitreHints.length * 5;

  // Chichewa code-switching: authenticates the report + boosts risk score
  if (detectCodeSwitching(text)) riskScore += 10;

  // Length heuristic — very short or very long descriptions are suspicious
  if (text.length < 40)  riskScore += 5;  // suspiciously brief
  if (text.length > 800) riskScore += 5;  // highly detailed attack

  // Watchlist cross-reference check
  const watchlistHits: string[] = [];
  try {
    const watchlist = db.prepare("SELECT * FROM watchlist").all() as any[];
    for (const item of watchlist) {
      const val = String(item.value).toLowerCase().trim();
      const type = item.type;
      
      let matched = false;
      if (type === "phone") {
        matched = rawPhones.some(p => {
          const normP = p.replace(/\s*\[.*\]$/, "").trim();
          return normP.includes(val) || val.includes(normP);
        });
      } else if (type === "ip") {
        matched = iocHints.ips.some(ip => ip.includes(val) || val.includes(ip));
      } else if (type === "domain") {
        matched = iocHints.domains.some(dom => dom.toLowerCase().includes(val) || val.includes(dom.toLowerCase()));
      }

      if (matched) {
        watchlistHits.push(`${item.type.toUpperCase()}: ${item.value} (${item.reason})`);
        riskScore += 30; // Boost risk score significantly for watchlist matches
      }
    }
  } catch (err) {
    console.error("Watchlist check failed in patternEngine:", err);
  }

  riskScore = Math.min(riskScore, 100);

  const confidence = riskScore > 70 ? "very_high"
    : riskScore > 50 ? "high"
    : riskScore > 25 ? "medium"
    : "low";

  return { riskScore, confidence, urgencyFlags, iocHints, mitreHints, watchlistHits };
}
