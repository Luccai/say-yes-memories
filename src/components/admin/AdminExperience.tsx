"use client";

import { ChangeEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  ArrowUpRight,
  CalendarDays,
  Copy,
  Download,
  ImagePlus,
  Loader2,
  Lock,
  LogOut,
  Menu,
  Play,
  QrCode,
  Settings2,
  Trash2,
  Unlock,
} from "lucide-react";
import { motion } from "motion/react";
import type { MediaKind, Wedding, WeddingMedia } from "@/lib/types";
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
type AdminPanel = "memories" | "identity" | "qr";
type AdminCopy = ReturnType<typeof useCopy>["admin"];
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

  const eventUrl = `${origin || "https://your-domain.com"}/${wedding.slug}${
    demoMode ? "?demo=1" : ""
  }`;

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
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setProfileUploading(true);

    try {
      if (demoMode) {
        const url = URL.createObjectURL(file);
        setWedding((current) => ({
          ...current,
          profileMedia: {
            id: `demo-profile-${Date.now()}`,
            url,
            kind: file.type.startsWith("video/") ? "video" : "image",
            mimeType: file.type || "application/octet-stream",
            fileName: file.name || "profile-media",
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
        setWedding(payload.wedding);
      }
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

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <main className="min-h-[100dvh] text-[var(--ink)]">
      <div className="mx-auto flex max-w-[96rem] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="paper-grain overflow-hidden rounded-[34px] border border-white/75 bg-[rgba(255,250,243,0.78)] p-5 shadow-[var(--shadow-soft)] backdrop-blur-xl sm:p-7">
          <div className="relative z-20 flex items-center gap-4 sm:gap-5">
            <MediaOrb
              media={wedding.profileMedia}
              label={wedding.coupleName}
              className="h-[4.5rem] w-[3.5rem] shrink-0 sm:h-24 sm:w-20"
            />
            <div className="min-w-0 flex-1">
              <p className="eyebrow text-[var(--champagne-deep)]">{adminText.weddingPage}</p>
              <h1 className="mt-1.5 font-display text-fluid-title font-semibold text-balance text-[var(--ink)]">
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
              <a
                href={eventUrl}
                target="_blank"
                className="focus-ring flex items-center justify-between rounded-2xl border border-[var(--line)] bg-white/50 px-4 py-3 text-sm font-bold text-[var(--ink)] transition hover:bg-white"
              >
                {adminText.openPage}
                <ArrowUpRight className="size-4" />
              </a>
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
          <h2 className="mt-2 font-display text-fluid-heading font-semibold text-balance text-[var(--ink)]">
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
              accept="image/*,video/*"
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
                className="focus-ring rounded-2xl border border-[var(--line)] bg-[#f1e8db] px-4 py-3 outline-none"
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold">
              {text.groomName}
              <input
                value={groomName}
                onChange={(event) => setGroomName(event.target.value)}
                className="focus-ring rounded-2xl border border-[var(--line)] bg-[#f1e8db] px-4 py-3 outline-none"
              />
            </label>
          </div>
          <label className="grid gap-2 text-sm font-semibold">
            {text.eventDate}
            <input
              type="date"
              value={eventDate}
              onChange={(event) => setEventDate(event.target.value)}
              className="focus-ring rounded-2xl border border-[var(--line)] bg-[#f1e8db] px-4 py-3 outline-none"
            />
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            {text.welcomeNote}
            <textarea
              value={welcomeNote}
              onChange={(event) => setWelcomeNote(event.target.value)}
              rows={4}
              className="focus-ring rounded-2xl border border-[var(--line)] bg-[#f1e8db] px-4 py-3 leading-7 outline-none"
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
        <h2 className="mt-2 font-display text-fluid-heading font-semibold text-balance text-[var(--ink)]">
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
          <h2 className="mt-2 font-display text-fluid-heading font-semibold text-balance text-[var(--ink)]">
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
          <div className="luxury-scroll grid max-h-[42rem] gap-4 overflow-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
            {media.map((item) => (
              <div key={item.id} className="rounded-[28px] border border-[var(--line)] bg-white/55 p-3">
                <div className="relative overflow-hidden rounded-[22px] bg-[#ede1d3]">
                  {item.kind === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.url} alt={item.note ?? item.fileName} className="h-52 w-full object-cover" />
                  ) : item.kind === "video" && item.url.startsWith("data:image/") ? (
                    <div className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.url} alt={item.note ?? item.fileName} className="h-52 w-full object-cover" />
                      <div className="absolute inset-0 grid place-items-center bg-black/18">
                        <div className="grid size-14 place-items-center rounded-full bg-[var(--paper-soft)] text-[var(--ink)] shadow-[0_16px_36px_rgba(0,0,0,0.2)]">
                          <Play className="ml-1 size-6 fill-current" />
                        </div>
                      </div>
                    </div>
                  ) : item.kind === "video" ? (
                    <video src={item.url} className="h-52 w-full object-cover" controls />
                  ) : (
                    <div className="grid h-52 place-items-center p-5">
                      <Play className="mb-3 size-8 text-[var(--champagne-deep)]" />
                      <audio src={item.url} controls className="w-full" />
                    </div>
                  )}
                </div>
                <div className="p-2">
                  <p className="mt-2 text-sm font-bold">{item.guestName}</p>
                  <p className="mt-1 line-clamp-2 min-h-10 text-sm leading-5 text-[var(--ink-soft)]">
                    {item.note || text.noNote}
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <a
                      href={demoMode ? item.url : `/api/media/${item.id}/download`}
                      download={item.fileName}
                      className="focus-ring rounded-full border border-[var(--line)] bg-white/65 p-2 text-center transition hover:bg-white"
                      aria-label="Download media"
                    >
                      <Download className="mx-auto size-4" />
                    </a>
              <button
                type="button"
                onClick={() => {
                  setDeleteTarget(item);
                  setDeleteError("");
                }}
                      className="focus-ring rounded-full border border-[var(--line)] bg-white/65 p-2 text-[var(--rosewood)] transition hover:bg-white"
                      aria-label="Delete media"
                    >
                      <Trash2 className="mx-auto size-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </article>

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
