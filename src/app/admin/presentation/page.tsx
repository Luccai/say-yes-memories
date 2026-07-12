import { redirect } from "next/navigation";
import { PresentationExperience } from "@/components/admin/PresentationExperience";
import { getCurrentWeddingFromCookie } from "@/lib/auth";
import { toPresentationWedding } from "@/lib/presentation/domain";
import { listPresentationMediaPage } from "@/lib/presentation/store";

export default async function PresentationPage() {
  const current = await getCurrentWeddingFromCookie();
  if (!current) redirect("/login");
  const page = await listPresentationMediaPage(current.wedding.id);
  return (
    <PresentationExperience
      wedding={toPresentationWedding(current.wedding, { demo: false })}
      initialMedia={page.media}
      initialHasMore={page.hasMore}
      initialNextCursor={page.nextCursor}
      initialTotal={page.total}
    />
  );
}
