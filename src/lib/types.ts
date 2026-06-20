export type TokenStatus = "unused" | "active" | "revoked";
export type MediaKind = "image" | "video" | "audio";

export type StoredMediaObject = {
  id: string;
  url: string;
  storagePath?: string;
  kind: MediaKind;
  mimeType: string;
  fileName: string;
  byteSize: number;
  createdAt: string;
};

export type TokenRecord = {
  id: string;
  tokenHash: string;
  status: TokenStatus;
  weddingId?: string;
  createdAt: string;
  activatedAt?: string;
};

export type Wedding = {
  id: string;
  slug: string;
  brideName: string;
  groomName: string;
  coupleName: string;
  realtimeTopic?: string;
  demo?: boolean;
  eventDate?: string;
  welcomeNote: string;
  profileMedia?: StoredMediaObject;
  uploadLocked: boolean;
  createdAt: string;
  updatedAt: string;
};

export type WeddingMedia = StoredMediaObject & {
  weddingId: string;
  guestName: string;
  note?: string;
  approved: boolean;
  hidden: boolean;
  favorite: boolean;
};

export type SessionRecord = {
  id: string;
  weddingId: string;
  createdAt: string;
  expiresAt: string;
};

export type PublicWedding = Pick<
  Wedding,
  | "id"
  | "slug"
  | "brideName"
  | "groomName"
  | "coupleName"
  | "eventDate"
  | "welcomeNote"
  | "profileMedia"
  | "uploadLocked"
>;

export type AppStore = {
  tokens: TokenRecord[];
  weddings: Wedding[];
  media: WeddingMedia[];
  sessions: SessionRecord[];
};
