import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Bot, Send, User, Loader2, Sparkles, RefreshCw,
  Shield, AlertTriangle, ChevronDown, Copy, Check,
  Zap, Brain, MessageSquare, X, Info
} from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  streaming?: boolean;
}

interface AiStatusInfo {
  enabled: boolean;
  model: string;
  message: string;
}

const SUGGESTED_PROMPTS = [
  "What are the most critical unresolved incidents right now?",
  "Summarize all fraud incidents and suggest a coordinated response.",
  "What phishing campaigns are targeting Malawian government portals?",
  "Analyze the current threat landscape and give a risk score.",
  "Which organizations are most frequently reporting incidents?",
  "What mitigation steps should MACRA take for SIM swap fraud?",
  "Generate a draft incident response report for the latest breach.",
  "Are there any patterns suggesting a coordinated attack campaign?",
];

let msgCounter = 0;
const uid = () => `msg-${++msgCounter}-${Date.now()}`;

export default function AiAssistant({ defaultIncidentId = "" }: { defaultIncidentId?: string }) {
  const [messages, setMessages]       = useState<Message[]>([]);
  const [input, setInput]             = useState("");
  const [sending, setSending]         = useState(false);
  const [aiStatus, setAiStatus]       = useState<AiStatusInfo | null>(null);
  const [copied, setCopied]           = useState<string | null>(null);
  const [selectedIncidentId, setSelectedIncidentId] = useState(defaultIncidentId);
  const [incidents, setIncidents]     = useState<any[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);
  const initializedRef = useRef(false);

  // Chat history for multi-turn (last 10 exchanges)
  const historyRef = useRef<{ role: "user" | "model"; content: string }[]>([]);

  useEffect(() => {
    fetch("/api/ai/status").then(r => r.json()).then(setAiStatus).catch(() => {});
    fetch("/api/incidents").then(r => r.json()).then(d => setIncidents(Array.isArray(d) ? d.slice(0, 30) : [])).catch(() => {});

    // Welcome message
    setMessages([{
      id: uid(), role: "assistant", timestamp: new Date(),
      content: `# 🛡️ SENTINEL AI — Incident Response & Triage Assistant\n\nI'm your AI-powered Incident Response and Triage assistant for Malawi's cyber incident reporting network.\n\n**I can help you:**\n- Analyze and interpret citizen cyber incidents\n- Generate triage recommendations\n- Identify recurring threat trends across reports\n- Provide containment and mitigation guidance\n- Answer questions about specific reported cases\n\nSelect an incident from the dropdown to load its full context, or just ask me anything about incoming incidents.`,
    }]);
  }, []);

  // Auto-trigger analysis when opened from RoleConsole with a specific incident
  useEffect(() => {
    if (defaultIncidentId && !initializedRef.current && incidents.length > 0) {
      initializedRef.current = true;
      setSelectedIncidentId(defaultIncidentId);
      // Short delay to allow state settle, then auto-send
      setTimeout(() => {
        sendMessage(`Analyze incident ${defaultIncidentId} in full detail. Provide: threat actor profile, attack vector breakdown, severity justification, and a step-by-step incident response plan for the MACRA/MACERT team.`);
      }, 400);
    }
  }, [defaultIncidentId, incidents]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async (text?: string) => {
    const content = (text || input).trim();
    if (!content || sending) return;

    setInput("");
    setSending(true);

    const userMsg: Message = { id: uid(), role: "user", content, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);

    // Placeholder streaming message
    const assistantId = uid();
    setMessages(prev => [...prev, {
      id: assistantId, role: "assistant", content: "", timestamp: new Date(), streaming: true,
    }]);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: content,
          history: historyRef.current.slice(-20),
          incidentId: selectedIncidentId || undefined,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!res.body) throw new Error("No stream body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = decoder.decode(value).split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.chunk) {
              fullText += data.chunk;
              setMessages(prev => prev.map(m =>
                m.id === assistantId ? { ...m, content: fullText } : m
              ));
            }
            if (data.done || data.error) break;
          } catch {}
        }
      }

      // Update history for multi-turn
      historyRef.current = [
        ...historyRef.current,
        { role: "user", content },
        { role: "model", content: fullText },
      ].slice(-20);

      setMessages(prev => prev.map(m =>
        m.id === assistantId ? { ...m, streaming: false } : m
      ));
    } catch (err: any) {
      setMessages(prev => prev.map(m =>
        m.id === assistantId
          ? { ...m, content: `⚠️ Connection error: ${err.message}. Please retry.`, streaming: false }
          : m
      ));
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }, [input, sending, selectedIncidentId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const copyMessage = (id: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const clearChat = () => {
    historyRef.current = [];
    setMessages([{
      id: uid(), role: "assistant", timestamp: new Date(),
      content: "Chat cleared. How can I assist you with your cyber security operations?",
    }]);
  };

  // Simple markdown renderer
  const renderMarkdown = (text: string) => {
    return text
      .replace(/^### (.+)$/gm, '<h3 class="text-[#FFD600] font-bold text-sm mt-3 mb-1">$1</h3>')
      .replace(/^## (.+)$/gm, '<h2 class="text-white font-bold text-base mt-4 mb-2">$1</h2>')
      .replace(/^# (.+)$/gm, '<h1 class="text-white font-bebas text-xl tracking-wide mt-2 mb-3">$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong class="text-slate-100 font-semibold">$1</strong>')
      .replace(/`([^`]+)`/g, '<code class="bg-[#05080F] text-[#FFD600] px-1.5 py-0.5 rounded font-mono text-[11px]">$1</code>')
      .replace(/^- (.+)$/gm, '<li class="flex gap-2 text-slate-300 text-xs leading-relaxed"><span class="text-[#FFD600] mt-0.5 shrink-0">▸</span><span>$1</span></li>')
      .replace(/^(\d+)\. (.+)$/gm, '<li class="flex gap-2 text-slate-300 text-xs leading-relaxed"><span class="text-[#FFD600] font-mono font-bold shrink-0">$1.</span><span>$2</span></li>')
      .replace(/\n\n/g, '</p><p class="mb-2">')
      .replace(/\n/g, '<br/>');
  };

  return (
    <div className="flex flex-col h-[calc(100vh-200px)] min-h-[600px] bg-[#0A0E1A] rounded-xl border border-white/10 overflow-hidden">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/8 bg-[#05080F]/60">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-9 h-9 rounded-full bg-[#FFD600]/15 border border-[#FFD600]/30 flex items-center justify-center">
              <Brain className="w-5 h-5 text-[#FFD600]" />
            </div>
            <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#05080F] ${aiStatus?.enabled ? "bg-[#FFD600]" : "bg-slate-500"}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-grotesk font-bold text-white text-sm">SENTINEL AI</h3>
              <span className="text-[9px] font-mono bg-[#FFD600]/10 text-[#FFD600] border border-[#FFD600]/25 px-2 py-0.5 rounded-full uppercase tracking-wider">
                {aiStatus?.model || "gemini-2.0-flash"}
              </span>
            </div>
            <p className="text-[10px] text-slate-500 font-mono">
              {aiStatus?.enabled ? "● AI Online — SOC Intelligence Active" : "● AI Offline — Add GEMINI_API_KEY"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Incident context selector */}
          <div className="relative hidden md:block">
            <select
              value={selectedIncidentId}
              onChange={e => setSelectedIncidentId(e.target.value)}
              className="bg-[#05080F] border border-white/10 text-xs text-slate-300 rounded-lg pl-3 pr-8 py-1.5 font-mono focus:outline-none focus:border-[#FFD600]/50 appearance-none cursor-pointer max-w-[220px]"
              id="ai-incident-context"
            >
              <option value="">No incident context</option>
              {incidents.map(i => (
                <option key={i.id} value={i.id}>{i.id} — {i.title?.substring(0, 30)}...</option>
              ))}
            </select>
            <ChevronDown className="w-3 h-3 text-slate-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          <button onClick={clearChat} className="p-1.5 text-slate-500 hover:text-[#FFD600] transition rounded hover:bg-[#FFD600]/5" title="Clear chat">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 scroll-smooth">
        {messages.map(msg => (
          <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"} animate-fade-in`}>

            {msg.role === "assistant" && (
              <div className="w-7 h-7 rounded-full bg-[#FFD600]/15 border border-[#FFD600]/30 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="w-3.5 h-3.5 text-[#FFD600]" />
              </div>
            )}

            <div className={`group max-w-[85%] ${msg.role === "user" ? "order-first" : ""}`}>
              {msg.role === "user" ? (
                <div className="bg-[#FFD600]/10 border border-[#FFD600]/20 rounded-2xl rounded-tr-sm px-4 py-2.5">
                  <p className="text-sm text-slate-100 leading-relaxed">{msg.content}</p>
                </div>
              ) : (
                <div className="bg-[#05080F]/80 border border-white/8 rounded-2xl rounded-tl-sm px-4 py-3 relative">
                  {msg.streaming && !msg.content ? (
                    <div className="flex items-center gap-2 py-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#FFD600] animate-bounce" style={{ animationDelay: "0ms" }} />
                      <div className="w-1.5 h-1.5 rounded-full bg-[#FFD600] animate-bounce" style={{ animationDelay: "150ms" }} />
                      <div className="w-1.5 h-1.5 rounded-full bg-[#FFD600] animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  ) : (
                    <div
                      className="text-xs text-slate-300 leading-relaxed prose-invert [&_li]:list-none [&_p]:mb-2 [&_ul]:space-y-1 [&_ol]:space-y-1"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                    />
                  )}
                  {msg.streaming && msg.content && (
                    <span className="inline-block w-1 h-3.5 bg-[#FFD600] ml-0.5 animate-pulse align-middle" />
                  )}
                  {!msg.streaming && msg.content && (
                    <button
                      onClick={() => copyMessage(msg.id, msg.content)}
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition p-1 text-slate-600 hover:text-[#FFD600]"
                    >
                      {copied === msg.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    </button>
                  )}
                </div>
              )}
              <p className="text-[9px] text-slate-600 font-mono mt-1 px-1">
                {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>

            {msg.role === "user" && (
              <div className="w-7 h-7 rounded-full bg-slate-700/50 border border-white/10 flex items-center justify-center shrink-0 mt-0.5">
                <User className="w-3.5 h-3.5 text-slate-400" />
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* ── Suggested prompts (shown when empty/initial) ── */}
      {messages.length <= 1 && (
        <div className="px-5 pb-3">
          <p className="text-[10px] text-slate-600 font-mono uppercase tracking-wider mb-2">Suggested queries</p>
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTED_PROMPTS.slice(0, 4).map(p => (
              <button
                key={p}
                onClick={() => sendMessage(p)}
                className="text-[10px] bg-[#05080F] border border-white/8 hover:border-[#FFD600]/30 text-slate-400 hover:text-[#FFD600] px-2.5 py-1.5 rounded-lg transition font-mono text-left"
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Input ── */}
      <div className="border-t border-white/8 bg-[#05080F]/40 px-5 py-4">
        {!aiStatus?.enabled && (
          <div className="mb-3 flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 text-[10px] text-amber-400 font-mono">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            AI offline — add your GEMINI_API_KEY to .env.local and restart. Chat will use fallback responses.
          </div>
        )}
        <div className="flex gap-3 items-end">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              id="ai-chat-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask SENTINEL AI about threats, incidents, or request analysis... (Enter to send, Shift+Enter for new line)"
              rows={2}
              disabled={sending}
              className="w-full bg-[#0A0E1A] border border-white/10 focus:border-[#FFD600]/50 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-600 outline-none transition font-sans resize-none leading-relaxed disabled:opacity-50"
            />
          </div>
          <button
            id="ai-send-btn"
            onClick={() => sendMessage()}
            disabled={sending || !input.trim()}
            className="btn-accent p-3 rounded-xl flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed shrink-0 self-end"
          >
            {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </div>
        <p className="text-[9px] text-slate-600 font-mono mt-2 text-center">
          SENTINEL AI can make mistakes. Always verify critical decisions with human analysts.
        </p>
      </div>
    </div>
  );
}
