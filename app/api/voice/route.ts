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
  if (!data.user) return NextResponse.json({ error: "Please sign in to use Voice Studio." }, { status: 401 });

  const apiKey = (process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY2)?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Voice Studio needs OPENAI_API_KEY in Vercel Project Settings → Environment Variables, then redeploy." },
      { status: 503 },
    );
  }

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }

  const input = body as { text?: unknown; voice?: unknown; instructions?: unknown };
  const text = typeof input.text === "string" ? input.text.trim() : "";
  const voice = typeof input.voice === "string" ? input.voice : "nova";
  const instructions = typeof input.instructions === "string" ? input.instructions.trim() : "";

  if (!text) return NextResponse.json({ error: "Please enter a script." }, { status: 400 });
  if (text.length > 5000) return NextResponse.json({ error: "Please keep your script under 5,000 characters." }, { status: 400 });
  if (!ALLOWED_VOICES.has(voice)) return NextResponse.json({ error: "Choose a supported voice." }, { status: 400 });

  const upstream = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini-tts",
      voice,
      input: text,
      instructions: instructions.slice(0, 300) || "Speak naturally and clearly.",
      response_format: "mp3",
    }),
    cache: "no-store",
  });

  if (!upstream.ok) {
    const detail = await upstream.text();
    let message = "OpenAI voice generation failed.";
    try {
      const parsed = JSON.parse(detail) as { error?: { message?: string } };
      message = parsed.error?.message || message;
    } catch { /* keep the safe generic message */ }
    return NextResponse.json({ error: message }, { status: upstream.status >= 500 ? 502 : upstream.status });
  }

  const audio = await upstream.arrayBuffer();
  return new Response(audio, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Disposition": 'attachment; filename="cloneai-voice.mp3"',
      "Cache-Control": "private, no-store",
    },
  });
}
