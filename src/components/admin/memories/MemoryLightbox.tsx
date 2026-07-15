"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  DownloadIcon,
  Mic,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { WeddingMedia } from "@/lib/types";
import { CachedMediaImage } from "@/components/shared/CachedMediaImage";
import { Button, buttonStyles } from "@/components/shared/Button";
import type { AdminCopy } from "@/components/admin/types";
import { useAccessibleDialog } from "@/lib/use-accessible-dialog";

const NATIVE_ARROW_KEY_TARGETS = new Set([
  "AUDIO",
  "VIDEO",
  "INPUT",
  "TEXTAREA",
  "SELECT",
]);

export function shouldHandleLightboxArrow(key: string, targetTagName = "") {
  return (
    (key === "ArrowLeft" || key === "ArrowRight") &&
    !NATIVE_ARROW_KEY_TARGETS.has(targetTagName.toUpperCase())
  );
}

function AdminAudioPlayer({
  media,
  text,
}: {
  media: WeddingMedia;
  text: AdminCopy;
}) {
  const [failedMediaId, setFailedMediaId] = useState<string | null>(null);
  const playbackFailed = failedMediaId === media.id;

  return (
    <div className="grid w-full max-w-xl min-w-0 gap-4 p-5 text-center sm:p-8">
      <Mic className="mx-auto size-10 text-[var(--champagne-deep)]" />
      {playbackFailed ? (
        <div className="rounded-[22px] border border-[var(--line)] bg-white/58 px-4 py-3 text-sm leading-relaxed text-[var(--ink-soft)]">
          {text.audioPlaybackFailed}
        </div>
      ) : (
        <audio
          key={media.id}
          src={media.url}
          controls
          preload="metadata"
          className="w-full min-w-0"
          onError={() => setFailedMediaId(media.id)}
        />
      )}
    </div>
  );
}

type MemoryLightboxProps = {
  selectedMedia: WeddingMedia | null;
  media: WeddingMedia[];
  demoMode: boolean;
  reduceMotion: boolean;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onRequestDelete: (media: WeddingMedia) => void;
  text: AdminCopy;
};

