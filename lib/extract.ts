/**
 * Text extraction for uploaded knowledge-base files.
 *
 * Runs on the server only. Two formats are supported:
 *   - PDF  via pdfjs-dist (legacy build, works on Node 20)
 *   - DOCX via mammoth
 *
 * Every failure path returns a typed code plus a message written for a person,
 * never a stack trace. The caller decides the HTTP status.
 */

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // 4 MB — Vercel caps request bodies at 4.5 MB
export const MAX_EXTRACTED_CHARS = 200_000; // matches MAX_DOC_CONTENT in validation.ts
export const ACCEPTED_EXTENSIONS = [".pdf", ".docx"] as const;

export type ExtractErrorCode =
  | "unsupported_type"
  | "too_large"
  | "empty_file"
  | "no_text"
  | "corrupt"
  | "too_much_text";

export type ExtractResult =
  | { ok: true; text: string; kind: "pdf" | "docx"; pages: number | null }
  | { ok: false; code: ExtractErrorCode; message: string };

/** Human-readable size, e.g. "3.2 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Identify a file from its leading bytes rather than trusting the extension.
 * A .pdf that is really a ZIP is a common mistake and deserves a clear message.
 */
export function sniffKind(bytes: Uint8Array): "pdf" | "docx" | "zip-other" | "legacy-doc" | "unknown" {
  const startsWith = (sig: number[], offset = 0) =>
    sig.every((byte, i) => bytes[offset + i] === byte);

  if (startsWith([0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf"; // %PDF-
  if (startsWith([0xd0, 0xcf, 0x11, 0xe0])) return "legacy-doc"; // OLE2 (.doc/.xls/.ppt)
  if (startsWith([0x50, 0x4b, 0x03, 0x04]) || startsWith([0x50, 0x4b, 0x05, 0x06])) {
    // A ZIP container. DOCX keeps its main part at word/document.xml, and that
    // path appears verbatim in the central directory, so a byte scan is enough
    // to tell a Word file from an .xlsx or .pptx.
    const needle = "word/document.xml";
    const haystack = Buffer.from(bytes).toString("latin1");
    return haystack.includes(needle) ? "docx" : "zip-other";
  }
  return "unknown";
}

/**
 * Turn a filename into a sensible document title.
 * "Returns_Policy-2024.pdf" -> "Returns Policy 2024"
 */
export function titleFromFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  const withoutExt = base.replace(/\.(pdf|docx)$/i, "");
  const cleaned = withoutExt
    .replace(/[_]+/g, " ")
    .replace(/\s*-\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "Untitled document";
  return cleaned.slice(0, 160);
}

/**
 * Normalise extracted text: unify line endings, drop control characters that
 * would corrupt the prompt, and collapse runs of blank lines. Paragraph breaks
 * are preserved because retrieval chunks on them.
 */
export function normaliseText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "")
    // Keep tab and newline; drop other C0 controls.
    .replace(/[\u0001-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractPdf(bytes: Uint8Array): Promise<{ text: string; pages: number }> {
  // The legacy build ships a Node-compatible bundle; the default build expects
  // browser globals. Imported lazily so the module stays cheap to load.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({
    data: bytes,
    useSystemFonts: true,
    isEvalSupported: false,
  }).promise;

  const parts: string[] = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    const line = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    parts.push(line);
    page.cleanup();
  }
  await doc.destroy();
  return { text: parts.join("\n\n"), pages: doc.numPages };
}

async function extractDocx(bytes: Uint8Array): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
  return result.value;
}

/**
 * Extract plain text from an uploaded PDF or DOCX.
 * Never throws: every failure is returned as a typed result.
 */
export async function extractDocumentText(
  bytes: Uint8Array,
  filename: string,
): Promise<ExtractResult> {
  if (bytes.byteLength === 0) {
    return { ok: false, code: "empty_file", message: "That file is empty." };
  }

  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      code: "too_large",
      message: `That file is ${formatBytes(bytes.byteLength)}. The limit is ${formatBytes(MAX_UPLOAD_BYTES)}.`,
    };
  }

  const kind = sniffKind(bytes);

  if (kind === "legacy-doc") {
    return {
      ok: false,
      code: "unsupported_type",
      message:
        "That looks like an old Word .doc file. Open it in Word or Google Docs and save it as .docx, then upload again.",
    };
  }

  if (kind === "zip-other") {
    return {
      ok: false,
      code: "unsupported_type",
      message:
        "That is a spreadsheet or presentation, not a Word document. Only PDF and DOCX files can be added.",
    };
  }

  if (kind === "unknown") {
    const ext = filename.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? "that file";
    return {
      ok: false,
      code: "unsupported_type",
      message: `Only PDF and DOCX files are supported — ${ext} is not.`,
    };
  }

  let raw: string;
  let pages: number | null = null;

  try {
    if (kind === "pdf") {
      const result = await extractPdf(bytes);
      raw = result.text;
      pages = result.pages;
    } else {
      raw = await extractDocx(bytes);
    }
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : "";
    // A password-protected PDF is the most common cause of a parse failure.
    if (/password/i.test(detail)) {
      return {
        ok: false,
        code: "corrupt",
        message: "That PDF is password-protected. Remove the password and upload it again.",
      };
    }
    return {
      ok: false,
      code: "corrupt",
      message:
        "That file could not be read. It may be damaged or not really a " +
        (kind === "pdf" ? "PDF" : "DOCX") +
        " file.",
    };
  }

  const text = normaliseText(raw);

  if (!text) {
    return {
      ok: false,
      code: "no_text",
      message:
        kind === "pdf"
          ? "That PDF has no selectable text — it is probably a scan or a photo. Copy the text out, or run it through OCR first, then paste it in."
          : "That Word document appears to be empty.",
    };
  }

  if (text.length > MAX_EXTRACTED_CHARS) {
    return {
      ok: false,
      code: "too_much_text",
      message: `That file contains ${text.length.toLocaleString()} characters of text. The limit is ${MAX_EXTRACTED_CHARS.toLocaleString()} — split it into smaller documents.`,
    };
  }

  return { ok: true, text, kind, pages };
}
