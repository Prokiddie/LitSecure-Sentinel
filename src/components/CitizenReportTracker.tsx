import React, { useState, useEffect, useRef } from "react";
import {
  Shield, Send, Loader2, CheckCircle, AlertTriangle,
  Clock, Upload, MessageSquare, Paperclip, ArrowRight,
  Info, ShieldCheck, Download, User, AlertCircle
} from "lucide-react";

interface EvidenceFile {
  id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  uploaded_at: string;
}

interface TimelineUpdate {
  id: string;
  date: string;
  author: string;
  message: string;
  statusBefore: string;
  statusAfter: string;
}

interface TrackData {
  id: string;
  title: string;
  category: string;
  severity: string;
  status: string;
  incidentDate: string;
  mitigationAdvice?: string;
  analysisSummary?: string;
  updates: TimelineUpdate[];
  evidence: EvidenceFile[];
}

interface CitizenReportTrackerProps {
  incidentId: string;
  initialData?: TrackData | null;
  onBack?: () => void;
}

export default function CitizenReportTracker({ incidentId, initialData, onBack }: CitizenReportTrackerProps) {
  const [data, setData] = useState<TrackData | null>(initialData || null);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);

  // Message loop state
  const [message, setMessage] = useState("");
  const [authorName, setAuthorName] = useState("Citizen Reporter");
  const [sendingMsg, setSendingMsg] = useState(false);

  // File upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [fileDescription, setFileDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const fetchTrackData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const resp = await fetch(`/api/public/track/${encodeURIComponent(incidentId)}`);
      const resData = await resp.json();
      if (!resp.ok) throw new Error(resData.message || "Failed to load tracking data.");
      setData(resData);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Incident details could not be retrieved.");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrackData();
    // Poll every 10 seconds silently to auto-receive updates/replies from analyst
    const timer = setInterval(() => fetchTrackData(true), 10000);
    return () => clearInterval(timer);
  }, [incidentId]);

  useEffect(() => {
    // Scroll chat to bottom when updates change
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data?.updates]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    setSendingMsg(true);
    try {
      const resp = await fetch(`/api/public/track/${encodeURIComponent(incidentId)}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message.trim(), authorName: authorName.trim() }),
      });
      const res = await resp.json();
      if (!resp.ok) throw new Error(res.message || "Could not post message.");
      setMessage("");
      setData(prev => prev ? { ...prev, updates: res.updates } : null);
    } catch (err: any) {
      alert(err.message || "Error transmitting message.");
    } finally {
      setSendingMsg(false);
    }
  };

  const convertToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const handleUploadFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;
    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);

    try {
      const base64 = await convertToBase64(uploadFile);
      const resp = await fetch(`/api/public/track/${encodeURIComponent(incidentId)}/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: uploadFile.name,
          fileType: uploadFile.type || "screenshot",
          fileData: base64,
          description: fileDescription.trim() || undefined,
        }),
      });

      const res = await resp.json();
      if (resp.status === 422) {
        // Malware detected!
        throw new Error(`MALWARE BLOCKED: ${res.message}. File SHA-256: ${res.sha256}`);
      }
      if (!resp.ok) throw new Error(res.message || "Upload failed.");

      setUploadSuccess(`"${uploadFile.name}" was successfully scanned for malware (SAFE) and saved.`);
      setUploadFile(null);
      setFileDescription("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      
      // Refresh to pull new evidence and updates timeline
      fetchTrackData(true);
    } catch (err: any) {
      setUploadError(err.message || "Failed to upload file.");
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-400 mb-3" />
        <span className="text-sm font-mono tracking-wider">Synchronizing with MACERT Gateway...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-red-500/10 border border-red-500/25 rounded-2xl p-6 text-center max-w-lg mx-auto">
        <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
        <h3 className="font-grotesk font-bold text-white mb-2">Tracking Failed</h3>
        <p className="text-xs text-slate-400 mb-4">{error || "No data available."}</p>
        {onBack && (
          <button onClick={onBack} className="btn-accent px-4 py-2 rounded text-xs font-bold">
            Go Back
          </button>
        )}
      </div>
    );
  }

  // Calculate milestones
  const statuses = ["Reported", "Investigating", "Contained", "Resolved", "Closed"];
  const currentIdx = statuses.indexOf(data.status);
  
  const getMilestoneStatus = (stepName: string) => {
    const stepIdx = statuses.indexOf(stepName);
    if (data.status === stepName) return "active";
    if (currentIdx > stepIdx) return "completed";
    return "pending";
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-6 animate-fade-in text-slate-200">
      
      {/* Back button */}
      {onBack && (
        <button onClick={onBack} className="text-slate-400 hover:text-white flex items-center gap-1 text-xs font-bold font-mono transition">
          ← Back to Search
        </button>
      )}

      {/* Main Stats Header */}
      <div className="rounded-2xl border border-white/8 bg-[#05080F]/80 p-5">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <span className="text-[10px] font-mono font-bold text-slate-500 uppercase">LitSecure Reference</span>
            <h2 className="text-2xl font-bold font-mono text-white flex items-center gap-2 select-all">
              {data.id}
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase font-mono ${
                data.severity === "Critical" ? "text-red-400 border-red-500/25 bg-red-500/10" :
                data.severity === "High"     ? "text-orange-400 border-orange-500/25 bg-orange-500/10" :
                data.severity === "Medium"   ? "text-amber-400 border-amber-500/25 bg-amber-500/10" :
                "text-slate-400 border-slate-500/20 bg-slate-500/5"
              }`}>{data.severity}</span>
            </h2>
            <p className="text-slate-400 text-xs mt-1 leading-snug font-grotesk">{data.title}</p>
          </div>

          <div className="flex gap-3">
            <div className="bg-[#05080F]/60 border border-white/8 rounded-lg px-3 py-2 text-right">
              <span className="text-[9px] text-slate-500 uppercase block font-mono">Category</span>
              <span className="text-xs font-bold text-slate-300">{data.category}</span>
            </div>
            <div className="bg-[#05080F]/60 border border-white/8 rounded-lg px-3 py-2 text-right">
              <span className="text-[9px] text-slate-500 uppercase block font-mono">Submitted</span>
              <span className="text-xs font-bold text-slate-300 font-mono">{new Date(data.incidentDate).toLocaleDateString()}</span>
            </div>
          </div>
        </div>

        {/* Milestone Tracker Bar */}
        <div className="mt-8 border-t border-white/5 pt-6">
          <div className="relative flex justify-between items-center w-full max-w-xl mx-auto">
            {/* Line behind */}
            <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-0.5 bg-white/5 z-0" />
            <div 
              className="absolute left-0 top-1/2 -translate-y-1/2 h-0.5 bg-emerald-500 transition-all duration-500 z-0" 
              style={{ width: `${(Math.max(0, currentIdx) / (statuses.length - 1)) * 100}%` }}
            />

            {/* Steps */}
            {statuses.map((step, idx) => {
              const mState = getMilestoneStatus(step);
              return (
                <div key={step} className="relative z-10 flex flex-col items-center">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center border font-mono text-xs transition-all duration-300 ${
                    mState === "completed" 
                      ? "bg-emerald-500 border-emerald-400 text-white font-bold" 
                      : mState === "active"
                      ? "bg-emerald-950 border-emerald-400 text-emerald-400 font-bold glow-emerald animate-pulse scale-110"
                      : "bg-[#05080F] border-white/10 text-slate-600"
                  }`}>
                    {mState === "completed" ? "✓" : idx + 1}
                  </div>
                  <span className={`text-[9px] font-bold mt-2 uppercase tracking-wider ${
                    mState === "active" ? "text-emerald-400 font-extrabold" : mState === "completed" ? "text-slate-300" : "text-slate-600"
                  }`}>{step}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Recommended Action / Incident Guidance from AI */}
      {(data.mitigationAdvice || data.analysisSummary) && (
        <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/3 p-5 relative overflow-hidden">
          <div className="absolute -right-16 -top-16 w-36 h-36 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-3 flex-1 min-w-0">
              <div>
                <h4 className="font-bold text-white text-sm">Official MACERT Response & Containment Guidance</h4>
                <p className="text-[10px] text-emerald-400/70 font-mono uppercase mt-0.5">Dual-verified AI recommendations</p>
              </div>

              {data.analysisSummary && (
                <div className="text-xs text-slate-300 leading-relaxed border-b border-white/5 pb-3">
                  <span className="text-[9px] text-slate-500 uppercase font-mono block mb-1">Threat Classification Details</span>
                  {data.analysisSummary}
                </div>
              )}

              {data.mitigationAdvice && (
                <div className="text-xs text-slate-300 leading-relaxed">
                  <span className="text-[9px] text-slate-500 uppercase font-mono block mb-1">Emergency Containment Advice</span>
                  <p className="whitespace-pre-line bg-[#05080F]/40 border border-white/5 rounded-lg p-3 font-sans leading-relaxed text-slate-200">
                    {data.mitigationAdvice}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Split Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Chat Loop */}
        <div className="lg:col-span-7 flex flex-col h-[520px] rounded-2xl border border-white/8 bg-[#05080F]/60 backdrop-blur-sm p-4">
          <div className="flex items-center gap-2 border-b border-white/5 pb-3 mb-3">
            <MessageSquare className="w-4 h-4 text-emerald-400" />
            <div>
              <h3 className="font-bold text-sm text-white">Investigator Coordination Portal</h3>
              <p className="text-[9px] text-slate-500 font-mono">Secured direct citizen-to-responder feedback pipeline</p>
            </div>
          </div>

          {/* Messages list */}
          <div className="flex-1 overflow-y-auto space-y-3.5 pr-2 custom-scrollbar">
            {data.updates.length === 0 ? (
              <div className="text-center py-20 text-slate-600 text-xs">
                No messaging history available.
              </div>
            ) : (
              data.updates.map((up) => {
                const isSystem = up.author.toLowerCase().includes("system");
                const isCitizen = up.author.toLowerCase().includes("citizen");
                
                if (isSystem) {
                  return (
                    <div key={up.id} className="mx-auto max-w-[90%] text-center py-1.5 px-3 rounded-lg bg-slate-900/50 border border-white/5 text-[10px] text-slate-400 leading-normal font-mono">
                      <span className="text-slate-500 mr-1.5">[{new Date(up.date).toLocaleTimeString()}]</span>
                      <span className="text-emerald-400 font-bold">{up.author}:</span> {up.message}
                    </div>
                  );
                }

                return (
                  <div key={up.id} className={`flex flex-col max-w-[80%] ${isCitizen ? "ml-auto items-end" : "mr-auto items-start"}`}>
                    <div className="flex items-center gap-1.5 text-[9px] text-slate-500 font-mono mb-1">
                      <User className="w-2.5 h-2.5" />
                      <span className="font-bold">{up.author}</span>
                      <span>•</span>
                      <span>{new Date(up.date).toLocaleTimeString()}</span>
                    </div>
                    <div className={`p-3 rounded-xl text-xs leading-relaxed break-words whitespace-pre-wrap ${
                      isCitizen 
                        ? "bg-emerald-600/15 border border-emerald-500/20 rounded-tr-none text-slate-100" 
                        : "bg-blue-600/15 border border-blue-500/20 rounded-tl-none text-slate-100"
                    }`}>
                      {up.message}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Chat Form */}
          <form onSubmit={handleSendMessage} className="border-t border-white/5 pt-3 mt-3 space-y-2">
            <div className="flex gap-2">
              <div className="w-[120px] shrink-0">
                <input 
                  type="text" 
                  value={authorName} 
                  onChange={e => setAuthorName(e.target.value)}
                  placeholder="Citizen Name" 
                  required
                  className="glass-input w-full px-2.5 py-1.5 text-[10px] text-slate-300 font-bold"
                />
              </div>
              <p className="text-[9px] text-slate-500 flex items-center italic">
                Posts anonymously as citizen role.
              </p>
            </div>
            
            <div className="flex gap-2">
              <input
                type="text"
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Ask investigator a question or add a details update..."
                className="glass-input flex-1 px-3 py-2 text-xs"
                disabled={sendingMsg}
              />
              <button 
                type="submit" 
                disabled={sendingMsg || !message.trim()}
                className="btn-accent px-4 py-2 rounded text-xs font-bold flex items-center justify-center shrink-0 disabled:opacity-40"
              >
                {sendingMsg ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              </button>
            </div>
          </form>
        </div>

        {/* Right Column: Evidence Vault */}
        <div className="lg:col-span-5 flex flex-col h-[520px] rounded-2xl border border-white/8 bg-[#05080F]/60 backdrop-blur-sm p-4">
          <div className="flex items-center gap-2 border-b border-white/5 pb-3 mb-3">
            <Paperclip className="w-4 h-4 text-emerald-400" />
            <div>
              <h3 className="font-bold text-sm text-white">Public Evidence Vault</h3>
              <p className="text-[9px] text-slate-500 font-mono">Malware scanned uploads & chain of custody</p>
            </div>
          </div>

          {/* Evidence List */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
            {data.evidence.length === 0 ? (
              <div className="text-center py-16 text-slate-600 text-xs">
                No evidence attachments attached to this incident.
              </div>
            ) : (
              data.evidence.map((file) => (
                <div key={file.id} className="rounded-xl border border-white/5 bg-[#05080F]/40 p-3 flex justify-between items-center gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white truncate font-mono">{file.file_name}</p>
                    <div className="flex items-center gap-2 text-[9px] text-slate-500 font-mono mt-1">
                      <span>{formatSize(file.file_size)}</span>
                      <span>•</span>
                      <span>{new Date(file.uploaded_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-1.5">
                    <span className="text-[8px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 px-1.5 py-0.5 rounded font-mono font-bold uppercase">
                      ✓ Scanned
                    </span>
                    <a 
                      href={`/api/evidence/download/${file.id}`} 
                      download 
                      target="_blank" 
                      rel="noreferrer"
                      className="p-1.5 rounded-lg border border-white/10 hover:border-white/20 text-slate-400 hover:text-white transition bg-slate-800/40"
                      title="Download file"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Upload panel */}
          <div className="border-t border-white/5 pt-3 mt-3">
            <h4 className="text-[10px] font-mono font-bold text-slate-400 uppercase mb-2">Upload Additional Evidence</h4>
            
            {uploadError && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] p-2.5 rounded-lg mb-3 flex items-start gap-1.5 leading-normal">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">MALWARE SCAN DETECTED A THREAT</span>
                  <p className="mt-0.5">{uploadError}</p>
                </div>
              </div>
            )}

            {uploadSuccess && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] p-2.5 rounded-lg mb-3 flex items-start gap-1.5 leading-normal">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <p>{uploadSuccess}</p>
              </div>
            )}

            <form onSubmit={handleUploadFile} className="space-y-2">
              <div className="relative">
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={e => setUploadFile(e.target.files?.[0] || null)}
                  className="hidden" 
                  id="evidence-tracker-file"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-3 px-4 border border-dashed border-white/10 hover:border-emerald-500/30 rounded-xl bg-white/2 hover:bg-emerald-500/2 flex flex-col items-center justify-center gap-1.5 transition text-slate-400 hover:text-emerald-400"
                >
                  <Upload className="w-5 h-5 text-slate-500" />
                  <span className="text-[10px] font-mono font-bold">
                    {uploadFile ? uploadFile.name : "CHOOSE EVIDENCE FILE..."}
                  </span>
                  <span className="text-[8px] text-slate-600 font-mono">
                    {uploadFile ? `${formatSize(uploadFile.size)} selected` : "Images, logs, screenshots, txt files (Max 5MB)"}
                  </span>
                </button>
              </div>

              {uploadFile && (
                <div className="space-y-2 animate-fade-in">
                  <input 
                    type="text" 
                    value={fileDescription} 
                    onChange={e => setFileDescription(e.target.value)}
                    placeholder="Brief description of evidence (for chain of custody)" 
                    className="glass-input w-full px-2.5 py-1.5 text-[10px]"
                    required
                  />
                  <button 
                    type="submit" 
                    disabled={uploading}
                    className="btn-accent w-full py-1.5 rounded text-[10px] font-bold flex items-center justify-center gap-1.5 uppercase"
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Scanning for Malware & Encrypting...
                      </>
                    ) : (
                      <>
                        <Upload className="w-3.5 h-3.5" />
                        Scan & Upload File
                      </>
                    )}
                  </button>
                </div>
              )}
            </form>
          </div>

        </div>

      </div>

    </div>
  );
}
