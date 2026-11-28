import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import {
  avatarImageProvider,
  avatarVideoProvider,
  buildImagePrompt,
  buildVideoPrompt,
  errorDetail,
  mapProviderError,
  openAIImageSize,
  validateImageRequest,
  validateVideoRequest,
} from "../lib/avatar";
import {
  generateGeminiImage,
  generateOpenAIImage,
  pollGeminiVideo,
  startGeminiVideo,
} from "../lib/avatar-providers";

/**
 * Avatar Studio: the rules, and the adapters against a local server that
 * speaks each vendor's real response shape. Only the model is fake — the
 * fetch, JSON parsing, base64 handling and error mapping are all real.
 */

type Harness = { url: string; close: () => void; requests: { body: string; headers: Record<string, string | string[] | undefined> }[] };

function jsonServer(
  handler: (body: string) => { status: number; json: unknown },
): Promise<Harness> {
  return new Promise((resolve) => {
    const requests: Harness["requests"] = [];
    const server: Server = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        requests.push({ body, headers: req.headers });
        const result = handler(body);
        res.writeHead(result.status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result.json));
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}`,
        requests,
        close: () => {
          server.closeAllConnections?.();
          server.close();
        },
      });
    });
  });
}

/** Point one vendor's host at the local server, leaving everything else alone. */
function routeHost(host: string, url: string): () => void {
  const realFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const target = typeof input === "string" ? input : input.toString();
    if (target.startsWith(host)) {
      return realFetch(target.replace(host, url), init);
    }
    return realFetch(input, init);
  }) as typeof fetch;
  return () => {
    globalThis.fetch = realFetch;
  };
}

function withEnv<T>(vars: Record<string, string | undefined>, fn: () => Promise<T> | T): Promise<T> {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    saved[key] = process.env[key];
    if (vars[key] === undefined) delete process.env[key];
    else process.env[key] = vars[key];
  }
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const key of Object.keys(saved)) {
        if (saved[key] === undefined) delete process.env[key];
        else process.env[key] = saved[key];
      }
    });
}

const ALL_KEYS = [
  "GEMINI_API_KEY",
  "OPENAI_API_KEY",
  "AVATAR_IMAGE_PROVIDER",
  "AVATAR_IMAGE_MODEL",
  "AVATAR_VIDEO_MODEL",
];

/* -------------------------------------------------------------------------- */
/* Provider resolution                                                        */
/* -------------------------------------------------------------------------- */

test("no keys: image and video both report what is missing", async () => {
  await withEnv(
    { GEMINI_API_KEY: undefined, OPENAI_API_KEY: undefined, AVATAR_IMAGE_PROVIDER: undefined },
    () => {
      const image = avatarImageProvider();
      assert.equal(image.provider, null);
      assert.deepEqual(image.missing, ["GEMINI_API_KEY", "OPENAI_API_KEY"]);

      const video = avatarVideoProvider();
      assert.equal(video.provider, null);
      assert.deepEqual(video.missing, ["GEMINI_API_KEY"]);
    },
  );
});

test("OpenAI alone is enough for images but not for video", async () => {
  await withEnv(
    { GEMINI_API_KEY: undefined, OPENAI_API_KEY: "sk-test", AVATAR_IMAGE_PROVIDER: undefined },
    () => {
      const image = avatarImageProvider();
      assert.equal(image.provider, "openai");
      assert.equal(image.model, "gpt-image-2.5-sunburst");

      // Sora's video API was shut down, so there is no OpenAI video path.
      assert.equal(avatarVideoProvider().provider, null);
    },
  );
});

test("Gemini is preferred for images when both keys exist", async () => {
  await withEnv(
    { GEMINI_API_KEY: "g-test", OPENAI_API_KEY: "sk-test", AVATAR_IMAGE_PROVIDER: undefined },
    () => {
      assert.equal(avatarImageProvider().provider, "gemini");
    },
  );
});

test("AVATAR_IMAGE_PROVIDER forces a provider", async () => {
  await withEnv(
    { GEMINI_API_KEY: "g-test", OPENAI_API_KEY: "sk-test", AVATAR_IMAGE_PROVIDER: "openai" },
    () => {
      assert.equal(avatarImageProvider().provider, "openai");
    },
  );
});

test("forcing a provider with no key falls back rather than breaking", async () => {
  await withEnv(
    { GEMINI_API_KEY: "g-test", OPENAI_API_KEY: undefined, AVATAR_IMAGE_PROVIDER: "openai" },
    () => {
      assert.equal(avatarImageProvider().provider, "gemini");
    },
  );
});

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

test("image request rejects an empty prompt", () => {
  const result = validateImageRequest({ prompt: "   " });
  assert.equal(result.ok, false);
});

test("image request rejects an over-long prompt", () => {
  const result = validateImageRequest({ prompt: "x".repeat(1501) });
  assert.equal(result.ok, false);
});

test("image request defaults unknown style and aspect", () => {
  const result = validateImageRequest({ prompt: "a presenter", style: "nonsense", aspectRatio: "7:3" });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.style, "Photorealistic");
    assert.equal(result.value.aspect, "3:4");
  }
});

test("image request keeps a valid aspect", () => {
  const result = validateImageRequest({ prompt: "a presenter", aspectRatio: "16:9" });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.aspect, "16:9");
});

test("video request rejects a missing photo", () => {
  const result = validateVideoRequest({ script: "hello" });
  assert.equal(result.ok, false);
});

test("video request rejects an unsupported mime type", () => {
  const result = validateVideoRequest({ data: "abc", mimeType: "image/gif", script: "hello" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /JPEG, PNG or WebP/);
});

test("video request rejects an oversized photo", () => {
  const result = validateVideoRequest({
    data: "x".repeat(Math.ceil((4 * 1024 * 1024 * 4) / 3) + 10),
    mimeType: "image/jpeg",
    script: "hello",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /under 4 MB/);
});

test("video request rejects an over-long script", () => {
  const result = validateVideoRequest({
    data: "abc",
    mimeType: "image/jpeg",
    script: "x".repeat(1201),
  });
  assert.equal(result.ok, false);
});

test("video request accepts a valid payload", () => {
  const result = validateVideoRequest({ data: "abc", mimeType: "image/png", script: "hello there" });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.script, "hello there");
});

/* -------------------------------------------------------------------------- */
/* Prompt building                                                            */
/* -------------------------------------------------------------------------- */

test("image prompt carries style, aspect and the user's words", () => {
  const prompt = buildImagePrompt({ prompt: "a teacher", style: "Anime", aspect: "9:16" });
  assert.match(prompt, /Anime/);
  assert.match(prompt, /9:16/);
  assert.match(prompt, /a teacher/);
  assert.match(prompt, /not a description/);
});

test("video prompt quotes the script so it is spoken, not directed", () => {
  const prompt = buildVideoPrompt("Hello world");
  assert.match(prompt, /"Hello world"/);
  assert.match(prompt, /synchronised/);
});

test("OpenAI sizes map to the closest supported dimension", () => {
  assert.equal(openAIImageSize("1:1"), "1024x1024");
  assert.equal(openAIImageSize("3:4"), "1024x1536");
  assert.equal(openAIImageSize("16:9"), "1536x1024");
  assert.equal(openAIImageSize("9:16"), "1152x2048");
});

/* -------------------------------------------------------------------------- */
/* Error mapping                                                              */
/* -------------------------------------------------------------------------- */

test("a 401 becomes an instruction naming the env var", () => {
  const mapped = mapProviderError("Gemini", 401, "API key not valid", "GEMINI_API_KEY");
  assert.match(mapped.message, /GEMINI_API_KEY/);
  assert.match(mapped.message, /redeploy/);
});

test("a quota error becomes a billing instruction", () => {
  const mapped = mapProviderError("OpenAI", 429, "insufficient_quota", "OPENAI_API_KEY");
  assert.match(mapped.message, /credit/i);
  assert.equal(mapped.status, 402);
});

test("a plain rate limit stays a 429", () => {
  const mapped = mapProviderError("OpenAI", 429, "rate limit reached", "OPENAI_API_KEY");
  assert.equal(mapped.status, 429);
});

test("a missing model names the override variable", () => {
  const mapped = mapProviderError("Gemini", 404, "model not found", "GEMINI_API_KEY");
  assert.match(mapped.message, /AVATAR_IMAGE_MODEL/);
});

test("a safety refusal is a 400, not a server error", () => {
  const mapped = mapProviderError("Gemini", 400, "blocked by safety filters", "GEMINI_API_KEY");
  assert.equal(mapped.status, 400);
  assert.match(mapped.message, /content policy/);
});

test("errorDetail reads the shapes both vendors use", () => {
  assert.equal(errorDetail({ error: { message: "a" } }), "a");
  assert.equal(errorDetail({ error: "b" }), "b");
  assert.equal(errorDetail({ message: "c" }), "c");
  assert.equal(errorDetail({ errors: [{ message: "d" }] }), "d");
  assert.equal(errorDetail(null), "");
  assert.equal(errorDetail("nope"), "");
});

/* -------------------------------------------------------------------------- */
/* Gemini image adapter                                                       */
/* -------------------------------------------------------------------------- */

test("Gemini image reads the flat REST part from steps", async () => {
  const harness = await jsonServer(() => ({
    status: 200,
    json: {
      id: "v1_abc",
      status: "completed",
      steps: [
        { type: "user_input", content: [{ type: "text", text: "..." }] },
        {
          type: "model_output",
          content: [{ type: "image", mime_type: "image/png", data: "QUJD" }],
        },
      ],
    },
  }));
  const restore = routeHost("https://generativelanguage.googleapis.com", harness.url);
  try {
    const result = await generateGeminiImage(
      { prompt: "a teacher", style: "Photorealistic", aspect: "3:4" },
      "gemini-nano-banana-2.1",
      "g-test",
    );
    assert.equal(result.image, "QUJD");
    assert.equal(result.mimeType, "image/png");

    // The request must carry the model, the aspect ratio and the key header.
    const sent = JSON.parse(harness.requests[0].body);
    assert.equal(sent.model, "gemini-nano-banana-2.1");
    assert.equal(sent.response_format.aspect_ratio, "3:4");
    assert.equal(harness.requests[0].headers["x-goog-api-key"], "g-test");
  } finally {
    restore();
    harness.close();
  }
});

test("Gemini image reads the output_image convenience field", async () => {
  const harness = await jsonServer(() => ({
    status: 200,
    json: { output_image: { data: "WFla", mime_type: "image/jpeg" } },
  }));
  const restore = routeHost("https://generativelanguage.googleapis.com", harness.url);
  try {
    const result = await generateGeminiImage(
      { prompt: "a teacher", style: "Anime", aspect: "1:1" },
      "m",
      "k",
    );
    assert.equal(result.image, "WFla");
    assert.equal(result.mimeType, "image/jpeg");
  } finally {
    restore();
    harness.close();
  }
});

test("Gemini image with no image part fails with a usable message", async () => {
  const harness = await jsonServer(() => ({
    status: 200,
    json: { steps: [{ type: "model_output", content: [{ type: "text", text: "I cannot" }] }] },
  }));
  const restore = routeHost("https://generativelanguage.googleapis.com", harness.url);
  try {
    await assert.rejects(
      () => generateGeminiImage({ prompt: "x", style: "Anime", aspect: "1:1" }, "m", "k"),
      /returned no image/,
    );
  } finally {
    restore();
    harness.close();
  }
});

test("Gemini image surfaces a 401 as an env-var instruction", async () => {
  const harness = await jsonServer(() => ({
    status: 401,
    json: { error: { message: "API key not valid. Please pass a valid API key." } },
  }));
  const restore = routeHost("https://generativelanguage.googleapis.com", harness.url);
  try {
    await assert.rejects(
      () => generateGeminiImage({ prompt: "x", style: "Anime", aspect: "1:1" }, "m", "k"),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /GEMINI_API_KEY/);
        assert.equal((error as Error & { status?: number }).status, 502);
        return true;
      },
    );
  } finally {
    restore();
    harness.close();
  }
});

/* -------------------------------------------------------------------------- */
/* OpenAI image adapter                                                       */
/* -------------------------------------------------------------------------- */

test("OpenAI image reads b64_json and sends the mapped size", async () => {
  const harness = await jsonServer(() => ({
    status: 200,
    json: { created: 1, data: [{ b64_json: "T1BFTkFJ" }] },
  }));
  const restore = routeHost("https://api.openai.com", harness.url);
  try {
    const result = await generateOpenAIImage(
      { prompt: "a teacher", style: "Photorealistic", aspect: "3:4" },
      "gpt-image-2.5-sunburst",
      "sk-test",
    );
    assert.equal(result.image, "T1BFTkFJ");
    assert.equal(result.mimeType, "image/png");

    const sent = JSON.parse(harness.requests[0].body);
    assert.equal(sent.model, "gpt-image-2.5-sunburst");
    assert.equal(sent.size, "1024x1536");
    assert.equal(sent.n, 1);
    assert.equal(harness.requests[0].headers.authorization, "Bearer sk-test");
  } finally {
    restore();
    harness.close();
  }
});

test("OpenAI image with no data fails with a usable message", async () => {
  const harness = await jsonServer(() => ({ status: 200, json: { data: [] } }));
  const restore = routeHost("https://api.openai.com", harness.url);
  try {
    await assert.rejects(
      () => generateOpenAIImage({ prompt: "x", style: "Anime", aspect: "1:1" }, "m", "k"),
      /returned no image/,
    );
  } finally {
    restore();
    harness.close();
  }
});

test("OpenAI image surfaces insufficient_quota as a billing message", async () => {
  const harness = await jsonServer(() => ({
    status: 429,
    json: { error: { message: "You exceeded your current quota", type: "insufficient_quota" } },
  }));
  const restore = routeHost("https://api.openai.com", harness.url);
  try {
    await assert.rejects(
      () => generateOpenAIImage({ prompt: "x", style: "Anime", aspect: "1:1" }, "m", "k"),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /credit/i);
        assert.equal((error as Error & { status?: number }).status, 402);
        return true;
      },
    );
  } finally {
    restore();
    harness.close();
  }
});

/* -------------------------------------------------------------------------- */
/* Gemini video adapter                                                       */
/* -------------------------------------------------------------------------- */

test("starting a video sends the image, the script and background mode", async () => {
  const harness = await jsonServer(() => ({
    status: 200,
    json: { id: "v1_job123456", status: "in_progress" },
  }));
  const restore = routeHost("https://generativelanguage.googleapis.com", harness.url);
  try {
    const started = await startGeminiVideo(
      { image: "QUJD", mimeType: "image/jpeg", script: "Hello there" },
      "gemini-omni-1.2-flash",
      "g-test",
    );
    assert.equal(started.id, "v1_job123456");

    const sent = JSON.parse(harness.requests[0].body);
    assert.equal(sent.model, "gemini-omni-1.2-flash");
    assert.equal(sent.background, true);
    assert.equal(sent.input[0].type, "image");
    assert.equal(sent.input[0].data, "QUJD");
    assert.match(sent.input[1].text, /Hello there/);
    assert.equal(sent.response_format.type, "video");
  } finally {
    restore();
    harness.close();
  }
});

test("a video job with no id fails rather than polling nothing", async () => {
  const harness = await jsonServer(() => ({ status: 200, json: { status: "in_progress" } }));
  const restore = routeHost("https://generativelanguage.googleapis.com", harness.url);
  try {
    await assert.rejects(
      () => startGeminiVideo({ image: "a", mimeType: "image/jpeg", script: "s" }, "m", "k"),
      /no job ID/,
    );
  } finally {
    restore();
    harness.close();
  }
});

test("polling an in-progress job reports processing", async () => {
  const harness = await jsonServer(() => ({ status: 200, json: { status: "in_progress" } }));
  const restore = routeHost("https://generativelanguage.googleapis.com", harness.url);
  try {
    const result = await pollGeminiVideo("v1_job123456", "m", "k");
    assert.equal(result.status, "processing");
  } finally {
    restore();
    harness.close();
  }
});

test("polling a completed job extracts the file id from the uri", async () => {
  const harness = await jsonServer(() => ({
    status: 200,
    json: {
      status: "completed",
      steps: [
        {
          type: "model_output",
          content: [
            { type: "video", uri: "https://generativelanguage.googleapis.com/v1beta/files/abc123XYZ:download" },
          ],
        },
      ],
    },
  }));
  const restore = routeHost("https://generativelanguage.googleapis.com", harness.url);
  try {
    const result = await pollGeminiVideo("v1_job123456", "m", "k");
    assert.equal(result.status, "completed");
    if (result.status === "completed") assert.equal(result.fileId, "abc123XYZ");
  } finally {
    restore();
    harness.close();
  }
});

test("polling a failed job returns the provider's reason", async () => {
  const harness = await jsonServer(() => ({
    status: 200,
    json: { status: "failed", errors: [{ message: "Image was rejected" }] },
  }));
  const restore = routeHost("https://generativelanguage.googleapis.com", harness.url);
  try {
    const result = await pollGeminiVideo("v1_job123456", "m", "k");
    assert.equal(result.status, "failed");
    if (result.status === "failed") assert.match(result.error, /rejected/);
  } finally {
    restore();
    harness.close();
  }
});

test("a completed job with no video file fails clearly instead of hanging", async () => {
  const harness = await jsonServer(() => ({
    status: 200,
    json: { status: "completed", steps: [{ type: "model_output", content: [] }] },
  }));
  const restore = routeHost("https://generativelanguage.googleapis.com", harness.url);
  try {
    const result = await pollGeminiVideo("v1_job123456", "m", "k");
    assert.equal(result.status, "failed");
    if (result.status === "failed") assert.match(result.error, /no video file/);
  } finally {
    restore();
    harness.close();
  }
});

test("an inline video result is reported, not silently dropped", async () => {
  const harness = await jsonServer(() => ({
    status: 200,
    json: {
      status: "completed",
      steps: [{ type: "model_output", content: [{ type: "video", data: "AAAAIGZ0eXA" }] }],
    },
  }));
  const restore = routeHost("https://generativelanguage.googleapis.com", harness.url);
  try {
    const result = await pollGeminiVideo("v1_job123456", "m", "k");
    assert.equal(result.status, "failed");
    if (result.status === "failed") assert.match(result.error, /inline/);
  } finally {
    restore();
    harness.close();
  }
});

test("env is restored between tests", () => {
  // Guards the helper itself: a leaked key would make later tests lie.
  for (const key of ALL_KEYS) {
    assert.equal(process.env[key], undefined, `${key} leaked`);
  }
});
