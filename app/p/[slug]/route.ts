import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/config";

export const dynamic = "force-dynamic";

/**
 * A published page, served at /p/<slug>.
 *
 * This is a route handler rather than a page component because the stored
 * document is already complete HTML: returning it directly avoids wrapping a
 * generated page inside the app's own layout, and lets us set the security
 * headers that matter for user-generated content.
 *
 * Only rows with `published = true` are readable by an anonymous visitor — the
 * RLS policy enforces that, so a draft slug returns 404 even if guessed.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  if (!isSupabaseConfigured()) {
    return new Response("This site is not configured yet.", { status: 503 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("websites")
    .select("html, title, updated_at")
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();

  if (error) {
    return new Response("Could not load this page.", { status: 500 });
  }
  if (!data) {
    return new Response(notFoundPage(), {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  return new Response(data.html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
      // The page is user-generated. These headers stop it from being treated as
      // part of the app: no script execution, no framing, no form posts back to
      // our origin, and no access to our cookies.
      "Content-Security-Policy":
        "default-src 'none'; img-src data: https:; style-src 'unsafe-inline' https:; font-src data: https:; script-src 'none'; connect-src 'none'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "DENY",
    },
  });
}

function notFoundPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Page not found</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; min-height:100vh; display:grid; place-items:center;
         background:#080a12; color:#f3f5ff;
         font-family:'DM Sans',system-ui,-apple-system,sans-serif; padding:24px; }
  .card { max-width:420px; text-align:center; }
  h1 { font-size:22px; margin:0 0 10px; letter-spacing:-.4px; }
  p { color:#858da6; font-size:13px; line-height:1.7; margin:0; }
</style>
</head>
<body>
  <div class="card">
    <h1>Page not found</h1>
    <p>This page does not exist, or it has not been published.</p>
  </div>
</body>
</html>`;
}
