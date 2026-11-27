"use client";

import { useEffect, useState } from "react";
import { AudioLines, Download, LoaderCircle, Sparkles, Volume2 } from "lucide-react";

const VOICES = [
  { id: "alloy", label: "Puck · Balanced" },
  { id: "ash", label: "Charon · Deep" },
  { id: "coral", label: "Kore · Warm" },
  { id: "echo", label: "Orus · Smooth" },
  { id: "fable", label: "Leda · Expressive" },
  { id: "nova", label: "Aoede · Friendly" },
  { id: "onyx", label: "Fenrir · Bold" },
  { id: "sage", label: "Schedar · Calm" },
  { id: "shimmer", label: "Zephyr · Bright" },
];

export default function VoiceStudio() {
  const [script, setScript] = useState("");
  const [voice, setVoice] = useState("nova");
  const [style, setStyle] = useState("Speak naturally and clearly.");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [audioUrl, setAudioUrl] = useState("");

  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);

  async function generate() {
    if (!script.trim()) { setError("Enter a script before generating audio."); return; }
    if (script.length > 5000) { setError("Please keep your script under 5,000 characters."); return; }
    setBusy(true); setError("");
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl("");
    try {
      const response = await fetch("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: script.trim(), voice, instructions: style.trim() }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Voice generation failed. Please try again.");
      }
      const blob = await response.blob();
      if (!blob.size) throw new Error("Gemini returned an empty audio file.");
      setAudioUrl(URL.createObjectURL(blob));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Voice generation failed.");
    } finally { setBusy(false); }
  }

  return (
    <>
      <section className="form-card voice-studio-card">
        <div className="voice-studio-heading">
          <span className="voice-studio-icon"><AudioLines size={20} /></span>
          <div><h2>Text to speech</h2><p className="form-lead">Turn your script into natural-sounding speech with Gemini. Choose a voice and speaking direction.</p></div>
        </div>
        <label className="field">
          <span>Your script <small>{script.length}/5000 characters</small></span>
          <textarea className="voice-script" value={script} maxLength={5000} onChange={(e) => setScript(e.target.value)} placeholder="Type or paste the words you want your AI voice to speak..." rows={7} />
        </label>
        <div className="field-row">
          <label className="field">
            <span>AI voice</span>
            <select value={voice} onChange={(e) => setVoice(e.target.value)} className="voice-select">
              {VOICES.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Speaking style</span>
            <input className="voice-style" value={style} onChange={(e) => setStyle(e.target.value)} maxLength={500} placeholder="e.g. Warm, calm, and conversational" />
          </label>
        </div>
        {error && <div className="error-note" role="alert">{error}</div>}
        <button className="primary-button voice-generate" onClick={generate} disabled={busy || !script.trim()}>
          {busy ? <><LoaderCircle className="spin" size={16} /> Generating audio…</> : <><Sparkles size={16} /> Generate voice</>}
        </button>
        {audioUrl && (
          <div className="voice-result">
            <div className="voice-result-title"><span><Volume2 size={17} /> Generated audio</span><a href={audioUrl} download="cloneai-studio-voice.wav"><Download size={15} /> Download WAV</a></div>
            <audio controls autoPlay src={audioUrl} className="voice-audio">Your browser does not support audio playback.</audio>
          </div>
        )}
        <p className="voice-disclaimer">Generated speech uses a Gemini AI voice preset. It does not clone a real person. Only use voices and likenesses with the person’s permission.</p>
      </section>
      <section className="setup-note voice-setup-note">
        <strong>Provider</strong><br />
        Voice generation uses your server-side <code>GEMINI_API_KEY</code>. Gemini API usage is subject to model availability, free-tier eligibility, rate limits, and current Google pricing. Your key is never sent to the browser.
      </section>
    </>
  );
}
