"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Mail, Sparkles, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type AuthFormProps = { mode: "login" | "signup" };

export default function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const isSignup = mode === "signup";

  async function sendMagicLink(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: isSignup,
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          ...(isSignup ? { data: { display_name: name.trim() } } : {}),
        },
      });
      if (authError) throw authError;
      setSent(true);
      setMessage("A secure sign-in link has been sent to your email. Open it on this device to access your workspace.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send your sign-in link. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <div className="auth-glow auth-glow-one" />
      <div className="auth-glow auth-glow-two" />
      <Link className="auth-brand" href="/">
        <span className="auth-brand-mark"><Sparkles size={19} /></span>
        <span>CloneAI <b>Studio</b></span>
      </Link>
      <section className="auth-card">
        <div className="auth-kicker"><span className="live-dot" /> YOUR AI UNIVERSE STARTS HERE</div>
        <h1>{isSignup ? "Create your account" : "Welcome back"}</h1>
        <p className="auth-subtitle">
          {isSignup
            ? "Set up your workspace and start building agents with your own knowledge."
            : "Enter your email and we’ll send you a secure sign-in link."}
        </p>
        <form onSubmit={sendMagicLink} className="auth-form">
          {isSignup && (
            <label>
              Your name
              <div className="auth-input">
                <input
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="How should we call you?"
                  required
                  maxLength={80}
                />
              </div>
            </label>
          )}
          <label>
            Email address
            <div className="auth-input">
              <Mail size={17} />
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setSent(false); }}
                placeholder="you@example.com"
                required
              />
            </div>
          </label>
          {error && <div className="auth-alert error" role="alert">{error}</div>}
          {message && <div className="auth-alert success" role="status">{message}</div>}
          <button className="auth-submit" type="submit" disabled={busy || (sent && !error)}>
            {busy ? "Sending secure link…" : sent ? "Email link sent" : isSignup ? "Continue with email" : "Send sign-in link"} <ArrowRight size={17} />
          </button>
          {sent && (
            <button
              className="auth-secondary"
              type="button"
              onClick={() => void sendMagicLink()}
              disabled={busy}
            >
              {busy ? "Sending…" : "Resend sign-in link"}
            </button>
          )}
        </form>
        <div className="auth-switch">
          {isSignup ? "Already have an account?" : "New to CloneAI Studio?"}{" "}
          <Link href={isSignup ? "/login" : "/signup"}>{isSignup ? "Sign in" : "Create account"}</Link>
        </div>
        <div className="auth-security">
          <ShieldCheck size={13} /> Passwordless sign-in with a secure email link.
        </div>
      </section>
      <footer className="auth-footer">© 2026 CloneAI Studio · Build responsibly</footer>
    </main>
  );
}
