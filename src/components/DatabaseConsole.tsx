import React, { useState, useEffect } from "react";
import { 
  Database, Terminal, Play, Cpu, Send, RefreshCw, Key, ShieldAlert, FileText, 
  Layers, User, Users, Landmark, Bell, AlertTriangle, CheckCircle, Info, ChevronRight, HelpCircle
} from "lucide-react";
import { DBUser, DBOrganization, DBIncident, DBIncidentEvidence, DBIncidentAssignment, DBAlert, DBThreatIntel, DBAuditLog } from "../types";

export default function DatabaseConsole() {
  // Database Tables State
  const [users, setUsers] = useState<DBUser[]>([]);
  const [organizations, setOrganizations] = useState<DBOrganization[]>([]);
  const [incidents, setIncidents] = useState<DBIncident[]>([]);
  const [evidence, setEvidence] = useState<DBIncidentEvidence[]>([]);
  const [assignments, setAssignments] = useState<DBIncidentAssignment[]>([]);
  const [alerts, setAlerts] = useState<DBAlert[]>([]);
  const [threatIntel, setThreatIntel] = useState<DBThreatIntel[]>([]);
  const [auditLogs, setAuditLogs] = useState<DBAuditLog[]>([]);

  // Selected state
  const [activeTable, setActiveTable] = useState<'users' | 'organizations' | 'incidents' | 'evidence' | 'assignments' | 'alerts' | 'threat_intel' | 'audit_logs'>('incidents');
  const [activeTesterTab, setActiveTesterTab] = useState<'sql' | 'playground' | 'microservices'>('playground');

  // Loading/Refreshing states
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Playground tester states
  const [selectedEndpoint, setSelectedEndpoint] = useState<string>("classify");
  const [apiResponse, setApiResponse] = useState<any>(null);
  const [apiIsLoading, setApiIsLoading] = useState<boolean>(false);

  // Form Fields for Register User
  const [regName, setRegName] = useState("Vandame Kachingwe");
  const [regEmail, setRegEmail] = useState("v.kachingwe@cert.mw");
  const [regPhone, setRegPhone] = useState("+265888991204");
  const [regRole, setRegRole] = useState<any>("analyst");
  const [regOrgId, setRegOrgId] = useState("");

  // Form Fields for Login User
  const [loginEmail, setLoginEmail] = useState("john.phiri@standardbank.co.mw");

  // Form Fields for Create Incident
  const [incTitle, setIncTitle] = useState("SIM Swap hijacking on CDH Bank");
  const [incDesc, setIncDesc] = useState("Customer reported SIM hijack on TNM SIM card resulting in corporate banking unauthorized token resets.");
  const [incType, setIncType] = useState("sim_swap");
  const [incSeverity, setIncSeverity] = useState("high");
  const [incLocation, setIncLocation] = useState("Blantyre, Malawi");

  // Form Fields for AI Classify
  const [aiClassifyTitle, setAiClassifyTitle] = useState("Phishing Link mimicking FDH Bank Portal");
  const [aiClassifyDesc, setAiClassifyDesc] = useState("Critical spear phishing domain targeting local FDH bank customers via SMS link fdh-online-secure.net. Directing users to log in credentials.");

  // Form Fields for Assign Incident
  const [assignIncidentId, setAssignIncidentId] = useState("");
  const [assignUserId, setAssignUserId] = useState("");

  // Form Fields for Evidence Attachment
  const [evidenceIncidentId, setEvidenceIncidentId] = useState("");
  const [evidenceFileType, setEvidenceFileType] = useState("image/png");

  // Form Fields for Send Alert
  const [alertIncidentId, setAlertIncidentId] = useState("");
  const [alertMessage, setAlertMessage] = useState("[CRITICAL ALERT] Phishing link FDH Bank detected. Do NOT authenticate.");
  const [alertChannel, setAlertChannel] = useState("sms");
  const [alertSentTo, setAlertSentTo] = useState("+265888910024");

  // Form Fields for Threat Intel IOC
  const [intelType, setIntelType] = useState("phone");
  const [intelValue, setIntelValue] = useState("+265999014810");
  const [intelLevel, setIntelLevel] = useState("medium");
  const [intelIncId, setIntelIncId] = useState("");

  // Raw SQL Schemas mappings matching user design
  const sqlSchemas = {
    users: `CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(50),
    password_hash TEXT NOT NULL,
    role VARCHAR(50) NOT NULL, 
    -- admin | investigator | analyst | org_user
    organization_id UUID,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);`,
    organizations: `CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(100),
    -- bank | telecom | isp | government | private
    contact_email VARCHAR(255),
    contact_phone VARCHAR(50),
    api_key TEXT UNIQUE,
    created_at TIMESTAMP DEFAULT NOW()
);`,
    incidents: `CREATE TABLE incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255),
    description TEXT,
    incident_type VARCHAR(100),
    -- phishing | fraud | malware | intrusion | sim_swap | other
    severity VARCHAR(50),
    -- low | medium | high | critical
    status VARCHAR(50),
    -- reported | investigating | contained | resolved
    reported_by UUID REFERENCES users(id),
    organization_id UUID REFERENCES organizations(id),
    location VARCHAR(255),
    ai_confidence_score FLOAT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);`,
    evidence: `CREATE TABLE incident_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID REFERENCES incidents(id),
    file_url TEXT,
    file_type VARCHAR(50),
    uploaded_at TIMESTAMP DEFAULT NOW()
);`,
    assignments: `CREATE TABLE incident_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID REFERENCES incidents(id),
    assigned_to UUID REFERENCES users(id),
    assigned_at TIMESTAMP DEFAULT NOW(),
    status VARCHAR(50) -- active | completed
);`,
    alerts: `CREATE TABLE alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID REFERENCES incidents(id),
    message TEXT,
    channel VARCHAR(50),
    -- sms | email | api | push
    sent_to VARCHAR(255),
    sent_at TIMESTAMP DEFAULT NOW()
);`,
    threat_intel: `CREATE TABLE threat_intel (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    indicator_type VARCHAR(100),
    -- ip | phone | email | device_id
    indicator_value TEXT,
    threat_level VARCHAR(50),
    source_incident_id UUID REFERENCES incidents(id),
    created_at TIMESTAMP DEFAULT NOW()
);`,
    audit_logs: `CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(255),
    entity_type VARCHAR(100),
    entity_id UUID,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);`
  };

  // Fetch tables payload
  const fetchTables = async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/v1/developer/tables");
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
        setOrganizations(data.organizations || []);
        setIncidents(data.incidents || []);
        setEvidence(data.incident_evidence || []);
        setAssignments(data.incident_assignments || []);
        setAlerts(data.alerts || []);
        setThreatIntel(data.threat_intel || []);
        setAuditLogs(data.audit_logs || []);

        // Pre-fill default form states if empty
        if (data.organizations?.length > 0 && !regOrgId) {
          setRegOrgId(data.organizations[0].id);
        }
        if (data.incidents?.length > 0) {
          if (!assignIncidentId) setAssignIncidentId(data.incidents[0].id);
          if (!evidenceIncidentId) setEvidenceIncidentId(data.incidents[0].id);
          if (!alertIncidentId) setAlertIncidentId(data.incidents[0].id);
          if (!intelIncId) setIntelIncId(data.incidents[0].id);
        }
        if (data.users?.length > 0) {
          if (!assignUserId) setAssignUserId(data.users[0].id);
        }
      }
    } catch (err) {
      console.error("Failed querying backend relational database mapper:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchTables();
  }, []);

  // Post sandbox caller
  const handleTestApi = async (endpoint: string) => {
    setApiIsLoading(true);
    setApiResponse(null);
    let url = "";
    let bodyObj: any = {};
    let method = "POST";

    try {
      switch (endpoint) {
        case "register":
          url = "/api/v1/auth/register";
          bodyObj = {
            full_name: regName,
            email: regEmail,
            phone: regPhone,
            password: "SecurePassword123",
            role: regRole,
            organization_id: regOrgId
          };
          break;
        case "login":
          url = "/api/v1/auth/login";
          bodyObj = {
            email: loginEmail,
            password: "AnyPasswordMock"
          };
          break;
        case "create_incident":
          url = "/api/v1/incidents";
          bodyObj = {
            title: incTitle,
            description: incDesc,
            incident_type: incType,
            severity: incSeverity,
            reported_by: users[0]?.id || null,
            organization_id: regOrgId,
            location: incLocation
          };
          break;
        case "get_incidents":
          url = "/api/v1/incidents";
          method = "GET";
          break;
        case "classify":
          url = "/api/v1/ai/classify-incident";
          bodyObj = {
            title: aiClassifyTitle,
            description: aiClassifyDesc
          };
          break;
        case "assign":
          url = `/api/v1/incidents/${assignIncidentId || "mock"}/assign`;
          bodyObj = {
            assigned_to: assignUserId
          };
          break;
        case "evidence":
          url = `/api/v1/incidents/${evidenceIncidentId || "mock"}/evidence`;
          bodyObj = {
            file_url: `https://secure.sentinel.mw/vault/evidence/capture_${Math.random().toString(36).substring(7)}.${evidenceFileType.split("/")[1] || "log"}`,
            file_type: evidenceFileType
          };
          break;
        case "send_alert":
          url = "/api/v1/alerts/send";
          bodyObj = {
            incident_id: alertIncidentId,
            message: alertMessage,
            channel: alertChannel,
            sent_to: alertSentTo
          };
          break;
        case "add_intel":
          url = "/api/v1/threat-intel";
          bodyObj = {
            indicator_type: intelType,
            indicator_value: intelValue,
            threat_level: intelLevel,
            source_incident_id: intelIncId
          };
          break;
        default:
          return;
      }

      const fetchOptions: RequestInit = {
        method
      };

      if (method !== "GET") {
        fetchOptions.headers = { "Content-Type": "application/json" };
        fetchOptions.body = JSON.stringify(bodyObj);
      }

      const res = await fetch(url, fetchOptions);
      const resData = await res.json();
      setApiResponse({
        status_code: res.status,
        status_text: res.statusText,
        payload: resData
      });

      // Refetch database state in background to sync UI tables
      fetchTables();
    } catch (err: any) {
      setApiResponse({
        error: true,
        message: err.message || "Failed dispatching manual API integration connection"
      });
    } finally {
      setApiIsLoading(false);
    }
  };

  return (
    <div className="space-y-6" id="db-api-console-root">
      
      {/* 1. SECURE DATABASE HEADER METRICS */}
      <div className="bg-[#05080F] border border-white/[0.06] rounded-2xl p-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-linear-to-r from-[#FFD600]/5 to-transparent pointer-events-none" />
        
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 z-20 relative">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-[#FFD600]/10 border border-[#FFD600]/20 text-[#FFD600] text-[10px] font-mono rounded font-bold uppercase tracking-widest">
                System Core Backplane
              </span>
              <span className="w-2 h-2 rounded-full bg-[#FFD600] animate-ping" />
            </div>
            <h2 className="text-xl font-bold text-slate-100 tracking-tight mt-1 font-sans">
              PostgreSQL Relational DB Spec & API sandbox
            </h2>
            <p className="text-xs text-slate-400 font-sans mt-0.5 max-w-xl leading-relaxed">
              Live in-memory database simulation mapping MACRA National Cyber Intelligence data tables. Real-time REST endpoints fully queryable using raw API protocols.
            </p>
          </div>

          <div className="flex gap-2 self-stretch md:self-auto">
            <button
              onClick={fetchTables}
              disabled={refreshing}
              className="flex-1 md:flex-none px-3.5 py-2 bg-[#0A0E1A] hover:bg-slate-800 border border-white/10 hover:border-slate-700 rounded-xl text-xs font-semibold text-slate-200 flex items-center justify-center gap-2 transition"
              id="refresh-db-tables-btn"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>{refreshing ? "Re-syncing Schema..." : "Refresh DB Tables"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. DONT DUPICATE LOGIC: LAYOUT SPLIT */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COLUMN: TELEMETRY API TESTER & SCHEMATICS FIELD */}
        <div className="xl:col-span-6 space-y-6">
          
          <div className="bg-[#0A0E1A] border border-white/10 rounded-2xl overflow-hidden shadow-xl">
            
            {/* Nav Tabs for API test / schemas / microservices diagram */}
            <div className="bg-[#05080F] px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest font-mono flex items-center gap-1.5">
                <Terminal className="w-4 h-4 text-[#FFD600]" />
                REST Playground & Visual Map
              </span>

              <div className="flex bg-[#0A0E1A] rounded-lg p-0.5">
                <button
                  onClick={() => setActiveTesterTab('playground')}
                  className={`px-3 py-1 text-xs rounded transition ${activeTesterTab === 'playground' ? 'bg-[#FFD600] text-slate-100 font-bold' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  API Sandbox
                </button>
                <button
                  onClick={() => setActiveTesterTab('sql')}
                  className={`px-3 py-1 text-xs rounded transition ${activeTesterTab === 'sql' ? 'bg-[#FFD600] text-slate-100 font-bold' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  Raw SQL
                </button>
                <button
                  onClick={() => setActiveTesterTab('microservices')}
                  className={`px-3 py-1 text-xs rounded transition ${activeTesterTab === 'microservices' ? 'bg-[#FFD600] text-slate-100 font-bold' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  Microservices
                </button>
              </div>
            </div>

            {/* TAB CONTENT A: API PLAYGROUND SANDBOX */}
            {activeTesterTab === 'playground' && (
              <div className="p-5 space-y-4">
                
                <div>
                  <label className="block text-[10px] uppercase text-slate-400 font-bold font-mono tracking-wider mb-1.5">
                    Select Target Operational REST Endpoint (v1 namespace):
                  </label>
                  <select
                    value={selectedEndpoint}
                    onChange={(e) => {
                      setSelectedEndpoint(e.target.value);
                      setApiResponse(null);
                    }}
                    className="w-full bg-[#05080F] border border-white/10 text-xs text-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-1 focus:ring-[#FFD600]/40 font-mono"
                    id="endpoint-selector"
                  >
                    <option value="classify">POST /api/v1/ai/classify-incident (Smart AI Classification)</option>
                    <option value="create_incident">POST /api/v1/incidents (Register Threat Ticket + Dispatch Alarms)</option>
                    <option value="register">POST /api/v1/auth/register (Create New Investigator/Analyst user)</option>
                    <option value="login">POST /api/v1/auth/login (Verify User Session Logins)</option>
                    <option value="assign">POST /api/v1/incidents/:id/assign (Coordinate Assign Incident)</option>
                    <option value="evidence">POST /api/v1/incidents/:id/evidence (Upload Attachment Evidence)</option>
                    <option value="send_alert">POST /api/v1/alerts/send (Trigger Outbound SMS/Email Notification)</option>
                    <option value="add_intel">POST /api/v1/threat-intel (Register Global Threat IOC Indicator)</option>
                    <option value="get_incidents">GET /api/v1/incidents (Retrieve All National Logs)</option>
                  </select>
                </div>

                {/* DYNAMIC FORM INNER FIELDS DEPENDING ON SELECTED ENDPOINT */}
                <div className="bg-[#05080F]/80 border border-slate-850 rounded-xl p-4 space-y-3 font-sans text-xs">
                  
                  {/* ENDPOINT PARAM CLUES */}
                  <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
                    <span className="font-mono text-[10px] font-bold text-teal-400">ENDPOINT PARAMS SCHEMA</span>
                    <span className="text-[10px] text-slate-400 font-mono bg-[#0A0E1A] px-2 py-0.5 rounded">REST API</span>
                  </div>

                  {selectedEndpoint === "register" && (
                    <div className="space-y-2.5">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[9px] uppercase font-bold text-slate-500 mb-0.5">Full Name</label>
                          <input type="text" value={regName} onChange={(e) => setRegName(e.target.value)} className="w-full bg-[#0A0E1A] border border-white/10 p-1.5 rounded text-slate-200" />
                        </div>
                        <div>
                          <label className="block text-[9px] uppercase font-bold text-slate-500 mb-0.5">Email Address</label>
                          <input type="email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} className="w-full bg-[#0A0E1A] border border-white/10 p-1.5 rounded text-slate-200" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[9px] uppercase font-bold text-slate-500 mb-0.5">Contact Number</label>
                          <input type="text" value={regPhone} onChange={(e) => setRegPhone(e.target.value)} className="w-full bg-[#0A0E1A] border border-white/10 p-1.5 rounded text-slate-200" />
                        </div>
                        <div>
                          <label className="block text-[9px] uppercase font-bold text-slate-500 mb-0.5">Access Role</label>
                          <select value={regRole} onChange={(e) => setRegRole(e.target.value)} className="w-full bg-[#0A0E1A] border border-white/10 p-1.5 rounded text-slate-300">
                            <option value="analyst">analyst</option>
                            <option value="investigator">investigator</option>
                            <option value="admin">admin</option>
                            <option value="org_user">org_user</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-[9px] uppercase font-bold text-slate-500 mb-0.5">Organization Affiliation</label>
                        <select value={regOrgId} onChange={(e) => setRegOrgId(e.target.value)} className="w-full bg-[#0A0E1A] border border-white/10 p-1.5 rounded text-slate-300">
                          {organizations.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}
                        </select>
                      </div>
                    </div>
                  )}

                  {selectedEndpoint === "login" && (
                    <div className="space-y-2.5">
                      <div>
                        <label className="block text-[9px] uppercase font-bold text-slate-500 mb-0.5">Airing Email Credential</label>
                        <select value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} className="w-full bg-[#0A0E1A] border border-white/10 p-1.5 rounded text-slate-300 font-mono">
                          {users.map(u => <option key={u.id} value={u.email}>{u.email} ({u.full_name})</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[9px] uppercase font-bold text-slate-500 mb-0.5">Mock Security Password</label>
                        <input type="password" disabled value="••••••••••••••" className="w-full bg-[#0A0E1A]/50 border border-slate-850 p-1.5 rounded text-slate-500 cursor-not-allowed font-mono" />
                      </div>
                    </div>
                  )}

                  {selectedEndpoint === "create_incident" && (
                    <div className="space-y-2.5">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[9px] uppercase font-bold text-slate-500 mb-0.5">Title Area</label>
                          <input type="text" value={incTitle} onChange={(e) => setIncTitle(e.target.value)} className="w-full bg-[#0A0E1A] border border-white/10 p-1.5 rounded text-slate-200" />
                        </div>
                        <div>
                          <label className="block text-[9px] uppercase font-bold text-slate-500 mb-0.5">Region/Location</label>
                          <input type="text" value={incLocation} onChange={(e) => setIncLocation(e.target.value)} className="w-full bg-[#0A0E1A] border border-white/10 p-1.5 rounded text-slate-200" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[9px] uppercase font-bold text-slate-500 mb-0.5">Incident Attack Category</label>
                          <select value={incType} onChange={(e) => setIncType(e.target.value)} className="w-full bg-[#0A0E1A] border border-white/10 p-1.5 rounded text-slate-300">
                            <option value="sim_swap">SIM Swap Fraud</option>
                            <option value="phishing">Spear Phishing LINK</option>
                            <option value="malware">Ransomware/Malware</option>
                            <option value="intrusion">Brute Force Access</option>
                            <option value="other">Other System Anomaly</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[9px] uppercase font-bold text-slate-500 mb-0.5">Severity Threat Rating</label>
                          <select value={incSeverity} onChange={(e) => setIncSeverity(e.target.value)} className="w-full bg-[#0A0E1A] border border-white/10 p-1.5 rounded text-slate-300">
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                            <option value="critical">Critical</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-[9px] uppercase font-bold text-slate-500 mb-0.5">Detailed Anomaly Description</label>
                        <textarea value={incDesc} onChange={(e) => setIncDesc(e.target.value)} rows={2} className="w-full bg-[#0A0E1A] border border-white/10 p-1.5 rounded text-slate-200 font-sans leading-relaxed" />
                      </div>
                    </div>
                  )}

                  {selectedEndpoint === "classify" && (
                    <div className="space-y-2.5">
                      <div>
                        <label className="block text-[9px] uppercase font-bold text-slate-500 mb-0.5">Incident Title Context</label>
                        <input type="text" value={aiClassifyTitle} onChange={(e) => setAiClassifyTitle(e.target.value)} className="w-full bg-[#0A0E1A] border border-white/10 p-1.5 rounded text-slate-200" />
                      </div>
                      <div>
                        <label className="block text-[9px] uppercase font-bold text-slate-500 mb-0.5">Provide Raw Text Description for real-time Gemini Parsing</label>
                        <textarea value={aiClassifyDesc} onChange={(e) => setAiClassifyDesc(e.target.value)} rows={3} className="w-full bg-[#0A0E1A] border border-white/10 p-1.5 rounded text-slate-200 font-sans leading-relaxed" />
                      </div>
                    </div>
                  )}

                  {selectedEndpoint === "assign" && (
                    <div className="space-y-2.5">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[9px] uppercase font-bold text-slate-500 mb-0.5">Select Relational Incident</label>
                          <select value={assignIncidentId} onChange={(e) => setAssignIncidentId(e.target.value)} className="w-full bg-[#0A0E1A] border border-white/10 p-1.5 rounded text-slate-300 font-mono text-[10px]">
                            {incidents.map(inc => <option key={inc.id} value={inc.id}>{inc.id} • {inc.title.substring(0,25)}...</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[9px] uppercase font-bold text-slate-500 mb-0.5">Select Relational User (Investigator)</label>
                          <select value={assignUserId} onChange={(e) => setAssignUserId(e.target.value)} className="w-full bg-[#0A0E1A] border border-white/10 p-1.5 rounded text-slate-300 font-mono text-[10px]">
                            {users.map(u => <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>)}
                          </select>
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedEndpoint === "evidence" && (
                    <div className="space-y-2.5">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[9px] uppercase font-bold text-slate-500 mb-0.5">Parent Incident Node</label>
                          <select value={evidenceIncidentId} onChange={(e) => setEvidenceIncidentId(e.target.value)} className="w-full bg-[#0A0E1A] border border-white/10 p-1.5 rounded text-slate-300 font-mono text-[10px]">
                            {incidents.map(inc => <option key={inc.id} value={inc.id}>{inc.id} • {inc.title.substring(0,23)}...</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[9px] uppercase font-bold text-slate-500 mb-0.5">Attachment File type</label>
                          <select value={evidenceFileType} onChange={(e) => setEvidenceFileType(e.target.value)} className="w-full bg-[#0A0E1A] border border-white/10 p-1.5 rounded text-slate-300">
                            <option value="image/png">image/png (Captured ID scan)</option>
                            <option value="text/plain">text/plain (Email Header Log)</option>
                            <option value="application/json">application/json (API Payload Dump)</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedEndpoint === "send_alert" && (
                    <div className="space-y-2.5">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[9px] uppercase font-bold text-slate-500 mb-0.5">Related Security case</label>
                          <select value={alertIncidentId} onChange={(e) => setAlertIncidentId(e.target.value)} className="w-full bg-[#0A0E1A] border border-white/10 p-1.5 rounded text-slate-300 font-mono text-[10px]">
                            {incidents.map(inc => <option key={inc.id} value={inc.id}>{inc.id} • {inc.title.substring(0,25)}...</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[9px] uppercase font-bold text-slate-500 mb-0.5">Alert Channel</label>
                          <select value={alertChannel} onChange={(e) => setAlertChannel(e.target.value)} className="w-full bg-[#0A0E1A] border border-white/10 p-1.5 rounded text-slate-300">
                            <option value="sms">SMS Network Outlink</option>
                            <option value="email">Institutional Mail</option>
                            <option value="api">Automated NOC Call API</option>
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[9px] uppercase font-bold text-slate-500 mb-0.5">Recipient Target Address</label>
                          <input type="text" value={alertSentTo} onChange={(e) => setAlertSentTo(e.target.value)} className="w-full bg-[#0A0E1A] border border-white/10 p-1.5 rounded text-slate-200 font-mono" />
                        </div>
                        <div>
                          <label className="block text-[9px] uppercase font-bold text-slate-500 mb-0.5">Alert Broadcast Content</label>
                          <input type="text" value={alertMessage} onChange={(e) => setAlertMessage(e.target.value)} className="w-full bg-[#0A0E1A] border border-white/10 p-1.5 rounded text-slate-200" />
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedEndpoint === "add_intel" && (
                    <div className="space-y-2.5">
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[9px] uppercase font-bold text-slate-500 mb-0.5">IOC Indicator Type</label>
                          <select value={intelType} onChange={(e) => setIntelType(e.target.value)} className="w-full bg-[#0A0E1A] border border-white/10 p-1.5 rounded text-slate-300">
                            <option value="phone">Phone Number</option>
                            <option value="ip">IP Address</option>
                            <option value="domain">Spoofed Domain URL</option>
                            <option value="device_id">Device Signature IMEI</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[9px] uppercase font-bold text-slate-500 mb-0.5">Threat Warning lvl</label>
                          <select value={intelLevel} onChange={(e) => setIntelLevel(e.target.value)} className="w-full bg-[#0A0E1A] border border-white/10 p-1.5 rounded text-slate-300">
                            <option value="low">low</option>
                            <option value="medium">medium</option>
                            <option value="high">high</option>
                            <option value="critical">critical</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[9px] uppercase font-bold text-slate-500 mb-0.5">Originating Incident</label>
                          <select value={intelIncId} onChange={(e) => setIntelIncId(e.target.value)} className="w-full bg-[#0A0E1A] border border-white/10 p-1.5 rounded text-slate-300 font-mono text-[10px]">
                            {incidents.map(inc => <option key={inc.id} value={inc.id}>{inc.id}</option>)}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-[9px] uppercase font-bold text-slate-500 mb-0.5">Indicator Block Value State</label>
                        <input type="text" value={intelValue} onChange={(e) => setIntelValue(e.target.value)} className="w-full bg-[#0A0E1A] border border-white/10 p-1.5 rounded text-slate-200 font-mono" />
                      </div>
                    </div>
                  )}

                  {selectedEndpoint === "get_incidents" && (
                    <p className="text-[11px] text-slate-400 font-sans italic p-2 bg-[#0A0E1A]/40 rounded border border-white/[0.06]">
                      Query matches: status, severity, and type parameters natively supported. No body block required.
                    </p>
                  )}

                </div>

                <div className="flex gap-2.5">
                  <button
                    onClick={() => handleTestApi(selectedEndpoint)}
                    disabled={apiIsLoading}
                    className="flex-1 py-2.5 bg-gradient-to-r from-teal-500 to-[#EAB308] hover:from-teal-400 hover:to-[#FFD600] font-bold font-mono text-xs text-slate-100 rounded-xl flex items-center justify-center gap-2 transition cursor-pointer shadow-md shadow-[#030f09]/20"
                    id="submit-api-sandbox-btn"
                  >
                    <Send className="w-4 h-4 text-[#FFFDE7]" />
                    <span>{apiIsLoading ? "Processing secure API request..." : "Disptach REST Payload"}</span>
                  </button>
                  
                  {apiResponse && (
                    <button
                      onClick={() => setApiResponse(null)}
                      className="px-3.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-slate-100 rounded-xl text-xs transition"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {/* API TERMINAL RESPONSE */}
                {apiResponse && (
                  <div className="bg-[#05080F] border border-slate-850 p-4 rounded-xl font-mono text-[11px] space-y-2 animate-fade-in relative">
                    <div className="flex items-center justify-between border-b border-white/[0.06] pb-1.5">
                      <span className="text-slate-400">REST AGENT CLIENT RESPONSE TERMINAL</span>
                      <span className={`px-2 py-0.5 font-bold rounded ${apiResponse.error ? 'bg-rose-500/10 text-rose-400' : 'bg-[#FFD600]/10 text-[#FFD600]'}`}>
                        {apiResponse.error ? "CLIENT_ERROR" : `HTTP ${apiResponse.status_code || 201} OK`}
                      </span>
                    </div>
                    <pre className="max-h-[220px] overflow-auto text-slate-300 leading-relaxed bg-[#05080F]/40 p-2 border border-white/[0.06]/60 rounded">
                      {JSON.stringify(apiResponse.payload || apiResponse, null, 2)}
                    </pre>
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-sans">
                      <Info className="w-3.5 h-3.5 text-[#FFD600]" />
                      <span>The memory database has synchronised immediately. Inspect the updated table row in the Database panel.</span>
                    </div>
                  </div>
                )}

              </div>
            )}

            {/* TAB CONTENT B: RAW SQL SCHEMATICS VIEWER */}
            {activeTesterTab === 'sql' && (
              <div className="p-5 space-y-4 animate-fade-in">
                <div>
                  <div className="bg-[#030f09]/5 border border-[#052010]/25 p-3.5 rounded-xl text-xs flex items-start gap-2 mb-3">
                    <Info className="w-5 h-5 text-[#FFD600] mt-0.5 shrink-0" />
                    <p className="text-slate-400 font-sans leading-relaxed">
                      LITSECURE SENTINEL uses a strict **PostgreSQL Relational layout** in corporate audits. The core tables are modeled under strict key indexes below:
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-1.5 mb-2 overflow-x-auto pb-1">
                    {Object.keys(sqlSchemas).map(sk => (
                      <button
                        key={sk}
                        onClick={() => setActiveTable(sk as any)}
                        className={`px-2.5 py-1 text-[11px] font-mono rounded font-medium border capitalize shrink-0 transition ${activeTable === sk ? 'bg-slate-800 text-[#FFD600] border-slate-700' : 'bg-[#05080F] text-slate-500 border-white/[0.06] hover:text-slate-300'}`}
                        id={`tab-schema-${sk}`}
                      >
                        {sk.replace("_", " ")}
                      </button>
                    ))}
                  </div>

                  <div className="bg-[#05080F]/90 border border-white/[0.06] rounded-xl relative font-mono text-[10.5px]">
                    <span className="absolute top-2.5 right-3 text-[9px] text-slate-600 font-mono select-none">POSTGRESQL AUDIT</span>
                    <pre className="p-4 overflow-x-auto text-[#FFD600]/90 leading-relaxed font-semibold">
                      {sqlSchemas[activeTable]}
                    </pre>
                  </div>
                </div>
              </div>
            )}

            {/* TAB CONTENT C: MICROSERVICES CHART DIAGRAM */}
            {activeTesterTab === 'microservices' && (
              <div className="p-5 space-y-4 animate-fade-in text-xs font-sans">
                <div>
                  <h3 className="font-bold text-slate-200">National Cyber Security Microservices Pipeline</h3>
                  <p className="text-slate-400 mt-0.5 leading-normal">
                    Visual telemetry mapping showing how an incident flows asynchronously through autonomous microservice node networks in real-time.
                  </p>
                </div>

                {/* VISUAL DIAGRAM CANVAS */}
                <div className="bg-[#05080F] p-5 rounded-2xl border border-white/[0.06] flex flex-col gap-5 items-center relative select-none">
                  
                  {/* SCANLINE */}
                  <div className="absolute inset-0 bg-linear-to-b from-transparent via-[#FFD600]/5 to-transparent bg-[size:100%_4px] pointer-events-none opacity-40 rounded-2xl" />

                  {/* STEP 1 */}
                  <div className="flex items-center gap-3 w-full max-w-sm bg-[#0A0E1A] border border-white/10 rounded-xl p-3 shadow-md">
                    <div className="w-7 h-7 rounded-lg bg-teal-500/10 border border-teal-500/30 text-teal-400 font-mono font-bold flex items-center justify-center text-[10px]">01</div>
                    <div className="flex-1">
                      <p className="text-slate-200 font-bold font-mono text-[10px] uppercase leading-none">Incident Ingress Worker</p>
                      <p className="text-[9px] text-slate-500 mt-1">Accepts logs over SSL / WebSocket / REST Port</p>
                    </div>
                    <span className="bg-[#FFD600]/15 border border-[#FFD600]/30 text-[#FFD600] text-[9px] font-mono px-1.5 py-0.5 rounded font-semibold">Active</span>
                  </div>

                  {/* CONNECT LINE */}
                  <div className="w-0.5 h-4 bg-linear-to-b from-teal-500 to-blue-500 animate-pulse relative">
                    <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-[#FFD600]" />
                  </div>

                  {/* STEP 2 */}
                  <div className="flex items-center gap-3 w-full max-w-sm bg-[#0A0E1A] border border-white/10 rounded-xl p-3 shadow-md">
                    <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 font-mono font-bold flex items-center justify-center text-[10px]">02</div>
                    <div className="flex-1">
                      <p className="text-slate-200 font-bold font-mono text-[10px] uppercase leading-none">AI Threat Engine Service</p>
                      <p className="text-[9px] text-slate-500 mt-1">Queries text inside Gemini API for threat classification</p>
                    </div>
                    <span className="bg-[#FFD600]/15 border border-[#FFD600]/30 text-[#FFD600] text-[9px] font-mono px-1.5 py-0.5 rounded font-semibold">Active</span>
                  </div>

                  {/* CONNECT LINE */}
                  <div className="w-0.5 h-4 bg-linear-to-b from-blue-500 to-purple-500 animate-pulse relative">
                    <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-[#FFD600]" />
                  </div>

                  {/* STEP 3 */}
                  <div className="flex items-center gap-3 w-full max-w-sm bg-[#0A0E1A] border border-white/10 rounded-xl p-3 shadow-md">
                    <div className="w-7 h-7 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-400 font-mono font-bold flex items-center justify-center text-[10px]">03</div>
                    <div className="flex-1">
                      <p className="text-slate-200 font-bold font-mono text-[10px] uppercase leading-none">Threat DB Sync Router</p>
                      <p className="text-[9px] text-slate-500 mt-1">Relational PostgreSQL schema tables updates</p>
                    </div>
                    <span className="bg-[#FFD600]/15 border border-[#FFD600]/30 text-[#FFD600] text-[9px] font-mono px-1.5 py-0.5 rounded font-semibold">Ready</span>
                  </div>

                  {/* CONNECT LINE */}
                  <div className="w-0.5 h-4 bg-linear-to-b from-purple-500 to-rose-500 animate-pulse relative">
                    <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-[#FFD600]" />
                  </div>

                  {/* STEP 4 */}
                  <div className="flex items-center gap-3 w-full max-w-sm bg-[#0A0E1A] border border-white/10 rounded-xl p-3 shadow-md">
                    <div className="w-7 h-7 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 font-mono font-bold flex items-center justify-center text-[10px]">04</div>
                    <div className="flex-1">
                      <p className="text-slate-200 font-bold font-mono text-[10px] uppercase leading-none">Urgent Alert Dispatcher</p>
                      <p className="text-[9px] text-slate-500 mt-1">Broadcasts SMS notifications and Email gateway alarms</p>
                    </div>
                    <span className="bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[9px] font-mono px-1.5 py-0.5 rounded font-semibold">Idle</span>
                  </div>

                </div>

                <div className="bg-[#05080F] p-3 rounded-lg border border-white/[0.06] font-mono text-[10px] text-slate-500 text-center">
                  SYS CORE Handshake Rate: 1.02ms latency • TLS 1.3 Certified
                </div>

              </div>
            )}

          </div>

        </div>

        {/* RIGHT COLUMN: DATABASE ENGINE ROWS EXPLORER (6 COLS) */}
        <div className="xl:col-span-6 space-y-4">
          
          <div className="bg-[#0A0E1A] border border-white/10 rounded-2xl overflow-hidden shadow-xl">
            
            {/* Table selects header */}
            <div className="bg-[#05080F] px-4 py-3 border-b border-white/[0.06]">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-bold text-slate-100 uppercase tracking-widest font-mono flex items-center gap-1.5">
                    <Database className="w-4 h-4 text-[#FFD600]" />
                    LIVE Database Tables Row Viewer
                  </h3>
                  <p className="text-[10px] text-slate-500 font-sans mt-0.5">Click a tab below to inspect live PostgreSQL model state</p>
                </div>
                <div className="text-[10px] text-[#FFD600] font-mono font-bold flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5" />
                  <span>TOTAL TABLES: 8</span>
                </div>
              </div>

              {/* Grid of the 8 tables */}
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5 mt-3">
                {(['users', 'organizations', 'incidents', 'evidence', 'assignments', 'alerts', 'threat_intel', 'audit_logs'] as const).map(tab => {
                  let count = 0;
                  if (tab === 'users') count = users.length;
                  else if (tab === 'organizations') count = organizations.length;
                  else if (tab === 'incidents') count = incidents.length;
                  else if (tab === 'evidence') count = evidence.length;
                  else if (tab === 'assignments') count = assignments.length;
                  else if (tab === 'alerts') count = alerts.length;
                  else if (tab === 'threat_intel') count = threatIntel.length;
                  else if (tab === 'audit_logs') count = auditLogs.length;

                  return (
                    <button
                      key={tab}
                      onClick={() => setActiveTable(tab)}
                      className={`py-1 rounded text-[9.5px] font-mono leading-none flex flex-col items-center justify-center transition border ${activeTable === tab ? 'bg-[#FFD600]/10 text-[#FFD600] border-[#FFD600]/40 font-bold' : 'bg-[#0A0E1A] hover:bg-slate-850 text-slate-400 border-white/10'}`}
                      id={`tab-btn-${tab}`}
                    >
                      <span className="capitalize">{tab === 'threat_intel' ? 'IOC' : tab === 'audit_logs' ? 'Audits' : tab}</span>
                      <span className="text-[8.5px] text-slate-500 mt-1">({count})</span>
                    </button>
                  );
                })}
              </div>

            </div>

            {/* TAB CONTENT: ACTIVE SPEC ROWS TABLE */}
            <div className="p-4 select-text">
              {loading ? (
                <div className="p-12 text-center text-slate-500">
                  <RefreshCw className="w-7 h-7 animate-spin mx-auto text-[#FFD600] mb-2" />
                  <p className="text-xs font-mono">Querying relational table rows...</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  
                  {/* 1. USERS TABLE */}
                  {activeTable === 'users' && (
                    <table className="w-full text-left font-mono text-[10.5px] text-slate-300 border-collapse">
                      <thead>
                        <tr className="border-b border-white/10 text-[9.5px] uppercase text-slate-500 font-bold">
                          <th className="py-2.5 px-2">ID</th>
                          <th className="py-2.5 px-2">Full Name</th>
                          <th className="py-2.5 px-2">Email</th>
                          <th className="py-2.5 px-2">Role</th>
                          <th className="py-2.5 px-2">Org</th>
                          <th className="py-2.5 px-2 text-right">State</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map(u => {
                          const org = organizations.find(o => o.id === u.organization_id);
                          return (
                            <tr key={u.id} className="border-b border-white/[0.06] hover:bg-[#05080F]/40">
                              <td className="py-2 px-2 text-amber-500 font-bold">{u.id}</td>
                              <td className="py-2 px-2 font-sans font-semibold text-slate-100">{u.full_name}</td>
                              <td className="py-2 px-2 text-slate-400">{u.email}</td>
                              <td className="py-2 px-2">
                                <span className="px-1.5 py-0.5 rounded text-[8.5px] font-bold bg-[#05080F] font-mono text-teal-400 border border-white/10 uppercase">{u.role}</span>
                              </td>
                              <td className="py-2 px-2 text-slate-400 text-[10px]">{org ? org.name.split(" ")[0] : "MACERT"}</td>
                              <td className="py-2 px-2 text-right text-[#FFD600] font-bold">Online</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}

                  {/* 2. ORGANIZATIONS TABLE */}
                  {activeTable === 'organizations' && (
                    <table className="w-full text-left font-mono text-[10.5px] text-slate-300 border-collapse">
                      <thead>
                        <tr className="border-b border-white/10 text-[9.5px] uppercase text-slate-500 font-bold font-mono">
                          <th className="py-2.5 px-2">ID</th>
                          <th className="py-2.5 px-2">Organization</th>
                          <th className="py-2.5 px-2">Cluster</th>
                          <th className="py-2.5 px-2">Contact</th>
                          <th className="py-2.5 px-2 text-right">API Key</th>
                        </tr>
                      </thead>
                      <tbody>
                        {organizations.map(org => (
                          <tr key={org.id} className="border-b border-white/[0.06] hover:bg-[#05080F]/40">
                            <td className="py-2 px-2 text-amber-500 font-bold">{org.id}</td>
                            <td className="py-2 px-2 font-sans font-semibold text-slate-100">{org.name}</td>
                            <td className="py-2 px-2">
                              <span className="px-1.5 py-0.5 bg-[#05080F] border border-white/10 text-[8.5px] rounded font-bold uppercase text-blue-400">{org.type}</span>
                            </td>
                            <td className="py-2 px-2 text-slate-400">{org.contact_email}</td>
                            <td className="py-2 px-2 text-right text-slate-500 text-[9px]">{org.api_key.substring(0,10)}...</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  {/* 3. INCIDENTS TABLE */}
                  {activeTable === 'incidents' && (
                    <table className="w-full text-left font-mono text-[10.5px] text-slate-300 border-collapse">
                      <thead>
                        <tr className="border-b border-white/10 text-[9.5px] uppercase text-slate-500 font-bold">
                          <th className="py-2.5 px-2">ID</th>
                          <th className="py-2.5 px-2">Inc Title</th>
                          <th className="py-2.5 px-2">Type</th>
                          <th className="py-2.5 px-2">Severity</th>
                          <th className="py-2.5 px-2 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {incidents.map(inc => (
                          <tr key={inc.id} className="border-b border-white/[0.06] hover:bg-[#05080F]/40">
                            <td className="py-2 px-2 text-amber-500 font-bold">{inc.id}</td>
                            <td className="py-2 px-2 font-sans font-semibold text-slate-100">
                              <p className="line-clamp-1">{inc.title}</p>
                              <p className="text-[9px] text-slate-500 font-mono mt-0.5">{inc.location} • Conf: {Math.floor(inc.ai_confidence_score * 100)}%</p>
                            </td>
                            <td className="py-2 px-2">
                              <span className="text-[8.5px] bg-[#05080F] text-[#FFD600] border border-white/10 px-1.5 py-0.5 font-bold uppercase rounded">{inc.incident_type}</span>
                            </td>
                            <td className="py-2 px-2">
                              <span className={`px-1.5 py-0.5 rounded text-[8.5px] font-bold uppercase ${inc.severity === 'critical' || inc.severity === 'high' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'bg-[#05080F] text-slate-400'}`}>
                                {inc.severity}
                              </span>
                            </td>
                            <td className="py-2 px-2 text-right">
                              <span className={`px-1.5 py-0.5 font-sans rounded-full text-[8.5px] font-bold ${inc.status === 'resolved' ? 'bg-[#FFD600]/15 text-[#FFD600]' : 'bg-amber-600/15 text-amber-400'}`}>
                                {inc.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  {/* 4. INCIDENT_EVIDENCE TABLE */}
                  {activeTable === 'evidence' && (
                    <table className="w-full text-left font-mono text-[10.5px] text-slate-300 border-collapse">
                      <thead>
                        <tr className="border-b border-white/10 text-[9.5px] uppercase text-slate-500 font-bold font-mono">
                          <th className="py-2.5 px-2">ID</th>
                          <th className="py-2.5 px-2">Incident Reference ID</th>
                          <th className="py-2.5 px-2">Attachment URL</th>
                          <th className="py-2.5 px-2 text-right">MIME File Type</th>
                        </tr>
                      </thead>
                      <tbody>
                        {evidence.length === 0 ? (
                          <tr><td colSpan={4} className="py-6 text-center text-slate-500 italic">No attachments registered in physical evidence vaults.</td></tr>
                        ) : (
                          evidence.map(ev => (
                            <tr key={ev.id} className="border-b border-white/[0.06] hover:bg-[#05080F]/40">
                              <td className="py-2 px-2 text-amber-500 font-bold">{ev.id}</td>
                              <td className="py-2 px-2 text-slate-300 font-semibold">{ev.incident_id}</td>
                              <td className="py-2 px-2 text-slate-400 truncate max-w-xs">{ev.file_url}</td>
                              <td className="py-2 px-2 text-right">
                                <span className="px-1.5 py-0.5 bg-[#05080F] text-slate-400 border border-slate-850 rounded text-[9px] font-bold">{ev.file_type}</span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  )}

                  {/* 5. INCIDENT_ASSIGNMENTS TABLE */}
                  {activeTable === 'assignments' && (
                    <table className="w-full text-left font-mono text-[10.5px] text-slate-300 border-collapse">
                      <thead>
                        <tr className="border-b border-white/10 text-[9.5px] uppercase text-slate-500 font-bold font-mono">
                          <th className="py-2.5 px-2">ID</th>
                          <th className="py-2.5 px-2">Incident ID</th>
                          <th className="py-2.5 px-2">Assigned Investigator UUID</th>
                          <th className="py-2.5 px-2">Timestamp Date</th>
                          <th className="py-2.5 px-2 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {assignments.map(asg => {
                          const user = users.find(u => u.id === asg.assigned_to);
                          return (
                            <tr key={asg.id} className="border-b border-white/[0.06] hover:bg-[#05080F]/40">
                              <td className="py-2 px-2 text-amber-500 font-bold">{asg.id}</td>
                              <td className="py-2 px-2 text-slate-300">{asg.incident_id}</td>
                              <td className="py-2 px-2 text-teal-400 font-semibold">{user ? user.full_name : asg.assigned_to}</td>
                              <td className="py-2 px-2 text-slate-500 text-[9px]">{new Date(asg.assigned_at).toLocaleDateString()}</td>
                              <td className="py-2 px-2 text-right">
                                <span className={`px-1.5 py-0.5 text-[8.5px] font-bold rounded uppercase ${asg.status === 'active' ? 'bg-[#FFD600]/10 text-[#FFD600] border border-[#FFD600]/20' : 'bg-[#05080F] text-slate-500'}`}>
                                  {asg.status}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}

                  {/* 6. ALERTS TABLE */}
                  {activeTable === 'alerts' && (
                    <table className="w-full text-left font-mono text-[10.5px] text-slate-300 border-collapse">
                      <thead>
                        <tr className="border-b border-white/10 text-[9.5px] uppercase text-slate-500 font-bold">
                          <th className="py-2.5 px-2">ID</th>
                          <th className="py-2.5 px-2">Incident ID</th>
                          <th className="py-2.5 px-2">Alert Broadcast Target</th>
                          <th className="py-2.5 px-2">Gateway Channel</th>
                          <th className="py-2.5 px-2 text-right font-mono">Sent At</th>
                        </tr>
                      </thead>
                      <tbody>
                        {alerts.map(al => (
                          <tr key={al.id} className="border-b border-white/[0.06] hover:bg-[#05080F]/40">
                            <td className="py-2 px-2 text-amber-500 font-bold">{al.id}</td>
                            <td className="py-2 px-2 text-slate-400">{al.incident_id}</td>
                            <td className="py-2 px-2 text-slate-200 font-semibold truncate max-w-xs" title={al.message}>{al.sent_to}</td>
                            <td className="py-2 px-2">
                              <span className="px-1.5 py-0.5 bg-[#05080F] text-rose-400 border border-white/10 rounded uppercase font-bold text-[8.5px] tracking-wider">{al.channel}</span>
                            </td>
                            <td className="py-2 px-2 text-right text-slate-500 text-[9px]">{new Date(al.sent_at).toLocaleTimeString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  {/* 7. threat_intel TABLE */}
                  {activeTable === 'threat_intel' && (
                    <table className="w-full text-left font-mono text-[10.5px] text-slate-300 border-collapse">
                      <thead>
                        <tr className="border-b border-white/10 text-[9.5px] uppercase text-slate-500 font-bold font-mono">
                          <th className="py-2.5 px-2">ID</th>
                          <th className="py-2.5 px-2">Indicator Type</th>
                          <th className="py-2.5 px-2">Indicator Code Value</th>
                          <th className="py-2.5 px-2">Severity Risk</th>
                          <th className="py-2.5 px-2 text-right">Source incident</th>
                        </tr>
                      </thead>
                      <tbody>
                        {threatIntel.map(intel => (
                          <tr key={intel.id} className="border-b border-white/[0.06] hover:bg-[#05080F]/40">
                            <td className="py-2 px-2 text-amber-500 font-bold">{intel.id}</td>
                            <td className="py-2 px-2">
                              <span className="px-1.5 py-0.5 bg-[#05080F] border border-white/10 rounded font-bold text-[8.5px] uppercase text-teal-400">{intel.indicator_type}</span>
                            </td>
                            <td className="py-2 px-2 text-slate-100 font-extrabold">{intel.indicator_value}</td>
                            <td className="py-2 px-2">
                              <span className={`px-1.5 py-0.5 rounded text-[8.5px] font-bold uppercase ${intel.threat_level === 'critical' || intel.threat_level === 'high' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'bg-[#05080F] text-slate-400'}`}>
                                {intel.threat_level}
                              </span>
                            </td>
                            <td className="py-2 px-2 text-right text-slate-500">{intel.source_incident_id || "N/A (Global Block)"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  {/* 8. AUDIT LOGS TABLE */}
                  {activeTable === 'audit_logs' && (
                    <table className="w-full text-left font-mono text-[10.5px] text-slate-300 border-collapse">
                      <thead>
                        <tr className="border-b border-white/10 text-[9.5px] uppercase text-slate-500 font-bold">
                          <th className="py-2.5 px-2">ID</th>
                          <th className="py-2.5 px-2">Investigator ID</th>
                          <th className="py-2.5 px-2">Trigger Action</th>
                          <th className="py-2.5 px-2">Entity Context</th>
                          <th className="py-2.5 px-2 text-right">Event Metadata</th>
                        </tr>
                      </thead>
                      <tbody>
                        {auditLogs.map(aud => {
                          const userObj = users.find(u => u.id === aud.user_id);
                          return (
                            <tr key={aud.id} className="border-b border-white/[0.06] hover:bg-[#05080F]/40">
                              <td className="py-2 px-2 text-amber-500 font-bold">{aud.id}</td>
                              <td className="py-2 px-2 text-teal-400 font-bold">{userObj ? userObj.full_name : aud.user_id}</td>
                              <td className="py-2 px-2 font-sans font-semibold text-slate-200">{aud.action}</td>
                              <td className="py-2 px-2">
                                <span className="px-1 py-0.5 bg-[#05080F] text-slate-400 text-[9px] rounded uppercase font-bold">{aud.entity_type}</span>
                              </td>
                              <td className="py-2 px-2 text-right text-slate-500 text-[9px] truncate max-w-[125px]">{JSON.stringify(aud.metadata || {})}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}

                </div>
              )}
            </div>

            {/* SQL Table Info Footer */}
            <div className="bg-[#05080F] p-4 border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs">
              <span className="text-slate-500 font-sans">
                Showing live row states mapping PostgreSQL schemas. Click "API Sandbox" to generate rows immediately.
              </span>
              <span className="text-[10px] bg-[#0A0E1A] border border-white/10 text-slate-400 font-mono px-3 py-1 rounded">
                Drizzle ORM Mapping Compliant
              </span>
            </div>

          </div>

        </div>

      </div>

    </div>
  );
}
