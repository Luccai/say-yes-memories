export function canonicalSlugRedirect(input: {
  requestedSlug: string;
  canonicalSlug: string;
  isAlias: boolean;
}) {
  const requested = input.requestedSlug.trim().toLowerCase();
  return input.isAlias || requested !== input.canonicalSlug
    ? input.canonicalSlug
    : null;
}
