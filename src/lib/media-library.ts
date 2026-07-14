import type { MediaKind } from "@/lib/types";

export type MediaLibraryKey = "all" | MediaKind;
export type MediaLibraryOrder = "newest" | "oldest";
export type MediaLibraryCounts = Record<MediaLibraryKey, number>;

export const EMPTY_MEDIA_LIBRARY_COUNTS: MediaLibraryCounts = {
  all: 0,
  image: 0,
  video: 0,
  audio: 0,
};

export function countMediaLibrary<T extends { kind: MediaKind }>(
  items: readonly T[],
): MediaLibraryCounts {
  const counts = { ...EMPTY_MEDIA_LIBRARY_COUNTS };

  for (const item of items) {
    counts.all += 1;
    counts[item.kind] += 1;
  }

  return counts;
}

export function sortMediaLibrary<T extends { id: string; createdAt: string }>(
  items: readonly T[],
  order: MediaLibraryOrder,
) {
  return [...items].sort((left, right) => {
    const comparison = left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
    return order === "oldest" ? comparison : -comparison;
  });
}
