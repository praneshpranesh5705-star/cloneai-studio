import { redirect } from "next/navigation";
import { Check, KeyRound, X } from "lucide-react";
import AppShell from "@/components/app-shell";
import { PageHeader } from "@/components/ui";
import { getProfile } from "@/lib/data";
import { availableProviders, isSupabaseConfigured, PROVIDERS, type ProviderId } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  if (!isSupabaseConfigured()) redirect("/setup");
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const available = availableProviders();
  const initial = (profile.display_name ?? "U").trim().charAt(0).toUpperCase() || "U";
  const providerIds = Object.keys(PROVIDERS) as ProviderId[];

  return (
    <AppShell user={{ name: profile.display_name ?? "Your workspace", email: "Personal workspace", initial }}>
      <PageHeader
        eyebrow="SETTINGS"
        title="Settings"
        subtitle="Model providers are configured with environment variables, not in the browser."
      />

      <section className="form-card">
        <h3>Account</h3>
        <div className="kv-list">
          <div><span>Display name</span><strong>{profile.display_name ?? "—"}</strong></div>
          <div><span>User ID</span><strong className="mono">{profile.id}</strong></div>
          <div><span>Member since</span><strong>{new Date(profile.created_at).toLocaleDateString()}</strong></div>
        </div>
      </section>

      <section className="form-card">
        <h3><KeyRound size={16} /> Model providers</h3>
        <p className="form-lead">
          Keys live in your deployment environment. They are never sent to the browser and never stored in
          the database. Add one, redeploy, and the demo banner disappears.
        </p>

        <div className="provider-list">
          {providerIds.map((id) => {
            const configured = available.includes(id);
            return (
              <div className="provider-row" key={id}>
                <span className={`provider-dot ${configured ? "on" : "off"}`}>
                  {configured ? <Check size={12} /> : <X size={12} />}
                </span>
                <div className="provider-copy">
                  <strong>{PROVIDERS[id].label}</strong>
                  <small>{PROVIDERS[id].docs}</small>
                </div>
                <code className="provider-env">{PROVIDERS[id].envKey || "—"}</code>
                <span className={`provider-state ${configured ? "on" : "off"}`}>
                  {configured ? "Configured" : "Not set"}
                </span>
              </div>
            );
          })}
        </div>

        <div className="setup-note" style={{ marginTop: 18 }}>
          <strong>Where to set them:</strong> Vercel → Project Settings → Environment Variables, or{" "}
          <code>.env.local</code> for local development. Never prefix a secret with{" "}
          <code>NEXT_PUBLIC_</code> — that would ship it to every visitor.
        </div>
      </section>

      <section className="form-card">
        <h3>Data</h3>
        <p className="form-lead">
          Your agents, documents and conversations are stored in your own Supabase project. Deleting the
          project deletes the data; nothing is held anywhere else.
        </p>
      </section>
    </AppShell>
  );
}
