import { test } from "node:test";
import assert from "node:assert/strict";
import { chunkText, retrieve, toCitations, tokenize } from "../lib/retrieval";
import { buildSystemPrompt, trimHistory, estimateTokens } from "../lib/prompt";
import { validateAgentInput, validateDocumentInput, validateChatInput, clampNumber } from "../lib/validation";

test("tokenize strips stopwords and punctuation", () => {
  const tokens = tokenize("What is the RETURNS policy, and how long?");
  assert.ok(tokens.includes("returns"));
  assert.ok(tokens.includes("policy"));
  assert.ok(!tokens.includes("the"), "stopword should be removed");
  assert.ok(!tokens.includes("is"), "stopword should be removed");
});

test("tokenize handles empty and punctuation-only input", () => {
  assert.deepEqual(tokenize(""), []);
  assert.deepEqual(tokenize("!!! ??? ---"), []);
});

test("chunkText returns one chunk for short text", () => {
  assert.deepEqual(chunkText("short text"), ["short text"]);
  assert.deepEqual(chunkText(""), []);
  assert.deepEqual(chunkText("   "), []);
});

test("chunkText splits long text and keeps every chunk non-empty", () => {
  const long = Array.from({ length: 200 }, (_, i) => `Sentence number ${i} about textiles.`).join(" ");
  const chunks = chunkText(long, 400, 50);
  assert.ok(chunks.length > 1, `expected multiple chunks, got ${chunks.length}`);
  for (const chunk of chunks) assert.ok(chunk.trim().length > 0);
});

test("chunkText does not lose distinguishable content", () => {
  const text = "AAA first paragraph.\n\nBBB second paragraph.\n\nCCC third paragraph.";
  const joined = chunkText(text, 30, 10).join(" ");
  for (const marker of ["AAA", "BBB", "CCC"]) {
    assert.ok(joined.includes(marker), `chunking dropped ${marker}`);
  }
});

test("retrieve ranks the relevant document first", () => {
  const docs = [
    { id: "1", title: "Returns", content: "Our return policy allows refunds within 30 days of purchase with a receipt." },
    { id: "2", title: "Shipping", content: "We ship across India in 3 to 5 business days via courier." },
    { id: "3", title: "Fabrics", content: "Cotton and silk are our main fabrics for name tapes." },
  ];
  const results = retrieve("what is the refund policy", docs, 2);
  assert.ok(results.length > 0, "expected at least one match");
  assert.equal(results[0].documentId, "1");
});

test("retrieve returns nothing for unrelated query", () => {
  const docs = [{ id: "1", title: "Returns", content: "Refunds within 30 days." }];
  assert.deepEqual(retrieve("astrophysics quantum", docs), []);
});

test("retrieve handles empty inputs safely", () => {
  assert.deepEqual(retrieve("anything", []), []);
  assert.deepEqual(retrieve("", [{ id: "1", title: "t", content: "some text" }]), []);
});

test("retrieve respects the limit", () => {
  const docs = Array.from({ length: 10 }, (_, i) => ({
    id: String(i),
    title: `Doc ${i}`,
    content: "refund policy refund policy returns",
  }));
  assert.ok(retrieve("refund policy", docs, 3).length <= 3);
});

test("toCitations trims long excerpts and preserves ids", () => {
  const chunks = [{ documentId: "abc", title: "Doc", score: 1.23456, text: "x".repeat(500) }];
  const citations = toCitations(chunks, 100);
  assert.equal(citations[0].documentId, "abc");
  assert.equal(citations[0].score, 1.2346);
  assert.ok(citations[0].excerpt.length <= 101, "excerpt should be trimmed");
  assert.ok(citations[0].excerpt.endsWith("…"));
});

test("buildSystemPrompt includes name, instructions and knowledge", () => {
  const prompt = buildSystemPrompt(
    { name: "Helper", description: "Answers questions", system_prompt: "Be brief." },
    [{ documentId: "1", title: "Returns", score: 1, excerpt: "30 days" }],
  );
  assert.ok(prompt.includes("Helper"));
  assert.ok(prompt.includes("Answers questions"));
  assert.ok(prompt.includes("Be brief."));
  assert.ok(prompt.includes("30 days"));
  assert.ok(prompt.includes("[1] Returns"));
});

