const QR_COLORS = {
  dark: "#1f1712",
  light: "#fffaf3",
} as const;

export const QR_PREVIEW_OPTIONS = {
  width: 232,
  margin: 1,
  color: QR_COLORS,
} as const;

export const QR_PRINT_OPTIONS = {
  width: 1600,
  margin: 4,
  color: QR_COLORS,
} as const;

export function qrPrintFileName(slug: string) {
  return `${slug}-wedding-qr-print.png`;
}
