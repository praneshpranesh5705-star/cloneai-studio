import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildUserMessage,
  checkHtml,
  cleanHtml,
  deriveTitle,
  isValidSlug,
  MAX_OUTPUT,
  MAX_PROMPT,
  sanitizeHtml,
  slugify,
  uniqueSlug,
  validateWebsiteInput,
} from "../lib/website";

const PAGE = `<!DOCTYPE html>
<html lang="en"><head><title>Acme Tractors</title></head>
<body><h1>Acme</h1></body></html>`;

test("validateWebsiteInput rejects an empty brief", () => {
  const result = validateWebsiteInput({ prompt: "   " });
  assert.equal(result.ok, false);
});

test("validateWebsiteInput rejects a non-object body", () => {
  assert.equal(validateWebsiteInput(null).ok, false);
  assert.equal(validateWebsiteInput("nope").ok, false);
});

test("validateWebsiteInput rejects an over-long brief", () => {
  const result = validateWebsiteInput({ prompt: "x".repeat(MAX_PROMPT + 1) });
  assert.equal(result.ok, false);
});

test("validateWebsiteInput requires a revision when previous HTML is sent", () => {
  const result = validateWebsiteInput({ prompt: "A site", previousHtml: PAGE, revision: "" });
  assert.equal(result.ok, false);
});

test("validateWebsiteInput accepts a normal brief and trims it", () => {
  const result = validateWebsiteInput({ prompt: "  A bakery site  " });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.prompt, "A bakery site");
});

test("buildUserMessage includes the revision and current HTML", () => {
  const message = buildUserMessage({
    prompt: "A bakery",
    previousHtml: PAGE,
    revision: "Make the header smaller",
  });
  assert.match(message, /Make the header smaller/);
  assert.match(message, /Acme Tractors/);
});

test("cleanHtml strips a markdown fence", () => {
  const fenced = "```html\n" + PAGE + "\n```";
  assert.equal(cleanHtml(fenced), PAGE);
});

test("cleanHtml strips prose before the doctype", () => {
  const noisy = "Here is your page:\n\n" + PAGE;
  assert.equal(cleanHtml(noisy), PAGE);
});

test("cleanHtml strips prose after the closing html tag", () => {
  const noisy = PAGE + "\n\nLet me know if you want changes!";
  assert.equal(cleanHtml(noisy), PAGE);
});

test("checkHtml rejects a fragment", () => {
  const result = checkHtml("<div>just a fragment</div>");
  assert.equal(result.ok, false);
});

test("checkHtml rejects an empty page", () => {
  assert.equal(checkHtml("").ok, false);
});

test("checkHtml rejects an oversized page", () => {
  const huge = PAGE.replace("</body>", "x".repeat(MAX_OUTPUT) + "</body>");
  assert.equal(checkHtml(huge).ok, false);
});

test("checkHtml accepts a complete document", () => {
  assert.equal(checkHtml(PAGE).ok, true);
});

test("sanitizeHtml removes script blocks", () => {
  const dirty = PAGE.replace("</body>", "<script>alert(1)</script></body>");
  const clean = sanitizeHtml(dirty);
  assert.doesNotMatch(clean, /<script/i);
  assert.doesNotMatch(clean, /alert\(1\)/);
});

test("sanitizeHtml removes inline event handlers", () => {
  const dirty = PAGE.replace("<h1>", '<h1 onclick="steal()" onmouseover=\'x()\'>');
  const clean = sanitizeHtml(dirty);
  assert.doesNotMatch(clean, /onclick/i);
  assert.doesNotMatch(clean, /onmouseover/i);
  assert.match(clean, /<h1>Acme<\/h1>/);
});

test("sanitizeHtml neutralises javascript: URLs", () => {
  const dirty = PAGE.replace("</body>", '<a href="javascript:alert(1)">x</a></body>');
  const clean = sanitizeHtml(dirty);
  assert.doesNotMatch(clean, /javascript:/i);
});

test("sanitizeHtml removes iframes and meta refresh", () => {
  const dirty = PAGE.replace(
    "</head>",
    '<meta http-equiv="refresh" content="0;url=https://evil.test"></head>',
  ).replace("</body>", '<iframe src="https://evil.test"></iframe></body>');
  const clean = sanitizeHtml(dirty);
  assert.doesNotMatch(clean, /<iframe/i);
  assert.doesNotMatch(clean, /http-equiv/i);
});

test("sanitizeHtml leaves ordinary markup alone", () => {
  const clean = sanitizeHtml(PAGE);
  assert.match(clean, /<h1>Acme<\/h1>/);
  assert.match(clean, /<title>Acme Tractors<\/title>/);
});

test("deriveTitle reads the page title", () => {
  assert.equal(deriveTitle(PAGE, "ignored"), "Acme Tractors");
});

test("deriveTitle decodes entities", () => {
  const page = PAGE.replace("Acme Tractors", "Ben &amp; Jerry&#39;s");
  assert.equal(deriveTitle(page, "ignored"), "Ben & Jerry's");
});

test("deriveTitle falls back to the brief when there is no title", () => {
  const page = "<html><body><h1>x</h1></body></html>";
  assert.equal(deriveTitle(page, "A coffee shop. With pastries."), "A coffee shop");
});

test("slugify produces a safe path segment", () => {
  assert.equal(slugify("Acme Tractors!"), "acme-tractors");
  assert.equal(slugify("  ---Hello   World---  "), "hello-world");
  assert.equal(slugify("Café Déjà Vu"), "cafe-deja-vu");
});

test("slugify never returns an empty string", () => {
  assert.equal(slugify("!!!"), "page");
});

test("uniqueSlug appends a suffix and stays valid", () => {
  const slug = uniqueSlug("Acme Tractors", "a1b2c3");
  assert.equal(slug, "acme-tractors-a1b2c3");
  assert.equal(isValidSlug(slug), true);
});

test("isValidSlug rejects unsafe values", () => {
  assert.equal(isValidSlug("Acme"), false);
  assert.equal(isValidSlug("acme_tractors"), false);
  assert.equal(isValidSlug("acme--tractors"), false);
  assert.equal(isValidSlug("-acme"), false);
  assert.equal(isValidSlug("acme tractors"), false);
  assert.equal(isValidSlug("a".repeat(65)), false);
});

test("isValidSlug accepts a normal slug", () => {
  assert.equal(isValidSlug("acme-tractors-2"), true);
});
