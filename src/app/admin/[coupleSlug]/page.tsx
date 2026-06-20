import { notFound } from "next/navigation";
import { AdminExperience } from "@/components/admin/AdminExperience";
import { demoMedia, demoWedding } from "@/lib/demo-content";

export default async function DemoAdminPage({
  params,
}: {
  params: Promise<{ coupleSlug: string }>;
}) {
  const { coupleSlug } = await params;

  if (coupleSlug !== demoWedding.slug) {
    notFound();
  }

  return <AdminExperience initialWedding={demoWedding} initialMedia={demoMedia} demoMode />;
}
