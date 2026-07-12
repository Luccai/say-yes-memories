import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { AppMotionProvider } from "@/components/shared/AppMotionProvider";
import { I18nProvider } from "@/lib/i18n-client";
import { authCopy, copy, detectLocale } from "@/lib/i18n";
import "./globals.css";

export const metadata: Metadata = {
  title: "Say Yes Digital Memories",
  description: "Luxury QR wedding memory studio for Etsy couples.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Say Yes Digital Memories",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f1e6d8",
  colorScheme: "light",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const requestHeaders = await headers();
  const locale = detectLocale(requestHeaders.get("accept-language") ?? undefined);

  return (
    <html lang={locale} className="bg-[var(--paper)]" suppressHydrationWarning>
      <body
        className="font-sans antialiased"
        suppressHydrationWarning
      >
        <I18nProvider locale={locale} text={copy[locale]} authText={authCopy[locale]}>
          <AppMotionProvider>{children}</AppMotionProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
