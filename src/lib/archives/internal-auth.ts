import {
  archiveAttemptCallbackSecret,
  verifyArchiveRequestSignature,
} from "@/lib/archives/signing";

export class ArchiveRequestAuthorizationError extends Error {}
export class ArchiveRequestBodyError extends Error {}

const MAX_INTERNAL_BODY_BYTES = 8 * 1024;

async function readBody(request: Request) {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_INTERNAL_BODY_BYTES) {
    throw new ArchiveRequestBodyError("Archive runner body is too large.");
  }
  if (request.method !== "GET" && !(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    throw new ArchiveRequestBodyError("Archive runner content type is invalid.");
  }
  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let body = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_INTERNAL_BODY_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new ArchiveRequestBodyError("Archive runner body is too large.");
    }
    body += decoder.decode(value, { stream: true });
  }
  return body + decoder.decode();
}

export async function readAuthorizedArchiveRequest(request: Request, jobId: string) {
  const rootSecret = process.env.ARCHIVE_CALLBACK_SECRET ?? "";
  const body = await readBody(request);
  const attemptId = request.headers.get("x-archive-attempt") ?? "";
  const signature = request.headers.get("x-archive-signature") ?? "";
  const timestamp = request.headers.get("x-archive-timestamp") ?? "";
  let authorized = false;
  try {
    authorized = verifyArchiveRequestSignature({
      secret: archiveAttemptCallbackSecret(rootSecret, jobId, attemptId),
      timestamp,
      signature,
      method: request.method,
      path: new URL(request.url).pathname,
      body,
    });
  } catch {
    authorized = false;
  }
  if (!authorized) {
    throw new ArchiveRequestAuthorizationError("Archive runner request was rejected.");
  }
  return { body, attemptId };
}

export function parseArchiveJson(body: string) {
  try {
    const value: unknown = body ? JSON.parse(body) : {};
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Archive runner body is invalid.");
    }
    return value as Record<string, unknown>;
  } catch {
    throw new Error("Archive runner body is invalid.");
  }
}

export function nonNegativeSafeInteger(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}
