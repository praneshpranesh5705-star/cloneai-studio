"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AudioLines, Bot, Boxes, CircleHelp, Command, CreditCard, Globe2,
  Image as ImageIcon, LayoutDashboard, Menu, Settings2, Sparkles, X, Zap,
} from "lucide-react";

const primaryNav = [
  { label: "Overview", href: "/", icon: LayoutDashboard },
  { label: "AI Agents", href: "/agents", icon: Bot },
  { label: "Knowledge", href: "/knowledge", icon: Boxes },
];

const studioNav = [
  { label: "Voice Studio", href: "/studios/voice", icon: AudioLines },
  { label: "Avatar Studio", href: "/studios/avatar", icon: ImageIcon },
  { label: "Website Builder", href: "/studios/website", icon: Globe2 },
];

const manageNav = [
  { label: "Usage & Billing", href: "/usage", icon: CreditCard },
  { label: "Settings", href: "/settings", icon: Settings2 },
  { label: "Help & Support", href: "/help", icon: CircleHelp },
];

export type ShellUser = { name: string; email: string; initial: string };

export default function AppShell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  const renderLink = ({ label, href, icon: Icon }: { label: string; href: string; icon: typeof Bot }) => (
    <Link
      key={href}
      href={href}
      onClick={() => setOpen(false)}
      className={`nav-item ${isActive(href) ? "active" : ""}`}
      aria-current={isActive(href) ? "page" : undefined}
    >
      <Icon size={17} />
      <span>{label}</span>
    </Link>
  );

  return (
    <div className="app-shell">
      {open && <button className="sidebar-scrim" aria-label="Close menu" onClick={() => setOpen(false)} />}

      <aside className={`sidebar ${open ? "sidebar-open" : ""}`} aria-label="Main navigation">
        <div className="brand">
          <div className="brand-mark"><Command size={21} strokeWidth={2.5} /></div>
          <div>
            <strong>CloneAI<span> Studio</span></strong>
            <small>YOUR AI UNIVERSE</small>
          </div>
          <button className="sidebar-close" onClick={() => setOpen(false)} aria-label="Close menu"><X size={18} /></button>
        </div>

        <div className="workspace-switch">
          <div className="workspace-avatar">{user.initial}</div>
          <div className="workspace-copy">
            <strong>{user.name}</strong>
            <small>{user.email}</small>
          </div>
        </div>

        <div className="nav-label">WORKSPACE</div>
        <nav className="main-nav">{primaryNav.map(renderLink)}</nav>

        <div className="nav-label manage-label">STUDIOS</div>
        <nav className="main-nav">{studioNav.map(renderLink)}</nav>

        <div className="nav-label manage-label">MANAGE</div>
        <nav className="main-nav">{manageNav.map(renderLink)}</nav>

        <div className="sidebar-bottom">
          <div className="upgrade-card">
            <div className="upgrade-icon"><Zap size={16} /></div>
            <strong>Bring your own model</strong>
            <p>Add an API key to switch from demo answers to a real model.</p>
            <Link href="/settings">Open settings</Link>
          </div>
          <form action="/auth/signout" method="post">
            <button className="signout-button" type="submit">Sign out</button>
          </form>
        </div>
      </aside>

      <section className="main-panel">
        <header className="topbar">
          <button className="mobile-menu icon-button" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={19} /></button>
          <div className="breadcrumb">
            Workspace <span>/</span> <strong>{titleFor(pathname)}</strong>
          </div>
          <div className="top-actions">
            <Link className="search-trigger" href="/agents">
              <Sparkles size={16} />
              <span>Your agents</span>
            </Link>
            <div className="top-avatar">{user.initial}</div>
          </div>
        </header>
        <div className="content">{children}</div>
      </section>
    </div>
  );
}

function titleFor(pathname: string): string {
  if (pathname === "/") return "Overview";
  if (pathname.startsWith("/agents")) return "AI Agents";
  if (pathname.startsWith("/knowledge")) return "Knowledge";
  if (pathname.startsWith("/usage")) return "Usage & Billing";
  if (pathname.startsWith("/settings")) return "Settings";
  if (pathname.startsWith("/help")) return "Help & Support";
  if (pathname.startsWith("/studios")) return "Studios";
  return "Workspace";
}
