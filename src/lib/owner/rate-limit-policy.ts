import { createHmac } from "node:crypto";

export type OwnerAuthAction = "setup" | "login";

type ConsumeInput = {
  keyHash: string;
  action: string;
  maxAttempts: number;
  windowSeconds: number;
  blockSeconds: number;
  now: string;
};

type ConsumeResult = {
  allowed: boolean;
  retry_after_seconds: number;
  remaining_attempts: number;
};

export type OwnerRateLimitOperations = {
  consume: (input: ConsumeInput) => Promise<ConsumeResult>;
  clear: (keyHash: string, action: string) => Promise<unknown>;
};

const POLICIES: Record<
  OwnerAuthAction,
  { globalAttempts: number; ipAttempts: number }
> = {
  setup: { globalAttempts: 10, ipAttempts: 5 },
  login: { globalAttempts: 25, ipAttempts: 8 },
};

const WINDOW_SECONDS = 15 * 60;
const BLOCK_SECONDS = 15 * 60;

function rateLimitSecret() {
  const value = process.env.AUTH_RATE_LIMIT_SECRET;
  if (!value || Buffer.byteLength(value, "utf8") < 32) {
    throw new Error("AUTH_RATE_LIMIT_SECRET must contain at least 32 bytes.");
  }
  return value;
}

function requestIp(request: Request) {
  const forwarded = (
    request.headers.get("x-vercel-forwarded-for") ??
    request.headers.get("x-forwarded-for")
  )
    ?.split(",")[0]
    ?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}

function ownerRateKey(action: OwnerAuthAction, scope: "ip" | "global", value: string) {
  return createHmac("sha256", rateLimitSecret())
    .update(`owner-auth\0${action}\0${scope}\0${value.trim().toLowerCase()}`, "utf8")
    .digest("hex");
}

export async function consumeOwnerAuthLimitPolicy(
  request: Request,
  action: OwnerAuthAction,
  operations: OwnerRateLimitOperations,
) {
  const policy = POLICIES[action];
  const now = new Date().toISOString();
  const ipBucket = {
    keyHash: ownerRateKey(action, "ip", requestIp(request)),
    action: `auth.owner.${action}.ip`,
  };
  const globalBucket = {
    keyHash: ownerRateKey(action, "global", "primary-owner"),
    action: `auth.owner.${action}.global`,
  };

  const ipResult = await operations.consume({
    ...ipBucket,
    maxAttempts: policy.ipAttempts,
    windowSeconds: WINDOW_SECONDS,
    blockSeconds: BLOCK_SECONDS,
    now,
  });
  if (!ipResult.allowed) {
    return {
      allowed: false as const,
      retryAfterSeconds: ipResult.retry_after_seconds,
      buckets: [ipBucket, globalBucket],
    };
  }

  const globalResult = await operations.consume({
    ...globalBucket,
    maxAttempts: policy.globalAttempts,
    windowSeconds: WINDOW_SECONDS,
    blockSeconds: BLOCK_SECONDS,
    now,
  });

  return {
    allowed: globalResult.allowed,
    retryAfterSeconds: globalResult.retry_after_seconds,
    buckets: [ipBucket, globalBucket],
  } as const;
}

export async function clearOwnerAuthLimitPolicy(
  input: { buckets: ReadonlyArray<{ keyHash: string; action: string }> },
  operations: OwnerRateLimitOperations,
) {
  await Promise.all(
    input.buckets.map((bucket) => operations.clear(bucket.keyHash, bucket.action)),
  );
}
