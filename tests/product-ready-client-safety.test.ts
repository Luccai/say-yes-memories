import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { copy, type Locale } from "@/lib/i18n";

const readSource = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const guestSource = readSource("src/components/guest/GuestExperience.tsx");
const turnstileSource = readSource("src/components/guest/TurnstileGate.tsx");
const adminSource = readSource("src/components/admin/AdminExperience.tsx");
const couplesSource = readSource("src/components/owner/OwnerCouplesPanel.tsx");
const cockpitSource = readSource("src/components/owner/OwnerCockpit.tsx");
const cleanupSource = readSource("src/components/owner/OwnerCleanupPanel.tsx");
const tokensSource = readSource("src/components/owner/OwnerTokensPanel.tsx");
const locales: Locale[] = ["en", "es", "fr", "de", "pt", "zh"];

describe("product-ready client safety", () => {
  test("makes owner detail selection latest-request-wins and exposes failures", () => {
    expect(couplesSource).toContain("detailRequestRef.current?.abort()");
    expect(couplesSource).toContain("signal: controller.signal");
    expect(couplesSource).toContain("detailError");
  });

  test("lets upload cancellation cover preprocessing and Turnstile", () => {
    const controllerIndex = guestSource.indexOf("const controller = new AbortController()");
    const normalizationIndex = guestSource.indexOf("normalizeAudioFileToMp3(uploadFile)");

    expect(controllerIndex).toBeGreaterThan(-1);
    expect(controllerIndex).toBeLessThan(normalizationIndex);
    expect(turnstileSource).toContain("execute: (signal?: AbortSignal)");
    expect(turnstileSource).toContain("signal.addEventListener(\"abort\"");
  });

  test("retries a failed Turnstile script with a fresh element", () => {
    expect(turnstileSource).toContain("script.remove()");
    expect(turnstileSource).toContain("removeEventListener");
  });

  test("prevents duplicate microphone starts and releases a failed stream", () => {
    expect(guestSource).toContain("recordingStartingRef.current");
    expect(guestSource).toContain("recordingStartAttemptRef.current");
    expect(guestSource).toContain("stream?.getTracks().forEach((track) => track.stop())");
  });

  test("keeps real admin sync responses latest-request-wins", () => {
    expect(adminSource).toContain("syncController?.abort()");
    expect(adminSource).toContain("signal: controller.signal");
  });

  test("keeps owner dialogs scrollable while body scroll is locked", () => {
    expect(cleanupSource).toContain('data-scroll-lock-allow="true"');
    expect(tokensSource).toContain('data-scroll-lock-allow="true"');
  });

  test("does not advertise the launch-deferred ZIP action", () => {
    for (const locale of locales) {
      expect(copy[locale].admin.helpFooter).not.toContain("ZIP");
    }
  });

  test("does not show a fake owner logout success after a failed request", () => {
    expect(cockpitSource).toContain("logoutError");
    expect(cockpitSource).toContain("if (!response.ok)");
  });
});
