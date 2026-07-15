"use client";

import { LayoutGroup, type Transition } from "motion/react";
import type { WeddingMedia } from "@/lib/types";
import { Button } from "@/components/shared/Button";
import { BlurFade } from "@/components/shared/BlurFade";
import { MemoryCard } from "@/components/admin/memories/MemoryCard";
import type { AdminCopy, MemoryGridLayout } from "@/components/admin/types";

const STORY_ORIGINAL_IMAGE_MAX_BYTES = 12 * 1024 * 1024;

const memoryGridClasses: Record<MemoryGridLayout, string> = {
  story: "grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4",
  classic: "grid min-w-0 grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5",
  compact: "grid min-w-0 grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-8",
};

type MemoryGridProps = {
  media: WeddingMedia[];
  gridLayout: MemoryGridLayout;
  entrySequence: number;
  enteredMediaIds: Set<string>;
  demoMode: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  reduceMotion: boolean;
  layoutTransition: Transition;
  onOpen: (item: WeddingMedia) => void;
  onLoadMore: () => void;
  text: AdminCopy;
};

export function MemoryGrid({
  media,
  gridLayout,
  entrySequence,
  enteredMediaIds,
  demoMode,
  hasMore,
  loadingMore,
  reduceMotion,
  layoutTransition,
  onOpen,
  onLoadMore,
  text,
}: MemoryGridProps) {
  return (
    <div className="relative">
      <LayoutGroup id="memory-grid-layout">
        <div className={memoryGridClasses[gridLayout]}>
          {media.map((item, index) => {
            const useOriginalImage =
              item.kind === "image" &&
              ((demoMode && item.url.startsWith("/demo/")) ||
                (gridLayout === "story" &&
                  item.byteSize <= STORY_ORIGINAL_IMAGE_MAX_BYTES));

            return (
              <BlurFade
                key={item.id}
                replayKey={entrySequence}
                replayOnMount={!enteredMediaIds.has(item.id)}
                onEntered={() => enteredMediaIds.add(item.id)}
                delay={0.15 + Math.min(index, 10) * 0.05}
              >
                <MemoryCard
                  item={item}
                  index={index}
                  gridLayout={gridLayout}
                  useOriginalImage={useOriginalImage}
                  layoutTransition={layoutTransition}
                  reduceMotion={reduceMotion}
                  onOpen={onOpen}
                  text={text}
                />
              </BlurFade>
            );
          })}
        </div>
      </LayoutGroup>

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
