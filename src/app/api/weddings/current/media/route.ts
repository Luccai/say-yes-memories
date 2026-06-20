import { NextResponse } from "next/server";
import { getCurrentWeddingFromCookie } from "@/lib/auth";
import { listWeddingMedia } from "@/lib/dev-store";

export async function GET() {
  const current = await getCurrentWeddingFromCookie();

  if (!current) {
    return NextResponse.json({ message: "Oturum bulunamadı." }, { status: 401 });
  }

  const media = await listWeddingMedia(current.wedding.id);
  return NextResponse.json({ media });
}
