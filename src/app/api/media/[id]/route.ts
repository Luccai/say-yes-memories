import { NextResponse } from "next/server";
import { getCurrentWeddingFromCookie } from "@/lib/auth";
import { deleteMedia, updateMediaForWedding } from "@/lib/supabase-store";
import { broadcastWeddingMediaChange } from "@/lib/supabase/realtime";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const current = await getCurrentWeddingFromCookie();

  if (!current) {
    return NextResponse.json({ message: "Session not found." }, { status: 401 });
  }

  const { id } = await context.params;
  const body = (await request.json()) as {
    approved?: boolean;
    hidden?: boolean;
    favorite?: boolean;
  };

  const media = await updateMediaForWedding(id, current.wedding.id, body);

  if (!media) {
    return NextResponse.json({ message: "Media not found." }, { status: 404 });
  }

  return NextResponse.json({ media });
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
