export function mediaSourceFingerprint(src: string) {
  if (src.startsWith("data:")) {
    return src.slice(0, 96);
  }

  try {
    const url = new URL(src, "https://sayyes.local");
    const explicitVersion = url.searchParams.get("v");

    return explicitVersion ? `${url.pathname}?v=${explicitVersion}` : url.pathname;
  } catch {
    return src.slice(0, 96);
  }
}

export function mediaCacheIdentity(cacheKey: string | undefined, src: string) {
  if (!cacheKey) {
    return `source:${src}`;
  }

  return `media:${cacheKey}|source:${mediaSourceFingerprint(src)}`;
}
