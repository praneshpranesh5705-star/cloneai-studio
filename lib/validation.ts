import { PROVIDERS, type ProviderId } from "./config";

export type FieldErrors = Record<string, string>;

export type Result<T> = { ok: true; value: T } | { ok: false; errors: FieldErrors };

const MAX_NAME = 80;
const MAX_DESCRIPTION = 400;
const MAX_PROMPT = 8000;
const MAX_DOC_TITLE = 160;
const MAX_DOC_CONTENT = 200_000;

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export type AgentInput = {
  name: string;
  description: string | null;
  system_prompt: string;
  provider: ProviderId;
  model: string;
  temperature: number;
  max_tokens: number;
  is_public: boolean;
};

export function validateAgentInput(raw: unknown): Result<AgentInput> {
  const body = (raw ?? {}) as Record<string, unknown>;
  const errors: FieldErrors = {};

  const name = str(body.name).trim();
  if (!name) errors.name = "Give your agent a name.";
  else if (name.length > MAX_NAME) errors.name = `Keep the name under ${MAX_NAME} characters.`;

  const description = str(body.description).trim();
  if (description.length > MAX_DESCRIPTION) {
    errors.description = `Keep the description under ${MAX_DESCRIPTION} characters.`;
  }

  const systemPrompt = str(body.system_prompt).trim();
  if (systemPrompt.length > MAX_PROMPT) {
    errors.system_prompt = `Keep the instructions under ${MAX_PROMPT} characters.`;
  }

  const providerRaw = str(body.provider) || "demo";
  const provider = (providerRaw in PROVIDERS ? providerRaw : "demo") as ProviderId;

  const model = str(body.model).trim() || PROVIDERS[provider].defaultModel;
  if (model.length > 120) errors.model = "That model name is too long.";

  if (Object.keys(errors).length) return { ok: false, errors };

  return {
    ok: true,
    value: {
      name,
      description: description || null,
      system_prompt: systemPrompt,
      provider,
      model,
      temperature: clampNumber(body.temperature, 0, 2, 0.7),
      max_tokens: Math.round(clampNumber(body.max_tokens, 64, 4096, 800)),
      is_public: body.is_public === true,
    },
  };
}

export type DocumentInput = { title: string; content: string };

export function validateDocumentInput(raw: unknown): Result<DocumentInput> {
  const body = (raw ?? {}) as Record<string, unknown>;
  const errors: FieldErrors = {};

  const title = str(body.title).trim();
  if (!title) errors.title = "Give this document a title.";
  else if (title.length > MAX_DOC_TITLE) errors.title = `Keep the title under ${MAX_DOC_TITLE} characters.`;

  const content = str(body.content).trim();
  if (!content) errors.content = "Paste some text for the agent to learn from.";
  else if (content.length > MAX_DOC_CONTENT) {
    errors.content = `That document is too large (limit ${MAX_DOC_CONTENT.toLocaleString()} characters).`;
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { title, content } };
}

export function validateChatInput(raw: unknown): Result<{ agentId: string; message: string; conversationId: string | null }> {
  const body = (raw ?? {}) as Record<string, unknown>;
  const errors: FieldErrors = {};

  const agentId = str(body.agentId).trim();
  if (!agentId) errors.agentId = "Missing agent.";

  const message = str(body.message).trim();
  if (!message) errors.message = "Type a message first.";
  else if (message.length > 8000) errors.message = "That message is too long (limit 8,000 characters).";

  const conversationId = str(body.conversationId).trim() || null;

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { agentId, message, conversationId } };
}
