import { LoginExperience } from "@/components/login/LoginExperience";
import { getCurrentWeddingFromCookie } from "@/lib/auth";
import { toPublicWedding } from "@/lib/public-wedding";

export default async function LoginPage() {
  const current = await getCurrentWeddingFromCookie();
  return (
    <LoginExperience
      initialSession={current ? toPublicWedding(current.wedding) : null}
    />
  );
}
