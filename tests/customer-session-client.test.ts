import { describe, expect, test } from "bun:test";
import {
  fetchCurrentWeddingSession,
  type SessionFetcher,
} from "@/lib/auth/session-client";

describe("customer session bootstrap", () => {
  test("shows the login form instead of waiting forever when session lookup hangs", async () => {
    const fetcher: SessionFetcher = async (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });

    const wedding = await fetchCurrentWeddingSession({
      fetcher,
      timeoutMs: 5,
    });

    expect(wedding).toBeNull();
  });
});
