import { MAX_UPLOAD_PART_CONCURRENCY } from "@/lib/uploads/domain";

type UploadTarget = {
  uploadUrl: string;
  method: "PUT";
  headers: Record<string, string>;
};

type PublicReservation = {
  id: string;
  mode: "single" | "multipart";
  status: "pending" | "uploading" | "completed" | "aborted" | "expired";
  mediaId: string;
  byteSize: number;
  partSizeBytes: number;
  partCount: number;
  expiresAt: string;
  hasThumbnail: boolean;
  completedAt: string | null;
};

type UploadCredentials = {
  requestKey: string;
  reservationSecret: string;
};

type UploadProgress = {
  loadedBytes: number;
  totalBytes: number;
  percent: number;
};

type ApiErrorPayload = { code?: string; message?: string };

export class UploadClientError extends Error {
  constructor(readonly code: string, message = code) {
    super(message);
    this.name = "UploadClientError";
  }
}

function randomBase64Url(byteLength = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function createUploadCredentials(): UploadCredentials {
  return {
    requestKey: `request_${randomBase64Url()}`,
    reservationSecret: `sy_upload_${randomBase64Url()}`,
  };
}

function fingerprint(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function credentialStorageKey(input: {
  slug: string;
  file: File;
  guestName: string;
  note: string;
}) {
  const identity = [
    input.slug,
    input.file.name,
    input.file.type,
    input.file.size,
    input.file.lastModified,
    input.guestName.trim(),
    input.note.trim(),
  ].join("\0");
  return `sayyes.upload.v1.${fingerprint(identity)}`;
}

function getOrCreateCredentials(storageKey: string) {
  try {
    const stored = sessionStorage.getItem(storageKey);
    if (stored) {
      const parsed = JSON.parse(stored) as UploadCredentials;
      if (
        /^request_[A-Za-z0-9_-]{43}$/.test(parsed.requestKey) &&
        /^sy_upload_[A-Za-z0-9_-]{43}$/.test(parsed.reservationSecret)
      ) {
        return parsed;
      }
    }
  } catch {
    // A blocked sessionStorage should not block uploads.
  }
  const credentials = createUploadCredentials();
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(credentials));
  } catch {
    // Resuming is best-effort on privacy-restricted browsers.
  }
  return credentials;
}

function clearCredentials(storageKey: string) {
  try {
    sessionStorage.removeItem(storageKey);
  } catch {
    // No action is required when browser storage is unavailable.
  }
}

async function apiJson<T>(url: string, init: RequestInit) {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const payload = (await response.json().catch(() => ({}))) as T & ApiErrorPayload;
  if (!response.ok) {
    throw new UploadClientError(
      payload.code ?? "UPLOAD_FAILED",
      payload.message ?? payload.code ?? "UPLOAD_FAILED",
    );
  }
  return payload;
}

function bearer(secret: string) {
  return { Authorization: `Bearer ${secret}` };
}

function abortError() {
  return new DOMException("Upload cancelled.", "AbortError");
}

function putWithProgress(input: {
  target: UploadTarget;
  body: Blob;
  signal: AbortSignal;
  onProgress: (loaded: number) => void;
}) {
  return new Promise<{ etag: string | null }>((resolve, reject) => {
    if (input.signal.aborted) {
      reject(abortError());
      return;
    }
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    input.signal.addEventListener("abort", abort, { once: true });
    xhr.open(input.target.method, input.target.uploadUrl);
    for (const [name, value] of Object.entries(input.target.headers)) {
      xhr.setRequestHeader(name, value);
    }
    xhr.upload.onprogress = (event) => input.onProgress(event.loaded);
    xhr.onerror = () => reject(new UploadClientError("UPLOAD_NETWORK_FAILED"));
    xhr.onabort = () => reject(abortError());
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        input.onProgress(input.body.size);
        resolve({ etag: xhr.getResponseHeader("ETag") });
      } else {
        reject(new UploadClientError("UPLOAD_STORAGE_FAILED"));
      }
    };
    xhr.onloadend = () => input.signal.removeEventListener("abort", abort);
    xhr.send(input.body);
  });
}

export async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
) {
  let cursor = 0;
  let firstError: unknown;
  const count = Math.min(Math.max(Math.trunc(concurrency), 1), items.length);
  await Promise.all(
    Array.from({ length: count }, async () => {
      while (cursor < items.length && firstError === undefined) {
        const item = items[cursor];
        cursor += 1;
        try {
          await worker(item);
        } catch (error) {
          firstError = error;
        }
      }
    }),
  );
  if (firstError !== undefined) throw firstError;
}

function delay(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(abortError());
    const timer = window.setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        reject(abortError());
      },
      { once: true },
    );
  });
}

function reportProgress(
  totalBytes: number,
  loadedBytes: number,
  callback?: (progress: UploadProgress) => void,
) {
  const safeLoaded = Math.min(Math.max(loadedBytes, 0), totalBytes);
  callback?.({
    loadedBytes: safeLoaded,
    totalBytes,
    percent: totalBytes ? Math.round((safeLoaded / totalBytes) * 100) : 0,
  });
}

