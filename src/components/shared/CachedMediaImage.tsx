"use client";

import { useEffect, useEffectEvent, useLayoutEffect, useState } from "react";
import { mediaCacheIdentity, mediaSourceFingerprint } from "@/lib/media-cache";

type CachedMediaImageProps = {
  src: string;
  cacheKey?: string;
  alt: string;
  className?: string;
  instantCache?: boolean;
  retainInMemory?: boolean;
  cacheByteSize?: number;
  cacheResponse?: boolean;
  loading?: "eager" | "lazy";
  fetchPriority?: "high" | "low" | "auto";
  onReady?: () => void;
};

const MEDIA_CACHE_NAME = "say-yes-media-v2";
const OLD_MEDIA_CACHE_NAMES = ["say-yes-media-v1"];
const INSTANT_CACHE_PREFIX = "sayyes.media.instant.v2.";
const OLD_INSTANT_CACHE_PREFIXES = ["sayyes.media.instant."];
const INSTANT_CACHE_MAX_BYTES = 650 * 1024;
const INSTANT_CACHE_MAX_DIMENSION = 760;
const RETAINED_MEDIA_MAX_ENTRIES = 48;
const RETAINED_MEDIA_MAX_BYTES = 16 * 1024 * 1024;
const RETAINED_MEDIA_MAX_ITEM_BYTES = 1024 * 1024;
const retainedMediaBlobs = new Map<string, Blob>();
let retainedMediaBytes = 0;
let oldMediaCacheCleanupStarted = false;

const useSafeLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function removeRetainedMediaBlob(cacheIdentity: string) {
  const blob = retainedMediaBlobs.get(cacheIdentity);

  if (!blob) {
    return;
  }

  retainedMediaBlobs.delete(cacheIdentity);
  retainedMediaBytes -= blob.size;
}

function getRetainedMediaBlob(cacheIdentity: string, touch = false) {
  const blob = retainedMediaBlobs.get(cacheIdentity);

  if (!blob || !touch) {
    return blob;
  }

  retainedMediaBlobs.delete(cacheIdentity);
  retainedMediaBlobs.set(cacheIdentity, blob);
  return blob;
}

function retainMediaBlob(cacheIdentity: string, blob: Blob) {
  if (blob.size > RETAINED_MEDIA_MAX_ITEM_BYTES) {
    return false;
  }

  removeRetainedMediaBlob(cacheIdentity);
  retainedMediaBlobs.set(cacheIdentity, blob);
  retainedMediaBytes += blob.size;

  while (
    retainedMediaBlobs.size > RETAINED_MEDIA_MAX_ENTRIES ||
    retainedMediaBytes > RETAINED_MEDIA_MAX_BYTES
  ) {
    const oldest = retainedMediaBlobs.keys().next().value;

    if (!oldest) {
      break;
    }

    removeRetainedMediaBlob(oldest);
  }

  return retainedMediaBlobs.has(cacheIdentity);
}

export function hasRetainedMediaSource(cacheKey: string | undefined, src: string) {
  return retainedMediaBlobs.has(mediaCacheIdentity(cacheKey, src));
}

export function clearRetainedMediaCache() {
  retainedMediaBlobs.clear();
  retainedMediaBytes = 0;
}

function mediaCacheRequest(cacheKey: string, src: string) {
  return new Request(
    `/__sayyes-media-cache/${encodeURIComponent(cacheKey)}?source=${encodeURIComponent(
      mediaSourceFingerprint(src),
    )}`,
  );
}

function instantCacheKey(cacheKey: string) {
  return `${INSTANT_CACHE_PREFIX}${encodeURIComponent(cacheKey)}`;
}

function readInstantMediaCache(cacheKey?: string) {
  if (!cacheKey || typeof window === "undefined") {
    return "";
  }

  try {
    return window.localStorage.getItem(instantCacheKey(cacheKey)) ?? "";
  } catch {
    return "";
  }
}

function cleanupOldMediaCaches() {
  if (oldMediaCacheCleanupStarted || typeof window === "undefined") {
    return;
  }

  oldMediaCacheCleanupStarted = true;

  if ("caches" in window) {
    void Promise.all(OLD_MEDIA_CACHE_NAMES.map((cacheName) => window.caches.delete(cacheName))).catch(
      () => undefined,
    );
  }

  try {
    const oldKeys: string[] = [];

    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);

      if (
        key &&
        OLD_INSTANT_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix)) &&
        !key.startsWith(INSTANT_CACHE_PREFIX)
      ) {
        oldKeys.push(key);
      }
    }

    oldKeys.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // Best effort only. Older browsers/private sessions can reject localStorage access.
  }
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Media could not be prepared for instant cache."));
    reader.readAsDataURL(blob);
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Media could not be compressed for instant cache."));
          return;
        }

        resolve(blob);
      },
      "image/jpeg",
      quality,
    );
  });
}

async function compressImageForInstantCache(blob: Blob) {
  if (!blob.type.startsWith("image/") || !("createImageBitmap" in window)) {
    return null;
  }

  try {
    const source = await createImageBitmap(blob);
    const largestSide = Math.max(source.width, source.height);
    const scale = Math.min(1, INSTANT_CACHE_MAX_DIMENSION / largestSide);
    const width = Math.max(1, Math.round(source.width * scale));
    const height = Math.max(1, Math.round(source.height * scale));
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) {
      source.close();
      return null;
    }

    canvas.width = width;
    canvas.height = height;
    context.fillStyle = "#fffaf3";
    context.fillRect(0, 0, width, height);
    context.drawImage(source, 0, 0, width, height);
    source.close();

    let quality = 0.82;
    let compressed = await canvasToBlob(canvas, quality);

    while (compressed.size > INSTANT_CACHE_MAX_BYTES && quality > 0.48) {
      quality -= 0.08;
      compressed = await canvasToBlob(canvas, quality);
    }

    return compressed.size <= INSTANT_CACHE_MAX_BYTES ? compressed : null;
  } catch {
    return null;
  }
}

