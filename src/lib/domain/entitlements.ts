export const GIB = 1024 ** 3;
export const CLASSIC_QUOTA_BYTES = 50 * GIB;
export const EXTENSION_QUOTA_BYTES = 50 * GIB;
export const CLASSIC_ACCESS_MONTHS = 3;
export const EXTENSION_ACCESS_MONTHS = 6;
export const DOWNLOAD_GRACE_DAYS = 30;

export type EntitlementEventType =
  | "premium_extension"
  | "adjustment"
  | "reversal";

export type EntitlementEvent = {
  id: string;
  type: EntitlementEventType;
  appliedAt: string;
  quotaDeltaBytes: number;
  accessDeltaMonths: number;
  reversesEventId?: string;
};

export type EntitlementProjection = {
  uploadsOpenAt: string;
  accessExpiresAt: string;
  cleanupAfter: string;
  storageQuotaBytes: number;
  extensionCount: number;
};

export type AccessState =
  | "pre_event"
  | "open"
  | "download_only"
  | "cleanup_eligible";

type CalendarDate = { year: number; month: number; day: number };
type CalendarDateTime = CalendarDate & {
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timezone: string) {
  const cached = formatterCache.get(timezone);
  if (cached) {
    return cached;
  }

  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatter.format(new Date(0));
    formatterCache.set(timezone, formatter);
    return formatter;
  } catch {
    throw new Error("Invalid timezone");
  }
}

function parseCalendarDate(value: string): CalendarDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new Error("Invalid event date");
  }

  const [, rawYear, rawMonth, rawDay] = match;
  const year = Number(rawYear);
  const month = Number(rawMonth);
  const day = Number(rawDay);
  const probe = new Date(Date.UTC(year, month - 1, day));

  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    throw new Error("Invalid event date");
  }

  return { year, month, day };
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addCalendarMonths(date: CalendarDate, months: number): CalendarDate {
  const monthIndex = date.year * 12 + date.month - 1 + months;
  const year = Math.floor(monthIndex / 12);
  const month = ((monthIndex % 12) + 12) % 12 + 1;
  return {
    year,
    month,
    day: Math.min(date.day, daysInMonth(year, month)),
  };
}

function addCalendarDays(date: CalendarDate, days: number): CalendarDate {
  const value = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: value.getUTCFullYear(),
    month: value.getUTCMonth() + 1,
    day: value.getUTCDate(),
  };
}

function partsAt(instant: Date, timezone: string): CalendarDateTime {
  const values = Object.fromEntries(
    formatterFor(timezone)
      .formatToParts(instant)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
    millisecond: instant.getUTCMilliseconds(),
  };
}

function asUtcMilliseconds(value: CalendarDateTime) {
  return Date.UTC(
    value.year,
    value.month - 1,
    value.day,
    value.hour,
    value.minute,
    value.second,
    value.millisecond,
  );
}

function localDateTimeToInstant(value: CalendarDateTime, timezone: string) {
  const target = asUtcMilliseconds(value);
  let guess = target;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const represented = asUtcMilliseconds(partsAt(new Date(guess), timezone));
    const difference = represented - target;
    if (difference === 0) {
      break;
    }
    guess -= difference;
  }

  return new Date(guess);
}

function startOfLocalDate(date: CalendarDate, timezone: string) {
  return localDateTimeToInstant(
    { ...date, hour: 0, minute: 0, second: 0, millisecond: 0 },
    timezone,
  );
}

function endOfLocalDate(date: CalendarDate, timezone: string) {
  return new Date(startOfLocalDate(addCalendarDays(date, 1), timezone).getTime() - 1);
}

function localDateAt(instant: Date, timezone: string): CalendarDate {
  const { year, month, day } = partsAt(instant, timezone);
  return { year, month, day };
}

function parseInstant(value: string) {
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) {
    throw new Error("Invalid entitlement event time");
  }
  return instant;
}

function activeEvents(events: readonly EntitlementEvent[]) {
  const reversedIds = new Set(
    events
      .filter((event) => event.type === "reversal" && event.reversesEventId)
      .map((event) => event.reversesEventId as string),
  );

  return events
    .filter((event) => event.type !== "reversal" && !reversedIds.has(event.id))
    .toSorted((left, right) => {
      const timeDifference =
        parseInstant(left.appliedAt).getTime() - parseInstant(right.appliedAt).getTime();
      return timeDifference || left.id.localeCompare(right.id);
    });
}

export function calculateEntitlementProjection(input: {
  eventDate: string;
  timezone: string;
  events: readonly EntitlementEvent[];
}): EntitlementProjection {
  const eventDate = parseCalendarDate(input.eventDate);
  formatterFor(input.timezone);

  const uploadsOpenAt = startOfLocalDate(eventDate, input.timezone);
  let accessExpiresAt = endOfLocalDate(
    addCalendarMonths(eventDate, CLASSIC_ACCESS_MONTHS),
    input.timezone,
  );
  let storageQuotaBytes = CLASSIC_QUOTA_BYTES;
  let extensionCount = 0;

  for (const event of activeEvents(input.events)) {
    const appliedAt = parseInstant(event.appliedAt);
    const anchor = appliedAt > accessExpiresAt ? appliedAt : accessExpiresAt;

    if (event.accessDeltaMonths !== 0) {
      accessExpiresAt = endOfLocalDate(
        addCalendarMonths(localDateAt(anchor, input.timezone), event.accessDeltaMonths),
        input.timezone,
      );
    }

    storageQuotaBytes += event.quotaDeltaBytes;
    if (event.type === "premium_extension") {
      extensionCount += 1;
    }
  }

  const cleanupAfter = endOfLocalDate(
    addCalendarDays(localDateAt(accessExpiresAt, input.timezone), DOWNLOAD_GRACE_DAYS),
    input.timezone,
  );

  return {
    uploadsOpenAt: uploadsOpenAt.toISOString(),
    accessExpiresAt: accessExpiresAt.toISOString(),
    cleanupAfter: cleanupAfter.toISOString(),
    storageQuotaBytes: Math.max(storageQuotaBytes, 0),
    extensionCount,
  };
}

export function getAccessState(
  projection: EntitlementProjection,
  nowValue: string | Date = new Date(),
): AccessState {
  const now = nowValue instanceof Date ? nowValue : parseInstant(nowValue);
  const opensAt = parseInstant(projection.uploadsOpenAt);
  const expiresAt = parseInstant(projection.accessExpiresAt);
  const cleanupAfter = parseInstant(projection.cleanupAfter);

  if (now < opensAt) {
    return "pre_event";
  }
  if (now <= expiresAt) {
    return "open";
  }
  if (now <= cleanupAfter) {
    return "download_only";
  }
  return "cleanup_eligible";
}
