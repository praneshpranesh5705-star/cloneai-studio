import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Construction } from "lucide-react";
import AppShell from "@/components/app-shell";
import { PageHeader } from "@/components/ui";
import { getProfile } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/config";
import VoiceStudio from "@/components/voice-studio";

export const dynamic = "force-dynamic";

const STUDIOS: Record<string, { title: string; blurb: string; needs: string[] }> = {
  voice: {
    title: "Voice Studio",
    blurb: "Turn an agent into a voice experience you can talk to.",
    needs: [
      "A speech-to-text provider (browser Web Speech API or a hosted one)",
      "A text-to-speech provider for the reply",
      "Consent capture before any voice is cloned",
    ],
  },
  avatar: {
    title: "Avatar Studio",
    blurb: "Give an agent a face and lip-synced video output.",
    needs: [
      "An image or video generation provider",
      "A lip-sync model",
      "Explicit consent records for any real person's likeness",
    ],
  },
  website: {
    title: "Website Builder",
    blurb: "Generate a landing page from a prompt and publish it.",
    needs: [
      "A code-generation model",
      "A hosting target and a build pipeline",
      "A preview sandbox so generated code cannot run unsafely",
    ],
  },
};

export default async function StudioPage({ params }: { params: Promise<{ slug: string }> }) {
  if (!isSupabaseConfigured()) redirect("/setup");
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const { slug } = await params;
  const studio = STUDIOS[slug];
  const initial = (profile.display_name ?? "U").trim().charAt(0).toUpperCase() || "U";

  if (!studio) {
    return (
      <AppShell user={{ name: profile.display_name ?? "Your workspace", email: "Personal workspace", initial }}>
        <PageHeader title="Studio not found" subtitle="That studio does not exist." />
        <Link className="back-link" href="/"><ArrowLeft size={14} /> Back to overview</Link>
      </AppShell>
    );
  }

  return (
    <AppShell user={{ name: profile.display_name ?? "Your workspace", email: "Personal workspace", initial }}>
      <PageHeader eyebrow="STUDIO" title={studio.title} subtitle={studio.blurb} />

      {slug === "voice" ? <VoiceStudio /> : <section className="form-card">
        <div className="roadmap-head">
          <span className="roadmap-icon"><Construction size={18} /></span>
          <div>
            <h3>Not built yet</h3>
            <p className="form-lead" style={{ margin: "6px 0 0" }}>
              This page exists so the navigation is honest. The studio is not implemented, and nothing here
              pretends otherwise.
            </p>
          </div>
        </div>

        <h4 className="roadmap-subhead">What it would take</h4>
        <ul className="roadmap-list">
          {studio.needs.map((need) => (
            <li key={need}>{need}</li>
          ))}
        </ul>

        <p className="muted" style={{ fontSize: 10, marginTop: 18 }}>
          The agent builder, knowledge base and chat are fully working today —{" "}
          <Link href="/agents">open your agents</Link>.
        </p>
      </section>}
    </AppShell>
  );
}
