import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  MAX_UPLOAD_BYTES,
  extractDocumentText,
  formatBytes,
  normaliseText,
  sniffKind,
  titleFromFilename,
} from "../lib/extract";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => new Uint8Array(readFileSync(join(here, "fixtures", name)));

// --- pure helpers ---------------------------------------------------------

test("titleFromFilename strips the extension and tidies separators", () => {
  assert.equal(titleFromFilename("Returns_Policy-2024.pdf"), "Returns Policy 2024");
  assert.equal(titleFromFilename("faq.docx"), "faq");
  assert.equal(titleFromFilename("  spaced   out .PDF"), "spaced out");
  assert.equal(titleFromFilename("C:\\docs\\Employee Handbook.docx"), "Employee Handbook");
});

test("titleFromFilename never returns an empty title", () => {
  assert.equal(titleFromFilename(".pdf"), "Untitled document");
  assert.equal(titleFromFilename("___"), "Untitled document");
});

test("titleFromFilename caps the title at 160 characters", () => {
  assert.equal(titleFromFilename("a".repeat(300) + ".pdf").length, 160);
});

test("formatBytes renders readable sizes", () => {
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(2048), "2.0 KB");
  assert.equal(formatBytes(3 * 1024 * 1024), "3.0 MB");
});

test("normaliseText collapses whitespace but keeps paragraph breaks", () => {
  assert.equal(normaliseText("a\r\n\r\n\r\n\r\nb"), "a\n\nb");
  assert.equal(normaliseText("  lots    of   space  "), "lots of space");
  assert.equal(normaliseText("keep\n\n\n\n\nbreaks"), "keep\n\nbreaks");
  assert.equal(normaliseText("null\u0000byte"), "nullbyte");
  assert.equal(normaliseText("   \n\n  "), "");
});

test("sniffKind identifies formats from magic bytes, not the extension", () => {
  assert.equal(sniffKind(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])), "pdf");
  assert.equal(sniffKind(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0])), "legacy-doc");
  assert.equal(sniffKind(new Uint8Array([0x50, 0x4b, 0x03, 0x04])), "zip-other");
  assert.equal(sniffKind(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), "unknown");
});

// --- real extraction ------------------------------------------------------

test("extracts text from a real PDF", async () => {
  const result = await extractDocumentText(fixture("sample.pdf"), "sample.pdf");
  assert.ok(result.ok, `expected success, got ${JSON.stringify(result)}`);
  if (result.ok) {
    assert.equal(result.kind, "pdf");
    assert.equal(result.pages, 1);
    assert.match(result.text, /Returns Policy/);
    assert.match(result.text, /30 days of purchase/);
    assert.match(result.text, /receipt is required/);
  }
});

test("extracts text from a real DOCX", async () => {
  const result = await extractDocumentText(fixture("sample.docx"), "sample.docx");
  assert.ok(result.ok, `expected success, got ${JSON.stringify(result)}`);
  if (result.ok) {
    assert.equal(result.kind, "docx");
    assert.match(result.text, /Returns Policy/);
    assert.match(result.text, /30 days of purchase/);
  }
});

test("a PDF with no selectable text reports no_text, not a crash", async () => {
  const result = await extractDocumentText(fixture("blank.pdf"), "blank.pdf");
  assert.ok(!result.ok);
  if (!result.ok) {
    assert.equal(result.code, "no_text");
    assert.match(result.message, /no selectable text/i);
    assert.match(result.message, /OCR/i);
  }
});

// --- failure paths --------------------------------------------------------

test("rejects an empty file", async () => {
  const result = await extractDocumentText(new Uint8Array(0), "empty.pdf");
  assert.ok(!result.ok);
  if (!result.ok) assert.equal(result.code, "empty_file");
});

test("rejects a file over the size limit before parsing", async () => {
  const oversized = new Uint8Array(MAX_UPLOAD_BYTES + 1);
  oversized.set([0x25, 0x50, 0x44, 0x46, 0x2d]);
  const result = await extractDocumentText(oversized, "big.pdf");
  assert.ok(!result.ok);
  if (!result.ok) {
    assert.equal(result.code, "too_large");
    assert.match(result.message, /4\.0 MB/);
  }
});

test("rejects a PNG renamed to .pdf with a clear message", async () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const result = await extractDocumentText(png, "photo.pdf");
  assert.ok(!result.ok);
  if (!result.ok) {
    assert.equal(result.code, "unsupported_type");
    assert.match(result.message, /Only PDF and DOCX/);
  }
});

test("rejects a legacy .doc with advice to re-save as .docx", async () => {
  const doc = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  const result = await extractDocumentText(doc, "old.doc");
  assert.ok(!result.ok);
  if (!result.ok) {
    assert.equal(result.code, "unsupported_type");
    assert.match(result.message, /\.docx/);
  }
});

test("rejects a corrupt PDF without throwing", async () => {
  const fake = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x67, 0x61, 0x72, 0x62, 0x61, 0x67, 0x65]);
  const result = await extractDocumentText(fake, "broken.pdf");
  assert.ok(!result.ok);
  if (!result.ok) assert.equal(result.code, "corrupt");
});
