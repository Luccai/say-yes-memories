"use client";

import {
  ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Wedding, WeddingMedia } from "@/lib/types";
import {
  clearRetainedMediaCache,
  storeInstantMediaCache,
} from "@/components/shared/CachedMediaImage";
import { GuidanceDialog } from "@/components/shared/GuidanceDialog";
import { AppToast, type AppToastMessage } from "@/components/shared/AppToast";
import { AdminShell } from "@/components/admin/AdminShell";
import { MemoriesPanel } from "@/components/admin/panels/MemoriesPanel";
import { StoragePanel } from "@/components/admin/panels/StoragePanel";
import {
  WeddingPagePanel,
  type CustomerWeddingPatch,
} from "@/components/admin/panels/WeddingPagePanel";
import { QrPanel } from "@/components/admin/panels/QrPanel";
import { compressProfilePhoto } from "@/components/admin/profile-photo";
import type {
  FilterKey,
  MemoryGridLayout,
} from "@/components/admin/types";
import { localizedError, useCopy, useLocale } from "@/lib/i18n-client";
import {
  countMediaLibrary,
  sortMediaLibrary,
  type MediaLibraryCounts,
  type MediaLibraryOrder,
} from "@/lib/media-library";
import { rememberMembership } from "@/lib/auth/device-hint";
import {
  type ClientSignedUploadTarget,
  uploadToSignedTarget,
} from "@/lib/storage/client-upload";
import {
  demoWedding,
  ensureFreshDemoLocalState,
  localizeDemoMedia,
  localizeDemoWedding,
} from "@/lib/demo-content";

type AdminExperienceProps = {
  initialWedding: Wedding;
  initialMedia: WeddingMedia[];
  initialMediaCounts?: MediaLibraryCounts;
  initialMediaHasMore?: boolean;
  initialMediaNextOffset?: number;
  demoMode?: boolean;
};

const MEMORY_GRID_LAYOUT_STORAGE_KEY = "sayyes.admin.memory-grid-layout";
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

type SignedUploadResponse = {
  upload: ClientSignedUploadTarget;
};

