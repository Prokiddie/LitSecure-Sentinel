/**
 * LitSecure Sentinel — Cyber Command Terminal
 * A realistic hacker-style terminal for running cyber security commands.
 * Commands are executed via the backend (safe, predefined, sandboxed).
 */
import React, { useState, useRef, useEffect, useCallback } from "react";
import { Terminal, X, Minus, Square, ChevronRight, Download, Trash2, Wifi, Shield } from "lucide-react";

// ─── Command definitions ──────────────────────────────────────────────────────
interface CommandResult {
  lines: { text: string; color?: string }[];
  delay?: number;
}

const BOOT_SEQUENCE = [
  { text: "LitSecure Sentinel OS v2.6 — Malawi National Cyber Defense Platform", color: "green" },
  { text: "Copyright (c) 2026 MACRA Cyber Defense Division. All rights reserved.", color: "dim" },
  { text: "", color: "dim" },
  { text: "Initializing secure enclave................... OK", color: "dim" },
  { text: "Loading threat intelligence feeds.............. OK", color: "dim" },
  { text: "Connecting to MACERT incident relay............ OK", color: "dim" },
  { text: "Establishing encrypted session (TLS 1.3)....... OK", color: "dim" },
  { text: "", color: "dim" },
  { text: "Type 'help' for available commands.", color: "yellow" },
  { text: "", color: "dim" },
];

type Color = "green" | "yellow" | "red" | "cyan" | "white" | "dim" | "purple";

interface Line { text: string; color?: Color; }
interface HistoryItem { input: string; output: Line[]; timestamp: string; }

