/**
 * LitSecure Sentinel — Global AI Chat Overlay
 * Floating SENTINEL AI button visible on every page.
 * Streams Gemini responses via SSE. Glassmorphism design.
 */
import React, { useState, useRef, useEffect, useCallback } from "react";
import { Bot, X, Send, Loader2, Sparkles, ChevronDown, Minimize2 } from "lucide-react";

interface Message {
  id:      string;
  role:    "user" | "ai";
  content: string;
  loading?: boolean;
}

interface Props {
  token: string;
}

export default function GlobalAiChat({ token }: Props) {
  const [open,     setOpen]     = useState(false);
  const [mini,     setMini]     = useState(false);
  const [input,    setInput]    = useState("");
  const [engine,   setEngine]   = useState<string>("AI");
  const [messages, setMessages] = useState<Message[]>([{
    id:      "welcome",
    role:    "ai",
    content: "👋 I'm **SENTINEL AI**, your cybersecurity analyst. Ask me anything — threat intelligence, incident analysis, cyber terms, or Malawian cyber threats.\n\nTry: *Explain SIM swap fraud* or *What is ransomware?*",
  }]);
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  // Fetch live engine status when chat opens
  useEffect(() => {
    if (!open) return;
    fetch("/api/ai/status", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.engineLabel) setEngine(d.engineLabel); })
      .catch(() => {});
  }, [open, token]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (open && !mini) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open, mini]);

  const sendMessage = useCallback(async (overrideQuery?: string) => {
    const q = (overrideQuery ?? input).trim();
    if (!q || streaming) return;
    if (!overrideQuery) setInput("");

    const userMsg: Message = { id: `u-${Date.now()}`, role: "user", content: q };
    const aiId = `ai-${Date.now()}`;
    const aiMsg: Message  = { id: aiId, role: "ai", content: "", loading: true };

    setMessages(prev => [...prev, userMsg, aiMsg]);
    setStreaming(true);

    try {
      const res = await fetch("/api/terminal/ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ cmd: "ai", query: q }),
      });

      if (!res.ok) throw new Error("AI service unavailable");

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let full = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        const lines = text.split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.chunk) {
              full += data.chunk;
              setMessages(prev => prev.map(m =>
                m.id === aiId ? { ...m, content: full, loading: false } : m
              ));
            }
            if (data.done || data.error) break;
          } catch {}
        }
      }
    } catch (err: any) {
      setMessages(prev => prev.map(m =>
        m.id === aiId ? { ...m, content: `⚠️ ${err.message || "AI unavailable"}`, loading: false } : m
      ));
    } finally {
      setStreaming(false);
    }
  }, [input, streaming, token]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  // Render markdown-lite (bold, italic, newlines)
  const renderContent = (text: string) => {
    const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**"))
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      if (part.startsWith("*") && part.endsWith("*"))
        return <em key={i}>{part.slice(1, -1)}</em>;
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <>
      {/* ── Floating button ── */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 group"
          title="Open SENTINEL AI"
          id="global-ai-chat-btn"
        >
          <div className="relative flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-[#FFD600] to-[#FF9800] shadow-2xl shadow-[#FFD600]/30 hover:scale-110 transition-transform duration-200">
            <Bot className="w-6 h-6 text-[#05080F]" />
            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-green-400 border-2 border-[#05080F] animate-pulse" />
          </div>
          <div className="absolute bottom-full right-0 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            <div className="bg-[#0A0E1A] border border-[#FFD600]/30 text-[#FFD600] text-[10px] font-mono px-2 py-1 rounded whitespace-nowrap">
              SENTINEL AI
            </div>
          </div>
        </button>
      )}

      {/* ── Chat panel ── */}
      {open && (
        <div
          className={`fixed z-50 flex flex-col transition-all duration-300 ${
            mini
              ? "bottom-6 right-6 w-72 h-14 rounded-2xl overflow-hidden"
              : "bottom-6 right-6 w-[380px] h-[560px] rounded-2xl"
          }`}
          style={{
            background: "rgba(5, 8, 15, 0.92)",
            backdropFilter: "blur(24px)",
            border: "1px solid rgba(255, 214, 0, 0.2)",
            boxShadow: "0 25px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,214,0,0.05) inset",
          }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5 shrink-0">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="relative shrink-0">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#FFD600] to-[#FF9800] flex items-center justify-center">
                  <Bot className="w-4 h-4 text-[#05080F]" />
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-400 border border-[#05080F]" />
              </div>
              {!mini && (
                <div className="min-w-0">
                  <div className="text-[11px] font-bold text-white font-mono">SENTINEL AI</div>
                  <div className="text-[9px] text-[#FFD600] font-mono truncate" title={engine}>
                    ● {engine.includes("Ollama") ? "LOCAL AI" : engine.includes("Gemini") ? "GEMINI" : "OFFLINE KB"} • MALAWI SOC
                  </div>
                </div>
              )}
              {mini && <span className="text-[11px] font-bold text-white font-mono truncate">SENTINEL AI</span>}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setMini(m => !m)} className="p-1.5 text-slate-500 hover:text-slate-300 transition rounded">
                {mini ? <Sparkles className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
              </button>
              <button onClick={() => setOpen(false)} className="p-1.5 text-slate-500 hover:text-red-400 transition rounded">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {!mini && (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scrollbar-thin">
                {messages.map(msg => (
                  <div key={msg.id} className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                    {/* Avatar */}
                    <div className={`shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-[9px] font-bold ${
                      msg.role === "ai"
                        ? "bg-gradient-to-br from-[#FFD600] to-[#FF9800] text-[#05080F]"
                        : "bg-blue-600 text-white"
                    }`}>
                      {msg.role === "ai" ? "AI" : "U"}
                    </div>

                    {/* Bubble */}
                    <div className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-[12px] leading-relaxed ${
                      msg.role === "ai"
                        ? "bg-white/5 text-slate-200 border border-white/8"
                        : "bg-[#FFD600]/15 text-white border border-[#FFD600]/20"
                    }`}>
                      {msg.loading ? (
                        <div className="flex items-center gap-2">
                          <Loader2 className="w-3 h-3 animate-spin text-[#FFD600]" />
                          <span className="text-slate-500 text-[11px]">Thinking...</span>
                        </div>
                      ) : (
                        <div className="whitespace-pre-wrap break-words">
                          {msg.content.split("\n").map((line, i) => (
                            <React.Fragment key={i}>
                              {renderContent(line)}
                              {i < msg.content.split("\n").length - 1 && <br />}
                            </React.Fragment>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              {/* Quick prompts */}
              {messages.length === 1 && (
                <div className="px-4 pb-2 flex flex-wrap gap-1.5">
                  {[
                    "Explain SIM swap",
                    "Top threats in Malawi",
                    "What is phishing?",
                    "MITRE ATT&CK basics",
                  ].map(q => (
                    <button
                      key={q}
                      onClick={() => sendMessage(q)}
                      className="text-[10px] font-mono px-2 py-1 rounded-full border border-[#FFD600]/20 text-[#FFD600]/70 hover:border-[#FFD600]/50 hover:text-[#FFD600] transition"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}

              {/* Input */}
              <div className="px-4 pb-4 pt-2 shrink-0 border-t border-white/5">
                <div className="flex gap-2 items-center glass-form rounded-xl px-3 py-2">
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKey}
                    placeholder="Ask SENTINEL AI..."
                    disabled={streaming}
                    className="flex-1 bg-transparent text-[12px] text-slate-200 placeholder-slate-600 outline-none font-mono"
                    id="ai-chat-input"
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!input.trim() || streaming}
                    className="shrink-0 w-7 h-7 rounded-lg bg-[#FFD600] hover:bg-[#FF9800] disabled:opacity-30 flex items-center justify-center transition"
                  >
                    {streaming
                      ? <Loader2 className="w-3.5 h-3.5 text-[#05080F] animate-spin" />
                      : <Send className="w-3.5 h-3.5 text-[#05080F]" />
                    }
                  </button>
                </div>
                <div className="text-center mt-2">
                  <span className="text-[9px] font-mono text-slate-600">SENTINEL AI • {engine.includes("Ollama") ? "Local qwen2.5" : "Gemini 2.0"} • LitSecure v1.4</span>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
