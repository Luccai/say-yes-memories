import type { Wedding } from "@/lib/types";

type ProfileMediaFetch = (input: string, init?: RequestInit) => Promise<Response>;

const PROFILE_REMOVE_FALLBACK = "Profile photo could not be removed.";

export async function requestProfileMediaRemoval(
  fetcher: ProfileMediaFetch = fetch,
) {
  const response = await fetcher("/api/weddings/current/profile-media", {
    method: "DELETE",
  });
  const payload = (await response.json()) as {
    wedding?: Wedding;
    message?: string;
  };

  if (!response.ok || !payload.wedding) {
    throw new Error(payload.message || PROFILE_REMOVE_FALLBACK);
  }

  return payload.wedding;
}
