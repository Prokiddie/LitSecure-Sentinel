/**
 * LitSecure Sentinel — Ollama Local AI Client
 *
 * Provides a local, rate-limit-free AI backend using Ollama.
 * Default model: qwen2.5:0.5b (small, fast enough on CPU)
 *
 * CPU inference note: num_predict is capped at 256 tokens (~30s on CPU).
 * For GPU users, increase num_predict to 1024 for richer responses.
 */

const OLLAMA_URL   = () => process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const OLLAMA_MODEL = () => process.env.OLLAMA_MODEL    || "qwen2.5:7b";

// ─── Health check (fast, ~100ms) ─────────────────────────────────────────────
export async function isOllamaAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_URL()}/api/tags`, {
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return false;
    const data: any = await res.json();
    // Check the requested model is actually pulled
    const models: string[] = (data?.models || []).map((m: any) => m.name as string);
    return models.some(m => m.startsWith(OLLAMA_MODEL().split(":")[0]));
  } catch {
    return false;
  }
}

// ─── Chat completion ─────────────────────────────────────────────────────────
export async function ollamaChat(
  systemPrompt: string,
  userMessage: string,
  timeoutMs = 30000   // 30s — enough for 256 tokens on CPU
): Promise<string> {
  const res = await fetch(`${OLLAMA_URL()}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      model:    OLLAMA_MODEL(),
      stream:   false,
      // Cap at 256 tokens for CPU — enough for a useful answer, completes in ~30s
      options:  { temperature: 0.3, num_predict: 256 },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userMessage  },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ollama ${res.status}: ${err.substring(0, 200)}`);
  }

  const data: any = await res.json();
  return data?.message?.content?.trim() || "";
}

// ─── JSON-structured completion ───────────────────────────────────────────────
// Ollama with qwen2.5 supports JSON mode via format:"json"
export async function ollamaChatJSON<T = any>(
  systemPrompt: string,
  userMessage: string,
  timeoutMs = 40000   // 40s — JSON mode, still capped at 256 tokens
): Promise<T> {
  const res = await fetch(`${OLLAMA_URL()}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      model:    OLLAMA_MODEL(),
      stream:   false,
      format:   "json",
      options:  { temperature: 0.2, num_predict: 256 },
      messages: [
        { role: "system", content: systemPrompt + "\n\nYou MUST respond with valid JSON only. No markdown, no explanation outside the JSON." },
        { role: "user",   content: userMessage },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ollama ${res.status}: ${err.substring(0, 200)}`);
  }

  const data: any = await res.json();
  const raw = data?.message?.content?.trim() || "{}";
  return JSON.parse(raw) as T;
}

export { OLLAMA_MODEL, OLLAMA_URL };
