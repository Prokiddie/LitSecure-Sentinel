import React, { useState, useEffect, useRef } from "react";
import {
  FolderLock, Upload, Shield, CheckCircle, AlertTriangle,
  Loader2, Hash, Clock, User, Trash2, RefreshCw,
  FileText, Image, Film, Database, File, ChevronDown,
  Link, Download
} from "lucide-react";

interface CustodyEntry {
  action: string;
  actor: string;
  actorRole: string;
  timestamp: string;
  note: string;
  ipAddress: string;
}

interface Evidence {
  id: string;
  incident_id: string;
  file_name: string;
  file_url: string;
  file_type: string;
  file_size: number;
  sha256_hash: string;
  chain_of_custody: CustodyEntry[];
  tags: string[];
  uploaded_at: string;
}

interface Incident {
  id: string;
  title: string;
}

const FILE_TYPE_ICON: Record<string, React.ElementType> = {
  screenshot: Image,
  log:        Database,
  document:   FileText,
  capture:    Film,
  malware:    AlertTriangle,
};

const FILE_TYPE_OPTS = [
  { value: "screenshot", label: "Screenshot / Photo" },
  { value: "log",        label: "Log File / Export" },
  { value: "document",   label: "Document (PDF/Word)" },
  { value: "capture",    label: "Network Capture" },
  { value: "malware",    label: "Malware Sample" },
];

const ACTION_COLORS: Record<string, string> = {
  UPLOADED:            "text-green-400 bg-green-500/10 border-green-500/25",
  REVIEWED:            "text-blue-400 bg-blue-500/10 border-blue-500/25",
  INTEGRITY_VERIFIED:  "text-[#FFD600] bg-[#FFD600]/10 border-[#FFD600]/25",
  INTEGRITY_FAILED:    "text-red-400 bg-red-500/10 border-red-500/25",
  TRANSFERRED:         "text-purple-400 bg-purple-500/10 border-purple-500/25",
};

