/**
 * Central place to read configuration. Nothing here throws: every getter
 * returns null when a value is missing so callers can decide what to do.
 * That is what lets the app render a setup screen instead of a 500.
 */

export type ProviderId = "demo" | "openai" | "openrouter" | "anthropic" | "gemini";

export const PROVIDERS: Record<
  ProviderId,
  { label: string; envKey: string; defaultModel: string; docs: string }
> = {
  demo: {
    label: "Demo (no key needed)",
    envKey: "",
    defaultModel: "demo",
    docs: "Deterministic sample answers. Nothing leaves the server.",
  },
  openai: {
    label: "OpenAI",
    envKey: "OPENAI_API_KEY",
    defaultModel: "gpt-4o-mini",
    docs: "https://platform.openai.com/api-keys",
  },
  openrouter: {
    label: "OpenRouter",
    envKey: "OPENROUTER_API_KEY",
    defaultModel: "openai/gpt-4o-mini",
    docs: "https://openrouter.ai/keys",
  },
  anthropic: {
    label: "Anthropic",
    envKey: "ANTHROPIC_API_KEY",
    defaultModel: "claude-haiku-4-5-20251001",
    docs: "https://console.anthropic.com/settings/keys",
  },
  gemini: {
    label: "Google Gemini",
    envKey: "GEMINI_API_KEY",
    defaultModel: "gemini-3.8-flash",
    docs: "https://aistudio.google.com/app/apikey",
  },
};

export function supabaseUrl(): string | null {
  return process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || null;
}

export function supabaseKey(): string | null {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    null
  );
}

/** True when both Supabase values are present. */
export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl() && supabaseKey());
}

/** Which providers actually have a key on this deployment. */
export function availableProviders(): ProviderId[] {
  const out: ProviderId[] = ["demo"];
  (Object.keys(PROVIDERS) as ProviderId[]).forEach((id) => {
    if (id === "demo") return;
    if (process.env[PROVIDERS[id].envKey]?.trim()) out.push(id);
  });
  return out;
}

/** The provider to use when an agent has not chosen one. */
export function defaultProvider(): ProviderId {
  const preferred = process.env.AI_PROVIDER?.trim() as ProviderId | undefined;
  const available = availableProviders();
  if (preferred && available.includes(preferred)) return preferred;
  return available.find((p) => p !== "demo") ?? "demo";
}

export function providerKey(id: ProviderId): string | null {
  const envKey = PROVIDERS[id]?.envKey;
  if (!envKey) return null;
  return process.env[envKey]?.trim() || null;
}

/** True when at least one real model is configured. */
export function hasRealModel(): boolean {
  return availableProviders().some((p) => p !== "demo");
}
