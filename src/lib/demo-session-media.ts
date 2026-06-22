import type { StoredMediaObject, WeddingMedia } from "@/lib/types";

const DEMO_SESSION_MEDIA_KEY = "sayyes.demo.session.media";
const DEMO_SESSION_MEDIA_EVENT = "sayyes.demo.session.media.changed";
const DEMO_SESSION_MEDIA_PREFIX = "demo-session-";
const DEMO_SESSION_DB_NAME = "sayyes-demo-session-media";
const DEMO_SESSION_DB_VERSION = 1;
const DEMO_SESSION_STORE_NAME = "objects";

type DemoSessionObjectRecord = Omit<StoredMediaObject, "url">;
type DemoSessionMediaRecord = Omit<WeddingMedia, "url" | "thumbnail"> & {
  thumbnail?: DemoSessionObjectRecord;
};

type DemoSessionObjectInput = DemoSessionObjectRecord & {
  file: Blob;
};

type DemoSessionMediaInput = Omit<WeddingMedia, "url" | "thumbnail"> & {
  file: Blob;
  thumbnail?: DemoSessionObjectInput;
};

type DemoSessionBlobRecord = {
  id: string;
  blob: Blob;
};

function canUseDemoSessionStorage() {
  return typeof window !== "undefined" && "localStorage" in window && "indexedDB" in window;
}

function emitDemoSessionMediaChange() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(DEMO_SESSION_MEDIA_EVENT));
}

function openDemoSessionDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (!canUseDemoSessionStorage()) {
      reject(new Error("Demo session storage is not available."));
      return;
    }

    const request = window.indexedDB.open(DEMO_SESSION_DB_NAME, DEMO_SESSION_DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(DEMO_SESSION_STORE_NAME)) {
        database.createObjectStore(DEMO_SESSION_STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Demo session database failed."));
  });
}

async function putDemoSessionBlob(id: string, blob: Blob) {
  const database = await openDemoSessionDatabase();

  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(DEMO_SESSION_STORE_NAME, "readwrite");
    transaction.objectStore(DEMO_SESSION_STORE_NAME).put({ id, blob });

    transaction.oncomplete = () => {
      database.close();
      resolve();
    };

    transaction.onabort = transaction.onerror = () => {
      const error = transaction.error ?? new Error("Demo media could not be stored.");
      database.close();
      reject(error);
    };
  });
}

async function readDemoSessionBlob(id: string) {
  const database = await openDemoSessionDatabase();

  return new Promise<Blob | null>((resolve, reject) => {
    let blob: Blob | null = null;
    const transaction = database.transaction(DEMO_SESSION_STORE_NAME, "readonly");
    const request = transaction.objectStore(DEMO_SESSION_STORE_NAME).get(id);

    request.onsuccess = () => {
      blob = ((request.result as DemoSessionBlobRecord | undefined)?.blob) ?? null;
    };

    transaction.oncomplete = () => {
      database.close();
      resolve(blob);
    };

    transaction.onabort = transaction.onerror = () => {
      const error = transaction.error ?? request.error ?? new Error("Demo media could not be read.");
      database.close();
      reject(error);
    };
  });
}

async function deleteDemoSessionBlob(id: string) {
  const database = await openDemoSessionDatabase();

  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(DEMO_SESSION_STORE_NAME, "readwrite");
    transaction.objectStore(DEMO_SESSION_STORE_NAME).delete(id);

    transaction.oncomplete = () => {
      database.close();
      resolve();
    };

    transaction.onabort = transaction.onerror = () => {
      const error = transaction.error ?? new Error("Demo media could not be deleted.");
      database.close();
      reject(error);
    };
  });
}

async function objectUrlForDemoSessionBlob(id: string) {
  const blob = await readDemoSessionBlob(id);

  return blob ? URL.createObjectURL(blob) : "";
}

