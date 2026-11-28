import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "Please sign in to download this video." }, { status: 401 });
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return NextResponse.json({ error: "GEMINI_API_KEY is not configured." }, { status: 503 });
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!/^[A-Za-z0-9_-]{4,100}$/.test(id)) return NextResponse.json({ error: "Invalid video file ID." }, { status: 400 });
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/files/${id}:download?alt=media`, {
    headers: { "x-goog-api-key": key }, cache: "no-store", signal: AbortSignal.timeout(55000),
  });
  if (!response.ok) return NextResponse.json({ error: "Could not download the generated video." }, { status: 502 });
  return new Response(response.body, { headers: { "Content-Type": "video/mp4", "Content-Disposition": 'attachment; filename="cloneai-talking-avatar.mp4"', "Cache-Control": "private, no-store" } });
}
