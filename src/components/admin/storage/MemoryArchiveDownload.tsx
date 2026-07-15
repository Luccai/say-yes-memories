"use client";

import { useCallback, useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button, buttonStyles } from "@/components/shared/Button";
import type { useCopy } from "@/lib/i18n-client";
import { useLocale } from "@/lib/i18n-client";

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

  const archiveError = error || (archive?.status === "failed" ? text.archiveUnavailable : "");

  return (
    <section className="mx-auto w-full max-w-[30rem] rounded-[28px] border border-white/75 bg-[rgba(255,250,243,0.84)] p-4 shadow-none backdrop-blur sm:p-5 sm:shadow-[0_18px_48px_rgba(58,40,25,0.08)]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="eyebrow flex items-center gap-2 text-[var(--champagne-deep)]">
          <Download className="size-4 shrink-0" />
          {text.storageTitle}
        </p>

        {ready ? (
          <a
            className={buttonStyles({ variant: "ink", className: "gap-2 whitespace-nowrap" })}
            href={archive?.downloadUrl ?? undefined}
          >
            <Download className="size-4 shrink-0" />
            {text.archiveDownloadReady}
          </a>
        ) : (
          <Button
            onClick={startArchive}
            disabled={demoMode || loading || preparing || !summary || summary.mediaCount === 0}
            loading={starting || preparing}
            variant="ink"
            className="gap-2 whitespace-nowrap"
          >
            <Download className="size-4 shrink-0" />
            {archive?.status === "failed" ||
            archive?.status === "expired" ||
            archive?.retryStartAvailable
              ? text.archiveTryAgain
              : text.archiveDownloadAll}
          </Button>
        )}
      </div>

      {!demoMode && (showingProgress || ready || archiveError) ? (
        <div className="mt-4" aria-live="polite">
          {showingProgress && archive ? (
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
          ) : (
            <p className="text-xs font-bold leading-5 text-[var(--rosewood)]">{archiveError}</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
