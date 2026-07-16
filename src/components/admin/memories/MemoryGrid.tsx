"use client";

import type { WeddingMedia } from "@/lib/types";
import { Button } from "@/components/shared/Button";
import { BlurFade } from "@/components/shared/BlurFade";
import { MemoryCard } from "@/components/admin/memories/MemoryCard";
import type { AdminCopy, FilterKey, MemoryGridLayout } from "@/components/admin/types";

const STORY_ORIGINAL_IMAGE_MAX_BYTES = 12 * 1024 * 1024;

const memoryGridClasses: Record<MemoryGridLayout, string> = {
  story: "grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4",
  classic: "grid min-w-0 grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5",
  compact: "grid min-w-0 grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-8",
};

type MemoryGridProps = {
  media: WeddingMedia[];
  filter: FilterKey;
  gridLayout: MemoryGridLayout;
  entrySequence: number;
  enteredMediaIds: Set<string>;
  hasMore: boolean;
  loadingMore: boolean;
  onOpen: (item: WeddingMedia) => void;
  onLoadMore: () => void;
  text: AdminCopy;
};

export function MemoryGrid({
  media,
  filter,
  gridLayout,
  entrySequence,
  enteredMediaIds,
  hasMore,
  loadingMore,
  onOpen,
  onLoadMore,
  text,
}: MemoryGridProps) {
  return (
    <div className="relative">
        <div className={memoryGridClasses[gridLayout]}>
          {media.map((item, index) => {
            const matchesFilter = filter === "all" || item.kind === filter;
            const useOriginalImage =
              item.kind === "image" &&
              gridLayout === "story" &&
              item.byteSize <= STORY_ORIGINAL_IMAGE_MAX_BYTES;

            return (
              <BlurFade
                key={item.id}
                replayKey={entrySequence}
                replayOnMount={index >= 4 && !enteredMediaIds.has(item.id)}
                onEntered={() => enteredMediaIds.add(item.id)}
                delay={0.15 + Math.min(index, 10) * 0.05}
                className={matchesFilter ? undefined : "hidden"}
              >
                <MemoryCard
                  item={item}
                  index={index}
                  gridLayout={gridLayout}
                  useOriginalImage={useOriginalImage}
                  onOpen={onOpen}
                  text={text}
                />
              </BlurFade>
            );
          })}
        </div>

      {hasMore ? (
        <div className="mt-5 flex justify-center">
          <Button onClick={onLoadMore} loading={loadingMore} variant="paper">
            {text.loadMore}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
