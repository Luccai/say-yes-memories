import { NextResponse } from "next/server";
import { getCurrentWeddingFromCookie } from "@/lib/auth";
import { updateWedding } from "@/lib/dev-store";

export async function GET() {
  const current = await getCurrentWeddingFromCookie();

  if (!current) {
    return NextResponse.json({ message: "Oturum bulunamadı." }, { status: 401 });
  }

  return NextResponse.json({ wedding: current.wedding });
}

export async function PATCH(request: Request) {
  const current = await getCurrentWeddingFromCookie();

  if (!current) {
    return NextResponse.json({ message: "Oturum bulunamadı." }, { status: 401 });
  }

  const body = (await request.json()) as {
    eventDate?: string;
    welcomeNote?: string;
    uploadLocked?: boolean;
  };

  const wedding = await updateWedding(current.wedding.id, {
    eventDate: body.eventDate,
    welcomeNote: body.welcomeNote,
    uploadLocked: body.uploadLocked,
  });

  return NextResponse.json({ wedding });
}
