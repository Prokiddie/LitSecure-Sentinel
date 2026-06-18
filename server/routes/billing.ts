/**
 * LitSecure Sentinel — Billing & Subscription Module v2
 *
 * Replaces the single-endpoint stub with a full subscription management system:
 * - Plans (Government, Enterprise, NGO, Telecom tiers)
 * - Organization subscriptions (create, read, upgrade)
 * - Invoice generation
 * - Usage tracking
 * - Revenue reporting for investors
 */
import { Router } from "express";
import crypto from "crypto";
import { db } from "../db/index.js";
import { requireRole } from "../middleware/auth.js";

const router = Router();

// ─── Schema bootstrap (idempotent) ───────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS subscriptions (
    id               TEXT PRIMARY KEY,
    org_id           TEXT NOT NULL,
    org_name         TEXT NOT NULL,
    plan_id          TEXT NOT NULL,
    status           TEXT NOT NULL DEFAULT 'active',
    billing_cycle    TEXT NOT NULL DEFAULT 'annual',
    amount_usd       REAL NOT NULL,
    currency         TEXT NOT NULL DEFAULT 'USD',
    amount_mwk       REAL NOT NULL DEFAULT 0,
    start_date       TEXT NOT NULL,
    next_billing     TEXT NOT NULL,
    end_date         TEXT,
    contact_email    TEXT,
    contact_name     TEXT,
    notes            TEXT,
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS invoices (
    id               TEXT PRIMARY KEY,
    subscription_id  TEXT NOT NULL REFERENCES subscriptions(id),
    invoice_number   TEXT NOT NULL UNIQUE,
    amount_usd       REAL NOT NULL,
    amount_mwk       REAL NOT NULL DEFAULT 0,
    status           TEXT NOT NULL DEFAULT 'pending',
    due_date         TEXT NOT NULL,
    paid_date        TEXT,
    description      TEXT,
    line_items       TEXT DEFAULT '[]',
    created_at       TEXT NOT NULL
  );
`);

// ─── Plans catalogue ──────────────────────────────────────────────────────────
const PLANS = [
  {
    id:          "gov-starter",
    name:        "Government Starter",
    tier:        "Government",
    price_usd:   12000,
    price_mwk:   20_760_000,
    cycle:       "annual",
    users:       10,
    description: "For MACRA, MACERT, and small government agencies. Core incident management + AI + notifications.",
    features: [
      "10 named analyst/admin users",
      "Incident Management (full)",
      "AI Threat Classification",
      "SSE Real-Time Notifications",
      "Threat Intelligence Feeds",
      "District Map Views",
      "Audit Logs (tamper-evident)",
      "Email support (4h SLA)",
    ],
    recommended_for: ["MACRA", "MACERT", "Ministry of ICT", "Police CID"],
  },
  {
    id:          "gov-standard",
    name:        "Government Standard",
    tier:        "Government",
    price_usd:   24000,
    price_mwk:   41_520_000,
    cycle:       "annual",
    users:       25,
    description: "Full SOC/CERT capability for national-level operations.",
    features: [
      "25 named users",
      "All Starter features",
      "SOC Situation Room",
      "War Room Collaboration",
      "Campaign Correlation",
      "Social Media Monitoring",
      "STIX/TAXII Export",
      "Case Management",
      "Evidence Vault",
      "Dedicated support + monthly review",
    ],
    recommended_for: ["National CERT", "MACRA HQ", "Anti-Corruption Bureau"],
  },
  {
    id:          "telecom",
    name:        "Telecom & Banking",
    tier:        "Sector",
    price_usd:   30000,
    price_mwk:   51_900_000,
    cycle:       "annual",
    users:       20,
    description: "Fraud intelligence platform for MNOs and financial institutions.",
    features: [
      "20 named users",
      "SIM Swap Cluster Detection",
      "Mobile Money Fraud Monitoring",
      "USSD Gateway (Africa's Talking)",
      "Telecom Alert Dashboard",
      "SMS/USSD Incident Reporting",
      "Sector ISAC data sharing",
      "Integration API (REST)",
      "Priority support (2h SLA)",
    ],
    recommended_for: ["Airtel Malawi", "TNM", "NBS Bank", "FDH Bank"],
  },
  {
    id:          "enterprise",
    name:        "Enterprise",
    tier:        "Enterprise",
    price_usd:   60000,
    price_mwk:   103_800_000,
    cycle:       "annual",
    users:       100,
    description: "Full national deployment with unlimited users and all modules.",
    features: [
      "100 named users (extendable)",
      "All modules included",
      "EDR Endpoint Protection",
      "CCTV Surveillance Integration",
      "Custom AI model training",
      "On-premise deployment option",
      "Dedicated account manager",
      "1h SLA + 24/7 emergency",
      "Custom reporting templates",
      "MACRA compliance report generation",
    ],
    recommended_for: ["Reserve Bank", "MRA", "Ministry of Finance", "EGENCO"],
  },
  {
    id:          "ngo",
    name:        "NGO / Development Partner",
    tier:        "NGO",
    price_usd:   8000,
    price_mwk:   13_840_000,
    cycle:       "annual",
    users:       8,
    description: "Discounted tier for NGOs, INGOs, and development partners.",
    features: [
      "8 users",
      "Core incident reporting",
      "AI analysis",
      "Threat intelligence",
      "Awareness training module",
      "Standard email support",
    ],
    recommended_for: ["UNDP", "USAID implementers", "World Bank projects"],
  },
];

// MWK/USD exchange rate (updated manually or via forex API)
const USD_TO_MWK = 1730;

// ─── GET /api/billing/plans ───────────────────────────────────────────────────
router.get("/plans", (req, res) => {
  return res.json({ plans: PLANS, exchange_rate: { usd_to_mwk: USD_TO_MWK } });
});

// ─── GET /api/billing/subscriptions ──────────────────────────────────────────
router.get("/subscriptions", requireRole("admin", "gov_admin", "soc_manager"), (req, res) => {
  const subs = db.prepare("SELECT * FROM subscriptions ORDER BY created_at DESC").all() as any[];
  const totalARR = subs.filter(s => s.status === "active").reduce((sum, s) => sum + s.amount_usd, 0);
  return res.json({ subscriptions: subs, total_arr_usd: totalARR, count: subs.length });
});

// ─── POST /api/billing/subscriptions ─────────────────────────────────────────
router.post("/subscriptions", requireRole("admin", "gov_admin"), (req, res) => {
  const { org_id, org_name, plan_id, billing_cycle, contact_email, contact_name, notes } = req.body;
  if (!org_name || !plan_id) {
    return res.status(400).json({ error: "org_name and plan_id are required." });
  }

  const plan = PLANS.find(p => p.id === plan_id);
  if (!plan) return res.status(404).json({ error: "Plan not found." });

  const id         = `SUB-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  const now        = new Date();
  const nextBill   = new Date(now); nextBill.setFullYear(nextBill.getFullYear() + 1);

  db.prepare(`
    INSERT INTO subscriptions
      (id, org_id, org_name, plan_id, status, billing_cycle, amount_usd, currency, amount_mwk,
       start_date, next_billing, contact_email, contact_name, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'active', ?, ?, 'USD', ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, org_id || id, org_name, plan_id,
    billing_cycle || "annual",
    plan.price_usd, plan.price_usd * USD_TO_MWK,
    now.toISOString(), nextBill.toISOString(),
    contact_email || "", contact_name || "", notes || "",
    now.toISOString(), now.toISOString()
  );

  // Auto-generate first invoice
  const invoiceId  = `INV-${Date.now()}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
  const invNumber  = `LSS-${new Date().getFullYear()}-${String(db.prepare("SELECT COUNT(*) as n FROM invoices").get() as any).padStart ? "001" : "001"}`;
  const dueDate    = new Date(now); dueDate.setDate(dueDate.getDate() + 30);

  db.prepare(`
    INSERT INTO invoices (id, subscription_id, invoice_number, amount_usd, amount_mwk, status, due_date, description, line_items, created_at)
    VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)
  `).run(
    invoiceId, id, invNumber,
    plan.price_usd, plan.price_usd * USD_TO_MWK,
    dueDate.toISOString(),
    `${plan.name} — Annual Subscription (${now.getFullYear()})`,
    JSON.stringify([{ description: plan.name, quantity: 1, unit_price: plan.price_usd, total: plan.price_usd }]),
    now.toISOString()
  );

  return res.status(201).json({
    subscription: db.prepare("SELECT * FROM subscriptions WHERE id = ?").get(id),
    invoice:      db.prepare("SELECT * FROM invoices WHERE id = ?").get(invoiceId),
    message: `Subscription created for ${org_name}. Invoice ${invNumber} generated (due ${dueDate.toDateString()}).`,
  });
});

