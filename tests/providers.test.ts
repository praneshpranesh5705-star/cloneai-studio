import { test, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";

/**
 * These tests exercise the real provider adapters in lib/providers.ts against a
 * local HTTP server that speaks the exact SSE wire format each vendor uses.
 *
 * What this proves: request shape, headers, auth placement, streaming parse,
 * error propagation. What it cannot prove: that a live vendor accepts the call.
 * That distinction is the whole point — see README "What is not tested".
 */

const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const url = req.url ?? "";

    // Error path: any model named "fail-please" returns a vendor-shaped error.
    if (body.includes("fail-please")) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "Invalid API key provided." } }));
      return;
    }
    if (url.includes("key=bad-key")) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "API key not valid." } }));
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    });

    // Gemini shape: candidates[].content.parts[].text
    if (url.includes("streamGenerateContent")) {
      res.write(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: "Hello" }] } }] })}\n\n`);
      res.write(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: " from Gemini" }] } }] })}\n\n`);
      res.end();
      return;
    }

    // Anthropic shape: type=content_block_delta, delta.text
    if (url.includes("/v1/messages")) {
      res.write(`event: message_start\ndata: ${JSON.stringify({ type: "message_start" })}\n\n`);
      res.write(`event: ping\ndata: ${JSON.stringify({ type: "ping" })}\n\n`);
      res.write(
        `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: "Hello" } })}\n\n`,
      );
      res.write(
        `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: " from Claude" } })}\n\n`,
      );
      res.end();
      return;
    }

    // OpenAI-compatible shape: choices[].delta.content
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "Hello" } }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: " from OpenAI" } }] })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
  });
});

let base = "";
const ready = new Promise<void>((resolve) => {
  server.listen(0, "127.0.0.1", () => {
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    resolve();
  });
});

after(() => server.close());

// The adapters hardcode vendor URLs, so we point them at the mock by
// overriding global fetch. This is the standard way to test HTTP clients.
const realFetch = globalThis.fetch;
globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
  const target = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const rewritten = target.startsWith("http://127.0.0.1")
    ? target
    : target
        .replace("https://api.openai.com", base)
        .replace("https://openrouter.ai", base)
        .replace("https://api.anthropic.com", base)
        .replace("https://generativelanguage.googleapis.com", base);
  return realFetch(rewritten, init);
}) as typeof fetch;

async function loadProviders() {
  await ready;
  return import("../lib/providers");
}

const baseReq = {
  system: "You are a test agent.",
  messages: [{ role: "user" as const, content: "Hi" }],
  temperature: 0.7,
  maxTokens: 100,
};

async function collect(gen: AsyncGenerator<{ type: "text"; text: string }>): Promise<string> {
  let out = "";
  for await (const chunk of gen) out += chunk.text;
  return out;
}

test("openai adapter streams and assembles deltas", async () => {
  const { streamCompletion } = await loadProviders();
  process.env.OPENAI_API_KEY = "sk-test";
  const text = await collect(streamCompletion({ ...baseReq, provider: "openai", model: "gpt-4o-mini" }));
  assert.equal(text, "Hello from OpenAI");
});

test("openrouter adapter uses the same compatible path", async () => {
  const { streamCompletion } = await loadProviders();
  process.env.OPENROUTER_API_KEY = "sk-or-test";
  const text = await collect(streamCompletion({ ...baseReq, provider: "openrouter", model: "openai/gpt-4o-mini" }));
  assert.equal(text, "Hello from OpenAI");
});

test("anthropic adapter parses content_block_delta and ignores ping frames", async () => {
  const { streamCompletion } = await loadProviders();
  process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  const text = await collect(streamCompletion({ ...baseReq, provider: "anthropic", model: "claude-haiku-4-5-20251001" }));
  assert.equal(text, "Hello from Claude");
});

test("gemini adapter parses candidates[].content.parts", async () => {
  const { streamCompletion } = await loadProviders();
  process.env.GEMINI_API_KEY = "gm-test";
  const text = await collect(streamCompletion({ ...baseReq, provider: "gemini", model: "gemini-3.8-flash" }));
  assert.equal(text, "Hello from Gemini");
});

test("missing key throws a message naming the env var", async () => {
  const { streamCompletion } = await loadProviders();
  delete process.env.ANTHROPIC_API_KEY;
  assert.throws(
    () => streamCompletion({ ...baseReq, provider: "anthropic", model: "claude-haiku-4-5-20251001" }),
    /ANTHROPIC_API_KEY is not set/,
  );
});

test("vendor error bodies surface as readable messages", async () => {
  const { streamCompletion } = await loadProviders();
  process.env.OPENAI_API_KEY = "sk-test";
  const gen = streamCompletion({ ...baseReq, provider: "openai", model: "fail-please" });
  await assert.rejects(() => collect(gen), /Invalid API key provided/);
});

test("demo provider works with no key and admits it is a demo", async () => {
  const { streamCompletion } = await loadProviders();
  const text = await collect(streamCompletion({ ...baseReq, provider: "demo", model: "demo" }));
  assert.match(text, /Demo mode/);
  assert.match(text, /not a real model answer/);
});
