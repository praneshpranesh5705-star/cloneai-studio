import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight, BookOpen, Bot } from "lucide-react";
import AppShell from "@/components/app-shell";
import { EmptyState, PageHeader } from "@/components/ui";
import { getProfile, listAgents, listDocuments } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function KnowledgePage() {
  if (!isSupabaseConfigured()) redirect("/setup");
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const agents = await listAgents();
  const withDocs = await Promise.all(
    agents.map(async (agent) => ({ agent, documents: await listDocuments(agent.id) })),
  );
  const total = withDocs.reduce((sum, entry) => sum + entry.documents.length, 0);
  const initial = (profile.display_name ?? "U").trim().charAt(0).toUpperCase() || "U";

  return (
    <AppShell user={{ name: profile.display_name ?? "Your workspace", email: "Personal workspace", initial }}>
      <PageHeader
        eyebrow="KNOWLEDGE"
        title="Knowledge base"
        subtitle={`${total} document${total === 1 ? "" : "s"} across ${agents.length} agent${agents.length === 1 ? "" : "s"}.`}
      />

      {agents.length === 0 ? (
        <section className="activity-card">
          <EmptyState
            icon={<Bot size={22} />}
            title="No agents to attach knowledge to"
            body="Knowledge documents belong to an agent. Create an agent first, then add documents to it."
            action={{ href: "/agents/new", label: "Create an agent" }}
          />
        </section>
      ) : (
        <div className="knowledge-grid">
          {withDocs.map(({ agent, documents }) => (
            <Link className="knowledge-card" key={agent.id} href={`/agents/${agent.id}`}>
              <div className="card-heading">
                <div>
                  <h3>{agent.name}</h3>
                  <p>{documents.length} document{documents.length === 1 ? "" : "s"}</p>
                </div>
                <BookOpen size={17} />
              </div>
              {documents.length === 0 ? (
                <p className="muted" style={{ fontSize: 10, margin: "12px 0 0" }}>
                  No documents yet — open the agent to add some.
                </p>
              ) : (
                <ul className="knowledge-titles">
                  {documents.slice(0, 4).map((doc) => (
                    <li key={doc.id}>{doc.title}</li>
                  ))}
                  {documents.length > 4 && <li className="muted">+{documents.length - 4} more</li>}
                </ul>
              )}
              <span className="tool-open">Manage <ArrowUpRight size={14} /></span>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}