function getDemoSessionRecords() {
  if (!canUseDemoSessionStorage()) {
    return [];
  }

  try {
    let stored = window.localStorage.getItem(DEMO_SESSION_MEDIA_KEY);

    if (!stored && "sessionStorage" in window) {
      stored = window.sessionStorage.getItem(DEMO_SESSION_MEDIA_KEY);

      if (stored) {
        window.localStorage.setItem(DEMO_SESSION_MEDIA_KEY, stored);
        window.sessionStorage.removeItem(DEMO_SESSION_MEDIA_KEY);
      }
    }

    return stored ? (JSON.parse(stored) as DemoSessionMediaRecord[]) : [];
  } catch {
    return [];
  }
}

function setDemoSessionRecords(records: DemoSessionMediaRecord[]) {
  if (!canUseDemoSessionStorage()) {
    return false;
  }

  try {
    window.localStorage.setItem(DEMO_SESSION_MEDIA_KEY, JSON.stringify(records));
    emitDemoSessionMediaChange();
    return true;
  } catch {
    return false;
  }
}

export function isDemoSessionMedia(mediaId: string) {
  return mediaId.startsWith(DEMO_SESSION_MEDIA_PREFIX);
}

export function createDemoSessionMediaId() {
  return `${DEMO_SESSION_MEDIA_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function getDemoSessionMedia() {
  if (!canUseDemoSessionStorage()) {
    return [];
  }

  try {
    const media = await Promise.all(
      getDemoSessionRecords().map(async (record): Promise<WeddingMedia | null> => {
        const { thumbnail: thumbnailRecord, ...mediaRecord } = record;
        const url = await objectUrlForDemoSessionBlob(mediaRecord.id);

        if (!url) {
          return null;
        }

        const thumbnailUrl = thumbnailRecord
          ? await objectUrlForDemoSessionBlob(thumbnailRecord.id)
          : "";

        return {
          ...mediaRecord,
          url,
          ...(thumbnailRecord && thumbnailUrl
            ? {
                thumbnail: {
                  ...thumbnailRecord,
                  url: thumbnailUrl,
                },
              }
            : {}),
        };
      }),
    );

    return media.filter((item): item is WeddingMedia => item !== null);
  } catch {
    return [];
  }
}

export async function addDemoSessionMedia(item: DemoSessionMediaInput) {
  if (!canUseDemoSessionStorage()) {
    return false;
  }

  try {
    const { file, thumbnail, ...mediaRecord } = item;
    await putDemoSessionBlob(mediaRecord.id, file);

    let thumbnailRecord: DemoSessionObjectRecord | undefined;

    if (thumbnail) {
      const { file: thumbnailFile, ...metadata } = thumbnail;
      await putDemoSessionBlob(metadata.id, thumbnailFile);
      thumbnailRecord = metadata;
    }

    return setDemoSessionRecords([
      { ...mediaRecord, thumbnail: thumbnailRecord },
      ...getDemoSessionRecords().filter((record) => record.id !== mediaRecord.id),
    ]);
  } catch {
    return false;
  }
}

export async function removeDemoSessionMedia(mediaId: string) {
  if (!canUseDemoSessionStorage()) {
    return false;
  }

  const records = getDemoSessionRecords();
  const target = records.find((record) => record.id === mediaId);
  const stored = setDemoSessionRecords(records.filter((record) => record.id !== mediaId));

  if (!stored) {
    return false;
  }

  try {
    await deleteDemoSessionBlob(mediaId);

    if (target?.thumbnail) {
      await deleteDemoSessionBlob(target.thumbnail.id);
    }
  } catch {
    // The metadata is already removed, so stale demo blobs can be ignored.
  }

  return true;
}

export function subscribeDemoSessionMedia(listener: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const onStorage = (event: StorageEvent) => {
    if (event.storageArea === window.localStorage && event.key === DEMO_SESSION_MEDIA_KEY) {
      listener();
    }
  };

  window.addEventListener(DEMO_SESSION_MEDIA_EVENT, listener);
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener(DEMO_SESSION_MEDIA_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}
