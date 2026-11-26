import { createBrowserClient } from "@supabase/ssr";
import { supabaseKey, supabaseUrl } from "../config";

export function createClient() {
  // Same fallback as the server client: publishable key, else anon key.
  const url = supabaseUrl();
  const key = supabaseKey();
  if (!url || !key) throw new Error("Supabase is not configured. Add the project URL and publishable key in Vercel Environment Variables.");
  return createBrowserClient(url, key);
}
