"use client";

import { useMemo, useState } from "react";
import { Code2, Download, LoaderCircle, Monitor, RefreshCw, Smartphone, Sparkles } from "lucide-react";

const PREVIEW_CSP = "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; img-src data: blob: https:; style-src 'unsafe-inline' https:; font-src data: https:; script-src 'unsafe-inline'; connect-src 'none'; form-action 'none'; base-uri 'none'\">";

function makePreviewDocument(html: string) {
  if (/<head[\\s>]/i.test(html)) return html.replace(/<head([^>]*)>/i, (match) => match + PREVIEW_CSP);
  return html.replace(/<html([^>]*)>/i, (match) => match + "<head>" + PREVIEW_CSP + "</head>");
}

export default function WebsiteBuilder() {
  const [prompt, setPrompt] = useState("");
  const [revision, setRevision] = useState("");
  const [html, setHtml] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState<"desktop" | "mobile">("desktop");
  const [showCode, setShowCode] = useState(false);

  const preview = useMemo(() => html ? makePreviewDocument(html) : "", [html]);

  async function generate(isRevision = false) {
    if (!prompt.trim()) {
      setError("Describe the website you want to create.");
      return;
    }
    if (isRevision && !revision.trim()) {
      setError("Describe what you want to change first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/website-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          previousHtml: isRevision ? html : "",
          revision: isRevision ? revision.trim() : "",
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Website generation failed.");
      if (typeof data.html !== "string" || !data.html) throw new Error("The AI returned an empty website.");
      setHtml(data.html);
      setRevision("");
      setShowCode(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Website generation failed.");
    } finally {
      setBusy(false);
    }
  }

  function downloadHtml() {
    if (!html) return;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "cloneai-generated-website.html";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="website-builder">
      <section className="form-card website-builder-card">
        <div className="website-builder-heading">
          <span className="voice-studio-icon"><Sparkles size={20} /></span>
          <div>
            <h2>Build a website with AI</h2>
            <p className="form-lead">Describe your idea. Gemini will create a responsive website you can preview, refine, and download.</p>
          </div>
        </div>

        <label className="field">
          <span>What website do you want to create? <small>{prompt.length}/2500</small></span>
          <textarea className="website-prompt" value={prompt} maxLength={2500} onChange={(event) => setPrompt(event.target.value)} rows={5} placeholder="Example: Create a modern website for an agricultural machinery company. Include a hero section, product cards, services, about us, contact details, and a responsive mobile layout." />
        </label>

        <button className="primary-button website-generate" onClick={() => generate(false)} disabled={busy || !prompt.trim()}>
          {busy ? <><LoaderCircle className="spin" size={16} /> Building website…</> : <><Sparkles size={16} /> Generate website</>}
        </button>

        {error && <div className="error-note" role="alert">{error}</div>}
      </section>

      {html && (
        <section className="form-card website-output-card">
          <div className="website-output-head">
            <div><h2>Your website preview</h2><p className="form-lead">Preview is sandboxed. Generated pages cannot access your CloneAI Studio account.</p></div>
            <button className="subtle-button" onClick={downloadHtml}><Download size={15} /> Download HTML</button>
          </div>

          <div className="website-toolbar">
            <div className="website-view-switch">
              <button className={view === "desktop" ? "selected" : ""} onClick={() => setView("desktop")} aria-label="Desktop preview"><Monitor size={15} /> Desktop</button>
              <button className={view === "mobile" ? "selected" : ""} onClick={() => setView("mobile")} aria-label="Mobile preview"><Smartphone size={15} /> Mobile</button>
            </div>
            <button className="subtle-button" onClick={() => setShowCode((value) => !value)}><Code2 size={15} /> {showCode ? "Hide code" : "View code"}</button>
          </div>

          <div className="website-preview-stage">
            <iframe
              title="Generated website preview"
              className={view === "mobile" ? "website-preview mobile" : "website-preview"}
              sandbox="allow-scripts"
              referrerPolicy="no-referrer"
              srcDoc={preview}
            />
          </div>

          {showCode && <textarea className="website-code" value={html} onChange={(event) => setHtml(event.target.value)} spellCheck={false} aria-label="Generated HTML source" />}

          <div className="website-revise">
            <label className="field">
              <span>What would you like to change?</span>
              <input className="voice-style" value={revision} maxLength={1200} onChange={(event) => setRevision(event.target.value)} placeholder="Example: Make the header smaller and add a testimonials section." />
            </label>
            <button className="primary-button" onClick={() => generate(true)} disabled={busy || !revision.trim()}>
              {busy ? <><LoaderCircle className="spin" size={16} /> Updating…</> : <><RefreshCw size={15} /> Regenerate changes</>}
            </button>
          </div>
        </section>
      )}

      <section className="setup-note website-provider-note">
        <strong>AI provider</strong><br />
        Website generation uses your existing server-side <code>GEMINI_API_KEY</code>. API access, free-tier eligibility, quotas, and pricing depend on Google's current Gemini API terms. The key is never exposed to the browser.
      </section>
    </div>
  );
}
