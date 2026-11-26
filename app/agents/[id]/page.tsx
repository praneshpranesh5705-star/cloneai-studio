import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import AppShell from "@/components/app-shell";
import AgentTabs from "@/components/agent-tabs";
import { DemoBanner } from "@/components/ui";
import { getAgent, getProfile, listConversations, listDocuments, listMessages } from "@/lib/data";
import { availableProviders, effectiveModel, effectiveProvider, isSupabaseConfigured, PROVIDERS } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) redirect("/setup");
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const { id } = await params;
  const agent = await getAgent(id);
  if (!agent) notFound();

  const [documents, conversations] = await Promise.all([listDocuments(id), listConversations(id)]);
  const latest = conversations[0] ?? null;
  const messages = latest ? await listMessages(latest.id) : [];

  const initial = (profile.display_name ?? "U").trim().charAt(0).toUpperCase() || "U";
  // Resolve the provider the same way /api/chat does, so the banner and the
  // header describe the model that will actually answer.
  const provider = effectiveProvider(agent.provider);
  const model = effectiveModel(agent.provider, agent.model);
  const demo = provider === "demo";

  return (
    <AppShell user={{ name: profile.display_name ?? "Your workspace", email: "Personal workspace", initial }}>
      <Link className="back-link" href="/agents"><ArrowLeft size={14} /> All agents</Link>

      <div className="welcome-row agent-head">
        <div>
          <div className="eyebrow"><span className="live-dot" /> {PROVIDERS[provider]?.label ?? provider} · {model}</div>
          <h1>{agent.name}</h1>
          <p className="welcome-subtitle">{agent.description || "No description yet."}</p>
        </div>
      </div>

      <DemoBanner provider={provider} requested={agent.provider} />

      <AgentTabs
        agent={agent}
        documents={documents}
        messages={messages}
        conversationId={latest?.id ?? null}
        available={availableProviders()}
        demo={demo}
      />
    </AppShell>
  );
}
