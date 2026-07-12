import { describe, expect, test } from "bun:test";
import {
  InvalidMediaPageQueryError,
  parseMediaPageQuery,
} from "../src/lib/media-pagination";

describe("media pagination query", () => {
  test("uses safe defaults", () => {
    expect(parseMediaPageQuery(new URLSearchParams())).toEqual({
      offset: 0,
      limit: 48,
      order: "newest",
      kind: undefined,
    });
  });

  test("accepts a bounded media filter page", () => {
    expect(
      parseMediaPageQuery(
        new URLSearchParams("offset=48&limit=60&order=oldest&kind=video"),
      ),
    ).toEqual({ offset: 48, limit: 60, order: "oldest", kind: "video" });
  });

  test.each(["offset=NaN", "offset=-1", "offset=1.2", "limit=0", "limit=61"])(
    "rejects invalid integer input: %s",
    (query) => {
      expect(() => parseMediaPageQuery(new URLSearchParams(query))).toThrow(
        InvalidMediaPageQueryError,
      );
    },
  );

  test("rejects unknown filters instead of silently widening the result", () => {
    expect(() => parseMediaPageQuery(new URLSearchParams("kind=document"))).toThrow(
      "kind is invalid",
    );
  });
});
