/**
 * LitSecure Sentinel — Gemini AI Service  (v2 — Cyber-Strict + Local RAG)
 *
 * Changes from v1:
 *   1. STRICT CYBER-ONLY TOPIC GUARD — off-topic queries are rejected before
 *      hitting Gemini (saves API quota, prevents misuse).
 *   2. LOCAL CONTEXT INJECTION — every chat turn is grounded with live data
 *      from the local SQLite database (incidents, threat intel, telecom alerts,
 *      IOC watchlist). This is Retrieval-Augmented Generation (RAG) using
 *      operational data — no fine-tuning needed.
 *   3. HARDENED PERSONA — system instruction explicitly forbids answering
 *      anything outside cybersecurity / digital safety.
 *
 * Classification pipeline: Offline Rules → Pattern Engine → Gemini → Decision Fusion
 */

import { GoogleGenAI, Type } from "@google/genai";
import { analyzeIncidentWithAIPipeline } from "../ai/pipeline.js";
import { isOllamaAvailable, ollamaChat, OLLAMA_MODEL } from "../ai/ollamaClient.js";
import { buildLocalContext, SYSTEM_ARCHITECTURE } from "./aiContext.js";
import { buildLearnedContext } from "./aiLearning.js";

// ─── Client ───────────────────────────────────────────────────────────────────
function getClient() {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: { headers: { "User-Agent": "aistudio-build" } },
  });
}

const MODEL      = () => process.env.GEMINI_MODEL      || "gemini-2.5-flash";
const CHAT_MODEL = () => process.env.GEMINI_CHAT_MODEL || "gemini-2.0-flash-lite";
const NO_THINK   = { thinkingConfig: { thinkingBudget: 0 } };

