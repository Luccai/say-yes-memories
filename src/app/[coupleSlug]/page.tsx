import { notFound } from "next/navigation";
import { GuestExperience } from "@/components/guest/GuestExperience";
import { getWeddingBySlug } from "@/lib/supabase-store";
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

  const wedding = await getWeddingBySlug(coupleSlug);

  if (!wedding) {
    notFound();
  }

  return <GuestExperience wedding={wedding} />;
}
