"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/shared/Button";
import { MediaOrb } from "@/components/shared/MediaOrb";
import { useCopy, useLocale } from "@/lib/i18n-client";
import {
  PHOTO_DURATION_MS,
  PRESENTATION_PREFETCH_AHEAD,
  chronologicalPresentationMedia,
  createPhotoClock,
  mergePresentationMedia,
  pausePhotoClock,
  presentationVisualMedia,
  presentationShortcutTargetIsInteractive,
  previousPresentationIndex,
  toDemoPresentationMedia,
} from "@/lib/presentation/domain";
import type {
  PhotoClock,
} from "@/lib/presentation/domain";
import type {
  PresentationMediaItem,
  PresentationMediaPage,
  PresentationWedding,
} from "@/lib/presentation/types";
import type { WeddingMedia } from "@/lib/types";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";

type PresentationExperienceProps = {
  wedding: PresentationWedding;
  initialMedia: PresentationMediaItem[];
  initialHasMore?: boolean;
  initialNextCursor?: string | null;
  initialTotal: number;
  demoMode?: boolean;
};

type PageLoadResult = {
  added: number;
  failed: boolean;
};

const DEMO_MEDIA_STORAGE_KEY = "sayyes.demo.media";
const DEMO_SESSION_MEDIA_PREFIX = "demo-session-";
const PRESENTATION_TRANSITION_SECONDS = 0.32;

