/**
 * LitSecure Sentinel — Offline Rule Engine
 * Stage 1: Deterministic keyword/pattern scoring. NO internet. NO AI. Millisecond response.
 *
 * Malawi-specific threat vocabulary built from MACRA/MACERT incident corpus.
 */
import type { RuleScores } from "./types.js";

// ─── Threat indicator dictionaries ───────────────────────────────────────────
const INDICATORS = {
  fraud: [
    // Mobile money (Malawi specific)
    "mpamba", "airtel money", "airtel mpamba", "tnm", "mobile money",
    "wallet", "kwacha", "mwk", "mw kwacha", "agent id", "withdraw",
    // Generic fraud
    "fraud", "scam", "stolen", "deducted", "debit", "unauthorized transaction",
    "transfer without", "bank account", "fake receipt", "fake proof",
    "investment scheme", "ponzi",
    // ── Chichewa / Malawian local terms ──
    "mpoto", "mvula ya ndalama", "peza ndalama", "mwalandira ndalama",
    "moni wa bank", "ndalama zanga", "anatulutsa ndalama", "anachotsa ndalama",
    "scam malawi", "kubera", "kumuba",
  ],
  phishing: [
    // Credential harvesting
    "password", "verify account", "verify your account", "click link",
    "login now", "click here to verify", "confirm your details",
    "account suspended", "account will be closed", "unusual activity",
    // Malawi-specific spoofing targets
    "mra", "malawi revenue", "macra", "egovernment", "e-government",
    "emeals", "national id", "mbs bank", "national bank", "standard bank",
    "fdh bank", "nbs bank",
    // Domain spoofing signals
    "official website", "secure portal", "log in immediately",
    // Chichewa phishing phrases
    "lowani account", "tsimikizani account", "lowetsani password",
  ],
  simSwap: [
    "sim swap", "sim card", "sim replacement", "port my number",
    "telecom fraud", "number porting", "phone number stolen",
    "registered sim", "duplicate sim", "sim cloning",
    "number hijack", "lost phone number", "someone using my number",
    // Malawi number prefixes (Airtel: 088x/098x, TNM: 099x/088x, Access: 021x)
    "+265", "0888", "0999", "0111", "0881", "0882", "0883", "0884",
    "0985", "0986", "0991", "0992", "0993",
    // Chichewa SIM swap terms
    "kubethela", "kupanga sim", "sim card yanga", "nambala yanga",
    "aphwanya nambala", "alanda nambala", "sim yanga",
    // TNM Mpamba / Airtel Money USSD codes (seen in fraud reports)
    "*211#", "*444#", "*115#",
  ],
  malware: [
    "virus", "malware", "trojan", "worm", "rootkit", "keylogger",
    "spyware", "adware", "backdoor", "download file", "exe file",
    "install update", "fake update", "suspicious software",
    "remote access", "rat ", " rat,", "command and control", "c2",
    "payload", "dropper", "exploit",
  ],
  ransomware: [
    "ransom", "ransomware", "encrypt", "encrypted files", "bitcoin",
    "crypto payment", "locked files", "cannot open files",
    "pay to decrypt", "btc", "monero", "wallet address",
    "your files are locked", "deadline", "contact us to recover",
  ],
  intrusion: [
    "intrusion", "brute force", "unauthorized access", "hacked", "hack",
    "ddos", "denial of service", "port scan", "vulnerability",
    "exploit", "injection", "sql injection", "xss", "csrf",
    "firewall breach", "vpn", "open port", "remote desktop", "rdp",
    "ssh attack", "lateral movement", "privilege escalation",
  ],
  socialEngineering: [
    "called me", "phone call", "pretend", "impersonating", "impersonation",
    "fake airtel", "fake tnm", "fake bank", "acting as", "claimed to be",
    "said they are from", "asked for otp", "asked for pin",
    "give me your code", "share your pin", "customer care",
    "technical support", "it department called",
    // Chichewa social engineering phrases
    "ndine kuchokera ku airtel", "ndine kuchokera ku tnm",
    "ndine kuchokera ku bank", "tumizani otp", "share pin yanu",
    "ndikupatseni code", "patsani code", "lowani link",
    "customer care wa airtel", "tnm agent",
  ],
  socialMedia: [
    // Account theft and impersonation signals
    "account hacked", "facebook hacked", "whatsapp hacked",
    "account stolen", "someone logged into", "fake account",
    "impersonating me", "using my photos", "fake profile",
    "account taken over", "hacker took my account",
    "reported fake account", "account locked out",
    // Cyberbullying
    "cyberbully", "online harassment", "threatening messages",
    "revenge porn", "intimate images", "blackmail online",
    // Chichewa account theft terms
    "aphwanya account", "alanda account yanga", "account yanga",
    "facebook yanga", "whatsapp yanga yapanda",
  ],
  dataExfil: [
    "data breach", "data leak", "data stolen", "sensitive data",
    "personal information leaked", "database dump", "credentials exposed",
    "customer data", "employee records", "national id exposed",
    "passport data", "medical records", "exfiltration",
  ],
} as const;

