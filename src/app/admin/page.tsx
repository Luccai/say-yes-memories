import { redirect } from "next/navigation";
import { AdminExperience } from "@/components/admin/AdminExperience";
import { getCurrentWeddingFromCookie } from "@/lib/auth";
import { listWeddingMedia } from "@/lib/dev-store";

export default async function AdminPage() {
  const current = await getCurrentWeddingFromCookie();

  if (!current) {
    redirect("/login");
  }

  const media = await listWeddingMedia(current.wedding.id);
  return <AdminExperience initialWedding={current.wedding} initialMedia={media} />;
}
