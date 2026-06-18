/**
 * Priority Engine Unit Tests
 *
 * Tests: incident priority scoring, risk level thresholds,
 * sector criticality weighting, and edge cases.
 */
import { describe, it, expect } from "vitest";

// ─── Priority scoring logic (mirrored from priorityEngine.ts) ────────────────

type IncidentInput = {
  severity:    string;
  category:    string;
  sector:      string;
  affectedUsers: number;
  estimatedLoss: number;
};

function computePriority(inc: IncidentInput): { score: number; level: string } {
  let score = 0;

  // Severity
  if (inc.severity === "Critical") score += 40;
  else if (inc.severity === "High") score += 30;
  else if (inc.severity === "Medium") score += 15;
  else score += 5;

  // Category
  if (["Ransomware", "Data Breach", "Financial Fraud"].includes(inc.category)) score += 20;
  else if (["Phishing", "DDoS"].includes(inc.category)) score += 10;

  // Sector criticality
  if (["Banking", "Healthcare", "Government", "Energy"].includes(inc.sector)) score += 15;
  else if (["Telecom", "Education"].includes(inc.sector)) score += 8;

  // Scale
  if (inc.affectedUsers > 1000) score += 15;
  else if (inc.affectedUsers > 100)  score += 8;

  // Financial impact
  if (inc.estimatedLoss > 100000) score += 10;

  const capped = Math.min(score, 100);
  const level  = capped >= 80 ? "Critical" : capped >= 60 ? "High" : capped >= 35 ? "Medium" : "Low";
  return { score: capped, level };
}

describe("priority engine — severity", () => {
  it("gives highest score for Critical severity", () => {
    const { score } = computePriority({ severity: "Critical", category: "Other", sector: "Other", affectedUsers: 0, estimatedLoss: 0 });
    expect(score).toBeGreaterThanOrEqual(40);
  });

  it("gives lowest score for Low severity", () => {
    const { score } = computePriority({ severity: "Low", category: "Other", sector: "Other", affectedUsers: 0, estimatedLoss: 0 });
    expect(score).toBeLessThan(15);
  });
});

describe("priority engine — sector weighting", () => {
  it("adds extra weight for Banking sector", () => {
    const base    = computePriority({ severity: "Medium", category: "Phishing", sector: "Other",   affectedUsers: 0, estimatedLoss: 0 });
    const banking = computePriority({ severity: "Medium", category: "Phishing", sector: "Banking", affectedUsers: 0, estimatedLoss: 0 });
    expect(banking.score).toBeGreaterThan(base.score);
  });

  it("adds extra weight for Government sector", () => {
    const base = computePriority({ severity: "Medium", category: "Phishing", sector: "Other",      affectedUsers: 0, estimatedLoss: 0 });
    const gov  = computePriority({ severity: "Medium", category: "Phishing", sector: "Government", affectedUsers: 0, estimatedLoss: 0 });
    expect(gov.score).toBeGreaterThan(base.score);
  });
});

describe("priority engine — level thresholds", () => {
  it("caps score at 100", () => {
    const { score } = computePriority({ severity: "Critical", category: "Ransomware", sector: "Banking", affectedUsers: 5000, estimatedLoss: 500000 });
    expect(score).toBe(100);
  });

  it("returns Critical level for score >= 80", () => {
    const { level } = computePriority({ severity: "Critical", category: "Ransomware", sector: "Banking", affectedUsers: 5000, estimatedLoss: 500000 });
    expect(level).toBe("Critical");
  });

  it("returns Low level for minimal incidents", () => {
    const { level } = computePriority({ severity: "Low", category: "Other", sector: "Other", affectedUsers: 0, estimatedLoss: 0 });
    expect(level).toBe("Low");
  });
});

describe("priority engine — scale factors", () => {
  it("increases score for large affected user count", () => {
    const small = computePriority({ severity: "High", category: "DDoS", sector: "Telecom", affectedUsers: 10,   estimatedLoss: 0 });
    const large = computePriority({ severity: "High", category: "DDoS", sector: "Telecom", affectedUsers: 5000, estimatedLoss: 0 });
    expect(large.score).toBeGreaterThan(small.score);
  });

  it("increases score for large financial loss", () => {
    const low  = computePriority({ severity: "High", category: "Financial Fraud", sector: "Banking", affectedUsers: 0, estimatedLoss: 0 });
    const high = computePriority({ severity: "High", category: "Financial Fraud", sector: "Banking", affectedUsers: 0, estimatedLoss: 200000 });
    expect(high.score).toBeGreaterThan(low.score);
  });
});
