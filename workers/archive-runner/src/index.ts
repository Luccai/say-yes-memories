import { Container, getContainer } from "@cloudflare/containers";

type ArchiveTask = {
  jobId: string;
  weddingId: string;
  archiveFileName: string;
  apiBaseUrl: string;
  callbackSecret: string;
  attemptId: string;
};

interface Env {
  ARCHIVE_CONTAINER: DurableObjectNamespace<ArchiveContainer>;
  ARCHIVE_DISPATCH_SECRET: string;
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET: string;
}

const textEncoder = new TextEncoder();
const maxSignatureAgeMs = 5 * 60 * 1000;

function canonicalRequest(input: {
  timestamp: string;
  method: string;
  path: string;
  body: string;
}) {
  return [input.timestamp, input.method.toUpperCase(), input.path, input.body].join("\n");
}

function fromHex(value: string) {
  if (!/^[a-f0-9]{64}$/i.test(value)) return null;
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function toHex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function hmac(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, textEncoder.encode(message)));
}

async function dispatchSignatureIsValid(request: Request, secret: string, body: string) {
  if (textEncoder.encode(secret).byteLength < 32) return false;
  const timestamp = request.headers.get("x-archive-timestamp") ?? "";
  const signature = fromHex(request.headers.get("x-archive-signature") ?? "");
  const timestampMs = Number(timestamp);
  if (!signature || !Number.isSafeInteger(timestampMs)) return false;
  if (Math.abs(Date.now() - timestampMs) > maxSignatureAgeMs) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify(
    "HMAC",
    key,
    signature,
    textEncoder.encode(
      canonicalRequest({
        timestamp,
        method: request.method,
        path: new URL(request.url).pathname,
        body,
      }),
    ),
  );
}

async function readLimitedBody(request: Request, maxBytes = 8_192) {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let body = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    body += decoder.decode(value, { stream: true });
  }
  return body + decoder.decode();
}

function taskFromBody(body: string): ArchiveTask | null {
  try {
    const value: unknown = JSON.parse(body);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const task = value as Partial<ArchiveTask>;
    const { jobId, weddingId, archiveFileName, apiBaseUrl, callbackSecret, attemptId } = task;
    if (
      typeof jobId !== "string" ||
      typeof weddingId !== "string" ||
      typeof archiveFileName !== "string" ||
      typeof apiBaseUrl !== "string" ||
      typeof callbackSecret !== "string" ||
      typeof attemptId !== "string" ||
      !/^archive_[a-f0-9]{24}$/.test(jobId) ||
      !/^[a-zA-Z0-9_-]{8,160}$/.test(weddingId) ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*-wedding-memories\.zip$/.test(archiveFileName) ||
      !/^[a-f0-9]{64}$/.test(callbackSecret)
      || !/^attempt_[a-f0-9]{24}$/.test(attemptId)
    ) {
      return null;
    }
    const apiUrl = new URL(apiBaseUrl);
    if (apiUrl.protocol !== "https:" && apiUrl.hostname !== "localhost") return null;
    return {
      jobId,
      weddingId,
      archiveFileName,
      apiBaseUrl: apiUrl.origin,
      callbackSecret,
      attemptId,
    };
  } catch {
    return null;
  }
}

function archivePath(task: ArchiveTask) {
  return `archives/${task.weddingId}/${task.jobId}/${task.attemptId}/${task.archiveFileName}`;
}

async function claimAttempt(task: ArchiveTask) {
  const target = new URL(`/api/internal/archives/${task.jobId}/claim`, task.apiBaseUrl);
  const timestamp = String(Date.now());
  const body = "";
  const signature = await hmac(
    task.callbackSecret,
    canonicalRequest({ timestamp, method: "GET", path: target.pathname, body }),
  );
  const response = await fetch(target, {
    headers: {
      "x-archive-timestamp": timestamp,
      "x-archive-signature": signature,
      "x-archive-attempt": task.attemptId,
    },
  });
  await response.body?.cancel().catch(() => undefined);
  return response.ok;
}

export class ArchiveContainer extends Container<Env> {
  sleepAfter = "10m";
  envVars = {
    R2_ACCOUNT_ID: this.env.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: this.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: this.env.R2_SECRET_ACCESS_KEY,
    R2_BUCKET: this.env.R2_BUCKET,
  };

