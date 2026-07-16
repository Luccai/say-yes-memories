import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { archiveAttemptCallbackSecret, archiveRequestSignature } from "@/lib/archives/signing";
import { readAuthorizedArchiveRequest } from "@/lib/archives/internal-auth";
import type { ArchiveJob } from "@/lib/archives/store";
import type { Wedding } from "@/lib/types";
import { createArchiveCurrentHandlers } from "../src/app/api/archives/current/route";
import { createArchiveDownloadGet } from "../src/app/api/archives/[id]/download/route";

const wedding: Wedding = {
  id: "wed_archive_test",
  slug: "fatma-mihail",
  studioCode: "SY-ARCHIVE",
  plan: "classic",
  storageQuotaBytes: 50 * 1024 ** 3,
  storageUsedBytes: 1_024,
  brideName: "Fatma",
  groomName: "Mihail",
  coupleName: "Fatma & Mihail",
  welcomeNote: "Welcome",
  uploadLocked: false,
  createdAt: "2026-07-14T10:00:00.000Z",
  updatedAt: "2026-07-14T10:00:00.000Z",
};

const archive: ArchiveJob = {
  id: "archive_aaaaaaaaaaaaaaaaaaaaaaaa",
  weddingId: wedding.id,
  status: "queued",
  active: true,
  sourceMediaCount: 2,
  sourcePhotoCount: 1,
  sourceVideoCount: 1,
  sourceAudioCount: 0,
  sourceTotalBytes: 1_024,
  preparedMediaCount: 0,
  preparedSourceBytes: 0,
  archivePath: `archives/${wedding.id}/archive_aaaaaaaaaaaaaaaaaaaaaaaa/fatma-mihail-wedding-memories.zip`,
  archiveFileName: "fatma-mihail-wedding-memories.zip",
  archiveByteSize: null,
  errorCode: null,
  errorDetail: null,
  workerStartedAt: null,
  attemptId: null,
  leaseExpiresAt: null,
  completedAt: null,
  expiresAt: null,
  storageCleanedAt: null,
  storageCleanupAttempts: 0,
  storageCleanupError: null,
  lastCleanupAttemptAt: null,
  createdAt: new Date(Date.now() - 20_000).toISOString(),
  updatedAt: "2026-07-14T10:00:00.000Z",
};

const source = {
  mediaCount: 2,
  photoCount: 1,
  videoCount: 1,
  audioCount: 0,
  totalBytes: 1_024,
};

const session = {
  id: "session_archive_test",
  weddingId: wedding.id,
  createdAt: "2026-07-14T10:00:00.000Z",
  expiresAt: "2026-10-14T10:00:00.000Z",
};

function currentDependencies(
  overrides: Partial<Parameters<typeof createArchiveCurrentHandlers>[0]> = {},
) {
  return {
    getCurrentWeddingFromCookie: async () => ({ wedding, session }),
    createOrReuseArchiveJob: async () => ({ job: archive, created: true }),
    beginArchiveJobAttempt: async () => ({
      ...archive,
      status: "running" as const,
      attemptId: "attempt_aaaaaaaaaaaaaaaaaaaaaaaa",
      workerStartedAt: new Date().toISOString(),
      leaseExpiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    }),
    failArchiveJob: async () => ({ ...archive, status: "failed" as const }),
    getArchiveSourceSummary: async () => source,
    getLatestArchiveJob: async () => null,
    archiveRunnerIsConfigured: () => true,
    dispatchArchiveJob: async () => undefined,
    archiveFeatureIsEnabled: () => true,
    ...overrides,
  };
}

