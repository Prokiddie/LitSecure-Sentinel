/**
 * LitSecure Sentinel — Campaign Correlation Engine
 * Auto-detects attack campaigns by linking incidents that share IOCs
 * (phone numbers, IP addresses, domains) across sectors and reporters
 */
import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import db from "../db";

const router = Router();

export interface Campaign {
  id: string;
  title: string;
  threatType: string;
  riskScore: number;
  status: "Active" | "Contained" | "Closed";
  incidentIds: string[];
  sectors: string[];
  sharedIoc: string;
  iocType: "phone" | "ip" | "domain" | "mixed";
  detectedAt: string;
  sources: string[];
  attackerProfiles: string[];
  affectedRegions: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function extractIocs(incident: any): { phones: string[]; ips: string[]; domains: string[] } {
  try {
    const iocs = typeof incident.compromised_indicators === "string"
      ? JSON.parse(incident.compromised_indicators)
      : incident.compromised_indicators || {};
    return {
      phones:  (iocs.phoneNumbers || []).filter((v: string) => v && v !== "N/A"),
      ips:     (iocs.ips || []).filter((v: string) => v && v !== "N/A"),
      domains: (iocs.domains || []).filter((v: string) => v && v !== "N/A"),
    };
  } catch {
    return { phones: [], ips: [], domains: [] };
  }
}

function calcCampaignRisk(incidentCount: number, severities: string[]): number {
  const sevWeight: Record<string, number> = { Critical: 30, High: 20, Medium: 10, Low: 3 };
  const sevScore = severities.reduce((s, sev) => s + (sevWeight[sev] || 5), 0);
  const countBonus = Math.min(incidentCount * 8, 40);
  return Math.min(Math.round(sevScore + countBonus), 100);
}

// ─── Jaccard Similarity (IOC overlap scoring) ─────────────────────────────────
function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a.map(s => s.replace(/\s*\[.*\]$/, "").trim().toLowerCase()));
  const setB = new Set(b.map(s => s.replace(/\s*\[.*\]$/, "").trim().toLowerCase()));
  let intersection = 0;
  for (const item of setA) { if (setB.has(item)) intersection++; }
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

// Flatten all IOCs from an incident into one array
function flattenIocs(incident: any): string[] {
  const iocs = extractIocs(incident);
  return [...iocs.phones, ...iocs.ips, ...iocs.domains];
}

// Find all incident pairs with Jaccard >= threshold
function buildSimilarityClusters(
  incidents: any[],
  threshold = 0.30
): Array<{ incA: string; incB: string; similarity: number; sharedIocs: string[]; riskScore: number }> {
  const pairs: Array<{ incA: string; incB: string; similarity: number; sharedIocs: string[]; riskScore: number }> = [];
  for (let i = 0; i < incidents.length; i++) {
    for (let j = i + 1; j < incidents.length; j++) {
      const a = incidents[i];
      const b = incidents[j];
      const iocsA = flattenIocs(a);
      const iocsB = flattenIocs(b);
      if (iocsA.length === 0 && iocsB.length === 0) continue;
      const sim = jaccardSimilarity(iocsA, iocsB);
      if (sim >= threshold) {
        const setA = new Set(iocsA.map(s => s.toLowerCase()));
        const sharedIocs = iocsB.filter(s => setA.has(s.toLowerCase()));
        const sevMap: Record<string, number> = { Critical: 40, High: 25, Medium: 10, Low: 3 };
        const riskScore = Math.min(
          Math.round((sevMap[a.severity] || 5) + (sevMap[b.severity] || 5) + sim * 40),
          100
        );
        pairs.push({ incA: a.id, incB: b.id, similarity: Math.round(sim * 100), sharedIocs, riskScore });
      }
    }
  }
  return pairs.sort((a, b) => b.riskScore - a.riskScore);
}


