import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const memoryGridSource = readFileSync(
  new URL("../src/components/admin/memories/MemoryGrid.tsx", import.meta.url),
  "utf8",
);
const memoriesPanelSource = readFileSync(
  new URL("../src/components/admin/panels/MemoriesPanel.tsx", import.meta.url),
  "utf8",
);
const blurFadeSource = readFileSync(
  new URL("../src/components/shared/BlurFade.tsx", import.meta.url),
  "utf8",
);

describe("memory filter thumbnail retention", () => {
  test("does not replay a card's entrance when it returns from another filter", () => {
    expect(memoryGridSource).toContain(
      "replayOnMount={!enteredMediaIds.has(item.id)}",
    );
    expect(memoryGridSource).toContain(
      "onEntered={() => enteredMediaIds.add(item.id)}",
    );
    expect(blurFadeSource).toContain("replayOnMount");
  });

  test("starts a fresh entrance only after returning to Memories from another panel", () => {
    expect(memoriesPanelSource).toContain(
      "const enteredMediaIds = useMemo(() => new Set<string>(), [entrySequence]);",
    );
  });
});
