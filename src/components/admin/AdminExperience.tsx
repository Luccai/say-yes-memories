"use client";

import {
  ChangeEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Crown,
  Download,
  ExternalLink,
  Film,
  HardDrive,
  Image as ImageIcon,
  ImagePlus,
  LayoutGrid,
  Loader2,
  Lock,
  LogOut,
  Menu,
  Mic,
  MonitorPlay,
  Play,
  QrCode,
  Settings2,
  Trash2,
  Unlock,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useReducedMotion,
} from "motion/react";
import type {
  MediaKind,
  StoredMediaObject,
  Wedding,
  WeddingMedia,
} from "@/lib/types";
import {
  CachedMediaImage,
  storeInstantMediaCache,
} from "@/components/shared/CachedMediaImage";
import { GuidanceDialog, HelpTriggerButton } from "@/components/shared/GuidanceDialog";
import { Button, buttonStyles } from "@/components/shared/Button";
import { MediaOrb } from "@/components/shared/MediaOrb";
import { localizedError, useCopy, useLocale } from "@/lib/i18n-client";
import { rememberMembership } from "@/lib/auth/device-hint";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";
import { useAccessibleDialog } from "@/lib/use-accessible-dialog";
import {
  type ClientSignedUploadTarget,
  uploadToSignedTarget,
} from "@/lib/storage/client-upload";
import {
  formatStorageBytes,
  getStorageLevel,
  isAccessExpired,
  storageUsagePercent,
} from "@/lib/storage/quota";
import {
  demoWedding,
  ensureFreshDemoLocalState,
  localizeDemoMedia,
  localizeDemoWedding,
} from "@/lib/demo-content";

let qrCodeModule: Promise<typeof import("qrcode")> | null = null;

function loadQrCode() {
  qrCodeModule ??= import("qrcode");
  return qrCodeModule;
}

type AdminExperienceProps = {
  initialWedding: Wedding;
  initialMedia: WeddingMedia[];
  initialMediaHasMore?: boolean;
  initialMediaNextOffset?: number;
  demoMode?: boolean;
};

type FilterKey = "all" | MediaKind;
type AdminPanel = "memories" | "storage" | "identity" | "qr";
type MemoryGridLayout = "classic" | "story" | "compact";
type CustomerWeddingPatch = Partial<Pick<Wedding, "welcomeNote" | "uploadLocked">>;
type AdminCopy = ReturnType<typeof useCopy>["admin"];
const MEMORY_GRID_LAYOUT_STORAGE_KEY = "sayyes.admin.memory-grid-layout";
const MEMORY_GRID_LAYOUTS: MemoryGridLayout[] = ["classic", "story", "compact"];
const PROFILE_PHOTO_MAX_BYTES = 500 * 1024;
const PROFILE_PHOTO_MAX_DIMENSION = 1280;
const PROFILE_PHOTO_START_QUALITY = 0.82;
const PROFILE_PHOTO_MIN_QUALITY = 0.46;
function isDemoSessionMedia(mediaId: string) {
  return mediaId.startsWith("demo-session-");
}

function mergeDemoMedia(baseMedia: WeddingMedia[], sessionMedia: WeddingMedia[]) {
  const sessionIds = new Set(sessionMedia.map((item) => item.id));

  return [
    ...sessionMedia,
    ...baseMedia.filter((item) => !sessionIds.has(item.id) && !isDemoSessionMedia(item.id)),
  ];
}

function isMemoryGridLayout(value: string | null): value is MemoryGridLayout {
  return value === "classic" || value === "story" || value === "compact";
}

function nextMemoryGridLayout(layout: MemoryGridLayout) {
  const currentIndex = MEMORY_GRID_LAYOUTS.indexOf(layout);
  return MEMORY_GRID_LAYOUTS[(currentIndex + 1) % MEMORY_GRID_LAYOUTS.length] ?? "classic";
}

function persistMemoryGridLayout(layout: MemoryGridLayout) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(MEMORY_GRID_LAYOUT_STORAGE_KEY, layout);
  } catch {
    // Best effort only; private browsing can reject localStorage writes.
  }
}

function persistDemoLocalState(wedding: Wedding, media: WeddingMedia[]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem("sayyes.demo.wedding", JSON.stringify(wedding));
    window.localStorage.setItem(
      "sayyes.demo.media",
      JSON.stringify(media.filter((item) => !isDemoSessionMedia(item.id))),
    );
  } catch {
    // Best effort only; private browsing can reject localStorage writes.
  }
}

function memoryGridLayoutLabel(text: AdminCopy, layout: MemoryGridLayout) {
  const labels: Record<MemoryGridLayout, string> = {
    classic: text.gridLayoutClassic,
    story: text.gridLayoutStory,
    compact: text.gridLayoutCompact,
  };

  return labels[layout];
}

function GalleryThumbnailImage({
  thumbnail,
  alt,
  priority,
  delayMs,
}: {
  thumbnail: StoredMediaObject;
  alt: string;
  priority: boolean;
  delayMs: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(priority);

  useEffect(() => {
    if (visible || !containerRef.current) return;
    let timer: number | null = null;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          timer = window.setTimeout(() => setVisible(true), delayMs);
          observer.disconnect();
        }
      },
      { rootMargin: "80px 0px" },
    );
    observer.observe(containerRef.current);
    return () => {
      observer.disconnect();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [delayMs, visible]);

  return (
    <div ref={containerRef} className="h-full w-full">
      {visible ? (
        <CachedMediaImage
          src={thumbnail.url}
          cacheKey={thumbnail.storagePath ?? thumbnail.id}
          alt={alt}
          className="h-full w-full object-cover"
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
        />
      ) : (
        <div className="h-full w-full bg-[radial-gradient(circle_at_30%_18%,#fffaf3,#eadcca)]" />
      )}
    </div>
  );
}

type SignedUploadResponse = {
  upload: ClientSignedUploadTarget;
};

async function loadProfileImageSource(file: File): Promise<CanvasImageSource & { width: number; height: number }> {
  if ("createImageBitmap" in window) {
    return createImageBitmap(file);
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Selected photo could not be read."));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Selected photo could not be compressed."));
          return;
        }

        resolve(blob);
      },
      "image/jpeg",
      quality,
    );
  });
}

async function renderProfilePhoto(
  source: CanvasImageSource,
  width: number,
  height: number,
  quality: number,
) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Photo compression is not supported in this browser.");
  }

  canvas.width = width;
  canvas.height = height;
  context.fillStyle = "#fffaf3";
  context.fillRect(0, 0, width, height);
  context.drawImage(source, 0, 0, width, height);

  return canvasToBlob(canvas, quality);
}

