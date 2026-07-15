"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  CalendarDays,
  Check,
  ChevronsUpDown,
  LayoutGrid,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { WeddingMedia } from "@/lib/types";
import type { MediaLibraryCounts, MediaLibraryOrder } from "@/lib/media-library";
import { Button } from "@/components/shared/Button";
import { MemoryGrid } from "@/components/admin/memories/MemoryGrid";
import { MemoryLightbox } from "@/components/admin/memories/MemoryLightbox";
import { DeleteMemoryDialog } from "@/components/admin/memories/DeleteMemoryDialog";
import type {
  AdminCopy,
  FilterKey,
  MemoryGridLayout,
} from "@/components/admin/types";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";

function MemoryControlMenu<T extends string>({
  label,
  value,
  options,
  icon: Icon,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  icon: typeof LayoutGrid;
  onChange: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = options[selectedIndex] ?? options[0];

  const closeMenu = useCallback((restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) {
      queueMicrotask(() => triggerRef.current?.focus({ preventScroll: true }));
    }
  }, []);

  useEffect(() => {
    if (!open) return;

    queueMicrotask(() => {
      const menuItems = Array.from(
        menuRef.current?.querySelectorAll<HTMLButtonElement>("[role='menuitemradio']") ?? [],
      );
      menuItems[Math.max(0, selectedIndex)]?.focus({ preventScroll: true });
    });

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        closeMenu();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu(true);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [closeMenu, open, selectedIndex]);

  const navigateMenu = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;

    const menuItems = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>("[role='menuitemradio']") ?? [],
    );
    if (menuItems.length === 0) return;

    event.preventDefault();
    const currentIndex = Math.max(0, menuItems.indexOf(document.activeElement as HTMLButtonElement));
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? menuItems.length - 1
          : event.key === "ArrowDown"
            ? (currentIndex + 1) % menuItems.length
            : (currentIndex - 1 + menuItems.length) % menuItems.length;
    menuItems[nextIndex]?.focus({ preventScroll: true });
  };

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1 sm:flex-none">
      <Button
        ref={triggerRef}
        onClick={() => setOpen((current) => !current)}
        variant="paper"
        size="compact"
        className="w-full min-w-0 px-3 sm:w-32"
        aria-label={`${label}: ${selected?.label ?? ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Icon className="size-4 shrink-0 text-[var(--champagne-deep)]" />
        <span className="min-w-0 flex-1 truncate text-left">{selected?.label}</span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-[var(--ink-soft)]" />
      </Button>

      <AnimatePresence>
        {open ? (
          <motion.div
            ref={menuRef}
            role="menu"
            aria-label={label}
            onKeyDown={navigateMenu}
            initial={reduceMotion ? false : { opacity: 0, y: -5, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={
              reduceMotion
                ? { opacity: 0 }
                : { opacity: 0, y: -4, scale: 0.985 }
            }
            transition={{
              duration: reduceMotion ? 0 : 0.16,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="absolute right-0 top-[calc(100%+0.5rem)] z-30 grid w-40 gap-1 rounded-[22px] border border-white/85 bg-[rgba(255,250,243,0.96)] p-1.5 shadow-[0_16px_40px_rgba(58,40,25,0.16)] backdrop-blur-xl"
          >
            {options.map((option) => {
              const active = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={() => {
                    onChange(option.value);
                    closeMenu(true);
                  }}
                  className={`focus-ring flex min-h-11 items-center justify-between gap-2 rounded-full px-3 text-left text-sm font-extrabold transition motion-safe:active:scale-[0.98] ${
                    active
                      ? "bg-[var(--ink)] text-[var(--paper-soft)]"
                      : "text-[var(--ink-soft)] hover:bg-white/70 hover:text-[var(--ink)]"
                  }`}
                >
                  <span>{option.label}</span>
                  {active ? <Check className="size-3.5 shrink-0" /> : null}
                </button>
              );
            })}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

type MemoriesPanelProps = {
  entrySequence: number;
  filter: FilterKey;
  gridLayout: MemoryGridLayout;
  media: WeddingMedia[];
  mediaCounts: MediaLibraryCounts;
  mediaOrder: MediaLibraryOrder;
  hasMore: boolean;
  loadingMore: boolean;
  demoMode: boolean;
  onFilterChange: (filter: FilterKey) => void;
  onGridLayoutChange: (layout: MemoryGridLayout) => void;
  onMediaOrderChange: (order: MediaLibraryOrder) => void;
  onLoadMore: () => void;
  onRemoveMedia: (mediaId: string) => Promise<void>;
  text: AdminCopy;
};

export function MemoriesPanel({
  entrySequence,
  filter,
  gridLayout,
  media,
  mediaCounts,
  mediaOrder,
  hasMore,
  loadingMore,
  demoMode,
  onFilterChange,
  onGridLayoutChange,
  onMediaOrderChange,
  onLoadMore,
  onRemoveMedia,
  text,
}: MemoriesPanelProps) {
  const [deleteTarget, setDeleteTarget] = useState<WeddingMedia | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [selectedMedia, setSelectedMedia] = useState<WeddingMedia | null>(null);
  const enteredMediaIds = useMemo(() => new Set<string>(), [entrySequence]);
  const reduceMotion = useReducedMotion();
  const filters: { key: FilterKey; label: string; count: number }[] = [
    { key: "all", label: text.all, count: mediaCounts.all },
    { key: "image", label: text.photos, count: mediaCounts.image },
    { key: "video", label: text.videos, count: mediaCounts.video },
    { key: "audio", label: text.voice, count: mediaCounts.audio },
  ];
  const layoutOptions: { value: MemoryGridLayout; label: string }[] = [
    { value: "classic", label: text.gridLayoutClassic },
    { value: "story", label: text.gridLayoutStory },
    { value: "compact", label: text.gridLayoutCompact },
  ];
  const orderOptions: { value: MediaLibraryOrder; label: string }[] = [
    { value: "newest", label: text.sortNewest },
    { value: "oldest", label: text.sortOldest },
  ];
  const layoutTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const };

  useBodyScrollLock(Boolean(selectedMedia || deleteTarget));

  const showPreviousMedia = useCallback(() => {
    setSelectedMedia((current) => {
      if (!current || media.length === 0) return current;

      const currentIndex = media.findIndex((item) => item.id === current.id);
      const nextIndex = currentIndex <= 0 ? media.length - 1 : currentIndex - 1;
      return media[nextIndex] ?? current;
    });
  }, [media]);

  const showNextMedia = useCallback(() => {
    setSelectedMedia((current) => {
      if (!current || media.length === 0) return current;

      const currentIndex = media.findIndex((item) => item.id === current.id);
      const nextIndex = currentIndex >= media.length - 1 ? 0 : currentIndex + 1;
      return media[nextIndex] ?? current;
    });
  }, [media]);

  const closeDeleteDialog = useCallback(() => {
    setDeleteTarget(null);
    setDeleteError("");
  }, []);

  async function confirmDelete() {
    if (!deleteTarget) return;

    setDeleting(true);
    setDeleteError("");

    try {
      await onRemoveMedia(deleteTarget.id);
      setDeleteTarget(null);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : text.deleteFailed);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <article
        data-memory-inbox="true"
        className="rounded-[34px] border border-white/75 bg-[var(--paper-soft)] p-4 shadow-none sm:p-6 sm:shadow-[0_20px_58px_rgba(58,40,25,0.1)]"
      >
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="eyebrow flex items-center gap-2 text-[var(--champagne-deep)]">
              <CalendarDays className="size-4 shrink-0" />
              {text.inbox}
            </p>
          </div>
          <div className="flex w-full min-w-0 items-center gap-2 self-auto sm:w-auto">
            <MemoryControlMenu
              label={text.gridLayout}
              value={gridLayout}
              options={layoutOptions}
              icon={LayoutGrid}
              onChange={onGridLayoutChange}
            />
            <MemoryControlMenu
              label={text.sortMemories}
              value={mediaOrder}
              options={orderOptions}
              icon={ChevronsUpDown}
              onChange={onMediaOrderChange}
            />
          </div>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {filters.map((item) => (
            <Button
              key={item.key}
              onClick={() => onFilterChange(item.key)}
              aria-pressed={filter === item.key}
              variant={filter === item.key ? "ink" : "paper"}
              size="compact"
              className="min-h-12 w-full whitespace-nowrap !rounded-2xl px-3"
            >
              {item.label} · {item.count}
            </Button>
          ))}
        </div>

        {media.length === 0 ? (
          <div className="grid min-h-[18rem] place-items-center rounded-[30px] border border-dashed border-[var(--line)] bg-white/45 p-8 text-center">
            <div>
              <p className="font-display text-fluid-heading font-semibold text-[var(--ink)]">
                {text.noMemories}
              </p>
              <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-[var(--ink-soft)]">
                {text.noMemoriesBody}
              </p>
            </div>
          </div>
        ) : (
          <MemoryGrid
            media={media}
            gridLayout={gridLayout}
            entrySequence={entrySequence}
            enteredMediaIds={enteredMediaIds}
            demoMode={demoMode}
            hasMore={hasMore}
            loadingMore={loadingMore}
            reduceMotion={Boolean(reduceMotion)}
            layoutTransition={layoutTransition}
            onOpen={setSelectedMedia}
            onLoadMore={onLoadMore}
            text={text}
          />
        )}
      </article>

      <MemoryLightbox
        selectedMedia={selectedMedia}
        media={media}
        demoMode={demoMode}
        reduceMotion={Boolean(reduceMotion)}
        onClose={() => setSelectedMedia(null)}
        onPrevious={showPreviousMedia}
        onNext={showNextMedia}
        onRequestDelete={(item) => {
          setDeleteTarget(item);
          setSelectedMedia(null);
          setDeleteError("");
        }}
        text={text}
      />

      <DeleteMemoryDialog
        target={deleteTarget}
        deleting={deleting}
        error={deleteError}
        reduceMotion={Boolean(reduceMotion)}
        onCancel={closeDeleteDialog}
        onConfirm={() => void confirmDelete()}
        text={text}
      />
    </>
  );
}
