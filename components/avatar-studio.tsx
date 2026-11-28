"use client";

import { useEffect, useState } from "react";
import { Download, ImagePlus, LoaderCircle, Mic2, Sparkles, Video, WandSparkles } from "lucide-react";
import "./avatar-studio.css";

type Tab = "image" | "video";

async function imageToJpeg(file: File): Promise<{ data: string; mimeType: string }> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process this image.");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Image conversion failed.")), "image/jpeg", 0.84)
  );
  if (blob.size > 4 * 1024 * 1024) throw new Error("Please choose a smaller photo (under 4 MB after compression).");
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(new Error("Could not read the photo."));
    reader.readAsDataURL(blob);
  });
  return { data, mimeType: "image/jpeg" };
}

export default function AvatarStudio() {
  const [tab, setTab] = useState<Tab>("image");
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("Photorealistic");
  const [aspect, setAspect] = useState("3:4");
  const [imageUrl, setImageUrl] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [script, setScript] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => () => {
    if (imageUrl.startsWith("blob:")) URL.revokeObjectURL(imageUrl);
    if (videoUrl.startsWith("blob:")) URL.revokeObjectURL(videoUrl);
    if (photoPreview.startsWith("blob:")) URL.revokeObjectURL(photoPreview);
  }, [imageUrl, videoUrl, photoPreview]);

  async function generateImage() {
    if (!prompt.trim()) { setError("Describe the avatar you want to create."); return; }
    setBusy(true); setError(""); setStatus(""); setImageUrl("");
    try {
      const response = await fetch("/api/avatar/image", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim(), style, aspectRatio: aspect }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Avatar image generation failed.");
      setImageUrl(`data:${data.mimeType};base64,${data.image}`);
      setStatus("Your avatar image is ready.");
    } catch (e) { setError(e instanceof Error ? e.message : "Image generation failed."); }
    finally { setBusy(false); }
  }

  async function useGeneratedAvatar() {
    if (!imageUrl) return;
    const response = await fetch(imageUrl);
    const blob = await response.blob();
    const file = new File([blob], "cloneai-avatar.png", { type: blob.type || "image/png" });
    setPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
    setTab("video");
    setError("");
  }

  async function generateVideo() {
    if (!photo) { setError("Upload a photo to animate first."); return; }
    if (!script.trim()) { setError("Enter the words your avatar should speak."); return; }
    if (script.length > 1200) { setError("Keep the speaking script under 1,200 characters."); return; }
    setBusy(true); setError(""); setStatus("Preparing your photo…"); setVideoUrl("");
    try {
      const encoded = await imageToJpeg(photo);
      setStatus("Starting video generation…");
      const start = await fetch("/api/avatar/video", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...encoded, script: script.trim() }),
      });
      const started = await start.json().catch(() => ({}));
      if (!start.ok) throw new Error(started.error || "Could not start video generation.");
      const id = String(started.id || "");
      if (!id) throw new Error("The video provider did not return a job ID.");

      for (let attempt = 0; attempt < 36; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        setStatus(`Generating talking avatar video… (${Math.min((attempt + 1) * 5, 180)}s)`);
        const check = await fetch(`/api/avatar/video?id=${encodeURIComponent(id)}`, { cache: "no-store" });
        const result = await check.json().catch(() => ({}));
        if (!check.ok) throw new Error(result.error || "Could not check video status.");
        if (result.status === "completed" && result.downloadUrl) {
          setVideoUrl(result.downloadUrl);
          setStatus("Your talking avatar video is ready.");
          return;
        }
        if (result.status === "failed") throw new Error(result.error || "The video provider could not complete this generation.");
      }
      setStatus("Generation is taking longer than expected. Your job may still be processing; try again shortly.");
    } catch (e) { setError(e instanceof Error ? e.message : "Video generation failed."); }
    finally { setBusy(false); }
  }

  return (
    <div className="avatar-studio">
      <section className="form-card avatar-card">
        <div className="avatar-heading">
          <span className="voice-studio-icon"><WandSparkles size={20} /></span>
          <div><h2>Create your AI avatar</h2><p className="form-lead">Generate an avatar portrait or turn a photo into a speaking video.</p></div>
        </div>
        <div className="avatar-tabs" role="tablist" aria-label="Avatar creation mode">
          <button type="button" className={tab === "image" ? "active" : ""} onClick={() => { setTab("image"); setError(""); }}><ImagePlus size={15} /> Avatar image</button>
          <button type="button" className={tab === "video" ? "active" : ""} onClick={() => { setTab("video"); setError(""); }}><Video size={15} /> Talking video</button>
        </div>

        {tab === "image" ? (
          <>
            <label className="field"><span>Describe your avatar <small>{prompt.length}/1500</small></span>
              <textarea className="avatar-textarea" rows={5} maxLength={1500} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Example: A friendly professional Indian technology presenter, mid-shot portrait, navy blazer, clean modern studio background, soft cinematic lighting…" />
            </label>
            <div className="avatar-fields">
              <label className="field"><span>Visual style</span><select value={style} onChange={(e) => setStyle(e.target.value)}><option>Photorealistic</option><option>3D animated</option><option>Anime</option><option>Illustration</option><option>Corporate headshot</option></select></label>
              <label className="field"><span>Image shape</span><select value={aspect} onChange={(e) => setAspect(e.target.value)}><option value="3:4">Portrait 3:4</option><option value="1:1">Square 1:1</option><option value="9:16">Vertical 9:16</option><option value="16:9">Landscape 16:9</option></select></label>
            </div>
            <button className="primary-button avatar-action" type="button" onClick={generateImage} disabled={busy || !prompt.trim()}>{busy ? <><LoaderCircle className="spin" size={16} /> Creating avatar…</> : <><Sparkles size={16} /> Generate avatar image</>}</button>
            {imageUrl && <div className="avatar-result"><div className="avatar-result-head"><strong>Generated avatar</strong><span className="avatar-result-links"><button type="button" onClick={useGeneratedAvatar}>Animate this avatar</button><a href={imageUrl} download="cloneai-avatar.png"><Download size={15} /> Download PNG</a></span></div><img src={imageUrl} alt="Generated AI avatar" /></div>}
          </>
        ) : (
          <>
            <label className="field"><span>Upload a photo</span><input className="avatar-file" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => { const f = e.target.files?.[0] || null; setPhoto(f); setPhotoPreview(f ? URL.createObjectURL(f) : ""); setError(""); }} /></label>
            {photoPreview && <div className="avatar-photo-preview"><img src={photoPreview} alt="Selected avatar reference" /><span>Photo selected</span></div>}
            <label className="field"><span>Speaking script <small>{script.length}/1200</small></span><textarea className="avatar-textarea" rows={5} maxLength={1200} value={script} onChange={(e) => setScript(e.target.value)} placeholder="Hello! Welcome to my channel. Today, I want to show you something exciting…" /></label>
            <p className="avatar-hint"><Mic2 size={14} /> The model will attempt to create a speaking performance with synchronized mouth movement and generated audio. Exact wording and lip-sync quality can vary.</p>
            <button className="primary-button avatar-action" type="button" onClick={generateVideo} disabled={busy || !photo || !script.trim()}>{busy ? <><LoaderCircle className="spin" size={16} /> Generating video…</> : <><Video size={16} /> Generate talking video</>}</button>
            {videoUrl && <div className="avatar-result"><div className="avatar-result-head"><strong>Talking avatar video</strong><a href={videoUrl} download="cloneai-talking-avatar.mp4"><Download size={15} /> Download MP4</a></div><video src={videoUrl} controls playsInline /></div>}
          </>
        )}
        {status && <div className="website-notice" role="status">{status}</div>}
        {error && <div className="error-note" role="alert">{error}</div>}
        <p className="avatar-disclaimer">Use only photos of yourself or people who have explicitly agreed to this use. Do not create deceptive impersonations. Uploaded photos are sent to the configured AI provider for generation.</p>
      </section>
      <section className="setup-note avatar-provider-note"><strong>Provider and cost</strong><br />Avatar images use your server-side GEMINI_API_KEY. Talking videos use Gemini Omni Flash, which requires paid-tier Gemini API access and can incur charges. Video generation is not included in the free tier. Your API key stays on the server.</section>
    </div>
  );
}
