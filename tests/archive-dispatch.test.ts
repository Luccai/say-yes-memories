import { describe, expect, test } from "bun:test";
import {
  ArchiveDispatchRejectedError,
  archiveStartCanBeRetried,
  ensureArchiveJobDispatched,
} from "@/lib/archives/dispatch";

const queuedJob = {
  id: "archive_aaaaaaaaaaaaaaaaaaaaaaaa",
  status: "queued" as const,
};

describe("archive dispatch", () => {
  test("does not fail a queued archive when the network loses a runner response", async () => {
    let failureRecorded = false;
    const result = await ensureArchiveJobDispatched({
      job: queuedJob,
      runnerConfigured: true,
      dispatch: async () => {
        throw new Error("request timed out after the Worker accepted it");
      },
      fail: async () => {
        failureRecorded = true;
        return { ...queuedJob, status: "failed" as const };
      },
    });

    expect(result.job).toBe(queuedJob);
    expect(result.transport).toBe("unknown");
    expect(failureRecorded).toBe(false);
  });

  test("fails immediately only when archive runner configuration is definitely missing", async () => {
    const result = await ensureArchiveJobDispatched({
      job: queuedJob,
      runnerConfigured: false,
      dispatch: async () => undefined,
      fail: async () => ({ ...queuedJob, status: "failed" as const }),
    });

    expect(result.job.status).toBe("failed");
    expect(result.transport).toBe("unavailable");
  });

  test("fails clearly when the runner definitely rejects the archive job", async () => {
    let failureRecorded = false;
    const result = await ensureArchiveJobDispatched({
      job: queuedJob,
      runnerConfigured: true,
      dispatch: async () => {
        throw new ArchiveDispatchRejectedError(401);
      },
      fail: async () => {
        failureRecorded = true;
        return { ...queuedJob, status: "failed" as const };
      },
    });

    expect(result.job.status).toBe("failed");
    expect(result.transport).toBe("unavailable");
    expect(failureRecorded).toBe(true);
  });

  test("allows the same reserved attempt to be safely redispatched after a short wait", () => {
    const now = new Date("2026-07-14T12:00:20.000Z");
    expect(
      archiveStartCanBeRetried({
        status: "queued",
        createdAt: "2026-07-14T12:00:00.000Z",
        now,
      }),
    ).toBe(true);
    expect(
      archiveStartCanBeRetried({
        status: "running",
        createdAt: "2026-07-14T12:00:00.000Z",
        workerStartedAt: "2026-07-14T12:00:00.000Z",
        leaseExpiresAt: "2026-07-14T14:00:00.000Z",
        now,
      }),
    ).toBe(true);
  });
});
