/**
 * LitSecure Sentinel — User Management API Route
 * Admin-only CRUD for platform users.
 */
import { Router } from "express";
import { requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { createUserSchema, updateUserSchema } from "../schemas/index.js";
import { db, generateId } from "../db/index.js";
import crypto from "crypto";
import bcrypt from "bcryptjs";

const router = Router();

// All user management requires admin or super_admin
router.use(requireRole("admin", "super_admin"));

// ─── GET /api/users ───────────────────────────────────────────────────────────
router.get("/", (req, res) => {
  try {
    const rows = db.prepare(
      `SELECT id, email, full_name AS name, role, organization_id AS organization, is_active, created_at
       FROM users ORDER BY created_at DESC`
    ).all() as any[];
    return res.json(rows);
  } catch (err: any) {
    return res.json([]);
  }
});

// ─── GET /api/users/:id ───────────────────────────────────────────────────────
router.get("/:id", (req, res) => {
  try {
    const row = db.prepare("SELECT id, email, full_name AS name, role, organization_id AS organization, is_active, created_at FROM users WHERE id = ?").get(req.params.id) as any;
    if (!row) return res.status(404).json({ error: "NOT_FOUND" });
    return res.json(row);
  } catch {
    return res.status(404).json({ error: "NOT_FOUND" });
  }
});

// ─── POST /api/users ─────────────────────────────────────────────────────────────────
router.post("/", validate(createUserSchema), async (req, res) => {
  const { email, fullName, role, organizationId, password } = req.body;

  const now   = new Date().toISOString();
  const id    = generateId("usr");
  const rawPw = password || crypto.randomBytes(10).toString("hex");
  const hash  = await bcrypt.hash(rawPw, 12);

  try {
    db.prepare(`
      INSERT INTO users (id, email, full_name, role, organization_id, password_hash, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(id, email.toLowerCase().trim(), fullName.trim(), role, organizationId || null, hash, now, now);

    db.prepare(`
      INSERT INTO audit_logs (id, timestamp, user_name, user_role, action, details, entity_type, entity_id, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      generateId("aud"), now,
      req.user!.name, req.user!.role,
      "User Created", `Created user ${email} with role ${role}`,
      "user", id, req.ip || "unknown", req.headers["user-agent"] || ""
    );

    return res.status(201).json({
      id, email, fullName, role, organizationId,
      is_active: true, created_at: now,
      ...(password ? {} : { tempPassword: rawPw }),
    });
  } catch (err: any) {
    if (err.message?.includes("UNIQUE")) {
      return res.status(409).json({ error: "DUPLICATE_EMAIL", message: "A user with this email already exists." });
    }
    return res.status(500).json({ error: "DB_ERROR", message: err.message });
  }
});

// ─── PATCH /api/users/:id ─────────────────────────────────────────────────────────────────
router.patch("/:id", validate(updateUserSchema), async (req, res) => {
  const { id } = req.params;
  const { role, fullName, organizationId, isActive, password } = req.body;

  try {
    const existing = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as any;
    if (!existing) return res.status(404).json({ error: "NOT_FOUND" });

    const now       = new Date().toISOString();
    const newRole   = role        ?? existing.role;
    const newName   = fullName    ?? existing.full_name;
    const newOrg    = organizationId !== undefined ? organizationId : existing.organization_id;
    const newActive = isActive    !== undefined ? (isActive ? 1 : 0) : existing.is_active;

    let hashClause = "";
    const params: any[] = [newName, newRole, newOrg, newActive, now];
    if (password) {
      const hash = await bcrypt.hash(password, 12);
      hashClause = ", password_hash = ?";
      params.push(hash);
    }
    params.push(id);

    db.prepare(`UPDATE users SET full_name = ?, role = ?, organization_id = ?, is_active = ?, updated_at = ?${hashClause} WHERE id = ?`).run(...params);

    db.prepare(`
      INSERT INTO audit_logs (id, timestamp, user_name, user_role, action, details, entity_type, entity_id, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      generateId("aud"), now,
      req.user!.name, req.user!.role,
      "User Updated", `Updated user ${existing.email}: role=${newRole}, active=${newActive}`,
      "user", id, req.ip || "", req.headers["user-agent"] || ""
    );

    return res.json({ id, email: existing.email, fullName: newName, role: newRole, organizationId: newOrg, isActive: Boolean(newActive), updatedAt: now });
  } catch (err: any) {
    return res.status(500).json({ error: "DB_ERROR", message: err.message });
  }
});

// ─── DELETE /api/users/:id (soft delete) ─────────────────────────────────────
router.delete("/:id", (req, res) => {
  const { id } = req.params;
  if (id === req.user!.id) {
    return res.status(400).json({ error: "SELF_DELETE", message: "You cannot delete your own account." });
  }
  try {
    const existing = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as any;
    if (!existing) return res.status(404).json({ error: "NOT_FOUND" });

    const now = new Date().toISOString();
    db.prepare("UPDATE users SET is_active = 0, updated_at = ? WHERE id = ?").run(now, id);

    // Audit log the deletion
    db.prepare(`
      INSERT INTO audit_logs (id, timestamp, user_name, user_role, action, details, entity_type, entity_id, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      generateId("aud"), now,
      req.user!.name, req.user!.role,
      "User Deleted",
      `Soft-deleted user ${existing.email}`,
      "user", id,
      req.ip || "", req.headers["user-agent"] || ""
    );

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: "DB_ERROR", message: err.message });
  }
});

export default router;
