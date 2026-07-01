/**
 * Provider-agnostic AI client. Auto-detects which key is set:
 *   GEMINI_API_KEY  → Google Gemini (generativelanguage REST)
 *   NVIDIA_API_KEY  → NVIDIA NIM (OpenAI-compatible chat/completions)
 *   neither         → "mock" (callers supply a deterministic fallback)
 *
 * No SDKs — plain fetch, so there's nothing to bundle and it works on any runtime.
 * Add a key to .env.local and the same code goes live with zero changes.
 */

export type AiProvider = "gemini" | "nvidia" | "mock";

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
const NVIDIA_MODEL = process.env.NVIDIA_MODEL ?? "meta/llama-3.3-70b-instruct";
const TIMEOUT_MS = 30_000;

export function aiProvider(): AiProvider {
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.NVIDIA_API_KEY) return "nvidia";
  return "mock";
}

export function aiStatus(): { provider: AiProvider; live: boolean; model: string } {
  const provider = aiProvider();
  return {
    provider,
    live: provider !== "mock",
    model: provider === "gemini" ? GEMINI_MODEL : provider === "nvidia" ? NVIDIA_MODEL : "mock",
  };
}

export function isAiLive(): boolean {
  return aiProvider() !== "mock";
}

export type GenerateOpts = {
  system?: string;
  prompt: string;
  /** Ask the model for JSON and return the raw JSON string. */
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
};

class AiError extends Error {}

async function withTimeout(p: (signal: AbortSignal) => Promise<Response>): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await p(ctrl.signal);
  } finally {
    clearTimeout(t);
  }
}

async function callGemini(opts: GenerateOpts): Promise<string> {
  const key = process.env.GEMINI_API_KEY!;
  // Pass the key as a header, NOT a ?key= query param — query strings can leak into
  // access logs / APM traces / proxies. (REST API accepts x-goog-api-key.)
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  const body = {
    contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
    ...(opts.system ? { systemInstruction: { parts: [{ text: opts.system }] } } : {}),
    generationConfig: {
      temperature: opts.temperature ?? 0.4,
      maxOutputTokens: opts.maxTokens ?? 2048,
      ...(opts.json ? { responseMimeType: "application/json" } : {}),
    },
  };
  const res = await withTimeout((signal) =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
      signal,
    }),
  );
  if (!res.ok) throw new AiError(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
  if (!text) throw new AiError("Gemini returned an empty response.");
  return text;
}

async function callNvidia(opts: GenerateOpts): Promise<string> {
  const key = process.env.NVIDIA_API_KEY!;
  const body = {
    model: NVIDIA_MODEL,
    messages: [
      ...(opts.system ? [{ role: "system", content: opts.system }] : []),
      { role: "user", content: opts.prompt },
    ],
    temperature: opts.temperature ?? 0.4,
    max_tokens: opts.maxTokens ?? 2048,
    ...(opts.json ? { response_format: { type: "json_object" } } : {}),
  };
  const res = await withTimeout((signal) =>
    fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal,
    }),
  );
  if (!res.ok) throw new AiError(`NVIDIA ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content ?? "";
  if (!text) throw new AiError("NVIDIA returned an empty response.");
  return text;
}

/** Generate text. Throws AiError on failure; throws if called with no provider key. */
export async function aiText(opts: GenerateOpts): Promise<string> {
  const provider = aiProvider();
  if (provider === "gemini") return callGemini(opts);
  if (provider === "nvidia") return callNvidia(opts);
  throw new AiError("No AI provider configured (set GEMINI_API_KEY or NVIDIA_API_KEY).");
}

/** Tolerant JSON extraction — strips ``` fences, prose, comments, and trailing commas. */
export function extractJson<T>(raw: string): T {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  if (s[0] !== "{" && s[0] !== "[") {
    const obj = s.indexOf("{");
    const arr = s.indexOf("[");
    const start = obj === -1 ? arr : arr === -1 ? obj : Math.min(obj, arr);
    if (start >= 0) s = s.slice(start);
  }
  const lastObj = s.lastIndexOf("}");
  const lastArr = s.lastIndexOf("]");
  const end = Math.max(lastObj, lastArr);
  if (end >= 0) s = s.slice(0, end + 1);

  const clean = (x: string) =>
    x
      .replace(/\/\/[^\n\r]*/g, "") // line comments
      .replace(/\/\*[\s\S]*?\*\//g, "") // block comments
      .replace(/,\s*([}\]])/g, "$1"); // trailing commas

  try {
    return JSON.parse(s) as T;
  } catch {
    return JSON.parse(clean(s)) as T; // retry after cleanup; throws if still invalid
  }
}

/** Generate and parse JSON in one call. */
export async function aiJson<T>(opts: Omit<GenerateOpts, "json">): Promise<T> {
  const raw = await aiText({ ...opts, json: true });
  return extractJson<T>(raw);
}