  async enqueueArchive(task: ArchiveTask) {
    if (!(await claimAttempt(task))) return { accepted: false };
    const state = await this.ctx.storage.get<{
      status: "queued" | "running" | "finished" | "failed";
      queuedAt: number;
      attemptId: string;
    }>("archive-state");
    if (state?.attemptId === task.attemptId && (state.status === "running" || state.status === "finished")) {
      return { accepted: false };
    }
    if (state?.attemptId === task.attemptId && state.status === "queued" && Date.now() - state.queuedAt < 15_000) {
      return { accepted: false };
    }
    if (state && state.attemptId !== task.attemptId) {
      await this.stop().catch(() => undefined);
    }
    await this.ctx.storage.put("archive-job-id", task.jobId);
    await this.ctx.storage.put("archive-state", {
      status: "queued",
      queuedAt: Date.now(),
      attemptId: task.attemptId,
    });
    await this.schedule(0, "runArchive", task);
    return { accepted: true };
  }

  async runArchive(task: ArchiveTask) {
    const state = await this.ctx.storage.get<{ status: string; attemptId: string }>("archive-state");
    if (state?.attemptId !== task.attemptId || state.status !== "queued") return;
    await this.ctx.storage.put("archive-state", {
      status: "running",
      queuedAt: Date.now(),
      attemptId: task.attemptId,
    });
    try {
      await this.start();
      if (!this.ctx.container) throw new Error("Container runtime is unavailable.");
      const process = await this.ctx.container.exec(["bun", "/app/run-archive.mjs"], {
        env: {
          ARCHIVE_JOB_ID: task.jobId,
          ARCHIVE_WEDDING_ID: task.weddingId,
          ARCHIVE_FILE_NAME: task.archiveFileName,
          ARCHIVE_OUTPUT_PATH: archivePath(task),
          ARCHIVE_API_BASE_URL: task.apiBaseUrl,
          ARCHIVE_CALLBACK_SECRET: task.callbackSecret,
          ARCHIVE_ATTEMPT_ID: task.attemptId,
        },
      });
      const output = await process.output();
      const current = await this.ctx.storage.get<{ attemptId: string }>("archive-state");
      if (current?.attemptId !== task.attemptId) return;
      if (output.exitCode !== 0) {
        await this.reportFailure(task, "ARCHIVE_PROCESS_FAILED");
        await this.ctx.storage.put("archive-state", {
          status: "failed",
          queuedAt: Date.now(),
          attemptId: task.attemptId,
        });
      } else {
        await this.ctx.storage.put("archive-state", {
          status: "finished",
          queuedAt: Date.now(),
          attemptId: task.attemptId,
        });
      }
    } catch {
      const current = await this.ctx.storage.get<{ attemptId: string }>("archive-state");
      if (current?.attemptId === task.attemptId) {
        await this.reportFailure(task, "ARCHIVE_PROCESS_FAILED");
        await this.ctx.storage.put("archive-state", {
          status: "failed",
          queuedAt: Date.now(),
          attemptId: task.attemptId,
        });
      }
    } finally {
      const current = await this.ctx.storage.get<{ attemptId: string }>("archive-state");
      if (current?.attemptId === task.attemptId) {
        await this.stop().catch(() => undefined);
      }
    }
  }

  private async reportFailure(task: ArchiveTask, errorCode: string) {
    const body = JSON.stringify({ errorCode });
    const target = new URL(`/api/internal/archives/${task.jobId}/fail`, task.apiBaseUrl);
    const timestamp = String(Date.now());
    const signature = await hmac(
      task.callbackSecret,
      canonicalRequest({ timestamp, method: "POST", path: target.pathname, body }),
    );
    await fetch(target, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-archive-timestamp": timestamp,
        "x-archive-signature": signature,
        "x-archive-attempt": task.attemptId,
      },
      body,
    }).catch(() => undefined);
  }
}

const archiveRunnerWorker = {
  async fetch(request: Request, env: Env) {
    if (request.method !== "POST" || new URL(request.url).pathname !== "/jobs") {
      return new Response("Not found", { status: 404 });
    }
    const declaredLength = Number(request.headers.get("content-length") ?? "0");
    if ((Number.isFinite(declaredLength) && declaredLength > 8_192) ||
      !(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
      return new Response("Invalid archive job", { status: 400 });
    }
    const body = await readLimitedBody(request);
    if (body === null) {
      return new Response("Invalid archive job", { status: 413 });
    }
    if (!(await dispatchSignatureIsValid(request, env.ARCHIVE_DISPATCH_SECRET, body))) {
      return new Response("Unauthorized", { status: 401 });
    }
    const task = taskFromBody(body);
    if (!task) return new Response("Invalid archive job", { status: 400 });

    const archive = getContainer(env.ARCHIVE_CONTAINER, task.jobId);
    const queued = await archive.enqueueArchive(task);
    return Response.json(queued, { status: 202 });
  },
};

export default archiveRunnerWorker;
