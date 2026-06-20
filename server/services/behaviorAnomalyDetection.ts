/**
 * Behavioral Anomaly Detection Engine
 * ------------------------------------
 * Maintains per-user & per-IP rolling baselines and scores deviations
 * as anomaly signals. Detects:
 *   • Low-and-slow brute force / credential stuffing
 *   • Distributed exfiltration patterns (many reads, large payloads)
 *   • Insider privilege escalation probes
 *   • Off-hours access spikes
 *
 * Each baseline window resets every BASELINE_WINDOW_MS.
 * Anomaly scores ≥ ALERT_THRESHOLD trigger an event on the eventBus.
 */

import { EventEmitter } from "events";

// ─── Configuration ────────────────────────────────────────────────────────────
const BASELINE_WINDOW_MS  = 5 * 60_000;   // 5-minute rolling window
const PURGE_INTERVAL_MS   = 15 * 60_000;  // purge stale entries every 15 min
const ALERT_THRESHOLD     = 75;            // anomaly score 0-100
const EXFIL_BYTE_LIMIT    = 10 * 1024 * 1024; // 10 MB in a single window → exfil flag
const MAX_FAIL_AUTH       = 20;            // failed auths before score spike
const MAX_REQUESTS        = 300;           // requests/window before anomaly

// ─── Types ────────────────────────────────────────────────────────────────────
export interface BehaviorProfile {
  userId:        string | null;
  ip:            string;
  windowStart:   number;
  requestCount:  number;
  failedAuths:   number;
  bytesRead:     number;
  bytesWritten:  number;
  endpoints:     Map<string, number>;   // endpoint → hit count
  privilegeOps:  number;               // admin/sensitive endpoint hits
  offHoursHits:  number;               // requests outside 06:00-22:00 local
  anomalyScore:  number;
  lastSeen:      number;
  alerts:        AnomalyAlert[];
}

export interface AnomalyAlert {
  type:      AnomalyType;
  score:     number;
  detail:    string;
  timestamp: string;
}

export type AnomalyType =
  | "CREDENTIAL_STUFFING"
  | "SLOW_EXFILTRATION"
  | "RATE_SPIKE"
  | "PRIVILEGE_PROBE"
  | "OFF_HOURS_ANOMALY"
  | "ENDPOINT_SCANNING";

// ─── Sensitive endpoint patterns ─────────────────────────────────────────────
const PRIVILEGED_PATTERNS = [
  /\/api\/auth\/mfa/,
  /\/api\/users/,
  /\/api\/audit/,
  /\/api\/policies/,
  /\/api\/billing/,
  /\/api\/redteam/,
  /\/api\/break-glass/,
];

// ─── In-memory store (replace with Redis in production) ───────────────────────
const profiles = new Map<string, BehaviorProfile>();

// ─── Event Bus ───────────────────────────────────────────────────────────────
export const anomalyBus = new EventEmitter();

// ─── Helper: key ─────────────────────────────────────────────────────────────
function profileKey(ip: string, userId: string | null): string {
  return userId ? `user:${userId}` : `ip:${ip}`;
}

// ─── Get or initialise profile ───────────────────────────────────────────────
function getProfile(ip: string, userId: string | null): BehaviorProfile {
  const key = profileKey(ip, userId);
  const now  = Date.now();
  let   p    = profiles.get(key);

  if (!p || now - p.windowStart > BASELINE_WINDOW_MS) {
    p = {
      userId,
      ip,
      windowStart:   now,
      requestCount:  0,
      failedAuths:   0,
      bytesRead:     0,
      bytesWritten:  0,
      endpoints:     new Map(),
      privilegeOps:  0,
      offHoursHits:  0,
      anomalyScore:  0,
      lastSeen:      now,
      alerts:        [],
    };
    profiles.set(key, p);
  }
  return p;
}

