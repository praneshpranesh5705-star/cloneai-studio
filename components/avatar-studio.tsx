"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ImagePlus,
  LoaderCircle,
  Mic2,
  Sparkles,
  Video,
  WandSparkles,
} from "lucide-react";
import "./avatar-studio.css";

type Tab = "image" | "video";

export type AvatarCapabilities = {
  image: { provider: string | null; model: string; missing: string[] };
  video: { provider: string | null; model: string; missing: string[] };
};

const STYLES = ["Photorealistic", "3D animated", "Anime", "Illustration", "Corporate headshot"];
const ASPECTS = [
  { value: "3:4", label: "Portrait 3:4" },
  { value: "1:1", label: "Square 1:1" },
  { value: "9:16", label: "Vertical 9:16" },
  { value: "16:9", label: "Landscape 16:9" },
];

const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const POLL_INTERVAL_MS = 5000;
const MAX_POLLS = 36;

/** Downscale and re-encode a photo so the request stays inside the size limit. */
async function imageToJpeg(file: File): Promise<{ data: string; mimeType: string }> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose an image file (JPEG, PNG or WebP).");
  }
  if (file.size > MAX_PHOTO_BYTES) {
    throw new Error(
      `That photo is ${(file.size / 1024 / 1024).toFixed(1)} MB. Choose one under 4 MB.`,
    );
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("That file could not be read as an image. Try a different photo.");
  }

  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("This browser could not process the photo. Try another browser.");
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error("Image conversion failed."))),
      "image/jpeg",
      0.84,
    ),
  );
  if (blob.size > MAX_PHOTO_BYTES) {
    throw new Error("That photo is still too large after compression. Choose a smaller one.");
  }

  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(new Error("Could not read the photo."));
    reader.readAsDataURL(blob);
  });
  return { data, mimeType: "image/jpeg" };
}

