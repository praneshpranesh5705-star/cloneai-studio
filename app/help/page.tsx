import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight, CircleHelp } from "lucide-react";
import AppShell from "@/components/app-shell";
import { PageHeader } from "@/components/ui";
import { getProfile } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/config";

export const dynamic = "force-dynamic";

const faqs = [
  {
    q: "Why do my answers say “Demo mode”?",
    a: "No model API key is set on this deployment. Add OPENAI_API_KEY, OPENROUTER_API_KEY, ANTHROPIC_API_KEY or GEMINI_API_KEY to your environment and redeploy. Until then, replies are generated locally and are clearly labelled.",
  },
  {
    q: "How does the agent use my documents?",
    a: "When you send a message, the app scores every chunk of your documents against it, keeps the best four, and puts them in the system prompt. The reply shows which passages were used under “sources used”.",
  },
  {
    q: "Where is my data stored?",
    a: "In your own Supabase project. Row Level Security means one account cannot read another account's agents, documents or conversations — even with the public anon key.",
  },
  {
    q: "Can I use a model that is not listed?",
    a: "Yes, if it speaks the OpenAI chat-completions format. Choose OpenRouter and type the model slug, or point the OpenAI provider at a compatible endpoint.",
  },
  {
    q: "How do I delete everything?",
    a: "Delete an agent and its documents and conversations go with it (cascade). To remove everything at once, drop the tables in Supabase or delete the project.",
  },
];

export default async function HelpPage() {
  if (!isSupabaseConfigured()) redirect("/setup");
  const profile = await getProfile();
  if (!profile) redirect("/login");
  const initial = (profile.display_name ?? "U").trim().charAt(0).toUpperCase() || "U";

  return (
    <AppShell user={{ name: profile.display_name ?? "Your workspace", email: "Personal workspace", initial }}>
      <PageHeader eyebrow="HELP & SUPPORT" title="Help" subtitle="Common questions about how this workspace behaves." />

      <div className="faq-list">
        {faqs.map((item) => (
          <details className="faq-item" key={item.q}>
            <summary><CircleHelp size={15} /> {item.q}</summary>
            <p>{item.a}</p>
          </details>
        ))}
      </div>

      <section className="form-card">
        <h3>Documentation</h3>
        <p className="form-lead">
          Setup, environment variables and the database schema are documented in the repository.
        </p>
        <div className="link-row">
          <Link href="https://github.com/praneshpranesh5705-star/cloneai-studio/blob/main/SETUP.md">
            SETUP.md <ArrowUpRight size={13} />
          </Link>
          <Link href="https://github.com/praneshpranesh5705-star/cloneai-studio/blob/main/README.md">
            README <ArrowUpRight size={13} />
          </Link>
        </div>
      </section>
    </AppShell>
  );
}
