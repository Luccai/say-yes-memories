import { describe, expect, test } from "bun:test";
import {
  archiveExpiresAt,
  archiveFolder,
  archiveObjectPath,
  archiveOutputMatches,
  buildArchiveMessagesCsv,
  isReusableArchiveStatus,
} from "@/lib/archives/domain";

describe("memory archive domain", () => {
  test("sorts media into customer-friendly archive folders", () => {
    expect(archiveFolder("image")).toBe("Photos");
    expect(archiveFolder("video")).toBe("Videos");
    expect(archiveFolder("audio")).toBe("Voice Notes");
  });

  test("keeps a ready archive for exactly 24 hours", () => {
    expect(archiveExpiresAt("2026-07-14T10:15:00.000Z")).toBe(
      "2026-07-15T10:15:00.000Z",
    );
  });

  test("does not create a second archive while one is queued, preparing, or ready", () => {
    expect(isReusableArchiveStatus("queued")).toBe(true);
    expect(isReusableArchiveStatus("running")).toBe(true);
    expect(isReusableArchiveStatus("ready")).toBe(true);
    expect(isReusableArchiveStatus("failed")).toBe(false);
    expect(isReusableArchiveStatus("expired")).toBe(false);
  });

  test("keeps every archive output inside its own server-defined R2 folder", () => {
    expect(
      archiveObjectPath({
        weddingId: "wedding_5b8a3d0201",
        jobId: "archive_aaaaaaaaaaaaaaaaaaaaaaaa",
        attemptId: "attempt_aaaaaaaaaaaaaaaaaaaaaaaa",
        fileName: "mary-john-wedding-memories.zip",
      }),
    ).toBe(
      "archives/wedding_5b8a3d0201/archive_aaaaaaaaaaaaaaaaaaaaaaaa/attempt_aaaaaaaaaaaaaaaaaaaaaaaa/mary-john-wedding-memories.zip",
    );
    expect(() =>
      archiveObjectPath({
        weddingId: "wedding_5b8a3d0201",
        jobId: "archive_aaaaaaaaaaaaaaaaaaaaaaaa",
        attemptId: "attempt_aaaaaaaaaaaaaaaaaaaaaaaa",
        fileName: "../someone-else-wedding-memories.zip",
      }),
    ).toThrow("Archive output path is invalid.");
  });

  test("creates a safe CSV for notes with commas, quotes, and line breaks", () => {
    expect(
      buildArchiveMessagesCsv([
        {
          folder: "Photos",
          fileName: "first dance.jpg",
          createdAt: "2026-07-14T10:15:00.000Z",
          guestName: 'Ava, "Bestie"',
          note: "We love you\nboth!",
        },
      ]),
    ).toBe(
      [
        "folder,file_name,uploaded_at,guest_name,message",
        'Photos,first dance.jpg,2026-07-14T10:15:00.000Z,"Ava, ""Bestie""","We love you',
        'both!"',
        "",
      ].join("\n"),
    );
  });

  test("keeps spreadsheet formulas inert in the exported messages CSV", () => {
    const csv = buildArchiveMessagesCsv([
      {
        folder: "Photos",
        fileName: "@memory.jpg",
        createdAt: "2026-07-14T12:00:00.000Z",
        guestName: "  =HYPERLINK(\"https://example.com\")",
        note: "+SUM(1,2)",
      },
    ]);

    expect(csv).toContain("'@memory.jpg");
    expect(csv).toContain("\"'  =HYPERLINK(\"\"https://example.com\"\")\"");
    expect(csv).toContain("\"'+SUM(1,2)\"");
  });

  test("accepts completion only after the expected ZIP exists in R2", () => {
    expect(
      archiveOutputMatches({
        expectedBytes: 42,
        exists: true,
        byteSize: 42,
        mimeType: "application/zip",
      }),
    ).toBe(true);
    expect(
      archiveOutputMatches({
        expectedBytes: 42,
        exists: true,
        byteSize: 41,
        mimeType: "application/zip",
      }),
    ).toBe(false);
    expect(
      archiveOutputMatches({
        expectedBytes: 42,
        exists: true,
        byteSize: 42,
        mimeType: "text/plain",
      }),
    ).toBe(false);
  });
});
