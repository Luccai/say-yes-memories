import { beforeEach, describe, expect, mock, test } from "bun:test";
import { HeadObjectCommand } from "@aws-sdk/client-s3";

const PROFILE_STORAGE_PATH = "weddings/wed_test/profile/asset_profile-couple.jpg";
const MEDIA_STORAGE_PATH = "weddings/wed_test/guest/asset_media-memory.jpg";

const weddingRow = {
  id: "wed_test",
  slug: "alice-bob",
  studio_code: "SY-TEST-0001",
  plan: "classic" as const,
  storage_quota_bytes: 50 * 1024 * 1024 * 1024,
  storage_used_bytes: 1024,
  access_anchor_date: null,
  access_expires_at: null,
  cleanup_after: null,
  bride_name: "Alice",
  groom_name: "Bob",
  couple_name: "Alice & Bob",
  event_date: null,
  welcome_note: "Welcome",
  upload_locked: false,
  demo: false,
  realtime_topic: "wedding:wed_test",
  profile_media_id: "asset_profile",
  profile_media_path: PROFILE_STORAGE_PATH,
  profile_media_kind: "image" as const,
  profile_media_mime_type: "image/jpeg",
  profile_media_file_name: "couple.jpg",
  profile_media_byte_size: 512,
  profile_media_created_at: "2026-07-01T12:00:00.000Z",
  created_at: "2026-07-01T12:00:00.000Z",
  updated_at: "2026-07-01T12:00:00.000Z",
};

const mediaRow = {
  id: "asset_media",
  wedding_id: "wed_test",
  storage_path: MEDIA_STORAGE_PATH,
  kind: "image" as const,
  mime_type: "image/jpeg",
  file_name: "memory.jpg",
  byte_size: 1024,
  thumbnail_id: null,
  thumbnail_path: null,
  thumbnail_mime_type: null,
  thumbnail_file_name: null,
  thumbnail_byte_size: null,
  thumbnail_created_at: null,
  guest_name: "Guest",
  note: null,
  approved: true,
  hidden: false,
  favorite: false,
  created_at: "2026-07-01T12:00:00.000Z",
  updated_at: "2026-07-01T12:00:00.000Z",
};

const storageCommands: unknown[] = [];
const mediaUpdates: Record<string, unknown>[] = [];
const weddingUpdates: Record<string, unknown>[] = [];
const weddingFilters: Array<{ kind: "eq" | "is"; column: string; value: unknown }> = [];
let addMediaError: string | null = null;
let broadcastError: Error | null = null;
let updatedWeddingRow = weddingRow;
let weddingUpdateStarted = false;

function queryResult<T>(data: T) {
  return Promise.resolve({ data, error: null });
}

const weddingsQuery = {
  update(patch: Record<string, unknown>) {
    weddingUpdates.push(patch);
    updatedWeddingRow = { ...weddingRow, ...patch };
    weddingUpdateStarted = true;
    return this;
  },
  select() {
    return this;
  },
  eq(column: string, value: unknown) {
    if (weddingUpdateStarted) {
      weddingFilters.push({ kind: "eq", column, value });
    }
    return this;
  },
  is(column: string, value: unknown) {
    if (weddingUpdateStarted) {
      weddingFilters.push({ kind: "is", column, value });
    }
    return this;
  },
  maybeSingle() {
    return queryResult(weddingUpdateStarted ? updatedWeddingRow : weddingRow);
  },
  single() {
    return queryResult(updatedWeddingRow);
  },
};

const mediaQuery = {
  update(patch: Record<string, unknown>) {
    mediaUpdates.push(patch);
    return this;
  },
  eq() {
    return this;
  },
  select() {
    return this;
  },
  maybeSingle() {
    return queryResult(mediaRow);
  },
};

const fakeSupabase = {
  from(table: string) {
    if (table === "weddings") {
      return weddingsQuery;
    }

    if (table === "wedding_media") {
      return mediaQuery;
    }

    throw new Error(`Unexpected table in test: ${table}`);
  },
  rpc(name: string) {
    if (name !== "add_wedding_media_with_quota") {
      throw new Error(`Unexpected RPC in test: ${name}`);
    }

    if (addMediaError) {
      return Promise.resolve({ data: null, error: { message: addMediaError } });
    }

    return Promise.resolve({ data: mediaRow, error: null });
  },
};

mock.module("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => fakeSupabase,
}));

mock.module("@/lib/storage/r2-client", () => ({
  R2_BUCKET: "test-bucket",
  getR2Client: () => ({
    async send(command: unknown) {
      storageCommands.push(command);

      if (command instanceof HeadObjectCommand) {
        return { ContentLength: 1024 };
      }

      return {};
    },
  }),
}));

mock.module("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: async (_client: unknown, command: { input?: { Key?: string } }) =>
    `https://signed.example/${command.input?.Key ?? "unknown"}`,
}));

