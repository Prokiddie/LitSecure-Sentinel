import { Router } from "express";
import { db, queries, generateId } from "../db/index.js";
import { requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { createSiteSchema } from "../schemas/index.js";

const router = Router();

// GET /api/sites
router.get("/", (req, res) => {
  const rows = queries.getAllSites.all() as any[];
  return res.json(rows.map(r => ({
    id: r.id, name: r.name, location: r.location,
    address: r.address, orgId: r.org_id, securityLevel: r.security_level,
  })));
});

// POST /api/sites
router.post("/", requireRole("admin"), validate(createSiteSchema), (req, res) => {
  const { name, address, orgId, securityLevel, location } = req.body;
  const id = generateId("S");
  const site = {
    id,
    name,
    location: location || `GPS: -13.${Math.floor(1000 + Math.random() * 8999)}, 33.${Math.floor(1000 + Math.random() * 8999)}`,
    address: address || "Capital City Subnet",
    org_id: orgId,
    security_level: securityLevel || "Standard",
  };
  db.prepare("INSERT INTO sites (id,name,location,address,org_id,security_level) VALUES (@id,@name,@location,@address,@org_id,@security_level)").run(site);
  queries.insertAuditLog.run({
    id: generateId("aud"),
    timestamp: new Date().toISOString(),
    user_name: req.user?.name || "Admin",
    user_role: req.user?.role || "admin",
    action: "Site Registered",
    details: `Added new physical site: ${name} owned by ${orgId} (${site.security_level} Security)`,
    entity_type: "site",
    entity_id: id,
  });
  return res.status(201).json({ id, name, location: site.location, address: site.address, orgId, securityLevel: site.security_level });
});

export default router;
