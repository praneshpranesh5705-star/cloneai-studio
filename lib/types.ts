import type { ProviderId } from "./config";

export type Profile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

export type Agent = {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  system_prompt: string;
  provider: ProviderId;
  model: string;
  temperature: number;
  max_tokens: number;
  is_public: boolean;
  created_at: string;
  updated_at: string;
};

export type KnowledgeDocument = {
  id: string;
  agent_id: string;
  owner_id: string;
  title: string;
  content: string;
  char_count: number;
  created_at: string;
};

export type Conversation = {
  id: string;
  agent_id: string;
  owner_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
};

export type Citation = {
  documentId: string;
  title: string;
  score: number;
  excerpt: string;
};

export type Message = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  citations: Citation[];
  created_at: string;
};

export type UsageEvent = {
  id: number;
  owner_id: string;
  agent_id: string | null;
  kind: string;
  provider: string | null;
  model: string | null;
  prompt_chars: number;
  completion_chars: number;
  created_at: string;
};

/** Shape returned by the chat API as newline-delimited JSON. */
export type ChatStreamEvent =
  | {
      type: "meta";
      conversationId: string;
      provider: ProviderId;
      model: string;
      demo: boolean;
      requestedProvider?: ProviderId;
      fellBack?: boolean;
    }
  | { type: "citations"; citations: Citation[] }
  | { type: "delta"; text: string }
  | { type: "done"; messageId: string }
  | { type: "error"; message: string };
