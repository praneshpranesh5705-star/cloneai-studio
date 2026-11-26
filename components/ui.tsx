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

export function DemoBanner({ provider, requested }: { provider: string; requested?: string }) {
  if (provider !== "demo") return null;
  // Two different situations, and conflating them is what made the old banner
  // misleading: either this deployment has no key at all, or the agent asked
  // for a provider whose key is missing and we fell back to demo.
  const fellBack = Boolean(requested && requested !== "demo");
  return (
    <div className="demo-banner" role="status">
      <Sparkles size={15} />
      <span>
        {fellBack ? (
          <>
            <strong>Demo mode.</strong> This agent is set to <code>{requested}</code>, but that
            provider&apos;s key is not set on this deployment, so replies are generated locally and
            are not real AI answers.
          </>
        ) : (
          <>
            <strong>Demo mode.</strong> No model key is configured, so replies are generated locally
            and are not real AI answers.
          </>
        )}
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
