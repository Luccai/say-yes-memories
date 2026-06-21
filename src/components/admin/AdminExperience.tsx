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
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Film,
  Image as ImageIcon,
  ImagePlus,
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
} from "lucide-react";
import { motion } from "motion/react";
import { GuestExperience } from "@/components/guest/GuestExperience";
import type { MediaKind, Wedding, WeddingMedia } from "@/lib/types";
import {
  CachedMediaImage,
  storeInstantMediaCache,
} from "@/components/shared/CachedMediaImage";
import { MediaOrb } from "@/components/shared/MediaOrb";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { useCopy } from "@/lib/i18n";
import { makeCoupleName } from "@/lib/text";

type AdminExperienceProps = {
  initialWedding: Wedding;
  initialMedia: WeddingMedia[];
  demoMode?: boolean;
};

type FilterKey = "all" | MediaKind;
type AdminPanel = "memories" | "identity" | "qr" | "guest";
type AdminCopy = ReturnType<typeof useCopy>["admin"];
const DEMO_GUEST_SLUG = "mary-john-demo";
const PROFILE_PHOTO_MAX_BYTES = 500 * 1024;
const PROFILE_PHOTO_MAX_DIMENSION = 1280;
const PROFILE_PHOTO_START_QUALITY = 0.82;
const PROFILE_PHOTO_MIN_QUALITY = 0.46;

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
  const [wedding, setWedding] = useState(initialWedding);
  const [media, setMedia] = useState(initialMedia);
  const [origin, setOrigin] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [activePanel, setActivePanel] = useState<AdminPanel>("memories");
  const [menuOpen, setMenuOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profileUploading, setProfileUploading] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 20, right: 16 });
  const text = useCopy();
  const adminText = text.admin;

  const eventSlug = demoMode ? DEMO_GUEST_SLUG : wedding.slug;
  const eventUrl = `${origin || "https://your-domain.com"}/${eventSlug}`;

  useEffect(() => {
    queueMicrotask(() => setOrigin(window.location.origin));
  }, []);

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

    queueMicrotask(() => {
      const savedWedding = window.localStorage.getItem("sayyes.demo.wedding");
      const savedMedia = window.localStorage.getItem("sayyes.demo.media");

      if (savedWedding) {
        setWedding(JSON.parse(savedWedding) as Wedding);
      }

      if (savedMedia) {
        setMedia(JSON.parse(savedMedia) as WeddingMedia[]);
      }
    });
  }, [demoMode]);

  useEffect(() => {
    if (!demoMode) {
      return;
    }

    window.localStorage.setItem("sayyes.demo.wedding", JSON.stringify(wedding));
    window.localStorage.setItem("sayyes.demo.media", JSON.stringify(media));
  }, [demoMode, media, wedding]);

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
        throw new Error(preparePayload.message ?? "Profile upload could not be prepared.");
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
        throw new Error(uploadError.message);
      }

      const completeResponse = await fetch("/api/weddings/current/profile-media/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ object: preparePayload.upload.object }),
      });
      const payload = (await completeResponse.json()) as { wedding?: Wedding; message?: string };

      if (!completeResponse.ok) {
        throw new Error(payload.message ?? "Profile upload could not be completed.");
      }

      if (payload.wedding) {
        await storeInstantMediaCache(preparePayload.upload.object.storagePath, file);
        setWedding(payload.wedding);
      }
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Profile photo could not be uploaded.");
    } finally {
      setProfileUploading(false);
      event.target.value = "";
    }
  }

  async function removeMedia(mediaId: string) {
    if (demoMode) {
      setMedia((current) => current.filter((item) => item.id !== mediaId));
      return;
    }

    const response = await fetch(`/api/media/${mediaId}`, { method: "DELETE" });

    if (!response.ok) {
      const payload = (await response.json()) as { message?: string };
      throw new Error(payload.message ?? "Media could not be deleted.");
    }

    setMedia((current) => current.filter((item) => item.id !== mediaId));
  }

  function logout() {
    window.location.href = "/login";
  }

  return (
    <main className="min-h-[100dvh] overflow-x-clip text-[var(--ink)]">
      <div className="mx-auto flex max-w-[96rem] min-w-0 flex-col gap-5 overflow-x-clip px-4 py-5 sm:px-6 lg:px-8">
        <header className="paper-grain overflow-hidden rounded-[34px] border border-white/75 bg-[rgba(255,250,243,0.78)] p-5 shadow-[var(--shadow-soft)] backdrop-blur-xl sm:p-7">
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
            <button
              ref={menuButtonRef}
              type="button"
              onClick={() => setMenuOpen((current) => !current)}
              className="focus-ring grid size-12 shrink-0 place-items-center rounded-full border border-[var(--line)] bg-white/62 text-[var(--ink)] shadow-[0_12px_28px_rgba(58,40,25,0.1)] transition hover:bg-white"
              aria-expanded={menuOpen}
              aria-label={adminText.menu}
            >
              <Menu className="size-5" />
            </button>
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
              className="fixed grid w-[min(calc(100vw-2rem),22rem)] gap-2 rounded-[30px] border border-white/75 bg-[var(--paper-soft)] p-3 shadow-[0_24px_70px_rgba(58,40,25,0.2)]"
              style={{ top: menuPosition.top, right: menuPosition.right }}
              aria-label={adminText.menu}
            >
              <AdminMenuButton
                active={activePanel === "memories"}
                label={adminText.memoryRoom}
                onClick={() => {
                  setActivePanel("memories");
                  setMenuOpen(false);
                }}
              />
              <AdminMenuButton
                active={activePanel === "identity"}
                label={adminText.weddingPage}
                onClick={() => {
                  setActivePanel("identity");
                  setMenuOpen(false);
                }}
              />
              <AdminMenuButton
                active={activePanel === "qr"}
                label={adminText.qrAndLink}
                onClick={() => {
                  setActivePanel("qr");
                  setMenuOpen(false);
                }}
              />
              <AdminMenuButton
                active={activePanel === "guest"}
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
                  className="focus-ring inline-flex items-center justify-center gap-1.5 rounded-full border border-[var(--line)] bg-white/42 px-3 py-2 text-xs font-bold text-[var(--ink-soft)] transition hover:bg-white"
                >
                  {adminText.logout}
                  <LogOut className="size-3.5" />
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
              onBack={() => setActivePanel("memories")}
              text={adminText}
            />
          ) : null}

          {activePanel === "memories" ? (
            <MemoryInbox
              filter={filter}
              media={filteredMedia}
              demoMode={demoMode}
              onFilterChange={setFilter}
              onRemoveMedia={removeMedia}
              text={adminText}
            />
          ) : null}
        </section>
      </div>
    </main>
  );
}

function AdminMenuButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`focus-ring rounded-2xl px-4 py-3 text-left text-sm font-bold transition ${
        active
          ? "bg-[var(--ink)] text-[var(--paper-soft)]"
          : "border border-[var(--line)] bg-white/50 text-[var(--ink)] hover:bg-white"
      }`}
    >
      {label}
    </button>
  );
}

function IdentityCard({
  wedding,
  saving,
  profileUploading,
  onUploadProfileMedia,
  onSave,
  text,
}: {
  wedding: Wedding;
  saving: boolean;
  profileUploading: boolean;
  onUploadProfileMedia: (event: ChangeEvent<HTMLInputElement>) => void;
  onSave: (patch: Partial<Wedding>) => void;
  text: AdminCopy;
}) {
  const [eventDate, setEventDate] = useState(wedding.eventDate ?? "");
  const [welcomeNote, setWelcomeNote] = useState(wedding.welcomeNote);
  const [brideName, setBrideName] = useState(wedding.brideName);
  const [groomName, setGroomName] = useState(wedding.groomName);

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-[34px] border border-white/75 bg-[var(--paper-soft)] p-6 shadow-[0_20px_58px_rgba(58,40,25,0.1)]"
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
          <label className="focus-ring mt-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-[var(--ink)] px-4 py-3 text-sm font-bold text-[var(--paper-soft)] transition hover:bg-black">
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
                onChange={(event) => setBrideName(event.target.value)}
                className="focus-ring rounded-2xl border border-[var(--line)] bg-[#f1e8db] px-4 py-3 !text-[16px] outline-none"
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold">
              {text.groomName}
              <input
                value={groomName}
                onChange={(event) => setGroomName(event.target.value)}
                className="focus-ring rounded-2xl border border-[var(--line)] bg-[#f1e8db] px-4 py-3 !text-[16px] outline-none"
              />
            </label>
          </div>
          <label className="grid gap-2 text-sm font-semibold">
            {text.eventDate}
            <input
              type="date"
              value={eventDate}
              onChange={(event) => setEventDate(event.target.value)}
              className="focus-ring rounded-2xl border border-[var(--line)] bg-[#f1e8db] px-4 py-3 !text-[16px] outline-none"
            />
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            {text.welcomeNote}
            <textarea
              value={welcomeNote}
              onChange={(event) => setWelcomeNote(event.target.value)}
              rows={4}
              className="focus-ring rounded-2xl border border-[var(--line)] bg-[#f1e8db] px-4 py-3 !text-[16px] leading-7 outline-none"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => onSave({ brideName, groomName, eventDate, welcomeNote })}
              className="focus-ring rounded-full bg-[var(--ink)] px-5 py-3 text-sm font-bold text-[var(--paper-soft)] transition hover:bg-black"
            >
              {text.saveIdentity}
            </button>
            <button
              type="button"
              onClick={() => onSave({ uploadLocked: !wedding.uploadLocked })}
              className="focus-ring rounded-full border border-[var(--line)] bg-white/65 px-5 py-3 text-sm font-bold text-[var(--ink)] transition hover:bg-white"
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
      className="rounded-[34px] border border-white/75 bg-[var(--paper-soft)] p-6 shadow-[0_20px_58px_rgba(58,40,25,0.1)]"
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
          <div className="relative z-10 mx-auto mt-4 grid size-56 place-items-center rounded-[26px] border border-white/80 bg-[var(--paper-soft)] shadow-[0_18px_38px_rgba(58,40,25,0.12)]">
            <canvas ref={canvasRef} className="size-52" aria-label="Wedding QR code" />
          </div>
        </div>

        <div className="flex flex-col justify-between gap-4">
          <div className="rounded-3xl border border-[var(--line)] bg-white/52 p-4">
            <p className="eyebrow text-[var(--ink-soft)]">{text.guestLink}</p>
            <p className="mt-2 break-all text-base font-semibold tracking-tight text-[var(--ink)]">
              {eventUrl}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <button
              type="button"
              onClick={copyLink}
              className="focus-ring rounded-full bg-[var(--ink)] px-4 py-3 text-sm font-bold text-[var(--paper-soft)] transition hover:bg-black"
            >
              <span className="inline-flex items-center justify-center gap-2">
                <Copy className="size-4" />
                {copied ? text.copied : text.copy}
              </span>
            </button>
            <button
              type="button"
              onClick={downloadPng}
              className="focus-ring rounded-full border border-[var(--line)] bg-white/65 px-4 py-3 text-sm font-bold transition hover:bg-white"
            >
              <span className="inline-flex items-center justify-center gap-2">
                <Download className="size-4" />
                PNG
              </span>
            </button>
            <button
              type="button"
              onClick={downloadSvg}
              className="focus-ring rounded-full border border-[var(--line)] bg-white/65 px-4 py-3 text-sm font-bold transition hover:bg-white"
            >
              <span className="inline-flex items-center justify-center gap-2">
                <Download className="size-4" />
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
  onBack,
  text,
}: {
  wedding: Wedding;
  demoMode: boolean;
  onBack: () => void;
  text: AdminCopy;
}) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 }}
      className="overflow-hidden rounded-[34px] border border-white/75 bg-[rgba(255,250,243,0.76)] p-4 shadow-[0_20px_58px_rgba(58,40,25,0.1)] backdrop-blur sm:p-5"
    >
      <button
        type="button"
        onClick={onBack}
        className="focus-ring mb-3 inline-flex items-center justify-center gap-2 rounded-full border border-[var(--line)] bg-white/62 px-4 py-2 text-xs font-bold text-[var(--ink)] transition hover:bg-white"
      >
        <ChevronLeft className="size-4" />
        {text.backToDashboard}
      </button>
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
  demoMode,
  text,
}: {
  media: WeddingMedia;
  demoMode: boolean;
  text: AdminCopy;
}) {
  const [failedMediaId, setFailedMediaId] = useState<string | null>(null);
  const playbackFailed = failedMediaId === media.id;
  const downloadHref = demoMode ? media.url : `/api/media/${media.id}/download`;

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
      <a
        href={downloadHref}
        download={media.fileName}
        className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-full border border-[var(--line)] bg-white/68 px-4 py-3 text-sm font-bold transition hover:bg-white"
      >
        <Download className="size-4" />
        {text.downloadVoice}
      </a>
    </div>
  );
}

