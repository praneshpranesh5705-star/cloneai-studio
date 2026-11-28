import { NextResponse } from "next/server";
import { createClientOrNull } from "@/lib/supabase/server";
import { avatarVideoProvider, validateVideoRequest } from "@/lib/avatar";
import {
  confirmGeminiVideoFile,
  pollGeminiVideo,
  startGeminiVideo,
} from "@/lib/avatar-providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Returns the signed-in user, or null. Distinguishes "no database" from "no session". */
async function authorized(): Promise<{ user: unknown } | { unconfigured: true }> {
  const supabase = await createClientOrNull();
  if (!supabase) return { unconfigured: true };
  const { data } = await supabase.auth.getUser();
  return { user: data.user };
}

const UNCONFIGURED = {
  error:
    "This deployment has no database configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, then redeploy.",
};

function failure(cause: unknown, fallback: string) {
  const error = cause as Error & { status?: number };
  const message =
    error?.name === "TimeoutError"
      ? "The video provider took too long to respond. Try again."
      : error?.message || fallback;
  return NextResponse.json({ error: message }, { status: error?.status ?? 502 });
}

/** Start a talking-avatar video job. */
export async function POST(request: Request) {
  const auth = await authorized();
  if ("unconfigured" in auth) return NextResponse.json(UNCONFIGURED, { status: 503 });
  if (!auth.user) {
    return NextResponse.json({ error: "Please sign in to use Avatar Studio." }, { status: 401 });
  }

  const { provider, model, missing } = avatarVideoProvider();
  if (!provider) {
    return NextResponse.json(
      {
        error:
          "Talking video needs a Gemini key. Add " +
          missing.join(" or ") +
          " in Vercel \u2192 Settings \u2192 Environment Variables, then redeploy.",
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

  const parsed = validateVideoRequest(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const key = process.env.GEMINI_API_KEY?.trim() || "";
    const started = await startGeminiVideo(parsed.value, model, key);
    return NextResponse.json({ id: started.id, status: started.status, provider, model });
  } catch (cause) {
    return failure(cause, "Could not start video generation.");
  }
}

/** Poll a running job, and resolve its downloadable file once complete. */
export async function GET(request: Request) {
  const auth = await authorized();
  if ("unconfigured" in auth) return NextResponse.json(UNCONFIGURED, { status: 503 });
  if (!auth.user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  const { provider, model, missing } = avatarVideoProvider();
  if (!provider) {
    return NextResponse.json(
      { error: "Talking video needs a Gemini key. Add " + missing.join(" or ") + "." },
      { status: 503 },
    );
  }

  const id = new URL(request.url).searchParams.get("id") || "";
  // Interaction ids look like v1_<opaque>; file ids are plain opaque tokens.
  if (!/^[A-Za-z0-9_-]{8,200}$/.test(id)) {
    return NextResponse.json({ error: "Invalid video job ID." }, { status: 400 });
  }

  try {
    const key = process.env.GEMINI_API_KEY?.trim() || "";
    const polled = await pollGeminiVideo(id, model, key);

    if (polled.status === "failed") {
      return NextResponse.json({ status: "failed", error: polled.error });
    }
    if (polled.status === "processing") {
      return NextResponse.json({ status: "processing" });
    }

    // The interaction is done, but the file itself may still be encoding.
    const file = await confirmGeminiVideoFile(polled.fileId, key);
    if (file.status === "failed") {
      return NextResponse.json({ status: "failed", error: file.error });
    }
    if (file.status === "processing") {
      return NextResponse.json({ status: "processing" });
    }

    return NextResponse.json({
      status: "completed",
      downloadUrl: `/api/avatar/video/download?id=${encodeURIComponent(file.fileId)}`,
    });
  } catch (cause) {
    return failure(cause, "Could not check video generation status.");
  }
}
