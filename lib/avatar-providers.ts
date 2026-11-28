/**
 * The network half of Avatar Studio: one function per provider capability.
 *
 * Each returns a plain result or throws an Error whose message is already
 * written for a person. The routes do not know which vendor answered.
 */
import {
  buildImagePrompt,
  buildVideoPrompt,
  errorDetail,
  mapProviderError,
  openAIImageSize,
  VIDEO_RESOLUTION,
  VIDEO_SECONDS,
  type ImageRequest,
  type VideoRequest,
} from "./avatar";

export type GeneratedImage = { image: string; mimeType: string };

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const OPENAI_BASE = "https://api.openai.com/v1";

function fail(label: string, status: number, body: unknown, envKey: string): never {
  const mapped = mapProviderError(label, status, errorDetail(body), envKey);
  const error = new Error(mapped.message) as Error & { status?: number };
  error.status = mapped.status;
  throw error;
}

/* -------------------------------------------------------------------------- */
/* Gemini image                                                               */
/* -------------------------------------------------------------------------- */

/**
 * A content part. The REST API returns these flat \u2014 `{type, mime_type, data}` \u2014
 * while the SDK and older generateContent responses nest the payload under
 * `inlineData` / `inline_data`. All three shapes are accepted, because getting
 * this wrong means a valid image is silently discarded.
 */
type GeminiPart = {
  type?: string;
  text?: string;
  data?: string;
  mime_type?: string;
  mimeType?: string;
  inlineData?: { data?: string; mimeType?: string };
  inline_data?: { data?: string; mime_type?: string };
};
type GeminiInteraction = {
  steps?: { type?: string; content?: GeminiPart[] }[];
  output_image?: { data?: string; mime_type?: string };
  error?: { message?: string };
};

/**
 * Gemini's current image path is the Interactions API, not generateContent.
 * The image arrives either as the SDK convenience field `output_image` or, on
 * the raw REST response, inside `steps[].content[]` as an inline part.
 * Both shapes are read here so a change in one does not break the other.
 */
export async function generateGeminiImage(
  request: ImageRequest,
  model: string,
  key: string,
): Promise<GeneratedImage> {
  const response = await fetch(`${GEMINI_BASE}/interactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      model,
      input: buildImagePrompt(request),
      response_format: {
        type: "image",
        aspect_ratio: request.aspect,
      },
    }),
    signal: AbortSignal.timeout(90_000),
  });

  const body = (await response.json().catch(() => ({}))) as GeminiInteraction;
  if (!response.ok) fail("Gemini", response.status, body, "GEMINI_API_KEY");

  const direct = body.output_image?.data;
  if (direct) {
    return { image: direct, mimeType: body.output_image?.mime_type || "image/png" };
  }

  const parts = (body.steps ?? []).flatMap((step) => step.content ?? []);
  const inline = parts.find(
    (part) => part.data || part.inlineData?.data || part.inline_data?.data,
  );
  const data = inline?.data || inline?.inlineData?.data || inline?.inline_data?.data;
  if (!data) {
    throw new Error(
      "Gemini returned no image. Try a more specific description, or a different visual style.",
    );
  }
  return {
    image: data,
    mimeType:
      inline?.mime_type ||
      inline?.mimeType ||
      inline?.inlineData?.mimeType ||
      inline?.inline_data?.mime_type ||
      "image/png",
  };
}

/* -------------------------------------------------------------------------- */
/* OpenAI image                                                               */
/* -------------------------------------------------------------------------- */

type OpenAIImageResponse = {
  data?: { b64_json?: string; url?: string }[];
  error?: { message?: string };
};

/**
 * OpenAI's Images API. GPT Image models always return base64, never a URL, so
 * `b64_json` is the field to read; `url` is kept as a fallback for any model
 * that still returns one.
 */
export async function generateOpenAIImage(
  request: ImageRequest,
  model: string,
  key: string,
): Promise<GeneratedImage> {
  const response = await fetch(`${OPENAI_BASE}/images/generations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      prompt: buildImagePrompt(request),
      n: 1,
      size: openAIImageSize(request.aspect),
      quality: "high",
      output_format: "png",
    }),
    signal: AbortSignal.timeout(90_000),
  });

  const body = (await response.json().catch(() => ({}))) as OpenAIImageResponse;
  if (!response.ok) fail("OpenAI", response.status, body, "OPENAI_API_KEY");

  const first = body.data?.[0];
  if (first?.b64_json) return { image: first.b64_json, mimeType: "image/png" };

  if (first?.url) {
    // Some models return a short-lived URL instead of base64. Fetch it so the
    // browser gets the same data: URL shape either way.
    const download = await fetch(first.url, { signal: AbortSignal.timeout(60_000) });
    if (!download.ok) {
      throw new Error("OpenAI returned an image link that could not be downloaded. Try again.");
    }
    const buffer = Buffer.from(await download.arrayBuffer());
    return {
      image: buffer.toString("base64"),
      mimeType: download.headers.get("content-type") || "image/png",
    };
  }

  throw new Error("OpenAI returned no image. Try a more specific description.");
}

