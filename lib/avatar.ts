/**
 * Avatar Studio domain logic: what is allowed, which provider will serve it,
 * and how a provider failure is turned into something a person can act on.
 *
 * Kept separate from the route handlers so the rules can be unit-tested
 * without a network or a Supabase session.
 */

export const IMAGE_ASPECTS = ["1:1", "3:4", "9:16", "16:9"] as const;
export type ImageAspect = (typeof IMAGE_ASPECTS)[number];

export const IMAGE_STYLES = [
  "Photorealistic",
  "3D animated",
  "Anime",
  "Illustration",
  "Corporate headshot",
] as const;
export type ImageStyle = (typeof IMAGE_STYLES)[number];

export const MAX_PROMPT = 1500;
export const MAX_SCRIPT = 1200;
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
export const PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** Video is capped at 15s by the model; we ask for 5s to keep the cost sane. */
export const VIDEO_SECONDS = 5;
export const VIDEO_RESOLUTION = "720p";

export type AvatarImageProvider = "gemini" | "openai";
export type AvatarVideoProvider = "gemini";

export type ProviderStatus<P extends string> = {
  /** The provider that will be used, or null when none is configured. */
  provider: P | null;
  /** The model that will be requested. */
  model: string;
  /** Environment variables that would enable this capability. */
  missing: string[];
};

/**
 * Image generation works on either provider. Gemini is preferred when both are
 * present because it takes an explicit aspect ratio and is the documented path
 * for avatar portraits; OpenAI is a full fallback, not a stub.
 */
export function avatarImageProvider(): ProviderStatus<AvatarImageProvider> {
  const forced = process.env.AVATAR_IMAGE_PROVIDER?.trim().toLowerCase();
  const gemini = Boolean(process.env.GEMINI_API_KEY?.trim());
  const openai = Boolean(process.env.OPENAI_API_KEY?.trim());

  const geminiModel = process.env.AVATAR_IMAGE_MODEL?.trim() || "gemini-3.1-flash-image";
  const openaiModel = process.env.AVATAR_IMAGE_MODEL?.trim() || "gpt-image-2.5-sunburst";

  if (forced === "openai" && openai) {
    return { provider: "openai", model: openaiModel, missing: [] };
  }
  if (forced === "gemini" && gemini) {
    return { provider: "gemini", model: geminiModel, missing: [] };
  }
  if (gemini) return { provider: "gemini", model: geminiModel, missing: [] };
  if (openai) return { provider: "openai", model: openaiModel, missing: [] };

  return {
    provider: null,
    model: "",
    missing: ["GEMINI_API_KEY", "OPENAI_API_KEY"],
  };
}

/**
 * Talking video is Gemini Omni only.
 *
 * This is not a shortcut: OpenAI's Sora 2 models and the whole /v1/videos API
 * were shut down on 2026-09-24, so there is no OpenAI video endpoint left to
 * call. Saying so plainly is better than offering a button that cannot work.
 */
