import {
  clearRateLimitBucket,
  consumeRateLimitBucket,
} from "@/lib/auth/customer-store";
import {
  clearOwnerAuthLimitPolicy,
  consumeOwnerAuthLimitPolicy,
  type OwnerAuthAction,
  type OwnerRateLimitOperations,
} from "@/lib/owner/rate-limit-policy";

export type { OwnerAuthAction, OwnerRateLimitOperations };

const defaultOperations: OwnerRateLimitOperations = {
  consume: consumeRateLimitBucket,
  clear: clearRateLimitBucket,
};

export async function consumeOwnerAuthLimit(
  request: Request,
  action: OwnerAuthAction,
  operations: OwnerRateLimitOperations = defaultOperations,
) {
  return consumeOwnerAuthLimitPolicy(request, action, operations);
}

export async function clearOwnerAuthLimit(input: {
  buckets: ReadonlyArray<{ keyHash: string; action: string }>;
}, operations: OwnerRateLimitOperations = defaultOperations) {
  await clearOwnerAuthLimitPolicy(input, operations);
}
