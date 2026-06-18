import { Router } from "express";
import { db, queries, generateId } from "../db/index.js";

const router = Router();

// GET /api/threat-intel?q=<query>
router.get("/", (req, res) => {
  const query = ((req.query.q as string) || "").toLowerCase().trim();

  // Build from incidents' compromised indicators
  const incidents = db.prepare("SELECT id, severity, incident_date, compromised_indicators FROM incidents").all() as any[];
  const dynamic: any[] = [];

  for (const inc of incidents) {
    const ci = JSON.parse(inc.compromised_indicators || "{}");
    for (const ip of (ci.ips || [])) {
      if (ip && ip !== "N/A") dynamic.push({ type: "IP Address", value: ip, origin: inc.id, severity: inc.severity, date: inc.incident_date?.slice(0, 10) });
    }
    for (const ph of (ci.phoneNumbers || [])) {
      if (ph && ph !== "N/A") dynamic.push({ type: "Phone Number", value: ph, origin: inc.id, severity: inc.severity, date: inc.incident_date?.slice(0, 10) });
    }
    for (const dm of (ci.domains || [])) {
      if (dm && dm !== "N/A") dynamic.push({ type: "Domain Portal", value: dm, origin: inc.id, severity: inc.severity, date: inc.incident_date?.slice(0, 10) });
    }
  }

  // Merge with persisted threat intel seeds
  const seeds = (queries.getAllThreatIntel.all() as any[]).map(r => ({ type: r.type, value: r.value, origin: r.origin, severity: r.severity, date: r.date }));

  let results = [...dynamic, ...seeds];

  if (query) {
    results = results.filter(r =>
      r.value?.toLowerCase().includes(query) ||
      r.type?.toLowerCase().includes(query) ||
      r.origin?.toLowerCase().includes(query)
    );
  }

  return res.json(results);
});

export default router;
