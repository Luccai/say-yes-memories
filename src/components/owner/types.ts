export type OwnerSection =
  | "overview"
  | "couples"
  | "tokens"
  | "audit"
  | "cleanup"
  | "settings"
  | "system";

export type OwnerSessionState =
  | { state: "loading" }
  | { state: "setup" }
  | { state: "login" }
  | { state: "unavailable" }
  | {
      state: "authenticated";
      session: {
        id: string;
        deviceLabel: string | null;
        passwordVersion: number;
        lastSeenAt: string;
        expiresAt: string;
      };
    };

export type OwnerWeddingSummary = {
  id: string;
  slug: string;
  coupleName: string;
  eventDate: string | null;
  timezone: string;
  plan: string;
  status: string;
  storageQuotaBytes: number;
  storageUsedBytes: number;
  reservedStorageBytes: number;
  systemStorageBytes: number;
  accessExpiresAt: string | null;
  cleanupAfter: string | null;
  uploadsOpenAt: string | null;
  uploadLocked: boolean;
  hasProfile: boolean;
  mediaCount: number;
  createdAt: string;
  activatedAt: string | null;
  updatedAt: string;
};

export type OwnerWeddingDetail = {
  wedding: OwnerWeddingSummary & {
    studioCode: string;
    brideName: string;
    groomName: string;
    accessAnchorDate: string | null;
    welcomeNote: string;
  };
  slugs: Array<{ slug: string; is_canonical: boolean; created_at: string }>;
  entitlements: Array<{
    id: string;
    operation_key: string;
    event_type: string;
    quota_delta_bytes: number;
    access_delta_months: number;
    applied_at: string;
    reverses_event_id: string | null;
    note: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
  }>;
  audits: Array<{
    id: string;
    action: string;
    operation_key: string | null;
    details: Record<string, unknown>;
    created_at: string;
  }>;
  tokens: Array<{
    id: string;
    status: string;
    label: string | null;
    created_at: string;
    activated_at: string | null;
    revoked_at: string | null;
    rotated_from_id: string | null;
  }>;
};
