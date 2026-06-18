import React, { useState, useEffect, useRef } from "react";
import { 
  Camera as CameraIcon, Layout, ShieldAlert, CheckCircle, Video, Play, Power, 
  Settings, Radio, Activity, AlertTriangle, Key, PlusCircle, Bell, RefreshCw, 
  UserCheck, ShieldCheck, HelpCircle, HardDrive, Cpu, X, Compass, DollarSign, Layers
} from "lucide-react";
import { Site, Camera, SecurityEvent, AccessLog, BillingPlan } from "../types";

export default function CctvSurveillance() {
  // State lists
  const [sites, setSites] = useState<Site[]>([]);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [accessLogs, setAccessLogs] = useState<AccessLog[]>([]);
  const [plans, setPlans] = useState<BillingPlan[]>([]);

  // Selected view states
  const [selectedSiteId, setSelectedSiteId] = useState<string>("All");
  const [activeRightTab, setActiveRightTab] = useState<'alerts' | 'access' | 'billing'>('alerts');
  
  // UI Actions & Loading states
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [triggeringAnom, setTriggeringAnom] = useState<boolean>(false);

  // Registration Modal States
  const [showSiteModal, setShowSiteModal] = useState<boolean>(false);
  const [showCamModal, setShowCamModal] = useState<boolean>(false);

  // New Site Form
  const [newSiteName, setNewSiteName] = useState("");
  const [newSiteOrg, setNewSiteOrg] = useState("Standard Bank MW");
  const [newSiteSec, setNewSiteSec] = useState<'Standard' | 'Elevated' | 'Maximum'>("Elevated");
  const [newSiteAddr, setNewSiteAddr] = useState("");

  // New Camera Form
  const [newCamName, setNewCamName] = useState("");
  const [newCamSite, setNewCamSite] = useState("");
  const [newCamRtsp, setNewCamRtsp] = useState("");
  const [newCamModel, setNewCamModel] = useState("Sentinel-Thermal-T3");
  const [newCamFlags, setNewCamFlags] = useState<string[]>(["MOTION", "INTRUSION"]);

  // Snapshot visual preview
  const [snapshotCamId, setSnapshotCamId] = useState<string | null>(null);
  const [snapshotData, setSnapshotData] = useState<string | null>(null);

  // Fetch core data from backend APIs
  const fetchSurveillanceData = async () => {
    setRefreshing(true);
    try {
      const [sitesRes, camsRes, eventsRes, accessRes, plansRes] = await Promise.all([
        fetch("/api/sites"),
        fetch("/api/cameras"),
        fetch("/api/events"),
        fetch("/api/access/logs"),
        fetch("/api/billing/plans")
      ]);

      if (sitesRes.ok) setSites(await sitesRes.json());
      if (camsRes.ok) setCameras(await camsRes.json());
      if (eventsRes.ok) setEvents(await eventsRes.json());
      if (accessRes.ok) setAccessLogs(await accessRes.json());
      if (plansRes.ok) setPlans(await plansRes.json());
    } catch (err) {
      console.error("Error reading physical sentinel device network:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchSurveillanceData();
    // Poll the stream events & access swipes every 6 seconds
    const interval = setInterval(fetchSurveillanceData, 6000);
    return () => clearInterval(interval);
  }, []);

  // Set default form Site when sites load
  useEffect(() => {
    if (sites.length > 0 && !newCamSite) {
      setNewCamSite(sites[0].id);
    }
  }, [sites]);

  // Command Action: Trigger manual alert simulation from AI backplane
  const handleTriggerAIAnomaly = async () => {
    setTriggeringAnom(true);
    try {
      const response = await fetch("/api/events/trigger", { method: "POST" });
      if (response.ok) {
        const generatedEvent: SecurityEvent = await response.json();
        // pre-pend local state
        setEvents(prev => [generatedEvent, ...prev]);
        // Refetch all to sync locks and logs
        fetchSurveillanceData();
      }
    } catch (err) {
      console.error("Failed to trigger test alert:", err);
    } finally {
      setTriggeringAnom(false);
    }
  };

  // Command Action: Acknowledge alarm event
  const handleAcknowledgeEvent = async (id: string) => {
    try {
      const response = await fetch(`/api/events/${id}/acknowledge`, { method: "POST" });
      if (response.ok) {
        setEvents(prev => prev.map(ev => ev.id === id ? { ...ev, status: 'Acknowledged' } : ev));
      }
    } catch (err) {
      console.error("Failed acknowledging event:", err);
    }
  };

  // Command Action: Activate/set camera Online
  const handleActivateCam = async (id: string) => {
    try {
      const response = await fetch(`/api/cameras/${id}/activate`, { method: "POST" });
      if (response.ok) {
        setCameras(prev => prev.map(cam => cam.id === id ? { ...cam, status: 'Online' } : cam));
      }
    } catch (err) {
      console.error("Activation failed:", err);
    }
  };

  // Command Action: Deactivate/set camera Offline
  const handleDeactivateCam = async (id: string) => {
    try {
      const response = await fetch(`/api/cameras/${id}/deactivate`, { method: "POST" });
      if (response.ok) {
        setCameras(prev => prev.map(cam => cam.id === id ? { ...cam, status: 'Offline', isRecording: false } : cam));
      }
    } catch (err) {
      console.error("Deactivation failed:", err);
    }
  };

  // Command Action: Toggle CCTV Record on backend NVR
  const handleToggleRecord = async (id: string) => {
    try {
      const response = await fetch(`/api/cameras/${id}/record`, { method: "POST" });
      if (response.ok) {
        const updated = await response.json();
        setCameras(prev => prev.map(cam => cam.id === id ? { ...cam, isRecording: updated.isRecording } : cam));
      }
    } catch (err) {
      console.error("Record toggle failed:", err);
    }
  };

  // Submitting brand-new outpost site register
  const handleCreateSite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSiteName) return;

    try {
      const response = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newSiteName,
          orgId: newSiteOrg,
          securityLevel: newSiteSec,
          address: newSiteAddr
        })
      });

      if (response.ok) {
        const created = await response.json();
        setSites(prev => [...prev, created]);
        setShowSiteModal(false);
        setNewSiteName("");
        setNewSiteAddr("");
      }
    } catch (err) {
      console.error("Site creation failed:", err);
    }
  };

  // Submitting brand-new camera install register
  const handleCreateCamera = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCamName || !newCamRtsp || !newCamSite) return;

    try {
      const response = await fetch("/api/cameras/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newCamName,
          siteId: newCamSite,
          rtspUrl: newCamRtsp,
          model: newCamModel,
          aiDetectionFlags: newCamFlags
        })
      });

      if (response.ok) {
        const created = await response.json();
        setCameras(prev => [...prev, created]);
        setShowCamModal(false);
        setNewCamName("");
        setNewCamRtsp("");
      }
    } catch (err) {
      console.error("Camera creation failed:", err);
    }
  };

  // Simulate video snapshot capture
  const handleCaptureSnapshot = (cameraId: string) => {
    setSnapshotCamId(cameraId);
    
    // Generate simulated canvas imagery context based on time
    const timestamp = new Date().toLocaleTimeString();
    const mockFeedData = `--- SECURE SENTINELL BACKPLANE INGRESS SNAPSHOT ---\n` +
      `CAMERA NODE REF: ${cameraId}\n` +
      `MD5 CHECKSUM: ${Math.random().toString(36).substring(7).toUpperCase()}\n` +
      `CAPTURED AT: ${timestamp}\n` +
      `COMPROMISED ALARM CORRELATION: NO ACTIVE TAMPER OVERRIDE\n` +
      `GPS ENCRYPTION STATE: SIGNED BY MACERT MALAWI`;
    
    setSnapshotData(mockFeedData);
  };

  // Filter camera lists according to current selected Site
  const filteredCameras = selectedSiteId === "All" 
    ? cameras 
    : cameras.filter(cam => cam.siteId === selectedSiteId);

  // Helper colors
  const getSeverityColor = (sev: string) => {
    switch(sev) {
      case "Critical": return "text-rose-500 bg-rose-500/10 border-rose-500/20";
      case "High": return "text-orange-500 bg-orange-500/10 border-orange-500/20";
      case "Medium": return "text-amber-500 bg-amber-500/10 border-amber-500/20";
      default: return "text-[#FFD600] bg-[#FFD600]/10 border-[#FFD600]/20";
    }
  };

  // Count active cameras online
  const onlineCount = cameras.filter(c => c.status === "Online").length;
  const activeAlarms = events.filter(e => e.status === "Airing").length;

  return (
    <div className="space-y-6" id="surveillance-desk-root">
      
      {/* 1. TOP METRIC STRIP & CONTROLS */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        
        <div className="bg-[#0A0E1A] border border-white/10 rounded-xl p-4 flex items-center gap-3">
          <div className="p-3 bg-[#FFD600]/10 text-[#FFD600] border border-[#FFD600]/20 rounded-lg">
            <Layers className="w-5 h-5 text-[#FFD600]" />
          </div>
          <div>
            <span className="text-[10px] uppercase text-slate-500 block font-mono">Active Site Areas</span>
            <span className="text-xl font-bold text-slate-100">{sites.length} Nodes</span>
          </div>
        </div>

        <div className="bg-[#0A0E1A] border border-white/10 rounded-xl p-4 flex items-center gap-3">
          <div className="p-3 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg">
            <Radio className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <span className="text-[10px] uppercase text-slate-500 block font-mono">CCTV Stream Ratio</span>
            <span className="text-xl font-bold text-slate-100">{onlineCount} / {cameras.length} Online</span>
          </div>
        </div>

        <div className="bg-[#0A0E1A] border border-white/10 rounded-xl p-4 flex items-center gap-3">
          <div className={`p-3 rounded-lg border ${activeAlarms > 0 ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' : 'bg-slate-800/50 border-white/10 text-slate-400'}`}>
            <Bell className={`w-5 h-5 ${activeAlarms > 0 ? 'animate-bounce' : ''}`} />
          </div>
          <div>
            <span className="text-[10px] uppercase text-slate-500 block font-mono">Active CCTV Warnings</span>
            <span className={`text-xl font-bold ${activeAlarms > 0 ? 'text-rose-400' : 'text-slate-100'}`}>
              {activeAlarms} Flagged
            </span>
          </div>
        </div>

        <div className="bg-[#0A0E1A] border border-white/10 rounded-xl p-4 flex flex-col justify-center">
          <div className="flex gap-2">
            <button 
              onClick={handleTriggerAIAnomaly}
              disabled={triggeringAnom}
              className="flex-1 px-3 py-1.5 bg-gradient-to-r from-teal-600 to-[#EAB308] hover:from-teal-500 hover:to-[#FFD600] text-[11px] font-bold text-slate-100 rounded-lg flex items-center justify-center gap-1.5 transition"
              id="cctv-trigger-anom-btn"
            >
              <Cpu className="w-3.5 h-3.5 animate-pulse" />
              {triggeringAnom ? "Injecting Event..." : "Scan AI Anomaly"}
            </button>
            <button 
              onClick={fetchSurveillanceData}
              disabled={refreshing}
              className="px-2.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 rounded-lg flex items-center justify-center transition border border-slate-700"
              id="refresh-cctv-btn"
              title="Refresh Camera Feeds"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

      </div>

      {/* 2. REGISTRATION CONTROLS BAR */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-[#05080F] border border-white/[0.06] rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] uppercase font-bold text-slate-500 font-mono">Site Outpost Filter:</span>
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => setSelectedSiteId("All")}
              className={`px-3 py-1 text-xs rounded-lg transition font-medium ${selectedSiteId === "All" ? 'bg-[#FFD600] text-slate-100' : 'bg-[#0A0E1A] text-slate-400 hover:bg-slate-800'}`}
              id="site-filter-all"
            >
              All Outposts ({cameras.length})
            </button>
            {sites.map(s => (
              <button
                key={s.id}
                onClick={() => setSelectedSiteId(s.id)}
                className={`px-3 py-1 text-xs rounded-lg transition font-medium ${selectedSiteId === s.id ? 'bg-[#FFD600] text-slate-100' : 'bg-[#0A0E1A] text-slate-400 hover:bg-slate-800'}`}
                id={`site-filter-${s.id}`}
              >
                {s.name.split(" - ")[0]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 self-stretch sm:self-auto shrink-0">
          <button
            onClick={() => setShowSiteModal(true)}
            className="flex-1 sm:flex-none px-3 py-1.5 bg-[#0A0E1A] hover:bg-slate-800 border border-white/10 hover:border-slate-700 text-xs font-semibold text-slate-300 rounded-lg flex items-center justify-center gap-1.5 transition"
            id="register-site-trigger-btn"
          >
            <PlusCircle className="w-3.5 h-3.5 text-[#FFD600]" />
            + New Site
          </button>
          <button
            onClick={() => setShowCamModal(true)}
            className="flex-1 sm:flex-none px-3 py-1.5 bg-[#0A0E1A] hover:bg-slate-800 border border-white/10 hover:border-slate-700 text-xs font-semibold text-slate-300 rounded-lg flex items-center justify-center gap-1.5 transition"
            id="register-cam-trigger-btn"
          >
            <CameraIcon className="w-3.5 h-3.5 text-[#FFD600]" />
            + Install Camera
          </button>
        </div>
      </div>

      {/* 3. MAIN WORKSPACE SPLIT (LEFT FEED / RIGHT PANEL) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: LIVE STREAM VIEWER (8 COLS) */}
        <div className="lg:col-span-8 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase font-extrabold tracking-widest text-slate-500 font-mono">
              {selectedSiteId === "All" ? "Unified Stream Grid" : `${sites.find(s => s.id === selectedSiteId)?.name} Streams`}
            </span>
            <span className="text-[10px] text-slate-400 flex items-center gap-1.5 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-[#FFD600] animate-ping" />
              RTSP INGRESS SECURE (256-BIT CJS)
            </span>
          </div>

          {filteredCameras.length === 0 ? (
            <div className="bg-[#05080F]/40 border border-white/[0.06] rounded-xl p-12 text-center text-slate-600 text-xs font-sans">
              No surveillance hardware currently configured for this outpost filter. Click "Install Camera" to add one.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredCameras.map((cam) => {
                const siteObj = sites.find(s => s.id === cam.siteId);
                const isOnline = cam.status === "Online";

                return (
                  <div 
                    key={cam.id} 
                    className="bg-[#0A0E1A] border border-white/10/80 rounded-xl overflow-hidden shadow-md flex flex-col group relative"
                    id={`cctv-card-${cam.id}`}
                  >
                    
                    {/* VIDEO FEED PANEL */}
                    <div className="relative aspect-video w-full bg-[#05080F] flex flex-col justify-between p-3 overflow-hidden select-none">
                      
                      {/* SCANLINE / GLOW EFFECTS */}
                      <div className="absolute inset-0 bg-linear-to-b from-transparent via-[#FFD600]/5 to-transparent bg-[size:100%_4px] pointer-events-none opacity-40 z-10" />
                      {isOnline && cam.isRecording && (
                        <div className="absolute inset-0 bg-red-500/[0.02] animate-pulse pointer-events-none z-10" />
                      )}

                      {/* Header overlay info */}
                      <div className="flex items-center justify-between z-20 relative">
                        <div className="bg-[#05080F]/80 px-2 py-0.5 rounded border border-white/10 font-mono text-[9px] text-slate-300 flex items-center gap-1">
                          <Activity className="w-3 h-3 text-[#FFD600]" />
                          <span>{cam.resolution}</span>
                        </div>
                        
                        <div className="flex items-center gap-1.5">
                          {isOnline && cam.isRecording && (
                            <span className="bg-red-500/15 border border-red-500/30 text-rose-400 text-[9px] font-mono font-bold px-2 py-0.5 rounded flex items-center gap-1 shadow-md">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping shrink-0" />
                              REC
                            </span>
                          )}
                          <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border ${isOnline ? 'bg-[#FFD600]/10 text-[#FFD600] border-[#FFD600]/30' : 'bg-rose-500/10 text-rose-400 border-rose-500/30'}`}>
                            {cam.status}
                          </span>
                        </div>
                      </div>

                      {/* Video core or Offline message */}
                      <div className="flex-1 flex items-center justify-center py-4 z-20 relative">
                        {isOnline ? (
                          <div className="text-center space-y-1.5">
                            <Video className={`w-8 h-8 text-[#FFD600]/40 group-hover:scale-110 transition duration-300 ${cam.isRecording ? 'animate-pulse' : ''}`} />
                            <span className="text-[10px] font-mono text-slate-500 tracking-wider">
                              FPS: 30.0 • RATE: 1420kb/s
                            </span>
                          </div>
                        ) : (
                          <div className="text-center space-y-1 bg-rose-950/10 border border-rose-950/30 px-4 py-3 rounded-lg max-w-xs mx-auto">
                            <AlertTriangle className="w-7 h-7 text-rose-500 mx-auto" />
                            <h4 className="text-rose-400 text-xs font-bold font-mono">RTSP SIGNAL INGRESS FAIL</h4>
                            <p className="text-[10px] text-slate-400 font-sans">Remote device unresponsive. Link failure or local power disruption.</p>
                          </div>
                        )}
                      </div>

                      {/* Footer overlay labels */}
                      <div className="flex items-center justify-between z-20 relative bg-[#05080F]/85 px-2.5 py-1.5 rounded border border-white/[0.06]/60 font-mono text-[9px]">
                        <div>
                          <p className="text-slate-100 font-bold leading-none">{cam.name}</p>
                          <p className="text-[9px] text-slate-400 leading-none mt-1">{siteObj ? siteObj.name.split(" - ")[0] : "MACERT"}</p>
                        </div>
                        <p className="text-slate-500 text-[9px] font-semibold">{new Date().toLocaleTimeString()}</p>
                      </div>

                    </div>

                    {/* CONTROLS AREA */}
                    <div className="p-3 bg-[#0A0E1A]/90 border-t border-white/10/80 grid grid-cols-4 gap-1">
                      
                      <button
                        onClick={() => {
                          if (isOnline) handleDeactivateCam(cam.id);
                          else handleActivateCam(cam.id);
                        }}
                        className={`py-1.5 rounded text-[10px] font-bold flex items-center justify-center gap-1 transition ${isOnline ? 'bg-slate-800 hover:bg-slate-700 text-amber-400' : 'bg-[#030f09]/40 hover:bg-[#052010]/40 text-[#FFD600] border border-[#052010]/30'}`}
                        id={`cctv-toggle-power-${cam.id}`}
                        title={isOnline ? "Deactivate stream feed" : "Activate stream feed"}
                      >
                        <Power className="w-3.5 h-3.5" />
                        <span>{isOnline ? "Kill" : "Boot"}</span>
                      </button>

                      <button
                        onClick={() => handleToggleRecord(cam.id)}
                        disabled={!isOnline}
                        className={`py-1.5 rounded text-[10px] font-bold flex items-center justify-center gap-1 transition ${!isOnline ? 'text-slate-600 bg-[#05080F] cursor-not-allowed' : cam.isRecording ? 'bg-rose-950/50 hover:bg-rose-900/40 text-rose-400 border border-rose-900/30' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'}`}
                        id={`cctv-toggle-record-${cam.id}`}
                      >
                        <Video className="w-3.5 h-3.5" />
                        <span>{cam.isRecording ? "Halt" : "REC"}</span>
                      </button>

                      <button
                        onClick={() => handleCaptureSnapshot(cam.id)}
                        disabled={!isOnline}
                        className="py-1.5 rounded text-[10px] font-bold bg-slate-800 hover:bg-slate-700 disabled:bg-[#05080F] disabled:text-slate-600 text-slate-300 flex items-center justify-center gap-1 transition"
                        id={`cctv-snapshot-${cam.id}`}
                      >
                        <HardDrive className="w-3.5 h-3.5" />
                        <span>Shot</span>
                      </button>

                      <button
                        onClick={() => alert(`RTSP Stream Network Link URL:\n${cam.rtspUrl}\n\nDevice Architecture: ${cam.model}\nEncoding Core: H.265 / CJS Stream Gateway`)}
                        className="py-1.5 rounded text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 flex items-center justify-center gap-1 transition"
                        id={`cctv-info-${cam.id}`}
                      >
                        <Settings className="w-3.5 h-3.5" />
                        <span>Sys</span>
                      </button>

                    </div>

                  </div>
                );
              })}
            </div>
          )}

          {/* DYNAMIC SHAPSHOT MODAL PREVIEW */}
          {snapshotCamId && snapshotData && (
            <div className="bg-[#05080F] border border-[#052010]/40 p-4 rounded-xl font-mono text-xs text-[#FFD600] relative animate-fade-in">
              <button 
                onClick={() => { setSnapshotCamId(null); setSnapshotData(null); }}
                className="absolute top-2 right-2 text-slate-500 hover:text-slate-200 p-1"
                id="close-snapshot-btn"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2 text-slate-200 font-bold mb-2">
                <CheckCircle className="w-4.5 h-4.5 text-[#FFD600]" />
                <span>NVR Frame Snapshot Capture Confirmed</span>
              </div>
              <pre className="whitespace-pre-wrap leading-relaxed text-[11px] bg-[#05080F]/60 p-2.5 rounded border border-white/[0.06]">{snapshotData}</pre>
            </div>
          )}

        </div>

        {/* RIGHT COLUMN: INTEGRATED SERVICES PANEL (4 COLS) */}
        <div className="lg:col-span-4 space-y-4">
          
          {/* TAB BAR FOR RIGHT COLUMN */}
          <div className="bg-[#0A0E1A] border border-white/10 rounded-xl p-1 flex">
            <button
              onClick={() => setActiveRightTab('alerts')}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition flex items-center justify-center gap-1.5 ${activeRightTab === 'alerts' ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}
              id="right-tab-alerts"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              AI Alarms
            </button>
            <button
              onClick={() => setActiveRightTab('access')}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition flex items-center justify-center gap-1.5 ${activeRightTab === 'access' ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}
              id="right-tab-access"
            >
              <Key className="w-3.5 h-3.5" />
              Access Unit
            </button>
            <button
              onClick={() => setActiveRightTab('billing')}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition flex items-center justify-center gap-1.5 ${activeRightTab === 'billing' ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}
              id="right-tab-billing"
            >
              <DollarSign className="w-3.5 h-3.5" />
              SaaS Plans
            </button>
          </div>

          {/* TAB CONTENT: 1. AI SECURITY EVENT ALARMS */}
          {activeRightTab === 'alerts' && (
            <div className="bg-[#0A0E1A] border border-white/10 rounded-xl p-4 space-y-4" id="alerts-tab-content">
              <div>
                <h3 className="text-sm font-bold text-slate-200 tracking-tight flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                  Active AI Edge Threat Logs
                </h3>
                <p className="text-[10px] text-slate-500 mt-0.5">Real-time object categorization & intrusion alerts</p>
              </div>

              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {events.length === 0 ? (
                  <p className="text-xs text-slate-600 text-center py-6 italic">No active security events airing.</p>
                ) : (
                  events.map(ev => {
                    const isNew = ev.status === "Airing";
                    return (
                      <div 
                        key={ev.id} 
                        className={`p-3 rounded-lg border text-xs space-y-2 transition duration-200 ${isNew ? 'bg-[#05080F]/80 border-white/10 shadow-md ring-1 ring-red-500/10' : 'bg-[#05080F]/20 border-white/[0.06] opacity-65'}`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider ${getSeverityColor(ev.severity)}`}>
                            {ev.type.replace("_", " ")}
                          </span>
                          <span className="text-[9px] font-mono text-slate-500">{new Date(ev.timestamp).toLocaleTimeString()}</span>
                        </div>

                        <p className="text-slate-300 text-[11px] font-sans leading-relaxed">
                          {ev.details}
                        </p>

                        <div className="flex items-center justify-between pt-1 border-t border-white/[0.06] font-mono text-[9px]">
                          <span className="text-slate-500">Location: <span className="text-slate-300 font-semibold">{ev.location}</span></span>
                          {isNew ? (
                            <button
                              onClick={() => handleAcknowledgeEvent(ev.id)}
                              className="px-2 py-0.5 bg-[#FFD600] hover:bg-[#FFD600] text-slate-100 font-bold rounded flex items-center gap-0.5 transition"
                              id={`ack-btn-${ev.id}`}
                            >
                              <CheckCircle className="w-3 h-3 text-[#FFFDE7]" />
                              Dismiss
                            </button>
                          ) : (
                            <span className="text-[#FFD600] flex items-center gap-0.5">
                              <ShieldCheck className="w-3.5 h-3.5 text-[#FFD600]" />
                              Cleared
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* HEALTH MONITOR & ADVISOR RECOMMENDATION */}
              <div className="bg-[#05080F]/50 border border-slate-850 rounded-xl p-3 text-xs space-y-2">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-[#FFD600]" />
                  Smart CCTV Health Advisor
                </h4>
                <div className="space-y-1.5 text-[11px] leading-relaxed">
                  {cameras.some(c => c.status === "Offline") ? (
                    <div className="flex items-start gap-1 text-amber-400/90 font-sans">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
                      <p>Active anomaly: <span className="font-semibold text-slate-200">CAM-05 (Lilongwe Civic Vault Gate)</span> is down. Advise telecom service desk audit.</p>
                    </div>
                  ) : (
                    <p className="text-slate-400 font-sans">✓ All active integrated camera Handshakes established securely on standard ports.</p>
                  )}
                  <p className="text-[10px] text-slate-500 font-mono italic">Edge NVR storage health: 91.4% capacity remaining</p>
                </div>
              </div>

            </div>
          )}

          {/* TAB CONTENT: 2. ACCESS UNIT DOOR SWIPES */}
          {activeRightTab === 'access' && (
            <div className="bg-[#0A0E1A] border border-white/10 rounded-xl p-4 space-y-4 font-mono text-xs" id="access-tab-content">
              <div>
                <h3 className="text-sm font-bold text-slate-200 tracking-tight flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-teal-400" />
                  Device Entry Terminals
                </h3>
                <p className="text-[10px] text-slate-500 font-sans mt-0.5">Access logs from Smart Locks and Biometrics on-premise</p>
              </div>

              <div className="space-y-2.5 max-h-[480px] overflow-y-auto pr-1">
                {accessLogs.map(acc => (
                  <div key={acc.id} className="bg-[#05080F]/50 border border-white/[0.06] rounded-lg p-2.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-100 font-bold text-[11px]">{acc.deviceName}</span>
                      <span className={`text-[9px] px-1.5 font-bold rounded ${acc.status === 'Allowed' ? 'bg-[#FFD600]/10 text-[#FFD600]' : 'bg-rose-500/10 text-rose-400'}`}>
                        {acc.status}
                      </span>
                    </div>

                    <div className="flex justify-between text-[10px] text-slate-400">
                      <span>User: <span className="text-slate-300">{acc.user}</span></span>
                      <span>{acc.deviceType}</span>
                    </div>

                    <div className="flex justify-between items-center text-[9px] text-slate-500 border-t border-white/[0.06]/60 pt-1.5">
                      <span>{acc.action}</span>
                      <span>{new Date(acc.timestamp).toLocaleTimeString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB CONTENT: 3. SaaS BILLING SUBSCRIPTIONS */}
          {activeRightTab === 'billing' && (
            <div className="bg-[#0A0E1A] border border-white/10 rounded-xl p-4 space-y-4" id="billing-tab-content">
              <div>
                <h3 className="text-sm font-bold text-slate-200 tracking-tight flex items-center gap-1.5">
                  <Compass className="w-4 h-4 text-blue-400" />
                  SaaS Integration Pricing Plans
                </h3>
                <p className="text-[10px] text-slate-500 mt-0.5">Local Malawian institutional subscription configurations</p>
              </div>

              <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
                {plans.map(plan => (
                  <div key={plan.id} className="bg-[#05080F]/40 border border-slate-850 rounded-xl p-3.5 space-y-3 hover:border-white/10 transition">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="text-xs font-bold text-slate-100">{plan.name}</h4>
                        <p className="text-[10px] text-slate-500 font-mono mt-0.5">SADC National Vault Compliant</p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-extrabold text-[#FFD600] block font-mono">{plan.price}</span>
                        <span className="text-[9px] text-slate-500 uppercase font-mono">per {plan.interval}</span>
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
                      {plan.description}
                    </p>

                    <div className="border-t border-white/[0.06] pt-2 space-y-1 text-[10px]">
                      {plan.features.map((feat, i) => (
                        <div key={i} className="flex items-center gap-1.5 text-slate-300">
                          <CheckCircle className="w-3 h-3 text-[#FFD600] shrink-0" />
                          <span className="font-sans leading-normal">{feat}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

      </div>

      {/* 4. MODAL: REGISTER LAND SITE */}
      {showSiteModal && (
        <div className="fixed inset-0 bg-[#05080F]/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-[#0A0E1A] border border-white/10 rounded-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="text-sm font-extrabold text-slate-100 uppercase tracking-widest font-mono">Register Threat Site Node</h3>
              <button onClick={() => setShowSiteModal(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSite} className="space-y-4 text-xs">
              <div>
                <label className="block text-[10px] uppercase text-slate-400 font-bold mb-1">Site Area Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., FDH Bank - Blantyre Treasury Room"
                  value={newSiteName}
                  onChange={(e) => setNewSiteName(e.target.value)}
                  className="w-full bg-[#05080F] border border-white/10 roundedpx p-2 text-slate-200 focus:outline-none focus:border-[#FFD600]"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase text-slate-400 font-bold mb-1">Organization Cluster</label>
                <select
                  value={newSiteOrg}
                  onChange={(e) => setNewSiteOrg(e.target.value)}
                  className="w-full bg-[#05080F] border border-white/10 rounded p-2 text-slate-300 focus:outline-none"
                >
                  <option value="Standard Bank MW">Standard Bank MW</option>
                  <option value="Airtel Network">Airtel Network</option>
                  <option value="TNM Mpamba Ltd">TNM Mpamba Ltd</option>
                  <option value="National Bank MW">National Bank MW</option>
                  <option value="FDH Bank">FDH Bank Group</option>
                  <option value="Malawi Gov Gateway">Malawi Gov Gateway</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] uppercase text-slate-400 font-bold mb-1">Security Target Level</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['Standard', 'Elevated', 'Maximum'] as const).map(level => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setNewSiteSec(level)}
                      className={`py-1.5 rounded text-[10px] font-bold border transition ${newSiteSec === level ? 'bg-[#FFD600]/20 border-[#FFD600] text-[#FFD600]' : 'bg-[#05080F] border-white/10 text-slate-400'}`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[10px] uppercase text-slate-400 font-bold mb-1">Physical Address / Access Zone</label>
                <input
                  type="text"
                  placeholder="e.g., FDH Tower Ground Vault Corridor"
                  value={newSiteAddr}
                  onChange={(e) => setNewSiteAddr(e.target.value)}
                  className="w-full bg-[#05080F] border border-white/10 rounded p-2 text-slate-200 focus:outline-none focus:border-[#FFD600]"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-[#FFD600] hover:bg-[#FFD600] rounded font-bold text-slate-100 transition"
              >
                Launch Site Outlink
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 5. MODAL: REGISTER CCTV CAMERA NODE */}
      {showCamModal && (
        <div className="fixed inset-0 bg-[#05080F]/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-[#0A0E1A] border border-white/10 rounded-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="text-sm font-extrabold text-slate-100 uppercase tracking-widest font-mono">Install CCTV Camera Node</h3>
              <button onClick={() => setShowCamModal(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCamera} className="space-y-4 text-xs">
              <div>
                <label className="block text-[10px] uppercase text-slate-400 font-bold mb-1">Camera Unit Display Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Server Entry Dome Cam"
                  value={newCamName}
                  onChange={(e) => setNewCamName(e.target.value)}
                  className="w-full bg-[#05080F] border border-white/10 rounded p-2 text-slate-200 focus:outline-none focus:border-[#FFD600]"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase text-slate-400 font-bold mb-1">Target Installation Site</label>
                <select
                  value={newCamSite}
                  onChange={(e) => setNewCamSite(e.target.value)}
                  className="w-full bg-[#05080F] border border-white/10 rounded p-2 text-slate-300 focus:outline-none"
                >
                  {sites.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] uppercase text-slate-400 font-bold mb-1">RTSP Stream Address Ingress Link</label>
                <input
                  type="text"
                  required
                  placeholder="rtsp://10.X.X.X:554/live/feed"
                  value={newCamRtsp}
                  onChange={(e) => setNewCamRtsp(e.target.value)}
                  className="w-full bg-[#05080F] border border-white/10 rounded p-2 text-slate-200 focus:outline-none focus:border-[#FFD600] font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase text-slate-400 font-bold mb-1">Hardware Model Specification</label>
                <input
                  type="text"
                  placeholder="e.g., Sentinel Dome-A8 Pro V4"
                  value={newCamModel}
                  onChange={(e) => setNewCamModel(e.target.value)}
                  className="w-full bg-[#05080F] border border-white/10 rounded p-2 text-slate-200 focus:outline-none focus:border-[#FFD600]"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-[#FFD600] hover:bg-[#FFD600] rounded font-bold text-slate-100 transition"
              >
                Publish In-Service CCTV Handshake
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
