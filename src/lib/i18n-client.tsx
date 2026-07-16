"use client";

import { createContext, useContext, type ReactNode } from "react";
import type {
  AuthenticationCopy,
  CustomerCopy,
  Locale,
} from "@/lib/i18n";

type I18nContextValue = {
  locale: Locale;
  text: CustomerCopy;
  authText: AuthenticationCopy;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  locale,
  text,
  authText,
  children,
}: I18nContextValue & { children: ReactNode }) {
  return (
    <I18nContext.Provider value={{ locale, text, authText }}>
      {children}
    </I18nContext.Provider>
  );
}

function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("I18nProvider is missing.");
  return value;
}

export function useLocale() {
  return useI18n().locale;
}

export function useCopy() {
  return useI18n().text;
}

export function useAuthCopy() {
  return useI18n().authText;
}

type ErrorKey = keyof CustomerCopy["errors"];

const knownErrorMessages: Record<string, ErrorKey> = {
  "Could not sign in.": "signInFailed",
  "Invalid or already used token.": "tokenAlreadyUsed",
  "Bride and groom names are required.": "namesRequired",
  "Add both names so we can open the right studio.": "namesRequired",
  "That token does not look right. Check your Etsy email and try again.": "invalidToken",
  "That token is active, but its studio could not be found.": "studioMissing",
  "This token already opens another studio. Use the same names you entered the first time.": "tokenNameMismatch",
  "That token cannot open a studio right now.": "tokenUnavailable",
  "Session not found.": "sessionNotFound",
  "Wedding page not found.": "weddingNotFound",
  "Guest uploads are currently closed.": "uploadsClosed",
  "Gallery access has expired.": "storageAccessExpired",
  "Storage is full. The couple needs to upgrade before more uploads can be added.": "storageQuotaFull",
  "Your name is required.": "nameRequired",
  "Upload metadata is missing.": "metadataMissing",
  "Media not found.": "mediaNotFound",
  "Could not prepare upload.": "prepareUploadFailed",
  "Upload could not be completed.": "completeUploadFailed",
  "Could not prepare profile upload.": "profilePrepareFailed",
  "Profile upload could not be completed.": "profileCompleteFailed",
  "Profile photo could not be uploaded.": "profileUploadFailed",
  "Selected photo could not be read.": "profileReadFailed",
  "Selected photo could not be compressed.": "profileBlobFailed",
  "Wedding page could not be saved.": "saveIdentityFailed",
  "Profile photos must be 500 KB or smaller.": "profileTooLarge",
  "Only profile photos are supported.": "profileUnsupported",
  "Photo compression is not supported in this browser.": "profileCompressionUnsupported",
  "Photo could not be compressed below 500 KB.": "profileCompressionFailed",
  "Media could not be deleted.": "deleteMediaFailed",
  "Only photo, video, or audio files are accepted.": "storageOnlyMedia",
  "This upload type is not accepted here.": "storageWrongType",
  "The selected file is empty.": "storageEmptyFile",
  "This file is too large. Please upload a file under 100 MB.": "storageTooLarge",
  "Files can be up to 5 GiB.": "storageTooLarge",
  "Upload path does not belong to this wedding.": "uploadPathInvalid",
};

export function localizedError(
  message: string | undefined,
  errors: CustomerCopy["errors"],
  fallback: string,
) {
  if (!message) return fallback;
  const key = knownErrorMessages[message];
  return key ? errors[key] : fallback;
}