test("buildSystemPrompt states when no knowledge matched", () => {
  const prompt = buildSystemPrompt({ name: "Helper", description: null, system_prompt: "" }, []);
  assert.ok(prompt.includes("No knowledge base excerpts matched"));
  assert.ok(!prompt.includes("Knowledge base excerpts relevant"));
});

test("trimHistory keeps the recent window and drops leading assistant turns", () => {
  const messages: { role: "user" | "assistant"; content: string }[] = [
    { role: "assistant", content: "a0" },
    { role: "user", content: "u1" },
    { role: "assistant", content: "a1" },
    { role: "user", content: "u2" },
  ];
  // Last 2 are [assistant a1, user u2]; the leading assistant is dropped,
  // because a conversation must not open with an assistant turn.
  const trimmed = trimHistory(messages, 2);
  assert.equal(trimmed.length, 1);
  assert.equal(trimmed[0].role, "user");
  assert.equal(trimmed[0].content, "u2");

  // With room for 3, the window is [user u1, assistant a1, user u2] — intact.
  const wider = trimHistory(messages, 3);
  assert.equal(wider.length, 3);
  assert.equal(wider[0].content, "u1");
  assert.equal(wider[2].content, "u2");
});

test("estimateTokens is roughly length/4", () => {
  assert.equal(estimateTokens(""), 0);
  assert.equal(estimateTokens("abcdefgh"), 2);
});

test("validateAgentInput accepts a minimal valid agent", () => {
  const result = validateAgentInput({ name: "My agent" });
  assert.ok(result.ok);
  if (result.ok) {
    assert.equal(result.value.name, "My agent");
    assert.equal(result.value.provider, "demo");
    assert.equal(result.value.temperature, 0.7);
    assert.equal(result.value.max_tokens, 800);
    assert.equal(result.value.description, null);
  }
});

test("validateAgentInput rejects a blank name", () => {
  const result = validateAgentInput({ name: "   " });
  assert.ok(!result.ok);
  if (!result.ok) assert.ok(result.errors.name);
});

test("validateAgentInput clamps out-of-range numbers", () => {
  const result = validateAgentInput({ name: "x", temperature: 99, max_tokens: 999999 });
  assert.ok(result.ok);
  if (result.ok) {
    assert.equal(result.value.temperature, 2);
    assert.equal(result.value.max_tokens, 4096);
  }
});

test("validateAgentInput falls back to demo for an unknown provider", () => {
  const result = validateAgentInput({ name: "x", provider: "not-a-provider" });
  assert.ok(result.ok);
  if (result.ok) assert.equal(result.value.provider, "demo");
});

test("validateAgentInput rejects an over-long name", () => {
  const result = validateAgentInput({ name: "a".repeat(81) });
  assert.ok(!result.ok);
});

test("validateDocumentInput requires title and content", () => {
  const missing = validateDocumentInput({});
  assert.ok(!missing.ok);
  if (!missing.ok) {
    assert.ok(missing.errors.title);
    assert.ok(missing.errors.content);
  }
});

test("validateDocumentInput rejects oversized content", () => {
  const result = validateDocumentInput({ title: "t", content: "x".repeat(200001) });
  assert.ok(!result.ok);
});

test("validateChatInput requires agentId and message", () => {
  const result = validateChatInput({});
  assert.ok(!result.ok);
  if (!result.ok) {
    assert.ok(result.errors.agentId);
    assert.ok(result.errors.message);
  }
});

test("validateChatInput normalises an empty conversationId to null", () => {
  const result = validateChatInput({ agentId: "a", message: "hi", conversationId: "" });
  assert.ok(result.ok);
  if (result.ok) assert.equal(result.value.conversationId, null);
});

test("clampNumber handles NaN and strings", () => {
  assert.equal(clampNumber(undefined, 0, 10, 5), 5);
  assert.equal(clampNumber("abc", 0, 10, 5), 5);
  assert.equal(clampNumber("7", 0, 10, 5), 7);
  assert.equal(clampNumber(-3, 0, 10, 5), 0);
  assert.equal(clampNumber(99, 0, 10, 5), 10);
});