async function uploadMultipart(input: {
  slug: string;
  reservation: PublicReservation;
  secret: string;
  file: File;
  signal: AbortSignal;
  onProgress?: (progress: UploadProgress) => void;
}) {
  const root = `/api/uploads/${input.slug}/reservations/${input.reservation.id}`;
  const state = await apiJson<{
    uploadedParts: Array<{ partNumber: number; byteSize: number }>;
  }>(root, { method: "GET", headers: bearer(input.secret), signal: input.signal });
  const uploaded = new Map(
    state.uploadedParts.map((part) => [part.partNumber, part.byteSize]),
  );
  const active = new Map<number, number>();
  const completedBytes = () =>
    [...uploaded.values()].reduce((sum, size) => sum + size, 0);
  const notify = () =>
    reportProgress(
      input.file.size,
      completedBytes() + [...active.values()].reduce((sum, size) => sum + size, 0),
      input.onProgress,
    );
  notify();

  const missing = Array.from(
    { length: input.reservation.partCount },
    (_, index) => index + 1,
  ).filter((partNumber) => !uploaded.has(partNumber));

  await runWithConcurrency(missing, MAX_UPLOAD_PART_CONCURRENCY, async (partNumber) => {
    const start = (partNumber - 1) * input.reservation.partSizeBytes;
    const end = Math.min(start + input.reservation.partSizeBytes, input.file.size);
    const blob = input.file.slice(start, end);

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        active.set(partNumber, 0);
        const signed = await apiJson<{
          alreadyUploaded?: boolean;
          upload?: UploadTarget;
        }>(`${root}/parts/${partNumber}`, {
          method: "POST",
          headers: bearer(input.secret),
          signal: input.signal,
        });
        if (signed.alreadyUploaded) {
          uploaded.set(partNumber, blob.size);
          active.delete(partNumber);
          notify();
          return;
        }
        if (!signed.upload) throw new UploadClientError("UPLOAD_PART_SIGN_FAILED");
        const result = await putWithProgress({
          target: signed.upload,
          body: blob,
          signal: input.signal,
          onProgress: (loaded) => {
            active.set(partNumber, loaded);
            notify();
          },
        });
        if (!result.etag) {
          throw new UploadClientError("UPLOAD_ETAG_UNAVAILABLE");
        }
        await apiJson(`${root}/parts/${partNumber}/complete`, {
          method: "POST",
          headers: {
            ...bearer(input.secret),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ etag: result.etag, byteSize: blob.size }),
          signal: input.signal,
        });
        uploaded.set(partNumber, blob.size);
        active.delete(partNumber);
        notify();
        return;
      } catch (error) {
        active.delete(partNumber);
        notify();
        if (input.signal.aborted || attempt === 3) throw error;
        await delay(500 * 2 ** (attempt - 1), input.signal);
      }
    }
  });
}

async function cancelReservation(slug: string, id: string, secret: string) {
  await fetch(`/api/uploads/${slug}/reservations/${id}`, {
    method: "DELETE",
    headers: bearer(secret),
    cache: "no-store",
  }).catch(() => undefined);
}

export async function uploadGuestMemory(input: {
  slug: string;
  file: File;
  thumbnail?: File | null;
  guestName: string;
  note: string;
  turnstileToken: string;
  signal: AbortSignal;
  onProgress?: (progress: UploadProgress) => void;
}) {
  const storageKey = credentialStorageKey(input);
  const credentials = getOrCreateCredentials(storageKey);
  let reservation: PublicReservation | null = null;

  try {
    const prepared = await apiJson<{
      canonicalSlug: string;
      reservation: PublicReservation;
      upload?: UploadTarget;
      thumbnailUpload?: UploadTarget;
    }>(`/api/uploads/${input.slug}/reservations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...credentials,
        turnstileToken: input.turnstileToken,
        guestName: input.guestName,
        note: input.note,
        fileName: input.file.name,
        mimeType: input.file.type || "application/octet-stream",
        byteSize: input.file.size,
        thumbnail: input.thumbnail
          ? {
              fileName: input.thumbnail.name,
              mimeType: input.thumbnail.type,
              byteSize: input.thumbnail.size,
            }
          : undefined,
      }),
      signal: input.signal,
    });
    reservation = prepared.reservation;
    const slug = prepared.canonicalSlug;

    if (reservation.status !== "completed") {
      if (reservation.mode === "single") {
        if (!prepared.upload) throw new UploadClientError("UPLOAD_SIGN_FAILED");
        await putWithProgress({
          target: prepared.upload,
          body: input.file,
          signal: input.signal,
          onProgress: (loaded) =>
            reportProgress(input.file.size, loaded, input.onProgress),
        });
      } else {
        await uploadMultipart({
          slug,
          reservation,
          secret: credentials.reservationSecret,
          file: input.file,
          signal: input.signal,
          onProgress: input.onProgress,
        });
      }

      if (input.thumbnail && prepared.thumbnailUpload) {
        await putWithProgress({
          target: prepared.thumbnailUpload,
          body: input.thumbnail,
          signal: input.signal,
          onProgress: () => undefined,
        }).catch(() => undefined);
      }

      await apiJson(
        `/api/uploads/${slug}/reservations/${reservation.id}/complete`,
        {
          method: "POST",
          headers: bearer(credentials.reservationSecret),
          signal: input.signal,
        },
      );
    }
    reportProgress(input.file.size, input.file.size, input.onProgress);
    clearCredentials(storageKey);
  } catch (error) {
    if (input.signal.aborted && reservation) {
      await cancelReservation(
        input.slug,
        reservation.id,
        credentials.reservationSecret,
      );
      clearCredentials(storageKey);
    } else if (
      error instanceof UploadClientError &&
      ["UPLOAD_RESTART_REQUIRED", "UPLOAD_REQUEST_CONFLICT"].includes(error.code)
    ) {
      clearCredentials(storageKey);
    }
    throw error;
  }
}
