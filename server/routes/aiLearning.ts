/**
 * LitSecure Sentinel — AI Learning API Routes
 *
 * POST /api/ai-learning/feedback        — Submit feedback on an AI response
 * GET  /api/ai-learning/feedback        — List feedback entries
 * GET  /api/ai-learning/stats           — Feedback + training stats
 * GET  /api/ai-learning/kb              — List all KB entries
 * POST /api/ai-learning/kb              — Add a KB entry
 * PATCH/api/ai-learning/kb/:id/approve  — Approve a KB entry (admin)
 * DELETE /api/ai-learning/kb/:id        — Delete a KB entry (admin)
 * GET  /api/ai-learning/training/export — Download training dataset JSONL
 */

import { Router } from "express";
import { requireRole } from "../middleware/auth.js";
import {
  saveFeedback,
  getFeedbackStats,
  getTrainingStats,
  exportTrainingData,
  getAllKbEntries,
  addKbEntry,
  approveKbEntry,
  deleteKbEntry,
  addKbToTraining,
} from "../services/aiLearning.js";
import { db } from "../db/index.js";
import { notifyKbPendingApproval } from "../services/notifications.js";

const router = Router();

// ─── Feedback ────────────────────────────────────────────────────────────────

// POST /api/ai-learning/feedback — analyst rates an AI response
router.post("/feedback", (req, res) => {
  const { userMessage, aiResponse, rating, correction, topic, sessionId } = req.body;

  if (!userMessage || !aiResponse || !rating) {
    return res.status(400).json({ error: "userMessage, aiResponse, and rating are required" });
  }
  if (!["positive", "negative", "unrated"].includes(rating)) {
    return res.status(400).json({ error: "rating must be: positive | negative | unrated" });
  }

  const id = saveFeedback({
    userMessage,
    aiResponse,
    rating,
    correction,
    topic,
    sessionId,
    analystName: req.user?.name || "anonymous",
    analystRole: req.user?.role || "analyst",
  });

  return res.json({ success: true, id });
});

// GET /api/ai-learning/feedback — list feedback (analyst+)
router.get("/feedback", (req, res) => {
  const limit  = Math.min(100, parseInt(req.query.limit as string) || 50);
  const rating = req.query.rating as string;
  const sql = rating && rating !== "all"
    ? `SELECT * FROM ai_feedback WHERE rating = ? ORDER BY created_at DESC LIMIT ?`
    : `SELECT * FROM ai_feedback ORDER BY created_at DESC LIMIT ?`;
  const rows = rating && rating !== "all"
    ? (db.prepare(sql).all(rating, limit) as any[])
    : (db.prepare(sql).all(limit) as any[]);
  return res.json(rows);
});

// ─── Stats ───────────────────────────────────────────────────────────────────

// GET /api/ai-learning/stats
router.get("/stats", (req, res) => {
  const feedback = getFeedbackStats();
  const training = getTrainingStats();

  // KB stats
  const kbTotal    = (db.prepare("SELECT COUNT(*) as c FROM ai_knowledge_base").get() as any)?.c ?? 0;
  const kbApproved = (db.prepare("SELECT COUNT(*) as c FROM ai_knowledge_base WHERE approved=1").get() as any)?.c ?? 0;
  const kbPending  = kbTotal - kbApproved;

  return res.json({
    feedback,
    training,
    knowledgeBase: { total: kbTotal, approved: kbApproved, pending: kbPending },
  });
});

// ─── Knowledge Base ───────────────────────────────────────────────────────────

// GET /api/ai-learning/kb
router.get("/kb", (req, res) => {
  return res.json(getAllKbEntries());
});

// POST /api/ai-learning/kb — add an entry (analyst+)
router.post("/kb", (req, res) => {
  const { title, category, content, addToTraining, trainingQuestion } = req.body;
  if (!title || !category || !content) {
    return res.status(400).json({ error: "title, category, and content are required" });
  }

  const id = addKbEntry({
    title,
    category,
    content,
    author: req.user?.name || "anonymous",
  });

  // Notify admins that a new KB entry needs approval
  try { notifyKbPendingApproval(title, req.user?.name || "anonymous"); } catch {}

  // Optionally also write as a training sample
  if (addToTraining && trainingQuestion && content) {
    addKbToTraining(trainingQuestion, content, category);
  }

  return res.status(201).json({ success: true, id });
});

// PATCH /api/ai-learning/kb/:id/approve — admin approves an entry
router.patch("/kb/:id/approve", requireRole("admin", "super_admin", "gov_admin", "soc_manager"), (req, res) => {
  const { id } = req.params;
  const row = db.prepare("SELECT id FROM ai_knowledge_base WHERE id=?").get(id);
  if (!row) return res.status(404).json({ error: "KB entry not found" });
  approveKbEntry(id);
  return res.json({ success: true });
});

// DELETE /api/ai-learning/kb/:id — admin deletes an entry
router.delete("/kb/:id", requireRole("admin", "super_admin", "gov_admin", "soc_manager"), (req, res) => {
  const { id } = req.params;
  deleteKbEntry(id);
  return res.json({ success: true });
});

// ─── Training Data Export ─────────────────────────────────────────────────────

// GET /api/ai-learning/training/export — download JSONL (admin only)
router.get("/training/export", requireRole("admin", "super_admin"), (req, res) => {
  const data = exportTrainingData();
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", "attachment; filename=sentinel_training_data.jsonl");
  // Re-serialize as JSONL
  return res.send(data.map(d => JSON.stringify(d)).join("\n"));
});

export default router;
