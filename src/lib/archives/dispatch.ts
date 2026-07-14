type ArchiveJobCandidate = {
  id: string;
  status: string;
};

export class ArchiveDispatchRejectedError extends Error {
  constructor(readonly statusCode: number) {
    super(`Archive runner rejected the job (${statusCode}).`);
    this.name = "ArchiveDispatchRejectedError";
  }
}

type DispatchOutcome<T> = {
  job: T;
  transport: "accepted" | "unknown" | "unavailable" | "not-needed";
};

export async function ensureArchiveJobDispatched<T extends ArchiveJobCandidate>(input: {
  job: T;
  runnerConfigured: boolean;
  dispatch: () => Promise<void>;
  fail: () => Promise<T | (Omit<T, "status"> & { status: "failed" })>;
}): Promise<DispatchOutcome<T | (Omit<T, "status"> & { status: "failed" })>> {
  if (!input.runnerConfigured) {
    return { job: await input.fail(), transport: "unavailable" };
  }

  try {
    await input.dispatch();
    return { job: input.job, transport: "accepted" };
  } catch (error) {
    if (error instanceof ArchiveDispatchRejectedError) {
      return { job: await input.fail(), transport: "unavailable" };
    }
    // A network timeout can happen after Cloudflare already queued the job.
    // Keep this job alive so that the customer can safely retry the same job.
    return { job: input.job, transport: "unknown" };
  }
}

export function archiveStartCanBeRetried(input: {
  status: string;
  createdAt: string;
  workerStartedAt?: string | null;
  leaseExpiresAt?: string | null;
  now?: Date;
}) {
  if (input.status === "running") {
    const lease = new Date(input.leaseExpiresAt ?? "").getTime();
    const now = input.now?.getTime() ?? Date.now();
    if (Number.isFinite(lease) && lease <= now) return true;
    const started = new Date(input.workerStartedAt ?? input.createdAt).getTime();
    return Number.isFinite(started) && now - started >= 15_000;
  }
  if (input.status !== "queued" || input.workerStartedAt) return false;
  const createdAt = new Date(input.createdAt).getTime();
  if (!Number.isFinite(createdAt)) return false;
  return (input.now?.getTime() ?? Date.now()) - createdAt >= 15_000;
}
