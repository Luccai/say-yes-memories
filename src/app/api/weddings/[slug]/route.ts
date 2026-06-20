import { NextResponse } from "next/server";
import { getWeddingBySlug } from "@/lib/supabase-store";

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const wedding = await getWeddingBySlug(slug);

  if (!wedding) {
    return NextResponse.json({ message: "Wedding page not found." }, { status: 404 });
  }

  return NextResponse.json({ wedding });
}
