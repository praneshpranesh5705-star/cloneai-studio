import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { completeText, CompleteTimeoutError, studioProvider } from "@/lib/complete";
import {
  buildUserMessage,
  checkHtml,
  cleanHtml,
  deriveTitle,
  MAX_OUTPUT,
  sanitizeHtml,
  SYSTEM_PROMPT,
  validateWebsiteInput,
} from "@/lib/website";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Please sign in to use Website Builder." }, { status: 401 });
  }

  const { provider, model, available, missing } = studioProvider();
  if (provider === "demo") {
    return NextResponse.json(
      {
        error:
          "Website Builder needs a real model. Add one of these to your Vercel project and redeploy: " +
          missing.join(", ") +
          ".",
        missing,
      },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = validateWebsiteInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const result = await completeText({
      provider,
      model,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserMessage(parsed.value) }],
      temperature: 0.7,
      maxTokens: 8192,
      maxChars: MAX_OUTPUT * 2,
      timeoutMs: 110_000,
    });

    if (result.truncated) {
      return NextResponse.json(
        { error: "The generated page was too large and was cut off. Try a simpler brief." },
        { status: 502 },
      );
    }

    const html = sanitizeHtml(cleanHtml(result.text));
    const check = checkHtml(html);
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 502 });
    }

    return NextResponse.json({
      html,
      title: deriveTitle(html, parsed.value.prompt),
      provider,
      model,
      available,
    });
  } catch (cause) {
    if (cause instanceof CompleteTimeoutError) {
      return NextResponse.json({ error: cause.message }, { status: 504 });
    }
    const message =
      cause instanceof Error ? cause.message : "Website generation failed. Please try again.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
