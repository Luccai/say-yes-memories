import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const adminRoot = new URL("../src/components/admin/", import.meta.url);
const adminExperienceSource = readFileSync(
  new URL("AdminExperience.tsx", adminRoot),
  "utf8",
);
const weddingPanelSource = readFileSync(
  new URL("panels/WeddingPagePanel.tsx", adminRoot),
  "utf8",
);
const qrPanelSource = readFileSync(
  new URL("panels/QrPanel.tsx", adminRoot),
  "utf8",
);
const profileRemoveDialogSource = readFileSync(
  new URL("panels/ProfilePhotoRemoveDialog.tsx", adminRoot),
  "utf8",
);

function readAdminTsxSources(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);

    if (statSync(path).isDirectory()) {
      return readAdminTsxSources(path);
    }

    return entry.endsWith(".tsx") ? [readFileSync(path, "utf8")] : [];
  });
}

describe("admin feedback", () => {
  test("uses the shared toast instead of native browser alerts", () => {
    expect(readAdminTsxSources(fileURLToPath(adminRoot)).join("\n")).not.toContain(
      "window.alert",
    );
    expect(adminExperienceSource).toContain("<AppToast");
  });

  test("keeps the upload status calm and static", () => {
    expect(weddingPanelSource).toContain('data-upload-status-pill="true"');
    expect(weddingPanelSource).not.toContain("motion-safe:animate-pulse");
    expect(weddingPanelSource).not.toContain("0_0_0.75rem_rgba(16,185,129");
  });

  test("localizes the wedding date and protects repeated profile uploads", () => {
    expect(weddingPanelSource).toContain("formatWeddingDate");
    expect(weddingPanelSource).toContain("demoMode || profileUploading");
  });

  test("exposes the QR preview as an accessible image", () => {
    expect(qrPanelSource).toContain('role="img"');
    expect(qrPanelSource).toContain("QR_SVG_OPTIONS");
  });

  test("guards profile removal with an accessible, scroll-locked confirmation", () => {
    expect(profileRemoveDialogSource).toContain('role="dialog"');
    expect(profileRemoveDialogSource).toContain("aria-describedby");
    expect(profileRemoveDialogSource).toContain("initialFocusRef: cancelRef");
    expect(profileRemoveDialogSource).toContain("useBodyScrollLock(open)");
  });
});