// ─── Weight config ────────────────────────────────────────────────────────────
const WEIGHTS: Record<keyof typeof INDICATORS, number> = {
  fraud:             22,
  phishing:          20,
  simSwap:           25,   // higher weight — critical in Malawi
  malware:           18,
  ransomware:        30,   // highest — immediate critical threat
  intrusion:         20,
  socialEngineering: 18,
  socialMedia:       20,   // account theft / cyberbullying / impersonation
  dataExfil:         22,
};

// ─── Run rule engine ──────────────────────────────────────────────────────────
export function runOfflineRules(text: string): RuleScores {
  const t = text.toLowerCase();
  const scores: RuleScores = {
    fraud: 0, phishing: 0, malware: 0, simSwap: 0,
    ransomware: 0, intrusion: 0, socialEngineering: 0, socialMedia: 0, dataExfil: 0,
  };

  // Chichewa code-switching boost: if reporter writes in Chichewa,
  // they are almost certainly a real Malawian victim — boost all scores by 15%
  const chichewaBoost = detectCodeSwitching(text) ? 1.15 : 1.0;

  for (const [category, keywords] of Object.entries(INDICATORS)) {
    const cat = category as keyof RuleScores;
    const weight = WEIGHTS[cat as keyof typeof WEIGHTS] ?? 15;
    for (const kw of keywords) {
      if (t.includes(kw)) {
        scores[cat] = Math.min(scores[cat] + Math.round(weight * chichewaBoost), 100);
      }
    }
  }

  return scores;
}

// ─── Find dominant threat category ───────────────────────────────────────────
export function getDominantRule(scores: RuleScores): { category: string; score: number } {
  const entries = Object.entries(scores) as [string, number][];
  const [category, score] = entries.reduce((best, curr) =>
    curr[1] > best[1] ? curr : best
  );
  return { category, score };
}

// ─── Chichewa / code-switching detector ──────────────────────────────────────
// Returns true when a reporter is writing in Malawian Chichewa
// Indicates a real Malawian victim — boosts confidence in authentic reports
const CHICHEWA_MARKERS = [
  "ndine", "ndi", "koma", "kuti", "chifukwa", "ndipo", "mwana",
  "zanga", "yanga", "wanga", "athu", "ine", "ife", "iwo",
  "aphwanya", "alanda", "anandibera", "anatulutsa", "anachotsa",
  "ndalama", "malawi", "blantyre", "lilongwe", "mzuzu",
];
export function detectCodeSwitching(text: string): boolean {
  const words = text.toLowerCase().split(/\s+/);
  const chichewaHits = words.filter(w => CHICHEWA_MARKERS.includes(w)).length;
  return chichewaHits >= 2; // 2+ Chichewa marker words = authentic Malawian report
}

// ─── Malawian carrier identification ──────────────────────────────────────────
export type MalawiCarrier = "Airtel" | "TNM" | "Access" | "Unknown";

export function identifyMalawianCarrier(phone: string): MalawiCarrier {
  // Normalize: strip +265 country code, ensure starts with 0
  let n = phone.replace(/^\+265/, "0").replace(/[\s-]/g, "");
  if (n.startsWith("265")) n = "0" + n.slice(3);

  // Airtel Malawi: 0881-0884, 0985-0986, 0988-0989
  if (/^0(88[1-4]|98[5-9])/.test(n)) return "Airtel";
  // TNM Mpamba: 0881-0889, 0991-0999, 0888
  if (/^0(88[5-9]|99[0-9]|888)/.test(n)) return "TNM";
  // Access Bank / G-Mobile: 0210-0219
  if (/^021[0-9]/.test(n)) return "Access";

  return "Unknown";
}
