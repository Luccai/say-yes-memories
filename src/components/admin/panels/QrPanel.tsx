"use client";

import { useEffect, useRef } from "react";
import { Download, QrCode } from "lucide-react";
import { motion } from "motion/react";
import type { AdminCopy } from "@/components/admin/types";
import { Button } from "@/components/shared/Button";
import { CopyButton } from "@/components/shared/CopyButton";
import { MediaOrb } from "@/components/shared/MediaOrb";
import { useLocale } from "@/lib/i18n-client";
import {
  QR_PREVIEW_OPTIONS,
  QR_PRINT_OPTIONS,
  QR_SVG_OPTIONS,
  qrPrintFileName,
  qrSvgFileName,
} from "@/lib/qr-download";
import type { Wedding } from "@/lib/types";
import { formatWeddingDate } from "@/lib/wedding-date";

let qrCodeModule: Promise<typeof import("qrcode")> | null = null;

function loadQrCode() {
  qrCodeModule ??= import("qrcode");
  return qrCodeModule;
}

type QrPanelProps = {
  wedding: Wedding;
  eventUrl: string;
  text: AdminCopy;
};

export function QrPanel({ wedding, eventUrl, text }: QrPanelProps) {
  const locale = useLocale();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const eventDateLabel = formatWeddingDate(wedding.eventDate, locale);

  useEffect(() => {
    if (!canvasRef.current || !eventUrl) {
      return;
    }

    let active = true;
    void loadQrCode().then((QRCode) => {
      if (!active || !canvasRef.current) return;
      return QRCode.toCanvas(
        canvasRef.current,
        eventUrl,
        QR_PREVIEW_OPTIONS,
      );
    });
    return () => {
      active = false;
    };
  }, [eventUrl]);

  async function downloadPng() {
    const QRCode = await loadQrCode();
    const canvas = document.createElement("canvas");
    await QRCode.toCanvas(canvas, eventUrl, QR_PRINT_OPTIONS);
    const link = document.createElement("a");
    link.download = qrPrintFileName(wedding.slug);
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  async function downloadSvg() {
    const QRCode = await loadQrCode();
    const svg = await QRCode.toString(eventUrl, QR_SVG_OPTIONS);
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const link = document.createElement("a");
    const objectUrl = URL.createObjectURL(blob);
    link.download = qrSvgFileName(wedding.slug);
    link.href = objectUrl;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
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
      </div>

      <div className="flex flex-col items-center gap-4 sm:gap-5">
        <div
          data-qr-card="true"
          className="paper-grain relative isolate w-full max-w-[40rem] overflow-hidden rounded-[34px] border border-[rgba(139,107,63,0.24)] bg-[#efe1cf] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_20px_50px_rgba(58,40,25,0.12)] sm:p-4"
        >
          <div className="relative z-10 flex min-h-[34rem] flex-col items-center rounded-[27px] border border-[rgba(139,107,63,0.24)] bg-[rgba(255,250,243,0.9)] px-5 py-7 text-center">
            <MediaOrb
              media={wedding.profileMedia}
              label={wedding.coupleName}
              className="h-20 w-16"
            />
            <p className="mt-5 font-display text-3xl font-semibold leading-none text-[var(--ink)]">
              {wedding.coupleName}
            </p>
            {eventDateLabel ? (
              <p className="mt-2 text-[0.68rem] font-bold uppercase tracking-[0.2em] text-[var(--champagne-deep)]">
                {eventDateLabel}
              </p>
            ) : null}
            <div
              className="my-5 flex w-full items-center gap-3"
              aria-hidden="true"
            >
              <span className="h-px flex-1 bg-[rgba(139,107,63,0.24)]" />
              <span className="font-display text-xl italic text-[var(--champagne-deep)]">
                &amp;
              </span>
              <span className="h-px flex-1 bg-[rgba(139,107,63,0.24)]" />
            </div>
            <div className="grid size-64 place-items-center rounded-[28px] border border-[rgba(139,107,63,0.2)] bg-[var(--paper-soft)] p-3 shadow-[0_16px_34px_rgba(58,40,25,0.12)]">
              <canvas
                ref={canvasRef}
                className="size-[14.5rem]"
                role="img"
                aria-label={text.qrCode}
              >
                {text.qrCode}
              </canvas>
            </div>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Button variant="paper" size="compact" onClick={downloadPng}>
                <Download className="size-3.5" />
                PNG
              </Button>
              <Button variant="paper" size="compact" onClick={downloadSvg}>
                <Download className="size-3.5" />
                SVG
              </Button>
            </div>
            <p className="mt-4 max-w-sm text-sm leading-6 text-[var(--ink-soft)]">
              {text.qrPrintGuide}
            </p>
          </div>
        </div>

        <div
          data-guest-link-card="true"
          className="w-full max-w-[32rem] rounded-[28px] border border-[rgba(139,107,63,0.16)] bg-white/48 p-4 shadow-[0_12px_30px_rgba(58,40,25,0.06)] sm:p-5"
        >
          <p className="eyebrow text-[var(--champagne-deep)]">
            {text.guestLink}
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1 rounded-[20px] border border-[rgba(55,38,25,0.12)] bg-[rgba(239,225,207,0.58)] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
              <p className="break-all text-sm font-semibold leading-6 text-[var(--ink-soft)]">
                {eventUrl}
              </p>
            </div>
            <CopyButton
              text={eventUrl}
              copyLabel={text.copy}
              copiedLabel={text.copied}
              className="w-fit shrink-0"
            />
          </div>
        </div>
      </div>
    </motion.article>
  );
}
