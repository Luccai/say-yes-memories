"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Check, Mic, Pause, RotateCcw, UploadCloud, X } from "lucide-react";
import Image from "next/image";
import type { MediaKind, PublicWedding } from "@/lib/types";
import { Button } from "@/components/shared/Button";
import { GuidanceDialog, HelpTriggerButton } from "@/components/shared/GuidanceDialog";
import { MediaOrb } from "@/components/shared/MediaOrb";
import {
  TurnstileGate,
  type TurnstileGateHandle,
} from "@/components/guest/TurnstileGate";
import { localizedError, useCopy, useLocale } from "@/lib/i18n-client";
import { formatWeddingDate } from "@/lib/wedding-date";
import {
  ensureFreshDemoLocalState,
  getDemoGuestNote,
  localizeDemoGuestNote,
  localizeDemoWedding,
} from "@/lib/demo-content";
import { canAcceptGuestUpload } from "@/lib/storage/quota";
import {
  MAX_GUEST_UPLOAD_BYTES,
  supportedMediaKind,
} from "@/lib/uploads/domain";

type GuestExperienceProps = {
  wedding: PublicWedding;
  demoMode?: boolean;
  embedded?: boolean;
};

type VoiceRecorder = {
  recorder: MediaRecorder;
  chunks: Blob[];
  stream: MediaStream;
  intervalId: number;
  timeoutId: number;
};

const MAX_RECORDING_SECONDS = 5 * 60;
const RECORDING_WARNING_SECONDS = 30;

function cleanMimeType(mimeType: string) {
  return mimeType.split(";")[0]?.trim() || mimeType || "application/octet-stream";
}

function audioExtensionFor(mimeType: string) {
  const cleanType = cleanMimeType(mimeType);

  if (cleanType === "audio/mp4" || cleanType === "audio/x-m4a") {
    return "m4a";
  }

  if (cleanType === "audio/wav" || cleanType === "audio/x-wav") {
    return "wav";
  }

  if (cleanType === "audio/mpeg") {
    return "mp3";
  }

  if (cleanType === "audio/ogg") {
    return "ogg";
  }

  return "webm";
}

function mediaKindFor(file: File): MediaKind | null {
  return supportedMediaKind(file.type);
}

function needsAudioNormalization(file: File) {
  if (file.size > 32 * 1024 * 1024) return false;
  const type = cleanMimeType(file.type).toLowerCase();
  const name = file.name.toLowerCase();
  return (
    type === "audio/webm" ||
    type === "audio/ogg" ||
    type === "audio/opus" ||
    name.endsWith(".webm") ||
    name.endsWith(".ogg") ||
    name.endsWith(".opus")
  );
}

function recorderMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  return [
    "audio/webm;codecs=opus",
    "audio/mp4",
    "audio/ogg;codecs=opus",
    "audio/webm",
  ].find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ?? "";
}

function formatRecordingTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export function GuestExperience({ wedding, demoMode = false, embedded = false }: GuestExperienceProps) {
  const locale = useLocale();
  const text = useCopy();
  const [displayWedding, setDisplayWedding] = useState(wedding);
  const [demoHydrated, setDemoHydrated] = useState(!demoMode);
  const [guestName, setGuestName] = useState(demoMode ? "Emma" : "");
  const [rawNote, setRawNote] = useState(demoMode ? getDemoGuestNote() : "");
  const note = useMemo(
    () => (demoMode && demoHydrated ? localizeDemoGuestNote(rawNote, locale) : rawNote),
    [demoHydrated, demoMode, locale, rawNote],
  );
  const [file, setFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadFailed, setUploadFailed] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const turnstileRef = useRef<TurnstileGateHandle | null>(null);
  const recorderRef = useRef<VoiceRecorder | null>(null);
  const successHeadingRef = useRef<HTMLParagraphElement | null>(null);
  const uploadsNotStarted = Boolean(
    displayWedding.uploadsOpenAt &&
      Date.parse(displayWedding.uploadsOpenAt) > Date.now(),
  );
  const uploadsPaused = displayWedding.uploadLocked || !canAcceptGuestUpload(displayWedding);

  useEffect(() => {
    if (submitted) {
      successHeadingRef.current?.focus();
    }
  }, [submitted]);

  useEffect(() => {
    if (!demoMode) {
      return;
    }

    let active = true;

    async function hydrateDemoWedding() {
      ensureFreshDemoLocalState();

      const saved = window.localStorage.getItem("sayyes.demo.wedding");
      const sourceWedding = saved ? (JSON.parse(saved) as PublicWedding) : wedding;

      if (!active) {
        return;
      }

      setDisplayWedding(localizeDemoWedding(sourceWedding, locale));
      setDemoHydrated(true);
    }

    void hydrateDemoWedding();

    return () => {
      active = false;
    };
  }, [demoMode, locale, wedding]);

  useEffect(() => {
    return () => {
      const recorder = recorderRef.current;

      if (!recorder) {
        abortControllerRef.current?.abort();
        return;
      }

      window.clearInterval(recorder.intervalId);
      window.clearTimeout(recorder.timeoutId);
      recorder.recorder.ondataavailable = null;
      recorder.recorder.onstop = null;
      if (recorder.recorder.state !== "inactive") recorder.recorder.stop();
      recorder.stream.getTracks().forEach((track) => track.stop());
      abortControllerRef.current?.abort();
    };
  }, []);

  useEffect(
    () => () => {
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    },
    [recordedUrl],
  );

  useEffect(
    () => () => {
      if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    },
    [filePreviewUrl],
  );

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    if (demoMode) {
      event.target.value = "";
      return;
    }

    const selectedFile = event.target.files?.[0] ?? null;
    setError("");
    setUploadFailed(false);
    setUploadProgress(0);
    if (selectedFile && selectedFile.size > MAX_GUEST_UPLOAD_BYTES) {
      setFile(null);
      setFilePreviewUrl("");
      setError(text.guest.fileTooLarge);
      event.target.value = "";
      return;
    }
    if (selectedFile && !mediaKindFor(selectedFile)) {
      setFile(null);
      setFilePreviewUrl("");
      setError(text.guest.unsupportedFile);
      event.target.value = "";
      return;
    }
    setFile(selectedFile);
    setFilePreviewUrl(selectedFile ? URL.createObjectURL(selectedFile) : "");
    setRecordedBlob(null);

    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl);
      setRecordedUrl("");
    }
  }

  async function startRecording() {
    if (demoMode) return;

    setError("");

    try {
      if (typeof MediaRecorder === "undefined") {
        throw new Error("MediaRecorder is unavailable.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = recorderMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onstop = () => {
        if (!chunks.length) {
          setError(text.guest.uploadFailed);
          return;
        }
        const blob = new Blob(chunks, {
          type: cleanMimeType(recorder.mimeType || mimeType || "audio/webm"),
        });
        const url = URL.createObjectURL(blob);
        setRecordedBlob(blob);
        setRecordedUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return url;
        });
      };
      const startedAt = Date.now();
      const intervalId = window.setInterval(() => {
        setRecordingSeconds(
          Math.min(Math.floor((Date.now() - startedAt) / 1000), MAX_RECORDING_SECONDS),
        );
      }, 250);
      const timeoutId = window.setTimeout(() => {
        setRecordingSeconds(MAX_RECORDING_SECONDS);
        stopRecording();
      }, MAX_RECORDING_SECONDS * 1000);
      recorderRef.current = { recorder, chunks, stream, intervalId, timeoutId };
      recorder.start(1000);

      setFile(null);
      setFilePreviewUrl("");
      setRecordedBlob(null);
      setRecordedUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return "";
      });
      setRecordingSeconds(0);
      setRecording(true);
    } catch {
      setError(text.guest.micDenied);
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current;

    if (!recorder) {
      return;
    }

    recorderRef.current = null;
    setRecording(false);
    window.clearInterval(recorder.intervalId);
    window.clearTimeout(recorder.timeoutId);
    setRecordingSeconds((current) => Math.min(current, MAX_RECORDING_SECONDS));
    if (recorder.recorder.state !== "inactive") recorder.recorder.stop();
    recorder.stream.getTracks().forEach((track) => track.stop());
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (demoMode) return;

    setSubmitting(true);
    setError("");
    setUploadFailed(false);
    setUploadProgress(0);

    try {
      let uploadFile =
        file ??
        (recordedBlob
          ? new File([recordedBlob], `voice-note.${audioExtensionFor(recordedBlob.type)}`, {
              type: cleanMimeType(recordedBlob.type || "audio/webm"),
            })
          : null);

      if (!uploadFile) {
        setError(text.guest.missingMedia);
        return;
      }

      if (!mediaKindFor(uploadFile)) {
        setError(text.guest.unsupportedFile);
        return;
      }
      if (uploadFile.size > MAX_GUEST_UPLOAD_BYTES) {
        setError(text.guest.fileTooLarge);
        return;
      }

      if (!recordedBlob && needsAudioNormalization(uploadFile)) {
        const { normalizeAudioFileToMp3 } = await import("@/lib/audio-encoding");
        uploadFile = await normalizeAudioFileToMp3(uploadFile);
      }

      const { createMediaThumbnail } = await import("@/lib/media-thumbnails");
      const thumbnailFile = await createMediaThumbnail(uploadFile);
      const turnstileToken = await turnstileRef.current?.execute();
      if (!turnstileToken) throw new Error("UPLOAD_VERIFICATION_UNAVAILABLE");
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const { uploadGuestMemory } = await import("@/lib/uploads/client");
      await uploadGuestMemory({
        slug: wedding.slug,
        file: uploadFile,
        thumbnail: thumbnailFile,
        guestName,
        note,
        turnstileToken,
        signal: controller.signal,
        onProgress: ({ percent }) => setUploadProgress(percent),
      });

      setSubmitted(true);
      setGuestName("");
      setRawNote("");
      setFile(null);
      setFilePreviewUrl("");
      setRecordedBlob(null);
      if (recordedUrl) {
        URL.revokeObjectURL(recordedUrl);
        setRecordedUrl("");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setError(text.guest.uploadCancelled);
      } else {
        const code =
          error && typeof error === "object" && "code" in error
            ? String(error.code)
            : undefined;
        setError(
          code === "STORAGE_QUOTA_FULL"
            ? text.guest.storageFull
            : code === "UPLOADS_UNAVAILABLE"
              ? text.guest.uploadsPausedBody
              : code?.startsWith("UPLOAD_VERIFICATION")
                ? text.guest.verificationFailed
                : localizedError(
                    error instanceof Error ? error.message : undefined,
                    text.errors,
                    text.guest.uploadFailed,
                  ),
        );
      }
      setUploadFailed(true);
    } finally {
      abortControllerRef.current = null;
      setSubmitting(false);
    }
  }

  function cancelUpload() {
    abortControllerRef.current?.abort();
  }

  const Shell: "div" | "main" = embedded ? "div" : "main";
  const guestHelpCards = demoMode
    ? [...text.guest.helpCards, text.guest.demoHelpCard]
    : text.guest.helpCards;
  const recordingRemaining = Math.max(
    MAX_RECORDING_SECONDS - recordingSeconds,
    0,
  );

  return (
    <>
      <Shell
        className={
          embedded
            ? "overflow-x-clip text-[var(--ink)]"
            : "min-h-[100dvh] overflow-x-clip px-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-5 text-[var(--ink)]"
        }
      >
        <div className="mx-auto max-w-[34rem] min-w-0 overflow-x-clip">
          <section
            className="paper-grain overflow-hidden rounded-[36px] border border-white/75 bg-[var(--paper-soft)] p-6 text-center shadow-none sm:shadow-[var(--shadow-soft)]"
          >
            <div className="relative z-10">
              <div className="mb-4 flex justify-end">
                <HelpTriggerButton label={text.help} onClick={() => setHelpOpen(true)} />
              </div>
              <MediaOrb
                media={displayWedding.profileMedia}
                label={displayWedding.coupleName}
                className="mx-auto h-40 w-32"
              />
              <p className="eyebrow mt-6 text-[var(--champagne-deep)]">
                {text.guest.invited}
              </p>
              <h1 className="mt-3 font-display text-fluid-display font-semibold text-balance text-[var(--ink)]">
                {displayWedding.coupleName}
              </h1>
              {displayWedding.eventDate ? (
                <p className="mt-4 text-sm font-semibold tracking-wide text-[var(--ink-soft)]">
                  {formatWeddingDate(displayWedding.eventDate, locale)}
                </p>
              ) : null}
              <p className="mx-auto mt-5 max-w-sm text-pretty text-sm leading-relaxed text-[var(--ink-soft)]">
                {displayWedding.welcomeNote}
              </p>
            </div>
          </section>

        <section className="mt-5 rounded-[34px] border border-white/75 bg-[rgba(255,250,243,0.82)] p-5 shadow-none backdrop-blur sm:shadow-[0_18px_48px_rgba(58,40,25,0.1)]">
          {uploadsPaused ? (
            <div
              className="grid min-h-[18rem] place-items-center text-center"
              role="status"
              aria-live="polite"
            >
              <div>
                <p className="font-display text-fluid-heading font-semibold text-[var(--ink)]">
                  {uploadsNotStarted
                    ? text.guest.uploadsNotOpen
                    : text.guest.uploadsPaused}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-[var(--ink-soft)]">
                  {uploadsNotStarted
                    ? text.guest.uploadsNotOpenBody
                    : text.guest.uploadsPausedBody}
                </p>
              </div>
            </div>
          ) : submitted ? (
            <div className="grid min-h-[18rem] place-items-center text-center">
              <div>
                <div className="mx-auto grid size-16 place-items-center rounded-full bg-[var(--ink)] text-[var(--paper-soft)]">
                  <Check className="size-7" />
                </div>
                <p
                  ref={successHeadingRef}
                  tabIndex={-1}
                  className="focus-ring mt-6 font-display text-fluid-heading font-semibold text-[var(--ink)] outline-none"
                >
                  {text.guest.thankYou}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-[var(--ink-soft)]">
                  {text.guest.thankYouBody}
                </p>
                <Button
                  onClick={() => setSubmitted(false)}
                  variant="paper"
                  className="mt-6"
                >
                  {text.guest.sendAnother}
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="grid gap-4">
              <label className="grid gap-2 text-sm font-semibold">
                {text.guest.name}
                <input
                  value={guestName}
                  onChange={(event) => setGuestName(event.target.value)}
                  required
                  disabled={demoMode || submitting}
                  className="focus-ring rounded-2xl border border-[var(--line)] bg-[#f1e8db] px-4 py-4 !text-[16px] outline-none disabled:cursor-not-allowed disabled:opacity-65"
                  placeholder={text.guest.name}
                />
              </label>

              <label className="grid gap-2 text-sm font-semibold">
                {text.guest.note}
                <textarea
                  value={note}
                  onChange={(event) => setRawNote(event.target.value)}
                  rows={4}
                  disabled={demoMode || submitting}
                  className="focus-ring rounded-2xl border border-[var(--line)] bg-[#f1e8db] px-4 py-4 !text-[16px] leading-7 outline-none disabled:cursor-not-allowed disabled:opacity-65"
                  placeholder={text.guest.notePlaceholder}
                />
              </label>

              <div className="grid gap-3">
                <label
                  data-guest-upload-choice="file"
                  aria-disabled={demoMode || submitting || recording}
                  className={`focus-ring grid min-h-[8.5rem] place-content-center gap-2 rounded-[26px] border border-dashed border-[var(--line)] bg-white/58 p-5 text-center transition ${
                    demoMode || submitting || recording
                      ? "cursor-not-allowed opacity-65"
                      : "cursor-pointer hover:bg-white"
                  }`}
                >
                  <UploadCloud className="size-7 text-[var(--champagne-deep)]" />
                  <span className="text-sm font-bold">
                    {file ? file.name : text.guest.choose}
                  </span>
                  <input
                    type="file"
                    accept="image/*,video/*,audio/*"
                    className="sr-only"
                    onChange={handleFileChange}
                    disabled={demoMode || submitting || recording}
                  />
                </label>

                {file && filePreviewUrl ? (
                  <div className="overflow-hidden rounded-[24px] border border-[var(--line)] bg-black/5">
                    {mediaKindFor(file) === "image" ? (
                      <div className="relative aspect-[4/3]">
                        <Image
                          src={filePreviewUrl}
                          alt={file.name}
                          fill
                          unoptimized
                          sizes="(max-width: 544px) 100vw, 480px"
                          className="object-contain"
                        />
                      </div>
                    ) : mediaKindFor(file) === "video" ? (
                      <video
                        src={filePreviewUrl}
                        controls
                        preload="metadata"
                        className="max-h-72 w-full bg-black object-contain"
                      />
                    ) : (
                      <div className="p-4">
                        <audio src={filePreviewUrl} controls className="w-full" />
                      </div>
                    )}
                  </div>
                ) : null}

                <Button
                  type="button"
                  onClick={recording ? stopRecording : startRecording}
                  variant="paper"
                  disabled={demoMode || submitting}
                  aria-pressed={recording}
                  data-guest-upload-choice="voice"
                  className="grid min-h-[8.5rem] w-full place-content-center gap-2 rounded-[26px] border-dashed bg-white/58 p-5 text-center hover:bg-white"
                >
                  {recording ? <Pause aria-hidden="true" className="size-7 text-[var(--champagne-deep)]" /> : <Mic aria-hidden="true" className="size-7 text-[var(--champagne-deep)]" />}
                  <span className="text-sm font-bold">
                    {recording ? text.guest.stop : text.guest.record}
                  </span>
                </Button>

                {recording ? (
                  <div
                    role="timer"
                    aria-live="polite"
                    className={`rounded-2xl border px-4 py-3 text-center text-sm font-bold tabular-nums ${
                      recordingRemaining <= RECORDING_WARNING_SECONDS
                        ? "border-amber-300 bg-amber-50 text-amber-900"
                        : "border-[var(--line)] bg-white/58 text-[var(--ink-soft)]"
                    }`}
                  >
                    {text.guest.recordingRemaining.replace(
                      "{time}",
                      formatRecordingTime(recordingRemaining),
                    )}
                    {recordingRemaining <= RECORDING_WARNING_SECONDS ? (
                      <span className="mt-1 block text-xs">
                        {text.guest.recordingEndingSoon}
                      </span>
                    ) : null}
                  </div>
                ) : null}

                {recordedUrl ? (
                  <audio src={recordedUrl} controls className="w-full" />
                ) : null}
              </div>

              {error ? (
                <p
                  role="alert"
                  aria-live="assertive"
                  className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
                >
                  {error}
                </p>
              ) : null}

              {submitting ? (
                <div className="grid gap-3" aria-live="polite">
                  <div
                    role="progressbar"
                    aria-label={text.guest.uploadProgress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={uploadProgress}
                    className="h-2.5 overflow-hidden rounded-full bg-black/10"
                  >
                    <div
                      className="h-full rounded-full bg-[var(--ink)]"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3 text-xs font-bold text-[var(--ink-soft)]">
                    <span>{text.guest.uploadProgress}</span>
                    <span className="tabular-nums">{uploadProgress}%</span>
                  </div>
                  <Button
                    variant="danger"
                    onClick={cancelUpload}
                    className="justify-self-start"
                  >
                    <X aria-hidden="true" className="size-4" />
                    {text.guest.cancelUpload}
                  </Button>
                </div>
              ) : (
                <Button
                  type="submit"
                  disabled={demoMode || recording}
                  className="justify-self-center min-h-14 px-6 !font-extrabold uppercase !tracking-[0.08em]"
                >
                  {uploadFailed ? (
                    <RotateCcw aria-hidden="true" className="size-4" />
                  ) : (
                    <Check aria-hidden="true" className="size-4" />
                  )}
                  {uploadFailed ? text.guest.retryUpload : text.guest.send}
                </Button>
              )}
              {!demoMode ? <TurnstileGate ref={turnstileRef} /> : null}
            </form>
          )}
          </section>
        </div>
      </Shell>
      <GuidanceDialog
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        closeLabel={text.close}
        eyebrow={text.guest.helpEyebrow}
        title={text.guest.helpTitle}
        body={text.guest.helpBody}
        steps={text.guest.helpSteps}
        cards={guestHelpCards}
        footer={text.guest.helpFooter}
      />
    </>
  );
}
