"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2, Plus, Trash2, Upload, X } from "lucide-react";
import type { KnowledgeDocument } from "@/lib/types";
import "./knowledge-panel.css";

const MAX_BYTES = 4 * 1024 * 1024;
const ACCEPT = ".pdf,.docx";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function KnowledgePanel({
  agentId,
  documents,
}: {
  agentId: string;
  documents: KnowledgeDocument[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"paste" | "upload">("paste");

  // --- paste state ---
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});

  // --- upload state ---
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploadTitle, setUploadTitle] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  function resetMessages() {
    setError("");
    setNotice("");
    setFields({});
  }

  function pickFile(next: File | null) {
    resetMessages();
    if (!next) {
      setFile(null);
      setUploadTitle("");
      return;
    }
    const lower = next.name.toLowerCase();
    if (!lower.endsWith(".pdf") && !lower.endsWith(".docx")) {
      setError("Only PDF and DOCX files are supported.");
      setFile(null);
      setUploadTitle("");
      return;
    }
    if (next.size > MAX_BYTES) {
      setError(`That file is ${formatBytes(next.size)}. The limit is 4 MB.`);
      setFile(null);
      setUploadTitle("");
      return;
    }
    if (next.size === 0) {
      setError("That file is empty.");
      setFile(null);
      setUploadTitle("");
      return;
    }
    setFile(next);
    setUploadTitle(
      next.name
        .replace(/\.(pdf|docx)$/i, "")
        .replace(/_+/g, " ")
        .replace(/\s*-\s*/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 160),
    );
  }

  async function addPasted(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    resetMessages();
    try {
      const response = await fetch(`/api/agents/${agentId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content }),
      });
      const payload = (await response.json()) as {
        error?: string;
        fields?: Record<string, string>;
      };
      if (!response.ok) {
        if (payload.fields) setFields(payload.fields);
        setError(payload.error ?? "Could not save this document.");
        return;
      }
      setTitle("");
      setContent("");
      setNotice("Document added.");
      router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function addUploaded(event: React.FormEvent) {
    event.preventDefault();
    if (!file) {
      setError("Choose a PDF or DOCX file first.");
      return;
    }
    setBusy(true);
    resetMessages();
    try {
      const body = new FormData();
      body.append("file", file);
      if (uploadTitle.trim()) body.append("title", uploadTitle.trim());

      const response = await fetch(`/api/agents/${agentId}/documents/upload`, {
        method: "POST",
        body,
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        fields?: Record<string, string>;
        extracted?: { kind: string; pages: number | null; characters: number };
      };

      if (!response.ok) {
        if (payload.fields) setFields(payload.fields);
        setError(payload.error ?? "Could not add that file.");
        return;
      }

      const info = payload.extracted;
      setNotice(
        info
          ? `Added ${info.characters.toLocaleString()} characters${
              info.pages ? ` from ${info.pages} page${info.pages === 1 ? "" : "s"}` : ""
            }.`
          : "File added.",
      );
      setFile(null);
      setUploadTitle("");
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setDeleting(id);
    resetMessages();
    try {
      const response = await fetch(`/api/documents/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Could not delete this document.");
      }
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete this document.");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="knowledge-panel">
      <div className="form-card">
        <h3>Add knowledge</h3>
        <p className="form-lead">
          Give the agent text to answer from — policies, product details, FAQs. Retrieval picks the most
          relevant passages for each question.
        </p>

        <div className="kb-mode-switch" role="tablist" aria-label="How to add knowledge">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "paste"}
            className={mode === "paste" ? "active" : ""}
            onClick={() => {
              setMode("paste");
              resetMessages();
            }}
          >
            <FileText size={14} /> Paste text
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "upload"}
            className={mode === "upload" ? "active" : ""}
            onClick={() => {
              setMode("upload");
              resetMessages();
            }}
          >
            <Upload size={14} /> Upload file
          </button>
        </div>

        {error && (
          <div className="error-note" role="alert">
            <X size={13} />
            <span>{error}</span>
          </div>
        )}
        {notice && !error && (
          <div className="success-note" role="status">
            {notice}
          </div>
        )}

        {mode === "paste" ? (
          <form onSubmit={addPasted}>
            <label className="field">
              <span>Title</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Returns policy"
                maxLength={160}
                required
              />
              {fields.title && <em>{fields.title}</em>}
            </label>

            <label className="field">
              <span>Content</span>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Paste the text here…"
                rows={8}
                required
              />
              <small className="field-hint">{content.length.toLocaleString()} characters</small>
              {fields.content && <em>{fields.content}</em>}
            </label>

            <div className="form-actions">
              <button className="primary-button" type="submit" disabled={busy}>
                {busy ? <Loader2 size={16} className="spin" /> : <Plus size={16} />}
                {busy ? "Saving…" : "Add document"}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={addUploaded}>
            <div
              className={`kb-drop${dragging ? " dragging" : ""}${file ? " has-file" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                pickFile(e.dataTransfer.files?.[0] ?? null);
              }}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  inputRef.current?.click();
                }
              }}
              role="button"
              tabIndex={0}
              aria-label="Choose a PDF or DOCX file"
            >
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                className="kb-file-input"
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              />
              {file ? (
                <>
                  <FileText size={20} />
                  <strong>{file.name}</strong>
                  <small>{formatBytes(file.size)} · click to choose a different file</small>
                </>
              ) : (
                <>
                  <Upload size={20} />
                  <strong>Drop a PDF or DOCX here</strong>
                  <small>or click to browse · up to 4 MB</small>
                </>
              )}
            </div>

            {file && (
              <label className="field" style={{ marginTop: 15 }}>
                <span>Title</span>
                <input
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  placeholder="Document title"
                  maxLength={160}
                />
                <small className="field-hint">Defaults to the file name.</small>
                {fields.title && <em>{fields.title}</em>}
              </label>
            )}

            <div className="form-actions">
              <button className="primary-button" type="submit" disabled={busy || !file}>
                {busy ? <Loader2 size={16} className="spin" /> : <Upload size={16} />}
                {busy ? "Extracting…" : "Add file"}
              </button>
              {file && !busy && (
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    setFile(null);
                    setUploadTitle("");
                    resetMessages();
                    if (inputRef.current) inputRef.current.value = "";
                  }}
                >
                  Clear
                </button>
              )}
            </div>
          </form>
        )}
      </div>

      <section className="doc-list">
        <h3>Documents ({documents.length})</h3>
        {documents.length === 0 ? (
          <p className="muted" style={{ fontSize: 11 }}>
            No documents yet. The agent will answer from general knowledge and say when it is unsure.
          </p>
        ) : (
          documents.map((doc) => (
            <article className="doc-row" key={doc.id}>
              <span className="doc-icon">
                <FileText size={16} />
              </span>
              <div className="doc-copy">
                <strong>{doc.title}</strong>
                <small>
                  {doc.char_count.toLocaleString()} characters · added{" "}
                  {new Date(doc.created_at).toLocaleDateString()}
                </small>
              </div>
              <button
                className="doc-delete"
                onClick={() => remove(doc.id)}
                disabled={deleting === doc.id}
                aria-label={`Delete ${doc.title}`}
              >
                {deleting === doc.id ? <Loader2 size={15} className="spin" /> : <Trash2 size={15} />}
              </button>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
