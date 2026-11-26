"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="auth-shell">
      <section className="auth-card" style={{ textAlign: "center" }}>
        <div className="empty-icon" style={{ margin: "0 auto 14px" }}><AlertTriangle size={22} /></div>
        <h1 style={{ marginTop: 0 }}>Something went wrong</h1>
        <p className="auth-subtitle">
          The page failed to load. This is usually a temporary database or network problem.
        </p>
        <button className="primary-button" onClick={reset} style={{ display: "inline-flex", justifyContent: "center" }}>
          Try again
        </button>
      </section>
    </main>
  );
}
