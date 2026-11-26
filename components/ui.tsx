import Link from "next/link";
import { AlertTriangle, ArrowRight, Sparkles } from "lucide-react";

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <strong>{title}</strong>
      <p>{body}</p>
      {action && (
        <Link className="empty-action" href={action.href}>
          {action.label} <ArrowRight size={14} />
        </Link>
      )}
    </div>
  );
}

export function DemoBanner({ provider }: { provider: string }) {
  if (provider !== "demo") return null;
  return (
    <div className="demo-banner" role="status">
      <Sparkles size={15} />
      <span>
        <strong>Demo mode.</strong> No model key is configured, so replies are generated locally and are not real AI answers.
      </span>
      <Link href="/settings">Add a key</Link>
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div className="error-note" role="alert">
      <AlertTriangle size={15} />
      <span>{message}</span>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="welcome-row">
      <div>
        {eyebrow && <div className="eyebrow"><span className="live-dot" /> {eyebrow}</div>}
        <h1>{title}</h1>
        {subtitle && <p className="welcome-subtitle">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
