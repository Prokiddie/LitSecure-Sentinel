/**
 * LitSecure Sentinel — Decision Engine
 * Stage 4: Fuses offline baseline + Gemini enrichment into a final authoritative decision.
 *
 * Fusion logic:
 *   - If Gemini succeeded:   weight 40% offline + 60% Gemini (Gemini enriches, not overrides)
 *   - If Gemini failed/skipped: 100% offline baseline (still fully usable)
 *   - Severity can never be DOWNGRADED by Gemini if offline detected Critical
 *   - IOCs are merged (union of offline regex + Gemini NER)
 */
import type { RuleScores, PatternResult, GeminiResult, PipelineResult, ThreatCategory, Severity } from "./types.js";

// ─── ETCA 2016 Legal Section Mapping ─────────────────────────────────────────
// Electronic Transactions & Cyber Security Act, 2016 (Malawi)
export const ETCA_MAP: Record<string, string> = {
  "Fraud":              "ETCA 2016 — Section 25: Computer-related fraud (max 10 yrs)",
  "Phishing":           "ETCA 2016 — Section 24: Computer-related forgery (max 10 yrs)",
  "Malware":            "ETCA 2016 — Section 20: Illegal devices / malicious code (max 10 yrs)",
  "SIM Swap":           "ETCA 2016 — Section 17: Unauthorised access to computer systems (max 10 yrs)",
  "Ransomware":         "ETCA 2016 — Section 22: Data interference (max 10 yrs)",
  "Network Intrusion":  "ETCA 2016 — Section 18: Illegal interception (max 5 yrs)",
  "Social Engineering": "ETCA 2016 — Section 24 + Malawi Penal Code Section 312: False pretenses",
  "System Breach":      "ETCA 2016 — Section 17(1)(a): Unauthorised computer access",
  "Data Exfiltration":  "Data Protection Act 2024 — Section 43: Unlawful processing of personal data",
  "Unauthorized Access":"ETCA 2016 — Section 17(1)(a): Unauthorised access (max 10 yrs)",
  "DDoS":               "ETCA 2016 — Section 21: System interference (max 10 yrs)",
  "Unknown":            "ETCA 2016 — Section 17 (pending classification)",
};


// ─── Category mapping from rule engine keys ───────────────────────────────────
const RULE_TO_CATEGORY: Record<string, ThreatCategory> = {
  fraud:             "Fraud",
  phishing:          "Phishing",
  malware:           "Malware",
  simSwap:           "SIM Swap",
  ransomware:        "Ransomware",
  intrusion:         "Network Intrusion",
  socialEngineering: "Social Engineering",
  socialMedia:       "Account Theft",
  dataExfil:         "Data Exfiltration",
};

// ─── Severity from numeric risk ───────────────────────────────────────────────
function riskToSeverity(risk: number): Severity {
  if (risk >= 80) return "Critical";
  if (risk >= 55) return "High";
  if (risk >= 30) return "Medium";
  return "Low";
}

// ─── MITRE primary from pattern hints ────────────────────────────────────────
function pickMitre(hints: string[]): string {
  return hints.length > 0 ? hints[0].split(" — ")[0] : "T0000";
}

// ─── Merge IOC arrays (union, deduped) ───────────────────────────────────────
function mergeIocs(
  offlineIocs: PatternResult["iocHints"],
  geminiIocs?: GeminiResult["compromisedIndicators"]
) {
  const dedupe = (a: string[], b: string[] = []) => [...new Set([...a, ...b])];
  return {
    phoneNumbers: dedupe(offlineIocs.phones, geminiIocs?.phoneNumbers),
    ips:          dedupe(offlineIocs.ips,    geminiIocs?.ips),
    domains:      dedupe(offlineIocs.domains,geminiIocs?.domains),
    devices:      geminiIocs?.devices || [],
  };
}

// ─── Severity order for comparison ───────────────────────────────────────────
const SEV_ORDER: Record<Severity, number> = { Low: 0, Medium: 1, High: 2, Critical: 3 };

