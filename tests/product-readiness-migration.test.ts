import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260716120000_product_readiness_hardening.sql",
    import.meta.url,
  ),
  "utf8",
).toLowerCase();
const validationMigration = readFileSync(
  new URL(
    "../supabase/migrations/20260716123000_validate_product_readiness_constraints.sql",
    import.meta.url,
  ),
  "utf8",
).toLowerCase();

describe("product-readiness database migration", () => {
  test("adds abuse budgets, completed staging cleanup and retention", () => {
    expect(migration).toContain("reserve_guest_upload_v2");
    expect(migration).toContain("active_count >= 3");
    expect(migration).toContain("'completed', 'aborted', 'expired'");
    expect(migration).toContain("prune_operational_metadata_v1");
  });

  test("blocks anonymization until every R2-backed queue is clean and removes PII rows", () => {
    expect(migration).toContain("upload staging cleanup is not complete");
    expect(migration).toContain("archive cleanup is not complete");
    expect(migration).toContain("delete from public.upload_reservations");
    expect(migration).toContain("delete from public.media_deletion_jobs");
    expect(migration).toContain("delete from public.archive_jobs");
  });

  test("defines explicit service-role grants for fresh Supabase projects", () => {
    expect(migration).toContain("grant usage on schema public to service_role");
    expect(migration).toContain("public.weddings");
    expect(migration).toContain("public.upgrade_logs");
  });

  test("indexes the foreign keys reported by the live database advisor", () => {
    expect(migration).toContain("media_deletion_jobs_wedding_idx");
    expect(migration).toContain("on public.media_deletion_jobs(wedding_id)");
    expect(migration).toContain("owner_audit_logs_actor_session_idx");
    expect(migration).toContain("on public.owner_audit_logs(actor_session_id)");
  });

  test("validates the staged welcome-note constraint after the live preflight", () => {
    expect(migration).toContain("weddings_welcome_note_length_check");
    expect(migration).toContain("not valid");
    expect(validationMigration).toContain(
      "validate constraint weddings_welcome_note_length_check",
    );
  });
});
