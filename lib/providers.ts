import { PROVIDERS, availableProviders, providerKey, type ProviderId } from "./config";
import type { PromptMessage } from "./prompt";

export type StreamRequest = {
  provider: ProviderId;
  model: string;
  system: string;
  messages: PromptMessage[];
  temperature: number;
  maxTokens: number;
};

export type StreamChunk = { type: "text"; text: string };

async function* readSSE(response: Response): AsyncGenerator<string> {
  if (!response.body) throw new Error("The provider returned an empty response.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let index: number;
    while ((index = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      yield payload;
    }
  }
}

async function assertOk(response: Response, provider: string): Promise<void> {
  if (response.ok) return;
  let detail = "";
  try {
    const body = await response.text();
    const parsed = JSON.parse(body) as { error?: { message?: string } | string };
    detail = typeof parsed.error === "string"
      ? parsed.error
      : parsed.error?.message ?? body.slice(0, 300);
  } catch {
    detail = `HTTP ${response.status}`;
  }
  throw new Error(`${provider} request failed (HTTP ${response.status}): ${detail || response.statusText}`);
}

async function* streamOpenAICompatible(req: StreamRequest, baseUrl: string, key: string, label: string): AsyncGenerator<StreamChunk> {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: req.model, stream: true, temperature: req.temperature, max_tokens: req.maxTokens,
      messages: [{ role: "system", content: req.system }, ...req.messages],
    }),
  });
  await assertOk(response, label);
  for await (const payload of readSSE(response)) {
    try {
      const parsed = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] };
      const text = parsed.choices?.[0]?.delta?.content;
      if (text) yield { type: "text", text };
    } catch { /* Ignore malformed frames. */ }
  }
}

async function* streamAnthropic(req: StreamRequest, key: string): AsyncGenerator<StreamChunk> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: req.model, system: req.system, max_tokens: req.maxTokens, stream: true, messages: req.messages,
    }),
  });
  await assertOk(response, "Anthropic");
  for await (const payload of readSSE(response)) {
    try {
      const parsed = JSON.parse(payload) as { type?: string; delta?: { type?: string; text?: string } };
      if (parsed.type === "content_block_delta" && parsed.delta?.text) {
        yield { type: "text", text: parsed.delta.text };
      }
    } catch { /* Ignore ping frames. */ }
  }
}

/** Retry temporary Gemini overload/rate-limit responses before giving up. */
async function* streamGemini(req: StreamRequest, key: string): AsyncGenerator<StreamChunk> {
  const contents = req.messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(req.model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`;
  let response: Response | undefined;

  for (let attempt = 0; attempt < 3; attempt++) {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: req.system }] },
        contents,
        generationConfig: { temperature: req.temperature, maxOutputTokens: req.maxTokens },
      }),
    });

    if (response.ok) break;
    const retryable = [429, 500, 502, 503, 504].includes(response.status);
    if (!retryable || attempt === 2) break;

    const retryAfter = Number(response.headers.get("retry-after"));
    await response.body?.cancel();
    const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.min(retryAfter * 1000, 8000)
      : 1000 * (2 ** attempt);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  if (!response) throw new Error("Gemini did not return a response.");
  await assertOk(response, "Gemini");
  for await (const payload of readSSE(response)) {
    try {
      const parsed = JSON.parse(payload) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      for (const part of parsed.candidates?.[0]?.content?.parts ?? []) {
        if (part.text) yield { type: "text", text: part.text };
      }
    } catch { /* Ignore malformed frames. */ }
  }
}

/** Demo provider. It is explicitly labelled and never pretends to be a real model. */
async function* streamDemo(req: StreamRequest): AsyncGenerator<StreamChunk> {
  const lastUser = [...req.messages].reverse().find((m) => m.role === "user");
  const question = lastUser?.content ?? "";
  const hasKnowledge = req.system.includes("Knowledge base excerpts");
  const reply = [
    "**Demo mode.** No AI provider key is configured on this deployment, so this reply is generated locally and is not a real model answer.",
    "",
    `You asked: "${question.slice(0, 300)}"`,
    "",
    hasKnowledge
      ? "Your knowledge base did match this question, and a real model would have been given those excerpts as context. The citations panel below shows exactly which passages were selected."
      : "No knowledge base excerpts matched this question.",
    "",
    "To get real answers, add an AI provider key and redeploy.",
  ].join("\n");
  for (const word of reply.split(/(\s+)/)) {
    yield { type: "text", text: word };
    await new Promise((resolve) => setTimeout(resolve, 8));
  }
}

function streamProvider(req: StreamRequest, provider: ProviderId, key: string): AsyncGenerator<StreamChunk> {
  switch (provider) {
    case "openai": return streamOpenAICompatible({ ...req, provider }, "https://api.openai.com/v1", key, "OpenAI");
    case "openrouter": return streamOpenAICompatible({ ...req, provider }, "https://openrouter.ai/api/v1", key, "OpenRouter");
    case "anthropic": return streamAnthropic({ ...req, provider }, key);
    case "gemini": return streamGemini({ ...req, provider }, key);
    default: return streamDemo(req);
  }
}

/** If Gemini stays overloaded, use another configured real provider when available. */
async function* streamGeminiWithFallback(req: StreamRequest, key: string): AsyncGenerator<StreamChunk> {
  let emitted = false;
  try {
    for await (const chunk of streamGemini(req, key)) {
      emitted = true;
      yield chunk;
    }
  } catch (error) {
    if (emitted) throw error;
    const fallback = (["openrouter", "openai", "anthropic"] as ProviderId[])
      .find((id) => availableProviders().includes(id) && providerKey(id));
    if (!fallback) throw error;
    const fallbackKey = providerKey(fallback);
    if (!fallbackKey) throw error;
    const fallbackRequest = { ...req, provider: fallback, model: PROVIDERS[fallback].defaultModel };
    for await (const chunk of streamProvider(fallbackRequest, fallback, fallbackKey)) yield chunk;
  }
}

export function streamCompletion(req: StreamRequest): AsyncGenerator<StreamChunk> {
  if (req.provider === "demo") return streamDemo(req);
  const key = providerKey(req.provider);
  if (!key) {
    throw new Error(`${PROVIDERS[req.provider].label} is selected but ${PROVIDERS[req.provider].envKey} is not set on this deployment.`);
  }
  if (req.provider === "gemini") return streamGeminiWithFallback(req, key);
  return streamProvider(req, req.provider, key);
}
