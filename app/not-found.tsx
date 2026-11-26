import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";

export default function NotFound() {
  return (
    <main className="auth-shell">
      <section className="auth-card" style={{ textAlign: "center" }}>
        <div className="empty-icon" style={{ margin: "0 auto 14px" }}><Search size={22} /></div>
        <h1 style={{ marginTop: 0 }}>Page not found</h1>
        <p className="auth-subtitle">
          That page does not exist, or the agent was deleted.
        </p>
        <Link className="primary-button" href="/" style={{ display: "inline-flex", justifyContent: "center" }}>
          <ArrowLeft size={16} /> Back to overview
        </Link>
      </section>
    </main>
  );
}
