import { Router } from "express";
import { queries, mapIncident } from "../db/index.js";
import { requireRole } from "../middleware/auth.js";
import {
  streamSocChat,
  analyzeThreatPatterns,
  enrichIOC,
  detectLogAnomalies,
  isAiEnabled,
} from "../services/ai.js";
import { analyzeIncidentPipeline } from "../ai/pipeline.js";

const router = Router();

// ─── GET /api/ai/status ───────────────────────────────────────────────────────
router.get("/status", async (req, res) => {
  // Quick Ollama ping (1.5s timeout)
  let ollamaOnline = false;
  try {
    const r = await fetch((process.env.OLLAMA_BASE_URL || "http://localhost:11434") + "/api/tags",
      { signal: AbortSignal.timeout(1500) });
    if (r.ok) {
      const d: any = await r.json();
      const models: string[] = (d?.models || []).map((m: any) => m.name as string);
      const wantModel = (process.env.OLLAMA_MODEL || "qwen2.5:7b").split(":")[0];
      ollamaOnline = models.some(m => m.startsWith(wantModel));
    }
  } catch { /* Ollama not running */ }

  const geminiEnabled = isAiEnabled();
  const engine = ollamaOnline ? "ollama" : geminiEnabled ? "gemini" : "offline";
  const engineLabel = ollamaOnline
    ? `Ollama (${process.env.OLLAMA_MODEL || "qwen2.5:7b"}) — local, unlimited`
    : geminiEnabled
      ? `Gemini (${process.env.GEMINI_CHAT_MODEL || "gemini-2.0-flash-lite"}) — cloud`
      : "Offline Knowledge Base";

  return res.json({
    enabled:     geminiEnabled || ollamaOnline,
    engine,
    engineLabel,
    ollama:      { online: ollamaOnline, model: process.env.OLLAMA_MODEL || "qwen2.5:7b", url: process.env.OLLAMA_BASE_URL || "http://localhost:11434" },
    gemini:      { enabled: geminiEnabled, model: process.env.GEMINI_CHAT_MODEL || "gemini-2.0-flash-lite" },
    pipeline:    { stages: ["offline-rules", "pattern-engine", "gemini-enrichment", "decision-fusion"], offlineAlways: true },
    features:    ["classification", "chat", "pattern-analysis", "ioc-enrichment", "anomaly-detection"],
    message:     `SENTINEL AI — ${engineLabel}`,
  });
});

// ─── POST /api/ai/pipeline ────────────────────────────────────────────────────
// Full pipeline analysis — returns complete PipelineResult with all 4 stage outputs
router.post("/pipeline", requireRole("admin", "analyst", "investigator"), async (req, res) => {
  const { title, description } = req.body;
  if (!title?.trim() || !description?.trim()) {
    return res.status(400).json({ error: "MISSING_FIELDS", message: "title and description are required." });
  }
  try {
    const result = await analyzeIncidentPipeline(title.trim(), description.trim());
    return res.json({ success: true, data: result });
  } catch (err: any) {
    return res.status(500).json({ error: "PIPELINE_ERROR", message: err?.message || "AI pipeline failed." });
  }
});


