"use client";

import { useEffect, useState } from "react";

type CachedMediaImageProps = {
  src: string;
  cacheKey?: string;
  alt: string;
  className?: string;
  instantCache?: boolean;
  loading?: "eager" | "lazy";
  onReady?: () => void;
};

const MEDIA_CACHE_NAME = "say-yes-media-v1";
const INSTANT_CACHE_PREFIX = "sayyes.media.instant.";
const INSTANT_CACHE_MAX_BYTES = 650 * 1024;
const INSTANT_CACHE_MAX_DIMENSION = 760;

function mediaCacheRequest(cacheKey: string) {
  return new Request(`/__sayyes-media-cache/${encodeURIComponent(cacheKey)}`);
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
  loading = "lazy",
  onReady,
}: CachedMediaImageProps) {
  const [displaySrc, setDisplaySrc] = useState(() =>
    instantCache ? readInstantMediaCache(cacheKey) : "",
  );

  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";

    async function loadImage() {
      const instantSrc = instantCache ? readInstantMediaCache(cacheKey) : "";

      if (instantSrc) {
        setDisplaySrc(instantSrc);
        return;
      }

      setDisplaySrc("");

      if (!src) {
        return;
      }

      if (!cacheKey || typeof window === "undefined" || !("caches" in window)) {
        setDisplaySrc(src);
        return;
      }

      try {
        const cache = await caches.open(MEDIA_CACHE_NAME);
        const request = mediaCacheRequest(cacheKey);
        const cached = await cache.match(request);

        if (cached) {
          const blob = await cached.blob();

          if (instantCache) {
            void storeInstantMediaCache(cacheKey, blob);
          }

          objectUrl = URL.createObjectURL(blob);

          if (!cancelled) {
            setDisplaySrc(objectUrl);
          }

          return;
        }

        const response = await fetch(src, { cache: "force-cache" });

        if (!response.ok) {
          throw new Error("Media could not be cached.");
        }

        await cache.put(request, response.clone());

        const blob = await response.blob();

        if (instantCache) {
          void storeInstantMediaCache(cacheKey, blob);
        }

        objectUrl = URL.createObjectURL(blob);

        if (!cancelled) {
          setDisplaySrc(objectUrl);
        }
      } catch {
        if (!cancelled) {
          setDisplaySrc(src);
        }
      }
    }

    void loadImage();

    return () => {
      cancelled = true;

      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [cacheKey, instantCache, src]);

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
    <img
      src={displaySrc}
      alt={alt}
      className={className}
      loading={loading}
      decoding="async"
      onLoad={() => onReady?.()}
      onError={() => onReady?.()}
    />
  );
}
