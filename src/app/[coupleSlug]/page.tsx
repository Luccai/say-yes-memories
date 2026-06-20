import { notFound } from "next/navigation";
import { GuestExperience } from "@/components/guest/GuestExperience";
import { getWeddingBySlug } from "@/lib/supabase-store";
import { demoWedding } from "@/lib/demo-content";

export default async function GuestPage({
  params,
  searchParams,
}: {
  params: Promise<{ coupleSlug: string }>;
  searchParams: Promise<{ demo?: string }>;
}) {
  const { coupleSlug } = await params;
  const { demo } = await searchParams;

  if (coupleSlug === demoWedding.slug && demo === "1") {
    return <GuestExperience wedding={demoWedding} demoMode />;
  }

  const wedding = await getWeddingBySlug(coupleSlug);

  if (!wedding) {
    notFound();
  }

  return <GuestExperience wedding={wedding} />;
}
