import { redirect } from "next/navigation";
import AppShell from "@/components/app-shell";
import AgentForm from "@/components/agent-form";
import { PageHeader } from "@/components/ui";
import { getProfile } from "@/lib/data";
import { availableProviders, isSupabaseConfigured } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function NewAgentPage() {
  if (!isSupabaseConfigured()) redirect("/setup");
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const initial = (profile.display_name ?? "U").trim().charAt(0).toUpperCase() || "U";

  return (
    <AppShell user={{ name: profile.display_name ?? "Your workspace", email: "Personal workspace", initial }}>
      <PageHeader eyebrow="AI AGENTS" title="Create an agent" subtitle="Give it a name, instructions and a model." />
      <AgentForm mode="create" available={availableProviders()} />
    </AppShell>
  );
}
