/**
 * Persistent Red Team Engine
 * ---------------------------
 * An always-on, internal attack simulation layer that targets the running
 * LitSecure API to continuously verify that defences are holding.
 *
 * Attack categories
 *   1. Credential stuffing  — rotates common password lists against /api/auth/login
 *   2. API fuzzing          — malformed / boundary payloads on all major endpoints
 *   3. Endpoint scanning    — walks all registered routes looking for exposed info
 *   4. Chaos / chaos HTTP   — random verbs, huge bodies, invalid JSON
 *   5. Exfiltration probe   — high-volume read bursts to trigger anomaly detection
 *
 * Results are stored in-memory (ring buffer) and exposed via /api/redteam/*
 * The engine schedules attacks on configurable cron-style intervals.
 */

import http from "http";

// ─── Config ───────────────────────────────────────────────────────────────────
const BASE_URL      = `http://localhost:${process.env.PORT || 3000}`;
const ATTACK_INTERVAL_MS = 10 * 60_000;   // full suite every 10 minutes
const RING_SIZE     = 500;                 // max results kept in memory

// ─── Types ────────────────────────────────────────────────────────────────────
export type AttackCategory =
  | "CREDENTIAL_STUFFING"
  | "API_FUZZING"
  | "ENDPOINT_SCANNING"
  | "CHAOS_HTTP"
  | "EXFIL_PROBE"
  | "PROMPT_INJECTION";

export type AttackResult = "BLOCKED" | "DETECTED" | "PASSED" | "ERROR";

export interface AttackRecord {
  id:         string;
  category:   AttackCategory;
  target:     string;
  payload?:   string;
  statusCode: number | null;
  result:     AttackResult;
  latencyMs:  number;
  detail:     string;
  timestamp:  string;
}

// ─── Ring buffer ──────────────────────────────────────────────────────────────
const ring: AttackRecord[] = [];
let   ringHead = 0;

