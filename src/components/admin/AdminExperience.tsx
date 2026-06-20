"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  ArrowUpRight,
  CalendarDays,
  Copy,
  Download,
  Eye,
  EyeOff,
  Heart,
  ImagePlus,
  Loader2,
  Lock,
  LogOut,
  Play,
  QrCode,
  RefreshCw,
  Settings2,
  Trash2,
  Unlock,
} from "lucide-react";
import { motion } from "motion/react";
import type { MediaKind, Wedding, WeddingMedia } from "@/lib/types";
import { BrandMark } from "@/components/shared/BrandMark";
import { MediaOrb } from "@/components/shared/MediaOrb";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { useCopy } from "@/lib/i18n";

type AdminExperienceProps = {
  initialWedding: Wedding;
  initialMedia: WeddingMedia[];
  demoMode?: boolean;
};

type FilterKey = "all" | "favorite" | MediaKind;
type AdminCopy = ReturnType<typeof useCopy>["admin"];

export function AdminExperience({
  initialWedding,
  initialMedia,
  demoMode = false,
}: AdminExperienceProps) {
  const [wedding, setWedding] = useState(initialWedding);
  const [media, setMedia] = useState(initialMedia);
  const [origin, setOrigin] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [saving, setSaving] = useState(false);
  const [profileUploading, setProfileUploading] = useState(false);
  const text = useCopy();
  const adminText = text.admin;

  const eventUrl = `${origin || "https://your-domain.com"}/${wedding.slug}${
    demoMode ? "?demo=1" : ""
  }`;

  useEffect(() => {
    queueMicrotask(() => setOrigin(window.location.origin));
  }, []);

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
    if (demoMode || !wedding.realtimeTopic) {
      return;
    }

    let active = true;
    const supabase = getSupabaseBrowser();
    const syncMedia = async () => {
      const response = await fetch("/api/weddings/current/media", { cache: "no-store" });

      if (!response.ok || !active) {
        return;
      }

      const payload = (await response.json()) as { media: WeddingMedia[] };
      setMedia(payload.media ?? []);
    };
    const channel = supabase
      .channel(`wedding:${wedding.realtimeTopic}`)
      .on("broadcast", { event: "media-created" }, ({ payload }) => {
        const item = payload as WeddingMedia;
        setMedia((current) => [item, ...current.filter((existing) => existing.id !== item.id)]);
      })
      .on("broadcast", { event: "media-updated" }, ({ payload }) => {
        const item = payload as WeddingMedia;
        setMedia((current) =>
          current.map((existing) => (existing.id === item.id ? item : existing)),
        );
      })
      .on("broadcast", { event: "media-deleted" }, ({ payload }) => {
        const item = payload as { id: string };
        setMedia((current) => current.filter((existing) => existing.id !== item.id));
      })
      .subscribe();
    const interval = window.setInterval(syncMedia, 2500);

    return () => {
      active = false;
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [demoMode, wedding.realtimeTopic]);

  const filteredMedia = useMemo(() => {
    if (filter === "all") {
      return media;
    }

    if (filter === "favorite") {
      return media.filter((item) => item.favorite);
    }

    return media.filter((item) => item.kind === filter);
  }, [filter, media]);

  const stats = useMemo(
    () => ({
      total: media.length,
      favorite: media.filter((item) => item.favorite).length,
      hidden: media.filter((item) => item.hidden).length,
      visible: media.filter((item) => !item.hidden && item.approved).length,
    }),
    [media],
  );

  async function saveIdentity(patch: Partial<Wedding>) {
    if (demoMode) {
      setWedding((current) => ({
        ...current,
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

      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/weddings/current/profile-media", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as { wedding: Wedding };

      if (payload.wedding) {
        setWedding(payload.wedding);
      }
    } finally {
      setProfileUploading(false);
      event.target.value = "";
    }
  }

  async function refreshMedia() {
    if (demoMode) {
      return;
    }

    const response = await fetch("/api/weddings/current/media", { cache: "no-store" });
    const payload = (await response.json()) as { media: WeddingMedia[] };
    setMedia(payload.media ?? []);
  }

  async function patchMedia(mediaId: string, patch: Partial<WeddingMedia>) {
    if (demoMode) {
      setMedia((current) =>
        current.map((item) => (item.id === mediaId ? { ...item, ...patch } : item)),
      );
      return;
    }

    const response = await fetch(`/api/media/${mediaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const payload = (await response.json()) as { media: WeddingMedia };

    if (payload.media) {
      setMedia((current) =>
        current.map((item) => (item.id === mediaId ? payload.media : item)),
      );
    }
  }

  async function removeMedia(mediaId: string) {
    if (demoMode) {
      setMedia((current) => current.filter((item) => item.id !== mediaId));
      return;
    }

    const response = await fetch(`/api/media/${mediaId}`, { method: "DELETE" });

    if (response.ok) {
      setMedia((current) => current.filter((item) => item.id !== mediaId));
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <main className="min-h-screen text-[var(--ink)]">
      <div className="mx-auto flex max-w-[96rem] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="paper-grain overflow-hidden rounded-[34px] border border-white/75 bg-[rgba(255,250,243,0.78)] p-5 shadow-[var(--shadow-soft)] backdrop-blur-xl sm:p-7">
          <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-5">
              <MediaOrb media={wedding.profileMedia} label={wedding.coupleName} className="h-24 w-20" />
              <div>
                <BrandMark compact />
                <h1 className="mt-4 font-[var(--font-display)] text-5xl font-semibold leading-none sm:text-6xl">
                  {wedding.coupleName}
                </h1>
                <a
                  href={eventUrl}
                  target="_blank"
                  className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-[var(--champagne-deep)]"
                >
                  /{wedding.slug}
                  <ArrowUpRight className="size-4" />
                </a>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:min-w-[32rem]">
              <StatTile label={adminText.memories} value={stats.total} />
              <StatTile label={adminText.featured} value={stats.favorite} />
              <StatTile label={adminText.visible} value={stats.visible} />
              <StatTile label={adminText.hidden} value={stats.hidden} />
            </div>
          </div>
        </header>

        <section className="grid gap-5 xl:grid-cols-[0.92fr_1.08fr]">
          <div className="grid gap-5">
            <IdentityCard
              wedding={wedding}
              saving={saving}
              profileUploading={profileUploading}
              onUploadProfileMedia={uploadProfileMedia}
              onSave={saveIdentity}
              text={adminText}
            />
            <GuestPreview wedding={wedding} eventUrl={eventUrl} text={adminText} />
          </div>
          <div className="grid gap-5">
            <QrStudio wedding={wedding} eventUrl={eventUrl} text={adminText} />
            <MemoryInbox
              filter={filter}
              media={filteredMedia}
              onFilterChange={setFilter}
              onRefresh={refreshMedia}
              onPatchMedia={patchMedia}
              onRemoveMedia={removeMedia}
              text={adminText}
            />
          </div>
        </section>

        {demoMode ? null : (
          <button
            type="button"
            onClick={logout}
            className="focus-ring self-start rounded-full border border-[var(--line)] bg-white/58 px-5 py-3 text-sm font-bold text-[var(--ink-soft)] transition hover:bg-white"
          >
            <span className="inline-flex items-center gap-2">
              <LogOut className="size-4" />
              {adminText.logout}
            </span>
          </button>
        )}
      </div>
    </main>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-3xl border border-[var(--line)] bg-white/48 p-4">
      <p className="text-xs font-bold uppercase text-[var(--ink-soft)]">{label}</p>
      <p className="mt-2 font-[var(--font-display)] text-4xl font-semibold">{value}</p>
    </div>
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

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-[34px] border border-white/75 bg-[var(--paper-soft)] p-6 shadow-[0_20px_58px_rgba(58,40,25,0.1)]"
    >
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-xs font-bold uppercase text-[var(--champagne-deep)]">
            <Settings2 className="size-4" />
            {text.identity}
          </p>
          <h2 className="mt-2 font-[var(--font-display)] text-4xl font-semibold">
            {text.identityTitle}
          </h2>
        </div>
        {saving ? <Loader2 className="size-5 animate-spin text-[var(--champagne-deep)]" /> : null}
      </div>

      <div className="grid gap-5 sm:grid-cols-[9rem_1fr]">
        <div>
          <MediaOrb media={wedding.profileMedia} label={wedding.coupleName} className="h-44 w-36" />
          <label className="focus-ring mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-full bg-[var(--ink)] px-4 py-3 text-sm font-bold text-[var(--paper-soft)] transition hover:bg-black">
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
              onClick={() => onSave({ eventDate, welcomeNote })}
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
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-xs font-bold uppercase text-[var(--champagne-deep)]">
            <QrCode className="size-4" />
            {text.qrStudio}
          </p>
          <h2 className="mt-2 font-[var(--font-display)] text-4xl font-semibold">
            {text.qrTitle}
          </h2>
        </div>
        <a
          href={eventUrl}
          target="_blank"
          className="focus-ring inline-flex items-center justify-center gap-2 rounded-full border border-[var(--line)] bg-white/65 px-4 py-3 text-sm font-bold transition hover:bg-white"
        >
          {text.openPage}
          <ArrowUpRight className="size-4" />
        </a>
      </div>

      <div className="grid gap-5 lg:grid-cols-[17rem_1fr]">
        <div className="paper-grain relative overflow-hidden rounded-[30px] border border-[var(--line)] bg-[#f3eadf] p-5 text-center">
          <p className="relative z-10 font-[var(--font-display)] text-3xl font-semibold">
            {wedding.coupleName}
          </p>
          <p className="relative z-10 mt-1 text-xs font-bold uppercase text-[var(--champagne-deep)]">
            {text.scan}
          </p>
          <div className="relative z-10 mx-auto mt-5 grid size-56 place-items-center rounded-[26px] border border-white/80 bg-[var(--paper-soft)] shadow-[0_18px_38px_rgba(58,40,25,0.12)]">
            <canvas ref={canvasRef} className="size-52" aria-label="Wedding QR code" />
          </div>
        </div>

        <div className="flex flex-col justify-between gap-4">
          <div className="rounded-3xl border border-[var(--line)] bg-white/52 p-4">
            <p className="text-xs font-bold uppercase text-[var(--ink-soft)]">{text.guestLink}</p>
            <p className="mt-2 break-all text-lg font-semibold text-[var(--ink)]">{eventUrl}</p>
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

function GuestPreview({
  wedding,
  eventUrl,
  text,
}: {
  wedding: Wedding;
  eventUrl: string;
  text: AdminCopy;
}) {
  return (
    <article className="rounded-[34px] border border-white/75 bg-[var(--ink)] p-5 text-[var(--paper-soft)] shadow-[0_20px_58px_rgba(58,40,25,0.12)]">
      <p className="mb-4 text-xs font-bold uppercase text-[var(--champagne)]">{text.guestPreview}</p>
      <div className="mx-auto max-w-[22rem] rounded-[34px] border border-white/15 bg-[#120f0d] p-3 shadow-[0_22px_55px_rgba(0,0,0,0.22)]">
        <div className="rounded-[26px] bg-[var(--paper-soft)] p-5 text-center text-[var(--ink)]">
          <MediaOrb media={wedding.profileMedia} label={wedding.coupleName} className="mx-auto h-28 w-24" />
          <p className="mt-4 text-xs font-bold uppercase text-[var(--champagne-deep)]">
            {text.welcomeTo}
          </p>
          <h3 className="mt-1 font-[var(--font-display)] text-4xl font-semibold">
            {wedding.coupleName}
          </h3>
          <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">{wedding.welcomeNote}</p>
          <div className="mt-5 rounded-2xl border border-[var(--line)] bg-[#f1e8db] px-4 py-3 text-sm font-semibold">
            {text.acceptedTypes}
          </div>
        </div>
      </div>
      <p className="mt-4 break-all text-xs text-white/58">{eventUrl}</p>
    </article>
  );
}

function MemoryInbox({
  filter,
  media,
  onFilterChange,
  onRefresh,
  onPatchMedia,
  onRemoveMedia,
  text,
}: {
  filter: FilterKey;
  media: WeddingMedia[];
  onFilterChange: (filter: FilterKey) => void;
  onRefresh: () => void;
  onPatchMedia: (mediaId: string, patch: Partial<WeddingMedia>) => void;
  onRemoveMedia: (mediaId: string) => void;
  text: AdminCopy;
}) {
  const filters: { key: FilterKey; label: string }[] = [
    { key: "all", label: text.all },
    { key: "favorite", label: text.featured },
    { key: "image", label: text.photos },
    { key: "video", label: text.videos },
    { key: "audio", label: text.voice },
  ];

  return (
    <article className="rounded-[34px] border border-white/75 bg-[var(--paper-soft)] p-6 shadow-[0_20px_58px_rgba(58,40,25,0.1)]">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-xs font-bold uppercase text-[var(--champagne-deep)]">
            <CalendarDays className="size-4" />
            {text.inbox}
          </p>
          <h2 className="mt-2 font-[var(--font-display)] text-4xl font-semibold">
            {text.uploads}
          </h2>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="focus-ring inline-flex items-center justify-center gap-2 rounded-full border border-[var(--line)] bg-white/65 px-4 py-3 text-sm font-bold transition hover:bg-white"
        >
          <RefreshCw className="size-4" />
          {text.refresh}
        </button>
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
            <p className="font-[var(--font-display)] text-4xl font-semibold">{text.noMemories}</p>
            <p className="mt-2 max-w-sm text-sm leading-6 text-[var(--ink-soft)]">
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
                {item.favorite ? (
                  <span className="absolute right-3 top-3 rounded-full bg-[var(--ink)] px-3 py-1 text-xs font-bold text-[var(--paper-soft)]">
                    {text.featured}
                  </span>
                ) : null}
              </div>
              <div className="p-2">
                <p className="mt-2 text-sm font-bold">{item.guestName}</p>
                <p className="mt-1 line-clamp-2 min-h-10 text-sm leading-5 text-[var(--ink-soft)]">
                  {item.note || text.noNote}
                </p>
                <div className="mt-4 grid grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => onPatchMedia(item.id, { favorite: !item.favorite })}
                    className="focus-ring rounded-full border border-[var(--line)] bg-white/65 p-2 transition hover:bg-white"
                    aria-label="Toggle favorite"
                  >
                    <Heart className={`mx-auto size-4 ${item.favorite ? "fill-[var(--rosewood)] text-[var(--rosewood)]" : ""}`} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onPatchMedia(item.id, { hidden: !item.hidden })}
                    className="focus-ring rounded-full border border-[var(--line)] bg-white/65 p-2 transition hover:bg-white"
                    aria-label="Toggle visibility"
                  >
                    {item.hidden ? <EyeOff className="mx-auto size-4" /> : <Eye className="mx-auto size-4" />}
                  </button>
                  <a
                    href={item.url}
                    download={item.fileName}
                    className="focus-ring rounded-full border border-[var(--line)] bg-white/65 p-2 text-center transition hover:bg-white"
                    aria-label="Download media"
                  >
                    <Download className="mx-auto size-4" />
                  </a>
                  <button
                    type="button"
                    onClick={() => onRemoveMedia(item.id)}
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
  );
}
