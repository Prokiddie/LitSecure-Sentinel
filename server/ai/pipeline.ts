/**
 * LitSecure Sentinel — AI Pipeline Entry Point
 * Orchestrates the 4-stage hybrid analysis:
 *   Stage 1: Offline Rule Engine       (instant, deterministic)
 *   Stage 2: Local Pattern Engine      (heuristics, IOC extraction, MITRE hints)
 *   Stage 3: Gemini Enrichment         (only when baseline risk > GEMINI_THRESHOLD)
 *   Stage 4: Decision Fusion           (fuses offline + Gemini into final result)
 *
 * Export: analyzeIncidentPipeline() — drop-in replacement for analyzeIncidentWithAI()
 */
import { runOfflineRules, getDominantRule } from "./offlineRules.js";
import { runPatternEngine } from "./patternEngine.js";
import { analyzeWithGemini } from "./geminiClient.js";
import { fuseDecision } from "./decisionEngine.js";
import type { PipelineResult } from "./types.js";

// ─── Config ───────────────────────────────────────────────────────────────────
/**
 * Minimum baseline risk to trigger Gemini enrichment.
 * Below this threshold, offline analysis is returned immediately (saves API cost).
 * Range: 0–100. Recommended: 35 (catches all Medium+ threats).
 */
const GEMINI_THRESHOLD = 35;

// ─── Main pipeline ────────────────────────────────────────────────────────────
export async function analyzeIncidentPipeline(
  title: string,
  description: string
): Promise<PipelineResult> {
  const startMs = Date.now();
  const text = `${title} ${description}`;

  // ── STAGE 1: Offline Rule Engine ─────────────────────────────────────────────
  const ruleScores = runOfflineRules(text);
  const dominant   = getDominantRule(ruleScores);

  // ── STAGE 2: Pattern Engine ───────────────────────────────────────────────────
  const pattern = runPatternEngine(text);

  // ── STAGE 3: Merge offline scores → baseline risk ─────────────────────────────
  //  60% rule engine (dominant category score), 40% pattern engine heuristics
  const ruleMax     = Math.max(...Object.values(ruleScores));
  const baselineRisk = Math.min(ruleMax * 0.6 + pattern.riskScore * 0.4, 100);

  // ── STAGE 4: Gemini Enrichment (conditional) ──────────────────────────────────
  let gemini = null;
  let geminiSkipped = false;
  let geminiSkipReason: string | undefined;

  if (baselineRisk >= GEMINI_THRESHOLD) {
    gemini = await analyzeWithGemini(title, description, ruleScores, pattern);
    if (!gemini) {
      // Gemini tried but failed (API key missing or call errored)
      geminiSkipReason = "Gemini API unavailable — using offline analysis only";
    }
  } else {
    geminiSkipped    = true;
    geminiSkipReason = `Baseline risk ${baselineRisk.toFixed(0)}/100 below threshold ${GEMINI_THRESHOLD} — offline analysis sufficient`;
  }

  // ── STAGE 5: Decision Fusion ───────────────────────────────────────────────────
  return fuseDecision({
    startMs,
    ruleScores,
    dominant,
    pattern,
    baselineRisk,
    gemini,
    geminiSkipped,
    geminiSkipReason,
  });
}

// ─── Adapter: maps PipelineResult → legacy analyzeIncidentWithAI shape ────────
// This lets the incidents route keep calling the same function signature
export async function analyzeIncidentWithAIPipeline(title: string, description: string) {
  try {
    const result = await analyzeIncidentPipeline(title, description);
    const { final, offline } = result;

    // Normalise category to lowercase for Supabase enum compatibility
    const category = (final.category || "unknown").toLowerCase().replace(/ /g, "_") as string;

    return {
      category,
      severity:           final.severity,
      confidence:         final.confidence / 100,
      analysisSummary:    final.analysisSummary,
      mitigationAdvice:   final.mitigationAdvice,
      threatActorProfile: final.threatActorProfile,
      aiPowered:          final.aiPowered,
      pipeline:           result.pipeline,
      baselineRisk:       offline.baselineRisk,
      mitreAttackId:      final.mitreAttackId,
      compromisedIndicators: {
        phoneNumbers: final.compromisedIndicators.phoneNumbers ?? [],
        ips:          final.compromisedIndicators.ips ?? [],
        domains:      final.compromisedIndicators.domains ?? [],
        devices:      final.compromisedIndicators.devices ?? [],
      },
    };
  } catch (err) {
    console.error("[Pipeline] analyzeIncidentWithAIPipeline threw — using safe fallback:", err);
    return {
      category:           "unknown",
      severity:           "Medium" as const,
      confidence:         0.3,
      analysisSummary:    "Offline classification only — AI pipeline encountered an error. Manual review required.",
      mitigationAdvice:   "1. Escalate to senior analyst.\n2. Preserve all evidence.\n3. Contact MACERT: +265 (0) 111 789 101.",
      threatActorProfile: "Unknown — manual investigation required.",
      aiPowered:          false,
      pipeline:           { offlineRulesRan: false, patternEngineRan: false, geminiEnriched: false, geminiSkipped: true, geminiSkipReason: "Pipeline error" },
      baselineRisk:       30,
      mitreAttackId:      "T0000",
      compromisedIndicators: { phoneNumbers: [], ips: [], domains: [], devices: [] },
    };
  }
}
