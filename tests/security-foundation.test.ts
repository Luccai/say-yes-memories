import { beforeEach, describe, expect, mock, test } from "bun:test";
import { DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";

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
let addMediaError: string | null = null;
let broadcastError: Error | null = null;

function queryResult<T>(data: T) {
  return Promise.resolve({ data, error: null });
}

const weddingsQuery = {
  select() {
    return this;
  },
  eq() {
    return this;
  },
  maybeSingle() {
    return queryResult(weddingRow);
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
}));

mock.module("@/lib/supabase/realtime", () => ({
  broadcastWeddingMediaChange: async () => {
    if (broadcastError) {
      throw broadcastError;
    }
  },
}));

const { POST: completeUpload } = await import(
  "../src/app/api/uploads/[slug]/complete/route"
);
const { PATCH: patchMedia } = await import("../src/app/api/media/[id]/route");
const { getWeddingBySlug, getWeddingRecordBySlug } = await import(
  "../src/lib/supabase-store"
);

function pendingObject(
  storagePath: string,
  id = "asset_aaaaaaaaaaaaaaaaaaaaaaaa",
) {
  return {
    id,
    storagePath,
    kind: "image" as const,
    mimeType: "image/jpeg",
    fileName: "memory.jpg",
    byteSize: 1024,
    createdAt: "2026-07-01T12:00:00.000Z",
  };
}

function completeRequest(storagePath: string, thumbnailStoragePath?: string) {
  return new Request("http://localhost/api/uploads/alice-bob/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      guestName: "Guest",
      object: pendingObject(storagePath),
      thumbnail: thumbnailStoragePath
        ? pendingObject(thumbnailStoragePath, "asset_bbbbbbbbbbbbbbbbbbbbbbbb")
        : undefined,
    }),
  });
}

beforeEach(() => {
  storageCommands.length = 0;
  mediaUpdates.length = 0;
  addMediaError = null;
  broadcastError = null;
});

describe("upload complete cleanup boundary", () => {
  test("client-controlled object and thumbnail paths cannot trigger an R2 delete", async () => {
    const response = await completeUpload(
      completeRequest(
        "weddings/another-wedding/guest/asset_aaaaaaaaaaaaaaaaaaaaaaaa-memory.jpg",
        "weddings/another-wedding/guest-thumbnail/asset_bbbbbbbbbbbbbbbbbbbbbbbb-memory.jpg",
      ),
      { params: Promise.resolve({ slug: weddingRow.slug }) },
    );

    expect(response.status).toBe(400);
    expect(
      storageCommands.filter((command) => command instanceof DeleteObjectCommand),
    ).toHaveLength(0);
  });

  test("replayed completion failure leaves the already stored object untouched", async () => {
    addMediaError = "duplicate key value violates unique constraint";
    const storagePath = `weddings/${weddingRow.id}/guest/asset_aaaaaaaaaaaaaaaaaaaaaaaa-memory.jpg`;

    const response = await completeUpload(completeRequest(storagePath), {
      params: Promise.resolve({ slug: weddingRow.slug }),
    });

    expect(response.status).toBe(400);
    expect(storageCommands.some((command) => command instanceof HeadObjectCommand)).toBe(true);
    expect(
      storageCommands.filter((command) => command instanceof DeleteObjectCommand),
    ).toHaveLength(0);
  });

  test("Realtime failure does not turn an already persisted upload into a failure", async () => {
    broadcastError = new Error("Realtime network unavailable");
    const storagePath = `weddings/${weddingRow.id}/guest/asset_aaaaaaaaaaaaaaaaaaaaaaaa-memory.jpg`;

    const response = await completeUpload(completeRequest(storagePath), {
      params: Promise.resolve({ slug: weddingRow.slug }),
    });

    expect(response.status).toBe(200);
    expect((await response.json()).media.id).toBe(mediaRow.id);
    expect(
      storageCommands.filter((command) => command instanceof DeleteObjectCommand),
    ).toHaveLength(0);
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
