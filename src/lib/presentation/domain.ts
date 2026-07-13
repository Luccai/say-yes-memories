import type { Wedding, WeddingMedia } from "@/lib/types";
import type {
  PresentationMediaItem,
  PresentationWedding,
} from "@/lib/presentation/types";

export const PHOTO_DURATION_MS = 3_000;
export const PRESENTATION_PAGE_SIZE = 12;
export const PRESENTATION_PREFETCH_AHEAD = 3;

export type PhotoClock = {
  remainingMs: number;
  deadlineMs: number | null;
};

export function createPhotoClock(
  startedAtMs: number,
  remainingMs = PHOTO_DURATION_MS,
): PhotoClock {
  const safeRemaining = Math.max(0, Math.min(remainingMs, PHOTO_DURATION_MS));
  return {
    remainingMs: safeRemaining,
    deadlineMs: startedAtMs + safeRemaining,
  };
}

export function pausePhotoClock(clock: PhotoClock, nowMs: number): PhotoClock {
  if (clock.deadlineMs === null) {
    return clock;
  }

  return {
    remainingMs: Math.max(0, clock.deadlineMs - nowMs),
    deadlineMs: null,
  };
}

export function chronologicalPresentationMedia<T extends { id: string; createdAt: string }>(
  media: readonly T[],
) {
  return [...media].sort((left, right) =>
    left.createdAt === right.createdAt
      ? left.id.localeCompare(right.id)
      : left.createdAt.localeCompare(right.createdAt),
  );
}

export function mergePresentationMedia(
  existing: readonly PresentationMediaItem[],
  incoming: readonly PresentationMediaItem[],
) {
  const byId = new Map(existing.map((item) => [item.id, item]));
  for (const item of incoming) {
    byId.set(item.id, item);
  }
  return chronologicalPresentationMedia([...byId.values()]);
}

export function previousPresentationIndex(
  index: number,
  mediaCount: number,
  hasMore: boolean,
) {
  if (mediaCount <= 0) return 0;
  if (index > 0) return index - 1;
  return hasMore ? 0 : mediaCount - 1;
}

export function presentationContentUrl(mediaId: string) {
  return `/api/media/${encodeURIComponent(mediaId)}/content`;
}

export function toDemoPresentationMedia(item: WeddingMedia): PresentationMediaItem {
  return {
    id: item.id,
    kind: item.kind,
    mimeType: item.mimeType,
    fileName: item.fileName,
    byteSize: item.byteSize,
    createdAt: item.createdAt,
    guestName: item.guestName,
    note: item.note,
    contentUrl: item.url,
  };
}

export function toPresentationWedding(
  wedding: Wedding,
  options: { demo: boolean },
): PresentationWedding {
  const profileMedia = wedding.profileMedia
    ? {
        id: wedding.profileMedia.id,
        url: options.demo
          ? wedding.profileMedia.url
          : presentationContentUrl(wedding.profileMedia.id),
        kind: wedding.profileMedia.kind,
        mimeType: wedding.profileMedia.mimeType,
        fileName: wedding.profileMedia.fileName,
        byteSize: wedding.profileMedia.byteSize,
        createdAt: wedding.profileMedia.createdAt,
      }
    : undefined;

  return {
    id: wedding.id,
    slug: wedding.slug,
    coupleName: wedding.coupleName,
    eventDate: wedding.eventDate,
    profileMedia,
  };
}

export function presentationShortcutTargetIsInteractive(input: {
  tagName?: string;
  role?: string | null;
  isContentEditable?: boolean;
}) {
  const tagName = input.tagName?.toUpperCase();
  return (
    input.isContentEditable === true ||
    input.role === "button" ||
    input.role === "link" ||
    tagName === "A" ||
    tagName === "BUTTON" ||
    tagName === "INPUT" ||
    tagName === "SELECT" ||
    tagName === "TEXTAREA" ||
    tagName === "AUDIO" ||
    tagName === "VIDEO"
  );
}
