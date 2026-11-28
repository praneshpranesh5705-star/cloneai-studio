import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseKey, supabaseUrl } from "../config";

export async function createClient() {
  const cookieStore = await cookies();
  // Read through config.ts so the ANON_KEY fallback is honoured here too.
  // Reading the env vars directly used to make this throw for anyone who
  // followed the older Supabase docs and set NEXT_PUBLIC_SUPABASE_ANON_KEY.
  const url = supabaseUrl();
  const key = supabaseKey();
  if (!url || !key) throw new Error("Supabase is not configured.");

  return createServerClient(url, key, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Cookie writes from Server Components are handled by middleware.
        }
      },
    },
  });
}

/**
 * Same client, but returns null instead of throwing when Supabase is not
 * configured.
 *
 * Route handlers use this so an unconfigured deployment answers with a clear
 * 503 ("add these variables") rather than an opaque 500 from a thrown error
 * deep inside the auth call. Pages keep using createClient(), because they
 * redirect to /setup instead.
 */
export async function createClientOrNull() {
  if (!supabaseUrl() || !supabaseKey()) return null;
  return createClient();
}