/* -------------------------------------------------------------------------- */
/* Gemini video                                                               */
/* -------------------------------------------------------------------------- */

export type StartedVideo = { id: string; status: string };

type GeminiVideoInteraction = {
  id?: string;
  status?: string;
  steps?: { type?: string; content?: { type?: string; uri?: string; data?: string }[] }[];
  output_video?: { uri?: string; data?: string };
  errors?: { message?: string }[];
  error?: { message?: string };
};

/**
 * Start a background video job. `background: true` makes the POST return an
 * interaction id immediately instead of holding the connection open for the
 * whole render, which is what lets the UI poll.
 */
export async function startGeminiVideo(
  request: VideoRequest,
  model: string,
  key: string,
): Promise<StartedVideo> {
  const response = await fetch(`${GEMINI_BASE}/interactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      model,
      input: [
        { type: "image", data: request.image, mime_type: request.mimeType },
        { type: "text", text: buildVideoPrompt(request.script) },
      ],
      generation_config: { video_config: { task: "image_to_video" } },
      response_format: {
        type: "video",
        aspect_ratio: "9:16",
        duration: `${VIDEO_SECONDS}s`,
        resolution: VIDEO_RESOLUTION,
      },
      background: true,
      store: true,
      stream: false,
    }),
    signal: AbortSignal.timeout(55_000),
  });

  const body = (await response.json().catch(() => ({}))) as GeminiVideoInteraction;
  if (!response.ok) fail("Gemini", response.status, body, "GEMINI_API_KEY");

  if (!body.id) {
    throw new Error("Gemini accepted the request but returned no job ID. Try again.");
  }
  return { id: body.id, status: body.status || "in_progress" };
}

export type VideoStatus =
  | { status: "processing" }
  | { status: "failed"; error: string }
  | { status: "completed"; fileId: string };

/**
 * Poll a video job.
 *
 * A completed interaction carries the video either as a `uri` (delivery: "uri")
 * or as inline base64. Only the uri form can be streamed back through the
 * download route, so an inline result is reported as a clear failure rather
 * than silently producing nothing.
 */
export async function pollGeminiVideo(
  id: string,
  model: string,
  key: string,
): Promise<VideoStatus> {
  const response = await fetch(`${GEMINI_BASE}/interactions/${encodeURIComponent(id)}`, {
    headers: { "x-goog-api-key": key },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });

  const body = (await response.json().catch(() => ({}))) as GeminiVideoInteraction;
  if (!response.ok) fail("Gemini", response.status, body, "GEMINI_API_KEY");

  if (body.status === "failed") {
    return {
      status: "failed",
      error: body.errors?.[0]?.message || "Gemini could not complete this video.",
    };
  }
  if (body.status !== "completed") return { status: "processing" };

  const uri =
    body.output_video?.uri ||
    (body.steps ?? [])
      .flatMap((step) => step.content ?? [])
      .find((part) => part.type === "video" && part.uri)?.uri;

  if (typeof uri === "string") {
    const match = uri.match(/\/files\/([A-Za-z0-9_-]+)/);
    if (match) return { status: "completed", fileId: match[1] };
  }

  const inline = (body.steps ?? [])
    .flatMap((step) => step.content ?? [])
    .find((part) => part.type === "video" && part.data)?.data;

  if (inline) {
    return {
      status: "failed",
      error:
        "Gemini returned the video inline instead of as a file, which this app cannot stream. Try generating again.",
    };
  }

  return {
    status: "failed",
    error: "Gemini finished the job but returned no video file. Try generating again.",
  };
}

/** Confirm the generated file is ready, then hand back its id. */
export async function confirmGeminiVideoFile(
  fileId: string,
  key: string,
): Promise<VideoStatus> {
  const response = await fetch(`${GEMINI_BASE}/files/${encodeURIComponent(fileId)}`, {
    headers: { "x-goog-api-key": key },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });

  const body = (await response.json().catch(() => ({}))) as { state?: string; error?: { message?: string } };
  if (!response.ok) fail("Gemini", response.status, body, "GEMINI_API_KEY");

  if (body.state === "FAILED") {
    return { status: "failed", error: "Gemini could not process the generated video file." };
  }
  if (body.state !== "ACTIVE") return { status: "processing" };
  return { status: "completed", fileId };
}

/** Stream the finished MP4 back to the browser. */
export async function downloadGeminiVideo(fileId: string, key: string): Promise<Response> {
  const response = await fetch(
    `${GEMINI_BASE}/files/${encodeURIComponent(fileId)}:download?alt=media`,
    {
      headers: { "x-goog-api-key": key },
      cache: "no-store",
      signal: AbortSignal.timeout(55_000),
    },
  );

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    fail("Gemini", response.status, body, "GEMINI_API_KEY");
  }
  return response;
}
