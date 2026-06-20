import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  AppStore,
  PublicWedding,
  SessionRecord,
  StoredMediaObject,
  TokenRecord,
  Wedding,
  WeddingMedia,
} from "@/lib/types";
import { createId, hashToken, SESSION_MAX_AGE_SECONDS } from "@/lib/security";
import { makeBaseWeddingSlug, makeCoupleName } from "@/lib/text";

const DATA_DIR = path.join(process.cwd(), ".local-data");
const STORE_PATH = path.join(DATA_DIR, "store.json");
const TOKEN_SEED_PATH = path.join(DATA_DIR, "token-hashes.json");
const DEMO_TOKEN = "SAYYES-DEMO-2026";

type TokenSeed = {
  id: string;
  tokenHash: string;
  createdAt?: string;
};

async function pathExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readTokenSeed(): Promise<TokenRecord[]> {
  const now = new Date().toISOString();

  if (await pathExists(TOKEN_SEED_PATH)) {
    const raw = await fs.readFile(TOKEN_SEED_PATH, "utf8");
    const seed = JSON.parse(raw) as TokenSeed[];
    return seed.map((token) => ({
      id: token.id,
      tokenHash: token.tokenHash,
      status: "unused",
      createdAt: token.createdAt ?? now,
    }));
  }

  return [
    {
      id: "demo-token",
      tokenHash: hashToken(DEMO_TOKEN),
      status: "unused",
      createdAt: now,
    },
  ];
}

async function defaultStore(): Promise<AppStore> {
  return {
    tokens: await readTokenSeed(),
    weddings: [],
    media: [],
    sessions: [],
  };
}

async function ensureStoreFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  if (!(await pathExists(STORE_PATH))) {
    await writeStore(await defaultStore());
  }
}

export async function readStore(): Promise<AppStore> {
  await ensureStoreFile();
  const raw = await fs.readFile(STORE_PATH, "utf8");
  return JSON.parse(raw) as AppStore;
}

export async function writeStore(store: AppStore) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(STORE_PATH, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function makeUniqueSlug(baseSlug: string, weddings: Wedding[]) {
  const used = new Set(weddings.map((wedding) => wedding.slug));
  let candidate = baseSlug;
  let index = 2;

  while (used.has(candidate)) {
    candidate = `${baseSlug}-${index}`;
    index += 1;
  }

  return candidate;
}

export async function activateWedding(input: {
  brideName: string;
  groomName: string;
  token: string;
}) {
  const store = await readStore();
  const tokenHash = hashToken(input.token);
  const token = store.tokens.find((item) => item.tokenHash === tokenHash);

  if (!token || token.status !== "unused") {
    return { ok: false as const, message: "Invalid or already used token." };
  }

  const brideName = input.brideName.trim();
  const groomName = input.groomName.trim();

  if (!brideName || !groomName) {
    return { ok: false as const, message: "Bride and groom names are required." };
  }

  const now = new Date().toISOString();
  const weddingId = createId("wed");
  const baseSlug = makeBaseWeddingSlug(brideName, groomName);
  const slug = makeUniqueSlug(baseSlug, store.weddings);
  const wedding: Wedding = {
    id: weddingId,
    slug,
    brideName,
    groomName,
    coupleName: makeCoupleName(brideName, groomName),
    welcomeNote: "Tonight, every photo, voice note, and tiny moment becomes part of our story.",
    uploadLocked: false,
    createdAt: now,
    updatedAt: now,
  };

  token.status = "active";
  token.weddingId = weddingId;
  token.activatedAt = now;
  store.weddings.push(wedding);

  await writeStore(store);
  return { ok: true as const, wedding };
}

export async function createSession(weddingId: string) {
  const store = await readStore();
  const now = new Date();
  const session: SessionRecord = {
    id: createId("sess"),
    weddingId,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000).toISOString(),
  };

  store.sessions.push(session);
  await writeStore(store);
  return session;
}

export async function getSession(sessionId?: string) {
  if (!sessionId) {
    return null;
  }

  const store = await readStore();
  const session = store.sessions.find((item) => item.id === sessionId);

  if (!session || new Date(session.expiresAt).getTime() <= Date.now()) {
    return null;
  }

  return session;
}

export async function deleteSession(sessionId?: string) {
  if (!sessionId) {
    return;
  }

  const store = await readStore();
  store.sessions = store.sessions.filter((session) => session.id !== sessionId);
  await writeStore(store);
}

export async function getWeddingById(weddingId: string) {
  const store = await readStore();
  return store.weddings.find((wedding) => wedding.id === weddingId) ?? null;
}

export async function getWeddingBySlug(slug: string): Promise<PublicWedding | null> {
  const store = await readStore();
  const wedding = store.weddings.find((item) => item.slug === slug);

  if (!wedding) {
    return null;
  }

  return {
    id: wedding.id,
    slug: wedding.slug,
    brideName: wedding.brideName,
    groomName: wedding.groomName,
    coupleName: wedding.coupleName,
    eventDate: wedding.eventDate,
    welcomeNote: wedding.welcomeNote,
    profileMedia: wedding.profileMedia,
    uploadLocked: wedding.uploadLocked,
  };
}

export async function updateWedding(
  weddingId: string,
  patch: Partial<Pick<Wedding, "eventDate" | "welcomeNote" | "uploadLocked">> & {
    profileMedia?: StoredMediaObject;
  },
) {
  const store = await readStore();
  const wedding = store.weddings.find((item) => item.id === weddingId);

  if (!wedding) {
    return null;
  }

  Object.assign(wedding, patch, { updatedAt: new Date().toISOString() });
  await writeStore(store);
  return wedding;
}

export async function listWeddingMedia(weddingId: string) {
  const store = await readStore();
  return store.media
    .filter((item) => item.weddingId === weddingId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function addWeddingMedia(input: {
  weddingId: string;
  guestName: string;
  note?: string;
  object: StoredMediaObject;
}) {
  const store = await readStore();
  const media: WeddingMedia = {
    ...input.object,
    weddingId: input.weddingId,
    guestName: input.guestName,
    note: input.note,
    approved: true,
    hidden: false,
    favorite: false,
  };

  store.media.push(media);
  await writeStore(store);
  return media;
}

export async function updateMediaForWedding(
  mediaId: string,
  weddingId: string,
  patch: Partial<Pick<WeddingMedia, "approved" | "hidden" | "favorite">>,
) {
  const store = await readStore();
  const media = store.media.find((item) => item.id === mediaId && item.weddingId === weddingId);

  if (!media) {
    return null;
  }

  Object.assign(media, patch);
  await writeStore(store);
  return media;
}

export async function deleteMedia(mediaId: string, weddingId: string) {
  const store = await readStore();
  const before = store.media.length;
  store.media = store.media.filter(
    (item) => !(item.id === mediaId && item.weddingId === weddingId),
  );
  await writeStore(store);
  return store.media.length !== before;
}

export function getDemoToken() {
  return DEMO_TOKEN;
}
