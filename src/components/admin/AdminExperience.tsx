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
import QRCode from "qrcode";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  Film,
  Image as ImageIcon,
  ImagePlus,
  LayoutGrid,
  Loader2,
  Lock,
  LogOut,
  Menu,
  Mic,
  Play,
  QrCode,
  Settings2,
  Trash2,
  Unlock,
  X,
  type LucideIcon,
} from "lucide-react";
import { motion } from "motion/react";
import { GuestExperience } from "@/components/guest/GuestExperience";
import type { MediaKind, Wedding, WeddingMedia } from "@/lib/types";
import {
  CachedMediaImage,
  storeInstantMediaCache,
} from "@/components/shared/CachedMediaImage";
import { GuidanceDialog, HelpTriggerButton } from "@/components/shared/GuidanceDialog";
import { MediaOrb } from "@/components/shared/MediaOrb";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { localizedError, useCopy, useLocale } from "@/lib/i18n";
import { makeCoupleName } from "@/lib/text";
import {
  ensureFreshDemoLocalState,
  localizeDemoMedia,
  localizeDemoWedding,
} from "@/lib/demo-content";
import {
  getDemoSessionMedia,
  isDemoSessionMedia,
  removeDemoSessionMedia,
  subscribeDemoSessionMedia,
} from "@/lib/demo-session-media";

type AdminExperienceProps = {
  initialWedding: Wedding;
  initialMedia: WeddingMedia[];
  demoMode?: boolean;
};

type FilterKey = "all" | MediaKind;
type AdminPanel = "memories" | "identity" | "qr" | "guest";
type MemoryGridLayout = "classic" | "story" | "compact";
type AdminCopy = ReturnType<typeof useCopy>["admin"];
const DEMO_GUEST_SLUG = "mary-john-demo";
const MEMORY_GRID_LAYOUT_STORAGE_KEY = "sayyes.admin.memory-grid-layout";
const MEMORY_GRID_LAYOUTS: MemoryGridLayout[] = ["classic", "story", "compact"];
const PROFILE_PHOTO_MAX_BYTES = 500 * 1024;
const PROFILE_PHOTO_MAX_DIMENSION = 1280;
const PROFILE_PHOTO_START_QUALITY = 0.82;
const PROFILE_PHOTO_MIN_QUALITY = 0.46;
const ADMIN_ACTION_BUTTON_CLASS =
  "focus-ring inline-flex items-center justify-center gap-2 rounded-full border border-[var(--line)] bg-white/58 px-4 py-2.5 text-[0.78rem] font-bold text-[var(--ink)] transition hover:bg-white active:scale-[0.99] disabled:opacity-60";
const ADMIN_DANGER_ACTION_BUTTON_CLASS =
  "focus-ring inline-flex items-center justify-center rounded-full border border-[rgba(124,58,49,0.24)] bg-white/58 px-4 py-2.5 text-[0.78rem] font-bold text-[var(--rosewood)] transition hover:bg-white active:scale-[0.99] disabled:opacity-60";

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

