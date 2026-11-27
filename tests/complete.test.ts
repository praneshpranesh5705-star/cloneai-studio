import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { completeText, CompleteTimeoutError, studioProvider } from "../lib/complete";

/**
 * These exercise the non-streaming wrapper the Website Builder depends on.
 * A local HTTP server stands in for a provider, so the real fetch, SSE parsing,
 * abort plumbing and generator teardown are all used — only the model is fake.
 */

type Harness = { server: Server; url: string; close: () => void };

function sseServer(chunks: string[], opts: { stall?: boolean } = {}): Promise<Harness> {
  return new Promise((resolve) => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      let i = 0;
      const push = () => {
        if (i >= chunks.length) {
          if (opts.stall) return; // never end: simulates a hung provider
          res.write("data: [DONE]\n\n");
          res.end();
          return;
        }
        const frame = { choices: [{ delta: { content: chunks[i] } }] };
        res.write(`data: ${JSON.stringify(frame)}\n\n`);
        i += 1;
        setTimeout(push, 1);
      };
      push();
    });

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({
        server,
        url: `http://127.0.0.1:${port}`,
        // A stalled response keeps its socket open, and server.close() waits for
        // open sockets. Force them shut so the test process can exit.
        close: () => {
          server.closeAllConnections?.();
          server.close();
        },
      });
    });
  });
}

/** Route the OpenAI adapter at the local server, leaving other hosts alone. */
function pointOpenAIAt(url: string): () => void {
  const realFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const target = typeof input === "string" ? input : input.toString();
    if (target.startsWith("https://api.openai.com")) {
      return realFetch(`${url}/v1/chat/completions`, init);
    }
    return realFetch(input, init);
  }) as typeof fetch;
  return () => {
    globalThis.fetch = realFetch;
  };
}

function withKey<T>(fn: () => Promise<T>): Promise<T> {
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  return fn().finally(() => {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  });
}

const base = {
  provider: "openai" as const,
  model: "gpt-4o-mini",
  system: "test",
  messages: [{ role: "user" as const, content: "hi" }],
  temperature: 0.7,
  maxTokens: 100,
};

test("completeText concatenates a streamed response", async () => {
  const harness = await sseServer(["<!DOCTYPE ", "<html>", "<body>hi</body>", "</html>"]);
  const restore = pointOpenAIAt(harness.url);
  try {
    await withKey(async () => {
      const result = await completeText(base);
      assert.equal(result.truncated, false);
      assert.equal(result.text, "<!DOCTYPE <html><body>hi</body></html>");
    });
  } finally {
    restore();
    harness.close();
  }
});

test("completeText stops at the character budget", async () => {
  const harness = await sseServer(["aaaa", "bbbb", "cccc", "dddd"]);
  const restore = pointOpenAIAt(harness.url);
  try {
    await withKey(async () => {
      const result = await completeText({ ...base, maxChars: 5 });
      assert.equal(result.truncated, true);
      assert.ok(result.text.length > 5);
    });
  } finally {
    restore();
    harness.close();
  }
});

test("completeText gives up on a stalled provider", async () => {
  const harness = await sseServer(["start"], { stall: true });
  const restore = pointOpenAIAt(harness.url);
  try {
    await withKey(async () => {
      const started = Date.now();
      await assert.rejects(
        () => completeText({ ...base, timeoutMs: 200 }),
        (error: unknown) => error instanceof CompleteTimeoutError,
      );
      // The point of the abort signal: this returns promptly rather than
      // waiting for the socket to time out on its own.
      assert.ok(Date.now() - started < 5000, "should abort promptly");
    });
  } finally {
    restore();
    harness.close();
  }
});

test("studioProvider reports demo when no key is set", () => {
  const saved = { ...process.env };
  for (const key of ["OPENAI_API_KEY", "OPENROUTER_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY"]) {
    delete process.env[key];
  }
  try {
    const result = studioProvider();
    assert.equal(result.provider, "demo");
    assert.equal(result.available.length, 0);
    assert.ok(result.missing.includes("OPENAI_API_KEY"));
  } finally {
    process.env = saved;
  }
});

test("studioProvider picks a configured provider", () => {
  const saved = { ...process.env };
  for (const key of ["OPENAI_API_KEY", "OPENROUTER_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY"]) {
    delete process.env[key];
  }
  process.env.ANTHROPIC_API_KEY = "test-key";
  try {
    const result = studioProvider();
    assert.equal(result.provider, "anthropic");
    assert.equal(result.model, "claude-haiku-4-5-20251001");
  } finally {
    process.env = saved;
  }
});
