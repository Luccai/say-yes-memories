"use client";

import {
  ChangeEvent,
  DragEvent,
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Check,
  ImageIcon,
  LoaderCircle,
  LockKeyhole,
  Mic,
  Pause,
  RotateCcw,
  Send,
  UploadCloud,
  X,
} from "lucide-react";
import Image from "next/image";
import dynamic from "next/dynamic";
import type { MediaKind, PublicWedding } from "@/lib/types";
import { Button } from "@/components/shared/Button";
import { HelpTriggerButton } from "@/components/shared/GuidanceTriggerButton";
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

const GuidanceDialog = dynamic(() =>
  import("@/components/shared/GuidanceDialog").then((module) => module.GuidanceDialog),
);

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

type UploadChoice = "file" | "voice" | null;

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
  const [fileDragging, setFileDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingStarting, setRecordingStarting] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState("");
  const [uploadChoice, setUploadChoice] = useState<UploadChoice>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadFailed, setUploadFailed] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const turnstileRef = useRef<TurnstileGateHandle | null>(null);
  const recorderRef = useRef<VoiceRecorder | null>(null);
  const recordingStartingRef = useRef(false);
  const recordingStartAttemptRef = useRef(0);
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
      recordingStartAttemptRef.current += 1;
      recordingStartingRef.current = false;
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

  function chooseFile(selectedFile: File | null) {
    setError("");
    setUploadFailed(false);
    setUploadProgress(0);
    if (selectedFile && selectedFile.size > MAX_GUEST_UPLOAD_BYTES) {
      setFile(null);
      setFilePreviewUrl("");
      setError(text.guest.fileTooLarge);
      return;
    }
    if (selectedFile && !mediaKindFor(selectedFile)) {
      setFile(null);
      setFilePreviewUrl("");
      setError(text.guest.unsupportedFile);
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

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    if (!demoMode) {
      chooseFile(event.target.files?.[0] ?? null);
    }

    event.target.value = "";
  }

  function openFileDialog() {
    if (!demoMode && !submitting && !recording) {
      fileInputRef.current?.click();
    }
  }

  function handleFileDragOver(event: DragEvent<HTMLDivElement>) {
    if (demoMode || submitting || recording) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setFileDragging(true);
  }

  function handleFileDragLeave(event: DragEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
      setFileDragging(false);
    }
  }

  function handleFileDrop(event: DragEvent<HTMLDivElement>) {
    if (demoMode || submitting || recording) return;
    event.preventDefault();
    setFileDragging(false);
    chooseFile(event.dataTransfer.files?.[0] ?? null);
  }

  function clearSelectedFile() {
    setFile(null);
    setFilePreviewUrl("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function clearSelectedMedia() {
    clearSelectedFile();
    setRecordedBlob(null);
    setRecordedUrl("");
  }

  function chooseUploadChoice(nextChoice: Exclude<UploadChoice, null>) {
    if (demoMode || submitting || uploadChoice === nextChoice) return;

    if (recording) {
      stopRecording();
    }
    clearSelectedMedia();
    setUploadChoice(nextChoice);
    setError("");
    setUploadFailed(false);
  }

  async function startRecording() {
    if (demoMode || recording || recordingStartingRef.current || recorderRef.current) return;

    setError("");
    recordingStartingRef.current = true;
    setRecordingStarting(true);
    const attempt = recordingStartAttemptRef.current + 1;
    recordingStartAttemptRef.current = attempt;
    let stream: MediaStream | null = null;

    try {
      if (typeof MediaRecorder === "undefined") {
        throw new Error("MediaRecorder is unavailable.");
      }
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (recordingStartAttemptRef.current !== attempt) {
        return;
      }
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
      recorder.start(1000);
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
      stream = null;

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
      if (recordingStartAttemptRef.current === attempt) {
        setError(text.guest.micDenied);
      }
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
      if (recordingStartAttemptRef.current === attempt) {
        recordingStartingRef.current = false;
        setRecordingStarting(false);
      }
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

    if (demoMode || abortControllerRef.current) return;

    const controller = new AbortController();
    abortControllerRef.current = controller;
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
        controller.signal.throwIfAborted();
      }

      const { createMediaThumbnail } = await import("@/lib/media-thumbnails");
      const thumbnailFile = await createMediaThumbnail(uploadFile);
      controller.signal.throwIfAborted();
      const turnstileToken = await turnstileRef.current?.execute(controller.signal);
      if (!turnstileToken) throw new Error("UPLOAD_VERIFICATION_UNAVAILABLE");
      controller.signal.throwIfAborted();
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
      setUploadChoice(null);
      if (recordedUrl) {
        URL.revokeObjectURL(recordedUrl);
        setRecordedUrl("");
      }
    } catch (error) {
      if (abortControllerRef.current !== controller) {
        return;
      }
      if (error instanceof DOMException && error.name === "AbortError") {
        setError(text.guest.uploadCancelled);
      } else {
        const code =
          error && typeof error === "object" && "code" in error
            ? String(error.code)
            : error instanceof Error
              ? error.message
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
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
        setSubmitting(false);
      }
    }
  }

  function cancelUpload() {
    const controller = abortControllerRef.current;
    if (!controller) return;
    controller.abort();
    if (abortControllerRef.current === controller) {
      abortControllerRef.current = null;
      setSubmitting(false);
      setError(text.guest.uploadCancelled);
      setUploadFailed(true);
    }
  }

  const Shell: "div" | "main" = embedded ? "div" : "main";
  const guestHelpCards = demoMode
    ? [...text.guest.helpCards, text.guest.demoHelpCard]
    : text.guest.helpCards;
  const recordingRemaining = Math.max(
    MAX_RECORDING_SECONDS - recordingSeconds,
    0,
  );
  const shouldShowIdentityFields = demoMode || uploadChoice !== null;

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
            className="paper-grain overflow-hidden rounded-[30px] border border-white/75 bg-[var(--paper-soft)] p-4 shadow-none sm:p-5 sm:shadow-[var(--shadow-soft)]"
          >
            <div className="relative z-10">
              <div className="flex justify-end">
                <HelpTriggerButton
                  label={text.help}
                  onClick={() => setHelpOpen(true)}
                  iconOnly
                />
              </div>
              <div className="mx-auto flex max-w-md items-center gap-4 text-left sm:-mt-5">
                <div
                  data-guest-profile-orb="true"
                  className="h-[5.5rem] w-[4.5rem] shrink-0 sm:h-28 sm:w-24"
                >
                  <MediaOrb
                    media={displayWedding.profileMedia}
                    label={displayWedding.coupleName}
                    className="size-full"
                  />
                </div>
                <div className="min-w-0 flex-1 sm:pr-14">
                  <p className="eyebrow text-[var(--champagne-deep)]">
                    {text.guest.invited}
                  </p>
                  <h1 className="mt-1 font-display text-3xl font-semibold leading-none text-balance text-[var(--ink)] sm:text-4xl">
                    {displayWedding.coupleName}
                  </h1>
                  {displayWedding.eventDate ? (
                    <p className="mt-2 text-xs font-semibold tracking-wide text-[var(--ink-soft)]">
                      {formatWeddingDate(displayWedding.eventDate, locale)}
                    </p>
                  ) : null}
                </div>
              </div>
              <div
                data-guest-welcome-note="true"
                className="mx-auto mt-5 max-w-md rounded-[24px] border border-[rgba(139,107,63,0.18)] bg-[rgba(239,225,207,0.58)] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.76),0_10px_24px_rgba(58,40,25,0.06)] sm:px-5"
              >
                <p className="text-pretty text-sm leading-6 text-[var(--ink-soft)]">
                  {displayWedding.welcomeNote}
                </p>
              </div>
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
                  onClick={() => {
                    setSubmitted(false);
                    setUploadChoice(null);
                  }}
                  variant="paper"
                  className="mt-6"
                >
                  {text.guest.sendAnother}
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="grid gap-4">
              <fieldset className="grid gap-3">
                <legend className="sr-only">{text.guest.chooseType}</legend>
                <div data-guest-upload-choices="true" className="grid grid-cols-2 gap-3">
                  <Button
                    type="button"
                    variant={uploadChoice === "file" ? "ink" : "paper"}
                    disabled={demoMode || submitting || recording}
                    aria-pressed={uploadChoice === "file"}
                    data-guest-upload-choice="file"
                    onClick={() => chooseUploadChoice("file")}
                    className="min-h-24 flex-col gap-2 rounded-[24px] px-3 py-4 text-center"
                  >
                    <UploadCloud aria-hidden="true" className="size-6 text-[var(--champagne-deep)]" />
                    <span>{text.guest.photoVideo}</span>
                  </Button>
                  <Button
                    type="button"
                    variant={uploadChoice === "voice" ? "ink" : "paper"}
                    disabled={demoMode || submitting}
                    aria-pressed={uploadChoice === "voice"}
                    data-guest-upload-choice="voice"
                    onClick={() => chooseUploadChoice("voice")}
                    className="min-h-24 flex-col gap-2 rounded-[24px] px-3 py-4 text-center"
                  >
                    <Mic aria-hidden="true" className="size-6 text-[var(--champagne-deep)]" />
                    <span>{text.guest.voiceNote}</span>
                  </Button>
                </div>
              </fieldset>

              {uploadChoice === "file" ? (
                <div data-guest-upload-panel="file" className="grid gap-3">
                  <div
                    aria-label={text.guest.choosePhotoVideo}
                    data-dragging={fileDragging || undefined}
                    data-guest-file-uploader="true"
                    onDragEnter={handleFileDragOver}
                    onDragLeave={handleFileDragLeave}
                    onDragOver={handleFileDragOver}
                    onDrop={handleFileDrop}
                    className={`relative flex min-h-52 flex-col overflow-hidden rounded-[26px] border border-dashed border-[var(--line)] bg-white/58 p-4 transition-colors has-[input:focus]:border-[var(--champagne-deep)] has-[input:focus]:ring-2 has-[input:focus]:ring-[rgba(199,166,111,0.28)] data-[dragging=true]:bg-[rgba(199,166,111,0.12)] ${
                      submitting || recording ? "cursor-not-allowed opacity-65" : "hover:bg-white"
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*,video/*"
                      aria-label={text.guest.choosePhotoVideo}
                      className="sr-only"
                      onChange={handleFileChange}
                      disabled={demoMode || submitting || recording}
                    />
                    {file && filePreviewUrl ? (
                      <div className="flex h-full w-full flex-col gap-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="min-w-0 truncate text-sm font-bold text-[var(--ink)]">
                            {file.name}
                          </p>
                          <Button
                            type="button"
                            size="compact"
                            variant="paper"
                            onClick={openFileDialog}
                            disabled={demoMode || submitting || recording}
                            className="shrink-0 px-3"
                          >
                            <UploadCloud aria-hidden="true" className="size-3.5" />
                            {text.guest.choosePhotoVideo}
                          </Button>
                        </div>
                        <div className="relative min-h-36 flex-1 overflow-hidden rounded-[18px] bg-[rgba(31,23,18,0.08)]">
                          {mediaKindFor(file) === "image" ? (
                            <Image
                              src={filePreviewUrl}
                              alt={file.name}
                              fill
                              unoptimized
                              sizes="(max-width: 544px) 100vw, 480px"
                              className="object-cover"
                            />
                          ) : (
                            <video
                              src={filePreviewUrl}
                              controls
                              preload="metadata"
                              className="absolute inset-0 h-full w-full bg-black object-contain"
                            />
                          )}
                          <Button
                            type="button"
                            size="icon"
                            variant="ink"
                            aria-label={text.guest.removeMedia}
                            onClick={clearSelectedFile}
                            disabled={demoMode || submitting || recording}
                            className="absolute right-2 top-2 size-8 min-h-8 border-2 border-[var(--paper-soft)] p-0 shadow-none"
                          >
                            <X aria-hidden="true" className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="m-auto flex max-w-sm flex-col items-center justify-center px-4 py-3 text-center">
                        <div className="mb-3 grid size-11 place-items-center rounded-full border border-[var(--line)] bg-[var(--paper-soft)] text-[var(--champagne-deep)]">
                          <ImageIcon aria-hidden="true" className="size-5" />
                        </div>
                        <p className="text-sm font-bold text-[var(--ink)]">
                          {text.guest.dropPhotoVideo}
                        </p>
                        <p className="mt-1 text-xs text-[var(--ink-soft)]">
                          {text.guest.photoVideoLimit}
                        </p>
                        <Button
                          type="button"
                          variant="paper"
                          onClick={openFileDialog}
                          disabled={demoMode || submitting || recording}
                          className="mt-4"
                        >
                          <UploadCloud aria-hidden="true" className="size-4" />
                          {text.guest.choosePhotoVideo}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}

              {uploadChoice === "voice" ? (
                <div data-guest-upload-panel="voice" className="grid gap-3">
                  <Button
                    type="button"
                    onClick={recording ? stopRecording : startRecording}
                    variant="paper"
                    disabled={submitting || recordingStarting}
                    aria-busy={recordingStarting}
                    aria-pressed={recording}
                    className="grid min-h-28 w-full place-content-center gap-2 rounded-[26px] border-dashed bg-white/58 p-5 text-center hover:bg-white"
                  >
                    {recording ? <Pause aria-hidden="true" className="size-7 text-[var(--champagne-deep)]" /> : <Mic aria-hidden="true" className="size-7 text-[var(--champagne-deep)]" />}
                    <span className="text-sm font-bold">
                      {recording ? text.guest.stop : text.guest.record}
                    </span>
                  </Button>
                  {!recording ? (
                    <label className="focus-ring cursor-pointer justify-self-center rounded-full px-4 py-2 text-xs font-bold text-[var(--ink-soft)] transition hover:bg-white hover:text-[var(--ink)]">
                      {text.guest.chooseAudio}
                      <input
                        type="file"
                        accept="audio/*"
                        className="sr-only"
                        onChange={handleFileChange}
                        disabled={submitting}
                      />
                    </label>
                  ) : null}
                </div>
              ) : null}

              {file && filePreviewUrl && uploadChoice !== "file" ? (
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

              {recordedUrl ? <audio src={recordedUrl} controls className="w-full" /> : null}

              {shouldShowIdentityFields ? (
                <div className="grid gap-4">
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
                    {text.guest.noteOptional}
                    <textarea
                      value={note}
                      onChange={(event) => setRawNote(event.target.value)}
                      rows={3}
                      disabled={demoMode || submitting}
                      className="focus-ring rounded-2xl border border-[var(--line)] bg-[#f1e8db] px-4 py-4 !text-[16px] leading-7 outline-none disabled:cursor-not-allowed disabled:opacity-65"
                      placeholder={text.guest.notePlaceholder}
                    />
                  </label>
                </div>
              ) : null}

              {shouldShowIdentityFields ? (
                <>
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
                    <div className="grid justify-items-center gap-3" aria-live="polite">
                      <Button
                        type="button"
                        disabled
                        aria-label={text.guest.send}
                        aria-busy="true"
                        data-guest-send-memory="loading"
                        data-loading="true"
                        className="group relative gap-2 whitespace-nowrap disabled:opacity-100"
                      >
                        <span className="flex items-center gap-2 group-data-[loading]:text-transparent">
                          <Send aria-hidden="true" className="size-4 shrink-0" />
                          {text.guest.send}
                        </span>
                        <span className="absolute inset-0 flex items-center justify-center">
                          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                        </span>
                      </Button>
                      <div className="grid w-full gap-3">
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
                          variant="paper"
                          onClick={cancelUpload}
                          className="justify-self-start"
                        >
                          <X aria-hidden="true" className="size-4" />
                          {text.guest.cancelUpload}
                        </Button>
                      </div>
                    </div>
                  ) : (
                <div className="grid justify-items-center gap-2">
                  <Button
                    type="submit"
                    disabled={demoMode || recording}
                    data-guest-send-memory="ready"
                    className="gap-2 whitespace-nowrap"
                  >
                    {uploadFailed ? (
                      <RotateCcw aria-hidden="true" className="size-4" />
                    ) : (
                      <Send aria-hidden="true" className="size-4 shrink-0" />
                    )}
                    {uploadFailed ? text.guest.retryUpload : text.guest.send}
                  </Button>
                  {!demoMode ? (
                    <p className="flex items-center justify-center gap-1.5 text-center text-xs font-semibold text-[var(--ink-soft)]">
                      <LockKeyhole aria-hidden="true" className="size-3.5 shrink-0" />
                      {text.guest.privateDelivery}
                    </p>
                  ) : null}
                </div>
                  )}
                </>
              ) : null}
              {!demoMode && shouldShowIdentityFields ? <TurnstileGate ref={turnstileRef} /> : null}
            </form>
          )}
          </section>
        </div>
      </Shell>
      {helpOpen ? (
        <GuidanceDialog
          open
          onClose={() => setHelpOpen(false)}
          closeLabel={text.close}
          eyebrow={text.guest.helpEyebrow}
          title={text.guest.helpTitle}
          body={text.guest.helpBody}
          steps={text.guest.helpSteps}
          cards={guestHelpCards}
          footer={text.guest.helpFooter}
        />
      ) : null}
    </>
  );
}
