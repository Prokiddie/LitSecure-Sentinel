/**
 * LitSecure Sentinel — STIX 2.1 / TAXII Export Endpoint (Phase 3)
 * Exports threat intelligence as STIX 2.1 bundles for sharing
 * with MACERT, regional CERTs, and international partners.
 *
 * Prefix: /api/stix
 *
 * STIX 2.1 Spec reference: https://docs.oasis-open.org/cti/stix/v2.1/
 * Supported object types: indicator, threat-actor, malware, attack-pattern,
 *   observed-data, identity, relationship
 */
import { Router } from "express";
import db from "../db/index.js";
import { isSupabaseEnabled, insertSharingRequestToSupabase } from "../db/supabase-client.js";

const router = Router();

// ─── STIX Identity (LitSecure / MACRA) ───────────────────────────────────────
const MACRA_IDENTITY = {
  type: "identity",
  spec_version: "2.1",
  id: "identity--macra-mw-litsecure-sentinel",
  created: "2024-01-01T00:00:00.000Z",
  modified: new Date().toISOString(),
  name: "MACRA / LitSecure Sentinel",
  description: "Malawi Communications Regulatory Authority — National Cyber Intelligence Platform",
  identity_class: "organization",
  sectors: ["communications", "government"],
  contact_information: "macert@macra.mw",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stixId(type: string, localId: string) {
  // Convert a local ID into a stable STIX ID
  const sanitised = localId.replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase().slice(0, 32);
  return `${type}--${sanitised}`;
}

function toStixTimestamp(dt: string | undefined) {
  if (!dt) return new Date().toISOString();
  try { return new Date(dt).toISOString(); } catch { return new Date().toISOString(); }
}

/** Convert a threat_intel row into a STIX 2.1 indicator object */
function threatToIndicator(t: any) {
  const created  = toStixTimestamp(t.first_seen ?? t.created_at);
  const modified = toStixTimestamp(t.last_seen  ?? t.updated_at ?? t.created_at);
  const id       = stixId("indicator", t.id ?? t.value ?? String(Math.random()));

  // Build STIX pattern based on indicator type
  let pattern = "[file:hashes.MD5 = 'unknown']";
  if (t.type === "ip")     pattern = `[network-traffic:dst_ref.type = 'ipv4-addr' AND network-traffic:dst_ref.value = '${t.value}']`;
  else if (t.type === "domain") pattern = `[domain-name:value = '${t.value}']`;
  else if (t.type === "hash")   pattern = `[file:hashes.'SHA-256' = '${t.value}']`;
  else if (t.type === "url")    pattern = `[url:value = '${t.value}']`;

  return {
    type: "indicator",
    spec_version: "2.1",
    id,
    created,
    modified,
    name: t.value ?? "Unknown indicator",
    description: t.description ?? `Threat indicator from ${t.source ?? "LitSecure"}`,
    pattern,
    pattern_type: "stix",
    pattern_version: "2.1",
    valid_from: created,
    labels: ["malicious-activity"],
    confidence: t.confidence ?? 50,
    external_references: t.source ? [{ source_name: t.source, description: t.description ?? "" }] : [],
    created_by_ref: MACRA_IDENTITY.id,
    object_marking_refs: ["marking-definition--tlp-white"],
    extensions: {
      "extension-definition--litsecure": {
        extension_type: "property-extension",
        source: t.source ?? "LitSecure",
        malawi_specific: true,
        incident_count: t.incident_count ?? 0,
        blocklisted: !!t.blocklisted,
      }
    }
  };
}

/** Convert an incident row into a STIX 2.1 observed-data + threat-actor */
function incidentToObservedData(inc: any) {
  const created  = toStixTimestamp(inc.created_at);
  const id       = stixId("observed-data", inc.id ?? String(Math.random()));
  return {
    type: "observed-data",
    spec_version: "2.1",
    id,
    created,
    modified: created,
    first_observed: created,
    last_observed: created,
    number_observed: 1,
    object_refs: [],
    description: `[${inc.severity ?? "UNKNOWN"}] ${inc.title ?? "Incident"} — ${inc.category ?? "General"} in ${inc.sector ?? "Unknown"} sector`,
    labels: [
      (inc.severity ?? "medium").toLowerCase(),
      (inc.category ?? "general").toLowerCase().replace(/\s+/g, "-"),
    ],
    created_by_ref: MACRA_IDENTITY.id,
    extensions: {
      "extension-definition--litsecure": {
        extension_type: "property-extension",
        incident_id:    inc.id,
        sector:         inc.sector,
        severity:       inc.severity,
        category:       inc.category,
        district:       inc.district,
        status:         inc.status,
        malawi_specific: true,
      }
    }
  };
}

// ─── TLP Marking Definitions ──────────────────────────────────────────────────

const TLP_DEFINITIONS = {
  white: {
    type: "marking-definition",
    spec_version: "2.1",
    id: "marking-definition--tlp-white",
    created: "2017-01-20T00:00:00.000Z",
    definition_type: "tlp",
    definition: { tlp: "white" },
  },
  green: {
    type: "marking-definition",
    spec_version: "2.1",
    id: "marking-definition--tlp-green",
    created: "2017-01-20T00:00:00.000Z",
    definition_type: "tlp",
    definition: { tlp: "green" },
  },
  amber: {
    type: "marking-definition",
    spec_version: "2.1",
    id: "marking-definition--tlp-amber",
    created: "2017-01-20T00:00:00.000Z",
    definition_type: "tlp",
    definition: { tlp: "amber" },
  },
};

// ─── Routes ───────────────────────────────────────────────────────────────────

/** GET /api/stix/bundle — full STIX 2.1 bundle of all indicators + recent incidents */
router.get("/bundle", (req, res) => {
  const tlp   = (req.query.tlp as string) ?? "white";
  const limit = Math.min(parseInt(String(req.query.limit ?? "200")), 500);
  const type  = req.query.type as string | undefined; // "indicators" | "incidents" | undefined (all)

  const objects: any[] = [
    MACRA_IDENTITY,
    TLP_DEFINITIONS.white,
    TLP_DEFINITIONS.green,
    TLP_DEFINITIONS.amber,
  ];

  // Indicators from threat_intel
  if (!type || type === "indicators") {
    const rows = db.prepare(`
      SELECT * FROM threat_intel
      WHERE value IS NOT NULL AND value != ''
      ORDER BY last_seen DESC NULLS LAST, created_at DESC
      LIMIT ?
    `).all(limit) as any[];
    objects.push(...rows.map(threatToIndicator));
  }

  // Observed-data from incidents
  if (!type || type === "incidents") {
    const incidents = db.prepare(`
      SELECT * FROM incidents
      ORDER BY created_at DESC
      LIMIT ?
    `).all(Math.min(limit, 100)) as any[];
    objects.push(...incidents.map(incidentToObservedData));
  }

  const bundle = {
    type: "bundle",
    id: stixId("bundle", `macra-${Date.now()}`),
    spec_version: "2.1",
    created: new Date().toISOString(),
    objects,
    _meta: {
      source: "LitSecure Sentinel — MACRA/MACERT Malawi",
      generated_at: new Date().toISOString(),
      object_count: objects.length,
      tlp,
    }
  };

  res.setHeader("Content-Type", "application/taxii+json; version=2.1");
  res.setHeader("X-TAXII-Date-Added-First", new Date().toISOString());
  res.setHeader("X-TAXII-Date-Added-Last", new Date().toISOString());

  // Dual-write: log export event to Supabase
  if (isSupabaseEnabled()) {
    insertSharingRequestToSupabase({
      type: "EXPORT", format: "STIX_2_1",
      source: "LitSecure Sentinel", destination: "API Consumer",
      object_count: objects.length, status: "SENT",
    }).catch(() => {});
  }

  return res.json(bundle);
});


/** GET /api/stix/indicators — paginated indicator feed (TAXII Collections API style) */
router.get("/indicators", (req, res) => {
  const limit  = Math.min(parseInt(String(req.query.limit  ?? "50")),  200);
  const offset = parseInt(String(req.query.offset ?? "0"));
  const source = req.query.source as string | undefined;

  let query = "SELECT * FROM threat_intel WHERE value IS NOT NULL";
  const params: any[] = [];
  if (source) { query += " AND source = ?"; params.push(source); }
  query += " ORDER BY last_seen DESC NULLS LAST, created_at DESC LIMIT ? OFFSET ?";
  params.push(limit, offset);

  const rows = db.prepare(query).all(...params) as any[];
  const total = (db.prepare("SELECT COUNT(*) as c FROM threat_intel WHERE value IS NOT NULL").get() as any).c;

  return res.json({
    type: "indicators",
    spec_version: "2.1",
    indicators: rows.map(threatToIndicator),
    pagination: { total, limit, offset, next: offset + limit < total ? offset + limit : null },
  });
});

/** GET /api/stix/stats — summary for the STIX/TAXII status card */
router.get("/stats", (_req, res) => {
  const indicators = (db.prepare("SELECT COUNT(*) as c FROM threat_intel WHERE value IS NOT NULL").get() as any).c;
  const byType = db.prepare("SELECT type, COUNT(*) as count FROM threat_intel WHERE type IS NOT NULL GROUP BY type").all();
  const bySource = db.prepare("SELECT source, COUNT(*) as count FROM threat_intel WHERE source IS NOT NULL GROUP BY source").all();
  const incidents = (db.prepare("SELECT COUNT(*) as c FROM incidents").get() as any).c;
  const lastExport = new Date().toISOString();

  return res.json({
    indicators,
    incidents,
    byType,
    bySource,
    lastExport,
    formats: ["STIX 2.1", "TAXII 2.1"],
    partners: ["MACERT", "ZICTA-CERT", "KE-CIRT/CC", "TZ-CERT", "AfricaCERT"],
  });
});

/** POST /api/stix/ingest — accept a STIX bundle from a partner CERT */
router.post("/ingest", (req, res) => {
  const { objects } = req.body;
  if (!Array.isArray(objects)) return res.status(400).json({ error: "objects array required" });

  let ingested = 0;
  const now = new Date().toISOString();

  for (const obj of objects) {
    if (obj.type !== "indicator") continue;

    // Extract value from STIX pattern
    const ipMatch     = obj.pattern?.match(/value\s*=\s*'([0-9.]+)'/);
    const domainMatch = obj.pattern?.match(/domain-name:value\s*=\s*'([^']+)'/);
    const hashMatch   = obj.pattern?.match(/hashes\.[^=]+=\s*'([a-fA-F0-9]{32,})/);

    let value = ipMatch?.[1] ?? domainMatch?.[1] ?? hashMatch?.[1];
    let type  = ipMatch ? "ip" : domainMatch ? "domain" : hashMatch ? "hash" : "unknown";
    if (!value) continue;

    try {
      db.prepare(`
        INSERT OR IGNORE INTO threat_intel (id, type, value, source, confidence, description, created_at, last_seen)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        obj.id ?? `stix-${Math.random().toString(36).slice(2)}`,
        type, value,
        obj.external_references?.[0]?.source_name ?? "STIX Import",
        obj.confidence ?? 50,
        obj.description ?? obj.name ?? "",
        obj.created ?? now,
        obj.modified ?? now,
      );
      ingested++;
    } catch { /* duplicate — skip */ }
  }

  if (isSupabaseEnabled()) {
    insertSharingRequestToSupabase({
      type: "IMPORT", format: "STIX_2_1",
      source: "Partner CERT", destination: "LitSecure Sentinel",
      object_count: ingested, status: ingested > 0 ? "RECEIVED" : "FAILED",
    }).catch(() => {});
  }

  return res.json({ ingested, total: objects.length });
});

export default router;
