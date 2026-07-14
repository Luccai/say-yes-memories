import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const migration = readFileSync(
  resolve(root, "supabase/migrations/20260714133000_add_memory_archives.sql"),
  "utf8",
);

describe("archive database contract", () => {
  test("creates one active snapshot job per wedding and rejects an empty archive", () => {
    expect(migration).toContain("archive_jobs_one_active_wedding_idx");
    expect(migration).toContain("where active");
    expect(migration).toContain("insert into public.archive_job_items");
    expect(migration).toContain("created_job.source_media_count = 0");
    expect(migration).toContain("There are no memories to archive yet.");
  });

  test("keeps archive tables private and cleanup callable only by service role", () => {
    expect(migration).toContain("alter table public.archive_jobs enable row level security");
    expect(migration).toContain("revoke all on public.archive_jobs from public, anon, authenticated");
    expect(migration).toContain("claim_expired_archive_jobs_v1");
    expect(migration).toContain("to service_role");
  });

  test("isolates retries with an attempt id and an expiring worker lease", () => {
    expect(migration).toContain("attempt_id text");
    expect(migration).toContain("lease_expires_at timestamptz");
    expect(migration).toContain("claim_archive_job_attempt_v1");
    expect(migration).toContain("job.status = 'running' and job.lease_expires_at > p_now");
    expect(migration).toContain("job.attempt_id <> p_attempt_id");
    expect(migration).toContain("lease_expires_at = p_now + interval '2 hours'");
    expect(migration).toContain("job.archive_byte_size = p_archive_byte_size");
    expect(migration).toContain("archive_path,");
    expect(migration).toContain("    null,");
  });

  test("does not commit Wrangler-generated runtime declarations", () => {
    expect(
      existsSync(resolve(root, "workers/archive-runner/worker-configuration.d.ts")),
    ).toBe(false);
  });
});