// ─── POST /api/ai/chat (Server-Sent Events streaming) ────────────────────────
router.post("/chat", requireRole("admin", "analyst", "investigator"), async (req, res) => {
  const { message, history = [], incidentId } = req.body;

  if (!message?.trim()) {
    return res.status(400).json({ error: "MISSING_MESSAGE", message: "Message is required." });
  }

  // Optionally load incident context
  let incidentContext: string | undefined;
  if (incidentId) {
    const row = queries.getIncidentById.get(incidentId) as any;
    if (row) {
      const inc = mapIncident(row);
      incidentContext = `Incident ID: ${inc.id}
Title: ${inc.title}
Category: ${inc.category} | Severity: ${inc.severity} | Status: ${inc.status}
Reporter: ${inc.reporterName} (${inc.reporterOrg})
Description: ${inc.description}
AI Analysis: ${inc.analysisSummary}
Mitigation Advice: ${inc.mitigationAdvice}
IOCs — Phones: ${inc.compromisedIndicators.phoneNumbers.join(", ") || "None"}
IOCs — IPs: ${inc.compromisedIndicators.ips.join(", ") || "None"}
IOCs — Domains: ${inc.compromisedIndicators.domains.join(", ") || "None"}`;
    }
  }

  // Stream SSE response
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  try {
    const generator = streamSocChat(message, history, incidentContext);
    for await (const chunk of generator) {
      res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  } catch (err: any) {
    res.write(`data: ${JSON.stringify({ error: err?.message || "Stream error" })}\n\n`);
  } finally {
    res.end();
  }
});

// ─── POST /api/ai/analyze ─────────────────────────────────────────────────────
router.post("/analyze", requireRole("admin", "analyst"), async (req, res) => {
  const incidents = (queries.getAllIncidents.all() as any[]).map(mapIncident);
  if (incidents.length === 0) {
    return res.status(400).json({ error: "NO_DATA", message: "No incidents available for analysis." });
  }
  const result = await analyzeThreatPatterns(incidents);
  return res.json(result);
});

// ─── POST /api/ai/enrich-ioc ──────────────────────────────────────────────────
router.post("/enrich-ioc", requireRole("admin", "analyst", "investigator"), async (req, res) => {
  const { indicator, type } = req.body;
  if (!indicator || !type) {
    return res.status(400).json({ error: "MISSING_FIELDS", message: "indicator and type are required." });
  }
  const validTypes = ["phone", "ip", "domain", "hash"];
  if (!validTypes.includes(type)) {
    return res.status(400).json({ error: "INVALID_TYPE", message: `type must be one of: ${validTypes.join(", ")}` });
  }
  const result = await enrichIOC(indicator, type as any);
  return res.json(result);
});

// ─── POST /api/ai/anomaly ─────────────────────────────────────────────────────
router.post("/anomaly", requireRole("admin", "analyst"), async (req, res) => {
  const { logs } = req.body;
  if (!logs || !Array.isArray(logs) || logs.length === 0) {
    // Pull from DB if not provided
    const dbLogs = (queries.getAllLogs?.all() as any[]) || [];
    if (dbLogs.length === 0) {
      return res.status(400).json({ error: "NO_LOGS", message: "No logs provided or available in database." });
    }
    const result = await detectLogAnomalies(dbLogs);
    return res.json(result);
  }
  const result = await detectLogAnomalies(logs);
  return res.json(result);
});

export default router;

// ─── POST /api/ai/briefing — Situation Room SSE Briefing ─────────────────────
router.post("/briefing", requireRole("admin", "analyst", "investigator"), async (req, res) => {

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  try {
    // Get live incident stats for context
    const all = (queries.getAllIncidents.all() as any[]).map(mapIncident);
    const total       = all.length;
    const critical    = all.filter(i => i.severity === "Critical").length;
    const high        = all.filter(i => i.severity === "High").length;
    const open        = all.filter(i => !["Resolved", "Contained"].includes(i.status)).length;
    const today       = all.filter(i => new Date(i.createdAt) > new Date(Date.now() - 86400000)).length;
    const topCategories = Object.entries(
      all.reduce((acc, i) => { acc[i.category] = (acc[i.category] || 0) + 1; return acc; }, {} as Record<string, number>)
    ).sort(([,a],[,b]) => b-a).slice(0, 4).map(([k,v]) => `${k}: ${v}`).join(", ");

    const recentIncidents = all.slice(0, 5).map(i => `• [${i.severity}] ${i.title} (${i.reporterOrg})`).join("\n");

    const prompt = `You are the MACERT Malawi Situation Room AI. Generate a CLASSIFIED intelligence briefing for the National Cyber Defense team.

LIVE DATA AS OF ${new Date().toISOString()}:
- Total incidents in system: ${total}
- Critical severity: ${critical}
- High severity: ${high}  
- Open/Active incidents: ${open}
- New in last 24 hours: ${today}
- Top attack categories: ${topCategories || "N/A"}

RECENT INCIDENTS:
${recentIncidents || "No recent incidents"}

Generate a concise 5-paragraph national threat briefing:
1. EXECUTIVE SUMMARY (2 sentences)
2. THREAT LANDSCAPE (current threats, sectors affected)
3. ACTIVE INCIDENTS OVERVIEW (analysis of the above data)
4. REGIONAL RISK ASSESSMENT (Malawi districts - mention Lilongwe, Blantyre, Mzuzu)
5. RECOMMENDED ACTIONS (3 immediate action items for SOC team)

Use professional intelligence language. Keep each paragraph to 3-4 sentences. Include specific recommendations for Malawi's financial sector and telecom nodes.`;

    const generator = streamSocChat(prompt, [], undefined);
    for await (const chunk of generator) {
      res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  } catch (err: any) {
    res.write(`data: ${JSON.stringify({ error: err?.message || "Briefing generation failed" })}\n\n`);
  } finally {
    res.end();
  }
});

// ─── POST /api/ai/insights — Analytics Dashboard AI Insights ─────────────────
router.post("/insights", requireRole("admin", "analyst", "investigator"), async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  try {
    const { stats } = req.body; // stats passed from the frontend
    const all = (queries.getAllIncidents.all() as any[]).map(mapIncident);

    const prompt = `You are a cybersecurity analytics expert for Malawi's MACERT national CERT.

ANALYTICS SNAPSHOT:
- Total Incidents: ${stats?.totalIncidents ?? all.length}
- Investigating: ${stats?.investigatingCount ?? all.filter(i => i.status === "Investigating").length}
- Resolved: ${stats?.resolvedCount ?? 0}
- Critical: ${stats?.criticalCount ?? all.filter(i => i.severity === "Critical").length}

Provide exactly 5 concise strategic insights for the Malawi cybersecurity leadership team. Format as:
1. [INSIGHT TITLE]: One clear sentence insight.
2. [INSIGHT TITLE]: ...
...and so on.

Focus on: trends, sector vulnerabilities, recommended policy changes, resource allocation, and emerging threats specific to Malawi (mobile money fraud, SIM swap, telecoms).`;

    const generator = streamSocChat(prompt, [], undefined);
    for await (const chunk of generator) {
      res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  } catch (err: any) {
    res.write(`data: ${JSON.stringify({ error: err?.message || "Insights generation failed" })}\n\n`);
  } finally {
    res.end();
  }
});

// ─── POST /api/ai/report — AI-Generated Report Content ───────────────────────
router.post("/report", requireRole("admin", "analyst", "investigator"), async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  try {
    const all = (queries.getAllIncidents.all() as any[]).map(mapIncident);
    const period = req.body.period || "monthly";
    const total = all.length;
    const critical = all.filter(i => i.severity === "Critical").length;
    const resolved = all.filter(i => i.status === "Resolved" || i.status === "Contained").length;
    const topCat = Object.entries(
      all.reduce((acc, i) => { acc[i.category] = (acc[i.category] || 0) + 1; return acc; }, {} as Record<string, number>)
    ).sort(([,a],[,b]) => b-a).slice(0,3).map(([k,v]) => `${k} (${v})`).join(", ");

    const prompt = `Generate a professional ${period} cybersecurity incident report for MACRA/MACERT Malawi.

REPORT DATA:
- Report Period: ${period.toUpperCase()}
- Total Incidents: ${total}
- Critical: ${critical}
- Resolved/Contained: ${resolved} (${total > 0 ? Math.round(resolved/total*100) : 0}% resolution rate)
- Top Incident Types: ${topCat || "N/A"}
- Generated: ${new Date().toLocaleDateString("en-MW", { dateStyle: "full" })}

Write a formal report with these sections:
# EXECUTIVE SUMMARY
# INCIDENT STATISTICS
# THREAT ANALYSIS  
# SECTOR IMPACT ASSESSMENT
# RESPONSE EFFECTIVENESS
# RECOMMENDATIONS
# CONCLUSION

Use formal government report language. Be specific to Malawi context (mention MK currency for financial losses if applicable, reference local telecoms TNM/Airtel, government ministries). Keep each section to 2-3 paragraphs.`;

    const generator = streamSocChat(prompt, [], undefined);
    for await (const chunk of generator) {
      res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  } catch (err: any) {
    res.write(`data: ${JSON.stringify({ error: err?.message || "Report generation failed" })}\n\n`);
  } finally {
    res.end();
  }
});

