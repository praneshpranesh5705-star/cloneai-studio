"use client";

import { useState } from "react";
import {
  Activity, ArrowUpRight, AudioLines, Bot, Boxes, ChevronDown,
  CircleHelp, Command, CreditCard, FileCode2, Globe2, LayoutDashboard, Plus,
  Search, Settings2, ShieldCheck, Sparkles, WandSparkles, Workflow, Zap,
  Menu, Bell, Play, Clock3, MoreHorizontal, Image as ImageIcon
} from "lucide-react";

const navItems = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "AI Agents", icon: Bot },
  { label: "Voice Studio", icon: AudioLines },
  { label: "Avatar Studio", icon: ImageIcon },
  { label: "Website Builder", icon: Globe2 },
  { label: "Model Studio", icon: Boxes },
  { label: "API & Integrations", icon: Workflow },
];

const tools = [
  { name: "AI Agent Builder", detail: "Create assistants with your own knowledge", icon: Bot, tone: "violet", tag: "POPULAR" },
  { name: "Voice Studio", detail: "Build a voice experience with consent", icon: AudioLines, tone: "blue", tag: "VOICE" },
  { name: "Avatar Studio", detail: "Design expressive digital presenters", icon: ImageIcon, tone: "pink", tag: "VISUAL" },
  { name: "Website Builder", detail: "Turn an idea into a responsive website", icon: Globe2, tone: "cyan", tag: "BUILD" },
];

