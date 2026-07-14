import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { archiveAttemptCallbackSecret } from "@/lib/archives/signing";
import {
  archiveRunnerIsConfigured,
  dispatchArchiveJob,
} from "@/lib/archives/runner";

const originalFetch = globalThis.fetch;
const dispatchSecret = "archive-dispatch-secret-that-is-at-least-32-bytes";
const callbackSecret = "archive-callback-secret-that-is-at-least-32-bytes";

beforeEach(() => {
  process.env.ARCHIVE_RUNNER_URL = "https://archive-runner.example/";
  process.env.ARCHIVE_APP_ORIGIN = "https://say-yes-memories.vercel.app";
  process.env.ARCHIVE_DISPATCH_SECRET = dispatchSecret;
  process.env.ARCHIVE_CALLBACK_SECRET = callbackSecret;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.ARCHIVE_RUNNER_URL;
  delete process.env.ARCHIVE_APP_ORIGIN;
  delete process.env.ARCHIVE_DISPATCH_SECRET;
  delete process.env.ARCHIVE_CALLBACK_SECRET;
});

describe("archive runner dispatch", () => {
  test("requires a server-controlled callback origin", () => {
    delete process.env.ARCHIVE_APP_ORIGIN;
    expect(archiveRunnerIsConfigured()).toBe(false);
  });

  test("sends only the server origin and an attempt-scoped callback credential", async () => {
    let requestBody = "";
    globalThis.fetch = (async (_input, init) => {
      requestBody = String(init?.body ?? "");
      return new Response(null, { status: 202 });
    }) as typeof fetch;
    const job = {
      id: "archive_aaaaaaaaaaaaaaaaaaaaaaaa",
      weddingId: "wed_archive_test",
      archiveFileName: "fatma-mihail-wedding-memories.zip",
      attemptId: "attempt_aaaaaaaaaaaaaaaaaaaaaaaa",
    };

    await dispatchArchiveJob({ job });
    const payload = JSON.parse(requestBody) as Record<string, string>;
    expect(payload.apiBaseUrl).toBe("https://say-yes-memories.vercel.app");
    expect(payload.attemptId).toBe(job.attemptId);
    expect(payload.callbackSecret).toBe(
      archiveAttemptCallbackSecret(callbackSecret, job.id, payload.attemptId),
    );
    expect(payload.callbackSecret).not.toBe(callbackSecret);
  });
});
