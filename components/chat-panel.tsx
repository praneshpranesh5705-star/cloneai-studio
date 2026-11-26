"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, BookOpen, Loader2, Sparkles, Square } from "lucide-react";
import type { ChatStreamEvent, Citation, Message } from "@/lib/types";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[];
  streaming?: boolean;
};

export default function ChatPanel({
  agentId,
  agentName,
  initialMessages,
  initialConversationId,
  demo,
}: {
  agentId: string;
  agentName: string;
  initialMessages: Message[];
  initialConversationId: string | null;
  demo: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(
    initialMessages.map((m) => ({
      id: m.id,
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
      citations: m.citations ?? [],
    })),
  );
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [openCitations, setOpenCitations] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy) return;

    setInput("");
    setError("");
    setBusy(true);

    const userMessage: ChatMessage = {
      id: `local-user-${Date.now()}`,
      role: "user",
      content: text,
      citations: [],
    };
    const assistantId = `local-assistant-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      userMessage,
      { id: assistantId, role: "assistant", content: "", citations: [], streaming: true },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, message: text, conversationId }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? `Request failed (${response.status}).`);
      }
      if (!response.body) throw new Error("The server returned an empty stream.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newline: number;
        while ((newline = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (!line) continue;

          let event: ChatStreamEvent;
          try {
            event = JSON.parse(line) as ChatStreamEvent;
          } catch {
            continue;
          }

          if (event.type === "meta") {
            setConversationId(event.conversationId);
          } else if (event.type === "citations") {
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, citations: event.citations } : m)),
            );
          } else if (event.type === "delta") {
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + event.text } : m)),
            );
          } else if (event.type === "done") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, id: event.messageId || m.id, streaming: false } : m,
              ),
            );
          } else if (event.type === "error") {
            throw new Error(event.message);
          }
        }
      }
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, streaming: false } : m)),
        );
      } else {
        const message = cause instanceof Error ? cause.message : "Something went wrong.";
        setError(message);
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  return (
    <div className="chat-panel">
      <div className="chat-scroll" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="chat-empty">
            <div className="empty-icon"><Sparkles size={22} /></div>
            <strong>Start a conversation with {agentName}</strong>
            <p>
              {demo
                ? "This deployment is in demo mode, so replies are generated locally. Add a model key in Settings for real answers."
                : "Ask anything. Answers will cite the knowledge documents that matched."}
            </p>
          </div>
        )}

        {messages.map((message) => (
          <div key={message.id} className={`bubble-row ${message.role}`}>
            <div className={`bubble ${message.role}`}>
              {message.content ? (
                <div className="bubble-text">{message.content}</div>
              ) : (
                <div className="typing"><span /><span /><span /></div>
              )}

              {message.citations.length > 0 && (
                <div className="citation-block">
                  <button
                    className="citation-toggle"
                    onClick={() => setOpenCitations(openCitations === message.id ? null : message.id)}
                    aria-expanded={openCitations === message.id}
                  >
                    <BookOpen size={13} />
                    {message.citations.length} source{message.citations.length === 1 ? "" : "s"} used
                  </button>
                  {openCitations === message.id && (
                    <ul className="citation-list">
                      {message.citations.map((citation, index) => (
                        <li key={`${citation.documentId}-${index}`}>
                          <strong>[{index + 1}] {citation.title}</strong>
                          <p>{citation.excerpt}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {error && <div className="error-note" role="alert">{error}</div>}

      <form className="composer" onSubmit={send}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(e);
            }
          }}
          placeholder={`Message ${agentName}…`}
          rows={1}
          maxLength={8000}
          aria-label="Message"
        />
        {busy ? (
          <button
            type="button"
            className="composer-send stop"
            onClick={() => abortRef.current?.abort()}
            aria-label="Stop generating"
          >
            <Square size={15} />
          </button>
        ) : (
          <button type="submit" className="composer-send" disabled={!input.trim()} aria-label="Send message">
            {busy ? <Loader2 size={16} className="spin" /> : <ArrowUp size={16} />}
          </button>
        )}
      </form>
    </div>
  );
}