function formatSize(bytes: number): string {
  if (bytes < 1024)       return `${bytes} B`;
  if (bytes < 1048576)    return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(2)} MB`;
}

export default function EvidenceVault() {
  const [incidents, setIncidents]       = useState<Incident[]>([]);
  const [selectedIncId, setSelectedIncId] = useState<string>("");
  const [evidence, setEvidence]         = useState<Evidence[]>([]);
  const [selectedEvd, setSelectedEvd]   = useState<Evidence | null>(null);
  const [loading, setLoading]           = useState(false);
  const [uploading, setUploading]       = useState(false);
  const [verifying, setVerifying]       = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<any>(null);
  const [error, setError]               = useState("");
  const [custodyNote, setCustodyNote]   = useState("");
  const [addingCustody, setAddingCustody] = useState(false);
  const [showUpload, setShowUpload]     = useState(false);

  // Upload form state
  const [uploadFile, setUploadFile]     = useState<File | null>(null);
  const [uploadType, setUploadType]     = useState("screenshot");
  const [uploadDesc, setUploadDesc]     = useState("");
  const [uploadTags, setUploadTags]     = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const token = () => sessionStorage.getItem("sentinel_token");
  const authH = (extra = {}) => ({ Authorization: `Bearer ${token()}`, ...extra });

  // Load incidents list
  useEffect(() => {
    fetch("/api/incidents", { headers: authH() })
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        const list = Array.isArray(data) ? data : (data.data || []);
        setIncidents(list.map((i: any) => ({ id: i.id, title: i.title })));
        if (list.length > 0 && !selectedIncId) setSelectedIncId(list[0].id);
      })
      .catch(() => {});
  }, []);

  // Load evidence when incident changes
  useEffect(() => {
    if (!selectedIncId) return;
    setLoading(true); setEvidence([]); setSelectedEvd(null); setVerifyResult(null);
    fetch(`/api/evidence/${selectedIncId}`, { headers: authH() })
      .then(r => r.ok ? r.json() : [])
      .then(data => setEvidence(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedIncId]);

  // ─── File Upload ──────────────────────────────────────────────────────────
  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile || !selectedIncId) return;
    setUploading(true); setError("");

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(uploadFile);
      });

      const res = await fetch(`/api/evidence/${selectedIncId}/upload`, {
        method: "POST",
        headers: authH({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          fileName:    uploadFile.name,
          fileType:    uploadType,
          fileData:    base64,
          description: uploadDesc,
          tags:        uploadTags.split(",").map(t => t.trim()).filter(Boolean),
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        setError(d.message || "Upload failed.");
      } else {
        // Refresh evidence list
        setShowUpload(false);
        setUploadFile(null); setUploadDesc(""); setUploadTags("");
        const updated = await fetch(`/api/evidence/${selectedIncId}`, { headers: authH() }).then(r => r.json());
        setEvidence(Array.isArray(updated) ? updated : []);
      }
    } catch (err: any) {
      setError(err.message || "Upload failed.");
    } finally { setUploading(false); }
  };

  // ─── Integrity Verify ─────────────────────────────────────────────────────
  const verifyIntegrity = async (evdId: string) => {
    setVerifying(evdId); setVerifyResult(null);
    const res = await fetch(`/api/evidence/${selectedIncId}/${evdId}/verify`, {
      method: "POST", headers: authH()
    });
    const data = await res.json();
    setVerifyResult({ ...data, evdId });
    setVerifying(null);
    // Refresh custody log
    const updated = await fetch(`/api/evidence/${selectedIncId}`, { headers: authH() }).then(r => r.json());
    const updatedEvd = (Array.isArray(updated) ? updated : []).find((e: Evidence) => e.id === evdId);
    if (updatedEvd) setSelectedEvd(updatedEvd);
    setEvidence(Array.isArray(updated) ? updated : []);
  };

  // ─── Add Custody Entry ────────────────────────────────────────────────────
  const addCustody = async () => {
    if (!selectedEvd || !custodyNote.trim()) return;
    setAddingCustody(true);
    await fetch(`/api/evidence/${selectedIncId}/${selectedEvd.id}/custody`, {
      method: "POST",
      headers: authH({ "Content-Type": "application/json" }),
      body: JSON.stringify({ action: "REVIEWED", note: custodyNote }),
    });
    setCustodyNote("");
    const updated = await fetch(`/api/evidence/${selectedIncId}`, { headers: authH() }).then(r => r.json());
    const updatedEvd = (Array.isArray(updated) ? updated : []).find((e: Evidence) => e.id === selectedEvd.id);
    if (updatedEvd) setSelectedEvd(updatedEvd);
    setEvidence(Array.isArray(updated) ? updated : []);
    setAddingCustody(false);
  };

  const selectedInc = incidents.find(i => i.id === selectedIncId);

  return (
    <div className="space-y-5" id="evidence-vault">

      {/* ─── Header ─── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#0A0E1A] via-[#0d1428] to-[#0A0E1A] border border-purple-500/20 p-5">
        <div className="absolute -top-6 -right-6 w-40 h-40 bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center shrink-0">
              <FolderLock className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="font-bebas text-xl text-white tracking-widest">FORENSIC EVIDENCE VAULT</h2>
              <p className="text-[10px] text-slate-500 font-mono">SHA-256 integrity hashing · Immutable chain-of-custody · Legal-grade audit trail</p>
            </div>
          </div>
          <button
            id="upload-evidence-btn"
            onClick={() => setShowUpload(s => !s)}
            className="sm:ml-auto flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold border border-purple-500/40 text-purple-400 hover:bg-purple-500/10 transition shrink-0"
          >
            <Upload className="w-4 h-4" /> Upload Evidence
          </button>
        </div>
      </div>

      {/* ─── Incident Selector ─── */}
      <div className="card p-4 flex items-center gap-3">
        <Link className="w-4 h-4 text-slate-500 shrink-0" />
        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider shrink-0">Linked Incident:</label>
        <select
          value={selectedIncId}
          onChange={e => setSelectedIncId(e.target.value)}
          className="flex-1 bg-[#05080F] border border-white/10 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50 font-mono"
          id="evidence-incident-select"
        >
          {incidents.map(i => (
            <option key={i.id} value={i.id}>{i.id} — {i.title}</option>
          ))}
        </select>
        <span className="text-[10px] text-slate-600 font-mono shrink-0">{evidence.length} file{evidence.length !== 1 ? "s" : ""}</span>
      </div>

      {/* ─── Upload Form ─── */}
      {showUpload && (
        <form onSubmit={handleUpload} className="card p-5 border border-purple-500/20 space-y-4">
          <h3 className="font-grotesk font-bold text-sm text-purple-400 flex items-center gap-2">
            <Upload className="w-4 h-4" /> Upload New Evidence
          </h3>

          {/* File picker */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition ${
              uploadFile ? "border-purple-500/50 bg-purple-500/5" : "border-white/10 hover:border-purple-500/30"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.mp4,.log,.txt,.pcap,.zip"
              onChange={e => setUploadFile(e.target.files?.[0] || null)}
            />
            {uploadFile ? (
              <div className="space-y-1">
                <File className="w-8 h-8 mx-auto text-purple-400 mb-2" />
                <p className="text-sm font-bold text-white">{uploadFile.name}</p>
                <p className="text-xs text-slate-500">{formatSize(uploadFile.size)}</p>
              </div>
            ) : (
              <div className="space-y-1">
                <Upload className="w-8 h-8 mx-auto text-slate-600 mb-2" />
                <p className="text-sm text-slate-500">Click to select evidence file</p>
                <p className="text-xs text-slate-700">PDF, Image, Video, Log, PCAP — max 50MB</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Evidence Type</label>
              <select
                value={uploadType}
                onChange={e => setUploadType(e.target.value)}
                className="w-full bg-[#05080F] border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
              >
                {FILE_TYPE_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Tags (comma-separated)</label>
              <input
                type="text"
                value={uploadTags}
                onChange={e => setUploadTags(e.target.value)}
                placeholder="phishing, sim-swap, screenshot"
                className="w-full bg-[#05080F] border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Description / Note</label>
            <input
              type="text"
              value={uploadDesc}
              onChange={e => setUploadDesc(e.target.value)}
              placeholder="What does this file contain? How was it obtained?"
              className="w-full bg-[#05080F] border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-xs text-red-400">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {error}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!uploadFile || uploading}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold bg-purple-500/20 border border-purple-500/40 text-purple-300 hover:bg-purple-500/30 transition disabled:opacity-50"
            >
              {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading & Hashing...</> : <><Shield className="w-4 h-4" /> Upload & Compute SHA-256</>}
            </button>
            <button type="button" onClick={() => setShowUpload(false)} className="px-4 py-2.5 rounded-lg border border-white/10 text-slate-400 hover:text-slate-200 text-sm transition">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* ─── Evidence Grid + Detail ─── */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">

        {/* Evidence list */}
        <div className="xl:col-span-2 card p-5 space-y-3">
          <h3 className="font-grotesk font-bold text-sm text-white flex items-center gap-2 border-b border-white/5 pb-3">
            <FolderLock className="w-4 h-4 text-purple-400" />
            Evidence Files
            <span className="ml-auto text-[9px] font-mono text-slate-500">{evidence.length} item{evidence.length !== 1 ? "s" : ""}</span>
          </h3>

          {loading ? (
            <div className="text-center py-8 text-slate-600 text-xs">Loading evidence...</div>
          ) : evidence.length === 0 ? (
            <div className="text-center py-10 text-slate-600">
              <FolderLock className="w-8 h-8 mx-auto mb-2 opacity-20" />
              <p className="text-xs">No evidence files for this incident yet.</p>
              <button onClick={() => setShowUpload(true)} className="mt-3 text-purple-400 text-[10px] hover:underline">
                Upload the first file
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {evidence.map(evd => {
                const Icon = FILE_TYPE_ICON[evd.file_type] || File;
                return (
                  <button
                    key={evd.id}
                    id={`evd-${evd.id}`}
                    onClick={() => { setSelectedEvd(evd); setVerifyResult(null); }}
                    className={`w-full text-left flex items-center gap-3 rounded-xl border px-3 py-3 transition ${
                      selectedEvd?.id === evd.id
                        ? "border-purple-500/40 bg-purple-500/5"
                        : "border-white/5 hover:border-white/10 bg-[#05080F]/40"
                    }`}
                  >
                    <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20 shrink-0">
                      <Icon className="w-4 h-4 text-purple-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-white truncate">{evd.file_name}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[9px] text-slate-500 font-mono">{formatSize(evd.file_size)}</span>
                        <span className="text-[9px] text-slate-600">·</span>
                        <span className="text-[9px] text-purple-400 font-mono uppercase">{evd.file_type}</span>
                        <span className="text-[9px] text-slate-600">·</span>
                        <span className="text-[9px] text-slate-600">{evd.chain_of_custody?.length || 1} custody entries</span>
                      </div>
                    </div>
                    <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Evidence detail */}
        <div className="xl:col-span-3">
          {selectedEvd ? (
            <div className="card p-5 space-y-5 border border-purple-500/15">

              {/* File header */}
              <div className="flex items-start gap-3 border-b border-white/5 pb-4">
                <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/25 shrink-0">
                  {React.createElement(FILE_TYPE_ICON[selectedEvd.file_type] || File, { className: "w-5 h-5 text-purple-400" })}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-grotesk font-bold text-white text-sm">{selectedEvd.file_name}</h3>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <span className="text-[9px] text-purple-400 font-mono uppercase border border-purple-500/25 bg-purple-500/10 px-1.5 py-0.5 rounded">{selectedEvd.file_type}</span>
                    <span className="text-[9px] text-slate-500 font-mono">{formatSize(selectedEvd.file_size)}</span>
                    <span className="text-[9px] text-slate-600 font-mono">{new Date(selectedEvd.uploaded_at).toLocaleString()}</span>
                  </div>
                </div>
                <button onClick={() => setSelectedEvd(null)} className="text-slate-600 hover:text-slate-400 transition">
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>

              {/* SHA-256 Hash */}
              <div className="space-y-2">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Hash className="w-3 h-3" /> SHA-256 Integrity Hash
                </h4>
                <div className="flex items-center gap-2 bg-[#05080F] border border-white/5 rounded-xl p-3">
                  <code className="text-[9px] font-mono text-green-400 flex-1 break-all">{selectedEvd.sha256_hash}</code>
                  <button
                    id={`verify-btn-${selectedEvd.id}`}
                    onClick={() => verifyIntegrity(selectedEvd.id)}
                    disabled={!!verifying}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FFD600]/10 border border-[#FFD600]/25 text-[#FFD600] text-[10px] font-bold hover:bg-[#FFD600]/20 transition disabled:opacity-50"
                  >
                    {verifying === selectedEvd.id
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : <RefreshCw className="w-3 h-3" />}
                    Verify
                  </button>
                </div>

                {/* Verify result */}
                {verifyResult && verifyResult.evdId === selectedEvd.id && (
                  <div className={`flex items-start gap-2 rounded-xl px-3 py-2.5 border text-xs ${
                    verifyResult.verified
                      ? "bg-green-500/10 border-green-500/25 text-green-400"
                      : "bg-red-500/10 border-red-500/25 text-red-400"
                  }`}>
                    {verifyResult.verified
                      ? <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      : <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
                    <span>{verifyResult.message}</span>
                  </div>
                )}
              </div>

              {/* Tags */}
              {selectedEvd.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedEvd.tags.map((t, i) => (
                    <span key={i} className="text-[9px] font-mono text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded">
                      #{t}
                    </span>
                  ))}
                </div>
              )}

              {/* Chain of Custody */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Clock className="w-3 h-3" /> Chain of Custody ({selectedEvd.chain_of_custody?.length || 0} entries)
                </h4>

                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {(selectedEvd.chain_of_custody || []).map((entry, i) => (
                    <div key={i} className="flex items-start gap-2.5 text-[10px]">
                      <div className="flex flex-col items-center shrink-0 mt-0.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                        {i < (selectedEvd.chain_of_custody?.length ?? 0) - 1 && (
                          <div className="w-px flex-1 bg-purple-500/20 mt-1 min-h-[16px]" />
                        )}
                      </div>
                      <div className="flex-1 pb-2">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <span className={`font-bold uppercase text-[8px] px-1.5 py-0.5 rounded border font-mono ${ACTION_COLORS[entry.action] || "text-slate-400 bg-slate-500/10 border-slate-500/25"}`}>
                            {entry.action}
                          </span>
                          <span className="text-slate-400 font-mono">
                            <User className="w-2.5 h-2.5 inline mr-0.5" />{entry.actor}
                          </span>
                          <span className="text-slate-600">·</span>
                          <span className="text-slate-600 font-mono">{new Date(entry.timestamp).toLocaleString()}</span>
                        </div>
                        <p className="text-slate-400 italic">{entry.note}</p>
                        <p className="text-slate-700 font-mono text-[8px] mt-0.5">IP: {entry.ipAddress}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add custody entry */}
                <div className="flex gap-2 pt-2 border-t border-white/5">
                  <input
                    type="text"
                    value={custodyNote}
                    onChange={e => setCustodyNote(e.target.value)}
                    placeholder="Add custody note (e.g. Reviewed for court submission)…"
                    className="flex-1 bg-[#05080F] border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-purple-500/50"
                    id="custody-note-input"
                  />
                  <button
                    onClick={addCustody}
                    disabled={!custodyNote.trim() || addingCustody}
                    className="px-3 py-2 rounded-lg bg-purple-500/20 border border-purple-500/40 text-purple-300 text-xs font-bold hover:bg-purple-500/30 transition disabled:opacity-50"
                    id="add-custody-btn"
                  >
                    {addingCustody ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Add"}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="card p-12 border border-dashed border-white/10 text-center text-slate-600 h-full flex flex-col items-center justify-center">
              <FolderLock className="w-10 h-10 mx-auto mb-3 opacity-15" />
              <p className="text-sm font-bold text-slate-500 mb-1">Select an evidence file</p>
              <p className="text-xs max-w-xs">View SHA-256 hash, verify file integrity, and review the full chain-of-custody log</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
