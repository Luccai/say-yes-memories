import type { MediaKind } from "@/lib/types";
import type { useCopy } from "@/lib/i18n-client";

export type AdminCopy = ReturnType<typeof useCopy>["admin"];
export type FilterKey = "all" | MediaKind;
export type MemoryGridLayout = "classic" | "story" | "compact";
