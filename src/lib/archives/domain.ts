import type { MediaKind } from "@/lib/types";

export const ARCHIVE_RETENTION_HOURS = 24;

export type ArchiveStatus = "queued" | "running" | "ready" | "failed" | "expired";

export function archiveFolder(kind: MediaKind) {
  if (kind === "image") return "Photos";
  if (kind === "video") return "Videos";
  return "Voice Notes";
}

export function archiveExpiresAt(readyAt: string | Date) {
  const source = readyAt instanceof Date ? readyAt : new Date(readyAt);
  if (Number.isNaN(source.getTime())) {
    throw new Error("Archive ready time is invalid.");
  }
  return new Date(
    source.getTime() + ARCHIVE_RETENTION_HOURS * 60 * 60 * 1000,
  ).toISOString();
}

export function isReusableArchiveStatus(status: ArchiveStatus) {
  return status === "queued" || status === "running" || status === "ready";
}

export function archiveObjectPath(input: {
  weddingId: string;
  jobId: string;
  attemptId: string;
  fileName: string;
}) {
  if (
    !/^archive_[a-f0-9]{24}$/.test(input.jobId) ||
    !/^[a-zA-Z0-9_-]{8,160}$/.test(input.weddingId) ||
    !/^attempt_[a-f0-9]{24}$/.test(input.attemptId) ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*-wedding-memories\.zip$/.test(input.fileName)
  ) {
    throw new Error("Archive output path is invalid.");
  }
  return `archives/${input.weddingId}/${input.jobId}/${input.attemptId}/${input.fileName}`;
}

export function archiveOutputMatches(input: {
  expectedBytes: number;
  exists: boolean;
  byteSize?: number;
  mimeType?: string | null;
}) {
  return Boolean(
    input.exists &&
      Number.isSafeInteger(input.expectedBytes) &&
      input.expectedBytes > 0 &&
      input.byteSize === input.expectedBytes &&
      input.mimeType?.split(";", 1)[0]?.trim().toLowerCase() === "application/zip",
  );
}

function csvField(value: string | undefined) {
  const source = value ?? "";
  const normalized = /^[\u0000-\u0020]*[=+\-@]/.test(source) ? `'${source}` : source;
  return /[",\r\n]/.test(normalized)
    ? `"${normalized.replaceAll('"', '""')}"`
    : normalized;
}

export function buildArchiveMessagesCsv(
  entries: ReadonlyArray<{
    folder: string;
    fileName: string;
    createdAt: string;
    guestName: string;
    note?: string;
  }>,
) {
  const rows = ["folder,file_name,uploaded_at,guest_name,message"];
  for (const entry of entries) {
    rows.push(
      [
        entry.folder,
        entry.fileName,
        entry.createdAt,
        entry.guestName,
        entry.note ?? "",
      ]
        .map(csvField)
        .join(","),
    );
  }
  return `${rows.join("\n")}\n`;
}