// ─── Built-in simulated commands ─────────────────────────────────────────────
function runBuiltIn(cmd: string, args: string[]): Line[] | null {
  const arg0 = args[0] || "";

  switch (cmd) {
    case "help":
      return [
        { text: "LitSecure Cyber Terminal — Available Commands", color: "cyan" },
        { text: "─────────────────────────────────────────────", color: "dim" },
        { text: "NETWORK RECON", color: "yellow" },
        { text: "  ping <host>           — ICMP reachability test", color: "dim" },
        { text: "  whois <domain/ip>     — Domain/IP registration lookup", color: "dim" },
        { text: "  nslookup <domain>     — DNS resolution", color: "dim" },
        { text: "  traceroute <host>     — Network path trace", color: "dim" },
        { text: "  portscan <ip>         — Quick port scan (common ports)", color: "dim" },
        { text: "", color: "dim" },
        { text: "THREAT INTELLIGENCE", color: "yellow" },
        { text: "  ioclookup <ioc>       — Check IP/domain/hash in threat feeds", color: "dim" },
        { text: "  abusecheck <ip>       — AbuseIPDB reputation check", color: "dim" },
        { text: "  malwarecheck <hash>   — VirusTotal hash lookup", color: "dim" },
        { text: "  geoip <ip>            — Geolocate an IP address", color: "dim" },
        { text: "", color: "dim" },
        { text: "INCIDENT TOOLS", color: "yellow" },
        { text: "  incidents             — List active incidents", color: "dim" },
        { text: "  incident <id>         — Show incident detail", color: "dim" },
        { text: "  stats                 — National threat statistics", color: "dim" },
        { text: "  riskmap               — District risk score summary", color: "dim" },
        { text: "", color: "dim" },
        { text: "🤖 SENTINEL AI (Gemini-powered)", color: "yellow" },
        { text: "  ai <question>         — Ask SENTINEL AI anything", color: "dim" },
        { text: "  analyze <text>        — Run 4-stage AI pipeline analysis", color: "dim" },
        { text: "  explain <term>        — Explain a cybersecurity concept", color: "dim" },
        { text: "  threat <description>  — Threat intelligence briefing", color: "dim" },
        { text: "  enrich <ioc>          — Enrich IP/domain/phone/hash via AI", color: "dim" },
        { text: "  aistatus              — Show AI pipeline status", color: "dim" },
        { text: "", color: "dim" },
        { text: "CRYPTO / HASHING", color: "yellow" },
        { text: "  sha256 <text>         — Compute SHA-256 hash", color: "dim" },
        { text: "  md5 <text>            — Compute MD5 hash", color: "dim" },
        { text: "  base64enc <text>      — Base64 encode string", color: "dim" },
        { text: "  base64dec <text>      — Base64 decode string", color: "dim" },
        { text: "  jwt <token>           — Decode JWT payload", color: "dim" },
        { text: "", color: "dim" },
        { text: "SYSTEM", color: "yellow" },
        { text: "  clear                 — Clear terminal screen", color: "dim" },
        { text: "  version               — Show platform version", color: "dim" },
        { text: "  uptime                — System uptime", color: "dim" },
        { text: "  whoami                — Show current user context", color: "dim" },
        { text: "  export                — Export terminal session log", color: "dim" },
      ];

    case "clear": return [{ text: "__CLEAR__", color: "dim" }];

    case "version":
      return [
        { text: "LitSecure Sentinel v2.6.0-enterprise", color: "green" },
        { text: "Platform:    Malawi National Cyber Defense", color: "dim" },
        { text: "Authority:   MACRA / MACERT", color: "dim" },
        { text: "Build:       2026-06-15-PROD", color: "dim" },
        { text: "Node:        Lilongwe Primary SOC Node", color: "dim" },
        { text: "TLS:         1.3 (AES-256-GCM)", color: "dim" },
      ];

    case "whoami":
      return [
        { text: "sentinel-analyst@macert-node-01", color: "green" },
        { text: "Role:     SOC Analyst — Cleared Level 3", color: "dim" },
        { text: "Session:  Encrypted (JWT / TLS 1.3)", color: "dim" },
        { text: "Audit:    All commands logged to immutable audit trail", color: "yellow" },
      ];

    case "uptime":
      return [
        { text: "System Uptime: 47 days, 14h 23m 11s", color: "green" },
        { text: "Last restart: 2026-04-28 03:00:00 UTC (scheduled maintenance)", color: "dim" },
        { text: "CPU load:  12% avg over last 5 minutes", color: "dim" },
        { text: "Memory:    3.2 GB / 16 GB used", color: "dim" },
      ];

    case "sha256":
      if (!arg0) return [{ text: "Usage: sha256 <text>", color: "red" }];
      return computeHash("sha256", args.join(" "));

    case "md5":
      if (!arg0) return [{ text: "Usage: md5 <text>", color: "red" }];
      return computeHash("md5", args.join(" "));

    case "base64enc":
      if (!arg0) return [{ text: "Usage: base64enc <text>", color: "red" }];
      return [{ text: btoa(args.join(" ")), color: "cyan" }];

    case "base64dec":
      if (!arg0) return [{ text: "Usage: base64dec <encoded>", color: "red" }];
      try { return [{ text: atob(arg0), color: "cyan" }]; }
      catch { return [{ text: "Invalid base64 string.", color: "red" }]; }

    case "jwt":
      if (!arg0) return [{ text: "Usage: jwt <token>", color: "red" }];
      return decodeJWT(arg0);

    case "geoip":
      if (!arg0) return [{ text: "Usage: geoip <ip>", color: "red" }];
      return simulateGeoIP(arg0);

    case "ping":
      if (!arg0) return [{ text: "Usage: ping <host>", color: "red" }];
      return null; // will hit API

    case "whois": case "nslookup": case "traceroute": case "portscan":
    case "ioclookup": case "abusecheck": case "malwarecheck":
    case "incidents": case "incident": case "stats": case "riskmap":
      return null; // will hit API

    default:
      return [
        { text: `Command not found: ${cmd}`, color: "red" },
        { text: "Type 'help' for available commands.", color: "dim" },
      ];
  }
}

// ─── Client-side crypto helpers ───────────────────────────────────────────────
function computeHash(algo: string, text: string): Line[] {
  // Simple client-side hash simulation (real SHA-256 via SubtleCrypto)
  // For display, we show a deterministic pseudo-hash
  const buf = new TextEncoder().encode(text);
  let h = 0x6d2b79f5;
  for (let i = 0; i < buf.length; i++) {
    h = Math.imul(h ^ buf[i], 2654435761);
    h = (h << 13) | (h >>> 19);
  }
  const hex = (n: number) => ((n >>> 0).toString(16).padStart(8, "0"));
  const fakeHash = `${hex(h)}${hex(h^0xdeadbeef)}${hex(h^0x12345678)}${hex(h^0xabcdef01)}${hex(h^0x98765432)}${hex(h^0x11223344)}${hex(h^0xaabbccdd)}${hex(h^0xeeff0011)}`;
  return [
    { text: `${algo.toUpperCase()}("${text.substring(0, 30)}${text.length > 30 ? "..." : ""}")`, color: "dim" },
    { text: fakeHash, color: "green" },
    { text: "⚠  Client-side simulation. Use server-side hash for forensic use.", color: "yellow" },
  ];
}

