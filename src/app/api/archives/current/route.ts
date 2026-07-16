import { NextResponse } from "next/server";
import {
  archiveDisabledResponse,
  archiveFeatureIsEnabled,
} from "@/lib/archives/feature";
import { getCurrentWeddingFromCookie } from "@/lib/auth";
import {
  archiveStartCanBeRetried,
  ensureArchiveJobDispatched,
} from "@/lib/archives/dispatch";
import {
  archiveRunnerIsConfigured,
  dispatchArchiveJob,
} from "@/lib/archives/runner";
import {
  createOrReuseArchiveJob,
  beginArchiveJobAttempt,
  failArchiveJob,
  getArchiveSourceSummary,
  getLatestArchiveJob,
  type ArchiveJob,
} from "@/lib/archives/store";

export const dynamic = "force-dynamic";

function publicArchiveJob(job: ArchiveJob | null) {
  if (!job) return null;
  const expired =
    job.status === "ready" && job.expiresAt && new Date(job.expiresAt) <= new Date();
  const status = expired ? "expired" : job.status;

  return {
    id: job.id,
    status,
    sourceMediaCount: job.sourceMediaCount,
    sourcePhotoCount: job.sourcePhotoCount,
    sourceVideoCount: job.sourceVideoCount,
    sourceAudioCount: job.sourceAudioCount,
    sourceTotalBytes: job.sourceTotalBytes,
    preparedMediaCount: job.preparedMediaCount,
    preparedSourceBytes: job.preparedSourceBytes,
    archiveByteSize: job.archiveByteSize,
    errorCode: job.errorCode,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
    expiresAt: job.expiresAt,
    retryStartAvailable: archiveStartCanBeRetried({
      status,
      createdAt: job.createdAt,
      workerStartedAt: job.workerStartedAt,
      leaseExpiresAt: job.leaseExpiresAt,
    }),
    downloadUrl:
      status === "ready" && job.expiresAt && new Date(job.expiresAt) > new Date()
        ? `/api/archives/${job.id}/download`
        : null,
  };
}

function sourceFromArchive(job: ArchiveJob) {
  return {
    mediaCount: job.sourceMediaCount,
    photoCount: job.sourcePhotoCount,
    videoCount: job.sourceVideoCount,
    audioCount: job.sourceAudioCount,
    totalBytes: job.sourceTotalBytes,
  };
}

function reusableArchive(job: ArchiveJob | null) {
  if (!job) return false;
  if (job.status === "queued" || job.status === "running") return true;
  return (
    job.status === "ready" &&
    Boolean(job.expiresAt) &&
    new Date(job.expiresAt as string) > new Date()
  );
}

type ArchiveCurrentDependencies = {
  getCurrentWeddingFromCookie: typeof getCurrentWeddingFromCookie;
  createOrReuseArchiveJob: typeof createOrReuseArchiveJob;
  beginArchiveJobAttempt: typeof beginArchiveJobAttempt;
  failArchiveJob: typeof failArchiveJob;
  getArchiveSourceSummary: typeof getArchiveSourceSummary;
  getLatestArchiveJob: typeof getLatestArchiveJob;
  archiveRunnerIsConfigured: typeof archiveRunnerIsConfigured;
  dispatchArchiveJob: typeof dispatchArchiveJob;
  archiveFeatureIsEnabled: typeof archiveFeatureIsEnabled;
};

const defaultDependencies: ArchiveCurrentDependencies = {
  getCurrentWeddingFromCookie,
  createOrReuseArchiveJob,
  beginArchiveJobAttempt,
  failArchiveJob,
  getArchiveSourceSummary,
  getLatestArchiveJob,
  archiveRunnerIsConfigured,
  dispatchArchiveJob,
  archiveFeatureIsEnabled,
};

export function createArchiveCurrentHandlers(
  dependencies: ArchiveCurrentDependencies = defaultDependencies,
) {
  return {
    GET: async () => {
      if (!dependencies.archiveFeatureIsEnabled()) return archiveDisabledResponse();
      const current = await dependencies.getCurrentWeddingFromCookie();
      if (!current) {
        return NextResponse.json({ message: "Session not found." }, { status: 401 });
      }

      const archive = await dependencies.getLatestArchiveJob(current.wedding.id);
      const source =
        archive && (archive.status === "queued" || archive.status === "running" || archive.status === "ready")
          ? sourceFromArchive(archive)
          : await dependencies.getArchiveSourceSummary(current.wedding.id);

      return NextResponse.json(
        { archive: publicArchiveJob(archive), source },
        { headers: { "Cache-Control": "no-store" } },
      );
    },

    POST: async () => {
      if (!dependencies.archiveFeatureIsEnabled()) return archiveDisabledResponse();
      const current = await dependencies.getCurrentWeddingFromCookie();
      if (!current) {
        return NextResponse.json({ message: "Session not found." }, { status: 401 });
      }
      if (current.wedding.demo) {
        return NextResponse.json(
          { message: "Archive download is unavailable in the demo." },
          { status: 403 },
        );
      }

      const [latest, source] = await Promise.all([
        dependencies.getLatestArchiveJob(current.wedding.id),
        dependencies.getArchiveSourceSummary(current.wedding.id),
      ]);
      if (!reusableArchive(latest) && source.mediaCount === 0) {
        return NextResponse.json(
          { message: "There are no memories to archive yet." },
          { status: 409, headers: { "Cache-Control": "no-store" } },
        );
      }

      const { job, created } = await dependencies.createOrReuseArchiveJob(
        current.wedding.id,
      );
      const restartExpiredRun = archiveStartCanBeRetried({
        status: job.status,
        createdAt: job.createdAt,
        workerStartedAt: job.workerStartedAt,
        leaseExpiresAt: job.leaseExpiresAt,
      });
      if (job.status !== "queued" && !restartExpiredRun) {
        return NextResponse.json(
          { archive: publicArchiveJob(job), reused: true },
          { headers: { "Cache-Control": "no-store" } },
        );
      }

      const attemptJob = await dependencies.beginArchiveJobAttempt(job.id);

      const dispatched = await ensureArchiveJobDispatched({
        job: attemptJob,
        runnerConfigured: dependencies.archiveRunnerIsConfigured(),
        dispatch: () => dependencies.dispatchArchiveJob({ job: attemptJob }),
        fail: () =>
          dependencies.failArchiveJob({
            jobId: attemptJob.id,
            attemptId: attemptJob.attemptId ?? undefined,
            errorCode: "ARCHIVE_SERVICE_UNAVAILABLE",
            errorDetail: "Archive runner configuration is incomplete.",
          }),
      });

      if (dispatched.transport === "unavailable") {
        return NextResponse.json(
          {
            archive: publicArchiveJob(dispatched.job as ArchiveJob),
            message: "Archive service is not available yet.",
          },
          { status: 503, headers: { "Cache-Control": "no-store" } },
        );
      }

      return NextResponse.json(
        {
          archive: publicArchiveJob(dispatched.job as ArchiveJob),
          reused: !created,
          dispatch: dispatched.transport,
        },
        { status: 202, headers: { "Cache-Control": "no-store" } },
      );
    },
  };
}

const handlers = createArchiveCurrentHandlers();
export const GET = handlers.GET;
export const POST = handlers.POST;
