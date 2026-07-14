import { describe, expect, test } from "bun:test";
import {
  QR_PREVIEW_OPTIONS,
  QR_PRINT_OPTIONS,
  qrPrintFileName,
} from "@/lib/qr-download";

describe("QR download", () => {
  test("keeps the preview compact and creates a print-ready PNG", () => {
    expect(QR_PREVIEW_OPTIONS.width).toBe(232);
    expect(QR_PRINT_OPTIONS.width).toBe(1600);
    expect(QR_PRINT_OPTIONS.margin).toBeGreaterThanOrEqual(4);
    expect(qrPrintFileName("mary-john")).toBe("mary-john-wedding-qr-print.png");
  });
});
