import type { Agent, Citation } from "./types";

export const MAX_HISTORY_MESSAGES = 12;

export type PromptMessage = { role: "user" | "assistant"; content: string };

/**
 * Build the system prompt. Knowledge is injected as numbered context blocks so
 * the model can cite them, and the instructions explicitly forbid inventing
 * facts that are not in the context — the same honesty contract the UI shows.
 */
export function buildSystemPrompt(agent: Pick<Agent, "name" | "description" | "system_prompt">, citations: Citation[]): string {
  const parts: string[] = [];

  parts.push(
    `You are "${agent.name}", an AI assistant built in CloneAI Studio.`,
  );

  if (agent.description) {
    parts.push(`Purpose: ${agent.description}`);
  }

  if (agent.system_prompt.trim()) {
    parts.push(`Instructions from the creator:\n${agent.system_prompt.trim()}`);
  }

  if (citations.length) {
    const blocks = citations
      .map((c, i) => `[${i + 1}] ${c.title}\n${c.excerpt}`)
      .join("\n\n");
    parts.push(
      `Knowledge base excerpts relevant to this question:\n\n${blocks}\n\n` +
        `Use these excerpts when they answer the question, and refer to them as [1], [2] and so on. ` +
        `If the excerpts do not contain the answer, say so plainly instead of guessing.`,
    );
  } else {
    parts.push(
      `No knowledge base excerpts matched this question. Answer from general knowledge, ` +
        `and say clearly when you are unsure or when the answer depends on information you do not have.`,
    );
  }

  parts.push(
    `Rules:\n` +
      `- Be concise and direct. Prefer short paragraphs over long lists.\n` +
      `- Never invent facts, figures, names or sources.\n` +
      `- If you do not know something, say "I don't know" and explain what would be needed.\n` +
      `- Do not claim to have taken actions you cannot take.`,
  );

  return parts.join("\n\n");
}

/**
 * Keep only the most recent turns, and never start with an assistant turn.
 *
 * Also enforces strict user/assistant alternation. This matters more than it
 * looks: if an assistant reply fails to persist (provider error, dropped
 * connection), the transcript can contain two user turns in a row. OpenAI
 * tolerates that; Anthropic and Gemini both reject the request outright, so a
 * single failed turn would poison the whole conversation on those providers.
 * Consecutive turns from the same role are merged rather than dropped, so no
 * user text is lost.
 */
export function trimHistory(messages: PromptMessage[], limit = MAX_HISTORY_MESSAGES): PromptMessage[] {
  const recent = messages.slice(-limit);
  while (recent.length && recent[0].role === "assistant") recent.shift();

  const merged: PromptMessage[] = [];
  for (const message of recent) {
    const last = merged[merged.length - 1];
    if (last && last.role === message.role) {
      last.content = `${last.content}\n\n${message.content}`.trim();
    } else {
      merged.push({ ...message });
    }
  }
  return merged;
}

/** Rough token estimate: ~4 characters per token for English text. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
