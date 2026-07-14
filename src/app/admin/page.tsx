import { redirect } from "next/navigation";
import { AdminExperience } from "@/components/admin/AdminExperience";
import { getCurrentWeddingFromCookie } from "@/lib/auth";
import { listWeddingMediaPage } from "@/lib/supabase-store";

export default async function AdminPage() {
  const current = await getCurrentWeddingFromCookie();

  if (!current) {
    redirect("/login");
  }

  const page = await listWeddingMediaPage(current.wedding.id);
  return (
    <AdminExperience
      initialWedding={current.wedding}
      initialMedia={page.media}
      initialMediaCounts={page.counts}
      initialMediaHasMore={page.hasMore}
      initialMediaNextOffset={page.nextOffset}
    />
  );
}