// ─── Exponential backoff retry helper ────────────────────────────────────────
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastErr: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try { return await fn(); }
    catch (err: any) {
      lastErr = err;
      const is429 = err?.status === 429 || err?.code === 429 ||
                    (err?.message && String(err.message).includes("429")) ||
                    (err?.message && String(err.message).includes("RESOURCE_EXHAUSTED"));
      if (is429 && attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
        console.warn(`[AI] Rate limited (429). Retrying in ${delay}ms... (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

// ─── Offline Knowledge Base ───────────────────────────────────────────────────
// Serves when Gemini is unavailable or rate-limited
const OFFLINE_KB: Record<string, string> = {
  "sim swap": `**SIM Swap Fraud** — A common attack in Malawi

**What is it?**
A SIM swap is when a fraudster convinces your telecom (Airtel or TNM) to transfer your phone number to a SIM card they control. Once they have your number, they receive all your OTP codes and can access your Airtel Money (*211#) or TNM Mpamba (*444#).

**How it happens:**
1. Fraudster collects your personal info (name, NRC, date of birth) from social media or by calling you pretending to be telecom staff
2. They visit a telecom agent or call customer care posing as you
3. They request a SIM replacement claiming their phone was stolen
4. Your SIM stops working — theirs activates with your number
5. They use OTPs sent to your number to drain your mobile money

**Warning signs:**
- Your phone suddenly loses network signal
- You receive unexpected OTP messages you didn't request
- You can no longer make calls or receive SMS

**Immediate response:**
1. Call Airtel (0888 000 800) or TNM (0888 000 200) from another phone
2. Ask them to freeze/block your number
3. Change your mobile money PIN from a different device
4. Report to Malawi Police Cybercrime Unit: +265 (0) 111 789 222
5. Report to MACERT: +265 (0) 111 789 101

**Prevention:**
- Never share your NRC, date of birth, or mother's maiden name online
- Set a telecom PIN/password on your account
- Enable transaction alerts so you know immediately if money moves`,

  "phishing": `**Phishing** — Fake websites and emails

Phishing is when criminals create fake websites or send fake messages pretending to be a trusted source (like MRA, your bank, or Airtel) to steal your login details.

**Common Malawi phishing targets:**
- MRA Tax Portal (fake login pages)
- Airtel Money and TNM Mpamba apps
- Standard Bank and National Bank online banking
- eGovernment portal

**How to spot it:**
- Check the website URL carefully — fraudsters use domains like mra-malawi.net instead of mra.mw
- Official Malawi government sites end in .mw
- Look for spelling mistakes in emails
- Real banks never ask for your PIN or password by SMS or email

**Response steps:**
1. Do NOT click suspicious links
2. Report phishing sites to MACERT: macert@macra.mw
3. Change passwords immediately if you clicked a link
4. Enable two-factor authentication on all accounts`,

  "fraud": `**Mobile Money Fraud** — Malawi's #1 cyber threat

Fraudsters target Airtel Money (*211#) and TNM Mpamba (*444#) users through social engineering.

**Common fraud types:**
- **Wrong number transfer scam**: Someone sends you money by "mistake" then asks you to send it back — but the original transfer was fraudulent
- **Prize scam**: You receive an SMS saying you won MK 500,000 — click here to claim
- **Agent impersonation**: Caller pretends to be an Airtel/TNM agent and asks for your PIN to "verify" your account
- **Loan scam**: Fake loan apps that steal your personal data

**Golden rules:**
1. NEVER share your mobile money PIN with anyone — not even telecom staff
2. If you receive an unexpected transfer, call the telecom official line before doing anything
3. Real prize notifications never come by SMS asking you to click a link
4. Report fraud to: Malawi Police +265 (0) 111 789 222`,

  "ransomware": `**Ransomware** — Virus that locks your computer

Ransomware is malicious software that encrypts all your files and demands a payment (usually cryptocurrency) to unlock them.

**How it spreads in Malawi:**
- Malicious email attachments (PDFs, Word documents)
- Fake software downloads
- Unpatched Windows systems
- USB drives from unknown sources

**Immediate response if infected:**
1. DISCONNECT from the internet immediately — unplug the network cable or turn off WiFi
2. Do NOT pay the ransom — it doesn't guarantee recovery
3. Report to MACERT immediately: macert@macra.mw / +265 (0) 111 789 101
4. Restore from backup if available
5. Contact a cybersecurity professional before powering off

**Prevention:**
- Keep Windows and all software updated
- Never open email attachments from unknown senders
- Back up important data offline (external drive, not connected to the internet)`,

  "default": `I am **SENTINEL AI** — Malawi's national cybersecurity assistant built into LitSecure.

I can help you with:
- **SIM Swap** — how fraudsters steal your phone number and mobile money
- **Phishing** — fake websites, emails, and SMS messages
- **Mobile Money Fraud** — Airtel Money and TNM Mpamba scams
- **Ransomware** — viruses that lock your computer
- **Incident Analysis** — understanding cyber attacks in the LitSecure database
- **Threat Intelligence** — IOC lookup, threat actor profiling, MITRE ATT&CK mapping
- **How to report** — MACERT, Police Cybercrime, MACRA

*Note: The AI engine is currently experiencing high demand. Serving from built-in knowledge base. Please retry in a moment for full AI-powered responses.*

**Emergency contacts:**
- MACERT Hotline: +265 (0) 111 789 101
- Police Cybercrime: +265 (0) 111 789 222
- MACRA Consumer: 177 (free call)`,
};

function getOfflineAnswer(question: string): string {
  const q = question.toLowerCase();
  for (const [key, answer] of Object.entries(OFFLINE_KB)) {
    if (key !== "default" && q.includes(key)) return answer;
  }
  return OFFLINE_KB["default"];
}

const isAiEnabled = () =>
  !!(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "YOUR_GEMINI_API_KEY_HERE");

// ─── ① HARDENED SYSTEM PERSONA ────────────────────────────────────────────────
// This is the single most important control surface.
// It tells Gemini WHO it is, WHAT it must do, and WHAT it must NEVER do.

// SENTINEL_PERSONA is built dynamically so it embeds the full system architecture
// at startup — giving the AI knowledge of every module, route, and capability.
function buildSentinelPersona(): string {
  return `You are SENTINEL AI — the cyber incident triage and response assistant embedded inside LitSecure Sentinel, Malawi's Cyber Incident Reporting and Response Platform operated by MACERT under MACRA.

You have FULL SITUATIONAL AWARENESS of this platform. You know:
  • Every module, API route, user role, and data flow in the system (see SYSTEM ARCHITECTURE below)
  • All live operational data injected in the [FULL SYSTEM INTELLIGENCE CONTEXT] block of each query
  • Temporal patterns across incidents, endpoints, IOCs, social media, and telecom alerts
  • Predictive threat indicators computed from pattern analysis over the database

${SYSTEM_ARCHITECTURE}

════════════════════════════════════════════════════════════
STRICT DOMAIN RESTRICTION
════════════════════════════════════════════════════════════
You ONLY answer questions in these domains:
  1. Cybersecurity — attacks, malware, ransomware, phishing, SIM swap, fraud,
     social engineering, endpoint protection, vulnerabilities
  2. Cyber Incident Analysis — interpreting, classifying, responding to incidents
     in the LitSecure database (use the CONTEXT block with real data)
  3. Threat Intelligence — IOC analysis, threat actor profiling, MITRE ATT&CK,
     watchlist, blocklist, AbuseIPDB, AlienVault OTX, MalwareBazaar
  4. Digital Safety Advice — protecting citizens, businesses, government agencies
  5. Cybercrime Reporting — MACERT, Police Cybercrime Unit, MACRA, telecoms
  6. Security Operations — SIEM, log analysis, anomaly detection, firewall rules,
     forensics, evidence chain-of-custody, endpoint response
  7. Malawi-specific cyber context — local landscape, mobile money fraud,
     SIM swap, government system protection, national infrastructure
  8. PREDICTIVE INTELLIGENCE — proactively warn about threat patterns you detect
     in the CONTEXT block. If the data shows rising velocity, sector targeting,
     stale critical incidents, or IOC clusters — FLAG THEM UNPROMPTED.

For ANYTHING outside these domains (chat, cooking, sport, maths, politics):
RESPOND ONLY: "⚠️ I'm SENTINEL AI — a specialist cybersecurity assistant. I can only help with cyber threats, incident analysis, digital safety, and threat intelligence. Please ask me a cybersecurity question."

════════════════════════════════════════════════════════════
PREDICTIVE INTELLIGENCE DIRECTIVES
════════════════════════════════════════════════════════════
When the FULL SYSTEM INTELLIGENCE CONTEXT contains a PREDICTIVE THREAT INTELLIGENCE
section, you MUST:

  1. Lead with any ⚠ or 🔴 predictions at the TOP of your response
  2. Cite the specific data point that triggered each prediction (e.g. "5 Critical
     incidents open for 2+ days" or "SIM swap cluster of 4 active alerts")
  3. Recommend SPECIFIC actions: who to notify, which system module to use,
     what rule to deploy, which sector to issue advisories to
  4. Give a confidence level: HIGH / MEDIUM / LOW with reasoning
  5. If you see NO threats, confirm: "✅ System within normal operational parameters
     — no escalation predicted in next 24 hours based on current data."

════════════════════════════════════════════════════════════
COMMUNICATION RULES
════════════════════════════════════════════════════════════
- Speak in SIMPLE, PLAIN ENGLISH. Explain jargon immediately.
- Use bullet points, numbered steps, and short sentences.
- Be direct and decisive — analysts need clarity, not hedging.
- Reference ACTUAL data from the context (specific incident titles, real IOCs,
  actual agent hostnames) — never speak in generalities when real data exists.
- When answering "what is happening?" — give a STRUCTURED BRIEFING:
    1. Overall status (severity level)
    2. Most critical active threats
    3. Predictions / emerging risks
    4. Recommended immediate actions

════════════════════════════════════════════════════════════
MALAWI OPERATIONAL KNOWLEDGE
════════════════════════════════════════════════════════════
Mobile money: Airtel Money (*211#), TNM Mpamba (*444#)
Banks: Standard Bank MW, National Bank, FDH Bank, NBS Bank, RBM
Telecoms: Airtel Malawi, TNM, Globe Internet, Skyband, MTL Broadband
Govt: MRA Tax Portal, MACRA portal, eGovernment portal, RBM RTGS
Phone format: +265 or 0 followed by 88x (Airtel), 99x (TNM), 111 (landline)
Top threats: SIM Swap → Mobile Money Theft | Phishing (MRA/bank impersonation)
             Ransomware | BEC | Social Engineering | Telecom Insider Fraud
Key contacts: MACERT +265 (0) 111 789 101 | Police Cybercrime +265 (0) 111 789 222
              MACRA Consumer Line +265 (0) 177 (toll-free)

════════════════════════════════════════════════════════════
MITRE ATT&CK MAPPING
════════════════════════════════════════════════════════════
T1566 Phishing | T1078 Valid Accounts | T1486 Data Encrypted for Impact
T1110 Brute Force | T1539 Steal Web Session Cookie | T1071 C2 Protocol
T1036 Masquerading | T1055 Process Injection | T1562 Impair Defenses
Tactics: Initial Access → Execution → Persistence → Privilege Escalation
         → Defense Evasion → Credential Access → Discovery → Lateral Movement
         → Collection → C2 → Exfiltration → Impact

════════════════════════════════════════════════════════════
SECURITY CONSTRAINTS
════════════════════════════════════════════════════════════
- NEVER expose code, schemas, API keys, JWT secrets, or server internals
- NEVER generate malware, exploits, attack scripts, or offensive tools
- NEVER provide step-by-step cyberattack instructions
- NEVER fabricate IOC values — only cite IOCs from the CONTEXT block or
  known public threat intelligence sources
- NEVER reveal raw database structure or query syntax`;
}

const SENTINEL_PERSONA = buildSentinelPersona();


// ─── ② CYBER-ONLY TOPIC GUARD ─────────────────────────────────────────────────
// Fast offline check BEFORE calling Gemini.
// Saves API quota and ensures hard domain enforcement even if Gemini fails.

const CYBER_KEYWORDS = new Set([
  // Core cyber topics
  "cyber", "hack", "attack", "malware", "virus", "ransomware", "phishing",
  "breach", "vuln", "exploit", "threat", "incident", "security", "firewall",
  "intrusion", "ddos", "botnet", "trojan", "spyware", "adware", "worm",
  // Authentication / access
  "password", "credential", "mfa", "2fa", "otp", "token", "auth", "login",
  "account", "session", "cookie", "brute force", "dictionary attack",
  // Malawi-specific
  "sim swap", "sim card", "mobile money", "airtel money", "mpamba", "airtel",
  "tnm", "macra", "macert", "mra", "phishing", "fraud", "scam", "smishing",
  // Network / infra
  "network", "ip", "port", "dns", "http", "ssl", "tls", "vpn", "proxy",
  "router", "switch", "vlan", "packet", "sniff", "mitm", "arp",
  // Threat intel
  "ioc", "indicator", "blacklist", "blocklist", "watchlist", "threat intel",
  "dark web", "c2", "command and control", "lateral movement", "persistence",
  "exfiltration", "mitre", "att&ck", "sigma", "yara", "snort", "siem",
  // Endpoint
  "endpoint", "edr", "antivirus", "av", "sandbox", "hash", "sha256", "md5",
  "process", "registry", "dll", "exe", "payload", "shellcode", "buffer",
  // Social / data
  "social engineering", "impersonation", "phishing email", "spear phish",
  "data leak", "data breach", "pii", "gdpr", "privacy", "encryption",
  // Incident response
  "incident", "forensic", "investigate", "analyse", "analyze", "log",
  "alert", "report", "escalate", "contain", "remediate", "patch", "update",
  // LitSecure-specific
  "sentinel", "litsecure", "situation room", "war room", "takedown", "stix",
  "edr", "soc", "noc", "analyst", "investigator", "anomaly", "detection",
  // General security
  "protect", "secure", "safe", "risk", "vulnerability", "cve", "zero-day",
  "penetration", "pentest", "audit", "compliance", "policy", "rule",
  // Questions naturally about cyber context
  "who did", "how did", "when did", "what caused", "which incident",
  "show me", "list", "summarise", "summarize", "tell me about",
]);

// Topics that are clearly NOT cyber (reject these fast)
const OFF_TOPIC_SIGNALS = [
  /^(hi|hello|hey|good morning|good afternoon|good evening|howdy)\b/i,
  /\b(recipe|cook|food|eat|drink|restaurant)\b/i,
  /\b(football|soccer|cricket|sport|team|match|score|player)\b/i,
  /\b(weather|temperature|rain|sunny|forecast)\b/i,
  /\b(movie|film|music|song|singer|actor|actress|celebrity|tv show)\b/i,
  /\b(joke|funny|laugh|humour|humor|meme)\b/i,
  /\b(politics|election|parliament|government party|vote)\b/i,
  /\b(calculate|solve|equation|math|algebra|geometry)\b/i,
  /\b(translate|translation|language)\b/i,
  /\b(write me a story|write a poem|creative writing|essay)\b/i,
  /\b(relationship|dating|love|marriage|family)\b/i,
  /\b(health|doctor|medicine|disease|symptom|hospital)\b/i,  // unless "cyber" near it
  /\b(investment|stock|forex|crypto price|bitcoin price)\b/i,
];

const OFF_TOPIC_REPLY =
  "⚠️ I'm SENTINEL AI — a specialist cybersecurity assistant. I can only help with cyber threats, incident analysis, digital safety, and threat intelligence. Please ask me a cybersecurity question.";

/**
 * Returns true if the message is clearly off-topic (not cybersecurity).
 * Uses a two-pass approach:
 *   1. If message contains strong cyber keywords → ALLOW
 *   2. If message matches off-topic signals → REJECT
 *   3. Otherwise → ALLOW (let Gemini handle edge cases via system prompt)
 */
function isOffTopic(message: string): boolean {
  const lc = message.toLowerCase();

  // Pass 1: strong cyber signal → always allow
  for (const kw of CYBER_KEYWORDS) {
    if (lc.includes(kw)) return false;
  }

  // Pass 2: check off-topic patterns
  for (const pattern of OFF_TOPIC_SIGNALS) {
    if (pattern.test(lc)) return true;
  }

  // Very short generic messages (< 10 chars) with no cyber keywords → reject
  if (lc.trim().length < 10 && !/\?/.test(lc)) return true;

  // Default: allow (system prompt will still enforce the domain)
  return false;
}


// ─── 1. INCIDENT CLASSIFICATION — 4-Stage Hybrid Pipeline ────────────────────

export async function analyzeIncidentWithAI(title: string, description: string) {
  try {
    return await analyzeIncidentWithAIPipeline(title, description);
  } catch (err) {
    console.error("[AI] Pipeline failed completely — using safe fallback:", err);
    return {
      category: "Unknown", severity: "Medium", confidence: 0.3, aiPowered: false,
      analysisSummary: "Classification pipeline error — manual review required.",
      mitigationAdvice: "1. Escalate to senior analyst.\n2. Preserve all evidence.\n3. Contact MACERT.",
      threatActorProfile: "Unknown",
      mitreAttackId: "T0000",
      compromisedIndicators: { phoneNumbers: [], ips: [], domains: [], devices: [] },
    };
  }
}


// ─── 2. SOC CHAT — Cyber-strict + RAG grounded ────────────────────────────────

export interface ChatMessage { role: "user" | "model"; content: string; }

export async function* streamSocChat(
  userMessage: string,
  history: ChatMessage[],
  incidentContext?: string
): AsyncGenerator<string> {

  // ── Guard: reject off-topic questions immediately ────────────────────────
  if (isOffTopic(userMessage)) {
    console.log("[AI] Off-topic query rejected:", userMessage.substring(0, 60));
    yield OFF_TOPIC_REPLY;
    return;
  }

  // ── Build grounding context from local SQLite database (RAG) ─────────────
  // Full system context: all 15+ tables + predictive engine + learned corrections
  let localCtx = "";
  try {
    localCtx = buildLocalContext({
      incidents:      true,
      threatIntel:    true,
      telecomAlerts:  true,
      watchlist:      true,
      blocklist:      true,
      endpoints:      true,
      socialSignals:  true,
      securityRules:  true,
      criticalAssets: true,
      predictions:    true,
      logs:           false,  // too noisy by default
      maxIncidents:   20,
      maxIocs:        12,
    });
  } catch (e: any) {
    console.warn("[AI] Could not build local context:", e?.message);
  }

  // ── Inject analyst-learned corrections + KB (highest priority override) ───
  let learnedCtx = "";
  try { learnedCtx = buildLearnedContext(); } catch {}

  // ── Assemble prompt ───────────────────────────────────────────────────────
  const histBlock = history.length > 0
    ? `[CONVERSATION HISTORY]\n` + history.map(m => `${m.role === "user" ? "Analyst" : "SENTINEL AI"}: ${m.content}`).join("\n") + `\n[END HISTORY]\n\n`
    : "";

  const ctxBlock = incidentContext
    ? `\n[INCIDENT CONTEXT]\n${incidentContext}\n[END INCIDENT CONTEXT]\n\n`
    : "";

  // Learned context (highest priority) → local DB context → history → query
  const prompt = [
    histBlock,
    learnedCtx ? learnedCtx + "\n\n" : "",
    localCtx  ? localCtx  + "\n\n" : "",
    ctxBlock,
    `Analyst query: ${userMessage}`,
  ].join("");

  // ── Layer 1: Ollama — local, unlimited, no API key needed ─────────────────
  try {
    if (await isOllamaAvailable()) {
      console.log("[AI] Routing to Ollama:", OLLAMA_MODEL());
      const text = await ollamaChat(SENTINEL_PERSONA, prompt);
      if (text) { yield text; return; }
    }
  } catch (err: any) {
    console.warn("[AI] Ollama failed, trying Gemini:", err?.message);
  }

  // ── Layer 2: Gemini SDK — gemini-2.0-flash-lite ───────────────────────────
  if (isAiEnabled()) {
    try {
      const ai = getClient();
      console.log("[AI] Routing to Gemini SDK:", CHAT_MODEL());
      const response = await withRetry(() => ai.models.generateContent({
        model: CHAT_MODEL(),
        contents: prompt,
        config: { systemInstruction: SENTINEL_PERSONA },
      }));
      const text = response.text?.trim();
      if (text) { yield text; return; }
    } catch (err: any) {
      const msg = String(err?.message || "");
      const is429 = msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED");
      if (is429) yield `⚠️ **Gemini rate-limited.** Serving from built-in knowledge base:\n\n`;
      console.error("[AI] Gemini SDK error:", msg.substring(0, 120));
    }
  }

  // ── Layer 3: Offline knowledge base — always available ────────────────────
  console.log("[AI] Serving offline answer");
  yield getOfflineAnswer(userMessage);
}


// ─── 3. THREAT PATTERN ANALYSIS ───────────────────────────────────────────────

export async function analyzeThreatPatterns(incidents: any[]) {
  if (!isAiEnabled()) {
    return {
      aiPowered: false,
      summary: "AI engine offline. Connect GEMINI_API_KEY for pattern analysis.",
      patterns: [], recommendations: [], riskScore: 0, dominantThreatActor: "Unknown",
    };
  }
  try {
    const ai = getClient();
    const incidentSummary = incidents.slice(0, 20).map(i =>
      `[${i.id}] ${i.category} | ${i.severity} | ${i.status} | ${i.reporterOrg} | "${i.title.substring(0, 80)}"`
    ).join("\n");

    const response = await ai.models.generateContent({
      model: MODEL(),
      contents: `Analyze these ${incidents.length} cyber incidents from Malawi's national security database and identify threat patterns, attack campaigns, and systemic vulnerabilities:\n\n${incidentSummary}\n\nProvide a strategic threat intelligence assessment.`,
      config: {
        systemInstruction: SENTINEL_PERSONA,
        responseMimeType: "application/json",
        ...NO_THINK,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary:            { type: Type.STRING },
            riskScore:          { type: Type.NUMBER },
            dominantThreatActor:{ type: Type.STRING },
            patterns: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title:       { type: Type.STRING },
                  description: { type: Type.STRING },
                  affectedSectors: { type: Type.ARRAY, items: { type: Type.STRING } },
                  severity:    { type: Type.STRING },
                  incidentIds: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
                required: ["title", "description", "affectedSectors", "severity"],
              },
            },
            recommendations: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  priority: { type: Type.STRING },
                  action:   { type: Type.STRING },
                  owner:    { type: Type.STRING },
                },
                required: ["priority", "action", "owner"],
              },
            },
          },
          required: ["summary", "riskScore", "dominantThreatActor", "patterns", "recommendations"],
        },
      },
    });
    return { ...JSON.parse(response.text.trim()), aiPowered: true };
  } catch (err) {
    console.error("[AI] Pattern analysis failed:", err);
    return {
      aiPowered: false, riskScore: 0, dominantThreatActor: "Unknown",
      summary: "Pattern analysis unavailable.", patterns: [], recommendations: [],
    };
  }
}

