import { test } from "node:test";
import assert from "node:assert/strict";
import { trimHistory } from "../lib/prompt";
import { effectiveProvider, effectiveModel, availableProviders } from "../lib/config";

/**
 * Regression tests for the two bugs that made real AI calls fail or lie.
 */

test("trimHistory merges consecutive user turns instead of leaving them adjacent", () => {
  // This is the state after an assistant reply failed to persist.
  const history = [
    { role: "user" as const, content: "first question" },
    { role: "user" as const, content: "second question" },
  ];
  const out = trimHistory(history, 12);
  assert.equal(out.length, 1, "two user turns must collapse into one");
  assert.equal(out[0].role, "user");
  assert.match(out[0].content, /first question/);
  assert.match(out[0].content, /second question/, "no user text may be lost");
});

test("trimHistory never returns two turns with the same role", () => {
  const history = [
    { role: "user" as const, content: "a" },
    { role: "user" as const, content: "b" },
    { role: "assistant" as const, content: "c" },
    { role: "assistant" as const, content: "d" },
    { role: "user" as const, content: "e" },
  ];
  const out = trimHistory(history, 12);
  for (let i = 1; i < out.length; i += 1) {
    assert.notEqual(out[i].role, out[i - 1].role, `roles repeat at index ${i}`);
  }
  assert.equal(out[0].role, "user", "must not open with an assistant turn");
});

test("trimHistory still respects the window limit", () => {
  const history = Array.from({ length: 20 }, (_, i) => ({
    role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
    content: `m${i}`,
  }));
  assert.ok(trimHistory(history, 6).length <= 6);
});

test("effectiveProvider promotes a demo agent when a key exists", () => {
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  assert.equal(effectiveProvider("demo"), "demo", "no keys means demo");

  process.env.OPENAI_API_KEY = "sk-test";
  assert.equal(effectiveProvider("demo"), "openai", "a key should lift demo agents out of demo");
  delete process.env.OPENAI_API_KEY;
});

test("effectiveProvider falls back to demo when the chosen provider has no key", () => {
  delete process.env.ANTHROPIC_API_KEY;
  assert.equal(effectiveProvider("anthropic"), "demo");
});

test("effectiveProvider keeps a real provider that does have a key", () => {
  process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  assert.equal(effectiveProvider("anthropic"), "anthropic");
  delete process.env.ANTHROPIC_API_KEY;
});

test("effectiveModel pairs the model with the provider actually used", () => {
  delete process.env.ANTHROPIC_API_KEY;
  // Agent recorded anthropic + a claude model, but no key: we run demo, so the
  // model must be the demo model, not a claude id that would never be called.
  assert.equal(effectiveModel("anthropic", "claude-haiku-4-5-20251001"), "demo");
});

test("availableProviders always includes demo", () => {
  assert.ok(availableProviders().includes("demo"));
});
