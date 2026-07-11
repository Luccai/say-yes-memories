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

  try {
    const patch = parseCustomerWeddingUpdate(await request.json());
    const wedding = await updateWedding(current.wedding.id, patch);

    return NextResponse.json({ wedding });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Wedding page could not be saved." },
      { status: 400 },
    );
  }
}
