import { PROVIDERS, providerKey, type ProviderId } from "./config";
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

/**
 * Every provider is adapted to the same async-iterator interface, so the chat
 * route does not care which one is in use. Errors are thrown as Error with a
 * human-readable message that the route forwards to the client.
 */

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
    detail =
      typeof parsed.error === "string"
        ? parsed.error
        : parsed.error?.message ?? body.slice(0, 300);
  } catch {
    detail = `HTTP ${response.status}`;
  }
  throw new Error(`${provider} request failed: ${detail || `HTTP ${response.status}`}`);
}

/** OpenAI-compatible chat completions (OpenAI and OpenRouter). */
async function* streamOpenAICompatible(req: StreamRequest, baseUrl: string, key: string, label: string): AsyncGenerator<StreamChunk> {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: req.model,
      stream: true,
      temperature: req.temperature,
      max_tokens: req.maxTokens,
      messages: [{ role: "system", content: req.system }, ...req.messages],
    }),
  });

  await assertOk(response, label);

  for await (const payload of readSSE(response)) {
    try {
      const parsed = JSON.parse(payload) as {
        choices?: { delta?: { content?: string } }[];
      };
      const text = parsed.choices?.[0]?.delta?.content;
      if (text) yield { type: "text", text };
    } catch {
      // Ignore keep-alive or malformed frames.
    }
  }
}

/** Anthropic messages API. */
async function* streamAnthropic(req: StreamRequest, key: string): AsyncGenerator<StreamChunk> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: req.model,
      system: req.system,
      max_tokens: req.maxTokens,
      stream: true,
      messages: req.messages,
    }),
  });

  await assertOk(response, "Anthropic");

  for await (const payload of readSSE(response)) {
    try {
      const parsed = JSON.parse(payload) as {
        type?: string;
        delta?: { type?: string; text?: string };
      };
      if (parsed.type === "content_block_delta" && parsed.delta?.text) {
        yield { type: "text", text: parsed.delta.text };
      }
    } catch {
      // Ignore ping frames.
    }
  }
}

/** Google Gemini generateContent with SSE. */
async function* streamGemini(req: StreamRequest, key: string): AsyncGenerator<StreamChunk> {
  const contents = req.messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(req.model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: req.system }] },
        contents,
        generationConfig: {
          temperature: req.temperature,
          maxOutputTokens: req.maxTokens,
        },
      }),
    },
  );

  await assertOk(response, "Gemini");

  for await (const payload of readSSE(response)) {
    try {
      const parsed = JSON.parse(payload) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const parts = parsed.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        if (part.text) yield { type: "text", text: part.text };
      }
    } catch {
      // Ignore malformed frames.
    }
  }
}

/**
 * Demo provider. Deterministic, no network, no key. It echoes what it was
 * given so the UI can be exercised end to end, and it says plainly that it is
 * a demo — it never pretends to be a real model.
 */
async function* streamDemo(req: StreamRequest): AsyncGenerator<StreamChunk> {
  const lastUser = [...req.messages].reverse().find((m) => m.role === "user");
  const question = lastUser?.content ?? "";
  const hasKnowledge = req.system.includes("Knowledge base excerpts");

  const reply = [
    `**Demo mode.** No AI provider key is configured on this deployment, so this reply is generated locally and is not a real model answer.`,
    ``,
    `You asked: "${question.slice(0, 300)}"`,
    ``,
    hasKnowledge
      ? `Your knowledge base did match this question, and a real model would have been given those excerpts as context. The citations panel below shows exactly which passages were selected.`
      : `No knowledge base excerpts matched this question.`,
    ``,
    `To get real answers, add one of these to your environment and redeploy: \`OPENAI_API_KEY\`, \`OPENROUTER_API_KEY\`, \`ANTHROPIC_API_KEY\` or \`GEMINI_API_KEY\`.`,
  ].join("\n");

  // Stream in small pieces so the UI's streaming path is genuinely exercised.
  const words = reply.split(/(\s+)/);
  for (const word of words) {
    yield { type: "text", text: word };
    await new Promise((resolve) => setTimeout(resolve, 8));
  }
}

export function streamCompletion(req: StreamRequest): AsyncGenerator<StreamChunk> {
  if (req.provider === "demo") return streamDemo(req);

  const key = providerKey(req.provider);
  if (!key) {
    throw new Error(
      `${PROVIDERS[req.provider].label} is selected but ${PROVIDERS[req.provider].envKey} is not set on this deployment.`,
    );
  }

  switch (req.provider) {
    case "openai":
      return streamOpenAICompatible(req, "https://api.openai.com/v1", key, "OpenAI");
    case "openrouter":
      return streamOpenAICompatible(req, "https://openrouter.ai/api/v1", key, "OpenRouter");
    case "anthropic":
      return streamAnthropic(req, key);
    case "gemini":
      return streamGemini(req, key);
    default:
      return streamDemo(req);
  }
}
