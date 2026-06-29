"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Mic, Pause, UploadCloud } from "lucide-react";
import { motion } from "motion/react";
import type { MediaKind, PublicWedding } from "@/lib/types";
import { GuidanceDialog, HelpTriggerButton } from "@/components/shared/GuidanceDialog";
import { MediaOrb } from "@/components/shared/MediaOrb";
import { localizedError, useCopy, useLocale } from "@/lib/i18n";
import {
  ensureFreshDemoLocalState,
  getDemoGuestNote,
  localizeDemoGuestNote,
  localizeDemoWedding,
} from "@/lib/demo-content";
import {
  addDemoSessionMedia,
  createDemoSessionMediaId,
} from "@/lib/demo-session-media";
import {
  createCompatibleAudioContext,
  createMp3BlobFromChunks,
  normalizeAudioFileToMp3,
  shouldNormalizeAudioFile,
} from "@/lib/audio-encoding";
import { createMediaThumbnail } from "@/lib/media-thumbnails";
import {
  type ClientSignedUploadTarget,
  uploadToSignedTarget,
} from "@/lib/storage/client-upload";
import { canAcceptGuestUpload } from "@/lib/storage/quota";

type GuestExperienceProps = {
  wedding: PublicWedding;
  demoMode?: boolean;
  embedded?: boolean;
};

type SignedUploadResponse = {
  upload: ClientSignedUploadTarget;
  thumbnailUpload?: ClientSignedUploadTarget;
};

type VoiceRecorder = {
  context: AudioContext;
  chunks: Float32Array[];
  processor: ScriptProcessorNode;
  source: MediaStreamAudioSourceNode;
  stream: MediaStream;
};