async function compressProfilePhoto(file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Only profile photos are supported.");
  }

  const source = await loadProfileImageSource(file);
  const largestSide = Math.max(source.width, source.height);
  const scale = Math.min(1, PROFILE_PHOTO_MAX_DIMENSION / largestSide);
  let width = Math.max(1, Math.round(source.width * scale));
  let height = Math.max(1, Math.round(source.height * scale));
  let quality = PROFILE_PHOTO_START_QUALITY;
  let blob = await renderProfilePhoto(source, width, height, quality);

  for (let attempt = 0; blob.size > PROFILE_PHOTO_MAX_BYTES && attempt < 14; attempt += 1) {
    if (quality > PROFILE_PHOTO_MIN_QUALITY) {
      quality = Math.max(PROFILE_PHOTO_MIN_QUALITY, quality - 0.08);
    } else {
      width = Math.max(1, Math.round(width * 0.84));
      height = Math.max(1, Math.round(height * 0.84));
      quality = 0.72;
    }

    blob = await renderProfilePhoto(source, width, height, quality);
  }

  if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) {
    source.close();
  }

  if (blob.size > PROFILE_PHOTO_MAX_BYTES) {
    throw new Error("Photo could not be compressed below 500 KB.");
  }

  const baseName = file.name.replace(/\.[^.]+$/, "") || "profile-photo";

  return new File([blob], `${baseName}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

export function AdminExperience({
  initialWedding,
  initialMedia,
  initialMediaHasMore = false,
  initialMediaNextOffset = initialMedia.length,
  demoMode = false,
}: AdminExperienceProps) {
  const locale = useLocale();
  const [wedding, setWedding] = useState(initialWedding);
  const [media, setMedia] = useState(initialMedia);
  const [mediaHasMore, setMediaHasMore] = useState(initialMediaHasMore);
  const [mediaNextOffset, setMediaNextOffset] = useState(
    initialMediaNextOffset,
  );
  const [loadingMoreMedia, setLoadingMoreMedia] = useState(false);
  const [origin, setOrigin] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [gridLayout, setGridLayout] = useState<MemoryGridLayout>("classic");
  const [gridLayoutHydrated, setGridLayoutHydrated] = useState(false);
  const [activePanel, setActivePanel] = useState<AdminPanel>("memories");
  const [menuOpen, setMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profileUploading, setProfileUploading] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const demoHydratedRef = useRef(!demoMode);
  const [identitySaveConfirmed, setIdentitySaveConfirmed] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 20, right: 16 });
  const reduceMotion = useReducedMotion();
  const text = useCopy();
  const adminText = text.admin;
  const adminHelpCards = demoMode
    ? [...adminText.helpCards, adminText.demoHelpCard]
    : adminText.helpCards;

  const eventSlug = demoMode ? demoWedding.slug : wedding.slug;
  const eventUrl = `${origin || "https://your-domain.com"}/${eventSlug}`;
  const presentationUrl = demoMode
    ? `/admin/${wedding.slug}/presentation`
    : "/admin/presentation";

  useBodyScrollLock(menuOpen);

  useEffect(() => {
    queueMicrotask(() => setOrigin(window.location.origin));
  }, []);

  useEffect(() => {
    if (!demoMode) {
      rememberMembership(wedding);
    }
  }, [demoMode, wedding]);

  useEffect(() => {
    try {
      const savedLayout = window.localStorage.getItem(MEMORY_GRID_LAYOUT_STORAGE_KEY);

      if (isMemoryGridLayout(savedLayout)) {
        setGridLayout(savedLayout);
      }
    } finally {
      setGridLayoutHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!gridLayoutHydrated) {
      return;
    }

    persistMemoryGridLayout(gridLayout);
  }, [gridLayout, gridLayoutHydrated]);

  useLayoutEffect(() => {
    if (!menuOpen) {
      return;
    }

    const updateMenuPosition = () => {
      const button = menuButtonRef.current;

      if (!button) {
        return;
      }

      const rect = button.getBoundingClientRect();
      setMenuPosition({
        top: Math.max(16, Math.round(rect.bottom + 10)),
        right: Math.max(16, Math.round(window.innerWidth - rect.right)),
      });
    };

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);

    return () => {
      window.removeEventListener("resize", updateMenuPosition);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    window.addEventListener("keydown", closeOnEscape);

    return () => {
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!demoMode) {
      return;
    }

    let active = true;
    let subscribed = false;
    let unsubscribe: () => void = () => undefined;

    async function hydrateDemoState() {
      const demoSession = await import("@/lib/demo-session-media");
      ensureFreshDemoLocalState();

      const savedWedding = window.localStorage.getItem("sayyes.demo.wedding");
      const savedMedia = window.localStorage.getItem("sayyes.demo.media");
      const sourceWedding = savedWedding ? (JSON.parse(savedWedding) as Wedding) : initialWedding;
      const sourceMedia = savedMedia
        ? (JSON.parse(savedMedia) as WeddingMedia[]).filter((item) => !isDemoSessionMedia(item.id))
        : initialMedia;
      const sessionMedia = await demoSession.getDemoSessionMedia();

      if (!active) {
        return;
      }

      const nextWedding = localizeDemoWedding(sourceWedding, locale);
      const nextMedia = mergeDemoMedia(localizeDemoMedia(sourceMedia, locale), sessionMedia);

      setWedding(nextWedding);
      setMedia(nextMedia);
      persistDemoLocalState(nextWedding, nextMedia);
      demoHydratedRef.current = true;

      if (!subscribed) {
        subscribed = true;
        unsubscribe = demoSession.subscribeDemoSessionMedia(() => {
          void hydrateDemoState();
        });
      }
    }

    const timeoutId = window.setTimeout(() => void hydrateDemoState(), 5_000);

    return () => {
      active = false;
      unsubscribe();
      window.clearTimeout(timeoutId);
    };
  }, [demoMode, initialMedia, initialWedding, locale]);

  useEffect(() => {
    if (!demoMode || !demoHydratedRef.current) {
      return;
    }

    persistDemoLocalState(wedding, media);
  }, [demoMode, media, wedding]);

  useEffect(() => {
    if (demoMode) {
      return;
    }

    let active = true;
    const syncMedia = async () => {
      const kindQuery = filter === "all" ? "" : `?kind=${filter}`;
      const response = await fetch(`/api/weddings/current/media${kindQuery}`, {
        cache: "no-store",
      });

      if (!response.ok || !active) {
        return;
      }

      const payload = (await response.json()) as {
        media: WeddingMedia[];
        wedding?: Wedding;
        hasMore?: boolean;
        nextOffset?: number;
      };
      setMedia(payload.media ?? []);
      setMediaHasMore(Boolean(payload.hasMore));
      setMediaNextOffset(payload.nextOffset ?? payload.media?.length ?? 0);

      if (payload.wedding) {
        setWedding(payload.wedding);
      }
    };
    const syncIfVisible = () => {
      if (!document.hidden) {
        void syncMedia();
      }
    };
    let removeRealtimeChannel: (() => void) | null = null;
    async function connectRealtime() {
      if (!wedding.realtimeTopic) return;
      const { getSupabaseBrowser } = await import("@/lib/supabase/browser");
      if (!active) return;
      const supabase = getSupabaseBrowser();
      const realtimeChannel = supabase
        .channel(`wedding:${wedding.realtimeTopic}`)
        .on("broadcast", { event: "media_changed" }, syncIfVisible)
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            void syncMedia();
          }
        });
      removeRealtimeChannel = () => {
        void supabase.removeChannel(realtimeChannel);
      };
    }

    void syncMedia();
    void connectRealtime();
    const interval = window.setInterval(syncIfVisible, 30000);
    window.addEventListener("focus", syncIfVisible);
    document.addEventListener("visibilitychange", syncIfVisible);

    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", syncIfVisible);
      document.removeEventListener("visibilitychange", syncIfVisible);
      removeRealtimeChannel?.();
    };
  }, [demoMode, filter, wedding.realtimeTopic]);

  async function loadMoreMedia() {
    if (demoMode || loadingMoreMedia || !mediaHasMore) return;
    setLoadingMoreMedia(true);
    try {
      const response = await fetch(
        `/api/weddings/current/media?offset=${mediaNextOffset}&limit=48${
          filter === "all" ? "" : `&kind=${filter}`
        }`,
        { cache: "no-store" },
      );
      if (!response.ok) return;
      const payload = (await response.json()) as {
        media: WeddingMedia[];
        hasMore: boolean;
        nextOffset: number;
      };
      setMedia((current) => {
        const known = new Set(current.map((item) => item.id));
        return [...current, ...payload.media.filter((item) => !known.has(item.id))];
      });
      setMediaHasMore(payload.hasMore);
      setMediaNextOffset(payload.nextOffset);
    } finally {
      setLoadingMoreMedia(false);
    }
  }

  const filteredMedia = useMemo(() => {
    if (filter === "all") {
      return media;
    }

    return media.filter((item) => item.kind === filter);
  }, [filter, media]);

  async function saveIdentity(patch: CustomerWeddingPatch) {
    setIdentitySaveConfirmed(false);

    if (demoMode) {
      setWedding((current) => ({
        ...current,
        welcomeNote: patch.welcomeNote ?? current.welcomeNote,
        uploadLocked: patch.uploadLocked ?? current.uploadLocked,
        updatedAt: new Date().toISOString(),
      }));
      if (patch.welcomeNote !== undefined) {
        setIdentitySaveConfirmed(true);
        window.setTimeout(() => setIdentitySaveConfirmed(false), 2600);
      }
      return;
    }

    setSaving(true);

    try {
      const response = await fetch("/api/weddings/current", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const payload = (await response.json()) as { wedding?: Wedding; message?: string };

      if (!response.ok) {
        throw new Error(
          localizedError(payload.message, text.errors, text.errors.saveIdentityFailed),
        );
      }

      if (payload.wedding) {
        setWedding(payload.wedding);
        if (patch.welcomeNote !== undefined) {
          setIdentitySaveConfirmed(true);
          window.setTimeout(() => setIdentitySaveConfirmed(false), 2600);
        }
      }
    } catch (error) {
      window.alert(error instanceof Error ? error.message : text.errors.saveIdentityFailed);
    } finally {
      setSaving(false);
    }
  }

  async function uploadProfileMedia(event: ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0];

    if (!selectedFile) {
      return;
    }

    setProfileUploading(true);

    try {
      const file = await compressProfilePhoto(selectedFile);

      if (demoMode) {
        const profileId = `demo-profile-${Date.now()}`;
        const url = URL.createObjectURL(file);
        await storeInstantMediaCache(profileId, file);
        setWedding((current) => ({
          ...current,
          profileMedia: {
            id: profileId,
            url,
            kind: "image",
            mimeType: file.type || "application/octet-stream",
            fileName: file.name || "profile-photo.jpg",
            byteSize: file.size,
            createdAt: new Date().toISOString(),
          },
          updatedAt: new Date().toISOString(),
        }));
        return;
      }

      const prepareResponse = await fetch("/api/weddings/current/profile-media/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          byteSize: file.size,
        }),
      });
      const preparePayload = (await prepareResponse.json()) as SignedUploadResponse & {
        message?: string;
      };

      if (!prepareResponse.ok) {
        throw new Error(
          localizedError(preparePayload.message, text.errors, text.errors.profilePrepareFailed),
        );
      }

      await uploadToSignedTarget(preparePayload.upload, file);

      const completeResponse = await fetch("/api/weddings/current/profile-media/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ object: preparePayload.upload.object }),
      });
      const payload = (await completeResponse.json()) as { wedding?: Wedding; message?: string };

      if (!completeResponse.ok) {
        throw new Error(
          localizedError(payload.message, text.errors, text.errors.profileCompleteFailed),
        );
      }

      if (payload.wedding) {
        await storeInstantMediaCache(preparePayload.upload.object.storagePath, file);
        setWedding(payload.wedding);
      }
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : undefined;
      const alreadyLocalized =
        rawMessage !== undefined && (Object.values(text.errors) as string[]).includes(rawMessage);

      window.alert(
        localizedError(
          rawMessage,
          text.errors,
          alreadyLocalized ? rawMessage : text.errors.profileUploadFailed,
        ),
      );
    } finally {
      setProfileUploading(false);
      event.target.value = "";
    }
  }

  async function removeMedia(mediaId: string) {
    if (demoMode) {
      if (isDemoSessionMedia(mediaId)) {
        const { removeDemoSessionMedia } = await import("@/lib/demo-session-media");
        await removeDemoSessionMedia(mediaId);
      }

      setMedia((current) => current.filter((item) => item.id !== mediaId));
      setMediaNextOffset((current) => Math.max(current - 1, 0));
      return;
    }

    const response = await fetch(`/api/media/${mediaId}`, { method: "DELETE" });

    if (!response.ok) {
      const payload = (await response.json()) as { message?: string };
      throw new Error(localizedError(payload.message, text.errors, adminText.deleteFailed));
    }

    setMedia((current) => current.filter((item) => item.id !== mediaId));
    setMediaNextOffset((current) => Math.max(current - 1, 0));
  }

  async function logout() {
    if (demoMode) {
      window.location.assign("/login");
      return;
    }

    setLoggingOut(true);
    setLogoutError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      const payload = (await response.json().catch(() => null)) as {
        code?: string;
      } | null;
      if (response.ok || payload?.code === "LOGOUT_UNAVAILABLE") {
        window.location.assign("/login");
        return;
      }
      setLogoutError(text.errors.signInFailed);
    } catch {
      setLogoutError(text.errors.signInFailed);
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <main className="min-h-[100dvh] overflow-x-clip text-[var(--ink)]">
      <div className="mx-auto flex max-w-[96rem] min-w-0 flex-col gap-5 overflow-x-clip px-4 py-5 sm:px-6 lg:px-8">
        <header className="paper-grain overflow-hidden rounded-[34px] border border-white/75 bg-[rgba(255,250,243,0.78)] p-5 shadow-none backdrop-blur-xl sm:p-7 sm:shadow-[var(--shadow-soft)]">
          <div className="relative z-20 flex items-center gap-4 sm:gap-5">
            <MediaOrb
              media={wedding.profileMedia}
              label={wedding.coupleName}
              className="h-[4.5rem] w-[3.5rem] shrink-0 sm:h-24 sm:w-20"
            />
            <div className="min-w-0 flex-1 [container-type:inline-size]">
              <h1 className="couple-name text-[var(--ink)]">
                {wedding.coupleName}
              </h1>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <HelpTriggerButton
                label={text.help}
                onClick={() => setHelpOpen(true)}
                mobileIconOnly
              />
              <Button
                ref={menuButtonRef}
                onClick={() => setMenuOpen((current) => !current)}
                variant="paper"
                size="icon"
                aria-expanded={menuOpen}
                aria-label={adminText.menu}
              >
                <Menu className="size-5" />
              </Button>
            </div>
          </div>
        </header>

        <AnimatePresence>
        {menuOpen ? (
          <motion.div
            className="fixed inset-0 z-50"
            onClick={() => setMenuOpen(false)}
            role="presentation"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.16 }}
          >
            <button
              type="button"
              className="absolute inset-0 cursor-default bg-transparent"
              aria-label={text.close}
              onClick={() => setMenuOpen(false)}
            />
            <motion.nav
              initial={reduceMotion ? false : { opacity: 0, y: -10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.985 }}
              transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="fixed grid w-[min(calc(100vw-2rem),22rem)] gap-2 rounded-[30px] border border-white/80 bg-[rgba(255,250,243,0.92)] p-2.5 shadow-[0_18px_52px_rgba(58,40,25,0.16)] backdrop-blur-xl sm:shadow-[0_24px_70px_rgba(58,40,25,0.2)]"
              style={{ top: menuPosition.top, right: menuPosition.right }}
              aria-label={adminText.menu}
              onClick={(event) => {
                if (event.target === event.currentTarget) {
                  setMenuOpen(false);
                }
              }}
            >
              <AdminMenuButton
                active={activePanel === "memories"}
                icon={ImageIcon}
                label={adminText.memoryRoom}
                onClick={() => {
                  setActivePanel("memories");
                  setMenuOpen(false);
                }}
              />
              <AdminMenuLink
                href={presentationUrl}
                icon={MonitorPlay}
                label={adminText.presentation}
              />
              <AdminMenuButton
                active={activePanel === "storage"}
                icon={HardDrive}
                label={adminText.storageEyebrow}
                onClick={() => {
                  setActivePanel("storage");
                  setMenuOpen(false);
                }}
              />
              <AdminMenuButton
                active={activePanel === "identity"}
                icon={Settings2}
                label={adminText.weddingPage}
                onClick={() => {
                  setActivePanel("identity");
                  setMenuOpen(false);
                }}
              />
              <AdminMenuButton
                active={activePanel === "qr"}
                icon={QrCode}
                label={adminText.qrAndLink}
                onClick={() => {
                  setActivePanel("qr");
                  setMenuOpen(false);
                }}
              />
              <AdminMenuLink
                href={eventUrl}
                icon={ExternalLink}
                label={adminText.openPage}
                newTab
              />
              <div className="mt-1 flex justify-end border-t border-[var(--line)] pt-2">
                <Button
                  onClick={() => void logout()}
                  disabled={loggingOut}
                  loading={loggingOut}
                  variant="danger"
                  fullWidth
                  className="justify-between px-3"
                >
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full border border-[rgba(124,58,49,0.16)] bg-white/58">
                      <LogOut className="size-3.5" />
                    </span>
                    <span className="truncate">{adminText.logout}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 opacity-55" />
                </Button>
                {logoutError ? (
                  <p role="alert" className="mt-2 text-xs font-semibold text-[var(--rosewood)]">
                    {logoutError}
                  </p>
                ) : null}
              </div>
            </motion.nav>
          </motion.div>
        ) : null}
        </AnimatePresence>

        <div className="grid">
          <motion.section
            data-admin-panel="memories"
            data-panel-motion="enter-exit"
            aria-hidden={activePanel !== "memories"}
            initial={false}
            animate={
              activePanel === "memories"
                ? { display: "grid", opacity: 1, y: 0 }
                : { opacity: 0, y: 8, transitionEnd: { display: "none" } }
            }
            transition={{ duration: reduceMotion ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="[grid-area:1/1] grid gap-5"
          >
            <MemoryInbox
              filter={filter}
              gridLayout={gridLayout}
              media={filteredMedia}
              hasMore={mediaHasMore}
              loadingMore={loadingMoreMedia}
              demoMode={demoMode}
              onFilterChange={setFilter}
              onGridLayoutChange={() =>
                setGridLayout((current) => {
                  const nextLayout = nextMemoryGridLayout(current);
                  persistMemoryGridLayout(nextLayout);
                  return nextLayout;
                })
              }
              onRemoveMedia={removeMedia}
              onLoadMore={() => void loadMoreMedia()}
              text={adminText}
            />
          </motion.section>

          <AnimatePresence mode="wait" initial={false}>
            {activePanel !== "memories" ? (
              <motion.section
                key={activePanel}
                data-admin-panel={activePanel}
                data-panel-motion="enter-exit"
                initial={reduceMotion ? false : { opacity: 0, y: 14, scale: 0.992 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -6, scale: 0.996 }}
                transition={{ duration: reduceMotion ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
                className="[grid-area:1/1] grid gap-5"
              >
                {activePanel === "identity" ? (
                  <IdentityCard
                    key={`${wedding.brideName}|${wedding.groomName}|${wedding.eventDate ?? ""}|${wedding.welcomeNote}`}
                    wedding={wedding}
                    saving={saving}
                    profileUploading={profileUploading}
                    onUploadProfileMedia={uploadProfileMedia}
                    onDirty={() => setIdentitySaveConfirmed(false)}
                    onSave={saveIdentity}
                    text={adminText}
                  />
                ) : null}
                {activePanel === "qr" ? (
                  <QrStudio wedding={wedding} eventUrl={eventUrl} text={adminText} />
                ) : null}
                {activePanel === "storage" ? (
                  <StorageOverview wedding={wedding} demoMode={demoMode} text={adminText} />
                ) : null}
              </motion.section>
            ) : null}
          </AnimatePresence>
        </div>
        {identitySaveConfirmed ? (
          <motion.p
            initial={{ opacity: 0, y: 8, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            className="fixed left-1/2 top-12 z-[80] inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-white/80 px-4 py-2 text-xs font-bold text-[var(--ink)] shadow-none backdrop-blur sm:shadow-[0_14px_34px_rgba(31,23,18,0.14)]"
            role="status"
          >
            <Check className="size-3.5" />
            {adminText.pageSaved}
          </motion.p>
        ) : null}
      </div>
      <GuidanceDialog
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        closeLabel={text.close}
        eyebrow={adminText.helpEyebrow}
        title={adminText.helpTitle}
        body={adminText.helpBody}
        steps={adminText.helpSteps}
        cards={adminHelpCards}
        footer={adminText.helpFooter}
      />
    </main>
  );
}

function AdminMenuButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      variant={active ? "paper" : "quiet"}
      fullWidth
      className={`group justify-start gap-2.5 px-2.5 text-left text-[0.82rem] sm:text-[0.84rem] ${
        active
          ? "!border-[rgba(139,107,63,0.34)] !bg-[rgba(239,222,193,0.62)]"
          : "!bg-white/32 text-[var(--ink)]"
      }`}
    >
      <span
        className={`grid size-8 shrink-0 place-items-center rounded-full border transition ${
          active
            ? "border-[rgba(139,107,63,0.26)] bg-[rgba(255,250,243,0.78)] text-[var(--champagne-deep)]"
            : "border-[var(--line)] bg-white/62 text-[var(--ink-soft)] group-hover:text-[var(--ink)]"
        }`}
      >
        <Icon className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {active ? (
        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[var(--ink)] text-[var(--paper-soft)]">
          <Check className="size-3" />
        </span>
      ) : (
        <ChevronRight className="size-4 shrink-0 text-[var(--ink-soft)] opacity-50 transition group-hover:translate-x-0.5 group-hover:opacity-80" />
      )}
    </Button>
  );
}

function AdminMenuLink({
  href,
  icon: Icon,
  label,
  newTab = false,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  newTab?: boolean;
}) {
  return (
    <a
      href={href}
      target={newTab ? "_blank" : undefined}
      rel={newTab ? "noreferrer" : undefined}
      data-app-button="quiet"
      className={buttonStyles({ variant: "quiet", fullWidth: true, className: "group justify-start gap-2.5 !bg-white/32 px-2.5 text-left text-[0.82rem] text-[var(--ink)] sm:text-[0.84rem]" })}
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-full border border-[var(--line)] bg-white/62 text-[var(--ink-soft)] transition group-hover:text-[var(--ink)]">
        <Icon className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <ChevronRight className="size-4 shrink-0 text-[var(--ink-soft)] opacity-50 transition group-hover:translate-x-0.5 group-hover:opacity-80" />
    </a>
  );
}

function fillTemplate(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (current, [key, value]) => current.replace(`{${key}}`, String(value)),
    template,
  );
}

function daysUntil(isoDateTime?: string) {
  if (!isoDateTime) {
    return null;
  }

  return Math.ceil((new Date(isoDateTime).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function storageStatusText(text: AdminCopy, wedding: Wedding) {
  if (isAccessExpired(wedding)) {
    return text.storageExpired;
  }

  const level = getStorageLevel(wedding);

  if (level === "full") {
    return text.storageFull;
  }

  if (level === "critical") {
    return text.storageCritical;
  }

  if (level === "warning") {
    return text.storageWarning;
  }

  return text.storageHealthy;
}

function StorageOverview({
  wedding,
  demoMode,
  text,
}: {
  wedding: Wedding;
  demoMode: boolean;
  text: AdminCopy;
}) {
  const [premiumOpen, setPremiumOpen] = useState(false);
  const [coupleNameCopied, setCoupleNameCopied] = useState(false);
  const reduceMotion = useReducedMotion();
  const premiumDialogRef = useRef<HTMLDivElement>(null);
  const premiumCloseRef = useRef<HTMLButtonElement>(null);
  const premiumUpgradeUrl = process.env.NEXT_PUBLIC_ETSY_PREMIUM_UPGRADE_URL;
  const isDemoStorage = demoMode || wedding.demo;
  const displayedUsedBytes = isDemoStorage
    ? Math.round(34.8 * 1024 * 1024 * 1024)
    : wedding.storageUsedBytes;
  const displayedQuotaBytes = isDemoStorage
    ? 50 * 1024 * 1024 * 1024
    : wedding.storageQuotaBytes;
  const percent = storageUsagePercent(displayedUsedBytes, displayedQuotaBytes);
  const usedLabel = formatStorageBytes(displayedUsedBytes);
  const quotaLabel = formatStorageBytes(displayedQuotaBytes);
  const remainingDays = isDemoStorage ? 74 : daysUntil(wedding.accessExpiresAt);
  const status = isDemoStorage ? text.storageHealthy : storageStatusText(text, wedding);
  const planLabel = isDemoStorage ? "Classic" : wedding.plan === "premium" ? "Premium" : "Classic";

  useBodyScrollLock(premiumOpen);
  useAccessibleDialog({
    open: premiumOpen,
    containerRef: premiumDialogRef,
    initialFocusRef: premiumCloseRef,
    onClose: () => setPremiumOpen(false),
  });

  async function copyCoupleName() {
    if (isDemoStorage) {
      return;
    }

    await navigator.clipboard.writeText(wedding.coupleName);
    setCoupleNameCopied(true);
    window.setTimeout(() => setCoupleNameCopied(false), 1600);
  }

  return (
    <>
      <article className="overflow-hidden rounded-[34px] border border-white/75 bg-[rgba(255,250,243,0.84)] p-4 shadow-none backdrop-blur sm:p-6 sm:shadow-[0_20px_58px_rgba(58,40,25,0.1)]">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)] lg:items-stretch">
          <div className="min-w-0">
            <p className="eyebrow flex items-center gap-2 text-[var(--champagne-deep)]">
              <HardDrive className="size-4 shrink-0" />
              {text.storageEyebrow}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-[rgba(139,107,63,0.24)] bg-white/58 px-3 py-1 text-[0.72rem] font-bold uppercase text-[var(--champagne-deep)]">
                {planLabel}
              </span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-[var(--ink-soft)]">
              {status}
            </p>

            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between gap-3 text-xs font-bold text-[var(--ink-soft)]">
                <span>
                  {fillTemplate(text.storageUsedOf, { used: usedLabel, quota: quotaLabel })}
                </span>
                <span>{Math.round(percent)}%</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full border border-[rgba(139,107,63,0.18)] bg-white/64">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,var(--champagne-deep),var(--rosewood))] transition-[width] duration-500"
                  style={{ width: `${Math.min(100, percent)}%` }}
                />
              </div>
            </div>
          </div>

          <div className="grid min-w-0 content-between gap-4 rounded-[26px] border border-[var(--line)] bg-white/46 p-4">
            <div className="grid gap-3">
              <div>
                <p className="text-[0.68rem] font-bold uppercase text-[var(--ink-soft)]">
                  {text.upgradeCoupleName}
                </p>
                <p className="mt-1 break-words font-display text-xl font-semibold text-[var(--ink)]">
                  {wedding.coupleName}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={copyCoupleName}
                  disabled={isDemoStorage}
                  title={isDemoStorage ? text.demoStorageNotice : undefined}
                  variant="paper"
                  size="compact"
                >
                  <Copy className="size-3.5" />
                  <span>{coupleNameCopied ? text.copied : text.copyCoupleName}</span>
                </Button>
                <Button
                  onClick={() => {
                    if (!isDemoStorage) {
                      setPremiumOpen(true);
                    }
                  }}
                  disabled={isDemoStorage}
                  title={isDemoStorage ? text.demoStorageNotice : undefined}
                  variant="danger"
                  size="compact"
                >
                  <Crown className="size-3.5" />
                  <span>{text.premiumPill}</span>
                </Button>
              </div>
              {isDemoStorage ? (
                <p className="rounded-[18px] border border-[rgba(139,107,63,0.18)] bg-[rgba(255,250,243,0.72)] px-3 py-2 text-xs font-bold leading-5 text-[var(--ink-soft)]">
                  {text.demoStorageNotice}
                </p>
              ) : null}
            </div>
            <p className="text-xs font-bold text-[var(--ink-soft)]">
              {remainingDays === null
                ? text.storageNoDate
                : fillTemplate(text.storageDaysLeft, { days: Math.max(0, remainingDays) })}
            </p>
          </div>
        </div>
      </article>

      <AnimatePresence>
      {premiumOpen && !isDemoStorage ? (
        <motion.div
          className="fixed inset-0 z-[70] grid place-items-end bg-[rgba(31,23,18,0.24)] p-3 backdrop-blur-sm sm:place-items-center"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.18 }}
        >
          <button
            type="button"
            aria-label={text.close}
            className="absolute inset-0 cursor-default"
            onClick={() => setPremiumOpen(false)}
          />
          <motion.div
            ref={premiumDialogRef}
            initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.99 }}
            transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full max-w-[32rem] rounded-[30px] border border-white/80 bg-[var(--paper-soft)] p-5 shadow-[0_28px_80px_rgba(31,23,18,0.22)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="premium-extension-title"
            tabIndex={-1}
          >
            <Button
              ref={premiumCloseRef}
              onClick={() => setPremiumOpen(false)}
              variant="paper"
              size="icon"
              className="absolute right-4 top-4 !size-10 !min-h-10"
              aria-label={text.close}
            >
              <X className="size-4" />
            </Button>
            <p className="eyebrow flex items-center gap-2 text-[var(--champagne-deep)]">
              <Crown className="size-4" />
              {text.upgradePremium}
            </p>
            <h2 id="premium-extension-title" className="mt-3 pr-10 font-display text-2xl font-semibold text-[var(--ink)]">
              {text.premiumModalTitle}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--ink-soft)]">
              {text.premiumModalBody}
            </p>
            <ol className="mt-5 grid gap-3 text-sm font-semibold text-[var(--ink)]">
              <li>{text.premiumStepCopy}</li>
              <li>{text.premiumStepBuy}</li>
              <li>{text.premiumStepSend}</li>
            </ol>
            <div className="mt-5 rounded-[22px] border border-[var(--line)] bg-white/54 p-4">
              <p className="text-[0.68rem] font-bold uppercase text-[var(--ink-soft)]">
                {text.upgradeCoupleName}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="break-words font-display text-xl font-semibold text-[var(--ink)]">
                  {wedding.coupleName}
                </span>
                <Button
                  onClick={copyCoupleName}
                  variant="paper"
                  size="compact"
                >
                  <Copy className="size-4" />
                  {coupleNameCopied ? text.copied : text.copyCoupleName}
                </Button>
              </div>
            </div>
            {premiumUpgradeUrl ? (
              <a
                href={premiumUpgradeUrl}
                target="_blank"
                rel="noreferrer"
                data-app-button="ink"
                className={buttonStyles({ className: "mt-5 w-fit" })}
              >
                <ExternalLink className="size-4" />
                {text.openEtsyListing}
              </a>
            ) : (
              <p className="mt-5 rounded-[20px] border border-[var(--line)] bg-white/44 p-4 text-sm leading-relaxed text-[var(--ink-soft)]">
                {text.premiumNoLink}
              </p>
            )}
          </motion.div>
        </motion.div>
      ) : null}
      </AnimatePresence>
    </>
  );
}

function IdentityCard({
  wedding,
  saving,
  profileUploading,
  onUploadProfileMedia,
  onDirty,
  onSave,
  text,
}: {
  wedding: Wedding;
  saving: boolean;
  profileUploading: boolean;
  onUploadProfileMedia: (event: ChangeEvent<HTMLInputElement>) => void;
  onDirty: () => void;
  onSave: (patch: CustomerWeddingPatch) => Promise<void>;
  text: AdminCopy;
}) {
  const [welcomeNote, setWelcomeNote] = useState(wedding.welcomeNote);

  async function handleSaveIdentity() {
    await onSave({ welcomeNote });
  }

  function markDirty() {
    onDirty();
  }

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-[34px] border border-white/75 bg-[var(--paper-soft)] p-6 shadow-none sm:shadow-[0_20px_58px_rgba(58,40,25,0.1)]"
    >
      <div className="mb-7 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow flex items-center gap-2 text-[var(--champagne-deep)]">
            <Settings2 className="size-4" />
            {text.identity}
          </p>
          <h2 className="text-tech-heading mt-2 text-balance text-[var(--ink)]">
            {text.identityTitle}
          </h2>
        </div>
        {saving ? (
          <Loader2 className="mt-1 size-5 shrink-0 animate-spin text-[var(--champagne-deep)]" />
        ) : null}
      </div>

      <div className="grid gap-5 sm:grid-cols-[9rem_1fr]">
        <div className="flex flex-col items-center">
          <MediaOrb media={wedding.profileMedia} label={wedding.coupleName} className="h-44 w-36" />
          <label className={buttonStyles({ variant: "paper", className: "mt-4 w-fit cursor-pointer" })}>
            {profileUploading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
            {text.upload}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={onUploadProfileMedia}
            />
          </label>
        </div>

        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2 text-sm font-semibold">
              {text.brideName}
              <p className="min-h-12 rounded-2xl border border-[var(--line)] bg-[#f1e8db] px-4 py-3 text-base font-medium text-[var(--ink)]">
                {wedding.brideName}
              </p>
            </div>
            <div className="grid gap-2 text-sm font-semibold">
              {text.groomName}
              <p className="min-h-12 rounded-2xl border border-[var(--line)] bg-[#f1e8db] px-4 py-3 text-base font-medium text-[var(--ink)]">
                {wedding.groomName}
              </p>
            </div>
          </div>
          <div className="grid gap-2 text-sm font-semibold">
            {text.eventDate}
            <p className="min-h-12 rounded-2xl border border-[var(--line)] bg-[#f1e8db] px-4 py-3 text-base font-medium text-[var(--ink)]">
              {wedding.eventDate ?? "—"}
            </p>
          </div>
          <p className="rounded-[20px] border border-[rgba(139,107,63,0.2)] bg-white/54 px-4 py-3 text-xs font-semibold leading-5 text-[var(--ink-soft)]">
            {text.identityOwnerManaged}
          </p>
          <label className="grid gap-2 text-sm font-semibold">
            {text.welcomeNote}
            <textarea
              value={welcomeNote}
              onChange={(event) => {
                setWelcomeNote(event.target.value);
                markDirty();
              }}
              rows={4}
              className="focus-ring rounded-2xl border border-[var(--line)] bg-[#f1e8db] px-4 py-3 !text-[16px] leading-7 outline-none"
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={handleSaveIdentity}
              loading={saving}
              className="w-fit"
            >
              <Check className="size-3.5" />
              {text.saveIdentity}
            </Button>
            <Button
              onClick={() => onSave({ uploadLocked: !wedding.uploadLocked })}
              variant="paper"
              aria-pressed={wedding.uploadLocked}
              className="w-fit"
            >
              <span className="inline-flex items-center justify-center gap-2">
                {wedding.uploadLocked ? <Lock className="size-4" /> : <Unlock className="size-4" />}
                {wedding.uploadLocked ? text.uploadsLocked : text.uploadsOpen}
              </span>
            </Button>
          </div>
        </div>
      </div>
    </motion.article>
  );
}

function QrStudio({
  wedding,
  eventUrl,
  text,
}: {
  wedding: Wedding;
  eventUrl: string;
  text: AdminCopy;
}) {
  const locale = useLocale();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);
  const eventDateLabel = wedding.eventDate
    ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(
        new Date(`${wedding.eventDate}T12:00:00`),
      )
    : "";

  useEffect(() => {
    if (!canvasRef.current || !eventUrl) {
      return;
    }

    let active = true;
    void loadQrCode().then((QRCode) => {
      if (!active || !canvasRef.current) return;
      return QRCode.toCanvas(canvasRef.current, eventUrl, {
        width: 232,
        margin: 1,
        color: {
          dark: "#1f1712",
          light: "#fffaf3",
        },
      });
    });
    return () => {
      active = false;
    };
  }, [eventUrl]);

  async function copyLink() {
    await navigator.clipboard.writeText(eventUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  function downloadPng() {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const link = document.createElement("a");
    link.download = `${wedding.slug}-qr.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  async function downloadSvg() {
    const QRCode = await loadQrCode();
    const svg = await QRCode.toString(eventUrl, {
      type: "svg",
      width: 720,
      margin: 1,
      color: {
        dark: "#1f1712",
        light: "#fffaf3",
      },
    });
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const link = document.createElement("a");
    link.download = `${wedding.slug}-qr.svg`;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 }}
      className="overflow-hidden rounded-[36px] border border-white/80 bg-[rgba(255,250,243,0.88)] p-4 shadow-none sm:p-7 sm:shadow-[0_24px_64px_rgba(58,40,25,0.12)]"
    >
      <div className="mb-7">
        <p className="eyebrow flex items-center gap-2 text-[var(--champagne-deep)]">
          <QrCode className="size-4" />
          {text.qrStudio}
        </p>
        <h2 className="text-tech-heading mt-2 text-balance text-[var(--ink)]">
          {text.qrTitle}
        </h2>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(19rem,0.92fr)_minmax(18rem,1.08fr)] lg:items-stretch">
        <div className="paper-grain relative isolate overflow-hidden rounded-[34px] border border-[rgba(139,107,63,0.24)] bg-[#efe1cf] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_20px_50px_rgba(58,40,25,0.12)] sm:p-4">
          <div className="relative z-10 flex min-h-[34rem] flex-col items-center rounded-[27px] border border-[rgba(139,107,63,0.24)] bg-[rgba(255,250,243,0.9)] px-5 py-7 text-center">
            <MediaOrb media={wedding.profileMedia} label={wedding.coupleName} className="h-20 w-16" />
            <p className="mt-5 font-display text-3xl font-semibold leading-none text-[var(--ink)]">
              {wedding.coupleName}
            </p>
            {eventDateLabel ? (
              <p className="mt-2 text-[0.68rem] font-bold uppercase tracking-[0.2em] text-[var(--champagne-deep)]">
                {eventDateLabel}
              </p>
            ) : null}
            <div className="my-5 flex w-full items-center gap-3" aria-hidden="true">
              <span className="h-px flex-1 bg-[rgba(139,107,63,0.24)]" />
              <span className="font-display text-xl italic text-[var(--champagne-deep)]">&amp;</span>
              <span className="h-px flex-1 bg-[rgba(139,107,63,0.24)]" />
            </div>
            <div className="grid size-64 place-items-center rounded-[28px] border border-[rgba(139,107,63,0.2)] bg-[var(--paper-soft)] p-3 shadow-[0_16px_34px_rgba(58,40,25,0.12)]">
              <canvas ref={canvasRef} className="size-[14.5rem]" aria-label={text.qrCode} />
            </div>
            <p className="mt-5 text-[0.68rem] font-extrabold uppercase tracking-[0.22em] text-[var(--ink-soft)]">
              {text.scan}
            </p>
          </div>
        </div>

        <div className="flex flex-col justify-center rounded-[32px] border border-[rgba(139,107,63,0.16)] bg-white/48 p-4 sm:p-6">
          <p className="eyebrow text-[var(--champagne-deep)]">{text.guestLink}</p>
          <p className="mt-3 font-display text-2xl font-semibold leading-tight text-[var(--ink)]">
            {text.qrTitle}
          </p>
          <div className="mt-6 rounded-[24px] border border-[rgba(55,38,25,0.12)] bg-[rgba(239,225,207,0.58)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
            <p className="break-all text-sm font-semibold leading-6 text-[var(--ink-soft)]">{eventUrl}</p>
          </div>
          <Button className="mt-4 w-fit" onClick={copyLink}>
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? text.copied : text.copy}
          </Button>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Button variant="paper" onClick={downloadPng}>
              <Download className="size-4" />PNG
            </Button>
            <Button variant="paper" onClick={downloadSvg}>
              <Download className="size-4" />SVG
            </Button>
          </div>
        </div>
      </div>
    </motion.article>
  );
}