export default function AvatarStudio({ capabilities }: { capabilities: AvatarCapabilities }) {
  const [tab, setTab] = useState<Tab>("image");

  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState(STYLES[0]);
  const [aspect, setAspect] = useState("3:4");
  const [imageUrl, setImageUrl] = useState("");

  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [script, setScript] = useState("");
  const [videoUrl, setVideoUrl] = useState("");

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);

  const cancelled = useRef(false);

  const imageReady = Boolean(capabilities.image.provider);
  const videoReady = Boolean(capabilities.video.provider);

  useEffect(() => {
    return () => {
      cancelled.current = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (imageUrl.startsWith("blob:")) URL.revokeObjectURL(imageUrl);
      if (videoUrl.startsWith("blob:")) URL.revokeObjectURL(videoUrl);
      if (photoPreview.startsWith("blob:")) URL.revokeObjectURL(photoPreview);
    };
  }, [imageUrl, videoUrl, photoPreview]);

  async function generateImage() {
    if (!prompt.trim()) {
      setError("Describe the avatar you want to create.");
      return;
    }
    setBusy(true);
    setError("");
    setStatus("Generating your avatar image\u2026");
    setImageUrl("");
    try {
      const response = await fetch("/api/avatar/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim(), style, aspectRatio: aspect }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Avatar image generation failed.");
      setImageUrl(`data:${data.mimeType};base64,${data.image}`);
      setStatus("Your avatar image is ready.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Image generation failed.");
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  async function animateGeneratedAvatar() {
    if (!imageUrl) return;
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const file = new File([blob], "cloneai-avatar.png", { type: blob.type || "image/png" });
      setPhoto(file);
      setPhotoPreview(URL.createObjectURL(file));
      setTab("video");
      setError("");
      setStatus("Avatar loaded. Add a script and generate the video.");
    } catch {
      setError("Could not reuse the generated image. Download it and upload it instead.");
    }
  }

  async function generateVideo() {
    if (!photo) {
      setError("Upload a photo to animate first.");
      return;
    }
    if (!script.trim()) {
      setError("Enter the words your avatar should speak.");
      return;
    }

    setBusy(true);
    setError("");
    setVideoUrl("");
    setElapsed(0);
    cancelled.current = false;

    try {
      setStatus("Preparing your photo\u2026");
      const encoded = await imageToJpeg(photo);

      setStatus("Starting video generation\u2026");
      const start = await fetch("/api/avatar/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...encoded, script: script.trim() }),
      });
      const started = await start.json().catch(() => ({}));
      if (!start.ok) throw new Error(started.error || "Could not start video generation.");

      const id = String(started.id || "");
      if (!id) throw new Error("The video provider did not return a job ID.");

      for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        if (cancelled.current) return;

        const seconds = Math.min((attempt + 1) * (POLL_INTERVAL_MS / 1000), 180);
        setElapsed(seconds);
        setStatus(`Rendering your talking avatar\u2026 ${seconds}s`);

        const check = await fetch(`/api/avatar/video?id=${encodeURIComponent(id)}`, {
          cache: "no-store",
        });
        const result = await check.json().catch(() => ({}));
        if (!check.ok) throw new Error(result.error || "Could not check video status.");

        if (result.status === "completed" && result.downloadUrl) {
          setVideoUrl(result.downloadUrl);
          setStatus("Your talking avatar video is ready.");
          return;
        }
        if (result.status === "failed") {
          throw new Error(result.error || "The video provider could not complete this generation.");
        }
      }

      setStatus("");
      setError(
        "This is taking longer than expected. The job may still be rendering \u2014 try again in a minute.",
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Video generation failed.");
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="avatar-studio">
      <section className="form-card avatar-card">
        <div className="avatar-heading">
          <span className="voice-studio-icon">
            <WandSparkles size={20} />
          </span>
          <div>
            <h2>Create your AI avatar</h2>
            <p className="form-lead">
              Generate an avatar portrait, then turn a photo into a speaking video.
            </p>
          </div>
        </div>

        <div className="avatar-tabs" role="tablist" aria-label="Avatar creation mode">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "image"}
            className={tab === "image" ? "active" : ""}
            onClick={() => {
              setTab("image");
              setError("");
            }}
          >
            <ImagePlus size={15} /> Avatar image
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "video"}
            className={tab === "video" ? "active" : ""}
            onClick={() => {
              setTab("video");
              setError("");
            }}
          >
            <Video size={15} /> Talking video
          </button>
        </div>

        {tab === "image" ? (
          <>
            {!imageReady && (
              <div className="avatar-blocked" role="status">
                <AlertTriangle size={16} />
                <div>
                  <strong>Image generation is not connected</strong>
                  <p>
                    Add <code>{capabilities.image.missing.join("</code> or <code>")}</code> in
                    Vercel \u2192 Settings \u2192 Environment Variables, then redeploy.
                  </p>
                </div>
              </div>
            )}

            <label className="field">
              <span>
                Describe your avatar <small>{prompt.length}/1500</small>
              </span>
              <textarea
                className="avatar-textarea"
                rows={5}
                maxLength={1500}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Example: A friendly professional technology presenter, mid-shot portrait, navy blazer, clean modern studio background, soft cinematic lighting\u2026"
              />
            </label>

            <div className="avatar-fields">
              <label className="field">
                <span>Visual style</span>
                <select value={style} onChange={(event) => setStyle(event.target.value)}>
                  {STYLES.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Image shape</span>
                <select value={aspect} onChange={(event) => setAspect(event.target.value)}>
                  {ASPECTS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <button
              className="primary-button avatar-action"
              type="button"
              onClick={generateImage}
              disabled={busy || !prompt.trim() || !imageReady}
            >
              {busy ? (
                <>
                  <LoaderCircle className="spin" size={16} /> Creating avatar\u2026
                </>
              ) : (
                <>
                  <Sparkles size={16} /> Generate avatar image
                </>
              )}
            </button>

            {imageUrl && (
              <div className="avatar-result">
                <div className="avatar-result-head">
                  <strong>Generated avatar</strong>
                  <span className="avatar-result-links">
                    <button type="button" onClick={animateGeneratedAvatar} disabled={!videoReady}>
                      Animate this avatar
                    </button>
                    <a href={imageUrl} download="cloneai-avatar.png">
                      <Download size={15} /> Download PNG
                    </a>
                  </span>
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl} alt="Generated AI avatar" />
              </div>
            )}
          </>
        ) : (
          <>
            {!videoReady && (
              <div className="avatar-blocked" role="status">
                <AlertTriangle size={16} />
                <div>
                  <strong>Talking video is not connected</strong>
                  <p>
                    Add <code>{capabilities.video.missing.join("</code> or <code>")}</code> in
                    Vercel \u2192 Settings \u2192 Environment Variables, then redeploy. Talking video uses
                    Gemini Omni, which needs paid-tier Gemini access.
                  </p>
                </div>
              </div>
            )}

            <label className="field">
              <span>Upload a photo</span>
              <input
                className="avatar-file"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => {
                  const file = event.target.files?.[0] || null;
                  setPhoto(file);
                  setPhotoPreview(file ? URL.createObjectURL(file) : "");
                  setError("");
                }}
              />
            </label>

            {photoPreview && (
              <div className="avatar-photo-preview">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoPreview} alt="Selected avatar reference" />
                <span>Photo selected</span>
              </div>
            )}

            <label className="field">
              <span>
                Speaking script <small>{script.length}/1200</small>
              </span>
              <textarea
                className="avatar-textarea"
                rows={5}
                maxLength={1200}
                value={script}
                onChange={(event) => setScript(event.target.value)}
                placeholder="Hello! Welcome to my channel. Today I want to show you something exciting\u2026"
              />
            </label>

            <p className="avatar-hint">
              <Mic2 size={14} /> The model generates a short clip with synchronised mouth movement
              and audio. Exact wording and lip-sync quality vary between runs.
            </p>

            <button
              className="primary-button avatar-action"
              type="button"
              onClick={generateVideo}
              disabled={busy || !photo || !script.trim() || !videoReady}
            >
              {busy ? (
                <>
                  <LoaderCircle className="spin" size={16} /> Generating video\u2026
                </>
              ) : (
                <>
                  <Video size={16} /> Generate talking video
                </>
              )}
            </button>

            {videoUrl && (
              <div className="avatar-result">
                <div className="avatar-result-head">
                  <strong>Talking avatar video</strong>
                  <a href={videoUrl} download="cloneai-talking-avatar.mp4">
                    <Download size={15} /> Download MP4
                  </a>
                </div>
                <video src={videoUrl} controls playsInline />
              </div>
            )}
          </>
        )}

        {status && (
          <div className="website-notice" role="status">
            {busy && <LoaderCircle className="spin" size={14} />} {status}
          </div>
        )}
        {error && (
          <div className="error-note" role="alert">
            {error}
          </div>
        )}

        <p className="avatar-disclaimer">
          Use only photos of yourself or people who have explicitly agreed to this use. Do not
          create deceptive impersonations. Uploaded photos are sent to the configured AI provider
          for generation and are not stored by this app.
        </p>
      </section>

      <section className="setup-note avatar-provider-note">
        <strong>Provider and cost</strong>
        <br />
        {imageReady ? (
          <>
            <CheckCircle2 size={13} className="avatar-ok" /> Avatar images use{" "}
            <code>{capabilities.image.model}</code> via{" "}
            {capabilities.image.provider === "gemini" ? "Gemini" : "OpenAI"}.
          </>
        ) : (
          <>
            <AlertTriangle size={13} className="avatar-warn" /> Avatar images need{" "}
            <code>GEMINI_API_KEY</code> or <code>OPENAI_API_KEY</code>.
          </>
        )}
        <br />
        {videoReady ? (
          <>
            <CheckCircle2 size={13} className="avatar-ok" /> Talking video uses{" "}
            <code>{capabilities.video.model}</code> via Gemini Omni.
          </>
        ) : (
          <>
            <AlertTriangle size={13} className="avatar-warn" /> Talking video needs{" "}
            <code>GEMINI_API_KEY</code> with paid-tier access.
          </>
        )}
        <br />
        Images cost roughly $0.03\u2013$0.05 each. Video is billed per second of output \u2014 a 5-second
        720p clip is about $0.35. Your API keys stay on the server and are never sent to the
        browser.
      </section>
    </div>
  );
}
