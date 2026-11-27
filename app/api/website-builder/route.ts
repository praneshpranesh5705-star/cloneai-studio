import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PROMPT = 2500;
const MAX_PREVIOUS_HTML = 45000;
const MAX_OUTPUT = 60000;

function cleanHtml(value: string) {
  return value
    .trim()
    .replace(/^\x60{3}(?:html)?\s*/i, "")
    .replace(/\s*\x60{3}$/i, "")
    .trim();
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Please sign in to use Website Builder." }, { status: 401 });
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Gemini is not connected. Add GEMINI_API_KEY to your Vercel project and redeploy." },
      { status: 503 },
    );
  }

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const input = body as { prompt?: unknown; previousHtml?: unknown; revision?: unknown };
  const prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";
  const previousHtml = typeof input.previousHtml === "string" ? input.previousHtml : "";
  const revision = typeof input.revision === "string" ? input.revision.trim() : "";

  if (!prompt) return NextResponse.json({ error: "Describe the website you want to build." }, { status: 400 });
  if (prompt.length > MAX_PROMPT) return NextResponse.json({ error: `Description must be ${MAX_PROMPT} characters or fewer.` }, { status: 400 });
  if (previousHtml.length > MAX_PREVIOUS_HTML) return NextResponse.json({ error: "The current website is too large to revise. Start a fresh generation." }, { status: 400 });
  if (revision.length > 1200) return NextResponse.json({ error: "Edit instruction must be 1,200 characters or fewer." }, { status: 400 });

  const system = [
    "You are a senior web designer and frontend engineer inside CloneAI Studio.",
    "Return one complete, standalone HTML document only. Do not use Markdown fences or explanations.",
    "Put all CSS inside a style element. Use semantic HTML, accessible contrast, responsive mobile-first layout, and polished professional design.",
    "Do not use external JavaScript libraries, external scripts, iframes, forms that submit to external services, or network requests.",
    "Use inline SVG for simple icons and CSS shapes. Use safe placeholder gradients or remote image URLs only when needed.",
    "The result must work when placed directly into an iframe srcdoc. Include viewport metadata and a descriptive title.",
    "Do not include instructions, secrets, API keys, or server-side code in the generated page.",
    "If revising an existing page, preserve its overall content and improve it according to the user's edit instruction.",
  ].join(" ");

  const userContent = previousHtml
    ? `Website brief: ${prompt}\n\nRequested revision: ${revision || "Improve the website while preserving its purpose."}\n\nCurrent HTML:\n${previousHtml}`
    : `Create a complete website from this brief:\n${prompt}`;

  try {
    const model = process.env.GEMINI_WEBSITE_MODEL?.trim() || "gemini-3.8-flash";
    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "x-goog-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: userContent }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 8192,
            responseMimeType: "text/plain",
          },
        }),
        signal: AbortSignal.timeout(120000),
      },
    );

    const payload = await upstream.json().catch(() => null) as {
      error?: { message?: string };
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    } | null;

    if (!upstream.ok) {
      const message = payload?.error?.message || `Gemini website generation failed (HTTP ${upstream.status}).`;
      return NextResponse.json({ error: message }, { status: upstream.status === 429 ? 429 : upstream.status === 400 ? 400 : 502 });
    }

    const generated = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n") || "";
    const html = cleanHtml(generated);
    if (!html || !/<html[\s>]/i.test(html) || !/<body[\s>]/i.test(html)) {
      return NextResponse.json({ error: "Gemini did not return a complete HTML page. Please try a more specific prompt." }, { status: 502 });
    }
    if (html.length > MAX_OUTPUT) {
      return NextResponse.json({ error: "The generated page is too large. Try a shorter, simpler website brief." }, { status: 502 });
    }

    return NextResponse.json({ html, model });
  } catch (cause) {
    const message = cause instanceof Error && cause.name === "TimeoutError"
      ? "Website generation timed out. Try a simpler prompt."
      : "Could not reach Gemini. Please try again.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