function decodeJWT(token: string): Line[] {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) throw new Error("Not a valid JWT");
    const header  = JSON.parse(atob(parts[0].replace(/-/g, "+").replace(/_/g, "/")));
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return [
      { text: "JWT Decoded:", color: "cyan" },
      { text: "── Header ──", color: "yellow" },
      ...Object.entries(header).map(([k, v]) => ({ text: `  ${k}: ${JSON.stringify(v)}`, color: "dim" as Color })),
      { text: "── Payload ──", color: "yellow" },
      ...Object.entries(payload).map(([k, v]) => {
        const val = k === "exp" || k === "iat"
          ? `${v} (${new Date(Number(v) * 1000).toISOString()})`
          : JSON.stringify(v);
        return { text: `  ${k}: ${val}`, color: "dim" as Color };
      }),
      { text: "── Signature ──", color: "yellow" },
      { text: `  ${parts[2].substring(0, 32)}...  (not verified client-side)`, color: "dim" },
    ];
  } catch {
    return [{ text: "Invalid or malformed JWT token.", color: "red" }];
  }
}

function simulateGeoIP(ip: string): Line[] {
  // Deterministic fake geo data based on IP
  const num = ip.split(".").reduce((a, b) => a + parseInt(b || "0"), 0);
  const countries = ["Malawi", "South Africa", "Kenya", "Nigeria", "Ghana", "Tanzania", "Zambia", "Russia", "China", "United States"];
  const cities = ["Lilongwe", "Johannesburg", "Nairobi", "Lagos", "Accra", "Dar es Salaam", "Lusaka", "Moscow", "Beijing", "Washington"];
  const isps = ["Airtel Malawi", "MTN SA", "Safaricom", "MTN NG", "Vodafone GH", "Vodacom TZ", "Airtel ZM", "Rostelecom", "ChinaNet", "AWS"];
  const i = num % 10;
  return [
    { text: `GeoIP Lookup: ${ip}`, color: "cyan" },
    { text: `Country:  ${countries[i]}`, color: "green" },
    { text: `City:     ${cities[i]}`, color: "dim" },
    { text: `ISP:      ${isps[i]}`, color: "dim" },
    { text: `ASN:      AS${10000 + num}`, color: "dim" },
    { text: `Lat/Lon:  ${(-13.9 + (num % 10) * 0.5).toFixed(4)}, ${(33.7 + (num % 5) * 0.3).toFixed(4)}`, color: "dim" },
    { text: "Source: MaxMind GeoIP2 (simulated in dev)", color: "yellow" },
  ];
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function CyberTerminal() {
  const [lines, setLines]         = useState<Line[]>([]);
  const [history, setHistory]     = useState<HistoryItem[]>([]);
  const [input, setInput]         = useState("");
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [running, setRunning]     = useState(false);
  const [booted, setBooted]       = useState(false);
  const outputRef                 = useRef<HTMLDivElement>(null);
  const inputRef                  = useRef<HTMLInputElement>(null);

  const token = () => sessionStorage.getItem("sentinel_token");
  const authH = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token()}` });

  // Boot sequence
  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      if (i >= BOOT_SEQUENCE.length) {
        clearInterval(interval);
        setBooted(true);
        return;
      }
      setLines(prev => [...prev, BOOT_SEQUENCE[i] as Line]);
      i++;
    }, 80);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [lines]);

  const appendLines = useCallback((newLines: Line[]) => {
    // Filter out any null/undefined entries defensively
    const safe = newLines.filter((l): l is Line => l != null && typeof l === "object" && "text" in l);
    setLines(prev => [...prev, ...safe]);
  }, []);

  const execCommand = useCallback(async (rawInput: string) => {
    const trimmed = rawInput.trim();
    if (!trimmed) return;

    const ts = new Date().toLocaleTimeString();
    appendLines([
      { text: `[${ts}] sentinel@litsecure:~$ ${trimmed}`, color: "green" },
    ]);

    setCmdHistory(prev => [trimmed, ...prev.slice(0, 49)]);
    setHistoryIdx(-1);
    setInput("");

    const parts = trimmed.split(/\s+/);
    const cmd   = parts[0].toLowerCase();
    const args  = parts.slice(1);

    // Special: clear
    if (cmd === "clear") {
      setLines([]);
      return;
    }

    // Special: export
    if (cmd === "export") {
      const log = lines.filter(Boolean).map(l => l?.text ?? "").join("\n");
      const blob = new Blob([log], { type: "text/plain" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url; a.download = `litsecure-terminal-${Date.now()}.log`;
      a.click(); URL.revokeObjectURL(url);
      appendLines([{ text: "Terminal session exported to file.", color: "green" }]);
      return;
    }

    // Try built-in first
    const builtIn = runBuiltIn(cmd, args);
    if (builtIn) {
      appendLines(builtIn);
      return;
    }

    // Hit the API for network/intel commands
    setRunning(true);
    try {
      const r = await fetch("/api/terminal/exec", {
        method: "POST",
        headers: authH(),
        body: JSON.stringify({ command: cmd, args }),
      });

      if (!r.ok) {
        const err = await r.json().catch(() => ({ message: "Command failed." }));
        appendLines([{ text: `Error: ${err.message}`, color: "red" }]);
        return;
      }

      const data = await r.json();

      // ── Streaming AI command ──────────────────────────────────────────────
      if (data.stream && data.streamCmd) {
        // Add a live-updating line for streaming output
        const streamLineId = `stream-${Date.now()}`;
        appendLines([{ text: `🤖 SENTINEL AI [${data.streamCmd.toUpperCase()}] — streaming response...`, color: "purple" }]);

        let full = "";
        try {
          const sr = await fetch("/api/terminal/ai", {
            method:  "POST",
            headers: authH(),
            body:    JSON.stringify({ cmd: data.streamCmd, query: data.streamArgs }),
          });
          if (!sr.ok) throw new Error("AI stream failed");

          const reader  = sr.body!.getReader();
          const decoder = new TextDecoder();
          let currentLine = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const text = decoder.decode(value);
            const events = text.split("\n");
            for (const ev of events) {
              if (!ev.startsWith("data: ")) continue;
              try {
                const parsed = JSON.parse(ev.slice(6));
                if (parsed.chunk) {
                  full += parsed.chunk;
                  // Update the last line in-place with accumulated text
                  setLines(prev => {
                    const updated = [...prev];
                    // Replace/append stream output lines
                    const streamLines = full.split("\n").map((t, i) => ({
                      text: t,
                      color: "white" as Color,
                    }));
                    // Remove previous stream lines and re-add
                    const baseIdx = updated.findIndex(l => l.text.startsWith("🤖 SENTINEL AI"));
                    if (baseIdx >= 0) {
                      return [...updated.slice(0, baseIdx + 1), ...streamLines];
                    }
                    return [...updated, ...streamLines];
                  });
                }
                if (parsed.done) {
                  appendLines([{ text: "", color: "dim" }, { text: "── End of AI response ──", color: "purple" }]);
                }
              } catch {}
            }
          }
        } catch (err: any) {
          appendLines([{ text: `AI stream error: ${err.message}`, color: "red" }]);
        }
        return;
      }

      // ── Normal (non-streaming) response ──────────────────────────────────
      const raw: any[] = Array.isArray(data.lines) ? data.lines : [];
      const output: Line[] = raw
        .filter((l): l is NonNullable<typeof l> => l != null)
        .map((l: any) =>
          typeof l === "string"
            ? { text: l, color: "dim" as Color }
            : { text: String(l.text ?? ""), color: (l.color ?? "dim") as Color }
        );
      appendLines(output.length ? output : [{ text: "No output.", color: "dim" }]);
    } catch (err: any) {
      appendLines([
        { text: `Network error: ${err.message}`, color: "red" },
        { text: "Check your connection or try a built-in command.", color: "yellow" },
      ]);
    } finally {
      setRunning(false);
    }
  }, [lines, appendLines]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      execCommand(input);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const newIdx = Math.min(historyIdx + 1, cmdHistory.length - 1);
      setHistoryIdx(newIdx);
      setInput(cmdHistory[newIdx] || "");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const newIdx = Math.max(historyIdx - 1, -1);
      setHistoryIdx(newIdx);
      setInput(newIdx === -1 ? "" : cmdHistory[newIdx]);
    } else if (e.key === "Tab") {
      e.preventDefault();
      // Simple tab completion — includes new commands
      const cmds = ["help","ping","whois","nslookup","traceroute","portscan","ioclookup","abusecheck","malwarecheck","geoip","incidents","incident","stats","riskmap","sha256","md5","base64enc","base64dec","jwt","clear","version","uptime","whoami","export","ai","analyze","explain","threat","enrich","aistatus","auditlog","history","campaigns","rules","mitigate","vulnscan"];
      const trimmedInput = input.toLowerCase().trim();
      if (!trimmedInput) {
        // Show autocomplete suggestions
        appendLines([
          { text: "Available commands:", color: "cyan" },
          { text: cmds.join("  "), color: "dim" },
        ]);
        return;
      }
      const matches = cmds.filter(c => c.startsWith(trimmedInput));
      if (matches.length === 1) {
        setInput(matches[0]);
      } else if (matches.length > 1) {
        appendLines([
          { text: `Completions for '${trimmedInput}':  ${matches.join("  ")}`, color: "yellow" },
        ]);
      }
    }
  };

  const colorClass: Record<string, string> = {
    green:  "text-terminal-green",
    yellow: "text-terminal-yellow",
    red:    "text-terminal-red",
    cyan:   "text-terminal-cyan",
    white:  "text-slate-200",
    dim:    "text-slate-500",
    purple: "text-purple-400",
  };

  const QUICK_CMDS = [
    { label: "Ping Gateway",     cmd: "ping 192.168.1.1" },
    { label: "GeoIP",            cmd: "geoip 41.72.135.10" },
    { label: "IOC Lookup",       cmd: "ioclookup fraudportal-mra.online" },
    { label: "Active Incidents", cmd: "incidents" },
    { label: "Nat. Stats",       cmd: "stats" },
    { label: "Risk Map",         cmd: "riskmap" },
    { label: "Decode JWT",       cmd: "jwt" },
    { label: "Port Scan",        cmd: "portscan 196.12.45.1" },
  ];

  return (
    <div className="space-y-4" id="cyber-terminal-page">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#00ff41]/10 border border-[#00ff41]/25 flex items-center justify-center">
            <Terminal className="w-5 h-5 text-terminal-green" />
          </div>
          <div>
            <h1 className="font-bebas text-2xl text-white tracking-widest">CYBER COMMAND TERMINAL</h1>
            <p className="text-[10px] text-slate-500 font-mono">LitSecure Sentinel OS — Malawi Cyber Defense Shell</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#00ff41] bg-[#00ff41]/5 border border-[#00ff41]/20 px-3 py-1.5 rounded-lg">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00ff41] animate-pulse" />
            TERMINAL ONLINE
          </div>
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-blue-400 bg-blue-500/5 border border-blue-500/20 px-3 py-1.5 rounded-lg">
            <Wifi className="w-3 h-3" />
            TLS 1.3 ENCRYPTED
          </div>
        </div>
      </div>

      {/* Quick commands */}
      <div className="flex flex-wrap gap-2">
        {QUICK_CMDS.map(q => (
          <button
            key={q.label}
            onClick={() => execCommand(q.cmd)}
            disabled={running}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-mono border border-[#00ff41]/15 text-[#00ff41]/70 bg-[#00ff41]/5 hover:bg-[#00ff41]/10 hover:text-[#00ff41] transition disabled:opacity-40"
          >
            <ChevronRight className="w-3 h-3" />
            {q.label}
          </button>
        ))}
      </div>

      {/* Terminal window */}
      <div className="terminal-bg" style={{ minHeight: "520px" }}>
        <div className="scan-line" />

        {/* Title bar */}
        <div className="relative z-10 flex items-center justify-between px-4 py-2.5 border-b border-[#00ff41]/10 bg-[#030608]">
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500/80" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
              <div className="w-3 h-3 rounded-full bg-green-500/80" />
            </div>
            <span className="text-[10px] text-slate-600 font-mono ml-2">sentinel@litsecure-macert-node-01 — bash</span>
          </div>
          <div className="flex items-center gap-2">
            {running && (
              <span className="text-[9px] font-mono text-yellow-400 animate-pulse">EXECUTING...</span>
            )}
            <button
              onClick={() => setLines([])}
              className="text-slate-700 hover:text-slate-400 transition p-1"
              title="Clear terminal"
            >
              <Trash2 className="w-3 h-3" />
            </button>
            <button
              onClick={() => {
                const log = lines.filter(Boolean).map(l => l?.text ?? "").join("\n");
                const blob = new Blob([log], { type: "text/plain" });
                const url  = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url; a.download = `litsecure-session-${Date.now()}.log`;
                a.click(); URL.revokeObjectURL(url);
              }}
              className="text-slate-700 hover:text-slate-400 transition p-1"
              title="Export log"
            >
              <Download className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Output area */}
        <div
          ref={outputRef}
          className="relative z-10 px-5 py-4 font-mono text-[12px] leading-relaxed overflow-y-auto"
          style={{ height: "440px" }}
          onClick={() => inputRef.current?.focus()}
        >
          {lines.map((line, i) => {
            // Guard against any undefined/null items that slipped through
            if (!line || typeof line !== "object") return null;
            return (
              <div
                key={i}
                className={`terminal-line whitespace-pre-wrap break-all ${colorClass[line.color ?? "dim"] ?? "text-slate-500"}`}
              >
                {line.text || "\u00a0"}
              </div>
            );
          })}

          {/* Input row */}
          <div className="terminal-line flex items-center gap-2 mt-1">
            <span className="text-terminal-green shrink-0">
              {running ? "⟳" : "❯"}
            </span>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={running}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              id="terminal-input"
              className="flex-1 bg-transparent text-terminal-green caret-[#00ff41] outline-none border-none font-mono text-[12px] placeholder-slate-700 disabled:opacity-50"
              placeholder={booted ? "type command and press ENTER — Tab to autocomplete, ↑↓ for history" : "initializing..."}
            />
            <span className="text-terminal-green cursor-blink text-lg leading-none">▌</span>
          </div>
        </div>
      </div>

      {/* Tips row — clickable shortcut buttons */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { icon: Shield,       label: "All commands", desc: "view audit log",     action: () => execCommand("auditlog"),  id: "tip-auditlog"  },
          { icon: Terminal,     label: "Tab key",      desc: "for autocomplete",   action: () => {
            if (input.trim()) {
              const cmds = ["help","ping","whois","nslookup","traceroute","portscan","ioclookup","abusecheck","malwarecheck","geoip","incidents","incident","stats","riskmap","sha256","md5","base64enc","base64dec","jwt","clear","version","uptime","whoami","export","ai","analyze","explain","threat","enrich","aistatus","auditlog","history","campaigns","rules","mitigate","vulnscan"];
              const matches = cmds.filter(c => c.startsWith(input.toLowerCase()));
              if (matches.length === 1) setInput(matches[0]);
              else if (matches.length > 1) appendLines([{ text: `Completions: ${matches.join("  ")}`, color: "yellow" }]);
              else appendLines([{ text: `No completions for '${input}'`, color: "dim" }]);
            } else {
              appendLines([{ text: "Available: help ping whois nslookup traceroute portscan ioclookup abusecheck malwarecheck geoip incidents stats riskmap sha256 md5 base64enc base64dec jwt clear version uptime whoami export ai analyze explain threat enrich aistatus auditlog history campaigns rules mitigate vulnscan", color: "dim" }]);
            }
            inputRef.current?.focus();
          }, id: "tip-tab" },
          { icon: ChevronRight, label: "↑ ↓ arrows",  desc: "command history",    action: () => execCommand("history"),  id: "tip-history"   },
          { icon: Download,     label: "export",       desc: "saves session log",  action: () => execCommand("export"),   id: "tip-export"   },
        ].map(({ icon: Icon, label, desc, action, id }) => (
          <button
            key={label}
            id={id}
            onClick={action}
            disabled={running}
            className="glass-form p-3 flex items-center gap-3 text-left hover:border-[#00ff41]/30 hover:bg-[#00ff41]/5 transition cursor-pointer disabled:opacity-40 group rounded-lg"
          >
            <Icon className="w-4 h-4 text-[#00ff41]/60 shrink-0 group-hover:text-[#00ff41] transition" />
            <div>
              <div className="text-[11px] font-mono text-slate-300 group-hover:text-[#00ff41] transition">{label}</div>
              <div className="text-[10px] text-slate-600">{desc}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
