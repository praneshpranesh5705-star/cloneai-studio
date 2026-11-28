import { NextResponse } from "next/server";
import { createClientOrNull } from "@/lib/supabase/server";
import { avatarVideoProvider } from "@/lib/avatar";
import { downloadGeminiVideo } from "@/lib/avatar-providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const supabase = await createClientOrNull();
  if (!supabase) {
    return NextResponse.json(
      {
        error:
          "This deployment has no database configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, then redeploy.",
      },
      { status: 503 },
    );
  }
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Please sign in to download this video." }, { status: 401 });
  }

  const { provider, missing } = avatarVideoProvider();
  if (!provider) {
    return NextResponse.json(
      { error: "Talking video needs a Gemini key. Add " + missing.join(" or ") + "." },
      { status: 503 },
    );
  }

  const id = new URL(request.url).searchParams.get("id") || "";
  if (!/^[A-Za-z0-9_-]{4,100}$/.test(id)) {
    return NextResponse.json({ error: "Invalid video file ID." }, { status: 400 });
  }

  try {
    const key = process.env.GEMINI_API_KEY?.trim() || "";
    const upstream = await downloadGeminiVideo(id, key);

    return new Response(upstream.body, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": 'attachment; filename="cloneai-talking-avatar.mp4"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch (cause) {
    const error = cause as Error & { status?: number };
    return NextResponse.json(
      { error: error?.message || "Could not download the generated video." },
      { status: error?.status ?? 502 },
    );
  }
}
