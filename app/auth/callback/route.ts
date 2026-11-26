import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");
  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      if (data.user) {
        await supabase.from("profiles").upsert({
          id: data.user.id,
          display_name: typeof data.user.user_metadata?.display_name === "string" ? data.user.user_metadata.display_name : null,
        });
      }
      return NextResponse.redirect(new URL(next && next.startsWith("/") ? next : "/", origin));
    }
  }
  return NextResponse.redirect(new URL("/login?error=confirmation", origin));
}
