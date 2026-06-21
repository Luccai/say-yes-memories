import { NextResponse } from "next/server";
import { getCurrentWeddingFromCookie } from "@/lib/auth";
import { updateWedding } from "@/lib/supabase-store";

export async function GET() {
  const current = await getCurrentWeddingFromCookie();

  if (!current) {
    return NextResponse.json({ message: "Session not found." }, { status: 401 });
  }

  return NextResponse.json({ wedding: current.wedding });
}

export async function PATCH(request: Request) {
  const current = await getCurrentWeddingFromCookie();

  if (!current) {
    return NextResponse.json({ message: "Session not found." }, { status: 401 });
  }

  const body = (await request.json()) as {
    brideName?: string;
    groomName?: string;
    eventDate?: string;
    welcomeNote?: string;
    uploadLocked?: boolean;
  };

  try {
    const wedding = await updateWedding(current.wedding.id, {
      brideName: body.brideName,
      groomName: body.groomName,
      eventDate: body.eventDate,
      welcomeNote: body.welcomeNote,
      uploadLocked: body.uploadLocked,
    });

    return NextResponse.json({ wedding });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Wedding page could not be saved." },
      { status: 400 },
    );
  }
}
