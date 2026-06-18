/**
 * LitSecure Sentinel — Automated Incident Priority Scoring Engine
 * Scores incidents 0-100 across 5 weighted factors.
 * Does NOT override manually-set severity — only adds a priority_score field.
 */

export type PriorityLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface PriorityResult {
  score: number;
  level: PriorityLevel;
  factors: string[];
}

const CRITICAL_SECTORS = ["Banking", "Telecom", "Utilities", "Healthcare", "Government"];

function userImpactScore(users: number): number {
  if (users > 10_000) return 20;
  if (users >  1_000) return 15;
  if (users >    100) return 10;
  if (users >     10) return 5;
  return 0;
}

function financialImpactScore(lossMwk: number): number {
  if (lossMwk > 50_000_000) return 20; // >50M MWK
  if (lossMwk > 10_000_000) return 15;
  if (lossMwk >  1_000_000) return 10;
  if (lossMwk >    100_000) return 5;
  return 0;
}

function toLevel(score: number): PriorityLevel {
  if (score >= 80) return "CRITICAL";
  if (score >= 60) return "HIGH";
  if (score >= 40) return "MEDIUM";
  return "LOW";
}

/**
 * Calculate priority for an incident.
 * Input can be a partial row from the incidents table or a frontend Incident object.
 */
export function calculatePriority(incident: {
  aiConfidence?: number;      // 0-100
  ai_confidence?: number;     // DB snake_case variant
  affectedUsers?: number;
  affected_users?: number;
  estimatedLoss?: number;
  estimated_loss?: number;
  sector?: string;
  campaignId?: string;
  campaign_id?: string;
  severity?: string;          // bonus for Critical/High severity from AI
}): PriorityResult {
  let score = 0;
  const factors: string[] = [];

  // ─── 1. AI Confidence (35% weight → max 35pts) ───────────────────────────
  const aiConf = incident.aiConfidence ?? incident.ai_confidence ?? 0;
  const aiPts  = Math.round(aiConf * 0.35);
  score += aiPts;
  if (aiConf >= 80) factors.push(`High AI confidence (${aiConf}%)`);

  // ─── 2. Affected Users (max 20pts) ───────────────────────────────────────
  const users   = incident.affectedUsers ?? incident.affected_users ?? 0;
  const userPts = userImpactScore(users);
  score += userPts;
  if (userPts >= 10) factors.push(`Large user impact (${users.toLocaleString()} users)`);

  // ─── 3. Financial Impact (max 20pts) ─────────────────────────────────────
  const loss    = incident.estimatedLoss ?? incident.estimated_loss ?? 0;
  const finPts  = financialImpactScore(loss);
  score += finPts;
  if (finPts >= 10) factors.push(`Financial impact: MWK ${(loss / 1_000_000).toFixed(1)}M`);

  // ─── 4. Sector Criticality (15pts flat) ──────────────────────────────────
  const sector = incident.sector ?? "";
  if (CRITICAL_SECTORS.some(s => s.toLowerCase() === sector.toLowerCase())) {
    score += 15;
    factors.push(`Critical sector: ${sector}`);
  }

  // ─── 5. Campaign Correlation (10pts flat) ────────────────────────────────
  const campId = incident.campaignId ?? incident.campaign_id;
  if (campId) {
    score += 10;
    factors.push(`Part of coordinated campaign (${campId})`);
  }

  // ─── 6. Severity bonus (+5 for Critical, +3 for High) ────────────────────
  if (incident.severity === "Critical") {
    score += 5;
    factors.push("AI-classified Critical severity");
  } else if (incident.severity === "High") {
    score += 3;
  }

  score = Math.min(100, Math.round(score));

  return { score, level: toLevel(score), factors };
}
