import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateDocumentInput } from "@/lib/validation";
import {
  ACCEPTED_EXTENSIONS,
  MAX_UPLOAD_BYTES,
  extractDocumentText,
  formatBytes,
  titleFromFilename,
} from "@/lib/extract";

export const runtime = "nodejs";
// Extraction is CPU-bound; never cache or statically optimise this route.
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/agents/:id/documents/upload
 *
 * multipart/form-data with:
 *   file  — the PDF or DOCX (required)
 *   title — optional override; defaults to the filename
 *
 * Extracts the text and stores it exactly like a pasted document, so retrieval
 * and citations work with no further changes.
 */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  // Confirm the agent exists and belongs to this user before doing any work.
  // RLS would block the insert anyway, but failing early avoids parsing a file
  // for an agent the caller cannot write to.
  const { data: agent, error: agentError } = await supabase
    .from("agents")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (agentError) {
    return NextResponse.json({ error: agentError.message }, { status: 500 });
  }
  if (!agent) {
    return NextResponse.json({ error: "Agent not found." }, { status: 404 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Could not read the upload. Try again." },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Choose a PDF or DOCX file first." }, { status: 400 });
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      {
        error: `That file is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_UPLOAD_BYTES)}.`,
      },
      { status: 413 },
    );
  }

  const lower = file.name.toLowerCase();
  if (!ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    return NextResponse.json(
      { error: "Only PDF and DOCX files are supported." },
      { status: 415 },
    );
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return NextResponse.json({ error: "Could not read that file. Try again." }, { status: 400 });
  }

  const extracted = await extractDocumentText(bytes, file.name);
  if (!extracted.ok) {
    // 422 for "we read it but there is nothing usable", 415 for a wrong type.
    const status = extracted.code === "unsupported_type" ? 415 : 422;
    return NextResponse.json({ error: extracted.message, code: extracted.code }, { status });
  }

  const titleOverride = form.get("title");
  const title =
    typeof titleOverride === "string" && titleOverride.trim()
      ? titleOverride.trim()
      : titleFromFilename(file.name);

  // Reuse the same validator as the paste path so both routes enforce one rule set.
  const parsed = validateDocumentInput({ title, content: extracted.text });
  if (!parsed.ok) {
    return NextResponse.json(
      { error: "The extracted text could not be saved.", fields: parsed.errors },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("documents")
    .insert({
      agent_id: id,
      owner_id: userData.user.id,
      title: parsed.value.title,
      content: parsed.value.content,
      char_count: parsed.value.content.length,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    {
      document: data,
      extracted: {
        kind: extracted.kind,
        pages: extracted.pages,
        characters: parsed.value.content.length,
      },
    },
    { status: 201 },
  );
}
