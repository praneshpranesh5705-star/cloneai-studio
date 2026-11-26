import Link from "next/link";
import { Command, Database, KeyRound, Terminal } from "lucide-react";

/**
 * Shown instead of the app when Supabase env vars are missing. Without this
 * the app would throw on every page; with it, the deployment explains itself.
 */
export default function SetupNotice() {
  return (
    <main className="setup-shell">
      <div className="setup-card">
        <div className="setup-brand">
          <div className="brand-mark"><Command size={21} strokeWidth={2.5} /></div>
          <div><strong>CloneAI<span> Studio</span></strong><small>SETUP REQUIRED</small></div>
        </div>

        <h1>Connect a database to finish setup</h1>
        <p className="setup-lead">
          The app is deployed and running, but it has no Supabase project attached yet.
          Add two environment variables and it will come to life.
        </p>

        <ol className="setup-steps">
          <li>
            <span className="setup-step-icon"><Database size={16} /></span>
            <div>
              <strong>Create a Supabase project</strong>
              <p>Free tier is enough. Then open <b>SQL Editor</b> and run the contents of <code>supabase/schema.sql</code> from this repository.</p>
            </div>
          </li>
          <li>
            <span className="setup-step-icon"><KeyRound size={16} /></span>
            <div>
              <strong>Copy the project URL and publishable key</strong>
              <p>Supabase Dashboard → <b>Project Settings → API</b>. Use the <b>anon / publishable</b> key, never the service-role key.</p>
            </div>
          </li>
          <li>
            <span className="setup-step-icon"><Terminal size={16} /></span>
            <div>
              <strong>Set the variables and redeploy</strong>
              <p><code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> — in Vercel under Project Settings → Environment Variables, or in <code>.env.local</code> for local development.</p>
            </div>
          </li>
        </ol>

        <div className="setup-note">
          <strong>Optional:</strong> add <code>OPENAI_API_KEY</code>, <code>OPENROUTER_API_KEY</code>, <code>ANTHROPIC_API_KEY</code> or <code>GEMINI_API_KEY</code> to get real model answers. Without one, the app runs in clearly-labelled demo mode.
        </div>

        <p className="setup-foot">
          Full walkthrough: <Link href="https://github.com/praneshpranesh5705-star/cloneai-studio/blob/main/SETUP.md">SETUP.md</Link>
        </p>
      </div>
    </main>
  );
}