function pushRecord(rec: Omit<AttackRecord, "id">) {
  const full = { id: `rt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, ...rec };
  if (ring.length < RING_SIZE) {
    ring.push(full);
  } else {
    ring[ringHead] = full;
    ringHead = (ringHead + 1) % RING_SIZE;
  }
}

// ─── HTTP helper (raw Node http — avoids axios dep conflicts) ─────────────────
function request(opts: {
  path:    string;
  method:  string;
  body?:   string;
  headers?: Record<string, string>;
}): Promise<{ status: number; body: string; ms: number }> {
  return new Promise((resolve) => {
    const url    = new URL(opts.path, BASE_URL);
    const t0     = Date.now();
    const body   = opts.body ?? "";
    const req    = http.request(
      {
        hostname: url.hostname,
        port:     url.port || 3000,
        path:     url.pathname + url.search,
        method:   opts.method,
        headers:  {
          "Content-Type":   "application/json",
          "Content-Length": Buffer.byteLength(body).toString(),
          "X-Red-Team":     "internal-simulation",
          ...(opts.headers ?? {}),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end",  () =>
          resolve({ status: res.statusCode ?? 0, body: data, ms: Date.now() - t0 })
        );
      }
    );
    req.on("error", () => resolve({ status: 0, body: "", ms: Date.now() - t0 }));
    req.setTimeout(8000, () => { req.destroy(); resolve({ status: 0, body: "timeout", ms: 8000 }); });
    if (body) req.write(body);
    req.end();
  });
}

// ─── 1. Credential Stuffing ────────────────────────────────────────────────────
const COMMON_PASSWORDS = [
  "password", "123456", "admin", "qwerty", "letmein", "monkey",
  "1234567890", "welcome", "login", "admin123", "pass@word1",
];
const STUB_EMAILS = [
  "admin@macra.mw", "test@macra.mw", "user@macra.mw", "root@litsecure.mw",
];

async function runCredentialStuffing() {
  for (const email of STUB_EMAILS) {
    for (const pw of COMMON_PASSWORDS) {
      const res = await request({
        path:   "/api/auth/login",
        method: "POST",
        body:   JSON.stringify({ email, password: pw }),
      });
      const result: AttackResult =
        res.status === 401 || res.status === 403 || res.status === 429
          ? "BLOCKED"
          : res.status === 200
          ? "PASSED"   // ← would be a critical finding
          : "ERROR";

      pushRecord({
        category:   "CREDENTIAL_STUFFING",
        target:     "/api/auth/login",
        payload:    `${email}:${pw}`,
        statusCode: res.status,
        result,
        latencyMs:  res.ms,
        detail:     result === "PASSED"
          ? `⚠️ CRITICAL: credentials accepted — ${email}:${pw}`
          : `Rejected with ${res.status}`,
        timestamp:  new Date().toISOString(),
      });

      if (result === "PASSED") {
        console.error(`[RedTeam] 🚨 CREDENTIAL STUFFING SUCCESS: ${email}:${pw}`);
      }

      // Throttle to avoid self-DoS
      await sleep(200);
    }
  }
}

// ─── 2. API Fuzzing ────────────────────────────────────────────────────────────
const FUZZ_TARGETS: Array<{ path: string; method: string }> = [
  { path: "/api/public/report",   method: "POST" },
  { path: "/api/incidents",       method: "GET"  },
  { path: "/api/auth/login",      method: "POST" },
  { path: "/api/health",          method: "GET"  },
  { path: "/api/ai/analyze",      method: "POST" },
];

const FUZZ_PAYLOADS = [
  null,
  "",
  "{}",
  JSON.stringify({ title: "<script>alert(1)</script>", description: "x".repeat(200) }),
  JSON.stringify({ title: "' OR 1=1 --", description: "x".repeat(200) }),
  JSON.stringify({ title: "\x00\x01\x02", description: "\xFF".repeat(50) }),
  JSON.stringify({ title: "A".repeat(10_000), description: "overflow test" }),
  JSON.stringify({ nested: { deeply: { obj: { arr: new Array(100).fill("x") } } } }),
];

async function runApiFuzzing() {
  for (const target of FUZZ_TARGETS) {
    for (const payload of FUZZ_PAYLOADS) {
      const res = await request({
        path:   target.path,
        method: target.method,
        body:   payload ?? undefined,
      });

      const result: AttackResult =
        res.status >= 500  ? "PASSED"   // server crash — finding!
        : res.status === 0 ? "ERROR"
        :                    "BLOCKED";

      pushRecord({
        category:   "API_FUZZING",
        target:     `${target.method} ${target.path}`,
        payload:    typeof payload === "string" ? payload.slice(0, 120) : "(null)",
        statusCode: res.status,
        result,
        latencyMs:  res.ms,
        detail:     result === "PASSED"
          ? `⚠️ Server returned ${res.status} on fuzz input`
          : `Handled gracefully — ${res.status}`,
        timestamp:  new Date().toISOString(),
      });

      await sleep(100);
    }
  }
}

// ─── 3. Endpoint Scanning ──────────────────────────────────────────────────────
const SCAN_PATHS = [
  "/api/admin", "/api/debug", "/api/config", "/.env", "/api/internal",
  "/api/users", "/api/audit-logs", "/api/billing", "/api/break-glass",
  "/api/redteam/results", "/.git/config", "/server.ts", "/package.json",
];

async function runEndpointScanning() {
  for (const scanPath of SCAN_PATHS) {
    const res = await request({ path: scanPath, method: "GET" });

    // 200 on unauthenticated sensitive path → finding
    const isSensitive = ["/api/admin", "/api/debug", "/.env", "/.git", "/server.ts"].some(
      p => scanPath.startsWith(p)
    );
    const result: AttackResult =
      res.status === 200 && isSensitive ? "PASSED"
      : res.status === 401 || res.status === 403 || res.status === 404
      ? "BLOCKED"
      : "ERROR";

    pushRecord({
      category:   "ENDPOINT_SCANNING",
      target:     scanPath,
      statusCode: res.status,
      result,
      latencyMs:  res.ms,
      detail:     `Unauthenticated probe → ${res.status}`,
      timestamp:  new Date().toISOString(),
    });

    await sleep(150);
  }
}

// ─── 4. Chaos HTTP ────────────────────────────────────────────────────────────
const CHAOS_VERBS = ["DELETE", "PATCH", "PUT", "OPTIONS", "TRACE", "HEAD"];

async function runChaosHTTP() {
  for (const verb of CHAOS_VERBS) {
    const res = await request({
      path:   "/api/incidents",
      method: verb,
      body:   JSON.stringify({ chaos: "test", timestamp: Date.now() }),
    });

    pushRecord({
      category:   "CHAOS_HTTP",
      target:     `${verb} /api/incidents`,
      statusCode: res.status,
      result:     res.status >= 500 ? "PASSED" : "BLOCKED",
      latencyMs:  res.ms,
      detail:     `Chaos verb ${verb} → ${res.status}`,
      timestamp:  new Date().toISOString(),
    });

    await sleep(100);
  }

  // Massive body attack
  const res = await request({
    path:   "/api/public/report",
    method: "POST",
    body:   JSON.stringify({
      title:          "overflow",
      description:    "x".repeat(500_000),
      reporterName:   "chaos",
      reporterContact: "+265999000000",
    }),
  });

  pushRecord({
    category:   "CHAOS_HTTP",
    target:     "POST /api/public/report (15 MB body)",
    statusCode: res.status,
    result:     res.status >= 500 ? "PASSED" : "BLOCKED",
    latencyMs:  res.ms,
    detail:     `Oversized body → ${res.status}`,
    timestamp:  new Date().toISOString(),
  });
}

// ─── 5. Exfiltration Probe ────────────────────────────────────────────────────
async function runExfilProbe() {
  // Rapid-fire GETs to bulk-read endpoints (unauthenticated)
  const endpoints = [
    "/api/health", "/api/public/report", "/metrics",
  ];

  for (const ep of endpoints) {
    for (let i = 0; i < 30; i++) {
      const res = await request({ path: ep, method: "GET" });
      if (i === 29) {
        pushRecord({
          category:   "EXFIL_PROBE",
          target:     ep,
          statusCode: res.status,
          result:     res.status === 429 ? "BLOCKED" : "DETECTED",
          latencyMs:  res.ms,
          detail:     `30× rapid GET — final response ${res.status}`,
          timestamp:  new Date().toISOString(),
        });
      }
      await sleep(50);
    }
  }
}

// ─── Utility ──────────────────────────────────────────────────────────────────
function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

// ─── Full Attack Suite ────────────────────────────────────────────────────────
async function runFullSuite() {
  console.log("[RedTeam] 🔴 Starting full attack simulation suite...");
  try {
    await runCredentialStuffing();
    await runApiFuzzing();
    await runEndpointScanning();
    await runChaosHTTP();
    await runExfilProbe();
    console.log(`[RedTeam] ✅ Suite complete. Ring has ${ring.length} records.`);
  } catch (err) {
    console.error("[RedTeam] Suite error:", err);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────
export function getResults(limit = 100): AttackRecord[] {
  return [...ring].reverse().slice(0, limit);
}

export function getStats() {
  const total    = ring.length;
  const blocked  = ring.filter(r => r.result === "BLOCKED").length;
  const detected = ring.filter(r => r.result === "DETECTED").length;
  const passed   = ring.filter(r => r.result === "PASSED").length;
  const errors   = ring.filter(r => r.result === "ERROR").length;
  const byCategory = ["CREDENTIAL_STUFFING","API_FUZZING","ENDPOINT_SCANNING","CHAOS_HTTP","EXFIL_PROBE","PROMPT_INJECTION"]
    .map(cat => ({
      category: cat,
      count:    ring.filter(r => r.category === cat).length,
      findings: ring.filter(r => r.category === cat && r.result === "PASSED").length,
    }));

  return {
    total, blocked, detected, passed, errors,
    blockRate: total > 0 ? Math.round((blocked / total) * 100) : 0,
    byCategory,
    lastRun: ring.length > 0 ? ring[ring.length - 1].timestamp : null,
  };
}

export function triggerManualRun(): void {
  setImmediate(runFullSuite);
}

// ─── Scheduler ───────────────────────────────────────────────────────────────
let _started = false;
export function startRedTeamScheduler() {
  if (_started) return;
  _started = true;

  // Delay first run by 30 s to let server finish initializing
  setTimeout(() => {
    runFullSuite();
    setInterval(runFullSuite, ATTACK_INTERVAL_MS);
  }, 30_000);

  console.log(
    `[RedTeam] 🛡 Persistent Red Team Engine started — suite runs every ${ATTACK_INTERVAL_MS / 60_000} min`
  );
}