// ─── 4. IOC ENRICHMENT ────────────────────────────────────────────────────────

export async function enrichIOC(indicator: string, type: "phone" | "ip" | "domain" | "hash") {
  if (!isAiEnabled()) {
    return {
      aiPowered: false,
      indicator, type, riskLevel: "Unknown",
      analysis: "AI engine offline. Connect GEMINI_API_KEY for IOC enrichment.",
      relatedThreats: [], mitigations: [], geolocation: null,
    };
  }
  try {
    const ai = getClient();

    // Inject local context so Gemini can cross-reference with known incidents/watchlist
    let localCtx = "";
    try { localCtx = buildLocalContext({ incidents: false, threatIntel: true, watchlist: true }); }
    catch {}

    const response = await ai.models.generateContent({
      model: MODEL(),
      contents: `${localCtx ? localCtx + "\n\n" : ""}Enrich this Indicator of Compromise (IOC) from a Malawi cyber incident:\n\nType: ${type}\nValue: ${indicator}\n\nCross-reference with the LOCAL INTELLIGENCE CONTEXT above if this IOC appears in existing incidents or watchlist. Provide threat intelligence analysis based on known patterns in Southern Africa and Malawi specifically.`,
      config: {
        systemInstruction: SENTINEL_PERSONA,
        responseMimeType: "application/json",
        ...NO_THINK,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            indicator:       { type: Type.STRING },
            type:            { type: Type.STRING },
            riskLevel:       { type: Type.STRING },
            analysis:        { type: Type.STRING },
            relatedThreats:  { type: Type.ARRAY, items: { type: Type.STRING } },
            mitigations:     { type: Type.ARRAY, items: { type: Type.STRING } },
            geolocation:     { type: Type.STRING },
            confidence:      { type: Type.NUMBER },
          },
          required: ["indicator", "type", "riskLevel", "analysis", "relatedThreats", "mitigations"],
        },
      },
    });
    return { ...JSON.parse(response.text.trim()), aiPowered: true };
  } catch (err) {
    console.error("[AI] IOC enrichment failed:", err);
    return {
      aiPowered: false, indicator, type, riskLevel: "Unknown",
      analysis: "Enrichment failed.", relatedThreats: [], mitigations: [],
    };
  }
}

