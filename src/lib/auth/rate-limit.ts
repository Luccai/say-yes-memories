import { createHmac } from "node:crypto";
import {
  clearRateLimitBucket,
  consumeRateLimitBucket,
} from "@/lib/auth/customer-store";

export type CustomerAuthAction = "activation-check" | "activate" | "login" | "recover";

export type RateLimitOperations = {
  consume: typeof consumeRateLimitBucket;
  clear: typeof clearRateLimitBucket;
};

const defaultOperations: RateLimitOperations = {
  consume: consumeRateLimitBucket,
  clear: clearRateLimitBucket,
};

const POLICIES: Record<
  CustomerAuthAction,
  { identifierAttempts: number; ipAttempts: number }
> = {
  "activation-check": { identifierAttempts: 6, ipAttempts: 24 },
  activate: { identifierAttempts: 6, ipAttempts: 24 },
  login: { identifierAttempts: 5, ipAttempts: 30 },
  recover: { identifierAttempts: 4, ipAttempts: 16 },
};

const WINDOW_SECONDS = 15 * 60;
const BLOCK_SECONDS = 15 * 60;

function rateLimitSecret(override?: string) {
  const value = override ?? process.env.AUTH_RATE_LIMIT_SECRET;
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

export function hashRateLimitKey(
  action: CustomerAuthAction,
  scope: "ip" | "identifier",
  value: string,
  secretOverride?: string,
) {
  return createHmac("sha256", rateLimitSecret(secretOverride))
    .update(`${action}\0${scope}\0${value.trim().toLowerCase()}`, "utf8")
    .digest("hex");
}

export async function consumeCustomerAuthLimits(
  request: Request,
  action: CustomerAuthAction,
  identifier: string,
  operations: RateLimitOperations = defaultOperations,
) {
  const policy = POLICIES[action];
  const now = new Date().toISOString();
  const ip = requestIp(request);
  const ipAction = `auth.${action}.ip`;
  const identifierAction = `auth.${action}.identifier`;
  const ipKey = hashRateLimitKey(action, "ip", ip);
  const identifierKey = hashRateLimitKey(
    action,
    "identifier",
    identifier,
  );

  const ipResult = await operations.consume({
    keyHash: ipKey,
    action: ipAction,
    maxAttempts: policy.ipAttempts,
    windowSeconds: WINDOW_SECONDS,
    blockSeconds: BLOCK_SECONDS,
    now,
  });
  if (!ipResult.allowed) {
    return {
      allowed: false as const,
      retryAfterSeconds: ipResult.retry_after_seconds,
      identifierKey,
      identifierAction,
    };
  }

  const identifierResult = await operations.consume({
    keyHash: identifierKey,
    action: identifierAction,
    maxAttempts: policy.identifierAttempts,
    windowSeconds: WINDOW_SECONDS,
    blockSeconds: BLOCK_SECONDS,
    now,
  });
  return {
    allowed: identifierResult.allowed,
    retryAfterSeconds: identifierResult.retry_after_seconds,
    identifierKey,
    identifierAction,
  } as const;
}

export async function clearCustomerIdentifierLimit(input: {
  identifierKey: string;
  identifierAction: string;
}, operations: RateLimitOperations = defaultOperations) {
  await operations.clear(input.identifierKey, input.identifierAction);
}