export function MemoryLightbox({
  selectedMedia,
  media,
  demoMode,
  reduceMotion,
  onClose,
  onPrevious,
  onNext,
  onRequestDelete,
  text,
}: MemoryLightboxProps) {
  const lightboxRef = useRef<HTMLDivElement>(null);
  const lightboxCloseRef = useRef<HTMLButtonElement>(null);
  const selectedMediaIndex = selectedMedia
    ? media.findIndex((item) => item.id === selectedMedia.id)
    : -1;

  useAccessibleDialog({
    open: Boolean(selectedMedia),
    containerRef: lightboxRef,
    initialFocusRef: lightboxCloseRef,
    onClose,
  });

  useEffect(() => {
    if (!selectedMedia) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }

      const targetTagName =
        event.target instanceof HTMLElement ? event.target.tagName : "";

      if (!shouldHandleLightboxArrow(event.key, targetTagName)) {
        return;
      }

      event.preventDefault();

      if (event.key === "ArrowLeft") {
        onPrevious();
      }

      if (event.key === "ArrowRight") {
        onNext();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, onNext, onPrevious, selectedMedia]);

  useEffect(() => {
    if (selectedMedia && selectedMediaIndex === -1) {
      onClose();
    }
  }, [onClose, selectedMedia, selectedMediaIndex]);

  return (
    <AnimatePresence>
      {selectedMedia ? (
        <motion.div
          className="fixed inset-0 z-[80] grid place-items-center overflow-x-hidden bg-[rgba(31,23,18,0.62)] px-3 py-4 backdrop-blur-md sm:px-4 sm:py-6"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.18 }}
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label={text.close}
            onClick={onClose}
          />
          <motion.div
            ref={lightboxRef}
            initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.99 }}
            transition={{
              duration: reduceMotion ? 0 : 0.22,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="relative z-10 grid max-h-[calc(100dvh-2rem)] w-full min-w-0 max-w-[calc(100vw-1.5rem)] gap-4 overflow-y-auto overflow-x-hidden rounded-[32px] border border-white/70 bg-[var(--paper-soft)] p-4 shadow-[0_30px_90px_rgba(0,0,0,0.32)] sm:max-w-5xl sm:p-5"
            data-scroll-lock-allow="true"
            data-memory-lightbox="true"
            data-lightbox-media-id={selectedMedia.id}
            role="dialog"
            aria-modal="true"
            aria-labelledby="memory-lightbox-title"
            tabIndex={-1}
          >
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0 flex-1 pr-1">
                <p
                  id="memory-lightbox-title"
                  className="block max-w-full whitespace-pre-wrap text-sm font-bold leading-snug text-[var(--ink)] [overflow-wrap:anywhere]"
                >
                  {selectedMedia.guestName}
                </p>
                <p className="mt-1 block max-w-full whitespace-pre-wrap text-xs leading-relaxed text-[var(--ink-soft)] [overflow-wrap:anywhere]">
                  {selectedMedia.note || text.noNote}
                </p>
              </div>
              <Button
                ref={lightboxCloseRef}
                onClick={onClose}
                variant="paper"
                size="icon"
                className="!size-11 !min-h-11"
                aria-label={text.close}
              >
                <X className="size-4" />
              </Button>
            </div>

            <div className="relative grid min-h-[18rem] w-full min-w-0 max-w-full place-items-center overflow-hidden rounded-[26px] bg-[#eadcca]">
              {selectedMedia.kind === "image" ? (
                <CachedMediaImage
                  key={selectedMedia.id}
                  src={selectedMedia.url}
                  cacheKey={selectedMedia.storagePath ?? selectedMedia.id}
                  alt={selectedMedia.note ?? selectedMedia.fileName}
                  className="max-h-[72dvh] max-w-full object-contain"
                  loading="eager"
                />
              ) : selectedMedia.kind === "video" ? (
                <video
                  key={selectedMedia.id}
                  src={selectedMedia.url}
                  className="max-h-[72dvh] max-w-full rounded-[24px] object-contain"
                  controls
                  playsInline
                  preload="metadata"
                />
              ) : (
                <AdminAudioPlayer media={selectedMedia} text={text} />
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded-[22px] border border-white/70 bg-white/48 p-2 shadow-[0_12px_32px_rgba(58,40,25,0.08)]">
              <p className="rounded-full border border-[var(--line)] bg-[rgba(255,250,243,0.72)] px-3 py-2 text-[0.7rem] font-bold uppercase tracking-[0.14em] text-[var(--champagne-deep)]">
                {selectedMediaIndex + 1} / {media.length}
              </p>
              {media.length > 1 ? (
                <div className="flex items-center gap-2">
                  <Button
                    onClick={onPrevious}
                    variant="paper"
                    size="icon"
                    className="!size-11 !min-h-11"
                    aria-label={text.previousMedia}
                  >
                    <ChevronLeft className="size-5" />
                  </Button>
                  <Button
                    onClick={onNext}
                    variant="paper"
                    size="icon"
                    className="!size-11 !min-h-11"
                    aria-label={text.nextMedia}
                  >
                    <ChevronRight className="size-5" />
                  </Button>
                </div>
              ) : null}
              <div className="ml-auto flex min-w-0 flex-wrap items-center gap-2">
                <a
                  href={
                    demoMode
                      ? selectedMedia.url
                      : `/api/media/${selectedMedia.id}/download`
                  }
                  download={selectedMedia.fileName}
                  data-app-button="ink"
                  className={buttonStyles({
                    variant: "ink",
                    className: "gap-2 whitespace-nowrap",
                  })}
                >
                  <DownloadIcon aria-hidden="true" className="size-4 shrink-0" />
                  {text.download}
                </a>
                <Button
                  onClick={() => onRequestDelete(selectedMedia)}
                  variant="destructive"
                  className="gap-2 whitespace-nowrap"
                >
                  {text.deleteMemory}
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