export default function Home() {
  const [active, setActive] = useState("Overview");
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState("");

  const select = (label: string) => {
    setActive(label);
    setMenuOpen(false);
    if (label !== "Overview") setNotice(label + " workspace is coming in the next build module.");
    else setNotice("");
  };

  return (
    <main className="app-shell">
      <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><Command size={21} strokeWidth={2.5} /></div>
          <div><strong>CloneAI<span> Studio</span></strong><small>YOUR AI UNIVERSE</small></div>
        </div>
        <div className="workspace-switch">
          <div className="workspace-avatar">C</div>
          <div className="workspace-copy"><strong>Personal workspace</strong><small>Free plan</small></div>
          <ChevronDown size={15} />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav className="main-nav">
          {navItems.map(({ label, icon: Icon }) => (
            <button key={label} onClick={() => select(label)} className={`nav-item ${active === label ? "active" : ""}`}>
              <Icon size={17} /><span>{label}</span>{label === "AI Agents" && <i className="nav-count">0</i>}
            </button>
          ))}
        </nav>
        <div className="nav-label manage-label">MANAGE</div>
        <nav className="main-nav">
          <button onClick={() => select("Usage & Billing")} className={`nav-item ${active === "Usage & Billing" ? "active" : ""}`}><CreditCard size={17}/><span>Usage & Billing</span></button>
          <button onClick={() => select("Settings")} className={`nav-item ${active === "Settings" ? "active" : ""}`}><Settings2 size={17}/><span>Settings</span></button>
          <button onClick={() => select("Help & Support")} className={`nav-item ${active === "Help & Support" ? "active" : ""}`}><CircleHelp size={17}/><span>Help & Support</span></button>
        </nav>
        <div className="sidebar-bottom">
          <div className="upgrade-card">
            <div className="upgrade-icon"><Zap size={16}/></div>
            <strong>Unlock your AI potential</strong>
            <p>Upgrade to create more and do more with AI.</p>
            <button onClick={() => select("Plans & Pricing")}>Explore plans <ArrowUpRight size={14}/></button>
          </div>
          <div className="profile-row">
            <div className="profile-avatar">P</div>
            <div className="profile-copy"><strong>Your account</strong><small>Personal workspace</small></div>
            <MoreHorizontal size={18}/>
          </div>
        </div>
      </aside>

      <section className="main-panel">
        <header className="topbar">
          <button className="mobile-menu icon-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu"><Menu size={19}/></button>
          <div className="breadcrumb">Workspace <span>/</span> <strong>{active}</strong></div>
          <div className="top-actions">
            <button className="search-trigger"><Search size={16}/><span>Search anything</span><kbd>⌘ K</kbd></button>
            <button className="icon-button notification-button" aria-label="Notifications"><Bell size={18}/><i/></button>
            <div className="top-avatar">P</div>
          </div>
        </header>

        <div className="content">
          <div className="welcome-row">
            <div>
              <div className="eyebrow"><span className="live-dot"/> YOUR CREATIVE WORKSPACE</div>
              <h1>Build something <span>intelligent.</span></h1>
              <p className="welcome-subtitle">Your ideas. Your AI. One powerful studio.</p>
            </div>
            <button className="primary-button" onClick={() => select("AI Agents")}><Plus size={17}/> Create new</button>
          </div>

          {notice && <div className="notice"><Sparkles size={16}/><span>{notice}</span><button onClick={() => setNotice("")}>Dismiss</button></div>}

          <section className="hero-card">
            <div className="hero-orb orb-one"/><div className="hero-orb orb-two"/>
            <div className="hero-content">
              <div className="hero-chip"><Sparkles size={13}/> THE FUTURE IS YOURS TO BUILD</div>
              <h2>One studio.<br/><span>Infinite possibilities.</span></h2>
              <p>Design AI agents, create voice experiences, build digital avatars and launch websites — all from one connected workspace.</p>
              <button className="hero-button" onClick={() => select("AI Agents")}>Explore AI Studio <ArrowUpRight size={16}/></button>
            </div>
            <div className="hero-art" aria-hidden="true">
              <div className="orbit orbit-a"/><div className="orbit orbit-b"/><div className="orbit orbit-c"/>
              <div className="core-glow"><div className="core"><WandSparkles size={43}/></div></div>
              <div className="float-node node-a"><Bot size={18}/></div>
              <div className="float-node node-b"><AudioLines size={18}/></div>
              <div className="float-node node-c"><Globe2 size={18}/></div>
              <div className="float-node node-d"><ImageIcon size={18}/></div>
            </div>
            <div className="hero-foot"><span><ShieldCheck size={14}/> Built with privacy in mind</span><span>01 <i/> 04</span></div>
          </section>

          <div className="section-heading">
            <div><h2>Your workspace</h2><p>A quick look at your AI activity</p></div>
            <button className="subtle-button" onClick={() => setNotice("Your activity report will be available when analytics is connected.")}>View activity <ArrowUpRight size={14}/></button>
          </div>

          <div className="stats-grid">
            <article className="stat-card"><div className="stat-top"><span>AI projects</span><span className="stat-icon violet"><Boxes size={17}/></span></div><div className="stat-value">0 <small>projects</small></div><div className="stat-foot"><span className="muted">Start your first creation</span><span className="trend neutral"><ArrowUpRight size={13}/> New</span></div></article>
            <article className="stat-card"><div className="stat-top"><span>AI generations</span><span className="stat-icon blue"><Activity size={17}/></span></div><div className="stat-value">0 <small>this month</small></div><div className="stat-foot"><span className="muted">Your activity starts here</span><span className="trend neutral">—</span></div></article>
            <article className="stat-card"><div className="stat-top"><span>Usage credits</span><span className="stat-icon cyan"><Zap size={17}/></span></div><div className="stat-value">100 <small>starter credits</small></div><div className="credit-track"><span/></div><div className="stat-foot"><span className="muted">Starter allowance preview</span><span className="trend neutral">100%</span></div></article>
          </div>

          <div className="section-heading tools-heading">
            <div><h2>Start creating</h2><p>Choose a studio and bring your next idea to life</p></div>
            <button className="subtle-button" onClick={() => select("All tools")}>View all tools <ArrowUpRight size={14}/></button>
          </div>
          <div className="tools-grid">
            {tools.map(({ name, detail, icon: Icon, tone, tag }) => (
              <button className="tool-card" key={name} onClick={() => select(name)}>
                <div className="tool-card-top"><span className={`tool-icon ${tone}`}><Icon size={20}/></span><span className="tool-tag">{tag}</span></div>
                <strong>{name}</strong><p>{detail}</p><span className="tool-open">Open studio <ArrowUpRight size={14}/></span>
              </button>
            ))}
          </div>

          <div className="bottom-grid">
            <section className="activity-card">
              <div className="card-heading"><div><h3>Recent activity</h3><p>Your latest work will appear here</p></div><Clock3 size={17}/></div>
              <div className="empty-state"><div className="empty-icon"><FileCode2 size={22}/></div><strong>No activity yet</strong><p>Create your first AI project to see it here.</p><button onClick={() => select("AI Agents")}>Create a project <ArrowUpRight size={14}/></button></div>
            </section>
            <section className="quick-card">
              <div className="card-heading"><div><h3>Quick launch</h3><p>Jump straight into creating</p></div><Zap size={17}/></div>
              <button onClick={() => select("AI Agents")}><span className="quick-icon violet"><Bot size={16}/></span><span><strong>New AI assistant</strong><small>Build a custom agent</small></span><ArrowUpRight size={15}/></button>
              <button onClick={() => select("Voice Studio")}><span className="quick-icon blue"><AudioLines size={16}/></span><span><strong>Open voice studio</strong><small>Create a voice project</small></span><ArrowUpRight size={15}/></button>
              <button onClick={() => select("Website Builder")}><span className="quick-icon cyan"><Globe2 size={16}/></span><span><strong>Build a website</strong><small>Start from an idea</small></span><ArrowUpRight size={15}/></button>
            </section>
          </div>
          <footer className="footer"><span>© 2026 CloneAI Studio</span><span>Made for curious minds <span className="footer-spark">✦</span></span><span>Privacy · Terms · Status</span></footer>
        </div>
      </section>
    </main>
  );
}