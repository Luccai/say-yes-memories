"use client";

import { CachedMediaImage } from "@/components/shared/CachedMediaImage";
import type { StoredMediaObject } from "@/lib/types";

type MediaOrbProps = {
  media?: StoredMediaObject;
  label: string;
  className?: string;
  priority?: boolean;
};

export function MediaOrb({ media, label, className = "", priority = true }: MediaOrbProps) {
  const initials = label
    .split(/\s+|&/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <div
      className={`relative isolate overflow-hidden rounded-[999px] border border-white/70 bg-[var(--paper-soft)] shadow-none [container-type:inline-size] sm:shadow-[0_18px_45px_rgba(58,40,25,0.18)] ${className}`}
    >
      {media?.kind === "image" && media.url.startsWith("/demo/") ? (
        // Static demo art is already a tiny WebP; direct loading avoids a
        // client-side Cache API/blob round trip on the first paint.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={media.url}
          alt={label}
          className="h-full w-full object-cover"
          loading="eager"
          decoding="async"
          fetchPriority={priority ? "high" : "low"}
        />
      ) : media?.kind === "image" ? (
        <CachedMediaImage
          src={media.url}
          cacheKey={media.storagePath ?? media.id}
          alt={label}
          className="h-full w-full object-cover"
          instantCache
        />
      ) : (
        <div className="grid h-full w-full place-items-center bg-[radial-gradient(circle_at_35%_25%,#fffaf3,#e7d8c6)]">
          <span className="font-display text-[clamp(1.75rem,7cqi,2.75rem)] font-semibold tracking-tight text-[var(--champagne-deep)]">
            {initials || "SY"}
          </span>
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 rounded-[999px] ring-1 ring-inset ring-white/80" />
    </div>
  );
}