describe("archive customer routes", () => {
  test("keeps the launch-deferred archive route closed before any DB work", async () => {
    let sessionCalls = 0;
    let createCalls = 0;
    const handlers = createArchiveCurrentHandlers(
      currentDependencies({
        archiveFeatureIsEnabled: () => false,
        getCurrentWeddingFromCookie: async () => {
          sessionCalls += 1;
          return { wedding, session };
        },
        createOrReuseArchiveJob: async () => {
          createCalls += 1;
          return { job: archive, created: true };
        },
      }),
    );
    const response = await handlers.POST();
    expect(response.status).toBe(404);
    expect(sessionCalls).toBe(0);
    expect(createCalls).toBe(0);
  });

  test("requires a customer session before exposing archive status", async () => {
    const handlers = createArchiveCurrentHandlers(
      currentDependencies({ getCurrentWeddingFromCookie: async () => null }),
    );
    const response = await handlers.GET();
    expect(response.status).toBe(401);
  });

  test("does not create an empty archive even when POST is called directly", async () => {
    let createCalls = 0;
    const handlers = createArchiveCurrentHandlers(
      currentDependencies({
        getArchiveSourceSummary: async () => ({ ...source, mediaCount: 0 }),
        createOrReuseArchiveJob: async () => {
          createCalls += 1;
          return { job: archive, created: true };
        },
      }),
    );
    const response = await handlers.POST();
    expect(response.status).toBe(409);
    expect(createCalls).toBe(0);
  });

  test("dispatches a queued archive without leaking its R2 path to the client", async () => {
    const dispatched: string[] = [];
    const handlers = createArchiveCurrentHandlers(
      currentDependencies({
        dispatchArchiveJob: async ({ job }) => {
          dispatched.push(job.id);
        },
      }),
    );
    const response = await handlers.POST();
    const body = await response.text();
    expect(response.status).toBe(202);
    expect(dispatched).toEqual([archive.id]);
    expect(body).not.toContain("archivePath");
    expect(body).not.toContain("archives/");
  });

  test("looks up a download by both archive id and the signed-in wedding", async () => {
    const lookups: Array<{ jobId: string; weddingId: string }> = [];
    const signedPaths: string[] = [];
    const signedDurations: number[] = [];
    const readyArchive = {
      ...archive,
      status: "ready" as const,
      completedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    const get = createArchiveDownloadGet({
      archiveFeatureIsEnabled: () => true,
      getCurrentWeddingFromCookie: async () => ({ wedding, session }),
      getArchiveJobForWedding: async (jobId, weddingId) => {
        lookups.push({ jobId, weddingId });
        return readyArchive;
      },
      createSignedStorageUrl: async (path, seconds) => {
        signedPaths.push(path);
        signedDurations.push(seconds ?? 0);
        return "https://signed.example/archive.zip";
      },
    });
    const response = await get(
      new Request(`http://localhost/api/archives/${archive.id}/download?weddingId=foreign`),
      { params: Promise.resolve({ id: archive.id }) },
    );
    expect(response.status).toBe(307);
    expect(lookups).toEqual([{ jobId: archive.id, weddingId: wedding.id }]);
    expect(signedPaths).toEqual([readyArchive.archivePath as string]);
    expect(signedDurations[0]!).toBeGreaterThan(0);
    expect(signedDurations[0]!).toBeLessThanOrEqual(60);
  });
});

describe("archive callback authorization", () => {
  const rootSecret = "archive-callback-root-secret-that-is-at-least-32-bytes";

  beforeEach(() => {
    process.env.ARCHIVE_CALLBACK_SECRET = rootSecret;
  });

  afterEach(() => {
    delete process.env.ARCHIVE_CALLBACK_SECRET;
  });

  test("a callback credential for one job cannot update another job", async () => {
    const firstJob = "archive_aaaaaaaaaaaaaaaaaaaaaaaa";
    const secondJob = "archive_bbbbbbbbbbbbbbbbbbbbbbbb";
    const attemptId = "attempt_aaaaaaaaaaaaaaaaaaaaaaaa";
    const path = `/api/internal/archives/${secondJob}/progress`;
    const body = JSON.stringify({ preparedMediaCount: 1, preparedSourceBytes: 10 });
    const timestamp = String(Date.now());
    const signature = archiveRequestSignature({
      secret: archiveAttemptCallbackSecret(rootSecret, firstJob, attemptId),
      timestamp,
      method: "POST",
      path,
      body,
    });
    const request = new Request(`https://example.com${path}`, {
      method: "POST",
      headers: {
        "x-archive-timestamp": timestamp,
        "x-archive-signature": signature,
        "x-archive-attempt": attemptId,
        "content-type": "application/json",
      },
      body,
    });

    await expect(readAuthorizedArchiveRequest(request, secondJob)).rejects.toThrow();
  });

  test("rejects callback bodies larger than the internal limit", async () => {
    const jobId = "archive_aaaaaaaaaaaaaaaaaaaaaaaa";
    const attemptId = "attempt_aaaaaaaaaaaaaaaaaaaaaaaa";
    const path = `/api/internal/archives/${jobId}/progress`;
    const request = new Request(`https://example.com${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": "9000",
        "x-archive-attempt": attemptId,
      },
      body: "{}",
    });
    await expect(readAuthorizedArchiveRequest(request, jobId)).rejects.toThrow(
      "too large",
    );
  });

  test("stops reading an oversized callback even without content-length", async () => {
    const jobId = "archive_aaaaaaaaaaaaaaaaaaaaaaaa";
    const request = new Request(
      `https://example.com/api/internal/archives/${jobId}/progress`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-archive-attempt": "attempt_aaaaaaaaaaaaaaaaaaaaaaaa",
        },
        body: JSON.stringify({ padding: "x".repeat(9_000) }),
      },
    );
    await expect(readAuthorizedArchiveRequest(request, jobId)).rejects.toThrow(
      "too large",
    );
  });
});