export function AdminExperience({
  initialWedding,
  initialMedia,
  initialMediaCounts,
  initialMediaHasMore = false,
  initialMediaNextOffset = initialMedia.length,
  demoMode = false,
}: AdminExperienceProps) {
  const locale = useLocale();
  const [wedding, setWedding] = useState(initialWedding);
  const [media, setMedia] = useState(initialMedia);
  const [mediaCounts, setMediaCounts] = useState(
    initialMediaCounts ?? countMediaLibrary(initialMedia),
  );
  const [mediaHasMore, setMediaHasMore] = useState(initialMediaHasMore);
  const [mediaNextOffset, setMediaNextOffset] = useState(
    initialMediaNextOffset,
  );
  const [loadingMoreMedia, setLoadingMoreMedia] = useState(false);
  const [origin, setOrigin] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [mediaOrder, setMediaOrder] = useState<MediaLibraryOrder>("newest");
  const [gridLayout, setGridLayout] = useState<MemoryGridLayout>("classic");
  const [gridLayoutHydrated, setGridLayoutHydrated] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profileUploading, setProfileUploading] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const demoHydratedRef = useRef(!demoMode);
  const toastIdRef = useRef(0);
  const [toast, setToast] = useState<AppToastMessage | null>(null);
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

  const dismissToast = useCallback(() => setToast(null), []);
  const showToast = useCallback((message: string, tone: AppToastMessage["tone"]) => {
    toastIdRef.current += 1;
    setToast({ id: toastIdRef.current, message, tone });
  }, []);

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
      setMediaCounts(countMediaLibrary(nextMedia));
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
      const searchParams = new URLSearchParams({ order: mediaOrder });
      const response = await fetch(`/api/weddings/current/media?${searchParams}`, {
        cache: "no-store",
      });

      if (!response.ok || !active) {
        return;
      }

      const payload = (await response.json()) as {
        media: WeddingMedia[];
        wedding?: Wedding;
        counts?: MediaLibraryCounts;
        hasMore?: boolean;
        nextOffset?: number;
      };
      setMedia(payload.media ?? []);
      setMediaCounts(payload.counts ?? countMediaLibrary(payload.media ?? []));
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
  }, [demoMode, mediaOrder, wedding.realtimeTopic]);

  async function loadMoreMedia() {
    if (demoMode || loadingMoreMedia || !mediaHasMore) return;
    setLoadingMoreMedia(true);
    try {
      const response = await fetch(
        `/api/weddings/current/media?${new URLSearchParams({
          offset: String(mediaNextOffset),
          limit: "48",
          order: mediaOrder,
        })}`,
        { cache: "no-store" },
      );
      if (!response.ok) return;
      const payload = (await response.json()) as {
        media: WeddingMedia[];
        hasMore: boolean;
        nextOffset: number;
        counts?: MediaLibraryCounts;
      };
      setMedia((current) => {
        const known = new Set(current.map((item) => item.id));
        return [...current, ...payload.media.filter((item) => !known.has(item.id))];
      });
      setMediaHasMore(payload.hasMore);
      setMediaNextOffset(payload.nextOffset);
      setMediaCounts(payload.counts ?? countMediaLibrary(payload.media ?? []));
    } finally {
      setLoadingMoreMedia(false);
    }
  }

  const orderedMedia = useMemo(
    () => sortMediaLibrary(media, mediaOrder),
    [media, mediaOrder],
  );

  async function saveIdentity(patch: CustomerWeddingPatch) {
    dismissToast();

    if (demoMode) {
      setWedding((current) => ({
        ...current,
        welcomeNote: patch.welcomeNote ?? current.welcomeNote,
        uploadLocked: patch.uploadLocked ?? current.uploadLocked,
        updatedAt: new Date().toISOString(),
      }));
      if (patch.welcomeNote !== undefined) {
        showToast(adminText.pageSaved, "success");
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
          showToast(adminText.pageSaved, "success");
        }
      }
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : text.errors.saveIdentityFailed,
        "error",
      );
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

      showToast(
        localizedError(
          rawMessage,
          text.errors,
          alreadyLocalized ? rawMessage : text.errors.profileUploadFailed,
        ),
        "error",
      );
    } finally {
      setProfileUploading(false);
      event.target.value = "";
    }
  }

  async function removeMedia(mediaId: string) {
    const removedMedia = media.find((item) => item.id === mediaId);
    const removeFromCounts = () => {
      if (!removedMedia) return;

      setMediaCounts((current) => ({
        ...current,
        all: Math.max(current.all - 1, 0),
        [removedMedia.kind]: Math.max(current[removedMedia.kind] - 1, 0),
      }));
    };

    if (demoMode) {
      if (isDemoSessionMedia(mediaId)) {
        const { removeDemoSessionMedia } = await import("@/lib/demo-session-media");
        await removeDemoSessionMedia(mediaId);
      }

      setMedia((current) => current.filter((item) => item.id !== mediaId));
      removeFromCounts();
      setMediaNextOffset((current) => Math.max(current - 1, 0));
      return;
    }

    const response = await fetch(`/api/media/${mediaId}`, { method: "DELETE" });

    if (!response.ok) {
      const payload = (await response.json()) as { message?: string };
      throw new Error(localizedError(payload.message, text.errors, adminText.deleteFailed));
    }

    setMedia((current) => current.filter((item) => item.id !== mediaId));
    removeFromCounts();
    setMediaNextOffset((current) => Math.max(current - 1, 0));
  }

  async function logout() {
    if (demoMode) {
      clearRetainedMediaCache();
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
        clearRetainedMediaCache();
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
    <>
      <AdminShell
        wedding={wedding}
        presentationUrl={presentationUrl}
        eventUrl={eventUrl}
        loggingOut={loggingOut}
        logoutError={logoutError}
        onHelp={() => setHelpOpen(true)}
        onLogout={() => void logout()}
        memoriesPanel={(entrySequence) => (
          <MemoriesPanel
            entrySequence={entrySequence}
            filter={filter}
            gridLayout={gridLayout}
            media={orderedMedia}
            mediaCounts={mediaCounts}
            mediaOrder={mediaOrder}
            hasMore={mediaHasMore}
            loadingMore={loadingMoreMedia}
            demoMode={demoMode}
            onFilterChange={setFilter}
            onGridLayoutChange={setGridLayout}
            onMediaOrderChange={setMediaOrder}
            onRemoveMedia={removeMedia}
            onLoadMore={() => void loadMoreMedia()}
            text={adminText}
          />
        )}
        weddingPagePanel={
          <WeddingPagePanel
            key={`${wedding.brideName}|${wedding.groomName}|${wedding.eventDate ?? ""}|${wedding.welcomeNote}`}
            wedding={wedding}
            demoMode={demoMode}
            saving={saving}
            profileUploading={profileUploading}
            onUploadProfileMedia={uploadProfileMedia}
            onDirty={dismissToast}
            onSave={saveIdentity}
            text={adminText}
          />
        }
        qrPanel={<QrPanel wedding={wedding} eventUrl={eventUrl} text={adminText} />}
        storagePanel={
          <StoragePanel wedding={wedding} demoMode={demoMode} text={adminText} />
        }
      />
      <AppToast toast={toast} closeLabel={text.close} onClose={dismissToast} />
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
    </>
  );
}
