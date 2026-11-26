"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";

export default function DeleteAgentButton({ agentId, agentName }: { agentId: string; agentName: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/agents/${agentId}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Could not delete this agent.");
      }
      router.push("/agents");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete this agent.");
      setBusy(false);
    }
  }

  if (!confirming) {
    return (
      <button className="danger-button" onClick={() => setConfirming(true)}>
        <Trash2 size={15} /> Delete agent
      </button>
    );
  }

  return (
    <div className="confirm-row">
      <span>Delete “{agentName}” and all its documents and chats?</span>
      <button className="danger-button" onClick={remove} disabled={busy}>
        {busy ? <Loader2 size={15} className="spin" /> : <Trash2 size={15} />}
        {busy ? "Deleting…" : "Yes, delete"}
      </button>
      <button className="ghost-button" onClick={() => setConfirming(false)} disabled={busy}>Cancel</button>
      {error && <em className="confirm-error">{error}</em>}
    </div>
  );
}
