"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { PROVIDERS, type ProviderId } from "@/lib/config";

export type AgentFormValues = {
  name: string;
  description: string;
  system_prompt: string;
  provider: ProviderId;
  model: string;
  temperature: number;
  max_tokens: number;
  is_public: boolean;
};

const EMPTY: AgentFormValues = {
  name: "",
  description: "",
  system_prompt: "",
  provider: "demo",
  model: "demo",
  temperature: 0.7,
  max_tokens: 800,
  is_public: false,
};

export default function AgentForm({
  mode,
  agentId,
  initial,
  available,
}: {
  mode: "create" | "edit";
  agentId?: string;
  initial?: Partial<AgentFormValues>;
  available: ProviderId[];
}) {
  const router = useRouter();
  const [values, setValues] = useState<AgentFormValues>(() => {
    const base = { ...EMPTY, ...initial };
    // Prefer a configured real provider for new agents instead of silently
    // creating demo agents when the workspace already has working API keys.
    if (mode === "create" && !initial?.provider) {
      const firstConfigured = available.find((id) => id !== "demo") ?? "demo";
      return { ...base, provider: firstConfigured, model: PROVIDERS[firstConfigured].defaultModel };
    }
    return base;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof AgentFormValues>(key: K, value: AgentFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    setFormError("");
    try {
      const response = await fetch(mode === "create" ? "/api/agents" : `/api/agents/${agentId}`, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const payload = (await response.json()) as {
        agent?: { id: string };
        error?: string;
        fields?: Record<string, string>;
      };
      if (!response.ok) {
        if (payload.fields) setErrors(payload.fields);
        setFormError(payload.error ?? "Could not save this agent.");
        return;
      }
      router.push(`/agents/${payload.agent?.id ?? agentId}`);
      router.refresh();
    } catch {
      setFormError("Network error. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form-card" onSubmit={submit}>
      <Link className="back-link" href={mode === "create" ? "/agents" : `/agents/${agentId}`}>
        <ArrowLeft size={14} /> Back
      </Link>

      <h2>{mode === "create" ? "Create an agent" : "Agent settings"}</h2>
      <p className="form-lead">
        Instructions shape how the agent answers. Knowledge documents are added after saving.
      </p>

      {formError && <div className="error-note" role="alert">{formError}</div>}

      <label className="field">
        <span>Name</span>
        <input
          value={values.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="e.g. Product support assistant"
          maxLength={80}
          required
        />
        {errors.name && <em>{errors.name}</em>}
      </label>

      <label className="field">
        <span>Description <small>optional</small></span>
        <input
          value={values.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="What is this agent for?"
          maxLength={400}
        />
        {errors.description && <em>{errors.description}</em>}
      </label>

      <label className="field">
        <span>Instructions <small>optional</small></span>
        <textarea
          value={values.system_prompt}
          onChange={(e) => set("system_prompt", e.target.value)}
          placeholder="Answer in short paragraphs. Always mention the return window when asked about refunds."
          rows={6}
          maxLength={8000}
        />
        {errors.system_prompt && <em>{errors.system_prompt}</em>}
      </label>

      <div className="field-row">
        <label className="field">
          <span>Provider</span>
          <select
            value={values.provider}
            onChange={(e) => {
              const provider = e.target.value as ProviderId;
              set("provider", provider);
              set("model", PROVIDERS[provider].defaultModel);
            }}
          >
            {(Object.keys(PROVIDERS) as ProviderId[]).map((id) => (
              <option key={id} value={id} disabled={!available.includes(id)}>
                {PROVIDERS[id].label}{available.includes(id) ? "" : " — no key"}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Model</span>
          <input
            value={values.model}
            onChange={(e) => set("model", e.target.value)}
            placeholder={PROVIDERS[values.provider].defaultModel}
          />
          {errors.model && <em>{errors.model}</em>}
        </label>
      </div>

      <div className="field-row">
        <label className="field">
          <span>Temperature <small>{values.temperature.toFixed(2)}</small></span>
          <input
            type="range"
            min={0}
            max={2}
            step={0.05}
            value={values.temperature}
            onChange={(e) => set("temperature", Number(e.target.value))}
          />
        </label>
        <label className="field">
          <span>Max tokens</span>
          <input
            type="number"
            min={64}
            max={4096}
            step={64}
            value={values.max_tokens}
            onChange={(e) => set("max_tokens", Number(e.target.value))}
          />
        </label>
      </div>

      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={values.is_public}
          onChange={(e) => set("is_public", e.target.checked)}
        />
        <span>Let other signed-in users see this agent in their list</span>
      </label>

      <div className="form-actions">
        <button className="primary-button" type="submit" disabled={busy}>
          {busy ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
          {busy ? "Saving…" : mode === "create" ? "Create agent" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
