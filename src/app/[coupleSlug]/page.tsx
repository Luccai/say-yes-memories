import { notFound } from "next/navigation";
import { GuestExperience } from "@/components/guest/GuestExperience";
import { getWeddingBySlug } from "@/lib/dev-store";

export default async function GuestPage({
  params,
}: {
  params: Promise<{ coupleSlug: string }>;
}) {
  const { coupleSlug } = await params;
  const wedding = await getWeddingBySlug(coupleSlug);

  if (!wedding) {
    notFound();
  }

  return <GuestExperience wedding={wedding} />;
}
