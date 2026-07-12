import { randomUUID } from "node:crypto";

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const EXPECTED_ACTION = "guest-upload";
const VERIFY_TIMEOUT_MS = 8_000;

type TurnstileResult = {
  success?: boolean;
  action?: string;
  hostname?: string;
  "error-codes"?: string[];
};

type FetchLike = (
  input: URL | RequestInfo,
  init?: RequestInit,
) => Promise<Response>;

function turnstileSecret(override?: string) {
  const value = override ?? process.env.TURNSTILE_SECRET_KEY;
  if (!value) {
    throw new Error("Turnstile is not configured.");
  }
  return value;
}

function trustedRequestIp(request: Request) {
  const forwarded = (
    request.headers.get("x-vercel-forwarded-for") ??
    request.headers.get("x-forwarded-for")
  )
    ?.split(",")[0]
    ?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || undefined;
}

function expectedHostnames(request: Request, override?: string[]) {
  if (override) return override;
  const configured = (process.env.TURNSTILE_EXPECTED_HOSTNAMES ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return configured.length
    ? configured
    : [new URL(request.url).hostname.toLowerCase()];
}

async function callSiteverify(
  body: Record<string, string>,
  fetchImpl: FetchLike,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
  try {
    const response = await fetchImpl(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error("Turnstile verification service rejected the request.");
    }
    return (await response.json()) as TurnstileResult;
  } finally {
    clearTimeout(timeout);
  }
}

export async function verifyTurnstile(input: {
  token: string;
  request: Request;
  secretOverride?: string;
  expectedHostnamesOverride?: string[];
  fetchImpl?: FetchLike;
}) {
  const token = input.token.trim();
  if (!token || token.length > 4096) {
    throw new Error("Upload verification failed.");
  }

  const body: Record<string, string> = {
    secret: turnstileSecret(input.secretOverride),
    response: token,
    idempotency_key: randomUUID(),
  };
  const remoteIp = trustedRequestIp(input.request);
  if (remoteIp) body.remoteip = remoteIp;

  const fetchImpl = input.fetchImpl ?? fetch;
  let result: TurnstileResult | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      result = await callSiteverify(body, fetchImpl);
      if (!result["error-codes"]?.includes("internal-error")) break;
    } catch {
      if (attempt === 1) {
        throw new Error("Upload verification failed.");
      }
    }
  }

  const hostname = result?.hostname?.toLowerCase();
  const hostnames = expectedHostnames(
    input.request,
    input.expectedHostnamesOverride,
  );
  if (
    !result?.success ||
    result.action !== EXPECTED_ACTION ||
    !hostname ||
    !hostnames.includes(hostname)
  ) {
    throw new Error("Upload verification failed.");
  }

  return { success: true as const, hostname };
}