function MemoryInbox({
  filter,
  media,
  demoMode,
  onFilterChange,
  onRemoveMedia,
  text,
}: {
  filter: FilterKey;
  media: WeddingMedia[];
  demoMode: boolean;
  onFilterChange: (filter: FilterKey) => void;
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
      <article className="rounded-[34px] border border-white/75 bg-[var(--paper-soft)] p-6 shadow-[0_20px_58px_rgba(58,40,25,0.1)]">
        <div className="mb-7">
          <p className="eyebrow flex items-center gap-2 text-[var(--champagne-deep)]">
            <CalendarDays className="size-4" />
            {text.inbox}
          </p>
          <h2 className="text-tech-heading mt-2 text-balance text-[var(--ink)]">
            {text.uploads}
          </h2>
        </div>

        <div className="mb-5 flex flex-wrap gap-2">
          {filters.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => onFilterChange(item.key)}
              className={`focus-ring rounded-full px-4 py-2 text-sm font-bold transition ${
                filter === item.key
                  ? "bg-[var(--ink)] text-[var(--paper-soft)]"
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
            <div className="grid min-w-0 grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
              {media.map((item) => {
                const thumbnail = galleryThumbnailFor(item);

                return (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => setSelectedMedia(item)}
                    className="focus-ring group min-w-0 max-w-full overflow-hidden rounded-[22px] border border-[var(--line)] bg-white/60 p-1.5 text-left shadow-[0_14px_34px_rgba(58,40,25,0.08)] transition hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_18px_42px_rgba(58,40,25,0.12)]"
                  >
                  <div className="relative aspect-square w-full min-w-0 max-w-full overflow-hidden rounded-[17px] bg-[#ede1d3]">
                    {item.kind === "image" || item.kind === "video" ? (
                      thumbnail ? (
                        <CachedMediaImage
                          src={thumbnail.url}
                          cacheKey={thumbnail.storagePath ?? thumbnail.id}
                          alt={item.note ?? item.fileName}
                          className="h-full w-full object-cover"
                          loading="lazy"
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
                        <Mic className="size-8" />
                      </div>
                    )}
                    {item.kind === "video" ? (
                      <div className="absolute inset-0 grid place-items-center bg-black/18">
                        <div className="grid size-10 place-items-center rounded-full bg-[var(--paper-soft)] text-[var(--ink)] shadow-[0_16px_36px_rgba(0,0,0,0.2)]">
                          <Play className="ml-0.5 size-4 fill-current" />
                        </div>
                      </div>
                    ) : null}
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 min-w-0 overflow-hidden bg-gradient-to-t from-[rgba(31,23,18,0.7)] to-transparent p-2 text-white">
                      <p className="block max-w-full truncate text-xs font-bold">{item.guestName}</p>
                    </div>
                    <div className="absolute left-2 top-2 grid size-7 place-items-center rounded-full bg-[rgba(255,250,243,0.86)] text-[var(--ink)] shadow-[0_10px_24px_rgba(31,23,18,0.14)] backdrop-blur">
                      {item.kind === "image" ? (
                        <ImageIcon className="size-3.5" />
                      ) : item.kind === "video" ? (
                        <Film className="size-3.5" />
                      ) : (
                        <Mic className="size-3.5" />
                      )}
                    </div>
                  </div>
                  <p className="mt-2 block max-w-full truncate px-1 text-xs font-bold text-[var(--ink)]">{item.guestName}</p>
                  <p className="block max-w-full truncate px-1 pb-1 text-xs text-[var(--ink-soft)]">
                    {item.note || text.noNote}
                  </p>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </article>

      {selectedMedia ? (
        <div className="fixed inset-0 z-[60] grid place-items-center overflow-x-hidden bg-[rgba(31,23,18,0.62)] px-3 py-4 backdrop-blur-md sm:px-4 sm:py-6">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Close"
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
                aria-label="Close"
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
                <AdminAudioPlayer media={selectedMedia} demoMode={demoMode} text={text} />
              )}

              {media.length > 1 ? (
                <>
                  <button
                    type="button"
                    onClick={showPreviousMedia}
                    className="focus-ring absolute left-3 top-1/2 hidden size-10 -translate-y-1/2 place-items-center rounded-full border border-white/70 bg-[rgba(255,250,243,0.86)] text-[var(--ink)] shadow-[0_14px_32px_rgba(31,23,18,0.18)] backdrop-blur transition hover:bg-white sm:grid"
                    aria-label="Previous media"
                  >
                    <ChevronLeft className="size-5" />
                  </button>
                  <button
                    type="button"
                    onClick={showNextMedia}
                    className="focus-ring absolute right-3 top-1/2 hidden size-10 -translate-y-1/2 place-items-center rounded-full border border-white/70 bg-[rgba(255,250,243,0.86)] text-[var(--ink)] shadow-[0_14px_32px_rgba(31,23,18,0.18)] backdrop-blur transition hover:bg-white sm:grid"
                    aria-label="Next media"
                  >
                    <ChevronRight className="size-5" />
                  </button>
                </>
              ) : null}
            </div>

            {media.length > 1 ? (
              <div className="grid grid-cols-2 gap-2 sm:hidden">
                <button
                  type="button"
                  onClick={showPreviousMedia}
                  className="focus-ring inline-flex items-center justify-center gap-2 rounded-full border border-[var(--line)] bg-white/68 px-4 py-3 text-sm font-bold transition hover:bg-white"
                  aria-label="Previous media"
                >
                  <ChevronLeft className="size-4" />
                  {text.previous}
                </button>
                <button
                  type="button"
                  onClick={showNextMedia}
                  className="focus-ring inline-flex items-center justify-center gap-2 rounded-full border border-[var(--line)] bg-white/68 px-4 py-3 text-sm font-bold transition hover:bg-white"
                  aria-label="Next media"
                >
                  {text.next}
                  <ChevronRight className="size-4" />
                </button>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--champagne-deep)]">
                {selectedMediaIndex + 1} / {media.length}
              </p>
              <div className="flex flex-1 justify-end gap-2">
                <a
                  href={demoMode ? selectedMedia.url : `/api/media/${selectedMedia.id}/download`}
                  download={selectedMedia.fileName}
                  className="focus-ring inline-flex items-center justify-center gap-2 rounded-full border border-[var(--line)] bg-white/68 px-4 py-2 text-sm font-bold transition hover:bg-white"
                >
                  <Download className="size-4" />
                  Download
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteTarget(selectedMedia);
                    setSelectedMedia(null);
                    setDeleteError("");
                  }}
                  className="focus-ring inline-flex items-center justify-center gap-2 rounded-full border border-[var(--line)] bg-white/68 px-4 py-2 text-sm font-bold text-[var(--rosewood)] transition hover:bg-white"
                >
                  <Trash2 className="size-4" />
                  {text.deleteTitle.replace("?", "")}
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
