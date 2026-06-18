import bcrypt from "bcryptjs";
import { db, queries, generateId } from "./index.js";

export function seedDatabase() {
  // Dynamic seed check for watchlist to ensure it is populated even if base DB is already seeded
  const watchlistSeeded = queries.getSeedMeta.get("watchlist_seeded");
  if (!watchlistSeeded) {
    try {
      console.log("[DB] Seeding watchlist table...");
      const watchlistSeeds = [
        { id: generateId("wtc"), type: "ip", value: "198.51.100.82", risk_level: "Critical", reason: "Host of fake MRA tax portal phishing campaign", created_at: new Date().toISOString() },
        { id: generateId("wtc"), type: "phone", value: "+265991004112", risk_level: "High", reason: "Airtel Money SMS phishing campaign origin node", created_at: new Date().toISOString() },
        { id: generateId("wtc"), type: "domain", value: "mra-portal-portal-mw.online", risk_level: "Critical", reason: "Government portal impersonation domain used in tax fraud", created_at: new Date().toISOString() }
      ];
      for (const w of watchlistSeeds) {
        queries.insertWatchlist.run(w);
      }
      queries.setSeedMeta.run("watchlist_seeded", "true");
      console.log("[DB] Watchlist seeding complete.");
    } catch (e) {
      console.error("Watchlist seeding failed:", e);
    }
  }

  const already = queries.getSeedMeta.get("seeded");
  if (already) {
    console.log("[DB] Database already seeded. Skipping.");
    return;
  }

  console.log("[DB] Seeding database with initial data...");

  // ─── Users ───────────────────────────────────────────────────────────────
  const users = [
    {
      id: generateId("usr"),
      full_name: "Ruth Banda",
      email: "admin@macra.mw",
      phone: "+265111987541",
      password_hash: bcrypt.hashSync("Admin@Sentinel2026!", 12),
      role: "admin",
      organization_id: null,
      is_active: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: generateId("usr"),
      full_name: "John Phiri",
      email: "analyst@airtel.mw",
      phone: "+265888123456",
      password_hash: bcrypt.hashSync("Analyst@Sentinel2026!", 12),
      role: "analyst",
      organization_id: null,
      is_active: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: generateId("usr"),
      full_name: "Sgt. Chimwemwe Tembo",
      email: "investigator@police.mw",
      phone: "+265999876543",
      password_hash: bcrypt.hashSync("Investigator@2026!", 12),
      role: "investigator",
      organization_id: null,
      is_active: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: generateId("usr"),
      full_name: "Zione Mwale",
      email: "auditor@macra.mw",
      phone: "+265111987550",
      password_hash: bcrypt.hashSync("Auditor@Sentinel2026!", 12),
      role: "auditor",
      organization_id: null,
      is_active: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: generateId("usr"),
      full_name: "Barton Gondwe",
      email: "gov@egov.mw",
      phone: "+265111987560",
      password_hash: bcrypt.hashSync("Government@2026!", 12),
      role: "gov_admin",
      organization_id: null,
      is_active: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  for (const u of users) queries.insertUser.run(u);

  // ─── Sites ────────────────────────────────────────────────────────────────
  const sites = [
    { id: "S-01", name: "Standard Bank - Blantyre Main Hub", location: "GPS: -15.7861, 35.0058", address: "Standard Bank Bldg, Blantyre", org_id: "Standard Bank MW", security_level: "Maximum" },
    { id: "S-02", name: "Airtel Capital Hill Data Center",   location: "GPS: -13.9626, 33.7741", address: "Airtel Data Park, Lilongwe",   org_id: "Airtel Network",   security_level: "Maximum" },
    { id: "S-03", name: "TNM Regional HQ - Mzuzu Hub",      location: "GPS: -11.4584, 34.0150", address: "Plaza Block, Mzuzu",           org_id: "TNM Mpamba Ltd",   security_level: "Elevated" },
    { id: "S-04", name: "National Bank of MW - Lilongwe",   location: "GPS: -13.9782, 33.7854", address: "Civic Road, Lilongwe",         org_id: "National Bank MW", security_level: "Elevated" },
  ];
  for (const s of sites) {
    db.prepare("INSERT OR IGNORE INTO sites (id,name,location,address,org_id,security_level) VALUES (@id,@name,@location,@address,@org_id,@security_level)").run(s);
  }

  // ─── Cameras ─────────────────────────────────────────────────────────────
  const cameras = [
    { id: "CAM-01", name: "Data Vault Main Rack CCTV",       rtsp_url: "rtsp://10.201.2.4:554/live/stream1",    status: "Online",  site_id: "S-02", is_recording: 1, ai_detection_flags: '["MOTION","INTRUSION"]',         resolution: "4K",    model: "Sentinel-A9 Ultra Dome" },
    { id: "CAM-02", name: "Main ATM Lobby Entrance",          rtsp_url: "rtsp://10.102.4.9:554/live/lobby",      status: "Online",  site_id: "S-01", is_recording: 1, ai_detection_flags: '["MOTION","FACE_MATCH"]',         resolution: "1080p", model: "HikVision Pro-X" },
    { id: "CAM-03", name: "Power Grid Substation Perimeter",  rtsp_url: "rtsp://10.35.1.200:554/live/power",     status: "Online",  site_id: "S-02", is_recording: 0, ai_detection_flags: '["INTRUSION","TAMPER_ALERT"]',    resolution: "1080p", model: "Sentinel-Thermal-T2" },
    { id: "CAM-04", name: "Mzuzu Counter Gate Cam",           rtsp_url: "rtsp://10.99.3.111:554/live/mzuzu_gate",status: "Online",  site_id: "S-03", is_recording: 1, ai_detection_flags: '["MOTION"]',                    resolution: "1080p", model: "Dahua ActiveGuard" },
    { id: "CAM-05", name: "Lilongwe Civic Vault Gate",        rtsp_url: "rtsp://10.12.8.5:554/live/civic_vault", status: "Offline", site_id: "S-04", is_recording: 0, ai_detection_flags: '["MOTION","FACE_MATCH"]',         resolution: "4K",    model: "Sentinel-A12 Dual-Eye" },
  ];
  for (const c of cameras) {
    db.prepare("INSERT OR IGNORE INTO cameras (id,name,rtsp_url,status,site_id,is_recording,ai_detection_flags,resolution,model) VALUES (@id,@name,@rtsp_url,@status,@site_id,@is_recording,@ai_detection_flags,@resolution,@model)").run(c);
  }

  // ─── Security Events ─────────────────────────────────────────────────────
  const events = [
    { id: "EVT-8091", type: "INTRUSION_ALERT", timestamp: "2026-06-11T05:30:10.000Z", severity: "Critical", location: "Airtel Capital Hill Data Center",     status: "Airing",        details: "Unscheduled motion inside protected rack cage. System registered biometric lock fail simultaneously.", camera_id: "CAM-01" },
    { id: "EVT-3041", type: "FACE_MATCH",      timestamp: "2026-06-11T06:12:44.000Z", severity: "High",     location: "Standard Bank - Blantyre ATM Lobby",  status: "Airing",        details: "Biometric correlation positive for blacklisted identity suspect associated with SIM swap syndicate (Austin M.).", camera_id: "CAM-02" },
    { id: "EVT-1022", type: "TAMPER_ALERT",    timestamp: "2026-06-11T04:05:00.000Z", severity: "Medium",   location: "National Bank MW - Civic Center Gate", status: "Acknowledged",  details: "Camera signal loss. Hardware diagnostics pinpoint active cord connection disruption.", camera_id: "CAM-05" },
  ];
  for (const e of events) {
    db.prepare("INSERT OR IGNORE INTO security_events (id,type,timestamp,severity,location,status,details,camera_id) VALUES (@id,@type,@timestamp,@severity,@location,@status,@details,@camera_id)").run(e);
  }

  // ─── Access Logs ─────────────────────────────────────────────────────────
  const accessLogs = [
    { id: "ACS-4021", timestamp: "2026-06-11T06:34:02.000Z", device_name: "Main Server Cage Smart Lock", device_type: "Smart Lock", user_name: "Operator L. Katundu",     action: "Card swipe door access",       status: "Allowed" },
    { id: "ACS-9011", timestamp: "2026-06-11T06:32:15.000Z", device_name: "ATM Vault Door Scanner",      device_type: "Biometric",  user_name: "Chikondi Phiri (Staff ID)", action: "Fingerprint validation fail", status: "Denied" },
    { id: "ACS-1102", timestamp: "2026-06-11T06:10:00.000Z", device_name: "Mzuzu Site Back Gate RFID",   device_type: "RFID",       user_name: "Maintenance Officer",       action: "RFID fob swipe",              status: "Allowed" },
  ];
  for (const a of accessLogs) {
    db.prepare("INSERT OR IGNORE INTO access_logs (id,timestamp,device_name,device_type,user_name,action,status) VALUES (@id,@timestamp,@device_name,@device_type,@user_name,@action,@status)").run(a);
  }

  // ─── Simulated Logs ───────────────────────────────────────────────────────
  const logs = [
    { id: "LOG-01", timestamp: "2026-06-11T06:20:10Z", source: "TNM Mpamba",      event: "Multiple Rapid OTP Submissions Failed",      severity: "suspicious", details: "Merchant profile starting with +265888001 failed PIN challenge from 3 discrete devices", indicator: "+265888001002" },
    { id: "LOG-02", timestamp: "2026-06-11T06:22:15Z", source: "Airtel Money",    event: "Unusual Merchant Settlement Velocity",         severity: "malicious",  details: "Unusual settlement pattern of 4.5M MWK routed through Lilongwe towers in 3 minutes",          indicator: "+265991004112" },
    { id: "LOG-03", timestamp: "2026-06-11T06:28:44Z", source: "Skyband ISP",     event: "Brute-Force SSH Network Probe Detected",       severity: "suspicious", details: "Repeated port 22 access trails targeting Malawi Gov Gateway. Suspicious scan packets dropped.",  indicator: "102.167.3.2" },
    { id: "LOG-04", timestamp: "2026-06-11T06:31:02Z", source: "Standard Bank MW",event: "Spoof Domain Callback Triggered",              severity: "malicious",  details: "Outgoing user redirects routed to unrecognized '.online' asset hosted on non-banking address", indicator: "mra-portal-portal-mw.online" },
  ];
  for (const l of logs) {
    db.prepare("INSERT OR IGNORE INTO simulated_logs (id,timestamp,source,event,severity,details,indicator) VALUES (@id,@timestamp,@source,@event,@severity,@details,@indicator)").run(l);
  }

  // ─── Threat Intel Seeds ───────────────────────────────────────────────────
  const intel = [
    { id: generateId("ti"), type: "IP Address",    value: "102.162.4.92",                   origin: "Seed Threat Feed", severity: "High",     date: "2026-05-20" },
    { id: generateId("ti"), type: "Phone Number",  value: "+265991048201",                  origin: "MACERT Archive",   severity: "Critical", date: "2026-06-02" },
    { id: generateId("ti"), type: "Domain Wallet", value: "mtl-malawi-finance-verify.space", origin: "Seed Threat Feed", severity: "Critical", date: "2026-05-28" },
  ];
  for (const i of intel) queries.insertThreatIntel.run(i);

  // ─── Incidents ────────────────────────────────────────────────────────────
  const incidents = [
    {
      id: "LIT-2026-04192",
      title: "SIM Swap Fraud Targeting TNM Mpamba Merchants in Lilongwe Gateway",
      description: "Merchants reported an orchestrated network of fraudsters using cloned National Registration Bureau IDs to execute illegal SIM swaps. Once swapped, fraudsters drained TNM Mpamba e-wallets. Approximate loss is 4.8 million MWK.",
      category: "Fraud",
      severity: "High",
      status: "Investigating",
      reporter_name: "Chikondi Phiri",
      reporter_contact: "+265 888 12 34 56",
      reporter_org: "TNM Mpamba Agents Coalition",
      incident_date: "2026-06-08T10:30:00.000Z",
      evidence_url: null,
      assigned_investigator: "Sgt. N. Tembo (Police Cybercrime Unit)",
      mitigation_advice: "1. Temporarily freeze merchant transfers originating from Lilongwe Area 25 and 47.\n2. Audit merchant transactions exceeding 200,000 MWK.\n3. Implement biometric check for high-value mobile wallets.",
      compromised_indicators: JSON.stringify({ phoneNumbers: ["+265888991204", "+265880194851"], ips: ["102.167.3.45"], domains: [], devices: ["Techno Spark 20", "Samsung Galaxy A14"] }),
      analysis_summary: "Targeted Social Engineering and Identity Theft operation exploiting gaps in physical registration document verification.",
      updates: JSON.stringify([{ id: "U1", date: "2026-06-09T08:15:00.000Z", author: "Sgt. N. Tembo", message: "Contacted TNM Fraud unit to retrieve cell towers data for target phones.", statusBefore: "Reported", statusAfter: "Investigating" }]),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "LIT-2026-10492",
      title: "Spear Phishing Campaign Mimicking Malawi Revenue Authority (MRA)",
      description: "Several high-profile business units in Blantyre received emails styled perfectly as MRA TAX Audit assessments requesting resolution of income tax arrears via a malicious link. MRA confirmed no tax reviews run on this domain.",
      category: "Phishing",
      severity: "Critical",
      status: "Contained",
      reporter_name: "Security Analyst",
      reporter_contact: "+265 999 45 45 45",
      reporter_org: "Standard Bank Malawi NOC",
      incident_date: "2026-06-10T14:20:00.000Z",
      evidence_url: null,
      assigned_investigator: "Maj. S. Banda (Malawi Defense Cyber-Cell)",
      mitigation_advice: "1. Block domain mra-portal-portal-mw.online on all national business firewalls.\n2. Force active session resets for target tenants who authenticated through the spoof link.\n3. Deploy warning SMS messages through MACRA.",
      compromised_indicators: JSON.stringify({ phoneNumbers: [], ips: ["198.51.100.12", "198.51.100.82"], domains: ["mra-portal-portal-mw.online"], devices: [] }),
      analysis_summary: "Credential Harvesting operation targeting corporate accounting domains using precise social profiling.",
      updates: JSON.stringify([{ id: "U1", date: "2026-06-10T15:00:00.000Z", author: "Standard Bank Sec-Ops", message: "Internal firewall blocking established across standard banking gateways.", statusBefore: "Reported", statusAfter: "Contained" }]),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "LIT-2026-30421",
      title: "Malicious Payroll Ransom Hostage on Zomba District Council Portal",
      description: "The primary internal server hosting employee lists and treasury records was hit by cryptoware. User dashboards lock out, flashing ransomware files demanding 0.5 BTC to unencrypt. Files display .malawicrypt extension.",
      category: "System Breach",
      severity: "Critical",
      status: "Reported",
      reporter_name: "IT Coordinator",
      reporter_contact: "+265 111 878 234",
      reporter_org: "Zomba District Council",
      incident_date: "2026-06-11T02:00:00.000Z",
      evidence_url: null,
      assigned_investigator: null,
      mitigation_advice: "1. Isolate infected subnet immediately. Shut down WAN connectivity.\n2. Do NOT click ransom link or transmit currency.\n3. Transmit compromised files to MACERT for active signature scanning.",
      compromised_indicators: JSON.stringify({ phoneNumbers: [], ips: ["41.221.72.109"], domains: ["malawicrypt-paydesk.onion"], devices: ["PowerEdge R740 Server"] }),
      analysis_summary: "Ransomware vector utilizing exposed SMBv1 ports or weak administrative remote access credentials.",
      updates: JSON.stringify([]),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];
  for (const inc of incidents) {
    db.prepare("INSERT OR IGNORE INTO incidents (id,title,description,category,severity,status,reporter_name,reporter_contact,reporter_org,incident_date,evidence_url,assigned_investigator,mitigation_advice,compromised_indicators,analysis_summary,updates,created_at,updated_at) VALUES (@id,@title,@description,@category,@severity,@status,@reporter_name,@reporter_contact,@reporter_org,@incident_date,@evidence_url,@assigned_investigator,@mitigation_advice,@compromised_indicators,@analysis_summary,@updates,@created_at,@updated_at)").run(inc);
  }

  // Seed default Critical Assets
  const assets = [
    { id: "AST-001", name: "Capital Hill Government HRMS Mainframe", sector: "government", owner: "Ministry of Finance", location: "Capital Hill, Lilongwe", risk_score: 65, criticality: "Critical", status: "Operational", created_at: new Date().toISOString() },
    { id: "AST-002", name: "Standard Bank Core Banking System", sector: "banking", owner: "Standard Bank Malawi", location: "HQ, Blantyre", risk_score: 30, criticality: "Critical", status: "Operational", created_at: new Date().toISOString() },
    { id: "AST-003", name: "TNM Mpamba Transaction Gateway", sector: "telecom", owner: "TNM Malawi", location: "Regional Office, Mzuzu", risk_score: 55, criticality: "High", status: "Operational", created_at: new Date().toISOString() },
    { id: "AST-004", name: "Zomba Council Payroll Database", sector: "government", owner: "Zomba Council", location: "District Offices, Zomba", risk_score: 95, criticality: "Medium", status: "Degraded", created_at: new Date().toISOString() },
    { id: "AST-005", name: "Lilongwe Water Board SCADA Node", sector: "utility", owner: "Lilongwe Water Board", location: "Water Plant, Lilongwe", risk_score: 40, criticality: "High", status: "Operational", created_at: new Date().toISOString() },
  ];
  for (const a of assets) queries.insertAsset.run(a);

  // Seed default Security Rules
  const rules = [
    {
      id: "RUL-001",
      title: "Detect TNM Mpamba Spoofer Malware",
      language: "YARA",
      content: `rule TNM_Mpamba_Spoofer {\n  meta:\n    description = "Detects malicious banking Trojan targeting Mpamba web overlays"\n    author = "LitSecure Sentinel Core"\n  strings:\n    $api_str = "mpamba-wallet-verify.com" ascii\n    $swap_sig = { 8A 02 D3 4B FD A9 21 }\n  condition:\n    any of them\n}`,
      status: "Active",
      nodes_deployed: 14,
      created_at: new Date().toISOString()
    },
    {
      id: "RUL-002",
      title: "Capital Hill Gov Brute Force Sweeper",
      language: "Sigma",
      content: `title: SSH Brute Force Detection\nstatus: stable\ndescription: Detects SSH brute force logs on government portals\nlogsource:\n  product: linux\n  service: sshd\ndetection:\n  selection:\n    event.id: ssh_login_failed\n  timeframe: 1m\n  condition: selection | count() > 10\nfalsepositives:\n  - System administrators forgot passwords\nlevel: high`,
      status: "Active",
      nodes_deployed: 28,
      created_at: new Date().toISOString()
    },
    {
      id: "RUL-003",
      title: "DDoS SYN Flood Network Alert",
      language: "Snort",
      content: `alert tcp any any -> 41.221.72.0/24 80 (msg:"Possible DDoS SYN Flood on Zomba network"; flags:S; threshold:type threshold, track by_dst, count 500, seconds 2; sid:1000021; rev:1;)`,
      status: "Active",
      nodes_deployed: 8,
      created_at: new Date().toISOString()
    }
  ];
  for (const r of rules) queries.insertRule.run(r);

  // Seed default Telecom Alerts
  const telecomAlerts = [
    { id: "TEL-001", timestamp: new Date().toISOString(), type: "SIM Swap Alert", source: "TNM", phone_number: "+265888991204", details: "Rapid SIM Swap detected at Zomba agent shop. High frequency PIN requests immediately followed.", status: "Active" },
    { id: "TEL-002", timestamp: new Date().toISOString(), type: "Fraud Report", source: "Airtel", phone_number: "+265991004112", details: "Multiple victims reported receiving phished SMS texts asking to verify agent balance pins.", status: "Active" },
    { id: "TEL-003", timestamp: new Date().toISOString(), type: "Wallet Anomalies", source: "Airtel", phone_number: "+265992019482", details: "Bulk wallet payouts routed to a single unregistered SIM card within 2 minutes.", status: "Intercepted" }
  ];
  for (const t of telecomAlerts) db.prepare("INSERT INTO telecom_alerts (id, timestamp, type, source, phone_number, details, status) VALUES (@id, @timestamp, @type, @source, @phone_number, @details, @status)").run(t);

  // Seed default Evidence Entries
  const evidence = [
    {
      id: "EVI-001",
      incident_id: "LIT-2026-04192",
      file_name: "nrb_cloned_identity_doc.jpg",
      file_url: "/uploads/nrb_cloned_identity_doc.jpg",
      file_type: "screenshot",
      file_size: 452010,
      sha256_hash: "8a49c25f187dbcb3e5a329d494101bc3ea5b018fbef31c34a9b6c9cb2409fbc9",
      chain_of_custody: JSON.stringify([
        { date: new Date().toISOString(), action: "Uploaded", user: "Chikondi Phiri", details: "Evidence file uploaded via reporting portal" },
        { date: new Date().toISOString(), action: "Verified Hash", user: "Sentinel Core", details: "Hash verification successful. SHA-256 registered." }
      ]),
      tags: JSON.stringify(["Lilongwe", "TNM", "Cloned ID"]),
      uploaded_at: new Date().toISOString()
    },
    {
      id: "EVI-002",
      incident_id: "LIT-2026-10492",
      file_name: "mra_spear_phish_headers.txt",
      file_url: "/uploads/mra_spear_phish_headers.txt",
      file_type: "log",
      file_size: 14201,
      sha256_hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      chain_of_custody: JSON.stringify([
        { date: new Date().toISOString(), action: "Extracted Logs", user: "Standard Bank Sec-Ops", details: "Ingested SMTP headers from compromised mail server" }
      ]),
      tags: JSON.stringify(["MRA", "Phishing", "SMTP Headers"]),
      uploaded_at: new Date().toISOString()
    }
  ];
  for (const e of evidence) queries.insertEvidence.run(e);

  // ─── Audit Logs ───────────────────────────────────────────────────────────
  const auditLogs = [
    { id: generateId("aud"), timestamp: "2026-06-11T04:20:00.000Z", user_name: "Ruth Banda",    user_role: "admin",       action: "Incident Review",   details: "Analyzed SIM Swap incident and verified TNM Mpamba operational records",          entity_type: "incident", entity_id: "LIT-2026-04192" },
    { id: generateId("aud"), timestamp: "2026-06-11T05:10:00.000Z", user_name: "Maj. S. Banda", user_role: "investigator", action: "Status Update",     details: "Updated Spear Phishing Campaign severity checklist to Contained",               entity_type: "incident", entity_id: "LIT-2026-10492" },
  ];
  for (const a of auditLogs) queries.insertAuditLog.run(a);

  queries.setSeedMeta.run("seeded", "true");
  console.log("[DB] Seeding complete.");
}
