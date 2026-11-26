"use client";

import { useState } from "react";
import Link from "next/link";
import { MessageSquare, Settings2, BookOpen } from "lucide-react";
import ChatPanel from "@/components/chat-panel";
import KnowledgePanel from "@/components/knowledge-panel";
import AgentForm from "@/components/agent-form";
import DeleteAgentButton from "@/components/delete-agent-button";
import type { Agent, KnowledgeDocument, Message } from "@/lib/types";
import type { ProviderId } from "@/lib/config";

type Tab = "chat" | "knowledge" | "settings";

export default function AgentTabs({
  agent,
  documents,
  messages,
  conversationId,
  available,
  demo,
}: {
  agent: Agent;
  documents: KnowledgeDocument[];
  messages: Message[];
  conversationId: string | null;
  available: ProviderId[];
  demo: boolean;
}) {
  const [tab, setTab] = useState<Tab>("chat");

  return (
    <>
      <div className="tab-bar" role="tablist">
        <button role="tab" aria-selected={tab === "chat"} className={tab === "chat" ? "active" : ""} onClick={() => setTab("chat")}>
          <MessageSquare size={15} /> Chat
        </button>
        <button role="tab" aria-selected={tab === "knowledge"} className={tab === "knowledge" ? "active" : ""} onClick={() => setTab("knowledge")}>
          <BookOpen size={15} /> Knowledge <span className="tab-count">{documents.length}</span>
        </button>
        <button role="tab" aria-selected={tab === "settings"} className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>
          <Settings2 size={15} /> Settings
        </button>
      </div>

      {tab === "chat" && (
        <ChatPanel
          agentId={agent.id}
          agentName={agent.name}
          initialMessages={messages}
          initialConversationId={conversationId}
          demo={demo}
        />
      )}

      {tab === "knowledge" && <KnowledgePanel agentId={agent.id} documents={documents} />}

      {tab === "settings" && (
        <div className="settings-stack">
          <AgentForm
            mode="edit"
            agentId={agent.id}
            available={available}
            initial={{
              name: agent.name,
              description: agent.description ?? "",
              system_prompt: agent.system_prompt,
              provider: agent.provider,
              model: agent.model,
              temperature: Number(agent.temperature),
              max_tokens: agent.max_tokens,
              is_public: agent.is_public,
            }}
          />
          <div className="danger-zone">
            <h3>Danger zone</h3>
            <p>Deleting an agent also deletes its documents and every conversation.</p>
            <DeleteAgentButton agentId={agent.id} agentName={agent.name} />
          </div>
          <p className="muted" style={{ fontSize: 10 }}>
            <Link href="/agents">← Back to all agents</Link>
          </p>
        </div>
      )}
    </>
  );
}
