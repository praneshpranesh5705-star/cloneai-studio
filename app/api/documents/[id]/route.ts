import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { error, count } = await supabase
    .from("documents")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("owner_id", userData.user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!count) return NextResponse.json({ error: "Document not found, or you do not own it." }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
