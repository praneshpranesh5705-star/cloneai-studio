import { redirect } from "next/navigation";
import { Activity } from "lucide-react";
import AppShell from "@/components/app-shell";
import { EmptyState, PageHeader } from "@/components/ui";
import { getProfile, listUsage } from "@/lib/data";
import { isSupabaseConfigured, PROVIDERS, type ProviderId } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function UsagePage() {
  if (!isSupabaseConfigured()) redirect("/setup");
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const events = await listUsage(50);
  const initial = (profile.display_name ?? "U").trim().charAt(0).toUpperCase() || "U";

  const totalPrompt = events.reduce((n, e) => n + e.prompt_chars, 0);
  const totalCompletion = events.reduce((n, e) => n + e.completion_chars, 0);

  return (
    <AppShell user={{ name: profile.display_name ?? "Your workspace", email: "Personal workspace", initial }}>
      <PageHeader
        eyebrow="USAGE & BILLING"
        title="Usage"
        subtitle="Every model call is recorded here. Billing is not connected — this is a record, not an invoice."
      />

      <div className="stats-grid">
        <article className="stat-card">
          <div className="stat-top"><span>Model calls</span><span className="stat-icon violet"><Activity size={17} /></span></div>
          <div className="stat-value">{events.length} <small>recent</small></div>
        </article>
        <article className="stat-card">
          <div className="stat-top"><span>Prompt characters</span><span className="stat-icon blue"><Activity size={17} /></span></div>
          <div className="stat-value">{totalPrompt.toLocaleString()}</div>
        </article>
        <article className="stat-card">
          <div className="stat-top"><span>Completion characters</span><span className="stat-icon cyan"><Activity size={17} /></span></div>
          <div className="stat-value">{totalCompletion.toLocaleString()}</div>
        </article>
      </div>

      {events.length === 0 ? (
        <section className="activity-card">
          <EmptyState
            icon={<Activity size={22} />}
            title="No model calls yet"
            body="Send a message to one of your agents and the call will appear here."
            action={{ href: "/agents", label: "Open your agents" }}
          />
        </section>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Provider</th>
                <th>Model</th>
                <th className="num">Prompt</th>
                <th className="num">Completion</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td>{new Date(event.created_at).toLocaleString()}</td>
                  <td>{PROVIDERS[(event.provider ?? "demo") as ProviderId]?.label ?? event.provider}</td>
                  <td className="mono">{event.model}</td>
                  <td className="num">{event.prompt_chars.toLocaleString()}</td>
                  <td className="num">{event.completion_chars.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