function maxSeverity(a: Severity, b: Severity): Severity {
  return SEV_ORDER[a] >= SEV_ORDER[b] ? a : b;
}

// ─── Main fusion ──────────────────────────────────────────────────────────────
export function fuseDecision(params: {
  startMs:     number;
  ruleScores:  RuleScores;
  dominant:    { category: string; score: number };
  pattern:     PatternResult;
  baselineRisk:number;
  gemini:      GeminiResult | null;
  geminiSkipped:     boolean;
  geminiSkipReason?: string;
}): PipelineResult {
  const {
    startMs, ruleScores, dominant, pattern,
    baselineRisk, gemini, geminiSkipped, geminiSkipReason,
  } = params;

  const baselineSeverity = riskToSeverity(baselineRisk);

  // ── Final decision ──────────────────────────────────────────────────────────
  let finalCategory:  ThreatCategory;
  let finalSeverity:  Severity;
  let finalConfidence:number;
  let finalSummary:   string;
  let finalMitigation:string;
  let finalActor:     string;
  let finalMitre:     string;
  let aiPowered:      boolean;

  if (gemini) {
    // Fused: offline sets the floor, Gemini enriches
    finalCategory   = gemini.category as ThreatCategory;
    finalSeverity   = maxSeverity(baselineSeverity, gemini.severity as Severity);
    finalConfidence = Math.round(baselineRisk * 0.35 + gemini.confidence * 0.65);
    finalSummary    = gemini.analysisSummary;
    finalMitigation = gemini.mitigationAdvice;
    finalActor      = gemini.threatActorProfile;
    finalMitre      = gemini.mitreAttackId || pickMitre(pattern.mitreHints);
    aiPowered       = true;
  } else {
    // Offline-only: derive from rule engine + pattern
    finalCategory   = (RULE_TO_CATEGORY[dominant.category] || "Unknown") as ThreatCategory;
    finalSeverity   = baselineSeverity;
    finalConfidence = Math.round(baselineRisk * 0.7 + pattern.riskScore * 0.3);
    finalMitre      = pickMitre(pattern.mitreHints);
    aiPowered       = false;

    // Build offline summary from detected signals
    const flags = pattern.urgencyFlags.length
      ? ` Urgency signals detected: ${pattern.urgencyFlags.slice(0, 2).join("; ")}.`
      : "";
    finalSummary    = `Offline classification: ${finalCategory} threat detected with ${baselineRisk.toFixed(0)}/100 baseline risk score.${flags} Gemini enrichment ${geminiSkipped ? "skipped (low risk)" : "unavailable — API key not configured"}.`;
    finalMitigation = generateOfflineMitigation(finalCategory);
    finalActor      = "Unknown — requires manual investigation or Gemini enrichment.";
  }

  const iocs = mergeIocs(pattern.iocHints, gemini?.compromisedIndicators);

  return {
    processedAt:  new Date().toISOString(),
    processingMs: Date.now() - startMs,
    pipeline: {
      offlineRulesRan:   true,
      patternEngineRan:  true,
      geminiEnriched:    !!gemini,
      geminiSkipped,
      geminiSkipReason,
    },
    offline: {
      ruleScores,
      dominantRule: dominant.category,
      pattern,
      baselineRisk,
      baselineSeverity,
    },
    gemini: gemini || null,
    final: {
      category:           finalCategory,
      severity:           finalSeverity,
      confidence:         Math.min(finalConfidence, 100),
      analysisSummary:    finalSummary,
      mitigationAdvice:   finalMitigation,
      threatActorProfile: finalActor,
      mitreAttackId:      finalMitre,
      etcaSection:        ETCA_MAP[finalCategory] || ETCA_MAP["Unknown"],
      aiPowered,
      compromisedIndicators: iocs,
    },
  };
}

