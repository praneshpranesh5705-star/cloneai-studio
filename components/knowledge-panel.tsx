"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2, Plus, Trash2 } from "lucide-react";
import type { KnowledgeDocument } from "@/lib/types";

export default function KnowledgePanel({
  agentId,
  documents,
}: {
  agentId: string;
  documents: KnowledgeDocument[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [deleting, setDeleting] = useState<string | null>(null);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setFields({});
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
      router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setDeleting(id);
    setError("");
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
      <form className="form-card" onSubmit={add}>
        <h3>Add a document</h3>
        <p className="form-lead">
          Paste text the agent should answer from — policies, product details, FAQs. Retrieval picks the
          most relevant passages for each question.
        </p>

        {error && <div className="error-note" role="alert">{error}</div>}

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

      <section className="doc-list">
        <h3>Documents ({documents.length})</h3>
        {documents.length === 0 ? (
          <p className="muted" style={{ fontSize: 11 }}>
            No documents yet. The agent will answer from general knowledge and say when it is unsure.
          </p>
        ) : (
          documents.map((doc) => (
            <article className="doc-row" key={doc.id}>
              <span className="doc-icon"><FileText size={16} /></span>
              <div className="doc-copy">
                <strong>{doc.title}</strong>
                <small>{doc.char_count.toLocaleString()} characters · added {new Date(doc.created_at).toLocaleDateString()}</small>
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