mock.module("@/lib/auth", () => ({
  getCurrentWeddingFromCookie: async () => ({
    wedding: {
      id: weddingRow.id,
      realtimeTopic: weddingRow.realtime_topic,
    },
  }),
  sessionCookieOptions: () => ({
    httpOnly: true,
    sameSite: "lax" as const,
    secure: false,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  }),
  clearSessionCookie: async () => undefined,
}));

mock.module("@/lib/supabase/realtime", () => ({
  broadcastWeddingMediaChange: async () => {
    if (broadcastError) {
      throw broadcastError;
    }
  },
}));

const { POST: legacyCompleteUpload } = await import(
  "../src/app/api/uploads/[slug]/complete/route"
);
const { POST: legacyPrepareUpload } = await import(
  "../src/app/api/uploads/[slug]/prepare/route"
);
const { PATCH: patchMedia } = await import("../src/app/api/media/[id]/route");
const {
  clearWeddingProfileMediaIfCurrent,
  getWeddingBySlug,
  getWeddingRecordBySlug,
  restoreWeddingProfileMediaIfEmpty,
} = await import("../src/lib/supabase-store");

beforeEach(() => {
  storageCommands.length = 0;
  mediaUpdates.length = 0;
  weddingUpdates.length = 0;
  weddingFilters.length = 0;
  addMediaError = null;
  broadcastError = null;
  updatedWeddingRow = weddingRow;
  weddingUpdateStarted = false;
});

describe("retired direct upload boundary", () => {
  test("old prepare and complete routes cannot issue or finalize direct object writes", async () => {
    const prepareResponse = await legacyPrepareUpload();
    const completeResponse = await legacyCompleteUpload();

    expect(prepareResponse.status).toBe(410);
    expect(completeResponse.status).toBe(410);
    expect((await prepareResponse.json()).code).toBe("UPLOAD_API_RETIRED");
    expect((await completeResponse.json()).code).toBe("UPLOAD_API_RETIRED");
    expect(storageCommands).toHaveLength(0);
  });
});

test("public wedding profile DTO omits its internal R2 storage path", async () => {
  const internalWedding = await getWeddingRecordBySlug(weddingRow.slug);
  const publicWedding = await getWeddingBySlug(weddingRow.slug);

  expect(internalWedding?.profileMedia?.storagePath).toBe(PROFILE_STORAGE_PATH);
  expect(publicWedding?.profileMedia?.url).toBe(
    `https://signed.example/${PROFILE_STORAGE_PATH}`,
  );
  expect(publicWedding?.profileMedia).not.toHaveProperty("storagePath");
});

test("clearing a profile photo uses its current id as a compare-and-set guard", async () => {
  const wedding = await clearWeddingProfileMediaIfCurrent(
    weddingRow.id,
    weddingRow.profile_media_id,
  );

  expect(weddingUpdates).toEqual([
    {
      profile_media_id: null,
      profile_media_path: null,
      profile_media_kind: null,
      profile_media_mime_type: null,
      profile_media_file_name: null,
      profile_media_byte_size: null,
      profile_media_created_at: null,
    },
  ]);
  expect(weddingFilters).toEqual([
    { kind: "eq", column: "id", value: weddingRow.id },
    {
      kind: "eq",
      column: "profile_media_id",
      value: weddingRow.profile_media_id,
    },
  ]);
  expect(wedding?.profileMedia).toBeUndefined();
});

test("restoring a profile photo only writes while the profile slot is empty", async () => {
  const profileMedia = {
    id: weddingRow.profile_media_id,
    storagePath: weddingRow.profile_media_path,
    url: `https://signed.example/${weddingRow.profile_media_path}`,
    kind: weddingRow.profile_media_kind,
    mimeType: weddingRow.profile_media_mime_type,
    fileName: weddingRow.profile_media_file_name,
    byteSize: weddingRow.profile_media_byte_size,
    createdAt: weddingRow.profile_media_created_at,
  };

  const restored = await restoreWeddingProfileMediaIfEmpty(weddingRow.id, profileMedia);

  expect(restored).toBeTrue();
  expect(weddingFilters).toEqual([
    { kind: "eq", column: "id", value: weddingRow.id },
    { kind: "is", column: "profile_media_id", value: null },
  ]);
});

test("PATCH media endpoint rejects protected fields without reaching the store", async () => {
  const response = await patchMedia(
    new Request("http://localhost/api/media/asset_media", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        approved: false,
        id: "asset_attacker",
        wedding_id: "wed_attacker",
        storage_path: "weddings/wed_attacker/guest/victim.jpg",
        thumbnail_path: "weddings/wed_attacker/guest-thumbnail/victim.jpg",
        byte_size: 1,
      }),
    }),
    { params: Promise.resolve({ id: mediaRow.id }) },
  );

  expect(response.status).toBe(405);
  expect(response.headers.get("allow")).toBe("DELETE");
  expect(mediaUpdates).toHaveLength(0);
});
