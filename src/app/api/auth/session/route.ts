import { NextResponse } from "next/server";
import { getCurrentWeddingFromCookie } from "@/lib/auth";

export async function GET() {
  const current = await getCurrentWeddingFromCookie();

  if (!current) {
    return NextResponse.json({ wedding: null }, { status: 200 });
  }

  return NextResponse.json({ wedding: current.wedding });
}