// ─── Compute anomaly score ────────────────────────────────────────────────────
function computeScore(p: BehaviorProfile): { score: number; alerts: AnomalyAlert[] } {
  const alerts: AnomalyAlert[] = [];
  let score = 0;

  // 1. Rate spike
  if (p.requestCount > MAX_REQUESTS) {
    const delta = Math.min(((p.requestCount - MAX_REQUESTS) / MAX_REQUESTS) * 40, 40);
    score += delta;
    alerts.push({
      type:      "RATE_SPIKE",
      score:     delta,
      detail:    `${p.requestCount} requests in window (limit: ${MAX_REQUESTS})`,
      timestamp: new Date().toISOString(),
    });
  }

  // 2. Credential stuffing
  if (p.failedAuths > MAX_FAIL_AUTH) {
    const delta = Math.min(((p.failedAuths / MAX_FAIL_AUTH) - 1) * 35 + 20, 50);
    score += delta;
    alerts.push({
      type:      "CREDENTIAL_STUFFING",
      score:     delta,
      detail:    `${p.failedAuths} failed auth attempts in window`,
      timestamp: new Date().toISOString(),
    });
  }

  // 3. Slow exfiltration
  if (p.bytesRead > EXFIL_BYTE_LIMIT) {
    const delta = Math.min(((p.bytesRead / EXFIL_BYTE_LIMIT) - 1) * 20 + 25, 40);
    score += delta;
    alerts.push({
      type:      "SLOW_EXFILTRATION",
      score:     delta,
      detail:    `${(p.bytesRead / 1_048_576).toFixed(1)} MB read in window`,
      timestamp: new Date().toISOString(),
    });
  }

  // 4. Privilege probing
  if (p.privilegeOps > 15) {
    const delta = Math.min((p.privilegeOps / 15) * 20, 30);
    score += delta;
    alerts.push({
      type:      "PRIVILEGE_PROBE",
      score:     delta,
      detail:    `${p.privilegeOps} privileged endpoint hits in window`,
      timestamp: new Date().toISOString(),
    });
  }

  // 5. Off-hours anomaly
  if (p.offHoursHits > 50) {
    const delta = Math.min((p.offHoursHits / 50) * 15, 20);
    score += delta;
    alerts.push({
      type:      "OFF_HOURS_ANOMALY",
      score:     delta,
      detail:    `${p.offHoursHits} requests outside 06:00-22:00`,
      timestamp: new Date().toISOString(),
    });
  }

  // 6. Endpoint scanning (many unique endpoints → reconnaissance)
  const uniqueEndpoints = p.endpoints.size;
  if (uniqueEndpoints > 30) {
    const delta = Math.min(((uniqueEndpoints - 30) / 10) * 10, 25);
    score += delta;
    alerts.push({
      type:      "ENDPOINT_SCANNING",
      score:     delta,
      detail:    `${uniqueEndpoints} unique endpoints accessed in window`,
      timestamp: new Date().toISOString(),
    });
  }

  return { score: Math.min(Math.round(score), 100), alerts };
}

// ─── Main: record a request ───────────────────────────────────────────────────
export function recordRequest(opts: {
  ip:            string;
  userId?:       string | null;
  endpoint:      string;
  method:        string;
  statusCode:    number;
  responseBytes: number;
  requestBytes:  number;
}) {
  const { ip, userId = null, endpoint, method, statusCode, responseBytes, requestBytes } = opts;
  const p   = getProfile(ip, userId);
  const now = Date.now();
  const hour = new Date().getHours();

  p.requestCount++;
  p.lastSeen = now;
  p.endpoints.set(endpoint, (p.endpoints.get(endpoint) ?? 0) + 1);
  p.bytesRead    += responseBytes;
  p.bytesWritten += requestBytes;

  // Failed auth tracking
  if ((endpoint.includes("/auth") || endpoint.includes("/login")) && statusCode === 401) {
    p.failedAuths++;
  }

  // Privileged endpoint tracking
  if (PRIVILEGED_PATTERNS.some(rx => rx.test(endpoint))) {
    p.privilegeOps++;
  }

  // Off-hours detection (UTC offset +2 for Malawi time)
  const malawiHour = (hour + 2) % 24;
  if (malawiHour < 6 || malawiHour >= 22) {
    p.offHoursHits++;
  }

  // Score and alert
  const { score, alerts } = computeScore(p);
  p.anomalyScore = score;
  p.alerts       = alerts;

  if (score >= ALERT_THRESHOLD) {
    anomalyBus.emit("anomaly", {
      key:    profileKey(ip, userId),
      ip,
      userId,
      score,
      alerts,
      profile: summarizeProfile(p),
    });
  }
}

// ─── Public read API ──────────────────────────────────────────────────────────
export function summarizeProfile(p: BehaviorProfile) {
  return {
    userId:       p.userId,
    ip:           p.ip,
    windowStart:  new Date(p.windowStart).toISOString(),
    requests:     p.requestCount,
    failedAuths:  p.failedAuths,
    bytesRead:    p.bytesRead,
    privilegeOps: p.privilegeOps,
    offHoursHits: p.offHoursHits,
    uniqueEndpoints: p.endpoints.size,
    anomalyScore: p.anomalyScore,
    alerts:       p.alerts,
  };
}

export function getAllProfiles(): ReturnType<typeof summarizeProfile>[] {
  return Array.from(profiles.values()).map(summarizeProfile);
}

export function getTopAnomalies(limit = 20) {
  return Array.from(profiles.values())
    .map(summarizeProfile)
    .sort((a, b) => b.anomalyScore - a.anomalyScore)
    .slice(0, limit);
}

// ─── Periodic purge of stale profiles ───────────────────────────────────────
setInterval(() => {
  const cutoff = Date.now() - BASELINE_WINDOW_MS * 2;
  for (const [key, p] of profiles) {
    if (p.lastSeen < cutoff) profiles.delete(key);
  }
}, PURGE_INTERVAL_MS);
