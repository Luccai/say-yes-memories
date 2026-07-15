"use client";

import { type ChangeEvent, useState } from "react";
import {
  Check,
  CircleUserRound,
  ImagePlus,
  Loader2,
  Lock,
  Settings2,
  Unlock,
} from "lucide-react";
import { motion } from "motion/react";
import type { AdminCopy } from "@/components/admin/types";
import { Button, buttonStyles } from "@/components/shared/Button";
import { MediaOrb } from "@/components/shared/MediaOrb";
import { useLocale } from "@/lib/i18n-client";
import type { Wedding } from "@/lib/types";
import { formatWeddingDate } from "@/lib/wedding-date";

export type CustomerWeddingPatch = Partial<
  Pick<Wedding, "welcomeNote" | "uploadLocked">
>;

type WeddingPagePanelProps = {
  wedding: Wedding;
  demoMode: boolean;
  saving: boolean;
  profileUploading: boolean;
  onUploadProfileMedia: (event: ChangeEvent<HTMLInputElement>) => void;
  onDirty: () => void;
  onSave: (patch: CustomerWeddingPatch) => Promise<void>;
  text: AdminCopy;
};

export function WeddingPagePanel({
  wedding,
  demoMode,
  saving,
  profileUploading,
  onUploadProfileMedia,
  onDirty,
  onSave,
  text,
}: WeddingPagePanelProps) {
  const locale = useLocale();
  const [welcomeNote, setWelcomeNote] = useState(wedding.welcomeNote);
  const eventDateLabel = formatWeddingDate(wedding.eventDate, locale);
  const profileInputDisabled = demoMode || profileUploading;

  async function handleSaveIdentity() {
    await onSave({ welcomeNote });
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
          <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--ink-soft)]">
            {text.identityDescription}
          </p>
        </div>
        {saving ? (
          <Loader2 className="mt-1 size-5 shrink-0 animate-spin text-[var(--champagne-deep)]" />
        ) : null}
      </div>

      <div className="grid gap-5 sm:grid-cols-[9rem_1fr]">
        <div className="flex flex-col items-center">
          {wedding.profileMedia ? (
            <>
              <MediaOrb
                media={wedding.profileMedia}
                label={wedding.coupleName}
                className="h-44 w-36"
              />
              <label
                className={buttonStyles({
                  variant: "paper",
                  className: `mt-4 w-fit ${profileInputDisabled ? "cursor-not-allowed" : "cursor-pointer"}`,
                })}
              >
                {profileUploading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ImagePlus className="size-4" />
                )}
                {text.upload}
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  disabled={profileInputDisabled}
                  onChange={profileInputDisabled ? undefined : onUploadProfileMedia}
                />
              </label>
            </>
          ) : (
            <label
              aria-label={text.upload}
              data-profile-media-empty-picker="true"
              className={buttonStyles({
                variant: "paper",
                size: "icon",
                className: `size-16 rounded-[22px] shadow-none ${
                  profileInputDisabled ? "cursor-not-allowed" : "cursor-pointer"
                }`,
              })}
            >
              {profileUploading ? (
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              ) : (
                <CircleUserRound aria-hidden="true" className="size-5 opacity-60" />
              )}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={profileInputDisabled}
                onChange={profileInputDisabled ? undefined : onUploadProfileMedia}
              />
            </label>
          )}
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
              {eventDateLabel || "—"}
            </p>
          </div>
          <div className="grid gap-2 text-sm font-semibold">
            <span>{text.welcomeNote}</span>
            {demoMode ? (
              <p className="min-h-12 whitespace-pre-wrap rounded-2xl border border-[var(--line)] bg-[#f1e8db] px-4 py-3 text-base font-medium leading-7 text-[var(--ink)]">
                {welcomeNote || "—"}
              </p>
            ) : (
              <textarea
                aria-label={text.welcomeNote}
                value={welcomeNote}
                onChange={(event) => {
                  setWelcomeNote(event.target.value);
                  onDirty();
                }}
                rows={4}
                className="focus-ring rounded-2xl border border-[var(--line)] bg-[#f1e8db] px-4 py-3 !text-[16px] leading-7 outline-none"
              />
            )}
          </div>
          <div className="grid gap-3">
            <div className="grid gap-2">
              <div
                role="status"
                aria-live="polite"
                data-guest-upload-status={wedding.uploadLocked ? "closed" : "open"}
                data-upload-status-pill="true"
                className={`inline-flex min-h-9 w-fit max-w-full items-center gap-2 rounded-full border px-3 py-2 text-xs font-extrabold ${
                  wedding.uploadLocked
                    ? "border-[rgba(140,81,68,0.16)] bg-[rgba(255,247,243,0.58)] text-[var(--rosewood)]"
                    : "border-[rgba(104,125,96,0.18)] bg-[rgba(247,249,242,0.7)] text-[#455a40]"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`size-2 shrink-0 rounded-full ${
                    wedding.uploadLocked ? "bg-[#a75c50]" : "bg-[#78906e]"
                  }`}
                />
                <span>
                  {wedding.uploadLocked
                    ? text.uploadStatusClosed
                    : text.uploadStatusOpen}
                </span>
              </div>
              <p className="text-xs leading-5 text-[var(--ink-soft)]">
                {wedding.uploadLocked
                  ? text.uploadStatusClosedBody
                  : text.uploadStatusOpenBody}
              </p>
            </div>
            <div className="flex flex-nowrap gap-2">
              <Button
                onClick={handleSaveIdentity}
                loading={saving}
                size="compact"
                className="min-w-0 w-fit whitespace-nowrap px-3 sm:px-4"
              >
                <Check className="size-3.5" />
                {text.saveIdentity}
              </Button>
              <Button
                onClick={() => onSave({ uploadLocked: !wedding.uploadLocked })}
                variant="paper"
                aria-pressed={!wedding.uploadLocked}
                size="compact"
                className="min-w-0 w-fit whitespace-nowrap px-3 sm:px-4"
              >
                <span className="inline-flex items-center justify-center gap-2">
                  {wedding.uploadLocked ? (
                    <Lock className="size-4" />
                  ) : (
                    <Unlock className="size-4" />
                  )}
                  {wedding.uploadLocked ? text.openUploads : text.closeUploads}
                </span>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </motion.article>
  );
}
