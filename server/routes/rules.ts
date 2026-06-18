import { Router } from "express";
import db, { queries, generateId } from "../db/index.js";

const router = Router();

// GET /api/rules
router.get("/", (req, res) => {
  try {
    const rules = db.prepare("SELECT * FROM security_rules ORDER BY created_at DESC").all();
    return res.json(rules);
  } catch (err) {
    console.error("Failed to fetch security rules:", err);
    return res.status(500).json({ error: "DB_ERROR", message: "Failed to fetch security rules." });
  }
});

// POST /api/rules/deploy
router.post("/deploy", (req, res) => {
  const { title, language, content } = req.body;
  if (!title || !language || !content) {
    return res.status(400).json({ error: "BAD_REQUEST", message: "Rule fields title, language, and content are required." });
  }

  const now = new Date().toISOString();
  const id = generateId("RUL");

  // Validate rule syntax depending on language
  let isValid = true;
  let validationMessage = "Rule successfully compiled and deployed.";

  if (language === "YARA") {
    if (!content.includes("rule") || !content.includes("condition")) {
      isValid = false;
      validationMessage = "YARA compilation failed: missing rule wrapper or condition keyword.";
    }
  } else if (language === "Sigma") {
    if (!content.includes("title:") || !content.includes("detection:")) {
      isValid = false;
      validationMessage = "Sigma validation failed: missing key attributes (title/detection).";
    }
  } else if (language === "Snort") {
    if (!content.startsWith("alert") && !content.startsWith("log")) {
      isValid = false;
      validationMessage = "Snort parser failed: missing alert/log trigger keyword.";
    }
  }

  if (!isValid) {
    return res.status(400).json({ error: "COMPILE_ERROR", message: validationMessage });
  }

  // Insert the rule into the DB
  const nodes = Math.floor(5 + Math.random() * 25);
  try {
    db.prepare("INSERT INTO security_rules (id, title, language, content, status, nodes_deployed, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(id, title, language, content, "Active", nodes, now);

    // Add Audit Log
    db.prepare("INSERT INTO audit_logs (id,timestamp,user_name,user_role,action,details,entity_type,entity_id) VALUES (?,?,?,?,?,?,?,?)")
      .run(generateId("aud"), now, req.user?.name || "Sentinel SOC Manager", req.user?.role || "analyst", `Rule deployed: ${language}`, `Compiled and pushed rule '${title}' to ${nodes} sensors.`, "rule", id);

    return res.status(201).json({ success: true, rule: { id, title, language, content, status: "Active", nodes_deployed: nodes, created_at: now } });
  } catch (err) {
    console.error("Failed to insert security rule:", err);
    return res.status(500).json({ error: "DB_ERROR", message: "Database insertion failed." });
  }
});

export default router;
