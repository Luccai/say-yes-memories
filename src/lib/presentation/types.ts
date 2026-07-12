import type { MediaKind, StoredMediaObject, Wedding } from "@/lib/types";

export type PresentationCursor = {
  createdAt: string;
  id: string;
};

export type PresentationMediaItem = {
  id: string;
  kind: MediaKind;
  mimeType: string;
  fileName: string;
  byteSize: number;
  createdAt: string;
  guestName: string;
  note?: string;
  contentUrl: string;
};

export type PresentationMediaPage = {
  media: PresentationMediaItem[];
  total: number;
  hasMore: boolean;
  nextCursor: string | null;
};

export type PresentationProfileMedia = Omit<
  StoredMediaObject,
  "storagePath" | "url"
> & {
  url: string;
};

export type PresentationWedding = Pick<
  Wedding,
  "id" | "slug" | "coupleName" | "eventDate"
> & {
  profileMedia?: PresentationProfileMedia;
};
