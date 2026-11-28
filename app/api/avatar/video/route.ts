import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type VideoOutputPart = { type?: string; uri?: string };
type VideoStep = { content?: VideoOutputPart[] };
type VideoInteractionResponse = {
  id?: string;
  status?: string;
  errors?: Array<{ message?: string }>;
  output_video?: { uri?: string };
  steps?: VideoStep[];
  error?: { message?: string };
};

export const runtime = "nodejs";
export const maxDuration = 60;

async function authorized() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
}

export async function POST(request: Request) {
  const user = await authorized();
  if (!user) return NextResponse.json({ error: "Please sign in to use Avatar Studio." }, { status: 401 });
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return NextResponse.json({ error: "Add GEMINI_API_KEY in Vercel Environment Variables, then redeploy." }, { status: 503 });

  let body: { data?: unknown; mimeType?: unknown; script?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }
  const image = typeof body.data === "string" ? body.data : "";
  const mimeType = typeof body.mimeType === "string" ? body.mimeType : "";
  const script = typeof body.script === "string" ? body.script.trim() : "";
  if (!image || image.length > 5_600_000 || !["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
    return NextResponse.json({ error: "Upload a valid photo under 4 MB." }, { status: 400 });
  }
  if (!script || script.length > 1200) return NextResponse.json({ error: "Enter a speaking script under 1,200 characters." }, { status: 400 });

  const prompt = `Create a natural, realistic talking-head avatar video using the supplied adult person's photo as the visual reference. The person looks into the camera, speaks the following exact script with natural facial expressions, clear audible speech and synchronized lip movement. Keep the person's appearance consistent with the reference. Script: "${script}". Do not add subtitles, captions, logos or other people.`;
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      model: "gemini-omni-1.1-flash",
      input: [
        { type: "image", data: image, mime_type: mimeType },
        { type: "text", text: prompt },
      ],
      generation_config: { video_config: { task: "image_to_video" } },
      response_format: { type: "video", delivery: "uri", aspect_ratio: "9:16", duration: "5s", resolution: "360p" },
      background: true,
      store: true,
      stream: false,
    }),
    signal: AbortSignal.timeout(55000),
  });
  const result = await response.json().catch(() => ({})) as VideoInteractionResponse;
  if (!response.ok) {
    return NextResponse.json({ error: result?.error?.message || `Gemini video request failed (HTTP ${response.status}). Check that your Gemini project has paid-tier access to Gemini Omni Flash.` }, { status: response.status === 429 ? 429 : 502 });
  }
  if (!result.id) return NextResponse.json({ error: "The video provider did not return a generation ID." }, { status: 502 });
  return NextResponse.json({ id: result.id, status: result.status || "in_progress" });
}

export async function GET(request: Request) {
  const user = await authorized();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return NextResponse.json({ error: "GEMINI_API_KEY is not configured." }, { status: 503 });
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!/^v1_[A-Za-z0-9_-]{8,200}$/.test(id)) return NextResponse.json({ error: "Invalid video job ID." }, { status: 400 });

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/interactions/${encodeURIComponent(id)}`, {
    headers: { "x-goog-api-key": key }, cache: "no-store", signal: AbortSignal.timeout(15000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) return NextResponse.json({ error: result?.error?.message || "Could not check video generation status." }, { status: 502 });
  if (result.status === "failed") return NextResponse.json({ status: "failed", error: result.errors?.[0]?.message || "Video generation failed." });
  if (result.status !== "completed") return NextResponse.json({ status: "processing" });

  const uri = result.output_video?.uri || result.steps?.flatMap((step) => step.content || []).find((part) => part.type === "video" && part.uri)?.uri;
  const match = typeof uri === "string" ? uri.match(/\/files\/([A-Za-z0-9_-]+)/) : null;
  if (!match) return NextResponse.json({ error: "The video completed but no downloadable file was returned." }, { status: 502 });
  const fileId = match[1];
  const fileInfoResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/files/${fileId}`, {
    headers: { "x-goog-api-key": key }, cache: "no-store",
  });
  const fileInfo = await fileInfoResponse.json().catch(() => ({}));
  if (!fileInfoResponse.ok) return NextResponse.json({ error: "The generated video file is not available yet." }, { status: 502 });
  if (fileInfo.state !== "ACTIVE") {
    if (fileInfo.state === "FAILED") return NextResponse.json({ status: "failed", error: "The video file could not be processed." });
    return NextResponse.json({ status: "processing" });
  }
  return NextResponse.json({ status: "completed", downloadUrl: `/api/avatar/video/download?id=${encodeURIComponent(fileId)}` });
}
