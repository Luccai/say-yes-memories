import type { PublicStoredMediaObject, PublicWedding } from "@/lib/types";

const DEVICE_HINT_KEY = "sayyes.membership.device-hint.v1";

export type RememberedMembership = {
  slug: string;
  coupleName: string;
  profileMedia?: PublicStoredMediaObject;
};

function isRememberedMembership(value: unknown): value is RememberedMembership {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<RememberedMembership>;
  return Boolean(
    candidate.slug &&
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(candidate.slug) &&
      candidate.coupleName &&
      typeof candidate.coupleName === "string",
  );
}

export function readRememberedMembership() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(DEVICE_HINT_KEY);
    if (!stored) {
      return null;
    }
    const parsed: unknown = JSON.parse(stored);
    return isRememberedMembership(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function rememberMembership(
  wedding: Pick<PublicWedding, "slug" | "coupleName" | "profileMedia">,
) {
  if (typeof window === "undefined") {
    return;
  }

  const hint: RememberedMembership = {
    slug: wedding.slug,
    coupleName: wedding.coupleName,
    profileMedia: wedding.profileMedia,
  };

  try {
    window.localStorage.setItem(DEVICE_HINT_KEY, JSON.stringify(hint));
  } catch {
    // Best effort only. Private browsing can reject localStorage access.
  }
}

export function forgetRememberedMembership() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(DEVICE_HINT_KEY);
  } catch {
    // Best effort only.
  }
}