// ─── Offline mitigation templates ────────────────────────────────────────────
function generateOfflineMitigation(category: ThreatCategory): string {
  const mitigations: Record<string, string> = {
    "Fraud":              "1. Freeze associated mobile money agent IDs.\n2. Contact Airtel Money / TNM Mpamba security teams immediately.\n3. Escalate to Reserve Bank of Malawi Financial Intelligence Unit.\n4. Preserve transaction logs for forensic analysis.",
    "Phishing":           "1. Add spoofed domain to MACRA national DNS blocklist.\n2. Issue phishing alert via MACERT to all ISPs and banks.\n3. Force password reset for all users who accessed the fake portal.\n4. Coordinate with MRA / government IT to take down impersonation sites.",
    "SIM Swap":           "1. Contact carrier (Airtel/TNM) to freeze SIM immediately.\n2. Request carrier logs for SIM replacement authorization.\n3. Reset all mobile money PINs and notify associated financial accounts.\n4. File report with Malawi Police Cybercrime Unit.",
    "Malware":            "1. Isolate affected endpoints from the network immediately.\n2. Quarantine all identified malicious files.\n3. Run full endpoint sweep for lateral movement.\n4. Update AV/EDR signatures and submit sample to MACERT.",
    "Ransomware":         "1. IMMEDIATELY disconnect affected systems from network (unplug cable, disable Wi-Fi).\n2. Do NOT pay the ransom.\n3. Contact MACERT for national incident response.\n4. Restore from verified offline backups only after forensic clearance.",
    "Network Intrusion":  "1. Apply upstream rate limiting via ISP.\n2. Activate network scrubbing / null routing for attack IPs.\n3. Review and close unauthorized firewall rules.\n4. Escalate to MACERT for attribution support.",
    "Social Engineering": "1. Immediately brief all staff — do not share OTPs/PINs over phone.\n2. Issue organization-wide alert about impersonation campaign.\n3. Report impersonating phone numbers to Malawi Police and carrier.\n4. Enable secondary authentication on all critical accounts.",
    "System Breach":      "1. Activate incident response playbook immediately.\n2. Isolate compromised systems and revoke all active sessions.\n3. Engage MACERT National Incident Response Team.\n4. Preserve all logs for forensic chain-of-custody.",
    "Data Exfiltration":  "1. Identify and block exfiltration channels (email, USB, cloud).\n2. Notify affected individuals per Malawi Data Protection Act 2024.\n3. Engage Malawi Communications Regulatory Authority (MACRA).\n4. Conduct data classification audit across all affected systems.",
    "Unauthorized Access":"1. Force immediate credential rotation across affected systems.\n2. Review and restrict network access scopes.\n3. Enable MFA on all administrative accounts.\n4. Review audit logs for lateral movement indicators.",
    "DDoS":               "1. Contact upstream ISP to enable DDoS scrubbing.\n2. Implement rate limiting and traffic shaping at perimeter.\n3. Activate CDN / anycast routing if available.\n4. Document attack vectors for MACERT reporting.",
    // ── New social media / account theft categories ──
    "Account Theft":      "1. Report the fake/hijacked account to the platform (Facebook, WhatsApp, TikTok) immediately using their official reporting tool.\n2. If WhatsApp: re-register with your phone number and enable two-step verification.\n3. If Facebook: use facebook.com/hacked and follow account recovery steps.\n4. Document all evidence (screenshots, post URLs, timestamps) with SHA-256 hash.\n5. File report with Malawi Police Cybercrime Unit under ETCA 2016 Section 17.\n6. If blackmail/sextortion is involved: contact MACERT immediately — do NOT comply with demands.",
    "Social Media Attack": "1. Capture and preserve all offensive content with timestamps before reporting.\n2. Report the offending account to the platform and request expedited review.\n3. Issue a MACRA-backed platform preservation request under ETCA 2016 Section 33.\n4. Block attacker account and enable enhanced privacy settings on victim's account.\n5. If harassment campaign: correlate usernames across platforms via OSINT.\n6. Refer to Malawi Police Cybercrime Unit — cyberbullying is an offence under ETCA 2016.",
    "Unknown":            "1. Escalate to senior analyst for manual triage.\n2. Preserve all logs and system state immediately.\n3. Do not alter any evidence.\n4. Report to MACERT for threat intelligence correlation.",
  };
  return mitigations[category] || mitigations["Unknown"];
}
