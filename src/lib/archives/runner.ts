import {
  archiveAttemptCallbackSecret,
  archiveRequestSignature,
} from "@/lib/archives/signing";
import { ArchiveDispatchRejectedError } from "@/lib/archives/dispatch";

type DispatchJob = {
  id: string;
  weddingId: string;
  archiveFileName: string | null;
  attemptId: string | null;
};

function configuredRunnerUrl() {
  const value = process.env.ARCHIVE_RUNNER_URL?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

function dispatchSecret() {
  const value = process.env.ARCHIVE_DISPATCH_SECRET ?? "";
  return Buffer.byteLength(value, "utf8") >= 32 ? value : null;
}

function callbackRootSecret() {
  const value = process.env.ARCHIVE_CALLBACK_SECRET ?? "";
  return Buffer.byteLength(value, "utf8") >= 32 ? value : null;
}

function configuredAppOrigin() {
  const value = process.env.ARCHIVE_APP_ORIGIN?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.hostname !== "localhost") return null;
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function archiveRunnerIsConfigured() {
  return Boolean(
    configuredRunnerUrl() &&
      dispatchSecret() &&
      callbackRootSecret() &&
      configuredAppOrigin(),
  );
}

export async function dispatchArchiveJob(input: { job: DispatchJob }) {
  const runnerUrl = configuredRunnerUrl();
  const secret = dispatchSecret();
  const callbackSecret = callbackRootSecret();
  const apiBaseUrl = configuredAppOrigin();
  if (!runnerUrl || !secret || !callbackSecret || !apiBaseUrl || !input.job.archiveFileName) {
    throw new Error("Archive runner is not configured.");
  }

  const target = new URL("jobs", runnerUrl.href.endsWith("/") ? runnerUrl : `${runnerUrl}/`);
  const attemptId = input.job.attemptId;
  if (!attemptId) throw new Error("Archive attempt was not reserved.");
  const body = JSON.stringify({
    jobId: input.job.id,
    weddingId: input.job.weddingId,
    archiveFileName: input.job.archiveFileName,
    apiBaseUrl,
    attemptId,
    callbackSecret: archiveAttemptCallbackSecret(callbackSecret, input.job.id, attemptId),
  });
  const timestamp = String(Date.now());
  const signature = archiveRequestSignature({
    secret,
    timestamp,
    method: "POST",
    path: target.pathname,
    body,
  });

  const response = await fetch(target, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-archive-timestamp": timestamp,
      "x-archive-signature": signature,
    },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) {
      throw new ArchiveDispatchRejectedError(response.status);
    }
    throw new Error(`Archive runner request failed (${response.status}).`);
  }
}
