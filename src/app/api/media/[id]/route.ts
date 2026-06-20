import { NextResponse } from "next/server";
import { getCurrentWeddingFromCookie } from "@/lib/auth";
import { deleteMedia, updateMediaForWedding } from "@/lib/dev-store";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const current = await getCurrentWeddingFromCookie();

  if (!current) {
    return NextResponse.json({ message: "Oturum bulunamadı." }, { status: 401 });
  }

  const { id } = await context.params;
  const body = (await request.json()) as {
    approved?: boolean;
    hidden?: boolean;
    favorite?: boolean;
  };

  const media = await updateMediaForWedding(id, current.wedding.id, body);

  if (!media) {
    return NextResponse.json({ message: "Medya bulunamadı." }, { status: 404 });
  }

  return NextResponse.json({ media });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const current = await getCurrentWeddingFromCookie();

  if (!current) {
    return NextResponse.json({ message: "Oturum bulunamadı." }, { status: 401 });
  }

  const { id } = await context.params;
  const deleted = await deleteMedia(id, current.wedding.id);

  if (!deleted) {
    return NextResponse.json({ message: "Medya bulunamadı." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
