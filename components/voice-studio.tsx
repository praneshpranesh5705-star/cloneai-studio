"use client";

import { useEffect, useState } from "react";
import { AudioLines, Download, LoaderCircle, Play, Sparkles, Square } from "lucide-react";

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
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [browserVoiceURI, setBrowserVoiceURI] = useState("");
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    const refreshVoices = () => {
      const available = synth.getVoices();
      setBrowserVoices(available);
      setBrowserVoiceURI((current) => current || available.find((item) => item.default)?.voiceURI || available[0]?.voiceURI || "");
    };
    refreshVoices();
    synth.addEventListener("voiceschanged", refreshVoices);
    return () => {
      synth.removeEventListener("voiceschanged", refreshVoices);
      synth.cancel();
    };
  }, []);

  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);

  function speakForFree() {
    if (!text.trim()) { setError("Enter some text before speaking."); return; }
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setError("Your browser does not support device text-to-speech. Try the latest Chrome browser.");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.trim());
    const selected = browserVoices.find((item) => item.voiceURI === browserVoiceURI);
    if (selected) {
      utterance.voice = selected;
      utterance.lang = selected.lang;
    }
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    setError("");
    window.speechSynthesis.speak(utterance);
  }

  function stopSpeaking() {
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeaking(false);
  }

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

      <div className="activity-card" style={{ display: "grid", gap: 12 }}>
        <div>
          <strong>Free device voice</strong>
          <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>Uses a voice already available on your phone or browser. No API key, credits, or payment needed.</p>
        </div>
        {browserVoices.length > 0 && (
          <div>
            <label htmlFor="device-voice-choice" className="field-label">Device voice</label>
            <select id="device-voice-choice" value={browserVoiceURI} onChange={(event) => setBrowserVoiceURI(event.target.value)} className="form-input" style={{ width: "100%", marginTop: 8 }}>
              {browserVoices.map((item) => <option key={item.voiceURI} value={item.voiceURI}>{item.name} ({item.lang}){item.default ? " · Default" : ""}</option>)}
            </select>
          </div>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <button className="primary-button" type="button" onClick={speakForFree} disabled={!text.trim() || speaking} style={{ justifyContent: "center" }}>
            <Play size={16} /> Speak for free
          </button>
          <button className="subtle-button" type="button" onClick={stopSpeaking} disabled={!speaking}>
            <Square size={14} /> Stop
          </button>
        </div>
        {browserVoices.length === 0 && <p className="muted" style={{ fontSize: 11 }}>Loading device voices. If none appear, check that text-to-speech voices are installed on your phone.</p>}
      </div>

      <div>
        <strong>AI voice generation (OpenAI)</strong>
        <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>Optional cloud generation. This requires an OpenAI API key with available API credits.</p>
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
        Free device speech plays through your phone or browser and does not create a downloadable MP3. OpenAI-generated audio is synthetic and is not a clone of a real person.
      </p>
    </section>
  );
}
