import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type GeminiImagePart = {
  inlineData?: { data?: string; mimeType?: string };
  inline_data?: { data?: string; mime_type?: string };
};
type GeminiImageCandidate = { content?: { parts?: GeminiImagePart[] } };
type GeminiImageResponse = { error?: { message?: string }; candidates?: GeminiImageCandidate[] };

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: "Please sign in to use Avatar Studio." }, { status: 401 });

  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return NextResponse.json({ error: "Add GEMINI_API_KEY in Vercel Environment Variables, then redeploy." }, { status: 503 });

  let body: { prompt?: unknown; style?: unknown; aspectRatio?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const style = typeof body.style === "string" ? body.style : "Photorealistic";
  const aspectRatio = typeof body.aspectRatio === "string" && ["1:1", "3:4", "9:16", "16:9"].includes(body.aspectRatio) ? body.aspectRatio : "3:4";
  if (!prompt || prompt.length > 1500) return NextResponse.json({ error: "Enter an avatar description under 1,500 characters." }, { status: 400 });

  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: `Generate one high-quality AI avatar portrait. Style: ${style}. Aspect ratio: ${aspectRatio}. Prompt: ${prompt}. Create the image itself, not a description. Do not add text or watermarks.` }] }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"], imageConfig: { aspectRatio } },
    }),
    signal: AbortSignal.timeout(55000),
  });
  const result = await response.json().catch(() => ({})) as GeminiImageResponse;
  if (!response.ok) {
    const message = result?.error?.message || `Gemini image generation failed (HTTP ${response.status}).`;
    return NextResponse.json({ error: message }, { status: response.status === 429 ? 429 : 502 });
  }
  const parts = result?.candidates?.flatMap((candidate) => candidate.content?.parts || []) || [];
  const image = parts.find((part) => part.inlineData?.data || part.inline_data?.data);
  const imageData = image?.inlineData?.data || image?.inline_data?.data;
  const mimeType = image?.inlineData?.mimeType || image?.inline_data?.mime_type || "image/png";
  if (!imageData) return NextResponse.json({ error: "The image model returned no image. Try a more specific prompt." }, { status: 502 });
  return NextResponse.json({ image: imageData, mimeType });
}
