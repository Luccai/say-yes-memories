import { NextResponse } from "next/server";
import { getCurrentWeddingFromCookie } from "@/lib/auth";
import { deleteMedia } from "@/lib/supabase-store";
import { broadcastWeddingMediaChange } from "@/lib/supabase/realtime";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  void request;
  void context;

  return NextResponse.json(
    { message: "Method not allowed." },
    { status: 405, headers: { Allow: "DELETE" } },
  );
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const current = await getCurrentWeddingFromCookie();

  if (!current) {
    return NextResponse.json({ message: "Session not found." }, { status: 401 });
  }

  const { id } = await context.params;
  let deleted = false;

  try {
    deleted = await deleteMedia(id, current.wedding.id);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Could not delete this file. Please try again." },
      { status: 500 },
    );
  }

  if (!deleted) {
    return NextResponse.json({ message: "Media not found." }, { status: 404 });
  }

  await broadcastWeddingMediaChange(current.wedding.realtimeTopic);

  return NextResponse.json({ ok: true });
}