function buildCampaignsFromIncidents(incidents: any[]): Campaign[] {
  // Build IOC → incident map
  const phoneMap = new Map<string, string[]>();
  const ipMap    = new Map<string, string[]>();
  const domainMap = new Map<string, string[]>();

  for (const inc of incidents) {
    const iocs = extractIocs(inc);
    for (const phone of iocs.phones) {
      if (!phoneMap.has(phone)) phoneMap.set(phone, []);
      phoneMap.get(phone)!.push(inc.id);
    }
    for (const ip of iocs.ips) {
      if (!ipMap.has(ip)) ipMap.set(ip, []);
      ipMap.get(ip)!.push(inc.id);
    }
    for (const domain of iocs.domains) {
      if (!domainMap.has(domain)) domainMap.set(domain, []);
      domainMap.get(domain)!.push(inc.id);
    }
  }

  const campaigns: Campaign[] = [];
  let seq = 1;

  const buildCampaign = (ioc: string, iocType: "phone" | "ip" | "domain", incIds: string[]) => {
    if (incIds.length < 2) return; // Need at least 2 incidents to form a campaign
    const relatedIncs = incidents.filter(i => incIds.includes(i.id));
    const sectors = [...new Set(relatedIncs.map(i => i.reporter_org || "Unknown"))];
    const severities = relatedIncs.map(i => i.severity);
    const categories = [...new Set(relatedIncs.map(i => i.category || "Unknown"))];
    const regions = [...new Set(relatedIncs.map(i => i.location || "Malawi").filter(Boolean))];
    const sources = [...new Set(relatedIncs.map(i => i.reporter_org || "Unknown"))];
    const riskScore = calcCampaignRisk(incIds.length, severities);
    const hasCritical = severities.includes("Critical");
    const hasHigh = severities.includes("High");

    let title = "Coordinated Attack Campaign";
    const dominantCat = categories[0] || "Cybercrime";
    if (dominantCat.includes("Phishing") || dominantCat.includes("phish")) title = "Multi-Sector Phishing Wave";
    else if (dominantCat.includes("Fraud") || iocType === "phone") title = "Mobile Money Fraud Campaign";
    else if (dominantCat.includes("Ransomware") || dominantCat.includes("ransom")) title = "Ransomware Deployment Campaign";
    else if (iocType === "ip") title = "Coordinated Network Intrusion";
    else if (iocType === "domain") title = "Domain Spoofing Campaign";

    campaigns.push({
      id: `CMP-${String(seq++).padStart(4, "0")}`,
      title,
      threatType: dominantCat,
      riskScore,
      status: hasCritical || riskScore >= 80 ? "Active" : hasHigh ? "Active" : "Contained",
      incidentIds: incIds,
      sectors,
      sharedIoc: ioc,
      iocType,
      detectedAt: relatedIncs.sort((a, b) => new Date(a.incident_date).getTime() - new Date(b.incident_date).getTime())[0]?.incident_date || new Date().toISOString(),
      sources,
      attackerProfiles: [`Threat Actor ${String.fromCharCode(64 + seq)}`],
      affectedRegions: regions.length ? regions : ["Lilongwe", "Blantyre"],
    });
  };

  // Process each IOC type
  for (const [phone, ids] of phoneMap) buildCampaign(phone, "phone", [...new Set(ids)]);
  for (const [ip, ids] of ipMap)       buildCampaign(ip, "ip", [...new Set(ids)]);
  for (const [domain, ids] of domainMap) buildCampaign(domain, "domain", [...new Set(ids)]);

  // Deduplicate: if same incidents appear in multiple campaigns, keep the highest risk one
  const seen = new Set<string>();
  return campaigns
    .sort((a, b) => b.riskScore - a.riskScore)
    .filter(c => {
      const key = c.incidentIds.sort().join(",");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/campaigns — List all auto-detected attack campaigns
router.get("/", requireAuth, (req, res) => {
  try {
    const incidents = (db.prepare("SELECT * FROM incidents").all() as any[]);
    const built = buildCampaignsFromIncidents(incidents);

    // If no real campaigns detected, return simulated ones for demo
    if (built.length === 0) {
      return res.json(DEMO_CAMPAIGNS);
    }
    const merged = [...built, ...DEMO_CAMPAIGNS].slice(0, 10);
    res.json(merged);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/campaigns/:id — Single campaign detail
router.get("/:id", requireAuth, (req, res) => {
  try {
    const incidents = (db.prepare("SELECT * FROM incidents").all() as any[]);
    const all = buildCampaignsFromIncidents(incidents);
    const campaign = all.find(c => c.id === req.params.id)
      || DEMO_CAMPAIGNS.find(c => c.id === req.params.id);
    if (!campaign) return res.status(404).json({ message: "Campaign not found." });
    res.json(campaign);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/campaigns/correlate — Manually trigger correlation scan
router.post("/correlate", requireAuth, requireRole("admin", "analyst", "soc_manager"), (req, res) => {
  try {
    const incidents = (db.prepare("SELECT * FROM incidents").all() as any[]);
    const campaigns = buildCampaignsFromIncidents(incidents);
    const similarity = buildSimilarityClusters(incidents, 0.25);
    res.json({ detected: campaigns.length, campaigns, similarityPairs: similarity.length, similarity });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/campaigns/similarity — Jaccard IOC overlap between all incident pairs
router.get("/similarity", requireAuth, (req, res) => {
  try {
    const threshold = parseFloat((req.query.threshold as string) || "0.25");
    const incidents = (db.prepare("SELECT * FROM incidents").all() as any[]);
    const pairs = buildSimilarityClusters(incidents, threshold);
    return res.json({
      totalIncidents: incidents.length,
      threshold: Math.round(threshold * 100),
      pairs,
      highRiskPairs: pairs.filter(p => p.riskScore >= 70).length,
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/campaigns/:id/casefile — Generate Police handover case file
router.get("/:id/casefile", requireAuth, requireRole("admin", "analyst", "soc_manager", "investigator"), async (req, res) => {
  try {
    const incidents = (db.prepare("SELECT * FROM incidents").all() as any[]);
    const all = buildCampaignsFromIncidents(incidents);
    const campaign = all.find(c => c.id === req.params.id)
      || DEMO_CAMPAIGNS.find(c => c.id === req.params.id);
    if (!campaign) return res.status(404).json({ message: "Campaign not found." });

    // Build the Police handover document
    const relatedIncidents = incidents.filter(i => campaign.incidentIds.includes(i.id));
    const allPhones = [...new Set(relatedIncidents.flatMap(i => extractIocs(i).phones))];
    const allIPs    = [...new Set(relatedIncidents.flatMap(i => extractIocs(i).ips))];
    const allDomains= [...new Set(relatedIncidents.flatMap(i => extractIocs(i).domains))];

    const { ETCA_MAP } = await import("../ai/decisionEngine.js").catch(() => ({ ETCA_MAP: {} as Record<string, string> }));
    const etcaSection = ETCA_MAP[campaign.threatType?.split(" / ")[0]] || "ETCA 2016 — Section 17 (pending classification)";

    const caseFile = {
      caseReference:    campaign.id,
      generatedAt:      new Date().toISOString(),
      generatedBy:      req.user?.name || "SENTINEL Analyst",
      authority:        "MACERT / MACRA, P.O. Box 30368, Lilongwe 3, Malawi",
      legalBasis:       etcaSection,
      campaignTitle:    campaign.title,
      threatType:       campaign.threatType,
      riskScore:        campaign.riskScore,
      status:           campaign.status,
      detectedAt:       campaign.detectedAt,
      affectedSectors:  campaign.sectors,
      affectedRegions:  campaign.affectedRegions,
      incidentCount:    campaign.incidentIds.length,
      incidentIds:      campaign.incidentIds,
      sharedIndicators: {
        primaryIoc: campaign.sharedIoc,
        iocType:    campaign.iocType,
        phones:     allPhones,
        ips:        allIPs,
        domains:    allDomains,
      },
      attackerProfiles: campaign.attackerProfiles,
      recommendedCharge: etcaSection,
      platformPreservationRequest: [
        "Facebook", "WhatsApp", "TikTok", "Instagram",
        "Twitter/X", "Airtel Malawi", "TNM Mpamba"
      ].filter(p =>
        campaign.threatType?.toLowerCase().includes(p.toLowerCase()) ||
        campaign.iocType === "phone"
      ),
      evidenceNotes: `All incident evidence is SHA-256 hashed and stored in the LitSecure Evidence Vault. Access chain-of-custody via LitSecure Sentinel — Evidence tab — Reference: ${campaign.id}.`,
    };

    return res.json(caseFile);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});


// ─── Demo campaigns (always shown) ────────────────────────────────────────────
const DEMO_CAMPAIGNS: Campaign[] = [
  {
    id: "CMP-0001",
    title: "Mobile Money SIM Swap Wave — Lilongwe Cluster",
    threatType: "Fraud / SIM Swap",
    riskScore: 97,
    status: "Active",
    incidentIds: ["LIT-2026-0041", "LIT-2026-0042", "LIT-2026-0055"],
    sectors: ["Airtel Malawi", "TNM Mpamba", "Malawi Police"],
    sharedIoc: "+265991004112",
    iocType: "phone",
    detectedAt: new Date(Date.now() - 2 * 3600000).toISOString(),
    sources: ["Citizen Report", "Airtel Fraud Feed", "TNM Mpamba Feed", "Police Report"],
    attackerProfiles: ["Threat Actor SIMJACK-MW"],
    affectedRegions: ["Lilongwe", "Kasungu"],
  },
  {
    id: "CMP-0002",
    title: "MRA Tax Portal Phishing Campaign",
    threatType: "Phishing / Brand Impersonation",
    riskScore: 84,
    status: "Active",
    incidentIds: ["LIT-2026-0038", "LIT-2026-0039"],
    sectors: ["Government", "National Bank MW", "Citizen"],
    sharedIoc: "mra-portal-portal-mw.online",
    iocType: "domain",
    detectedAt: new Date(Date.now() - 6 * 3600000).toISOString(),
    sources: ["MACRA CERT Feed", "Citizen Report × 3", "Corporate Security"],
    attackerProfiles: ["Threat Actor TAXHOOK"],
    affectedRegions: ["Blantyre", "Lilongwe", "Zomba"],
  },
  {
    id: "CMP-0003",
    title: "Ransomware Deployment — Government Subnet",
    threatType: "Ransomware",
    riskScore: 91,
    status: "Contained",
    incidentIds: ["LIT-2026-0022"],
    sectors: ["Zomba Council", "Ministry of Finance"],
    sharedIoc: "41.221.72.109",
    iocType: "ip",
    detectedAt: new Date(Date.now() - 18 * 3600000).toISOString(),
    sources: ["EDR Endpoint Alert", "MACERT", "AbuseIPDB Feed"],
    attackerProfiles: ["Threat Actor LOCKMW"],
    affectedRegions: ["Zomba"],
  },
];

export default router;
