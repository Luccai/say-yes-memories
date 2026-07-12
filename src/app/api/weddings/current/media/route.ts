import { NextResponse } from "next/server";
import { getCurrentWeddingFromCookie } from "@/lib/auth";
import {
  InvalidMediaPageQueryError,
  parseMediaPageQuery,
} from "@/lib/media-pagination";
import { listWeddingMediaPage } from "@/lib/supabase-store";

export async function GET(request: Request) {
  const current = await getCurrentWeddingFromCookie();

  if (!current) {
    return NextResponse.json({ message: "Session not found." }, { status: 401 });
  }

  const url = new URL(request.url);
  try {
    const page = await listWeddingMediaPage(
      current.wedding.id,
      parseMediaPageQuery(url.searchParams),
    );
    return NextResponse.json({ ...page, wedding: current.wedding });
  } catch (error) {
    if (error instanceof InvalidMediaPageQueryError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    throw error;
  }
}
