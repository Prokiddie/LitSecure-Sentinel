/**
 * LitSecure Sentinel — AI Learning Service
 *
 * Implements a full feedback loop for continuous AI improvement:
 *
 *  1. FEEDBACK COLLECTION — analysts rate/correct AI responses
 *  2. KNOWLEDGE BASE — analysts teach the AI Malawi-specific threat knowledge
 *  3. LEARNED CORRECTIONS — recent analyst corrections injected into prompts
 *  4. TRAINING DATASET — JSONL export for future Gemini fine-tuning
 */

import { db, generateId } from "../db/index.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../data");
const TRAINING_JSONL = path.join(DATA_DIR, "ai_training_data.jsonl");

// ─── Schema Migrations (idempotent) ──────────────────────────────────────────

db.exec(`
  -- AI Feedback: every AI response can be rated and corrected
  CREATE TABLE IF NOT EXISTS ai_feedback (
    id              TEXT PRIMARY KEY,
    session_id      TEXT NOT NULL,
    user_message    TEXT NOT NULL,
    ai_response     TEXT NOT NULL,
    rating          TEXT NOT NULL DEFAULT 'unrated', -- positive | negative | unrated
    correction      TEXT,                             -- analyst's corrected answer
    topic           TEXT NOT NULL DEFAULT 'general', -- phishing | sim_swap | malware | ...
    analyst_name    TEXT NOT NULL DEFAULT 'anonymous',
    analyst_role    TEXT NOT NULL DEFAULT 'analyst',
    context_used    TEXT NOT NULL DEFAULT '',         -- which context block was injected
    created_at      TEXT NOT NULL
  );

  -- AI Knowledge Base: analysts teach the AI Malawi-specific knowledge
  CREATE TABLE IF NOT EXISTS ai_knowledge_base (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    category    TEXT NOT NULL, -- threat_tactic | ioc_pattern | local_context | sop | case_study
    content     TEXT NOT NULL, -- the actual knowledge entry
    author      TEXT NOT NULL,
    approved    INTEGER NOT NULL DEFAULT 0, -- 0 = pending, 1 = approved by admin
    used_count  INTEGER NOT NULL DEFAULT 0, -- how many times injected into prompts
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );
`);

// ─── Feedback ────────────────────────────────────────────────────────────────

export interface FeedbackEntry {
  userMessage:  string;
  aiResponse:   string;
  rating:       "positive" | "negative" | "unrated";
  correction?:  string;
  topic?:       string;
  analystName?: string;
  analystRole?: string;
  sessionId?:   string;
}

/**
 * Store analyst feedback on an AI response.
 * If the analyst provided a correction, it also writes a training sample
 * to the JSONL file for future fine-tuning.
 */
export function saveFeedback(entry: FeedbackEntry): string {
  const id  = generateId("fb");
  const now = new Date().toISOString();
  const sid = entry.sessionId || generateId("sess");

  db.prepare(`
    INSERT INTO ai_feedback
      (id, session_id, user_message, ai_response, rating, correction,
       topic, analyst_name, analyst_role, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(
    id, sid,
    entry.userMessage,
    entry.aiResponse,
    entry.rating,
    entry.correction || null,
    entry.topic || "general",
    entry.analystName || "anonymous",
    entry.analystRole || "analyst",
    now
  );

  // If a correction was given, write a Gemini fine-tuning sample
  if (entry.correction && entry.correction.trim()) {
    appendTrainingSample(entry.userMessage, entry.correction, entry.topic);
  }

  return id;
}

/**
 * Get feedback statistics for the dashboard.
 */
export function getFeedbackStats() {
  const total    = (db.prepare("SELECT COUNT(*) as c FROM ai_feedback").get() as any)?.c ?? 0;
  const positive = (db.prepare("SELECT COUNT(*) as c FROM ai_feedback WHERE rating='positive'").get() as any)?.c ?? 0;
  const negative = (db.prepare("SELECT COUNT(*) as c FROM ai_feedback WHERE rating='negative'").get() as any)?.c ?? 0;
  const corrected= (db.prepare("SELECT COUNT(*) as c FROM ai_feedback WHERE correction IS NOT NULL").get() as any)?.c ?? 0;
  const accuracy = total > 0 ? Math.round((positive / total) * 100) : 0;
  return { total, positive, negative, corrected, accuracy };
}

/**
 * Get recent negative feedback with corrections — used for prompt injection.
 * The AI learns from analyst corrections in real-time.
 */
export function getLearnedCorrections(limit = 8): string {
  try {
    const rows = db.prepare(`
      SELECT user_message, correction, topic, analyst_role
      FROM ai_feedback
      WHERE correction IS NOT NULL AND correction != ''
        AND rating = 'negative'
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit) as any[];

    if (!rows.length) return "";

    const lines = rows.map((r: any) =>
      `  Q: "${r.user_message.slice(0, 100)}"\n  CORRECT ANSWER: ${r.correction.slice(0, 200)}\n  (corrected by ${r.analyst_role})`
    );

    return `=== ANALYST CORRECTIONS (learn from these — previous AI responses were wrong) ===\n${lines.join("\n\n")}`;
  } catch { return ""; }
}

