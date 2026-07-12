import { NextResponse } from "next/server";
import { getCurrentWeddingFromCookie } from "@/lib/auth";
import { decodePresentationCursor } from "@/lib/presentation/cursor";
import { listPresentationMediaPage } from "@/lib/presentation/store";
import type { PresentationMediaPage } from "@/lib/presentation/types";

type PresentationMediaRouteDependencies = {
  getCurrentWeddingFromCookie: () => Promise<{ wedding: { id: string } } | null>;
  listPresentationMediaPage: (
    weddingId: string,
    options: { after?: ReturnType<typeof decodePresentationCursor> },
  ) => Promise<PresentationMediaPage>;
};

export function createPresentationMediaGet(
  dependencies: PresentationMediaRouteDependencies,
) {
  return async function presentationMediaGet(request: Request) {
    const current = await dependencies.getCurrentWeddingFromCookie();
    if (!current) {
      return NextResponse.json({ message: "Session not found." }, { status: 401 });
    }

    const encodedCursor = new URL(request.url).searchParams.get("cursor");
    let after: ReturnType<typeof decodePresentationCursor> | undefined;
    try {
      after = encodedCursor ? decodePresentationCursor(encodedCursor) : undefined;
    } catch {
      return NextResponse.json(
        { message: "Invalid presentation cursor." },
        { status: 400 },
      );
    }

    try {
      const page = await dependencies.listPresentationMediaPage(
        current.wedding.id,
        { after },
      );
      return NextResponse.json(page, {
        headers: { "Cache-Control": "private, no-store" },
      });
    } catch {
      return NextResponse.json(
        { message: "Presentation media could not be loaded." },
        { status: 500 },
      );
    }
  };
}

export const GET = createPresentationMediaGet({
  getCurrentWeddingFromCookie,
  listPresentationMediaPage,
});
