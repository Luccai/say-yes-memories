"use client";

import { useEffect, useRef, useState } from "react";
import { Film, Image as ImageIcon, Mic, Play } from "lucide-react";
import { AnimatePresence, motion, type Transition } from "motion/react";
import type { StoredMediaObject, WeddingMedia } from "@/lib/types";
import {
  CachedMediaImage,
  hasRetainedMediaSource,
} from "@/components/shared/CachedMediaImage";
import type { AdminCopy, MemoryGridLayout } from "@/components/admin/types";

const memoryCardClasses: Record<MemoryGridLayout, string> = {
  story:
    "rounded-[28px] p-2 shadow-none sm:shadow-[0_16px_36px_rgba(58,40,25,0.09)] sm:hover:shadow-[0_20px_46px_rgba(58,40,25,0.13)]",
  classic:
    "rounded-[22px] p-1.5 shadow-none sm:shadow-[0_14px_34px_rgba(58,40,25,0.08)] sm:hover:shadow-[0_18px_42px_rgba(58,40,25,0.12)]",
  compact:
    "rounded-[18px] p-1 shadow-none sm:shadow-[0_10px_24px_rgba(58,40,25,0.07)] sm:hover:shadow-[0_14px_30px_rgba(58,40,25,0.1)]",
};

const memoryMediaFrameClasses: Record<MemoryGridLayout, string> = {
  story: "aspect-[4/3] rounded-[23px]",
  classic: "aspect-square rounded-[17px]",
  compact: "aspect-square rounded-[14px]",
};

function GalleryThumbnailImage({
  thumbnail,
  alt,
  priority,
}: {
  thumbnail: StoredMediaObject;
  alt: string;
  priority: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(() =>
    priority || hasRetainedMediaSource(thumbnail.storagePath ?? thumbnail.id, thumbnail.url),
  );

  useEffect(() => {
    if (visible || !containerRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "80px 0px" },
    );
    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, [visible]);

  return (
    <div ref={containerRef} className="h-full w-full">
      {visible ? (
        <CachedMediaImage
          src={thumbnail.url}
          cacheKey={thumbnail.storagePath ?? thumbnail.id}
          alt={alt}
          className="h-full w-full object-cover"
          retainInMemory
          cacheByteSize={thumbnail.byteSize}
          cacheResponse={thumbnail.byteSize <= 1024 * 1024}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
        />
      ) : (
        <div className="h-full w-full bg-[radial-gradient(circle_at_30%_18%,#fffaf3,#eadcca)]" />
      )}
    </div>
  );
}

function galleryThumbnailFor(item: WeddingMedia, useOriginalImage = false) {
  if (item.thumbnail && !(useOriginalImage && item.kind === "image")) {
    return item.thumbnail;
  }

  if (item.kind === "image" || item.url.startsWith("data:image/")) {
    return {
      id: `${item.id}-inline-thumbnail`,
      url: item.url,
      kind: "image" as const,
      mimeType: item.mimeType,
      fileName: item.fileName,
      byteSize: item.byteSize,
      createdAt: item.createdAt,
    };
  }

  return undefined;
}

type MemoryCardProps = {
  item: WeddingMedia;
  index: number;
  gridLayout: MemoryGridLayout;
  useOriginalImage: boolean;
  layoutTransition: Transition;
  reduceMotion: boolean;
  onOpen: (item: WeddingMedia) => void;
  text: AdminCopy;
};

export function MemoryCard({
  item,
  index,
  gridLayout,
  useOriginalImage,
  layoutTransition,
  reduceMotion,
  onOpen,
  text,
}: MemoryCardProps) {
  const thumbnail = galleryThumbnailFor(item, useOriginalImage);

  return (
    <motion.button
      layout="position"
      transition={{ layout: layoutTransition }}
      whileHover={reduceMotion ? undefined : { y: -2 }}
      whileTap={reduceMotion ? undefined : { scale: 0.985 }}
      type="button"
      data-memory-id={item.id}
      aria-label={`${item.guestName}. ${item.note || text.noNote}`}
      onClick={() => onOpen(item)}
      className={`focus-ring group w-full min-w-0 max-w-full overflow-hidden border border-[var(--line)] bg-white/60 text-left hover:bg-white ${memoryCardClasses[gridLayout]}`}
    >
      <div
        className={`relative w-full min-w-0 max-w-full overflow-hidden bg-[#ede1d3] ${memoryMediaFrameClasses[gridLayout]}`}
      >
        {item.kind === "image" || item.kind === "video" ? (
          thumbnail ? (
            <GalleryThumbnailImage
              thumbnail={thumbnail}
              alt={item.note ?? item.fileName}
              priority={index === 0}
            />
          ) : item.kind === "video" ? (
            <video
              src={item.url}
              className="h-full w-full object-cover"
              muted
              playsInline
              preload="metadata"
            />
          ) : (
            <div className="grid h-full place-items-center bg-[radial-gradient(circle_at_30%_18%,#fffaf3,#eadcca)] p-4 text-[var(--champagne-deep)]">
              <ImageIcon className="size-8" />
            </div>
          )
        ) : (
          <div className="grid h-full place-items-center bg-[#eadcca] p-4 text-[var(--champagne-deep)]">
            <Mic className={gridLayout === "compact" ? "size-6" : "size-8"} />
          </div>
        )}

        {item.kind === "video" ? (
          <div className="absolute inset-0 grid place-items-center bg-black/18">
            <div className="grid size-10 place-items-center rounded-full bg-[var(--paper-soft)] text-[var(--ink)] shadow-[0_16px_36px_rgba(0,0,0,0.2)]">
              <Play className="ml-0.5 size-4 fill-current" />
            </div>
          </div>
        ) : null}

        <div
          className={`absolute left-2 top-2 grid place-items-center rounded-full bg-[rgba(255,250,243,0.86)] text-[var(--ink)] shadow-[0_10px_24px_rgba(31,23,18,0.14)] backdrop-blur ${
            gridLayout === "compact" ? "size-6" : "size-7"
          }`}
        >
          {item.kind === "image" ? (
            <ImageIcon className={gridLayout === "compact" ? "size-3" : "size-3.5"} />
          ) : item.kind === "video" ? (
            <Film className={gridLayout === "compact" ? "size-3" : "size-3.5"} />
          ) : (
            <Mic className={gridLayout === "compact" ? "size-3" : "size-3.5"} />
          )}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {gridLayout !== "compact" ? (
          <motion.div
            key="memory-caption"
            layout
            initial={reduceMotion ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reduceMotion ? undefined : { opacity: 0, height: 0 }}
            transition={layoutTransition}
            className="overflow-hidden px-1 pb-1 pt-2"
          >
            <p
              className={`block max-w-full truncate font-bold text-[var(--ink)] ${
                gridLayout === "story" ? "text-sm" : "text-xs"
              }`}
            >
              {item.guestName}
            </p>
            <p
              className={`block max-w-full text-[var(--ink-soft)] ${
                gridLayout === "story"
                  ? "mt-1 line-clamp-2 min-h-[2.3rem] text-sm leading-snug"
                  : "truncate text-xs"
              }`}
            >
              {item.note || text.noNote}
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.button>
  );
}
