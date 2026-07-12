import { notFound } from "next/navigation";
import { PresentationExperience } from "@/components/admin/PresentationExperience";
import { demoMedia, demoWedding } from "@/lib/demo-content";
import {
  chronologicalPresentationMedia,
  toDemoPresentationMedia,
  toPresentationWedding,
} from "@/lib/presentation/domain";

export default async function DemoPresentationPage({
  params,
}: {
  params: Promise<{ coupleSlug: string }>;
}) {
  const { coupleSlug } = await params;
  if (coupleSlug !== demoWedding.slug) notFound();
  return (
    <PresentationExperience
      wedding={toPresentationWedding(demoWedding, { demo: true })}
      initialMedia={chronologicalPresentationMedia(
        demoMedia.map(toDemoPresentationMedia),
      )}
      initialTotal={demoMedia.length}
      demoMode
    />
  );
}
