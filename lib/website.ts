/**
 * Website Builder domain logic.
 *
 * Kept out of the route handler so it can be tested without a server, a
 * database or a model. The route does auth and I/O; everything that decides
 * what a valid page is lives here.
 */

export const MAX_PROMPT = 2500;
export const MAX_REVISION = 1200;
export const MAX_PREVIOUS_HTML = 45_000;
export const MAX_OUTPUT = 60_000;
export const MAX_TITLE = 120;

export type WebsiteInput = {
  prompt: string;
  previousHtml: string;
  revision: string;
};

export type ValidationResult =
  | { ok: true; value: WebsiteInput }
  | { ok: false; error: string };

export function validateWebsiteInput(raw: unknown): ValidationResult {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "Invalid request body." };
  }
  const body = raw as Record<string, unknown>;

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const previousHtml = typeof body.previousHtml === "string" ? body.previousHtml : "";
  const revision = typeof body.revision === "string" ? body.revision.trim() : "";

  if (!prompt) {
    return { ok: false, error: "Describe the website you want to build." };
  }
  if (prompt.length > MAX_PROMPT) {
    return { ok: false, error: `Description must be ${MAX_PROMPT} characters or fewer.` };
  }
  if (previousHtml.length > MAX_PREVIOUS_HTML) {
    return {
      ok: false,
      error: "The current page is too large to revise. Start a fresh generation.",
    };
  }
  if (revision.length > MAX_REVISION) {
    return { ok: false, error: `Edit instruction must be ${MAX_REVISION} characters or fewer.` };
  }
  if (previousHtml && !revision) {
    return { ok: false, error: "Describe what you want to change first." };
  }

  return { ok: true, value: { prompt, previousHtml, revision } };
}

export const SYSTEM_PROMPT = [
  "You are a senior web designer and frontend engineer inside CloneAI Studio.",
  "Return one complete, standalone HTML document only. No Markdown fences, no commentary before or after.",
  "Start with <!DOCTYPE html> and include <html>, <head> and <body>.",
  "Put all CSS inside a single <style> element in the head. Do not use external stylesheets.",
  "Use semantic HTML, a mobile-first responsive layout, accessible contrast, visible focus states and alt text on images.",
  "Do not use external JavaScript libraries, external scripts, iframes, or any network requests.",
  "Do not include forms that submit to external services, tracking pixels, or analytics.",
  "Use inline SVG for icons and CSS gradients for imagery. Avoid remote image URLs.",
  "Include a <meta name=\"viewport\"> tag and a descriptive <title>.",
  "Never include API keys, secrets, credentials or server-side code in the page.",
  "If revising an existing page, preserve its content and purpose and apply only the requested change.",
].join(" ");

export function buildUserMessage(input: WebsiteInput): string {
  if (input.previousHtml) {
    return [
      `Website brief: ${input.prompt}`,
      "",
      `Requested change: ${input.revision}`,
      "",
      "Current HTML:",
      input.previousHtml,
    ].join("\n");
  }
  return `Create a complete website from this brief:\n${input.prompt}`;
}

/**
 * Strip the wrappers a model adds even when told not to: Markdown fences,
 * a leading "Here is your page:" line, and trailing prose after </html>.
 */
export function cleanHtml(raw: string): string {
  let value = raw.trim();

  // ```html ... ``` or ``` ... ```
  const fenced = value.match(/^```(?:html|HTML)?\s*\n?([\s\S]*?)\n?```\s*$/);
  if (fenced) value = fenced[1].trim();

  // Cut anything before the doctype or opening <html>.
  const start = value.search(/<!doctype\s+html|<html[\s>]/i);
  if (start > 0) value = value.slice(start);

  // Cut anything after the closing </html>.
  const end = value.toLowerCase().lastIndexOf("</html>");
  if (end !== -1) value = value.slice(0, end + "</html>".length);

  return value.trim();
}

export type HtmlCheck = { ok: true } | { ok: false; error: string };

/** A page is only usable if it is a whole document, not a fragment. */
export function checkHtml(html: string): HtmlCheck {
  if (!html) {
    return { ok: false, error: "The model returned an empty page. Try a more specific brief." };
  }
  if (!/<html[\s>]/i.test(html) || !/<body[\s>]/i.test(html)) {
    return {
      ok: false,
      error: "The model did not return a complete HTML page. Try a more specific brief.",
    };
  }
  if (html.length > MAX_OUTPUT) {
    return {
      ok: false,
      error: "The generated page is too large. Try a shorter, simpler brief.",
    };
  }
  return { ok: true };
}

/**
 * Remove the things that would let a generated page act on the visitor or
 * phone home. The preview iframe is already sandboxed, but a published page is
 * served from our own origin, so the document itself has to be clean.
 */
export function sanitizeHtml(html: string): string {
  return html
    // Scripts are not needed for a static landing page and are the main risk.
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<script\b[^>]*\/>/gi, "")
    // Inline event handlers: onclick=, onerror=, onload= ...
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "")
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "")
    // javascript: and data:text/html URLs.
    .replace(/\s(href|src)\s*=\s*"\s*javascript:[^"]*"/gi, ' $1="#"')
    .replace(/\s(href|src)\s*=\s*'\s*javascript:[^']*'/gi, " $1='#'")
    .replace(/\s(href|src)\s*=\s*"\s*data:text\/html[^"]*"/gi, ' $1="#"')
    // Nested frames.
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, "")
    .replace(/<iframe\b[^>]*\/>/gi, "")
    // Meta refresh redirects.
    .replace(/<meta[^>]+http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, "");
}

/** A readable title from the page's <title>, falling back to the brief. */
export function deriveTitle(html: string, prompt: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const fromTitle = match?.[1]
    ?.replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

  const candidate = fromTitle || prompt.split(/[.\n]/)[0]?.trim() || "Untitled page";
  return candidate.slice(0, MAX_TITLE);
}

/**
 * A URL-safe slug. Deliberately conservative: lowercase letters, digits and
 * single hyphens, so it is safe in a path segment and in a database index.
 */
export function slugify(value: string): string {
  const base = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return base || "page";
}

/** Append a short random suffix so two pages with the same title coexist. */
export function uniqueSlug(title: string, suffix: string): string {
  const tail = suffix.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6) || "x";
  return `${slugify(title)}-${tail}`;
}

export function isValidSlug(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 64;
}
