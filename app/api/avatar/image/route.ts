import { NextResponse } from "next/server";
import { createClientOrNull } from "@/lib/supabase/server";
import { avatarImageProvider, validateImageRequest } from "@/lib/avatar";
import { generateGeminiImage, generateOpenAIImage } from "@/lib/avatar-providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
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
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) {
    return NextResponse.json({ error: "Please sign in to use Avatar Studio." }, { status: 401 });
  }

  const { provider, model, missing } = avatarImageProvider();
  if (!provider) {
    return NextResponse.json(
      {
        error:
          "Avatar image generation needs a model key. Add one of these in Vercel \u2192 Settings \u2192 Environment Variables, then redeploy: " +
          missing.join(" or ") +
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

  const parsed = validateImageRequest(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const key =
      provider === "gemini"
        ? process.env.GEMINI_API_KEY?.trim() || ""
        : process.env.OPENAI_API_KEY?.trim() || "";

    const result =
      provider === "gemini"
        ? await generateGeminiImage(parsed.value, model, key)
        : await generateOpenAIImage(parsed.value, model, key);

    return NextResponse.json({
      image: result.image,
      mimeType: result.mimeType,
      provider,
      model,
    });
  } catch (cause) {
    const error = cause as Error & { status?: number };
    const message =
      error?.name === "TimeoutError"
        ? "Image generation timed out. Try a shorter description."
        : error?.message || "Avatar image generation failed. Please try again.";
    return NextResponse.json({ error: message }, { status: error?.status ?? 502 });
  }
}
