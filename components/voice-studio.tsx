"use client";

import { useEffect, useState } from "react";
import { AudioLines, Download, LoaderCircle, Play, Sparkles } from "lucide-react";

const VOICES = [
  { id: "alloy", label: "Alloy · Balanced" },
  { id: "ash", label: "Ash · Warm" },
  { id: "coral", label: "Coral · Clear" },
  { id: "echo", label: "Echo · Deep" },
  { id: "fable", label: "Fable · Expressive" },
  { id: "nova", label: "Nova · Friendly" },
  { id: "onyx", label: "Onyx · Confident" },
  { id: "sage", label: "Sage · Calm" },
  { id: "shimmer", label: "Shimmer · Bright" },
];

export default function VoiceStudio() {
  const [text, setText] = useState("");
  const [voice, setVoice] = useState("nova");
  const [style, setStyle] = useState("Speak naturally and clearly.");
  const [audioUrl, setAudioUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);

  async function generate() {
    if (!text.trim()) { setError("Enter some text before generating audio."); return; }
    setLoading(true);
    setError("");
    setAudioUrl("");
    try {
      const response = await fetch("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim(), voice, instructions: style }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Voice generation failed. Please try again.");
      }
      const blob = await response.blob();
      setAudioUrl(URL.createObjectURL(blob));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not generate audio.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="form-card" style={{ display: "grid", gap: 18 }}>
      <div>
        <label htmlFor="voice-script" className="field-label">Your script</label>
        <textarea
          id="voice-script"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Type or paste the words you want your AI voice to speak..."
          rows={8}
          maxLength={5000}
          style={{ width: "100%", marginTop: 8, resize: "vertical" }}
        />
        <p className="muted" style={{ fontSize: 11, textAlign: "right" }}>{text.length}/5000 characters</p>
      </div>

      <div className="form-grid">
        <div>
          <label htmlFor="voice-choice" className="field-label">AI voice</label>
          <select id="voice-choice" value={voice} onChange={(event) => setVoice(event.target.value)} className="form-input" style={{ width: "100%", marginTop: 8 }}>
            {VOICES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="voice-style" className="field-label">Speaking style</label>
          <input id="voice-style" value={style} onChange={(event) => setStyle(event.target.value)} maxLength={300} className="form-input" style={{ width: "100%", marginTop: 8 }} />
        </div>
      </div>

      <button className="primary-button" type="button" onClick={generate} disabled={loading || !text.trim()} style={{ justifyContent: "center" }}>
        {loading ? <LoaderCircle size={17} className="spin" /> : <Sparkles size={17} />}
        {loading ? "Generating voice..." : "Generate voice"}
      </button>

      {error && <p role="alert" style={{ color: "var(--danger, #dc6262)", fontSize: 13 }}>{error}</p>}

      {audioUrl && (
        <div className="activity-card" style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <AudioLines size={18} />
            <strong>Your generated voice</strong>
          </div>
          <audio controls src={audioUrl} style={{ width: "100%" }}>Your browser does not support audio playback.</audio>
          <a className="subtle-button" href={audioUrl} download="cloneai-voice.mp3" style={{ justifySelf: "start" }}>
            <Download size={15} /> Download MP3
          </a>
        </div>
      )}
      <p className="muted" style={{ fontSize: 11 }}>
        Audio is generated with OpenAI text-to-speech. The voice is synthetic and is not a clone of a real person.
      </p>
    </section>
  );
}
