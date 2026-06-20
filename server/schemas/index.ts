import { z } from "zod";

// ─── Auth Schemas ─────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z.string().email("Must be a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

// ─── Incident Schemas ─────────────────────────────────────────────────────────

export const createIncidentSchema = z.object({
  title: z.string().min(5, "Title must be at least 5 characters").max(300, "Title too long"),
  description: z.string().min(20, "Description must be at least 20 characters").max(10000, "Description too long"),
  reporterName: z.string().min(2, "Reporter name required").max(100),
  reporterContact: z.string().min(7, "Contact is required").max(50),
  reporterOrg: z.string().max(150).optional(),
  evidenceUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  // Priority Engine signals (optional)
  sector: z.enum(["Banking","Telecom","Government","Utilities","Healthcare","Education","Other",""]).optional(),
  affectedUsers: z.number().int().min(0).max(100_000_000).optional(),
  estimatedLoss:  z.number().int().min(0).max(1_000_000_000_000).optional(), // MWK
});


export const updateIncidentSchema = z.object({
  status: z.enum(["Reported", "Investigating", "Contained", "Resolved"]).optional(),
  investigator: z.string().max(150).nullable().optional(),
  updateMessage: z.string().min(1, "Update message is required").max(2000).optional(),
  authorRole: z.string().optional(),
  authorName: z.string().max(100).optional(),
});

export const bulkStatusSchema = z.object({
  ids: z.array(z.string()).min(1, "At least one incident ID required"),
  status: z.enum(["Reported", "Investigating", "Contained", "Resolved"]),
  authorRole: z.string().optional(),
  authorName: z.string().max(100).optional(),
});

export const bulkDeleteSchema = z.object({
  ids: z.array(z.string()).min(1, "At least one incident ID required"),
  authorRole: z.string().optional(),
  authorName: z.string().max(100).optional(),
});

// ─── Site / Camera Schemas ────────────────────────────────────────────────────

export const createSiteSchema = z.object({
  name: z.string().min(3).max(200),
  address: z.string().max(300).optional(),
  orgId: z.string().min(1, "Organization ID is required"),
  securityLevel: z.enum(["Standard", "Elevated", "Maximum"]).optional(),
  location: z.string().max(100).optional(),
});

export const registerCameraSchema = z.object({
  name: z.string().min(3).max(200),
  rtspUrl: z.string().min(5, "RTSP URL is required"),
  siteId: z.string().min(1, "Site ID is required"),
  resolution: z.enum(["720p", "1080p", "4K"]).optional(),
  model: z.string().max(100).optional(),
  aiDetectionFlags: z.array(z.string()).optional(),
});

// ─── User Management Schemas ──────────────────────────────────────────────────

const ROLES = ["admin","investigator","analyst","org_user","org_admin","auditor","gov_admin","citizen","soc_manager","super_admin"] as const;

export const createUserSchema = z.object({
  fullName:       z.string().min(2, "Full name required").max(150),
  email:          z.string().email("Valid email required"),
  password:       z.string().min(8, "Password must be at least 8 characters")
                   .regex(/[A-Z]/, "Must contain an uppercase letter")
                   .regex(/[a-z]/, "Must contain a lowercase letter")
                   .regex(/\d/,    "Must contain a number"),
  role:           z.enum(ROLES),
  phone:          z.string().max(20).optional(),
  organizationId: z.string().max(100).optional(),
});

export const updateUserSchema = z.object({
  fullName:       z.string().min(2).max(150).optional(),
  phone:          z.string().max(20).optional(),
  role:           z.enum(ROLES).optional(),
  isActive:       z.boolean().optional(),
  organizationId: z.string().max(100).nullable().optional(),
});

// ─── Security Policy Schemas ──────────────────────────────────────────────────

export const createPolicySchema = z.object({
  name:           z.string().min(3, "Policy name required").max(200),
  type:           z.enum(["Firewall","SIEM","EDR","DNS","Behavioral","Custom"]),
  description:    z.string().max(2000).optional(),
  content:        z.string().min(1, "Policy content required").max(50_000),
  severity:       z.enum(["Low","Medium","High","Critical"]).optional(),
  action:         z.string().max(50).optional(),
  isActive:       z.boolean().optional(),
});

export const updatePolicySchema = createPolicySchema.partial();

