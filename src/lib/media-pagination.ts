import type { MediaKind } from "@/lib/types";

export class InvalidMediaPageQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidMediaPageQueryError";
  }
}

function parseInteger(
  value: string | null,
  fallback: number,
  options: { name: string; min: number; max: number },
) {
  if (value === null) {
    return fallback;
  }

  if (!/^\d+$/.test(value)) {
    throw new InvalidMediaPageQueryError(`${options.name} must be a whole number.`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < options.min || parsed > options.max) {
    throw new InvalidMediaPageQueryError(
      `${options.name} must be between ${options.min} and ${options.max}.`,
    );
  }

  return parsed;
}

export function parseMediaPageQuery(searchParams: URLSearchParams) {
  const kindValue = searchParams.get("kind");
  const kind: MediaKind | undefined =
    kindValue === "image" || kindValue === "video" || kindValue === "audio"
      ? kindValue
      : undefined;

  if (kindValue !== null && kind === undefined) {
    throw new InvalidMediaPageQueryError("kind is invalid.");
  }

  const orderValue = searchParams.get("order");
  if (orderValue !== null && orderValue !== "newest" && orderValue !== "oldest") {
    throw new InvalidMediaPageQueryError("order is invalid.");
  }

  return {
    offset: parseInteger(searchParams.get("offset"), 0, {
      name: "offset",
      min: 0,
      max: 1_000_000,
    }),
    limit: parseInteger(searchParams.get("limit"), 48, {
      name: "limit",
      min: 1,
      max: 60,
    }),
    order: orderValue === "oldest" ? ("oldest" as const) : ("newest" as const),
    kind,
  };
}
