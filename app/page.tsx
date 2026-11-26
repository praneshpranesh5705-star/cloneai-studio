import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight, Bot, Boxes, FileCode2, MessageSquare, Plus, Zap } from "lucide-react";
import AppShell from "@/components/app-shell";
import { DemoBanner, EmptyState, PageHeader } from "@/components/ui";
import { getDashboardStats, getProfile } from "@/lib/data";
import { defaultProvider, isSupabaseConfigured, PROVIDERS } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!isSupabaseConfigured()) redirect("/setup");

  const profile = await getProfile();
  if (!profile) redirect("/login");

  const stats = await getDashboardStats();
  const provider = defaultProvider();
  const initial = (profile.display_name ?? "U").trim().charAt(0).toUpperCase() || "U";

  return (
    <AppShell user={{ name: profile.display_name ?? "Your workspace", email: "Personal workspace", initial }}>
      <PageHeader
        eyebrow="YOUR CREATIVE WORKSPACE"
        title={<>Build something <span>intelligent.</span></>}
        subtitle="Your ideas. Your AI. One workspace."
        action={
          <Link className="primary-button" href="/agents/new">
            <Plus size={17} /> Create agent
          </Link>
        }
      />

      <DemoBanner provider={provider} />

      <div className="stats-grid">
        <article className="stat-card">
          <div className="stat-top"><span>AI agents</span><span className="stat-icon violet"><Bot size={17} /></span></div>
          <div className="stat-value">{stats.agentCount} <small>{stats.agentCount === 1 ? "agent" : "agents"}</small></div>
          <div className="stat-foot"><span className="muted">Saved in your workspace</span></div>
        </article>
        <article className="stat-card">
          <div className="stat-top"><span>Knowledge documents</span><span className="stat-icon blue"><Boxes size={17} /></span></div>
          <div className="stat-value">{stats.documentCount} <small>documents</small></div>
          <div className="stat-foot"><span className="muted">Available to your agents</span></div>
        </article>
        <article className="stat-card">
          <div className="stat-top"><span>Model calls this month</span><span className="stat-icon cyan"><Zap size={17} /></span></div>
          <div className="stat-value">{stats.usageThisMonth} <small>calls</small></div>
          <div className="stat-foot"><span className="muted">{PROVIDERS[provider].label}</span></div>
        </article>
      </div>

      <div className="section-heading">
        <div><h2>Your agents</h2><p>Each agent answers using its own instructions and knowledge</p></div>
        <Link className="subtle-button" href="/agents">View all <ArrowUpRight size={14} /></Link>
      </div>

      {stats.recentAgents.length === 0 ? (
        <section className="activity-card">
          <EmptyState
            icon={<FileCode2 size={22} />}
            title="No agents yet"
            body="Create your first agent, give it instructions, and add documents for it to answer from."
            action={{ href: "/agents/new", label: "Create your first agent" }}
          />
        </section>
      ) : (
        <div className="tools-grid">
          {stats.recentAgents.map((agent) => (
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

      <div className="bottom-grid">
        <section className="activity-card">
          <div className="card-heading">
            <div><h3>Conversations</h3><p>Every chat is saved with its citations</p></div>
            <MessageSquare size={17} />
          </div>
          <div className="stat-value" style={{ marginTop: 14 }}>{stats.conversationCount} <small>conversations</small></div>
          <p className="muted" style={{ fontSize: 10, margin: 0 }}>
            Open an agent to see its conversation history.
          </p>
        </section>
        <section className="quick-card">
          <div className="card-heading">
            <div><h3>Quick start</h3><p>Three steps to a working agent</p></div>
            <Zap size={17} />
          </div>
          <Link href="/agents/new"><span className="quick-icon violet"><Bot size={16} /></span><span><strong>1. Create an agent</strong><small>Name it and set its instructions</small></span><ArrowUpRight size={15} /></Link>
          <Link href="/knowledge"><span className="quick-icon blue"><Boxes size={16} /></span><span><strong>2. Add knowledge</strong><small>Paste text for it to answer from</small></span><ArrowUpRight size={15} /></Link>
          <Link href="/settings"><span className="quick-icon cyan"><Zap size={16} /></span><span><strong>3. Connect a model</strong><small>Add an API key for real answers</small></span><ArrowUpRight size={15} /></Link>
        </section>
      </div>

      <footer className="footer">
        <span>© 2026 CloneAI Studio</span>
        <span>Made for curious minds <span className="footer-spark">✦</span></span>
        <span>Privacy · Terms · Status</span>
      </footer>
    </AppShell>
  );
}
