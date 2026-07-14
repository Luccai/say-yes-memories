import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const container = readFileSync(
  resolve(root, "workers/archive-runner/container/run-archive.mjs"),
  "utf8",
);
const worker = readFileSync(
  resolve(root, "workers/archive-runner/src/index.ts"),
  "utf8",
);

describe("archive Worker and Container contract", () => {
  test("stores already-compressed media without wasteful ZIP recompression", () => {
    expect(container).toContain('archiver("zip", { forceZip64: true, store: true })');
    expect(container).not.toContain("zlib: { level:");
  });

  test("carries the isolated attempt through Worker and every callback", () => {
    expect(worker).toContain("ARCHIVE_ATTEMPT_ID: task.attemptId");
    expect(container).toContain('"x-archive-attempt": config.ARCHIVE_ATTEMPT_ID');
    expect(worker).toContain("/${task.attemptId}/${task.archiveFileName}");
    expect(worker).toContain("if (!(await claimAttempt(task)))");
  });

  test("caps signed dispatch bodies before parsing them", () => {
    expect(worker).toContain("declaredLength > 8_192");
    expect(worker).toContain("readLimitedBody(request)");
    expect(worker).toContain("reader.cancel()");
  });
});