export function avatarVideoProvider(): ProviderStatus<AvatarVideoProvider> {
  const key = process.env.GEMINI_API_KEY?.trim();
  const model = process.env.AVATAR_VIDEO_MODEL?.trim() || "gemini-omni-1.2-flash";
  if (!key) return { provider: null, model, missing: ["GEMINI_API_KEY"] };
  return { provider: "gemini", model, missing: [] };
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export type ImageRequest = { prompt: string; style: ImageStyle; aspect: ImageAspect };

export function validateImageRequest(raw: unknown): Result<ImageRequest> {
  const body = (raw ?? {}) as Record<string, unknown>;

  const prompt = text(body.prompt).trim();
  if (!prompt) return { ok: false, error: "Describe the avatar you want to create." };
  if (prompt.length > MAX_PROMPT) {
    return { ok: false, error: `Keep the description under ${MAX_PROMPT.toLocaleString()} characters.` };
  }

  const styleRaw = text(body.style).trim();
  const style = (IMAGE_STYLES as readonly string[]).includes(styleRaw)
    ? (styleRaw as ImageStyle)
    : "Photorealistic";

  const aspectRaw = text(body.aspectRatio).trim();
  const aspect = (IMAGE_ASPECTS as readonly string[]).includes(aspectRaw)
    ? (aspectRaw as ImageAspect)
    : "3:4";

  return { ok: true, value: { prompt, style, aspect } };
}

export type VideoRequest = { image: string; mimeType: string; script: string };

export function validateVideoRequest(raw: unknown): Result<VideoRequest> {
  const body = (raw ?? {}) as Record<string, unknown>;

  const image = text(body.data).trim();
  const mimeType = text(body.mimeType).trim();
  const script = text(body.script).trim();

  if (!image) return { ok: false, error: "Upload a photo to animate first." };
  if (!(PHOTO_MIME_TYPES as readonly string[]).includes(mimeType)) {
    return { ok: false, error: "That photo format is not supported. Use a JPEG, PNG or WebP image." };
  }
  // base64 is ~4/3 of the byte size, so this bounds the decoded photo at 4 MB.
  if (image.length > Math.ceil((MAX_PHOTO_BYTES * 4) / 3)) {
    return { ok: false, error: "That photo is too large. Choose one under 4 MB." };
  }
  if (!script) return { ok: false, error: "Enter the words your avatar should speak." };
  if (script.length > MAX_SCRIPT) {
    return { ok: false, error: `Keep the speaking script under ${MAX_SCRIPT.toLocaleString()} characters.` };
  }

  return { ok: true, value: { image, mimeType, script } };
}

/** The instruction sent to an image model. Shared so both providers agree. */
export function buildImagePrompt(request: ImageRequest): string {
  return [
    "Create one high-quality AI avatar portrait suitable for a talking-head video.",
    `Visual style: ${request.style}.`,
    `Aspect ratio: ${request.aspect}.`,
    "Frame the subject from the chest up, facing the camera, with a clear unobstructed face.",
    "Use even, flattering lighting and a simple background that does not compete with the subject.",
    `Subject description: ${request.prompt}`,
    "Produce the image itself, not a description of one. Do not add text, captions, logos or watermarks.",
  ].join(" ");
}

/**
 * The instruction sent to the video model. The script is quoted so the model
 * treats it as the words to speak rather than as part of the direction.
 */
export function buildVideoPrompt(script: string): string {
  return [
    "Create a natural, realistic talking-head video from the supplied photo of an adult person.",
    "The person looks directly into the camera and speaks the script below with natural facial",
    "expressions, clear audible speech and lip movement synchronised to the words.",
    "Keep the person's face, hair, clothing and background consistent with the reference photo.",
    "Do not add subtitles, captions, logos, on-screen text or other people.",
    `Script to speak: "${script}"`,
  ].join(" ");
}

/** OpenAI image sizes, chosen to match the requested aspect as closely as possible. */
export function openAIImageSize(aspect: ImageAspect): string {
  switch (aspect) {
    case "1:1":
      return "1024x1024";
    case "3:4":
      return "1024x1536";
    case "9:16":
      return "1152x2048";
    case "16:9":
      return "1536x1024";
    default:
      return "1024x1536";
  }
}

export type MappedError = { message: string; status: number };

/**
 * Turn a provider's error body into a message that says what to do next.
 *
 * The raw bodies are accurate but unhelpful ("invalid_api_key", "quota
 * exceeded"). A person reading the panel needs to know which variable to check
 * or that they need to add credit.
 */
export function mapProviderError(
  label: string,
  status: number,
  detail: string,
  envKey: string,
): MappedError {
  const lower = detail.toLowerCase();

  if (status === 401 || status === 403 || lower.includes("api key") || lower.includes("unauthenticated")) {
    return {
      message: `${label} rejected the API key. Check ${envKey} in Vercel \u2192 Settings \u2192 Environment Variables, then redeploy.`,
      status: 502,
    };
  }

  if (
    lower.includes("billing") ||
    lower.includes("insufficient_quota") ||
    lower.includes("quota exceeded") ||
    lower.includes("free_tier") ||
    lower.includes("limit: 0") ||
    lower.includes("spend cap") ||
    lower.includes("prepay")
  ) {
    return {
      message: `${label} has no available image-generation quota for this project. Gemini image generation requires an enabled paid API tier for this model. Check Google AI Studio → Usage & Billing, link billing or wait for the quota reset, then try again.`,
      status: 402,
    };
  }

  if (status === 429) {
    return {
      message: `${label} is temporarily rate limiting this project. Wait 30–60 seconds, avoid repeated taps, and try once. If it keeps happening, check Google AI Studio → Usage & Billing → Rate limits for the project used by GEMINI_API_KEY.`,
      status: 429,
    };
  }

  if (status === 404 || lower.includes("not found") || lower.includes("does not exist")) {
    return {
      message: `${label} does not offer this model on your account. Set AVATAR_IMAGE_MODEL or AVATAR_VIDEO_MODEL to a model your key can use.`,
      status: 502,
    };
  }

  if (lower.includes("safety") || lower.includes("blocked") || lower.includes("policy")) {
    return {
      message: `${label} declined this request under its content policy. Try a different description or photo.`,
      status: 400,
    };
  }

  return {
    message: detail
      ? `${label} could not complete this request: ${detail.slice(0, 300)}`
      : `${label} could not complete this request (HTTP ${status}).`,
    status: 502,
  };
}

/** Pull a human-readable message out of an unknown provider error body. */
export function errorDetail(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const record = body as Record<string, unknown>;

  const error = record.error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const errorRecord = error as Record<string, unknown>;
    const message = typeof errorRecord.message === "string" ? errorRecord.message : "";
    const status = typeof errorRecord.status === "string" ? errorRecord.status : "";
    const details = Array.isArray(errorRecord.details)
      ? errorRecord.details.map((item) => {
          if (!item || typeof item !== "object") return String(item);
          const detail = item as Record<string, unknown>;
          const violations = Array.isArray(detail.violations)
            ? detail.violations.map((violation) => JSON.stringify(violation)).join(" ")
            : "";
          return [detail["@type"], violations, JSON.stringify(detail)].filter(Boolean).join(" ");
        }).join(" ")
      : "";
    return [message, status, details].filter(Boolean).join(" ");
  }

  const message = record.message;
  if (typeof message === "string") return message;

  const errors = record.errors;
  if (Array.isArray(errors) && errors.length) {
    const first = errors[0] as Record<string, unknown> | undefined;
    if (first && typeof first.message === "string") return first.message;
  }

  return "";
}