const STORY_ORIGINAL_IMAGE_MAX_BYTES = 12 * 1024 * 1024;

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

const memoryGridClasses: Record<MemoryGridLayout, string> = {
  story: "grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4",
  classic: "grid min-w-0 grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5",
  compact: "grid min-w-0 grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-8",
};

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

function MemoryInbox({
  filter,
  gridLayout,
  media,
  hasMore,
  loadingMore,
  demoMode,
  onFilterChange,
  onGridLayoutChange,
  onLoadMore,
  onRemoveMedia,
  text,
}: {
  filter: FilterKey;
  gridLayout: MemoryGridLayout;
  media: WeddingMedia[];
  hasMore: boolean;
  loadingMore: boolean;
  demoMode: boolean;
  onFilterChange: (filter: FilterKey) => void;
  onGridLayoutChange: () => void;
  onLoadMore: () => void;
  onRemoveMedia: (mediaId: string) => Promise<void>;
  text: AdminCopy;
}) {
  const [deleteTarget, setDeleteTarget] = useState<WeddingMedia | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const filters: { key: FilterKey; label: string }[] = [
    { key: "all", label: text.all },
    { key: "image", label: text.photos },
    { key: "video", label: text.videos },
    { key: "audio", label: text.voice },
  ];
  const [selectedMedia, setSelectedMedia] = useState<WeddingMedia | null>(null);
  const lightboxRef = useRef<HTMLDivElement>(null);
  const lightboxCloseRef = useRef<HTMLButtonElement>(null);
  const deleteDialogRef = useRef<HTMLDivElement>(null);
  const deleteCancelRef = useRef<HTMLButtonElement>(null);
  const reduceMotion = useReducedMotion();
  const layoutTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const };
  const selectedMediaIndex = selectedMedia
    ? media.findIndex((item) => item.id === selectedMedia.id)
    : -1;
  const currentGridLayoutLabel = memoryGridLayoutLabel(text, gridLayout);

  useBodyScrollLock(Boolean(selectedMedia || deleteTarget));
  useAccessibleDialog({
    open: Boolean(selectedMedia),
    containerRef: lightboxRef,
    initialFocusRef: lightboxCloseRef,
    onClose: () => setSelectedMedia(null),
  });
  useAccessibleDialog({
    open: Boolean(deleteTarget),
    containerRef: deleteDialogRef,
    initialFocusRef: deleteCancelRef,
    onClose: () => {
      if (!deleting) {
        setDeleteTarget(null);
        setDeleteError("");
      }
    },
  });

  const showPreviousMedia = useCallback(() => {
    setSelectedMedia((current) => {
      if (!current || media.length === 0) {
        return current;
      }

      const currentIndex = media.findIndex((item) => item.id === current.id);
      const nextIndex = currentIndex <= 0 ? media.length - 1 : currentIndex - 1;
      return media[nextIndex] ?? current;
    });
  }, [media]);

  const showNextMedia = useCallback(() => {
    setSelectedMedia((current) => {
      if (!current || media.length === 0) {
        return current;
      }

      const currentIndex = media.findIndex((item) => item.id === current.id);
      const nextIndex = currentIndex >= media.length - 1 ? 0 : currentIndex + 1;
      return media[nextIndex] ?? current;
    });
  }, [media]);

  useEffect(() => {
    if (!selectedMedia) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedMedia(null);
      }

      if (event.key === "ArrowLeft") {
        showPreviousMedia();
      }

      if (event.key === "ArrowRight") {
        showNextMedia();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedMedia, showNextMedia, showPreviousMedia]);

  async function confirmDelete() {
    if (!deleteTarget) {
      return;
    }

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
      <article data-memory-inbox="true" className="rounded-[34px] border border-white/75 bg-[var(--paper-soft)] p-4 shadow-none sm:p-6 sm:shadow-[0_20px_58px_rgba(58,40,25,0.1)]">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="eyebrow flex items-center gap-2 text-[var(--champagne-deep)]">
              <CalendarDays className="size-4 shrink-0" />
              {text.inbox}
            </p>
          </div>
          <div className="flex min-w-0 shrink-0 items-center gap-2">
            <Button
              onClick={onGridLayoutChange}
              variant="paper"
              size="compact"
              className="w-36 shrink-0 px-3"
              aria-label={`${text.gridLayout}: ${currentGridLayoutLabel}`}
              title={`${text.gridLayout}: ${currentGridLayoutLabel}`}
            >
              <LayoutGrid className="size-4 shrink-0 text-[var(--champagne-deep)]" />
              <span className="truncate">{currentGridLayoutLabel}</span>
            </Button>
          </div>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-2 min-[390px]:grid-cols-4">
          {filters.map((item) => (
            <Button
              key={item.key}
              onClick={() => onFilterChange(item.key)}
              aria-pressed={filter === item.key}
              variant={filter === item.key ? "ink" : "paper"}
              size="compact"
              className="w-full px-3"
            >
              {item.label}
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
          <div className="relative">
            <LayoutGroup id="memory-grid-layout">
              <div className={memoryGridClasses[gridLayout]}>
              {media.map((item, index) => {
                const useOriginalImage =
                  item.kind === "image" &&
                  ((demoMode && item.url.startsWith("/demo/")) ||
                    (gridLayout === "story" && item.byteSize <= STORY_ORIGINAL_IMAGE_MAX_BYTES));
                const thumbnail = galleryThumbnailFor(item, useOriginalImage);

                return (
                  <motion.button
                    layout="position"
                    transition={{ layout: layoutTransition }}
                    whileHover={reduceMotion ? undefined : { y: -2 }}
                    whileTap={reduceMotion ? undefined : { scale: 0.985 }}
                    type="button"
                    key={item.id}
                    aria-label={`${item.guestName}. ${item.note || text.noNote}`}
                    onClick={() => setSelectedMedia(item)}
                    className={`focus-ring group min-w-0 max-w-full overflow-hidden border border-[var(--line)] bg-white/60 text-left hover:bg-white ${memoryCardClasses[gridLayout]}`}
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
                            delayMs={450 + index * 90}
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
                            {item.kind === "image" ? (
                              <ImageIcon className="size-8" />
                            ) : (
                              <Film className="size-8" />
                            )}
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
              })}
              </div>
            </LayoutGroup>
            {hasMore ? (
              <div className="mt-5 flex justify-center">
                <Button
                  onClick={onLoadMore}
                  loading={loadingMore}
                  variant="paper"
                >
                  {text.loadMore}
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </article>

      <AnimatePresence>
      {selectedMedia ? (
        <motion.div
          className="fixed inset-0 z-[60] grid place-items-center overflow-x-hidden bg-[rgba(31,23,18,0.62)] px-3 py-4 backdrop-blur-md sm:px-4 sm:py-6"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.18 }}
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label={text.close}
            onClick={() => setSelectedMedia(null)}
          />
          <motion.div
            ref={lightboxRef}
            initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.99 }}
            transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-10 grid max-h-[calc(100dvh-2rem)] w-full min-w-0 max-w-[calc(100vw-1.5rem)] gap-4 overflow-y-auto overflow-x-hidden rounded-[32px] border border-white/70 bg-[var(--paper-soft)] p-4 shadow-[0_30px_90px_rgba(0,0,0,0.32)] sm:max-w-5xl sm:p-5"
            data-scroll-lock-allow="true"
            role="dialog"
            aria-modal="true"
            aria-labelledby="memory-lightbox-title"
            tabIndex={-1}
          >
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0 flex-1 pr-1">
                <p id="memory-lightbox-title" className="block max-w-full whitespace-pre-wrap text-sm font-bold leading-snug text-[var(--ink)] [overflow-wrap:anywhere]">
                  {selectedMedia.guestName}
                </p>
                <p className="mt-1 block max-w-full whitespace-pre-wrap text-xs leading-relaxed text-[var(--ink-soft)] [overflow-wrap:anywhere]">
                  {selectedMedia.note || text.noNote}
                </p>
              </div>
              <Button
                ref={lightboxCloseRef}
                onClick={() => setSelectedMedia(null)}
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
                  src={selectedMedia.url}
                  cacheKey={selectedMedia.storagePath ?? selectedMedia.id}
                  alt={selectedMedia.note ?? selectedMedia.fileName}
                  className="max-h-[72dvh] max-w-full object-contain"
                  loading="eager"
                />
              ) : selectedMedia.kind === "video" ? (
                <video
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
                    onClick={showPreviousMedia}
                    variant="paper"
                    size="icon"
                    className="!size-11 !min-h-11"
                    aria-label={text.previousMedia}
                  >
                    <ChevronLeft className="size-5" />
                  </Button>
                  <Button
                    onClick={showNextMedia}
                    variant="paper"
                    size="icon"
                    className="!size-11 !min-h-11"
                    aria-label={text.nextMedia}
                  >
                    <ChevronRight className="size-5" />
                  </Button>
                </div>
              ) : null}
              <div className="ml-auto flex min-w-0 items-center gap-1.5">
                <a
                  href={demoMode ? selectedMedia.url : `/api/media/${selectedMedia.id}/download`}
                  download={selectedMedia.fileName}
                  data-app-button="paper"
                  className={buttonStyles({ variant: "paper", size: "compact", className: "max-w-[8.5rem] gap-1.5 px-3" })}
                >
                  <Download className="size-3.5 shrink-0" />
                  <span className="truncate">{text.download}</span>
                </a>
                <Button
                  onClick={() => {
                    setDeleteTarget(selectedMedia);
                    setSelectedMedia(null);
                    setDeleteError("");
                  }}
                  variant="danger"
                  size="compact"
                  className="max-w-[8rem] gap-1.5 px-3"
                >
                  <Trash2 className="size-3.5 shrink-0" />
                  <span className="truncate">{text.deleteMemory}</span>
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
      </AnimatePresence>

      <AnimatePresence>
      {deleteTarget ? (
        <motion.div
          className="fixed inset-0 z-[60] grid place-items-center bg-[rgba(31,23,18,0.38)] px-4 backdrop-blur-sm"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.18 }}
        >
          <motion.div
            ref={deleteDialogRef}
            initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.99 }}
            transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-sm rounded-[28px] border border-white/75 bg-[var(--paper-soft)] p-5 shadow-[0_28px_80px_rgba(31,23,18,0.24)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-memory-title"
            tabIndex={-1}
          >
            <p id="delete-memory-title" className="font-display text-fluid-subheading font-semibold text-[var(--ink)]">
              {text.deleteTitle}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--ink-soft)]">{text.deleteBody}</p>
            {deleteError ? (
              <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                {deleteError}
              </p>
            ) : null}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <Button
                ref={deleteCancelRef}
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteError("");
                }}
                disabled={deleting}
                variant="paper"
              >
                {text.no}
              </Button>
              <Button
                onClick={confirmDelete}
                disabled={deleting}
                loading={deleting}
                variant="danger"
                className="!bg-[var(--rosewood)] !text-white hover:!bg-[#6f332b]"
              >
                {text.yes}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
      </AnimatePresence>
    </>
  );
}
