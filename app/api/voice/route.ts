import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_VOICES = new Set([
  "alloy", "ash", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer",
]);

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Please sign in to use Voice Studio." }, { status: 401 });
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Voice Studio is not connected yet. Add OPENAI_API_KEY in Vercel → Project Settings → Environment Variables, then redeploy." },
      { status: 503 },
    );
  }

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const input = body as { text?: unknown; voice?: unknown; instructions?: unknown };
  const text = typeof input.text === "string" ? input.text.trim() : "";
  const voice = typeof input.voice === "string" ? input.voice : "nova";
  const instructions = typeof input.instructions === "string" ? input.instructions.trim() : "";

  if (!text) return NextResponse.json({ error: "Enter a script first." }, { status: 400 });
  if (text.length > 5000) return NextResponse.json({ error: "Script must be 5,000 characters or fewer." }, { status: 400 });
  if (!ALLOWED_VOICES.has(voice)) return NextResponse.json({ error: "Choose a supported voice." }, { status: 400 });
  if (instructions.length > 500) return NextResponse.json({ error: "Speaking style must be 500 characters or fewer." }, { status: 400 });

  try {
    const upstream = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice,
        input: text,
        instructions: instructions || "Speak naturally and clearly.",
        response_format: "mp3",
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (!upstream.ok) {
      const raw = await upstream.text();
      let message = `OpenAI audio request failed (HTTP ${upstream.status}).`;
      try {
        const parsed = JSON.parse(raw) as { error?: { message?: string } };
        if (parsed.error?.message) message = parsed.error.message;
      } catch { /* Keep the safe status message. */ }
      return NextResponse.json({ error: message }, { status: upstream.status === 429 ? 429 : 502 });
    }

    const audio = await upstream.arrayBuffer();
    if (!audio.byteLength) return NextResponse.json({ error: "The audio provider returned an empty file." }, { status: 502 });

    return new Response(audio, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Disposition": 'inline; filename="cloneai-studio-voice.mp3"',
        "Cache-Control": "no-store",
      },
    });
  } catch (cause) {
    const message = cause instanceof Error && cause.name === "TimeoutError"
      ? "Voice generation timed out. Try a shorter script."
      : "Could not reach the audio provider. Please try again.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
