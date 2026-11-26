import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight, Bot, Plus } from "lucide-react";
import AppShell from "@/components/app-shell";
import { EmptyState, PageHeader } from "@/components/ui";
import { getProfile, listAgents } from "@/lib/data";
import { isSupabaseConfigured, PROVIDERS } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  if (!isSupabaseConfigured()) redirect("/setup");
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const agents = await listAgents();
  const initial = (profile.display_name ?? "U").trim().charAt(0).toUpperCase() || "U";

  return (
    <AppShell user={{ name: profile.display_name ?? "Your workspace", email: "Personal workspace", initial }}>
      <PageHeader
        eyebrow="AI AGENTS"
        title="Your agents"
        subtitle="Each agent has its own instructions, model and knowledge base."
        action={
          <Link className="primary-button" href="/agents/new">
            <Plus size={17} /> Create agent
          </Link>
        }
      />

      {agents.length === 0 ? (
        <section className="activity-card">
          <EmptyState
            icon={<Bot size={22} />}
            title="No agents yet"
            body="An agent is a saved set of instructions plus the documents it is allowed to answer from."
            action={{ href: "/agents/new", label: "Create your first agent" }}
          />
        </section>
      ) : (
        <div className="tools-grid">
          {agents.map((agent) => (
            <Link className="tool-card" key={agent.id} href={`/agents/${agent.id}`}>
              <div className="tool-card-top">
                <span className="tool-icon violet"><Bot size={20} /></span>
                <span className="tool-tag">{PROVIDERS[agent.provider]?.label ?? agent.provider}</span>
              </div>
              <strong>{agent.name}</strong>
              <p>{agent.description || "No description yet."}</p>
              <span className="tool-open">Open agent <ArrowUpRight size={14} /></span>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}
