import { createClient } from "./supabase/server";
import type { Agent, Conversation, KnowledgeDocument, Message, Profile, UsageEvent } from "./types";

/**
 * Server-side data access. Every function assumes the caller is already
 * authenticated — RLS enforces that at the database level, so a mistake here
 * cannot leak another user's rows.
 */

export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (data) return data as Profile;

  // The signup trigger normally creates this row; fall back for older accounts.
  const fallback: Profile = {
    id: userData.user.id,
    display_name:
      (userData.user.user_metadata?.display_name as string | undefined) ??
      userData.user.email?.split("@")[0] ??
      null,
    avatar_url: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  return fallback;
}

export async function listAgents(): Promise<Agent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agents")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Agent[];
}

export async function getAgent(id: string): Promise<Agent | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("agents").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Agent) ?? null;
}

export async function listDocuments(agentId: string): Promise<KnowledgeDocument[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as KnowledgeDocument[];
}

export async function listConversations(agentId: string): Promise<Conversation[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("agent_id", agentId)
    .order("updated_at", { ascending: false })
    .limit(30);
  if (error) throw new Error(error.message);
  return (data ?? []) as Conversation[];
}

export async function listMessages(conversationId: string): Promise<Message[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Message[];
}

export type DashboardStats = {
  agentCount: number;
  documentCount: number;
  conversationCount: number;
  messageCount: number;
  usageThisMonth: number;
  recentAgents: Agent[];
};

export async function getDashboardStats(): Promise<DashboardStats> {
  const supabase = await createClient();
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [agents, documents, conversations, usage] = await Promise.all([
    supabase.from("agents").select("id, name, description, provider, model, created_at, updated_at", { count: "exact" }).order("created_at", { ascending: false }).limit(4),
    supabase.from("documents").select("id", { count: "exact", head: true }),
    supabase.from("conversations").select("id", { count: "exact", head: true }),
    supabase.from("usage_events").select("id", { count: "exact", head: true }).gte("created_at", monthStart.toISOString()),
  ]);

  return {
    agentCount: agents.count ?? 0,
    documentCount: documents.count ?? 0,
    conversationCount: conversations.count ?? 0,
    messageCount: 0,
    usageThisMonth: usage.count ?? 0,
    recentAgents: (agents.data ?? []) as Agent[],
  };
}

export async function listUsage(limit = 50): Promise<UsageEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("usage_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as UsageEvent[];
}
