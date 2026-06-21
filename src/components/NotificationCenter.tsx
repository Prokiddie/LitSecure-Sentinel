/**
 * LitSecure Sentinel — Notification Center v2
 *
 * Real-time notifications via authenticated WebSocket connections.
 * Falls back to polling every 30s if WebSocket connection drops.
 * Fires native browser push notifications for critical/high priority items.
 * Supports all new event types: EDR, social, SIM swap, IOCs, public reports, KB.
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Bell, X, CheckCheck, AlertTriangle, Shield,
  Zap, FileText, Lock, TrendingUp, Info, AlertCircle,
  ChevronRight, Monitor, Radio, Phone, Globe,
  Brain, MessageSquare, Activity, RefreshCw
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Notification {
  id: string;
  type: string;
  priority: "low" | "medium" | "high" | "critical";
  title: string;
  message: string;
  link?: string;
  entity_id?: string;
  is_read: number;
  created_at: string;
}

interface Props { onNavigate?: (tab: string) => void; }

// ─── Config maps ──────────────────────────────────────────────────────────────

const TYPE_META: Record<string, { icon: React.ElementType; label: string }> = {
  incident_new:          { icon: Shield,        label: "New Incident" },
  incident_update:       { icon: FileText,       label: "Incident Update" },
  incident_critical:     { icon: AlertTriangle,  label: "Critical Incident" },
  incident_status_change:{ icon: Activity,       label: "Status Change" },
  campaign_detected:     { icon: Zap,            label: "Campaign" },
  lockdown_activated:    { icon: Lock,           label: "Lockdown" },
  lockdown_deactivated:  { icon: Lock,           label: "Lockdown Lifted" },
  evidence_uploaded:     { icon: FileText,       label: "Evidence" },
  risk_score_critical:   { icon: TrendingUp,     label: "Risk Score" },
  edr_alert:             { icon: Monitor,        label: "EDR Alert" },
  edr_quarantine:        { icon: Monitor,        label: "Quarantine" },
  social_threat:         { icon: Radio,          label: "Social Threat" },
  sim_swap_cluster:      { icon: Phone,          label: "SIM Swap" },
  threat_intel_ioc:      { icon: Globe,          label: "New IOC" },
  kb_pending_approval:   { icon: Brain,          label: "KB Pending" },
  public_report:         { icon: MessageSquare,  label: "Public Report" },
  system_alert:          { icon: Info,           label: "System Alert" },
  audit_warning:         { icon: AlertCircle,    label: "Audit Warning" },
};

const PRIORITY_STYLE: Record<string, string> = {
  critical: "border-l-red-500    bg-red-500/5",
  high:     "border-l-orange-500 bg-orange-500/5",
  medium:   "border-l-[#FFD600] bg-[#FFD600]/5",
  low:      "border-l-blue-500   bg-blue-500/5",
};

const PRIORITY_DOT: Record<string, string> = {
  critical: "bg-red-500",
  high:     "bg-orange-400",
  medium:   "bg-[#FFD600]",
  low:      "bg-blue-400",
};

const ICON_COLOR: Record<string, string> = {
  critical: "text-red-400",
  high:     "text-orange-400",
  medium:   "text-[#FFD600]",
  low:      "text-blue-400",
};

const PRIORITY_BADGE: Record<string, string> = {
  critical: "bg-red-500/20 text-red-400 border-red-500/30",
  high:     "bg-orange-500/20 text-orange-400 border-orange-500/30",
  medium:   "bg-[#FFD600]/15 text-[#FFD600] border-[#FFD600]/30",
  low:      "bg-blue-500/15 text-blue-400 border-blue-500/30",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Browser push helper ──────────────────────────────────────────────────────

async function requestPushPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

function browserPush(title: string, message: string, priority: string): void {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  if (!["critical", "high"].includes(priority)) return; // only push critical/high
  try {
    const n = new Notification(`🛡️ SENTINEL: ${title}`, {
      body: message,
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      tag: `sentinel-${Date.now()}`,
      requireInteraction: priority === "critical",
    });
    n.onclick = () => { window.focus(); n.close(); };
    if (priority !== "critical") setTimeout(() => n.close(), 8000);
  } catch {}
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function NotificationCenter({ onNavigate }: Props) {
  const [open,         setOpen]         = useState(false);
  const [notifs,       setNotifs]       = useState<Notification[]>([]);
  const [unread,       setUnread]       = useState(0);
  const [filter,       setFilter]       = useState<"all" | "unread">("unread");
  const [wsStatus,     setWsStatus]     = useState<"connecting" | "live" | "polling">("connecting");
  const [newFlash,     setNewFlash]     = useState(false); // brief flash on new notif
  const dropRef      = useRef<HTMLDivElement>(null);
  const wsRef        = useRef<WebSocket | null>(null);
  const pollRef      = useRef<ReturnType<typeof setInterval> | null>(null);

  const token = () => sessionStorage.getItem("sentinel_token");
  const authH = () => ({ Authorization: `Bearer ${token()}` });

  // ─── Fetch all notifications ────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    try {
      const r = await fetch("/api/notifications", { headers: authH() });
      if (r.ok) {
        const d = await r.json();
        setNotifs(d.notifications || []);
        setUnread(d.unreadCount || 0);
      }
    } catch {}
  }, []);

  // ─── Handle incoming notification ──────────────────────────────────────────
  const handleIncoming = useCallback((data: any) => {
    // __type: "initial" means the server is sending the backlog on connect
    if (data.__type === "initial") {
      setNotifs(prev => {
        const existingIds = new Set(prev.map(n => n.id));
        const newItems = (data.items as Notification[]).filter(n => !existingIds.has(n.id));
        return newItems.length > 0 ? [...newItems, ...prev] : prev;
      });
      setUnread(data.items?.filter((n: Notification) => n.is_read === 0).length || 0);
      return;
    }

    // Regular notification push
    const notif = data as Notification;
    setNotifs(prev => {
      if (prev.some(n => n.id === notif.id)) return prev; // dedup
      return [notif, ...prev];
    });
    setUnread(c => c + 1);

    // Flash the bell
    setNewFlash(true);
    setTimeout(() => setNewFlash(false), 2000);

    // Browser push for critical/high
    browserPush(notif.title, notif.message, notif.priority);
  }, []);

  // ─── WebSocket connection ───────────────────────────────────────────────────
  const connectWS = useCallback(async () => {
    if (!token()) return;
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }

    setWsStatus("connecting");

    try {
      // 1. Get short-lived stream token
      const handshakeRes = await fetch("/api/notifications/handshake", {
        method: "POST",
        headers: { Authorization: `Bearer ${token()}` },
      });

      if (!handshakeRes.ok) {
        if (handshakeRes.status === 401 || handshakeRes.status === 403) {
          // Auth error — fall back to polling, don't retry WS until user re-logs in
          setWsStatus("polling");
          if (!pollRef.current) pollRef.current = setInterval(fetchAll, 30000);
          return;
        }
        throw new Error("Handshake request failed");
      }

      const { streamToken } = await handshakeRes.json();

      // 2. Open WebSocket connection
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws/notifications?token=${encodeURIComponent(streamToken)}`;
      
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsStatus("live");
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === "INITIAL_NOTIFICATIONS") {
            handleIncoming({ __type: "initial", items: msg.items });
          } else if (msg.type === "NOTIFICATION") {
            handleIncoming(msg.payload);
          }
        } catch (err) {
          console.error("Failed to parse WebSocket message:", err);
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        setWsStatus("polling");
        // Fall back to 30s polling
        if (!pollRef.current) {
          pollRef.current = setInterval(fetchAll, 30000);
        }
        // Retry WS connection after 15s
        setTimeout(connectWS, 15000);
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch (err) {
      setWsStatus("polling");
      if (!pollRef.current) {
        pollRef.current = setInterval(fetchAll, 30000);
      }
      setTimeout(connectWS, 15000);
    }
  }, [fetchAll, handleIncoming]);


  // ─── Init ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchAll();           // immediate fetch
    connectWS();          // open WebSocket connection
    requestPushPermission().catch(() => {}); // ask for browser push

    return () => {
      wsRef.current?.close();
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // ─── Close on outside click ─────────────────────────────────────────────────
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // ─── Actions ────────────────────────────────────────────────────────────────
  const markRead = async (id: string) => {
    await fetch(`/api/notifications/${id}/read`, { method: "POST", headers: authH() });
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, is_read: 1 } : n));
    setUnread(c => Math.max(0, c - 1));
  };

  const markAllRead = async () => {
    await fetch("/api/notifications/read-all", { method: "POST", headers: authH() });
    setNotifs(prev => prev.map(n => ({ ...n, is_read: 1 })));
    setUnread(0);
  };

  const handleClick = (n: Notification) => {
    if (!n.is_read) markRead(n.id);
    if (n.link && onNavigate) { onNavigate(n.link.replace("#", "")); setOpen(false); }
  };

  const displayed = filter === "unread" ? notifs.filter(n => n.is_read === 0) : notifs;

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="relative" ref={dropRef}>

      {/* ── Bell Button ── */}
      <button
        id="notification-bell-btn"
        onClick={() => { setOpen(o => !o); if (!open) fetchAll(); }}
        className={`relative flex items-center justify-center w-9 h-9 rounded-xl border transition ${
          newFlash
            ? "bg-[#FFD600]/20 border-[#FFD600]/50 scale-110"
            : "bg-[#0A0E1A] border-white/10 hover:border-white/20"
        }`}
        aria-label="Notifications"
      >
        <Bell className={`w-4 h-4 transition ${newFlash ? "text-[#FFD600]" : "text-slate-400"}`} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white px-1 animate-pulse">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {/* ── Dropdown ── */}
      {open && (
        <div
          className="absolute right-0 top-12 w-[400px] max-h-[560px] flex flex-col rounded-2xl border border-white/12 shadow-2xl z-50 overflow-hidden"
          style={{ background: "rgba(5,8,15,0.98)", backdropFilter: "blur(24px)" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/8 shrink-0">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-[#FFD600]" />
              <span className="text-sm font-bold text-white">Notifications</span>
              {unread > 0 && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
                  {unread} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* WS status indicator */}
              <span className={`flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded border ${
                wsStatus === "live"
                  ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                  : wsStatus === "polling"
                  ? "text-yellow-400 border-yellow-500/30 bg-yellow-500/10"
                  : "text-slate-500 border-white/10"
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  wsStatus === "live" ? "bg-emerald-400 animate-pulse" :
                  wsStatus === "polling" ? "bg-yellow-400" : "bg-slate-500 animate-pulse"
                }`} />
                {wsStatus === "live" ? "LIVE" : wsStatus === "polling" ? "POLLING" : "…"}
              </span>
              <button onClick={fetchAll} title="Refresh" className="text-slate-500 hover:text-slate-300 transition">
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              {unread > 0 && (
                <button onClick={markAllRead} className="flex items-center gap-1 text-[9px] font-mono text-slate-400 hover:text-[#FFD600] transition" id="mark-all-read-btn">
                  <CheckCheck className="w-3 h-3" /> Mark all read
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-slate-600 hover:text-slate-400 transition">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Filter tabs */}
          <div className="flex border-b border-white/8 shrink-0">
            {(["unread", "all"] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-wider transition ${
                  filter === f ? "text-[#FFD600] border-b-2 border-[#FFD600]" : "text-slate-600 hover:text-slate-400"
                }`}>
                {f === "unread" ? `Unread (${unread})` : `All (${notifs.length})`}
              </button>
            ))}
          </div>

          {/* List */}
          <div className="overflow-y-auto flex-1">
            {displayed.length === 0 ? (
              <div className="py-12 text-center">
                <Bell className="w-8 h-8 mx-auto mb-3 text-slate-700" />
                <p className="text-xs text-slate-600 font-mono">
                  {filter === "unread" ? "No unread notifications" : "No notifications yet"}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {displayed.map(n => {
                  const meta   = TYPE_META[n.type] || { icon: Info, label: n.type };
                  const Icon   = meta.icon;
                  const unread = n.is_read === 0;
                  return (
                    <button key={n.id} id={`notif-${n.id}`} onClick={() => handleClick(n)}
                      className={`w-full text-left px-4 py-3 border-l-2 transition hover:bg-white/3 ${
                        unread ? PRIORITY_STYLE[n.priority] : "border-l-transparent opacity-55"
                      }`}>
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 shrink-0 ${unread ? ICON_COLOR[n.priority] : "text-slate-600"}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                             <span className="text-xs font-bold text-white truncate">{n.title}</span>
                            {unread && (
                              <span className={`text-[8px] font-bold font-mono px-1 py-0.5 rounded border uppercase ${PRIORITY_BADGE[n.priority]}`}>
                                {n.priority}
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-400 leading-relaxed line-clamp-2">{n.message}</p>
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className="text-[9px] font-mono text-slate-600">{timeAgo(n.created_at)}</span>
                            <span className="text-[9px] font-mono text-slate-700">·</span>
                            <span className="text-[9px] font-mono text-slate-700">{meta.label}</span>
                            {n.link && (
                              <span className="flex items-center gap-0.5 text-[9px] text-[#FFD600]/60 hover:text-[#FFD600] ml-auto">
                                Go to <ChevronRight className="w-2.5 h-2.5" />
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-white/8 px-4 py-2.5 shrink-0 flex items-center justify-between">
            <p className="text-[9px] text-slate-600 font-mono">
              {wsStatus === "live" ? "Real-time · WS connected" : "Polling every 30s"}
            </p>
            <p className="text-[9px] text-slate-700 font-mono">{notifs.length} total</p>
          </div>
        </div>
      )}
    </div>
  );
}