type SignedUploadResponse = {
  upload: {
    bucket: string;
    path: string;
    token: string;
    object: {
      id: string;
      storagePath: string;
      kind: MediaKind;
      mimeType: string;
      fileName: string;
      byteSize: number;
      createdAt: string;
    };
  };
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
  demoMode = false,
}: AdminExperienceProps) {
  const locale = useLocale();
  const [wedding, setWedding] = useState(initialWedding);
  const [media, setMedia] = useState(initialMedia);
  const [origin, setOrigin] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [gridLayout, setGridLayout] = useState<MemoryGridLayout>("classic");
  const [gridLayoutHydrated, setGridLayoutHydrated] = useState(false);
  const [activePanel, setActivePanel] = useState<AdminPanel>("memories");
  const [menuOpen, setMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profileUploading, setProfileUploading] = useState(false);
  const demoHydratedRef = useRef(!demoMode);
  const [identitySaveConfirmed, setIdentitySaveConfirmed] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 20, right: 16 });
  const text = useCopy();
  const adminText = text.admin;
  const adminHelpCards = demoMode
    ? [...adminText.helpCards, adminText.demoHelpCard]
    : adminText.helpCards;

  const eventSlug = demoMode ? DEMO_GUEST_SLUG : wedding.slug;
  const eventUrl = `${origin || "https://your-domain.com"}/${eventSlug}`;

  useEffect(() => {
    queueMicrotask(() => setOrigin(window.location.origin));
  }, []);

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

    async function hydrateDemoState() {
      ensureFreshDemoLocalState();

      const savedWedding = window.localStorage.getItem("sayyes.demo.wedding");
      const savedMedia = window.localStorage.getItem("sayyes.demo.media");
      const sourceWedding = savedWedding ? (JSON.parse(savedWedding) as Wedding) : initialWedding;
      const sourceMedia = savedMedia
        ? (JSON.parse(savedMedia) as WeddingMedia[]).filter((item) => !isDemoSessionMedia(item.id))
        : initialMedia;
      const sessionMedia = await getDemoSessionMedia();

      if (!active) {
        return;
      }

      const nextWedding = localizeDemoWedding(sourceWedding, locale);
      const nextMedia = mergeDemoMedia(localizeDemoMedia(sourceMedia, locale), sessionMedia);

      setWedding(nextWedding);
      setMedia(nextMedia);
      persistDemoLocalState(nextWedding, nextMedia);
      demoHydratedRef.current = true;
    }

    void hydrateDemoState();

    return () => {
      active = false;
    };
  }, [demoMode, initialMedia, initialWedding, locale]);

  useEffect(() => {
    if (!demoMode || !demoHydratedRef.current) {
      return;
    }

    persistDemoLocalState(wedding, media);
  }, [demoMode, media, wedding]);

  useEffect(() => {
    if (!demoMode) {
      return;
    }

    let active = true;

    async function syncSessionMedia() {
      const sessionMedia = await getDemoSessionMedia();

      if (!active) {
        return;
      }

      setMedia((current) =>
        mergeDemoMedia(
          current.filter((item) => !isDemoSessionMedia(item.id)),
          sessionMedia,
        ),
      );
    }

    const unsubscribe = subscribeDemoSessionMedia(() => {
      void syncSessionMedia();
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [demoMode]);

  useEffect(() => {
    if (demoMode) {
      return;
    }

    let active = true;
    const syncMedia = async () => {
      const response = await fetch("/api/weddings/current/media", { cache: "no-store" });

      if (!response.ok || !active) {
        return;
      }

      const payload = (await response.json()) as { media: WeddingMedia[] };
      setMedia(payload.media ?? []);
    };
    const syncIfVisible = () => {
      if (!document.hidden) {
        void syncMedia();
      }
    };
    const supabase = getSupabaseBrowser();
    const realtimeChannel = wedding.realtimeTopic
      ? supabase
          .channel(`wedding:${wedding.realtimeTopic}`)
          .on("broadcast", { event: "media_changed" }, syncIfVisible)
          .subscribe((status) => {
            if (status === "SUBSCRIBED") {
              void syncMedia();
            }
          })
      : null;

    void syncMedia();
    const interval = window.setInterval(syncIfVisible, 30000);
    window.addEventListener("focus", syncIfVisible);
    document.addEventListener("visibilitychange", syncIfVisible);

    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", syncIfVisible);
      document.removeEventListener("visibilitychange", syncIfVisible);
      if (realtimeChannel) {
        void supabase.removeChannel(realtimeChannel);
      }
    };
  }, [demoMode, wedding.realtimeTopic]);

  const filteredMedia = useMemo(() => {
    if (filter === "all") {
      return media;
    }

    return media.filter((item) => item.kind === filter);
  }, [filter, media]);

  async function saveIdentity(patch: Partial<Wedding>) {
    setIdentitySaveConfirmed(false);

    if (demoMode) {
      setWedding((current) => ({
        ...current,
        brideName: patch.brideName ?? current.brideName,
        groomName: patch.groomName ?? current.groomName,
        coupleName:
          patch.brideName !== undefined || patch.groomName !== undefined
            ? makeCoupleName(
                patch.brideName ?? current.brideName,
                patch.groomName ?? current.groomName,
              )
            : current.coupleName,
        eventDate: patch.eventDate ?? current.eventDate,
        welcomeNote: patch.welcomeNote ?? current.welcomeNote,
        uploadLocked: patch.uploadLocked ?? current.uploadLocked,
        updatedAt: new Date().toISOString(),
      }));
      if (
        patch.brideName !== undefined ||
        patch.groomName !== undefined ||
        patch.eventDate !== undefined ||
        patch.welcomeNote !== undefined
      ) {
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
        body: JSON.stringify({
          brideName: patch.brideName ?? wedding.brideName,
          groomName: patch.groomName ?? wedding.groomName,
          eventDate: patch.eventDate ?? wedding.eventDate ?? "",
          welcomeNote: patch.welcomeNote ?? wedding.welcomeNote,
          uploadLocked: patch.uploadLocked ?? wedding.uploadLocked,
        }),
      });
      const payload = (await response.json()) as { wedding: Wedding };

      if (payload.wedding) {
        setWedding(payload.wedding);
        if (
          patch.brideName !== undefined ||
          patch.groomName !== undefined ||
          patch.eventDate !== undefined ||
          patch.welcomeNote !== undefined
        ) {
          setIdentitySaveConfirmed(true);
          window.setTimeout(() => setIdentitySaveConfirmed(false), 2600);
        }
      }
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

      const supabase = getSupabaseBrowser();
      const { error: uploadError } = await supabase.storage
        .from(preparePayload.upload.bucket)
        .uploadToSignedUrl(
          preparePayload.upload.path,
          preparePayload.upload.token,
          file,
          {
            cacheControl: "31536000",
            contentType: preparePayload.upload.object.mimeType,
          },
        );

      if (uploadError) {
        throw new Error(localizedError(uploadError.message, text.errors, text.errors.profileUploadFailed));
      }

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
        await removeDemoSessionMedia(mediaId);
      }

      setMedia((current) => current.filter((item) => item.id !== mediaId));
      return;
    }

    const response = await fetch(`/api/media/${mediaId}`, { method: "DELETE" });

    if (!response.ok) {
      const payload = (await response.json()) as { message?: string };
      throw new Error(localizedError(payload.message, text.errors, adminText.deleteFailed));
    }

    setMedia((current) => current.filter((item) => item.id !== mediaId));
  }

  function logout() {
    window.location.href = "/login";
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
              <button
                ref={menuButtonRef}
                type="button"
                onClick={() => setMenuOpen((current) => !current)}
                className="focus-ring grid size-12 shrink-0 place-items-center rounded-full border border-[var(--line)] bg-white/62 text-[var(--ink)] shadow-none transition hover:bg-white sm:shadow-[0_12px_28px_rgba(58,40,25,0.1)]"
                aria-expanded={menuOpen}
                aria-label={adminText.menu}
              >
                <Menu className="size-5" />
              </button>
            </div>
          </div>
        </header>

        {menuOpen ? (
          <div className="fixed inset-0 z-50">
            <button
              type="button"
              className="absolute inset-0 cursor-default bg-transparent"
              aria-label={text.close}
              onClick={() => setMenuOpen(false)}
            />
            <motion.nav
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="fixed grid w-[min(calc(100vw-2rem),22rem)] gap-2 rounded-[30px] border border-white/80 bg-[rgba(255,250,243,0.92)] p-2.5 shadow-[0_18px_52px_rgba(58,40,25,0.16)] backdrop-blur-xl sm:shadow-[0_24px_70px_rgba(58,40,25,0.2)]"
              style={{ top: menuPosition.top, right: menuPosition.right }}
              aria-label={adminText.menu}
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
              <AdminMenuButton
                active={activePanel === "guest"}
                icon={ExternalLink}
                label={adminText.openPage}
                onClick={() => {
                  setActivePanel("guest");
                  setMenuOpen(false);
                }}
              />
              <div className="mt-1 flex justify-end border-t border-[var(--line)] pt-2">
                <button
                  type="button"
                  onClick={logout}
                  className="focus-ring inline-flex w-full items-center justify-between gap-3 rounded-[18px] border border-[rgba(124,58,49,0.16)] bg-white/42 px-3 py-2.5 text-sm font-bold text-[var(--rosewood)] transition hover:bg-white active:scale-[0.99]"
                >
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full border border-[rgba(124,58,49,0.16)] bg-white/58">
                      <LogOut className="size-3.5" />
                    </span>
                    <span className="truncate">{adminText.logout}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 opacity-55" />
                </button>
              </div>
            </motion.nav>
          </div>
        ) : null}

        <section className="grid gap-5">
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

          {activePanel === "guest" ? (
            <GuestPagePanel
              wedding={wedding}
              demoMode={demoMode}
            />
          ) : null}

          {activePanel === "memories" ? (
            <MemoryInbox
              filter={filter}
              gridLayout={gridLayout}
              media={filteredMedia}
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
              text={adminText}
            />
          ) : null}
        </section>
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
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`focus-ring group relative flex min-h-11 w-full items-center gap-2.5 overflow-hidden rounded-[18px] border px-2.5 py-2 text-left text-[0.82rem] font-extrabold transition active:scale-[0.99] sm:text-[0.84rem] ${
        active
          ? "border-[rgba(139,107,63,0.24)] bg-[linear-gradient(135deg,rgba(199,166,111,0.22),rgba(255,250,243,0.84))] text-[var(--ink)] shadow-[inset_0_1px_0_rgba(255,255,255,0.86),0_10px_22px_rgba(139,107,63,0.12)]"
          : "border-transparent bg-white/44 text-[var(--ink)] hover:border-[var(--line)] hover:bg-white/72"
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
    </button>
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
  onSave: (patch: Partial<Wedding>) => Promise<void>;
  text: AdminCopy;
}) {
  const [eventDate, setEventDate] = useState(wedding.eventDate ?? "");
  const [welcomeNote, setWelcomeNote] = useState(wedding.welcomeNote);
  const [brideName, setBrideName] = useState(wedding.brideName);
  const [groomName, setGroomName] = useState(wedding.groomName);

  async function handleSaveIdentity() {
    await onSave({ brideName, groomName, eventDate, welcomeNote });
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
          <label className={`${ADMIN_ACTION_BUTTON_CLASS} mt-4 w-full cursor-pointer`}>
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
            <label className="grid gap-2 text-sm font-semibold">
              {text.brideName}
              <input
                value={brideName}
                onChange={(event) => {
                  setBrideName(event.target.value);
                  markDirty();
                }}
                className="focus-ring rounded-2xl border border-[var(--line)] bg-[#f1e8db] px-4 py-3 !text-[16px] outline-none"
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold">
              {text.groomName}
              <input
                value={groomName}
                onChange={(event) => {
                  setGroomName(event.target.value);
                  markDirty();
                }}
                className="focus-ring rounded-2xl border border-[var(--line)] bg-[#f1e8db] px-4 py-3 !text-[16px] outline-none"
              />
            </label>
          </div>
          <label className="grid gap-2 text-sm font-semibold">
            {text.eventDate}
            <input
              type="date"
              value={eventDate}
              onChange={(event) => {
                setEventDate(event.target.value);
                markDirty();
              }}
              className="focus-ring rounded-2xl border border-[var(--line)] bg-[#f1e8db] px-4 py-3 !text-[16px] outline-none"
            />
          </label>
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
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={handleSaveIdentity}
              className={ADMIN_ACTION_BUTTON_CLASS}
            >
              <Check className="size-3.5" />
              {text.saveIdentity}
            </button>
            <button
              type="button"
              onClick={() => onSave({ uploadLocked: !wedding.uploadLocked })}
              className={ADMIN_ACTION_BUTTON_CLASS}
            >
              <span className="inline-flex items-center justify-center gap-2">
                {wedding.uploadLocked ? <Lock className="size-4" /> : <Unlock className="size-4" />}
                {wedding.uploadLocked ? text.uploadsLocked : text.uploadsOpen}
              </span>
            </button>
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!canvasRef.current || !eventUrl) {
      return;
    }

    void QRCode.toCanvas(canvasRef.current, eventUrl, {
      width: 208,
      margin: 1,
      color: {
        dark: "#1f1712",
        light: "#fffaf3",
      },
    });
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
      className="rounded-[34px] border border-white/75 bg-[var(--paper-soft)] p-6 shadow-none sm:shadow-[0_20px_58px_rgba(58,40,25,0.1)]"
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

      <div className="grid gap-5 lg:grid-cols-[17rem_1fr]">
        <div className="paper-grain relative overflow-hidden rounded-[30px] border border-[var(--line)] bg-[#f3eadf] p-5 text-center">
          <p className="eyebrow relative z-10 text-[var(--champagne-deep)]">
            {text.scan}
          </p>
          <div className="relative z-10 mx-auto mt-4 grid size-56 place-items-center rounded-[26px] border border-white/80 bg-[var(--paper-soft)] shadow-none sm:shadow-[0_18px_38px_rgba(58,40,25,0.12)]">
            <canvas ref={canvasRef} className="size-52" aria-label={text.qrCode} />
          </div>
        </div>

        <div className="flex flex-col justify-between gap-4">
          <div className="rounded-3xl border border-[var(--line)] bg-white/52 p-4">
            <p className="eyebrow text-[var(--ink-soft)]">{text.guestLink}</p>
            <p className="mt-2 break-all text-base font-semibold tracking-tight text-[var(--ink)]">
              {eventUrl}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <button
              type="button"
              onClick={copyLink}
              className={ADMIN_ACTION_BUTTON_CLASS}
            >
              <span className="inline-flex items-center justify-center gap-2">
                <Copy className="size-3.5 shrink-0" />
                {copied ? text.copied : text.copy}
              </span>
            </button>
            <button
              type="button"
              onClick={downloadPng}
              className={ADMIN_ACTION_BUTTON_CLASS}
            >
              <span className="inline-flex items-center justify-center gap-2">
                <Download className="size-3.5 shrink-0" />
                PNG
              </span>
            </button>
            <button
              type="button"
              onClick={downloadSvg}
              className={ADMIN_ACTION_BUTTON_CLASS}
            >
              <span className="inline-flex items-center justify-center gap-2">
                <Download className="size-3.5 shrink-0" />
                SVG
              </span>
            </button>
          </div>
        </div>
      </div>
    </motion.article>
  );
}

function GuestPagePanel({
  wedding,
  demoMode,
}: {
  wedding: Wedding;
  demoMode: boolean;
}) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 }}
      className="overflow-hidden rounded-[34px] border border-white/75 bg-[rgba(255,250,243,0.76)] p-4 shadow-none backdrop-blur sm:p-5 sm:shadow-[0_20px_58px_rgba(58,40,25,0.1)]"
    >
      <GuestExperience wedding={wedding} demoMode={demoMode} embedded />
    </motion.article>
  );
}

function galleryThumbnailFor(item: WeddingMedia) {
  if (item.thumbnail) {
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
  demoMode,
  onFilterChange,
  onGridLayoutChange,
  onRemoveMedia,
  text,
}: {
  filter: FilterKey;
  gridLayout: MemoryGridLayout;
  media: WeddingMedia[];
  demoMode: boolean;
  onFilterChange: (filter: FilterKey) => void;
  onGridLayoutChange: () => void;
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
  const selectedMediaIndex = selectedMedia
    ? media.findIndex((item) => item.id === selectedMedia.id)
    : -1;
  const currentGridLayoutLabel = memoryGridLayoutLabel(text, gridLayout);

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
      <article className="rounded-[34px] border border-white/75 bg-[var(--paper-soft)] p-4 shadow-none sm:p-6 sm:shadow-[0_20px_58px_rgba(58,40,25,0.1)]">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="eyebrow flex items-center gap-2 text-[var(--champagne-deep)]">
              <CalendarDays className="size-4 shrink-0" />
              {text.inbox}
            </p>
          </div>
          <button
            type="button"
            onClick={onGridLayoutChange}
            className={`${ADMIN_ACTION_BUTTON_CLASS} h-10 max-w-[8.5rem] shrink-0 px-3`}
            aria-label={`${text.gridLayout}: ${currentGridLayoutLabel}`}
            title={`${text.gridLayout}: ${currentGridLayoutLabel}`}
          >
            <LayoutGrid className="size-4 shrink-0 text-[var(--champagne-deep)]" />
            <span className="truncate">{currentGridLayoutLabel}</span>
          </button>
        </div>

        <div className="mb-5 flex flex-wrap gap-2">
          {filters.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => onFilterChange(item.key)}
              className={`focus-ring rounded-full px-3.5 py-2 text-[0.78rem] font-bold transition ${
                filter === item.key
                  ? "border border-[rgba(139,107,63,0.26)] bg-[rgba(199,166,111,0.16)] text-[var(--ink)]"
                  : "border border-[var(--line)] bg-white/55 text-[var(--ink-soft)] hover:bg-white"
              }`}
            >
              {item.label}
            </button>
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
            <motion.div
              layout
              className={memoryGridClasses[gridLayout]}
              transition={{ layout: { duration: 0.42, ease: [0.16, 1, 0.3, 1] } }}
            >
              {media.map((item, index) => {
                const thumbnail = galleryThumbnailFor(item);

                return (
                  <motion.button
                    layout="position"
                    transition={{ layout: { duration: 0.42, ease: [0.16, 1, 0.3, 1] } }}
                    type="button"
                    key={item.id}
                    aria-label={`${item.guestName}. ${item.note || text.noNote}`}
                    onClick={() => setSelectedMedia(item)}
                    className={`focus-ring group min-w-0 max-w-full overflow-hidden border border-[var(--line)] bg-white/60 text-left transition duration-200 hover:bg-white sm:hover:-translate-y-0.5 ${memoryCardClasses[gridLayout]}`}
                  >
                    <div
                      className={`relative w-full min-w-0 max-w-full overflow-hidden bg-[#ede1d3] ${memoryMediaFrameClasses[gridLayout]}`}
                    >
                      {item.kind === "image" || item.kind === "video" ? (
                        thumbnail ? (
                          <CachedMediaImage
                            src={thumbnail.url}
                            cacheKey={thumbnail.storagePath ?? thumbnail.id}
                            alt={item.note ?? item.fileName}
                            className="h-full w-full object-cover"
                            loading={index < 12 ? "eager" : "lazy"}
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
                    {gridLayout !== "compact" ? (
                      <div className="px-1 pb-1 pt-2">
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
                      </div>
                    ) : null}
                  </motion.button>
                );
              })}
            </motion.div>
          </div>
        )}
      </article>

      {selectedMedia ? (
        <div className="fixed inset-0 z-[60] grid place-items-center overflow-x-hidden bg-[rgba(31,23,18,0.62)] px-3 py-4 backdrop-blur-md sm:px-4 sm:py-6">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label={text.close}
            onClick={() => setSelectedMedia(null)}
          />
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="relative z-10 grid max-h-[calc(100dvh-2rem)] w-full min-w-0 max-w-[calc(100vw-1.5rem)] gap-4 overflow-y-auto overflow-x-hidden rounded-[32px] border border-white/70 bg-[var(--paper-soft)] p-4 shadow-[0_30px_90px_rgba(0,0,0,0.32)] sm:max-w-5xl sm:p-5"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0 flex-1 pr-1">
                <p className="block max-w-full whitespace-pre-wrap text-sm font-bold leading-snug text-[var(--ink)] [overflow-wrap:anywhere]">
                  {selectedMedia.guestName}
                </p>
                <p className="mt-1 block max-w-full whitespace-pre-wrap text-xs leading-relaxed text-[var(--ink-soft)] [overflow-wrap:anywhere]">
                  {selectedMedia.note || text.noNote}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedMedia(null)}
                className="focus-ring grid size-10 shrink-0 place-items-center rounded-full border border-[var(--line)] bg-white/70 text-[var(--ink)] transition hover:bg-white"
                aria-label={text.close}
              >
                <X className="size-4" />
              </button>
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

              {media.length > 1 ? (
                <>
                  <button
                    type="button"
                    onClick={showPreviousMedia}
                    className="focus-ring absolute left-3 top-1/2 hidden size-9 -translate-y-1/2 place-items-center rounded-full border border-white/60 bg-[rgba(255,250,243,0.74)] text-[var(--ink-soft)] shadow-[0_10px_26px_rgba(31,23,18,0.14)] backdrop-blur transition hover:bg-white hover:text-[var(--ink)] sm:grid"
                    aria-label={text.previousMedia}
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={showNextMedia}
                    className="focus-ring absolute right-3 top-1/2 hidden size-9 -translate-y-1/2 place-items-center rounded-full border border-white/60 bg-[rgba(255,250,243,0.74)] text-[var(--ink-soft)] shadow-[0_10px_26px_rgba(31,23,18,0.14)] backdrop-blur transition hover:bg-white hover:text-[var(--ink)] sm:grid"
                    aria-label={text.nextMedia}
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded-[22px] border border-white/70 bg-white/48 p-2 shadow-[0_12px_32px_rgba(58,40,25,0.08)]">
              <p className="rounded-full border border-[var(--line)] bg-[rgba(255,250,243,0.72)] px-3 py-2 text-[0.7rem] font-bold uppercase tracking-[0.14em] text-[var(--champagne-deep)]">
                {selectedMediaIndex + 1} / {media.length}
              </p>
              {media.length > 1 ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={showPreviousMedia}
                    className="focus-ring grid size-10 place-items-center rounded-full border border-[rgba(139,107,63,0.24)] bg-white/72 text-[var(--ink)] shadow-[0_10px_24px_rgba(58,40,25,0.12)] transition hover:bg-white active:scale-[0.98]"
                    aria-label={text.previousMedia}
                  >
                    <ChevronLeft className="size-5" />
                  </button>
                  <button
                    type="button"
                    onClick={showNextMedia}
                    className="focus-ring grid size-10 place-items-center rounded-full border border-[rgba(139,107,63,0.24)] bg-white/72 text-[var(--ink)] shadow-[0_10px_24px_rgba(58,40,25,0.12)] transition hover:bg-white active:scale-[0.98]"
                    aria-label={text.nextMedia}
                  >
                    <ChevronRight className="size-5" />
                  </button>
                </div>
              ) : null}
              <div className="ml-auto flex min-w-0 items-center gap-1.5">
                <a
                  href={demoMode ? selectedMedia.url : `/api/media/${selectedMedia.id}/download`}
                  download={selectedMedia.fileName}
                  className="focus-ring inline-flex max-w-[8.5rem] items-center justify-center gap-1.5 rounded-full border border-[var(--line)] bg-white/62 px-3 py-2 text-[0.78rem] font-bold text-[var(--ink)] transition hover:bg-white"
                >
                  <Download className="size-3.5 shrink-0" />
                  <span className="truncate">{text.download}</span>
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteTarget(selectedMedia);
                    setSelectedMedia(null);
                    setDeleteError("");
                  }}
                  className={`${ADMIN_DANGER_ACTION_BUTTON_CLASS} max-w-[8rem] gap-1.5 px-3 py-2`}
                >
                  <Trash2 className="size-3.5 shrink-0" />
                  <span className="truncate">{text.deleteMemory}</span>
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-[rgba(31,23,18,0.38)] px-4 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="w-full max-w-sm rounded-[28px] border border-white/75 bg-[var(--paper-soft)] p-5 shadow-[0_28px_80px_rgba(31,23,18,0.24)]"
            role="dialog"
            aria-modal="true"
          >
            <p className="font-display text-fluid-subheading font-semibold text-[var(--ink)]">
              {text.deleteTitle}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--ink-soft)]">{text.deleteBody}</p>
            {deleteError ? (
              <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                {deleteError}
              </p>
            ) : null}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteError("");
                }}
                disabled={deleting}
                className="focus-ring rounded-full border border-[var(--line)] bg-white/65 px-4 py-3 text-sm font-bold transition hover:bg-white disabled:opacity-60"
              >
                {text.no}
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="focus-ring rounded-full bg-[var(--rosewood)] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#6f332b] disabled:opacity-60"
              >
                {deleting ? <Loader2 className="mx-auto size-4 animate-spin" /> : text.yes}
              </button>
            </div>
          </motion.div>
        </div>
      ) : null}
    </>
  );
}
