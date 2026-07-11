const MAX_SLUG_LENGTH = 64;
const RESERVED_SLUGS = new Set(["mary-john", "login", "admin", "owner", "api"]);

function normalizeCandidate(value: string) {
  return value.trim().toLowerCase().slice(0, MAX_SLUG_LENGTH) || "say-yes";
}

export function allocateWeddingSlug(baseSlug: string, takenSlugs: ReadonlySet<string>) {
  const base = normalizeCandidate(baseSlug);
  const taken = new Set([...takenSlugs].map((slug) => slug.toLowerCase()));

  if (!RESERVED_SLUGS.has(base) && !taken.has(base)) {
    return base;
  }

  for (let suffixNumber = 2; ; suffixNumber += 1) {
    const suffix = `-${suffixNumber}`;
    const candidate = `${base.slice(0, MAX_SLUG_LENGTH - suffix.length)}${suffix}`;

    if (!RESERVED_SLUGS.has(candidate) && !taken.has(candidate)) {
      return candidate;
    }
  }
}
