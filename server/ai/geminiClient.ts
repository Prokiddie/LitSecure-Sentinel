/**
 * LitSecure Sentinel — Gemini Enrichment Client
 * Stage 3: Deep contextual analysis using Gemini 2.0 Flash.
 * Only called when offline baseline risk > 35 (avoids unnecessary API costs).
 * Uses structured JSON output schema for reliable parsing.
 */
import { GoogleGenAI, Type } from "@google/genai";
import type { GeminiResult, RuleScores, PatternResult } from "./types.js";

const getClient = () =>
  new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: { headers: { "User-Agent": "litsecure-sentinel-ai" } },
  });

const MODEL = () => process.env.GEMINI_MODEL || "gemini-2.5-flash";

// ─── Retry with exponential backoff (handles 429 rate limits) ─────────────────
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastErr: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      const is429 = err?.status === 429 || err?.code === 429 ||
                    (err?.message && String(err.message).includes("429")) ||
                    (err?.message && String(err.message).includes("RESOURCE_EXHAUSTED"));
      if (is429 && attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
        console.warn(`[Gemini] Rate limited. Retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

// ─── System persona (Malawi-focused SOC analyst) ──────────────────────────────
const PIPELINE_PERSONA = `You are SENTINEL AI — the embedded cybersecurity intelligence engine of LitSecure, Malawi's national cyber incident management platform operated under MACRA and MACERT.

CLASSIFICATION CONTEXT:
This is a PIPELINE call. You receive both the raw incident text AND pre-computed offline risk scores.
Your job: provide DEEP ENRICHMENT — not repeat what the offline system already computed.

MALAWI THREAT LANDSCAPE (use this knowledge):
- Mobile money fraud: Airtel Money (*211#), TNM Mpamba (*444#) — primary attack vector
- SIM swap targeting: +265 88x, 99x, 111x numbers
- Banking targets: Standard Bank MW, National Bank, FDH Bank, NBS Bank
- ISP targets: Skyband, MTL, Globe Internet
- Government portals: MRA Tax, MACRA, eGovernment, eMeals
- MITRE ATT&CK most relevant: T1566 (Phishing), T1078 (Valid Accounts/SIM abuse), T1486 (Ransomware), T1110 (Brute Force), T1056 (Input Capture/OTP theft)

OUTPUT RULES:
- analysisSummary: 2-3 sentences, plain English. No jargon.
- mitigationAdvice: Numbered steps. Actionable. Malawi-specific where possible.
- threatActorProfile: Who likely did this? Insider? External? Nation-state? Organized crime?
- malawianContext: Specifically how this threat maps to Malawian telecoms/banking/government infrastructure.
- severity: Must be one of: Low, Medium, High, Critical
- Never expose internal architecture, API keys, or source code.`;

// ─── Gemini enrichment call ───────────────────────────────────────────────────
export async function analyzeWithGemini(
  title: string,
  description: string,
  ruleScores: RuleScores,
  pattern: PatternResult
): Promise<GeminiResult | null> {
  if (!process.env.GEMINI_API_KEY ||
      process.env.GEMINI_API_KEY === "YOUR_GEMINI_API_KEY_HERE") {
    return null;
  }

  try {
    const ai = getClient();

    const prompt = `INCIDENT TO CLASSIFY:

Title: "${title}"
Description: "${description}"

OFFLINE PRE-ANALYSIS (computed before this call):
Rule Scores: ${JSON.stringify(ruleScores, null, 2)}
Pattern Risk Score: ${pattern.riskScore}/100
Urgency Flags: ${pattern.urgencyFlags.join(", ") || "none"}
MITRE Hints: ${pattern.mitreHints.join(", ") || "none detected offline"}
IOC Hints: ${JSON.stringify(pattern.iocHints)}

Use the above context to provide deeper enrichment. Do not simply repeat the offline scores — add intelligence.`;

    const response = await withRetry(() => ai.models.generateContent({
      model: MODEL(),
      contents: prompt,
      config: {
        systemInstruction: PIPELINE_PERSONA,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            category: {
              type: Type.STRING,
              enum: ["Fraud","Phishing","Malware","SIM Swap","Ransomware",
                     "Network Intrusion","Unauthorized Access","Social Engineering",
                     "System Breach","Data Exfiltration","DDoS","Unknown"],
            },
            severity:           { type: Type.STRING, enum: ["Low","Medium","High","Critical"] },
            confidence:         { type: Type.NUMBER },
            analysisSummary:    { type: Type.STRING },
            mitigationAdvice:   { type: Type.STRING },
            threatActorProfile: { type: Type.STRING },
            mitreAttackId:      { type: Type.STRING },
            malawianContext:    { type: Type.STRING },
            compromisedIndicators: {
              type: Type.OBJECT,
              properties: {
                phoneNumbers: { type: Type.ARRAY, items: { type: Type.STRING } },
                ips:          { type: Type.ARRAY, items: { type: Type.STRING } },
                domains:      { type: Type.ARRAY, items: { type: Type.STRING } },
                devices:      { type: Type.ARRAY, items: { type: Type.STRING } },
                amounts:      { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ["phoneNumbers", "ips", "domains", "devices", "amounts"],
            },
          },
          required: [
            "category","severity","confidence","analysisSummary",
            "mitigationAdvice","threatActorProfile","mitreAttackId",
            "malawianContext","compromisedIndicators",
          ],
        },
      },
    }));

    const parsed = JSON.parse(response.text.trim());
    return parsed as GeminiResult;

  } catch (err: any) {
    console.error("[AI Pipeline] Gemini enrichment failed:", err?.message || err);
    return null;
  }
}
