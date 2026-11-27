"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Code2,
  Copy,
  Download,
  ExternalLink,
  Globe2,
  LoaderCircle,
  Monitor,
  RefreshCw,
  Smartphone,
  Sparkles,
} from "lucide-react";
import "./website-builder.css";

const PREVIEW_CSP =
  "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; img-src data: blob: https:; style-src 'unsafe-inline' https:; font-src data: https:; script-src 'unsafe-inline'; connect-src 'none'; form-action 'none'; base-uri 'none'\">";

function makePreviewDocument(html: string) {
  if (html.toLowerCase().includes("<head")) {
    return html.replace(/<head[^>]*>/i, (match) => match + PREVIEW_CSP);
  }
  return html.replace(/<html([^>]*)>/i, (match) => match + "<head>" + PREVIEW_CSP + "</head>");
}

type SavedPage = {
  id: string;
  slug: string;
  title: string;
  published: boolean;
  updated_at: string;
};

export default function WebsiteBuilder() {
  const [prompt, setPrompt] = useState("");
  const [revision, setRevision] = useState("");
  const [html, setHtml] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [view, setView] = useState<"desktop" | "mobile">("desktop");
  const [showCode, setShowCode] = useState(false);
  const [saved, setSaved] = useState<SavedPage | null>(null);
  const [copied, setCopied] = useState(false);

  const preview = useMemo(() => (html ? makePreviewDocument(html) : ""), [html]);

  const publicUrl = useMemo(() => {
    if (!saved?.published) return "";
    if (typeof window === "undefined") return `/p/${saved.slug}`;
    return `${window.location.origin}/p/${saved.slug}`;
  }, [saved]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

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
    setNotice("");
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
      if (typeof data.html !== "string" || !data.html) {
        throw new Error("The model returned an empty page.");
      }
      setHtml(data.html);
      setTitle(typeof data.title === "string" ? data.title : "");
      setRevision("");
      setShowCode(false);
      // A regenerated page is a new draft: the previous save no longer matches.
      setSaved(null);
      setNotice(
        isRevision
          ? "Changes applied. Save or publish to keep them."
          : "Page generated. Preview it below, then save or publish.",
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Website generation failed.");
    } finally {
      setBusy(false);
    }
  }

  const save = useCallback(
    async (publish: boolean) => {
      if (!html) return;
      setSaving(true);
      setError("");
      setNotice("");
      try {
        const response = await fetch("/api/website-builder/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: saved?.id,
            html,
            prompt: prompt.trim(),
            publish,
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Could not save the page.");
        setSaved(data.website as SavedPage);
        setNotice(
          publish
            ? "Published. Anyone with the link can open it."
            : "Saved as a draft. Only you can see it.",
        );
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not save the page.");
      } finally {
        setSaving(false);
      }
    },
    [html, prompt, saved],
  );

  function downloadHtml() {
    if (!html) return;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${(saved?.slug || "cloneai-page").replace(/[^a-z0-9-]/gi, "-")}.html`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function copyLink() {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
    } catch {
      setError("Could not copy the link. Select it and copy manually.");
    }
  }

  return (
    <div className="website-builder">
      <section className="form-card website-builder-card">
        <div className="website-builder-heading">
          <span className="voice-studio-icon"><Sparkles size={20} /></span>
          <div>
            <h2>Build a website with AI</h2>
            <p className="form-lead">
              Describe your idea. The model writes a complete, responsive page you can preview,
              refine, publish and download.
            </p>
          </div>
        </div>

        <label className="field">
          <span>
            What website do you want to create? <small>{prompt.length}/2500</small>
          </span>
          <textarea
            className="website-prompt"
            value={prompt}
            maxLength={2500}
            onChange={(event) => setPrompt(event.target.value)}
            rows={5}
            placeholder="Example: Create a modern website for an agricultural machinery company. Include a hero section, product cards, services, about us, contact details, and a responsive mobile layout."
          />
        </label>

        <button
          className="primary-button website-generate"
          onClick={() => generate(false)}
          disabled={busy || !prompt.trim()}
        >
          {busy ? (
            <><LoaderCircle className="spin" size={16} /> Building website…</>
          ) : (
            <><Sparkles size={16} /> Generate website</>
          )}
        </button>

        {error && <div className="error-note" role="alert">{error}</div>}
        {notice && !error && (
          <div className="website-notice" role="status"><Check size={14} /> {notice}</div>
        )}
      </section>

      {html && (
        <section className="form-card website-output-card">
          <div className="website-output-head">
            <div>
              <h2>{title || "Your website preview"}</h2>
              <p className="form-lead">
                The preview is sandboxed. A published page is served with scripts disabled, so it
                cannot reach your account.
              </p>
            </div>
            <div className="website-output-actions">
              <button className="subtle-button" onClick={downloadHtml}>
                <Download size={15} /> Download
              </button>
              <button
                className="subtle-button"
                onClick={() => save(false)}
                disabled={saving}
              >
                {saving ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />} Save draft
              </button>
              <button
                className="primary-button website-publish"
                onClick={() => save(true)}
                disabled={saving}
              >
                {saving ? (
                  <><LoaderCircle className="spin" size={15} /> Working…</>
                ) : (
                  <><Globe2 size={15} /> {saved?.published ? "Update published page" : "Publish"}</>
                )}
              </button>
            </div>
          </div>

          {publicUrl && (
            <div className="website-live">
              <span className="website-live-dot" aria-hidden="true" />
              <span className="website-live-label">Live at</span>
              <a href={publicUrl} target="_blank" rel="noreferrer noopener" className="website-live-url">
                {publicUrl}
              </a>
              <button className="subtle-button" onClick={copyLink}>
                {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
              </button>
              <a className="subtle-button" href={publicUrl} target="_blank" rel="noreferrer noopener">
                <ExternalLink size={14} /> Open
              </a>
            </div>
          )}

          <div className="website-toolbar">
            <div className="website-view-switch">
              <button
                className={view === "desktop" ? "selected" : ""}
                onClick={() => setView("desktop")}
                aria-label="Desktop preview"
              >
                <Monitor size={15} /> Desktop
              </button>
              <button
                className={view === "mobile" ? "selected" : ""}
                onClick={() => setView("mobile")}
                aria-label="Mobile preview"
              >
                <Smartphone size={15} /> Mobile
              </button>
            </div>
            <button className="subtle-button" onClick={() => setShowCode((value) => !value)}>
              <Code2 size={15} /> {showCode ? "Hide code" : "View code"}
            </button>
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

          {showCode && (
            <textarea
              className="website-code"
              value={html}
              onChange={(event) => setHtml(event.target.value)}
              spellCheck={false}
              aria-label="Generated HTML source"
            />
          )}

          <div className="website-revise">
            <label className="field">
              <span>What would you like to change?</span>
              <input
                className="voice-style"
                value={revision}
                maxLength={1200}
                onChange={(event) => setRevision(event.target.value)}
                placeholder="Example: Make the header smaller and add a testimonials section."
              />
            </label>
            <button
              className="primary-button"
              onClick={() => generate(true)}
              disabled={busy || !revision.trim()}
            >
              {busy ? (
                <><LoaderCircle className="spin" size={16} /> Updating…</>
              ) : (
                <><RefreshCw size={15} /> Apply changes</>
              )}
            </button>
          </div>
        </section>
      )}

      <section className="setup-note website-provider-note">
        <strong>How this works</strong><br />
        Generation uses whichever model key is configured on the server — OpenAI, OpenRouter,
        Anthropic or Google Gemini. The key is never sent to the browser. Published pages are
        served with scripts disabled and cannot access your account.
      </section>
    </div>
  );
}
