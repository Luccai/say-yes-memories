import { NextResponse } from "next/server";
import { getCurrentWeddingFromCookie } from "@/lib/auth";
import { updateWedding } from "@/lib/supabase-store";
import { parseCustomerWeddingUpdate } from "@/lib/weddings/customer-update";

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

  let patch;
  try {
    patch = parseCustomerWeddingUpdate(await request.json());
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Wedding page changes are invalid." },
      { status: 400 },
    );
  }
  try {
    const wedding = await updateWedding(current.wedding.id, patch);

    return NextResponse.json({ wedding });
  } catch {
    return NextResponse.json(
      { message: "Wedding page could not be saved. Please try again." },
      { status: 500 },
    );
  }
}