// ─── GET /api/billing/invoices ────────────────────────────────────────────────
router.get("/invoices", requireRole("admin", "gov_admin"), (req, res) => {
  const invoices = db.prepare("SELECT * FROM invoices ORDER BY created_at DESC").all();
  return res.json(invoices);
});

// ─── POST /api/billing/invoices/:id/pay ───────────────────────────────────────
router.post("/invoices/:id/pay", requireRole("admin", "gov_admin"), (req, res) => {
  const inv = db.prepare("SELECT * FROM invoices WHERE id = ?").get(req.params.id) as any;
  if (!inv) return res.status(404).json({ error: "Invoice not found." });
  db.prepare("UPDATE invoices SET status = 'paid', paid_date = ? WHERE id = ?")
    .run(new Date().toISOString(), req.params.id);
  return res.json({ ok: true, message: "Invoice marked as paid." });
});

// ─── GET /api/billing/revenue ─────────────────────────────────────────────────
// Investor-facing revenue metrics
router.get("/revenue", requireRole("admin", "gov_admin"), (req, res) => {
  const subs   = db.prepare("SELECT * FROM subscriptions WHERE status = 'active'").all() as any[];
  const arr    = subs.reduce((s, x) => s + x.amount_usd, 0);
  const mrr    = arr / 12;
  const paid   = (db.prepare("SELECT COALESCE(SUM(amount_usd),0) as t FROM invoices WHERE status = 'paid'").get() as any).t;
  const byPlan = PLANS.map(p => ({
    plan:  p.name,
    count: subs.filter(s => s.plan_id === p.id).length,
    arr:   subs.filter(s => s.plan_id === p.id).reduce((sum, s) => sum + s.amount_usd, 0),
  }));

  return res.json({
    arr_usd:            arr,
    mrr_usd:            mrr,
    total_paid_usd:     paid,
    active_customers:   subs.length,
    revenue_by_plan:    byPlan,
    churn_rate_percent: 0, // calculated when cancellations exist
  });
});

export default router;
