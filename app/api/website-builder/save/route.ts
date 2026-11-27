import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deriveTitle, isValidSlug, MAX_OUTPUT, sanitizeHtml, uniqueSlug } from "@/lib/website";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Save a generated page, and optionally publish it.
 *
 * Saving is idempotent per page: pass an existing `id` to update it in place,
 * omit it to create a new one. Publishing flips the `published` flag, which is
 * what the anonymous read policy keys on.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Please sign in to save a page." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const html = typeof input.html === "string" ? input.html : "";
  const prompt = typeof input.prompt === "string" ? input.prompt.slice(0, 2500) : "";
  const id = typeof input.id === "string" ? input.id : "";
  const publish = input.publish === true;
  const requestedSlug = typeof input.slug === "string" ? input.slug.trim() : "";

  if (!html.trim()) {
    return NextResponse.json({ error: "There is no page to save yet." }, { status: 400 });
  }
  if (html.length > MAX_OUTPUT) {
    return NextResponse.json({ error: "That page is too large to save." }, { status: 400 });
  }
  if (requestedSlug && !isValidSlug(requestedSlug)) {
    return NextResponse.json(
      { error: "Use only lowercase letters, numbers and hyphens in the address." },
      { status: 400 },
    );
  }

  const clean = sanitizeHtml(html);
  const title = deriveTitle(clean, prompt || "Untitled page");

  // Updating an existing page the caller owns.
  if (id) {
    const { data: existing, error: readError } = await supabase
      .from("websites")
      .select("id, slug, published")
      .eq("id", id)
      .maybeSingle();

    if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
    if (!existing) return NextResponse.json({ error: "That page no longer exists." }, { status: 404 });

    const slug = requestedSlug || existing.slug;
    const { data, error } = await supabase
      .from("websites")
      .update({
        title,
        html: clean,
        prompt,
        slug,
        published: publish ? true : existing.published,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("id, slug, title, published, updated_at")
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "That address is already taken. Try another." }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ website: data });
  }

  // Creating a new page. The slug must be unique, so retry with a fresh suffix
  // rather than failing the whole save on a collision.
  const baseSlug = requestedSlug || uniqueSlug(title, Math.random().toString(36).slice(2, 8));

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const slug = attempt === 0 ? baseSlug : uniqueSlug(title, Math.random().toString(36).slice(2, 8));
    const { data, error } = await supabase
      .from("websites")
      .insert({
        owner_id: userData.user.id,
        slug,
        title,
        prompt,
        html: clean,
        published: publish,
      })
      .select("id, slug, title, published, updated_at")
      .single();

    if (!error) return NextResponse.json({ website: data }, { status: 201 });
    if (error.code !== "23505") {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json(
    { error: "Could not find a free address for this page. Try a different title." },
    { status: 409 },
  );
}

/** List the caller's own pages, newest first. */
export async function GET() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data, error } = await supabase
    .from("websites")
    .select("id, slug, title, published, updated_at")
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ websites: data ?? [] });
}
