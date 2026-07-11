import { NextResponse } from "next/server";
import { getCurrentWeddingFromCookie } from "@/lib/auth";
import { toPublicWedding } from "@/lib/public-wedding";

export async function GET() {
  const current = await getCurrentWeddingFromCookie();

  if (!current) {
    return NextResponse.json(
      { wedding: null },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    { wedding: toPublicWedding(current.wedding) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
