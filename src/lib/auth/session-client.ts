import type { PublicWedding } from "@/lib/types";

export type SessionFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

type SessionClientOptions = {
  fetcher?: SessionFetcher;
  timeoutMs?: number;
};

const DEFAULT_SESSION_TIMEOUT_MS = 5_000;

export async function fetchCurrentWeddingSession(
  options: SessionClientOptions = {},
): Promise<PublicWedding | null> {
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_SESSION_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));

  try {
    const response = await fetcher("/api/auth/session", {
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as {
      wedding?: PublicWedding | null;
    };

    return payload.wedding ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