export async function storeInstantMediaCache(cacheKey: string | undefined, blob: Blob) {
  if (!cacheKey || typeof window === "undefined") {
    return;
  }

  try {
    const storableBlob =
      blob.size <= INSTANT_CACHE_MAX_BYTES
        ? blob
        : await compressImageForInstantCache(blob);

    if (!storableBlob || storableBlob.size > INSTANT_CACHE_MAX_BYTES) {
      return;
    }

    const dataUrl = await blobToDataUrl(storableBlob);
    window.localStorage.setItem(instantCacheKey(cacheKey), dataUrl);
  } catch {
    // Best effort only. Cache quota can be full on older devices.
  }
}

export function CachedMediaImage({
  src,
  cacheKey,
  alt,
  className = "",
  instantCache = false,
  retainInMemory = false,
  cacheByteSize,
  cacheResponse = true,
  loading = "lazy",
  fetchPriority = "auto",
  onReady,
}: CachedMediaImageProps) {
  const cacheIdentity = mediaCacheIdentity(cacheKey, src);
  const canRetainInMemory =
    retainInMemory &&
    typeof cacheByteSize === "number" &&
    cacheByteSize > 0 &&
    cacheByteSize <= RETAINED_MEDIA_MAX_ITEM_BYTES;
  const [displaySrc, setDisplaySrc] = useState(() =>
    canRetainInMemory ? "" : src,
  );
  const getLatestSource = useEffectEvent(() => src);

  useSafeLayoutEffect(() => {
    if (!canRetainInMemory) {
      return;
    }

    setDisplaySrc("");
    const blob = getRetainedMediaBlob(cacheIdentity, true);

    if (!blob) {
      return;
    }

    const objectUrl = URL.createObjectURL(blob);
    setDisplaySrc(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [cacheIdentity, canRetainInMemory]);

  useEffect(() => {
    let cancelled = false;
    let objectUrlToRevoke = "";
    const controller = new AbortController();
    const source = getLatestSource();
    const retainedBlob = canRetainInMemory
      ? getRetainedMediaBlob(cacheIdentity, true)
      : undefined;

    cleanupOldMediaCaches();

    if (retainedBlob) {
      return () => {
        cancelled = true;
        controller.abort();
      };
    }

    // Versioned demo WebPs outside the gallery can keep using the browser's
    // native cache. Gallery thumbs opt into the shared cache for route returns.
    if (source.startsWith("/demo/") && !canRetainInMemory) {
      return () => {
        cancelled = true;
        controller.abort();
      };
    }

    async function loadImage() {
      const instantSrc = instantCache ? readInstantMediaCache(cacheKey) : "";

      if (instantSrc) {
        setDisplaySrc(instantSrc);
        return;
      }

      if (!canRetainInMemory) {
        setDisplaySrc(source);
      }

      if (!source || !cacheResponse) {
        return;
      }

      if (!cacheKey || typeof window === "undefined" || !("caches" in window)) {
        setDisplaySrc(source);
        return;
      }

      try {
        const cache = await caches.open(MEDIA_CACHE_NAME);
        const request = mediaCacheRequest(cacheKey, source);
        const cached = await cache.match(request);

        if (cached) {
          const blob = await cached.blob();

          if (cancelled) {
            return;
          }

          if (instantCache) {
            void storeInstantMediaCache(cacheKey, blob);
          }

          const objectUrl = URL.createObjectURL(blob);

          objectUrlToRevoke = objectUrl;

          if (canRetainInMemory) {
            retainMediaBlob(cacheIdentity, blob);
          }

          if (!cancelled) {
            setDisplaySrc(objectUrl);
          }

          return;
        }

        const response = await fetch(source, {
          cache: "force-cache",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Media could not be cached.");
        }

        await cache.put(request, response.clone());

        const blob = await response.blob();

        if (cancelled) {
          return;
        }

        if (instantCache) {
          void storeInstantMediaCache(cacheKey, blob);
        }

        const objectUrl = URL.createObjectURL(blob);

        objectUrlToRevoke = objectUrl;

        if (canRetainInMemory) {
          retainMediaBlob(cacheIdentity, blob);
        }

        if (!cancelled) {
          setDisplaySrc(objectUrl);
        }
      } catch {
        if (!cancelled) {
          setDisplaySrc(source);
        }
      }
    }

    void loadImage();

    return () => {
      cancelled = true;
      controller.abort();

      if (objectUrlToRevoke) {
        URL.revokeObjectURL(objectUrlToRevoke);
      }
    };
  }, [cacheIdentity, cacheKey, cacheResponse, canRetainInMemory, instantCache]);

  if (!displaySrc) {
    return (
      <div
        aria-label={alt}
        className={`${className} grid place-items-center bg-[radial-gradient(circle_at_35%_25%,#fffaf3,#e7d8c6)]`}
      >
        <span className="size-5 animate-spin rounded-full border-2 border-[rgba(142,105,56,0.28)] border-t-[var(--champagne-deep)]" />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={displaySrc}
      alt={alt}
      className={className}
      loading={loading}
      fetchPriority={fetchPriority}
      decoding="async"
      onLoad={() => onReady?.()}
      onError={() => onReady?.()}
    />
  );
}
