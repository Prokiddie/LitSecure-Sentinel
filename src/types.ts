export type IncidentCategory = 'Fraud' | 'Phishing' | 'Malware' | 'Unauthorized Access' | 'System Breach' | 'Network Intrusion' | 'Unknown';
export type IncidentSeverity = 'Low' | 'Medium' | 'High' | 'Critical';
export type IncidentStatus = 'Reported' | 'Investigating' | 'Contained' | 'Resolved' | 'Closed';

export type UserRole = 'Admin' | 'Analyst' | 'Investigator' | 'External Organization';

export interface AuditLog {
  id: string;
  timestamp: string;
  user: string;
  role: string;
  action: string;
  details: string;
}

export interface IncidentUpdate {
  id: string;
  date: string;
  author: string;
  message: string;
  statusBefore: IncidentStatus;
  statusAfter: IncidentStatus;
}

export interface CompromisedIndicators {
  phoneNumbers: string[];
  ips: string[];
  domains: string[];
  devices: string[];
}

export interface Incident {
  id: string; // LIT-2026-XXXX
  title: string;
  description: string;
  category: IncidentCategory;
  severity: IncidentSeverity;
  status: IncidentStatus;
  reporterName: string;
  reporterContact: string;
  reporterOrg: string; // e.g., Airtel, TNM, Standard Bank, Government, Public
  incidentDate: string;
  evidenceUrl?: string; // string or dummy asset
  assignedInvestigator: string | null; // e.g., "Sg. Phiri (Police Cybercrime)"
  updates: IncidentUpdate[];
  mitigationAdvice: string;
  compromisedIndicators: CompromisedIndicators;
  analysisSummary: string; // AI generated deep dive summary
  estimatedLoss?: number;  // Optional financial loss estimate in USD
}

export interface SimulatedLog {
  id: string;
  timestamp: string;
  source: 'TNM Mpamba' | 'Airtel Money' | 'Standard Bank MW' | 'Airtel Network' | 'National Bank MW' | 'FDH Bank' | 'Malawi Gov Gateway' | 'Skyband ISP';
  event: string;
  severity: 'clean' | 'suspicious' | 'malicious';
  details: string;
  indicator: string; // e.g. target IP, mobile number
}

export interface NationalStats {
  totalIncidents:    number;
  reportedCount:     number;
  investigatingCount:number;
  containedCount:    number;
  resolvedCount:     number;
  criticalCount:     number;   // incidents with severity === "Critical"
  activeAlerts:      number;   // incidents not yet Resolved or Contained
  categoryStats:     { name: string; value: number }[];
  severityStats:     { name: string; value: number }[];
  orgStats?:         { name: string; value: number }[];
  trendData?:        { month: string; fraud: number; intrusion: number; phishing: number; malware: number }[];
  socialSignals?:    number;   // total social media signals ingested
}


// ======================
// PHYSICAL CCTV SURVEILLANCE & DEVICES SHEMETICS
// ======================

export interface Site {
  id: string;
  name: string;
  location: string; // "GPS: -13.9626, 33.7741"
  address: string;
  orgId: string;
  securityLevel: 'Standard' | 'Elevated' | 'Maximum';
}

export interface Camera {
  id: string;
  name: string;
  rtspUrl: string;
  status: 'Online' | 'Offline';
  siteId: string;
  isRecording: boolean;
  aiDetectionFlags: string[]; // ['MOTION', 'INTRUSION', 'FACE_MATCH']
  resolution: string; // "1080p", "4K"
  model: string;
}

export interface SecurityEvent {
  id: string;
  type: 'MOTION_DETECTED' | 'INTRUSION_ALERT' | 'FACE_MATCH' | 'UNAUTHORIZED_ACCESS' | 'TAMPER_ALERT';
  timestamp: string;
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
  location: string;
  status: 'Airing' | 'Acknowledged';
  details: string;
  cameraId: string;
}

export interface AccessLog {
  id: string;
  timestamp: string;
  deviceName: string;
  deviceType: 'Smart Lock' | 'Biometric' | 'RFID';
  user: string;
  action: string;
  status: 'Allowed' | 'Denied';
}

export interface BillingPlan {
  id: string;
  name: string;
  price: string;
  interval: string;
  features: string[];
  description: string;
}

// ======================
// RELATIONAL DATABASE SCHEMES (POSTGRESQL SPEC)
// ======================

export interface DBUser {
  id: string; // UUID
  full_name: string;
  email: string;
  phone: string;
  password_hash: string;
  role: 'admin' | 'investigator' | 'analyst' | 'org_user';
  organization_id: string | null; // references DBOrganization
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DBOrganization {
  id: string; // UUID
  name: string;
  type: 'bank' | 'telecom' | 'isp' | 'government' | 'private' | string;
  contact_email: string;
  contact_phone: string;
  api_key: string;
  created_at: string;
}

export interface DBIncident {
  id: string; // UUID
  title: string;
  description: string;
  incident_type: 'phishing' | 'fraud' | 'malware' | 'intrusion' | 'sim_swap' | 'other' | string;
  severity: 'low' | 'medium' | 'high' | 'critical' | string;
  status: 'reported' | 'investigating' | 'contained' | 'resolved' | string;
  reported_by: string; // references DBUser
  organization_id: string | null; // references DBOrganization
  location: string;
  ai_confidence_score: number;
  created_at: string;
  updated_at: string;
}

export interface DBIncidentEvidence {
  id: string; // UUID
  incident_id: string; // references DBIncident
  file_url: string;
  file_type: string;
  uploaded_at: string;
}

export interface DBIncidentAssignment {
  id: string; // UUID
  incident_id: string; // references DBIncident
  assigned_to: string; // references DBUser
  assigned_at: string;
  status: string; // active | passive | completed
}

export interface DBAlert {
  id: string; // UUID
  incident_id: string; // references DBIncident
  message: string;
  channel: 'sms' | 'email' | 'api' | 'push' | string;
  sent_to: string;
  sent_at: string;
}

export interface DBThreatIntel {
  id: string; // UUID
  indicator_type: 'ip' | 'phone' | 'email' | 'device_id' | string;
  indicator_value: string;
  threat_level: 'low' | 'medium' | 'high' | 'critical' | string;
  source_incident_id: string | null; // references DBIncident
  created_at: string;
}

export interface DBAuditLog {
  id: string; // UUID
  user_id: string; // references DBUser
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
}


