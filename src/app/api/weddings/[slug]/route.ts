import { NextResponse } from "next/server";
import { resolvePublicWeddingBySlug } from "@/lib/supabase-store";
import { canonicalSlugRedirect } from "@/lib/weddings/slug-routing";

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const resolved = await resolvePublicWeddingBySlug(slug);

  if (!resolved) {
    return NextResponse.json({ message: "Wedding page not found." }, { status: 404 });
  }

  const redirectSlug = canonicalSlugRedirect({
    requestedSlug: slug,
    canonicalSlug: resolved.canonicalSlug,
    isAlias: resolved.isAlias,
  });
  if (redirectSlug) {
    return NextResponse.redirect(
      new URL(`/api/weddings/${redirectSlug}`, request.url),
      308,
    );
  }

  return NextResponse.json({ wedding: resolved.wedding });
}
