import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { defaultProvider, hasRealModel, PROVIDERS } from "@/lib/config";
import { buildSystemPrompt, trimHistory, type PromptMessage } from "@/lib/prompt";
import { retrieve, toCitations } from "@/lib/retrieval";
import { streamCompletion } from "@/lib/providers";
import { validateChatInput } from "@/lib/validation";
import type { Agent, ChatStreamEvent, KnowledgeDocument, Message } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function encode(event: ChatStreamEvent): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(event) + "\n");
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "You need to sign in first." }, { status: 401 });
  }
  const ownerId = userData.user.id;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = validateChatInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: Object.values(parsed.errors)[0] }, { status: 400 });
  }
  const { agentId, message, conversationId } = parsed.value;

  const { data: agentRow, error: agentError } = await supabase
    .from("agents")
    .select("*")
    .eq("id", agentId)
    .maybeSingle();

  if (agentError) return NextResponse.json({ error: agentError.message }, { status: 500 });
  if (!agentRow) return NextResponse.json({ error: "That agent does not exist." }, { status: 404 });
  const agent = agentRow as Agent;

  // Resolve the conversation: reuse the given one, or start a new one.
  let activeConversationId = conversationId;
  if (activeConversationId) {
    const { data: existing } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", activeConversationId)
      .eq("agent_id", agentId)
      .maybeSingle();
    if (!existing) activeConversationId = null;
  }

  if (!activeConversationId) {
    const { data: created, error: createError } = await supabase
      .from("conversations")
      .insert({
        agent_id: agentId,
        owner_id: ownerId,
        title: message.slice(0, 60),
      })
      .select("id")
      .single();
    if (createError || !created) {
      return NextResponse.json(
        { error: createError?.message ?? "Could not start a conversation." },
        { status: 500 },
      );
    }
    activeConversationId = created.id as string;
  }

  // Load prior turns and knowledge.
  const [{ data: historyRows }, { data: docRows }] = await Promise.all([
    supabase
      .from("messages")
      .select("role, content")
      .eq("conversation_id", activeConversationId)
      .order("created_at", { ascending: true })
      .limit(40),
    supabase.from("documents").select("id, title, content").eq("agent_id", agentId),
  ]);

  const history: PromptMessage[] = ((historyRows ?? []) as Pick<Message, "role" | "content">[])
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  const documents = (docRows ?? []) as Pick<KnowledgeDocument, "id" | "title" | "content">[];
  const chunks = retrieve(message, documents, 4);
  const citations = toCitations(chunks);

  const system = buildSystemPrompt(agent, citations);
  const messages = trimHistory([...history, { role: "user", content: message }]);

  // Persist the user turn before streaming, so a dropped connection still
  // leaves an accurate transcript.
  await supabase.from("messages").insert({
    conversation_id: activeConversationId,
    role: "user",
    content: message,
  });

  const provider = agent.provider === "demo" && hasRealModel() ? defaultProvider() : agent.provider;
  const model = provider === agent.provider ? agent.model : PROVIDERS[provider].defaultModel;
  const isDemo = provider === "demo";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let full = "";
      try {
        controller.enqueue(
          encode({
            type: "meta",
            conversationId: activeConversationId as string,
            provider,
            model,
            demo: isDemo,
          }),
        );
        if (citations.length) controller.enqueue(encode({ type: "citations", citations }));

        for await (const chunk of streamCompletion({
          provider,
          model,
          system,
          messages,
          temperature: Number(agent.temperature),
          maxTokens: agent.max_tokens,
        })) {
          full += chunk.text;
          controller.enqueue(encode({ type: "delta", text: chunk.text }));
        }

        const { data: saved } = await supabase
          .from("messages")
          .insert({
            conversation_id: activeConversationId,
            role: "assistant",
            content: full,
            citations,
          })
          .select("id")
          .single();

        await supabase.from("usage_events").insert({
          owner_id: ownerId,
          agent_id: agentId,
          kind: "chat",
          provider,
          model,
          prompt_chars: system.length + messages.reduce((n, m) => n + m.content.length, 0),
          completion_chars: full.length,
        });

        await supabase
          .from("conversations")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", activeConversationId);

        controller.enqueue(encode({ type: "done", messageId: (saved?.id as string) ?? "" }));
      } catch (cause) {
        const text = cause instanceof Error ? cause.message : "The model call failed.";
        controller.enqueue(encode({ type: "error", message: text }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