// ─── Knowledge Base ───────────────────────────────────────────────────────────

export interface KbEntry {
  title:    string;
  category: string;
  content:  string;
  author:   string;
}

export function addKbEntry(entry: KbEntry): string {
  const id  = generateId("kb");
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO ai_knowledge_base (id, title, category, content, author, approved, created_at, updated_at)
    VALUES (?,?,?,?,?,0,?,?)
  `).run(id, entry.title, entry.category, entry.content, entry.author, now, now);
  return id;
}

export function approveKbEntry(id: string): void {
  db.prepare("UPDATE ai_knowledge_base SET approved=1, updated_at=? WHERE id=?")
    .run(new Date().toISOString(), id);
}

export function deleteKbEntry(id: string): void {
  db.prepare("DELETE FROM ai_knowledge_base WHERE id=?").run(id);
}

export function getAllKbEntries() {
  return db.prepare("SELECT * FROM ai_knowledge_base ORDER BY created_at DESC").all();
}

/**
 * Get approved KB entries to inject into AI prompts.
 * Increments usage counter so we can see which knowledge is most used.
 */
export function getApprovedKbContext(limit = 15): string {
  try {
    const rows = db.prepare(`
      SELECT id, title, category, content
      FROM ai_knowledge_base
      WHERE approved = 1
      ORDER BY used_count ASC, created_at DESC
      LIMIT ?
    `).all(limit) as any[];

    if (!rows.length) return "";

    // Increment usage counters
    const ids = rows.map((r: any) => `'${r.id}'`).join(",");
    db.prepare(`UPDATE ai_knowledge_base SET used_count = used_count + 1 WHERE id IN (${ids})`).run();

    const lines = rows.map((r: any) =>
      `  [${r.category.toUpperCase()}] ${r.title}:\n  ${r.content.slice(0, 300)}`
    );

    return `=== ANALYST KNOWLEDGE BASE (${rows.length} approved entries — use this as ground truth) ===\n${lines.join("\n\n")}`;
  } catch { return ""; }
}

// ─── Training Dataset (JSONL for Gemini fine-tuning) ─────────────────────────

/**
 * Appends a Gemini-compatible fine-tuning sample to the JSONL file.
 * Format matches Google AI Studio / Vertex AI tuning dataset spec.
 */
function appendTrainingSample(question: string, answer: string, topic = "general"): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const sample = {
      contents: [
        {
          role: "user",
          parts: [{ text: question }]
        },
        {
          role: "model",
          parts: [{ text: answer }]
        }
      ],
      systemInstruction: {
        parts: [{ text: `Cybersecurity assistant for Malawi MACERT. Topic: ${topic}` }]
      }
    };
    fs.appendFileSync(TRAINING_JSONL, JSON.stringify(sample) + "\n", "utf-8");
  } catch {}
}

/**
 * Add a manually authored training sample (KB entry → training data).
 * Called when an admin approves a KB entry — it doubles as training data.
 */
export function addKbToTraining(question: string, answer: string, topic: string): void {
  appendTrainingSample(question, answer, topic);
}

/**
 * Get training dataset stats.
 */
export function getTrainingStats() {
  try {
    if (!fs.existsSync(TRAINING_JSONL)) return { samples: 0, fileSizeKb: 0, path: TRAINING_JSONL };
    const content = fs.readFileSync(TRAINING_JSONL, "utf-8");
    const samples = content.split("\n").filter(l => l.trim()).length;
    const fileSizeKb = Math.round(fs.statSync(TRAINING_JSONL).size / 1024);
    return { samples, fileSizeKb, path: TRAINING_JSONL };
  } catch { return { samples: 0, fileSizeKb: 0, path: TRAINING_JSONL }; }
}

/**
 * Export training data as a readable JSON array (for download/review).
 */
export function exportTrainingData(): any[] {
  try {
    if (!fs.existsSync(TRAINING_JSONL)) return [];
    return fs.readFileSync(TRAINING_JSONL, "utf-8")
      .split("\n")
      .filter(l => l.trim())
      .map(l => JSON.parse(l));
  } catch { return []; }
}

/**
 * Build the complete learned-context block to inject into every AI prompt.
 * Includes: analyst corrections + approved KB entries.
 */
export function buildLearnedContext(): string {
  const corrections = getLearnedCorrections(6);
  const kb          = getApprovedKbContext(12);

  const parts = [corrections, kb].filter(Boolean);
  if (!parts.length) return "";

  return [
    "╔══════════════════════════════════════════════════════════════════╗",
    "║            ANALYST LEARNED INTELLIGENCE (highest priority)        ║",
    "║  The entries below were verified by human analysts.               ║",
    "║  They OVERRIDE any conflicting knowledge you have.               ║",
    "╚══════════════════════════════════════════════════════════════════╝",
    ...parts,
    "╔══════════════════════════════════════════════════════════════════╗",
    "║                   END LEARNED INTELLIGENCE                        ║",
    "╚══════════════════════════════════════════════════════════════════╝",
  ].join("\n");
}
