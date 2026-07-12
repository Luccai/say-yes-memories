import { notFound, permanentRedirect } from "next/navigation";
import { GuestExperience } from "@/components/guest/GuestExperience";
import { resolvePublicWeddingBySlug } from "@/lib/supabase-store";
import { canonicalSlugRedirect } from "@/lib/weddings/slug-routing";
import { DEMO_GUEST_SLUG, demoWedding } from "@/lib/demo-content";

export default async function GuestPage({
  params,
}: {
  params: Promise<{ coupleSlug: string }>;
}) {
  const { coupleSlug } = await params;

  if (coupleSlug === demoWedding.slug || coupleSlug === DEMO_GUEST_SLUG) {
    return <GuestExperience wedding={demoWedding} demoMode />;
  }

  const resolved = await resolvePublicWeddingBySlug(coupleSlug);

  if (!resolved) {
    notFound();
  }

  const redirectSlug = canonicalSlugRedirect({
    requestedSlug: coupleSlug,
    canonicalSlug: resolved.canonicalSlug,
    isAlias: resolved.isAlias,
  });
  if (redirectSlug) {
    permanentRedirect(`/${redirectSlug}`);
  }

  return <GuestExperience wedding={resolved.wedding} />;
}