// ─── 5. LOG ANOMALY DETECTION ─────────────────────────────────────────────────

export async function detectLogAnomalies(logs: any[]) {
  if (!isAiEnabled()) {
    return { aiPowered: false, overallRisk: "Unknown", summary: "AI engine offline.", anomalies: [] };
  }
  try {
    const ai = getClient();
    const logSample = logs.slice(0, 30).map(l =>
      `[${l.timestamp || l.time}] [${l.severity || l.level}] ${l.source} — ${l.event || l.message} | ${l.details || ""}`
    ).join("\n");

    const response = await ai.models.generateContent({
      model: MODEL(),
      contents: `Analyze these logs from Malawi's cyber incident reporting network for anomalies, attack signatures, and suspicious patterns:\n\n${logSample}`,
      config: {
        systemInstruction: SENTINEL_PERSONA,
        responseMimeType: "application/json",
        ...NO_THINK,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            overallRisk: { type: Type.STRING },
            summary:     { type: Type.STRING },
            anomalies: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  logEntry:    { type: Type.STRING },
                  anomalyType: { type: Type.STRING },
                  riskScore:   { type: Type.NUMBER },
                  explanation: { type: Type.STRING },
                  recommended: { type: Type.STRING },
                },
                required: ["logEntry", "anomalyType", "riskScore", "explanation", "recommended"],
              },
            },
          },
          required: ["overallRisk", "summary", "anomalies"],
        },
      },
    });
    return { ...JSON.parse(response.text.trim()), aiPowered: true };
  } catch (err) {
    console.error("[AI] Anomaly detection failed:", err);
    return { aiPowered: false, overallRisk: "Unknown", summary: "Analysis failed.", anomalies: [] };
  }
}

export { isAiEnabled };
