import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_SIGNATURE_AGE_MS = 5 * 60 * 1000;

type SignatureInput = {
  secret: string;
  timestamp: string;
  method: string;
  path: string;
  body: string;
};

function canonicalRequest(input: Omit<SignatureInput, "secret">) {
  return [
    input.timestamp,
    input.method.toUpperCase(),
    input.path,
    input.body,
  ].join("\n");
}

function hasSafeSecret(secret: string) {
  return Buffer.byteLength(secret, "utf8") >= 32;
}

export function archiveAttemptCallbackSecret(
  rootSecret: string,
  jobId: string,
  attemptId: string,
) {
  if (!hasSafeSecret(rootSecret)) {
    throw new Error("Archive callback secret must be at least 32 bytes.");
  }
  if (!/^archive_[a-f0-9]{24}$/.test(jobId)) {
    throw new Error("Archive job id is invalid.");
  }
  if (!/^attempt_[a-f0-9]{24}$/.test(attemptId)) {
    throw new Error("Archive attempt id is invalid.");
  }
  return createHmac("sha256", rootSecret)
    .update(`archive-callback:${jobId}:${attemptId}`, "utf8")
    .digest("hex");
}

export function archiveRequestSignature(input: SignatureInput) {
  if (!hasSafeSecret(input.secret)) {
    throw new Error("Archive request signing secret must be at least 32 bytes.");
  }
  return createHmac("sha256", input.secret)
    .update(canonicalRequest(input), "utf8")
    .digest("hex");
}

export function verifyArchiveRequestSignature(
  input: SignatureInput & { signature: string; now?: Date },
) {
  if (!hasSafeSecret(input.secret)) return false;
  const timestamp = Number(input.timestamp);
  if (!Number.isSafeInteger(timestamp)) return false;

  const now = input.now?.getTime() ?? Date.now();
  if (Math.abs(now - timestamp) > MAX_SIGNATURE_AGE_MS) return false;

  const expected = archiveRequestSignature(input);
  const receivedBuffer = Buffer.from(input.signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  if (receivedBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(receivedBuffer, expectedBuffer);
}

export function archiveSignatureHeaders(input: SignatureInput) {
  return {
    "x-archive-timestamp": input.timestamp,
    "x-archive-signature": archiveRequestSignature(input),
  };
}
