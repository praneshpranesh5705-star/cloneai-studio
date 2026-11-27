import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Construction } from "lucide-react";
import AppShell from "@/components/app-shell";
import VoiceStudio from "@/components/voice-studio";
import { PageHeader } from "@/components/ui";
import { getProfile } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/config";

export const dynamic = "force-dynamic";

const STUDIOS: Record<string, { title: string; blurb: string }> = {
  voice: { title: "Voice Studio", blurb: "Turn your script into natural-sounding AI speech." },
  avatar: { title: "Avatar Studio", blurb: "Give an agent a face and lip-synced video output." },
  website: { title: "Website Builder", blurb: "Generate a landing page from a prompt and publish it." },
};

export default async function StudioPage({ params }: { params: Promise<{ slug: string }> }) {
  if (!isSupabaseConfigured()) redirect("/setup");
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const { slug } = await params;
  const studio = STUDIOS[slug];
  const initial = (profile.display_name ?? "U").trim().charAt(0).toUpperCase() || "U";
  const user = { name: profile.display_name ?? "Your workspace", email: "Personal workspace", initial };

  if (!studio) {
    return <AppShell user={user}><PageHeader title="Studio not found" subtitle="That studio does not exist." /><Link className="back-link" href="/"><ArrowLeft size={14} /> Back to overview</Link></AppShell>;
  }

  return (
    <AppShell user={user}>
      <PageHeader eyebrow="STUDIO" title={studio.title} subtitle={studio.blurb} />
      {slug === "voice" ? (
        <VoiceStudio />
      ) : (
        <section className="form-card">
          <div className="roadmap-head">
            <span className="roadmap-icon"><Construction size={18} /></span>
            <div><h3>Coming soon</h3><p className="form-lead" style={{ margin: "6px 0 0" }}>This studio is not connected yet.</p></div>
          </div>
        </section>
      )}
    </AppShell>
  );
}
