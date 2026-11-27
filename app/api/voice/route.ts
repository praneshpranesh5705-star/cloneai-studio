import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VOICES: Record<string, string> = {
  alloy: "Puck",
  ash: "Charon",
  coral: "Kore",
  echo: "Orus",
  fable: "Leda",
  nova: "Aoede",
  onyx: "Fenrir",
  sage: "Schedar",
  shimmer: "Zephyr",
};

function pcmToWav(pcm: Buffer, sampleRate = 24000) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Please sign in to use Voice Studio." }, { status: 401 });
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Gemini is not connected. Add GEMINI_API_KEY in your Vercel project environment variables, then redeploy." },
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
  if (!VOICES[voice]) return NextResponse.json({ error: "Choose a supported voice." }, { status: 400 });
  if (instructions.length > 500) return NextResponse.json({ error: "Speaking style must be 500 characters or fewer." }, { status: 400 });

  try {
    const prompt = instructions
      ? `Read the following text aloud. Speaking direction: ${instructions}\n\nText to speak exactly:\n${text}`
      : `Read the following text aloud naturally and clearly. Speak the text exactly as written:\n\n${text}`;

    const upstream = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-lite-tts:generateContent",
      {
        method: "POST",
        headers: {
          "x-goog-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: VOICES[voice] },
              },
            },
          },
        }),
        signal: AbortSignal.timeout(120000),
      },
    );

    const payload = await upstream.json().catch(() => null) as {
      error?: { message?: string };
      candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> } }>;
    } | null;

    if (!upstream.ok) {
      const message = payload?.error?.message || `Gemini audio request failed (HTTP ${upstream.status}).`;
      return NextResponse.json(
        { error: message },
        { status: upstream.status === 429 ? 429 : upstream.status === 400 ? 400 : 502 },
      );
    }

    const audioPart = payload?.candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.data)?.inlineData;
    if (!audioPart?.data) {
      return NextResponse.json(
        { error: "Gemini did not return audio. Try a shorter script or another voice." },
        { status: 502 },
      );
    }

    const pcm = Buffer.from(audioPart.data, "base64");
    if (!pcm.length) {
      return NextResponse.json({ error: "Gemini returned an empty audio file." }, { status: 502 });
    }

    const wav = pcmToWav(pcm);
    return new Response(new Uint8Array(wav), {
      headers: {
        "Content-Type": "audio/wav",
        "Content-Disposition": 'inline; filename="cloneai-studio-voice.wav"',
        "Cache-Control": "no-store",
      },
    });
  } catch (cause) {
    const message = cause instanceof Error && cause.name === "TimeoutError"
      ? "Voice generation timed out. Try a shorter script."
      : "Could not reach Gemini. Please try again.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