export const evaluatePolicySchema = z.object({
  policyId:   z.string().min(1, "Policy ID required"),
  targetHost: z.string().max(255).optional(),
  payload:    z.record(z.unknown()).optional(),
});

// ─── Network Intel Schemas ────────────────────────────────────────────────────

export const fingerprintSchema = z.object({
  target: z.string().min(1, "Target IP or hostname required").max(253),
});

export const vpnDetectSchema = z.object({
  ip: z.string().ip("Must be a valid IP address"),
});

export const netAnalyzeSchema = z.object({
  target:  z.string().min(1).max(253),
  options: z.object({
    ports:   z.boolean().optional(),
    os:      z.boolean().optional(),
    vuln:    z.boolean().optional(),
  }).optional(),
});

// ─── Threat Intel & Watchlist Schemas ────────────────────────────────────────

export const addThreatIntelSchema = z.object({
  type:     z.enum(["ip","domain","hash","url","email","phone"]),
  value:    z.string().min(1, "IOC value required").max(2048),
  severity: z.enum(["Low","Medium","High","Critical"]),
  origin:   z.string().max(200).optional(),
  source:   z.string().max(100).optional(),
  description: z.string().max(2000).optional(),
});

export const addWatchlistSchema = z.object({
  type:      z.enum(["phone","ip","domain"]),
  value:     z.string().min(1, "Value required").max(500),
  riskLevel: z.enum(["Medium","High","Critical"]),
  reason:    z.string().min(5, "Reason required").max(1000),
});

// ─── Alert / Notification Schema ──────────────────────────────────────────────

export const createNotificationSchema = z.object({
  title:    z.string().min(3).max(300),
  message:  z.string().min(5).max(5000),
  type:     z.enum(["info","warning","critical","success"]).optional(),
  targetRole: z.string().max(50).optional(),
  channels: z.array(z.enum(["websocket","email","sms"])).optional(),
});

// ─── Security Policy (matches policies.ts route body) ────────────────────────

export const createSecurityPolicySchema = z.object({
  name:        z.string().min(3, "Policy name required").max(200),
  description: z.string().max(2000).optional(),
  sector:      z.string().max(100).optional().default("all"),
  category:    z.enum(["DETECTION","RESPONSE","COMPLIANCE","ESCALATION","PREVENTION","Custom"])
                 .optional().default("DETECTION"),
  rules:       z.array(z.record(z.unknown())).optional().default([]),
  actions:     z.array(z.record(z.unknown())).optional().default([]),
  status:      z.enum(["ACTIVE","DISABLED","DRAFT"]).optional().default("ACTIVE"),
  priority:    z.number().int().min(1).max(100).optional().default(50),
});

export const updateSecurityPolicySchema = createSecurityPolicySchema.partial();

export const deployPolicySchema = z.object({
  agentId: z.string().max(200).optional(),
  sector:  z.string().max(100).optional(),
});

export const evaluateIncidentPolicySchema = z.object({
  incident: z.record(z.unknown()).refine(v => Object.keys(v).length > 0, "incident payload required"),
});

// ─── VLAN / Network Intel ─────────────────────────────────────────────────────

export const vlanSimulateSchema = z.object({
  type: z.enum([
    "DOUBLE_TAGGING","VLAN_SCAN","SWITCH_SPOOF","VLAN_HOP_ATTEMPT",
    "DHCP_ROUTE_INJECTION","UNAUTHORIZED_VLAN_ACCESS","INTER_VLAN_ANOMALY",
  ]),
});

// ─── Profile Management Schemas ─────────────────────────────────────────────

export const updateProfileSchema = z.object({
  fullName: z.string().min(2, "Full name must be at least 2 characters").max(150),
  phone: z.string().max(20).optional().or(z.literal("")),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Must contain at least one uppercase letter")
    .regex(/[a-z]/, "Must contain at least one lowercase letter")
    .regex(/\d/, "Must contain at least one number"),
});

export const confirmMfaSchema = z.object({
  token: z.string().length(6, "Code must be exactly 6 digits").regex(/^\d+$/, "Code must contain only digits"),
});

export const disableMfaSchema = z.object({
  password: z.string().min(1, "Password is required"),
  token: z.string().length(6, "Code must be exactly 6 digits").regex(/^\d+$/, "Code must contain only digits"),
});



