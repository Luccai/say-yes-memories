"use client";

import { useCallback, useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button, buttonStyles } from "@/components/shared/Button";
import type { useCopy } from "@/lib/i18n-client";
import { useLocale } from "@/lib/i18n-client";
import { formatStorageBytes } from "@/lib/storage/quota";

type AdminCopy = ReturnType<typeof useCopy>["admin"];

type ArchiveSourceSummary = {
  mediaCount: number;
  photoCount: number;
  videoCount: number;
  audioCount: number;
  totalBytes: number;
};

type ClientArchiveJob = {
  id: string;
  status: "queued" | "running" | "ready" | "failed" | "expired";
  sourceMediaCount: number;
  sourcePhotoCount: number;
  sourceVideoCount: number;
  sourceAudioCount: number;
  sourceTotalBytes: number;
  preparedMediaCount: number;
  preparedSourceBytes: number;
  archiveByteSize: number | null;
  errorCode: string | null;
  createdAt: string;
  completedAt: string | null;
  expiresAt: string | null;
  downloadUrl: string | null;
  retryStartAvailable: boolean;
};

function fillTemplate(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (current, [key, value]) => current.replace(`{${key}}`, String(value)),
    template,
  );
}

export function MemoryArchiveDownload({
  demoMode,
  text,
}: {
  demoMode: boolean;
  text: AdminCopy;
}) {
  const locale = useLocale();
  const [archive, setArchive] = useState<ClientArchiveJob | null>(null);
  const [source, setSource] = useState<ArchiveSourceSummary | null>(null);
  const [loading, setLoading] = useState(!demoMode);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  const refreshArchive = useCallback(async () => {
    if (demoMode) return;

    try {
      const response = await fetch("/api/archives/current", { cache: "no-store" });
      if (!response.ok) throw new Error("Archive status is unavailable.");
      const payload = (await response.json()) as {
        archive: ClientArchiveJob | null;
        source: ArchiveSourceSummary;
      };
      setArchive(payload.archive);
      setSource(payload.source);
      setError("");
    } catch {
      setError(text.archiveUnavailable);
    } finally {
      setLoading(false);
    }
  }, [demoMode, text.archiveUnavailable]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshArchive(), 0);
    return () => window.clearTimeout(timer);
  }, [refreshArchive]);

  useEffect(() => {
    if (archive?.status !== "queued" && archive?.status !== "running") return;
    const timer = window.setInterval(() => void refreshArchive(), 4_000);
    return () => window.clearInterval(timer);
  }, [archive?.status, refreshArchive]);

  useEffect(() => {
    if (archive?.status !== "ready" || !archive.expiresAt) return;
    const delay = Math.max(0, new Date(archive.expiresAt).getTime() - Date.now());
    const timer = window.setTimeout(() => {
      setArchive((current) =>
        current?.status === "ready"
          ? { ...current, status: "expired", downloadUrl: null }
          : current,
      );
    }, Math.min(delay, 2_147_000_000));
    return () => window.clearTimeout(timer);
  }, [archive?.expiresAt, archive?.status]);

  async function startArchive() {
    if (demoMode || starting) return;
    setStarting(true);
    setError("");

    try {
      const response = await fetch("/api/archives/current", { method: "POST" });
      const payload = (await response.json()) as {
        archive?: ClientArchiveJob;
        message?: string;
      };
      if (!response.ok || !payload.archive) throw new Error(payload.message);
      setArchive(payload.archive);
    } catch {
      setError(text.archiveUnavailable);
    } finally {
      setStarting(false);
    }
  }

  const summary = archive
    ? {
        mediaCount: archive.sourceMediaCount,
        photoCount: archive.sourcePhotoCount,
        videoCount: archive.sourceVideoCount,
        audioCount: archive.sourceAudioCount,
        totalBytes: archive.sourceTotalBytes,
      }
    : source;
  const progressTotal = archive?.sourceTotalBytes ?? 0;
  const progressValue = archive?.preparedSourceBytes ?? 0;
  const progress = progressTotal > 0 ? Math.min(100, (progressValue / progressTotal) * 100) : 0;
  const waitingForRunner = archive?.status === "queued" && !archive.retryStartAvailable;
  const preparing =
    waitingForRunner ||
    (archive?.status === "running" && !archive.retryStartAvailable);
  const showingProgress = archive?.status === "queued" || archive?.status === "running";
  const ready = archive?.status === "ready" && Boolean(archive.downloadUrl);
  const readyUntil = archive?.expiresAt
    ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(archive.expiresAt),
      )
    : "";

  return (
    <section className="overflow-hidden rounded-[30px] border border-white/75 bg-[rgba(255,250,243,0.84)] p-4 shadow-none backdrop-blur sm:p-5 sm:shadow-[0_18px_48px_rgba(58,40,25,0.08)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow flex items-center gap-2 text-[var(--champagne-deep)]">
            <Download className="size-4 shrink-0" />
            {text.storageTitle}
          </p>
          {demoMode ? null : summary ? (
            <>
              <p className="mt-3 text-sm font-bold text-[var(--ink)]">
                {fillTemplate(text.archiveSummary, {
                  count: summary.mediaCount,
                  size: formatStorageBytes(summary.totalBytes),
                })}
              </p>
              <p className="mt-1 text-xs leading-5 text-[var(--ink-soft)]">
                {fillTemplate(text.archiveBreakdown, {
                  photos: summary.photoCount,
                  videos: summary.videoCount,
                  voice: summary.audioCount,
                })}
              </p>
            </>
          ) : (
            <p className="mt-3 text-sm text-[var(--ink-soft)]">
              {loading ? text.archivePreparing : text.archiveUnavailable}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {ready ? (
            <a
              className={buttonStyles({ variant: "ink", size: "compact" })}
              href={archive?.downloadUrl ?? undefined}
            >
              <Download className="size-3.5" />
              {text.archiveDownloadReady}
            </a>
          ) : (
            <Button
              onClick={startArchive}
              disabled={demoMode || preparing || !summary || summary.mediaCount === 0}
              loading={starting || preparing}
              variant="ink"
              size="compact"
              title={demoMode ? text.archiveDemoNotice : undefined}
            >
              <Download className="size-3.5" />
              {archive?.status === "failed" ||
              archive?.status === "expired" ||
              archive?.retryStartAvailable
                ? text.archiveTryAgain
                : text.archiveDownloadAll}
            </Button>
          )}
        </div>
      </div>

      <div
        className="mt-4 rounded-[20px] border border-[var(--line)] bg-white/48 px-3 py-3"
        aria-live="polite"
      >
        {demoMode ? (
          <p className="text-xs font-bold leading-5 text-[var(--ink-soft)]">
            {text.archiveDemoNotice}
          </p>
        ) : showingProgress && archive ? (
          <div>
            <div className="flex items-center justify-between gap-3 text-xs font-bold text-[var(--ink-soft)]">
              <span>{text.archivePreparing}</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div
              className="mt-2 h-2 overflow-hidden rounded-full bg-[rgba(139,107,63,0.14)]"
              role="progressbar"
              aria-label={text.archivePreparing}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress)}
            >
              <div
                className="h-full rounded-full bg-[var(--champagne-deep)] transition-[width] duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-[var(--ink-soft)]">
              {fillTemplate(text.archiveProgress, {
                completed: archive.preparedMediaCount,
                total: archive.sourceMediaCount,
              })}
            </p>
          </div>
        ) : ready ? (
          <p className="text-xs font-bold leading-5 text-[var(--ink-soft)]">
            {fillTemplate(text.archiveReady, { date: readyUntil })}
          </p>
        ) : error ? (
          <p className="text-xs font-bold leading-5 text-[var(--rosewood)]">{error}</p>
        ) : (
          <p className="text-xs leading-5 text-[var(--ink-soft)]">{text.archiveIntro}</p>
        )}
      </div>
    </section>
  );
}