const GUEST_ACTION_BUTTON_CLASS =
  "focus-ring inline-flex items-center justify-center gap-2 rounded-full border border-[var(--line)] bg-white/58 px-4 py-2.5 text-[0.78rem] font-bold text-[var(--ink)] transition hover:bg-white active:scale-[0.99] disabled:opacity-60";

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
  if (file.type.startsWith("image/")) {
    return "image";
  }

  if (file.type.startsWith("video/")) {
    return "video";
  }

  if (file.type.startsWith("audio/")) {
    return "audio";
  }

  return null;
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
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState("");
  const recorderRef = useRef<VoiceRecorder | null>(null);
  const uploadsPaused = displayWedding.uploadLocked || !canAcceptGuestUpload(displayWedding);

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
        return;
      }

      recorder.processor.disconnect();
      recorder.source.disconnect();
      recorder.stream.getTracks().forEach((track) => track.stop());
      void recorder.context.close();
    };
  }, []);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0] ?? null;
    setFile(selectedFile);
    setRecordedBlob(null);

    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl);
      setRecordedUrl("");
    }
  }

  async function startRecording() {
    setError("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const context = createCompatibleAudioContext();
      await context.resume();

      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      const chunks: Float32Array[] = [];

      processor.onaudioprocess = (event) => {
        const input = event.inputBuffer.getChannelData(0);
        chunks.push(new Float32Array(input));

        for (let channel = 0; channel < event.outputBuffer.numberOfChannels; channel += 1) {
          event.outputBuffer.getChannelData(channel).fill(0);
        }
      };

      source.connect(processor);
      processor.connect(context.destination);
      recorderRef.current = { context, chunks, processor, source, stream };

      setFile(null);
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
    recorder.processor.disconnect();
    recorder.source.disconnect();
    recorder.stream.getTracks().forEach((track) => track.stop());

    if (recorder.chunks.length === 0) {
      void recorder.context.close();
      setError(text.guest.uploadFailed);
      return;
    }

    const blob = createMp3BlobFromChunks(recorder.chunks, recorder.context.sampleRate);
    const url = URL.createObjectURL(blob);
    setRecordedBlob(blob);
    setRecordedUrl(url);
    void recorder.context.close();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      let uploadFile =
        file ??
        (recordedBlob
          ? new File([recordedBlob], `voice-note.${audioExtensionFor(recordedBlob.type)}`, {
              type: cleanMimeType(recordedBlob.type || "audio/webm"),
            })
          : null);

      if (!uploadFile && !demoMode) {
        setError(text.guest.missingMedia);
        return;
      }

      if (demoMode) {
        if (!uploadFile) {
          setError(text.guest.missingMedia);
          return;
        }

        const kind = mediaKindFor(uploadFile);

        if (!kind) {
          setError(text.guest.uploadFailed);
          return;
        }

        const thumbnailFile = await createMediaThumbnail(uploadFile);
        const createdAt = new Date().toISOString();
        const id = createDemoSessionMediaId();
        const stored = await addDemoSessionMedia({
          id,
          weddingId: wedding.id,
          file: uploadFile,
          kind,
          mimeType: uploadFile.type || "application/octet-stream",
          fileName: uploadFile.name || `memory-${id}`,
          byteSize: uploadFile.size,
          createdAt,
          guestName,
          note: note || undefined,
          thumbnail: thumbnailFile
            ? {
                id: `${id}-thumb`,
                file: thumbnailFile,
                kind: "image",
                mimeType: thumbnailFile.type,
                fileName: thumbnailFile.name,
                byteSize: thumbnailFile.size,
                createdAt,
              }
            : undefined,
          approved: true,
          hidden: false,
          favorite: false,
        });

        if (!stored) {
          setError(text.guest.uploadFailed);
          return;
        }

        await new Promise((resolve) => window.setTimeout(resolve, 520));
        setSubmitted(true);
        setGuestName("");
        setRawNote("");
        setFile(null);
        setRecordedBlob(null);
        return;
      }

      if (!uploadFile) {
        setError(text.guest.missingMedia);
        return;
      }

      if (shouldNormalizeAudioFile(uploadFile)) {
        uploadFile = await normalizeAudioFileToMp3(uploadFile);
      }

      const thumbnailFile = await createMediaThumbnail(uploadFile);
      const prepareResponse = await fetch(`/api/uploads/${wedding.slug}/prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guestName,
          fileName: uploadFile.name,
          mimeType: uploadFile.type || "application/octet-stream",
          byteSize: uploadFile.size,
          thumbnail: thumbnailFile
            ? {
                fileName: thumbnailFile.name,
                mimeType: thumbnailFile.type,
                byteSize: thumbnailFile.size,
              }
            : undefined,
        }),
      });
      const preparePayload = (await prepareResponse.json()) as SignedUploadResponse & {
        message?: string;
      };

      if (!prepareResponse.ok) {
        setError(localizedError(preparePayload.message, text.errors, text.guest.uploadFailed));
        return;
      }

      await uploadToSignedTarget(preparePayload.upload, uploadFile);

      let thumbnailObject: ClientSignedUploadTarget["object"] | undefined;

      if (thumbnailFile && preparePayload.thumbnailUpload) {
        try {
          await uploadToSignedTarget(preparePayload.thumbnailUpload, thumbnailFile);
          thumbnailObject = preparePayload.thumbnailUpload.object;
        } catch {
          thumbnailObject = undefined;
        }
      }

      const completeResponse = await fetch(`/api/uploads/${wedding.slug}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guestName,
          note,
          object: preparePayload.upload.object,
          thumbnail: thumbnailObject,
        }),
      });
      const completePayload = (await completeResponse.json()) as { message?: string };

      if (!completeResponse.ok) {
        setError(localizedError(completePayload.message, text.errors, text.guest.uploadFailed));
        return;
      }

      setSubmitted(true);
      setGuestName("");
      setRawNote("");
      setFile(null);
      setRecordedBlob(null);
    } catch (error) {
      setError(localizedError(error instanceof Error ? error.message : undefined, text.errors, text.guest.uploadFailed));
    } finally {
      setSubmitting(false);
    }
  }

  const Shell: "div" | "main" = embedded ? "div" : "main";
  const guestHelpCards = demoMode
    ? [...text.guest.helpCards, text.guest.demoHelpCard]
    : text.guest.helpCards;

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
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
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
                  {displayWedding.eventDate}
                </p>
              ) : null}
              <p className="mx-auto mt-5 max-w-sm text-pretty text-sm leading-relaxed text-[var(--ink-soft)]">
                {displayWedding.welcomeNote}
              </p>
            </div>
          </motion.section>

        <section className="mt-5 rounded-[34px] border border-white/75 bg-[rgba(255,250,243,0.82)] p-5 shadow-none backdrop-blur sm:shadow-[0_18px_48px_rgba(58,40,25,0.1)]">
          {uploadsPaused ? (
            <div className="grid min-h-[18rem] place-items-center text-center">
              <div>
                <p className="font-display text-fluid-heading font-semibold text-[var(--ink)]">
                  {text.guest.uploadsPaused}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-[var(--ink-soft)]">
                  {text.guest.uploadsPausedBody}
                </p>
              </div>
            </div>
          ) : submitted ? (
            <div className="grid min-h-[18rem] place-items-center text-center">
              <div>
                <div className="mx-auto grid size-16 place-items-center rounded-full bg-[var(--ink)] text-[var(--paper-soft)]">
                  <Check className="size-7" />
                </div>
                <p className="mt-6 font-display text-fluid-heading font-semibold text-[var(--ink)]">
                  {text.guest.thankYou}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-[var(--ink-soft)]">
                  {text.guest.thankYouBody}
                </p>
                <button
                  type="button"
                  onClick={() => setSubmitted(false)}
                  className={`${GUEST_ACTION_BUTTON_CLASS} mt-6`}
                >
                  {text.guest.sendAnother}
                </button>
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
                  className="focus-ring rounded-2xl border border-[var(--line)] bg-[#f1e8db] px-4 py-4 !text-[16px] outline-none"
                  placeholder={text.guest.name}
                />
              </label>

              <label className="grid gap-2 text-sm font-semibold">
                {text.guest.note}
                <textarea
                  value={note}
                  onChange={(event) => setRawNote(event.target.value)}
                  rows={4}
                  className="focus-ring rounded-2xl border border-[var(--line)] bg-[#f1e8db] px-4 py-4 !text-[16px] leading-7 outline-none"
                  placeholder={text.guest.notePlaceholder}
                />
              </label>

              <div className="grid gap-3">
                <label className="focus-ring grid cursor-pointer place-items-center rounded-[26px] border border-dashed border-[var(--line)] bg-white/58 p-5 text-center transition hover:bg-white">
                  <UploadCloud className="mb-2 size-7 text-[var(--champagne-deep)]" />
                  <span className="text-sm font-bold">
                    {file ? file.name : text.guest.choose}
                  </span>
                  <span className="mt-1 text-xs text-[var(--ink-soft)]">
                    {text.guest.private}
                  </span>
                  <input
                    type="file"
                    accept="image/*,video/*,audio/*"
                    className="sr-only"
                    onChange={handleFileChange}
                  />
                </label>

                <button
                  type="button"
                  onClick={recording ? stopRecording : startRecording}
                  className={GUEST_ACTION_BUTTON_CLASS}
                >
                  <span className="inline-flex items-center justify-center gap-2">
                    {recording ? <Pause className="size-4" /> : <Mic className="size-4" />}
                    {recording ? text.guest.stop : text.guest.record}
                  </span>
                </button>

                {recordedUrl ? (
                  <audio src={recordedUrl} controls className="w-full" />
                ) : null}
              </div>

              {error ? (
                <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={submitting}
                className={GUEST_ACTION_BUTTON_CLASS}
              >
                <span className="inline-flex items-center justify-center gap-2">
                  {submitting ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                  {text.guest.send}
                </span>
              </button>
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
