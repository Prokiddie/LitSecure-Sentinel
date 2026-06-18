/**
 * LitSecure Sentinel — AI Pipeline Types
 * Shared type definitions for the hybrid offline+Gemini classification system.
 */

export type ThreatCategory =
  | "Fraud"
  | "Phishing"
  | "Malware"
  | "SIM Swap"
  | "Ransomware"
  | "Network Intrusion"
  | "Unauthorized Access"
  | "Social Engineering"
  | "System Breach"
  | "Data Exfiltration"
  | "Account Theft"
  | "Social Media Attack"
  | "DDoS"
  | "Unknown";

export type Severity = "Low" | "Medium" | "High" | "Critical";
export type Confidence = "low" | "medium" | "high" | "very_high";

// ─── Rule Engine Output ───────────────────────────────────────────────────────
export interface RuleScores {
  fraud:            number;
  phishing:         number;
  malware:          number;
  simSwap:          number;
  ransomware:       number;
  intrusion:        number;
  socialEngineering:number;
  socialMedia:      number;  // account theft, cyberbullying, impersonation
  dataExfil:        number;
}

// ─── Pattern Engine Output ────────────────────────────────────────────────────
export interface PatternResult {
  riskScore:   number;       // 0–100
  confidence:  Confidence;
  urgencyFlags: string[];    // matched urgency signals
  iocHints:    {
    phones:    string[];
    ips:       string[];
    domains:   string[];
    hashes:    string[];
    amounts:   string[];     // financial amounts (MWK, USD)
  };
  mitreHints:  string[];     // MITRE ATT&CK tactic codes detected offline
  watchlistHits: string[];   // watchlisted entities matched
}

// ─── Gemini Enrichment Output ─────────────────────────────────────────────────
export interface GeminiResult {
  category:           ThreatCategory;
  severity:           Severity;
  confidence:         number;           // 0–100
  analysisSummary:    string;
  mitigationAdvice:   string;
  threatActorProfile: string;
  mitreAttackId:      string;
  malawianContext:    string;           // Malawi-specific intelligence
  compromisedIndicators: {
    phoneNumbers: string[];
    ips:          string[];
    domains:      string[];
    devices:      string[];
    amounts:      string[];
  };
}

// ─── Final Pipeline Output ────────────────────────────────────────────────────
export interface PipelineResult {
  // Metadata
  processedAt:    string;
  processingMs:   number;
  pipeline: {
    offlineRulesRan:   boolean;
    patternEngineRan:  boolean;
    geminiEnriched:    boolean;
    geminiSkipped:     boolean;
    geminiSkipReason?: string;
  };

  // Offline layer
  offline: {
    ruleScores:    RuleScores;
    dominantRule:  string;
    pattern:       PatternResult;
    baselineRisk:  number;             // 0–100 merged risk
    baselineSeverity: Severity;
  };

  // Gemini enrichment (null if skipped)
  gemini: GeminiResult | null;

  // Final fused decision
  final: {
    category:           ThreatCategory;
    severity:           Severity;
    confidence:         number;
    analysisSummary:    string;
    mitigationAdvice:   string;
    threatActorProfile: string;
    mitreAttackId:      string;
    etcaSection:        string;  // Malawi ETCA 2016 legal section
    aiPowered:          boolean;
    compromisedIndicators: {
      phoneNumbers: string[];
      ips:          string[];
      domains:      string[];
      devices:      string[];
    };
  };
}