function fillTemplate(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (current, [key, value]) => current.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

function keyboardTargetIsInteractive(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  const interactive = target.closest<HTMLElement>(
    "a,button,input,select,textarea,audio,video,[role='button'],[role='link'],[contenteditable='true']",
  );
  if (!interactive) return false;
  return presentationShortcutTargetIsInteractive({
    tagName: interactive.tagName,
    role: interactive.getAttribute("role"),
    isContentEditable: interactive.isContentEditable,
  });
}

function demoSessionObjectUrls(media: readonly PresentationMediaItem[]) {
  return media
    .filter(
      (item) =>
        item.id.startsWith(DEMO_SESSION_MEDIA_PREFIX) &&
        item.contentUrl.startsWith("blob:"),
    )
    .map((item) => item.contentUrl);
}

function preloadCandidates(
  media: readonly PresentationMediaItem[],
  currentIndex: number,
  count: number,
  hasMore: boolean,
) {
  const candidates: PresentationMediaItem[] = [];
  for (let distance = 1; distance <= count; distance += 1) {
    let candidateIndex = currentIndex + distance;
    if (candidateIndex >= media.length) {
      if (hasMore || media.length === 0) break;
      candidateIndex %= media.length;
    }
    const candidate = media[candidateIndex];
    if (candidate && !candidates.some((item) => item.id === candidate.id)) {
      candidates.push(candidate);
    }
  }
  return candidates;
}

export function PresentationExperience({
  wedding,
  initialMedia,
  initialHasMore = false,
  initialNextCursor = null,
  initialTotal,
  demoMode = false,
}: PresentationExperienceProps) {
  const locale = useLocale();
  const text = useCopy().admin;
  const reduceMotion = useReducedMotion();
  const initialCatalog = useMemo<PresentationMediaItem[]>(
    () => chronologicalPresentationMedia(presentationVisualMedia(initialMedia)),
    [initialMedia],
  );
  const [media, setMedia] = useState(initialCatalog);
  const mediaRef = useRef(initialCatalog);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const [playbackRevision, setPlaybackRevision] = useState(0);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(true);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const hasMoreRef = useRef(initialHasMore);
  const nextCursorRef = useRef(initialNextCursor);
  const [total, setTotal] = useState(Math.max(initialTotal, initialCatalog.length));
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageLoadError, setPageLoadError] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenSupported, setFullscreenSupported] = useState(false);
  const [fullscreenError, setFullscreenError] = useState(false);
  const [playbackError, setPlaybackError] = useState(false);
  const playerRef = useRef<HTMLMediaElement | null>(null);
  const stageRef = useRef<HTMLElement | null>(null);
  const loadPromiseRef = useRef<Promise<PageLoadResult> | null>(null);
  const photoClockRef = useRef<PhotoClock>({
    remainingMs: PHOTO_DURATION_MS,
    deadlineMs: null,
  });
  const current = media[index] ?? null;
  const currentId = current?.id;
  const currentKind = current?.kind;
  const backUrl = demoMode ? `/admin/${wedding.slug}` : "/admin";

  useBodyScrollLock(true);

  const replaceCatalog = useCallback((nextCatalog: PresentationMediaItem[]) => {
    const next = chronologicalPresentationMedia(presentationVisualMedia(nextCatalog));
    const currentId = mediaRef.current[indexRef.current]?.id;
    mediaRef.current = next;
    setMedia(next);
    setTotal(next.length);
    hasMoreRef.current = false;
    setHasMore(false);
    nextCursorRef.current = null;

    const preservedIndex = currentId
      ? next.findIndex((item) => item.id === currentId)
      : -1;
    const nextIndex =
      preservedIndex >= 0
        ? preservedIndex
        : Math.min(indexRef.current, Math.max(next.length - 1, 0));
    if (nextIndex !== indexRef.current) {
      indexRef.current = nextIndex;
      setIndex(nextIndex);
      photoClockRef.current = {
        remainingMs: PHOTO_DURATION_MS,
        deadlineMs: null,
      };
      setPlaybackRevision((value) => value + 1);
    }
  }, []);

  const selectIndex = useCallback((nextIndex: number) => {
    const maxIndex = Math.max(mediaRef.current.length - 1, 0);
    const boundedIndex = Math.min(Math.max(nextIndex, 0), maxIndex);
    indexRef.current = boundedIndex;
    setIndex(boundedIndex);
    setPlaybackError(false);
    photoClockRef.current = {
      remainingMs: PHOTO_DURATION_MS,
      deadlineMs: null,
    };
    setPlaybackRevision((value) => value + 1);
  }, []);

  const loadMore = useCallback((): Promise<PageLoadResult> => {
    if (demoMode || !hasMoreRef.current || !nextCursorRef.current) {
      return Promise.resolve({ added: 0, failed: false });
    }
    if (loadPromiseRef.current) return loadPromiseRef.current;

    setLoadingMore(true);
    setPageLoadError(false);
    const cursor = nextCursorRef.current;
    const request = fetch(
      `/api/weddings/current/presentation-media?cursor=${encodeURIComponent(cursor)}`,
      { cache: "no-store" },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error("PRESENTATION_PAGE_FAILED");
        const payload = (await response.json()) as PresentationMediaPage;
        if (
          !Array.isArray(payload.media) ||
          typeof payload.hasMore !== "boolean" ||
          typeof payload.total !== "number" ||
          (payload.hasMore && !payload.nextCursor)
        ) {
          throw new Error("PRESENTATION_PAGE_INVALID");
        }

        const previousLength = mediaRef.current.length;
        const next = mergePresentationMedia(
          mediaRef.current,
          presentationVisualMedia(payload.media),
        );
        mediaRef.current = next;
        setMedia(next);
        setTotal(Math.max(payload.total, next.length));
        hasMoreRef.current = payload.hasMore;
        setHasMore(payload.hasMore);
        nextCursorRef.current = payload.nextCursor;
        return { added: next.length - previousLength, failed: false };
      })
      .catch(() => {
        setPageLoadError(true);
        return { added: 0, failed: true };
      })
      .finally(() => {
        setLoadingMore(false);
        loadPromiseRef.current = null;
      });

    loadPromiseRef.current = request;
    return request;
  }, [demoMode]);

  const showPrevious = useCallback(() => {
    setPlaybackError(false);
    selectIndex(
      previousPresentationIndex(
        indexRef.current,
        mediaRef.current.length,
        hasMoreRef.current,
      ),
    );
  }, [selectIndex]);

  const showNext = useCallback(async () => {
    setPlaybackError(false);
    const currentIndex = indexRef.current;
    if (currentIndex < mediaRef.current.length - 1) {
      selectIndex(currentIndex + 1);
      return;
    }

    if (hasMoreRef.current) {
      const result = await loadMore();
      if (currentIndex < mediaRef.current.length - 1) {
        selectIndex(currentIndex + 1);
        return;
      }
      if (result.failed) {
        setPaused(true);
        return;
      }
    }

    selectIndex(0);
  }, [loadMore, selectIndex]);

  useEffect(() => {
    if (hasMore && index >= Math.max(media.length - 4, 0)) {
      void loadMore();
    }
  }, [hasMore, index, loadMore, media.length]);

  useEffect(() => {
    if (!started || paused || !currentId || currentKind !== "image") return;

    const runningClock = createPhotoClock(
      performance.now(),
      photoClockRef.current.remainingMs,
    );
    photoClockRef.current = runningClock;
    const timer = window.setTimeout(
      () => void showNext(),
      runningClock.remainingMs,
    );

    return () => {
      window.clearTimeout(timer);
      if (photoClockRef.current === runningClock) {
        photoClockRef.current = pausePhotoClock(runningClock, performance.now());
      }
    };
  }, [currentId, currentKind, paused, playbackRevision, showNext, started]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !started || currentKind === "image") return;
    if (paused) {
      player.pause();
      return;
    }
    void player.play().catch(() => {
      setPaused(true);
      setPlaybackError(true);
    });
  }, [currentId, currentKind, paused, playbackRevision, started]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) setPaused(true);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  useEffect(() => {
    if (!currentId) return;
    const connection = (
      navigator as Navigator & {
        connection?: { saveData?: boolean; effectiveType?: string };
      }
    ).connection;
    const constrained =
      connection?.saveData === true ||
      connection?.effectiveType === "slow-2g" ||
      connection?.effectiveType === "2g";
    const candidates = preloadCandidates(
      media,
      index,
      constrained ? 1 : PRESENTATION_PREFETCH_AHEAD,
      hasMore,
    );
    const preloaders: Array<HTMLImageElement | HTMLMediaElement> = [];

    for (const item of candidates) {
      if (item.kind === "image") {
        const image = new Image();
        image.decoding = "async";
        image.src = item.contentUrl;
        void image.decode().catch(() => undefined);
        preloaders.push(image);
      } else {
        const player = document.createElement(item.kind === "video" ? "video" : "audio");
        player.preload = "metadata";
        player.src = item.contentUrl;
        player.load();
        preloaders.push(player);
      }
    }

    return () => {
      for (const preloader of preloaders) {
        if (preloader instanceof HTMLMediaElement) {
          preloader.removeAttribute("src");
          preloader.load();
        } else {
          preloader.src = "";
        }
      }
    };
  }, [currentId, hasMore, index, media]);

  useEffect(() => {
    if (!demoMode) return;
    let active = true;
    let unsubscribe: () => void = () => undefined;

    async function startDemoSync() {
      const [demoContent, demoSession] = await Promise.all([
        import("@/lib/demo-content"),
        import("@/lib/demo-session-media"),
      ]);
      demoContent.ensureFreshDemoLocalState();

      const sync = async () => {
        let storedMedia: WeddingMedia[] | null = null;
        try {
          const stored = window.localStorage.getItem(DEMO_MEDIA_STORAGE_KEY);
          storedMedia = stored ? (JSON.parse(stored) as WeddingMedia[]) : null;
        } catch {
          storedMedia = null;
        }

        const baseMedia = presentationVisualMedia(
          (storedMedia ?? demoContent.demoMedia).filter(
            (item) => !demoSession.isDemoSessionMedia(item.id),
          ),
        );
        const sessionMedia = presentationVisualMedia(
          await demoSession.getDemoSessionMedia(),
        );
        if (!active) {
          for (const item of sessionMedia) {
            if (item.url.startsWith("blob:")) URL.revokeObjectURL(item.url);
            if (item.thumbnail?.url.startsWith("blob:")) {
              URL.revokeObjectURL(item.thumbnail.url);
            }
          }
          return;
        }

        for (const item of sessionMedia) {
          if (item.thumbnail?.url.startsWith("blob:")) {
            URL.revokeObjectURL(item.thumbnail.url);
          }
        }
        replaceCatalog([
          ...demoContent.localizeDemoMedia(baseMedia, locale).map(toDemoPresentationMedia),
          ...sessionMedia.map(toDemoPresentationMedia),
        ]);
      };

      await sync();
      if (!active) return;
      unsubscribe = demoSession.subscribeDemoSessionMedia(() => void sync());
    }

    void startDemoSync();
    return () => {
      active = false;
      unsubscribe();
    };
  }, [demoMode, locale, replaceCatalog]);

  useEffect(() => {
    if (!demoMode) return;
    const urls = demoSessionObjectUrls(media);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [demoMode, media]);

  const togglePaused = useCallback(() => {
    if (!started) {
      setStarted(true);
      setPaused(false);
      return;
    }
    setPaused((value) => !value);
  }, [started]);

  useEffect(() => {
    if (!started) return;
    const frame = window.requestAnimationFrame(() => {
      stageRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [started]);

  useEffect(() => {
    setFullscreenSupported(
      Boolean(document.fullscreenEnabled && stageRef.current?.requestFullscreen),
    );
  }, []);

  const toggleFullscreen = useCallback(async () => {
    setFullscreenError(false);
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (document.fullscreenEnabled && stageRef.current?.requestFullscreen) {
        await stageRef.current.requestFullscreen({ navigationUI: "hide" });
      } else {
        setFullscreenError(true);
      }
    } catch {
      setFullscreenError(true);
    } finally {
      window.requestAnimationFrame(() => {
        stageRef.current?.focus({ preventScroll: true });
      });
    }
  }, []);

  useEffect(() => {
    const onFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    const onKeyDown = (event: KeyboardEvent) => {
      if (keyboardTargetIsInteractive(event.target)) return;

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        showPrevious();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        void showNext();
      } else if (
        !event.repeat &&
        (event.code === "Space" || event.key.toLowerCase() === "k")
      ) {
        event.preventDefault();
        togglePaused();
      } else if (!event.repeat && event.key.toLowerCase() === "f") {
        event.preventDefault();
        void toggleFullscreen();
      }
    };
    document.addEventListener("fullscreenchange", onFullscreen);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreen);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [showNext, showPrevious, toggleFullscreen, togglePaused]);

  const retryPlayback = useCallback(() => {
    setPlaybackError(false);
    photoClockRef.current = {
      remainingMs: PHOTO_DURATION_MS,
      deadlineMs: null,
    };
    setPlaybackRevision((value) => value + 1);
    if (started) setPaused(false);
  }, [started]);

  const totalCount = Math.max(total, media.length);
  const counter = useMemo(
    () =>
      fillTemplate(text.presentationCounter, {
        current: media.length ? index + 1 : 0,
        total: totalCount,
      }),
    [index, media.length, text.presentationCounter, totalCount],
  );
  const kindLabel = current
    ? current.kind === "image"
      ? text.presentationKindPhoto
      : text.presentationKindVideo
    : "";
  const liveStatus = current
    ? fillTemplate(text.presentationStatus, {
        current: index + 1,
        total: totalCount,
        kind: kindLabel,
        guest: current.guestName,
      })
    : text.presentationEmpty;

  if (!current) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-[#17110e] p-5 text-[var(--paper-soft)]">
        <section className="max-w-lg text-center">
          <MediaOrb
            media={wedding.profileMedia}
            label={wedding.coupleName}
            className="mx-auto h-32 w-24"
          />
          <h1 className="mt-7 font-display text-4xl font-semibold">
            {text.presentationEmpty}
          </h1>
          <p className="mt-3 text-sm leading-6 text-white/65">
            {text.presentationEmptyBody}
          </p>
          <Link
            href={backUrl}
            prefetch={false}
            className="focus-ring mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-5 text-sm font-extrabold text-white hover:bg-white/16"
          >
            <ArrowLeft className="size-4" />
            {text.presentationBack}
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main
      ref={stageRef}
      tabIndex={-1}
      className="relative grid h-[100dvh] min-h-0 w-full touch-manipulation select-none place-items-center overflow-hidden bg-[#17110e] text-white"
      onClick={(event) => {
        if (event.target instanceof Element && event.target.closest("[data-presentation-interactive]")) {
          return;
        }
        togglePaused();
      }}
      aria-describedby="presentation-keyboard-instructions"
      aria-busy={loadingMore || undefined}
    >
      <p id="presentation-keyboard-instructions" className="sr-only">
        {text.presentationInstructions}
      </p>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {liveStatus}
      </p>

      <AnimatePresence mode="wait" initial={false}>
        <motion.section
          key={`${current.id}:${playbackRevision}`}
          initial={reduceMotion ? false : { opacity: 0, scale: 1.01 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={reduceMotion ? undefined : { opacity: 0, scale: 0.995 }}
          transition={{
            duration: reduceMotion ? 0 : PRESENTATION_TRANSITION_SECONDS,
            ease: "easeOut",
          }}
          className="absolute inset-0 grid place-items-center overflow-hidden bg-black"
          data-presentation-media-id={current.id}
        >
          {current.kind === "image" ? (
            <>
              {/* A softened copy fills portrait photo side space without cropping the memory. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={current.contentUrl}
                alt=""
                aria-hidden="true"
                className="absolute inset-[-5%] h-[110%] w-[110%] scale-110 object-cover opacity-45 blur-3xl"
              />
              <div className="absolute inset-0 bg-black/28" />
              {/* Full-size memories deliberately bypass Cache API/blob buffering. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={current.contentUrl}
                alt={current.note ?? current.fileName}
                className="relative z-10 h-full w-full object-contain"
                decoding="async"
                fetchPriority="high"
                onError={() => {
                  setPaused(true);
                  setPlaybackError(true);
                }}
              />
            </>
          ) : current.kind === "video" ? (
            <video
              ref={(node) => {
                playerRef.current = node;
              }}
              src={current.contentUrl}
              className="h-full w-full object-contain"
              playsInline
              preload="metadata"
              onEnded={() => void showNext()}
              onError={() => {
                setPaused(true);
                setPlaybackError(true);
              }}
            />
          ) : null}
        </motion.section>
      </AnimatePresence>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/80 via-black/20 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-28 sm:px-6">
        <div className="mx-auto flex min-h-16 max-w-6xl items-end justify-between gap-4">
          <div
            data-presentation-caption="stable"
            className="relative h-16 min-w-0 flex-1 overflow-hidden"
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`caption-${current.id}`}
                data-presentation-caption-media-id={current.id}
                className="absolute inset-0 grid grid-rows-[1.25rem_2.5rem] content-end"
                initial={reduceMotion ? false : { opacity: 0, y: 7 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -5 }}
                transition={{
                  duration: reduceMotion ? 0 : PRESENTATION_TRANSITION_SECONDS,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                <p className="truncate text-sm font-extrabold">{current.guestName}</p>
                <p className="line-clamp-2 h-10 max-w-xl text-xs leading-5 text-white/65">
                  {current.note || text.noNote}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>
          <p className="shrink-0 rounded-full border border-white/15 bg-black/30 px-3 py-2 text-xs font-bold tabular-nums backdrop-blur">
            {counter}
          </p>
        </div>
      </div>

      <AnimatePresence>
        {!started ? (
        <motion.div
          className="absolute inset-0 z-20 grid place-items-center bg-black/42 px-5 backdrop-blur-sm"
          data-presentation-interactive="true"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.22 }}
        >
          <motion.section
            className="max-w-md text-center"
            initial={reduceMotion ? false : { opacity: 0, y: 14, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -8, scale: 0.99 }}
          >
            <MediaOrb
              media={wedding.profileMedia}
              label={wedding.coupleName}
              className="mx-auto h-36 w-28"
            />
            <p className="mt-6 eyebrow text-[#d5b276]">{wedding.coupleName}</p>
            <h1 className="mt-3 font-display text-4xl font-semibold sm:text-5xl">
              {text.presentationTitle}
            </h1>
            <Button className="mt-7" onClick={togglePaused} autoFocus>
              <Play className="size-4 fill-current" />
              {text.presentationStart}
            </Button>
          </motion.section>
        </motion.div>
        ) : null}
      </AnimatePresence>

      <nav
        className="absolute left-1/2 top-[max(1rem,env(safe-area-inset-top))] z-30 flex max-w-[calc(100vw-1rem)] -translate-x-1/2 items-center gap-2 rounded-full border border-white/14 bg-black/42 p-1.5 shadow-[0_18px_60px_rgba(0,0,0,0.28)] backdrop-blur-xl"
        aria-label={text.presentationControls}
        data-presentation-interactive="true"
      >
        <Link
          href={backUrl}
          prefetch={false}
          className="focus-ring grid size-11 place-items-center rounded-full text-white/75 hover:bg-white/12 hover:text-white"
          aria-label={text.presentationBack}
        >
          <ArrowLeft className="size-4" />
        </Link>
        <Button
          variant="quiet"
          className="!min-h-11 !size-11 !p-0 !text-white"
          onClick={showPrevious}
          aria-label={text.previousMedia}
          aria-keyshortcuts="ArrowLeft"
        >
          <ChevronLeft className="size-5" />
        </Button>
        <Button
          variant="paper"
          className="!min-h-11 min-w-28 !border-white/15 !bg-white/10 !px-4 !py-0 !text-white hover:!bg-white/16"
          onClick={togglePaused}
          aria-keyshortcuts="Space K"
        >
          {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
          {paused ? text.presentationResume : text.presentationPause}
        </Button>
        <Button
          variant="quiet"
          className="!min-h-11 !size-11 !p-0 !text-white"
          onClick={() => void showNext()}
          aria-label={text.nextMedia}
          aria-keyshortcuts="ArrowRight"
          loading={loadingMore}
        >
          {!loadingMore ? <ChevronRight className="size-5" /> : null}
        </Button>
        <Button
          variant="quiet"
          className="!hidden !min-h-11 !size-11 !p-0 !text-white md:!inline-flex"
          onClick={() => void toggleFullscreen()}
          aria-label={
            fullscreen
              ? text.presentationExitFullscreen
              : fullscreenSupported
                ? text.presentationFullscreen
                : text.presentationFullscreenUnavailable
          }
          aria-keyshortcuts="F"
          disabled={!fullscreenSupported}
        >
          {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </Button>
      </nav>

      {pageLoadError ? (
        <div
          className="absolute inset-x-4 top-24 z-30 mx-auto max-w-md rounded-[24px] border border-white/15 bg-black/65 p-4 text-center backdrop-blur-xl"
          data-presentation-interactive="true"
          role="alert"
        >
          <p className="text-sm font-bold">{text.presentationLoadFailed}</p>
          <Button
            variant="paper"
            className="mt-3 !border-white/15 !bg-white/10 !text-white"
            onClick={() => void loadMore()}
            loading={loadingMore}
          >
            <RotateCcw className="size-4" />
            {text.presentationRetry}
          </Button>
        </div>
      ) : null}

      {playbackError ? (
        <div
          className="absolute inset-x-4 top-24 z-30 mx-auto max-w-md rounded-[24px] border border-white/15 bg-black/65 p-4 text-center backdrop-blur-xl"
          data-presentation-interactive="true"
          role="alert"
        >
          <p className="text-sm font-bold">{text.presentationPlaybackFailed}</p>
          <div className="mt-3 flex justify-center gap-2">
            <Button
              variant="paper"
              className="!border-white/15 !bg-white/10 !text-white"
              onClick={retryPlayback}
            >
              <RotateCcw className="size-4" />
              {text.presentationRetry}
            </Button>
            <Button
              variant="paper"
              className="!border-white/15 !bg-white/10 !text-white"
              onClick={() => void showNext()}
            >
              {text.presentationSkip}
            </Button>
          </div>
        </div>
      ) : null}

      {fullscreenError ? (
        <p
          className="absolute bottom-24 left-1/2 z-30 -translate-x-1/2 rounded-full border border-white/15 bg-black/65 px-4 py-2 text-xs font-bold backdrop-blur-xl"
          role="status"
        >
          {text.presentationFullscreenUnavailable}
        </p>
      ) : null}
    </main>
  );
}
