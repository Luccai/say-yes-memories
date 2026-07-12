import type { PresentationCursor } from "@/lib/presentation/types";

const CURSOR_ID_PATTERN = /^[A-Za-z0-9_-]{1,160}$/;
const CURSOR_DATE_PATTERN = /^[0-9T:.+\-Z]{20,40}$/;

function assertPresentationCursor(value: unknown): asserts value is PresentationCursor {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid presentation cursor.");
  }

  const cursor = value as Partial<PresentationCursor>;
  if (
    typeof cursor.id !== "string" ||
    !CURSOR_ID_PATTERN.test(cursor.id) ||
    typeof cursor.createdAt !== "string" ||
    !CURSOR_DATE_PATTERN.test(cursor.createdAt) ||
    !Number.isFinite(Date.parse(cursor.createdAt))
  ) {
    throw new Error("Invalid presentation cursor.");
  }
}

export function encodePresentationCursor(cursor: PresentationCursor) {
  assertPresentationCursor(cursor);
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodePresentationCursor(encoded: string): PresentationCursor {
  if (!encoded || encoded.length > 1_024 || !/^[A-Za-z0-9_-]+$/.test(encoded)) {
    throw new Error("Invalid presentation cursor.");
  }

  try {
    const value = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    assertPresentationCursor(value);
    return value;
  } catch {
    throw new Error("Invalid presentation cursor.");
  }
}
