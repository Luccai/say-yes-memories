import { NextResponse } from "next/server";
import { validateActivationTokenRequest } from "@/lib/auth/customer-input";
import { getActivationTokenState } from "@/lib/auth/customer-store";
import { consumeCustomerAuthLimits } from "@/lib/auth/rate-limit";
import { hashToken } from "@/lib/security";

function response(code: string, status: number) {
  return NextResponse.json(
    { code },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return response("INVALID_REQUEST", 400);
  }

  const validated = validateActivationTokenRequest(rawBody);
  if (!validated.ok) {
    return response(validated.code, 400);
  }

  const tokenHash = hashToken(validated.value.token);

  try {
    const limit = await consumeCustomerAuthLimits(
      request,
      "activation-check",
      tokenHash,
    );
    if (!limit.allowed) {
      return NextResponse.json(
        { code: "TOO_MANY_ATTEMPTS" },
        {
          status: 429,
          headers: {
            "Cache-Control": "no-store",
            "Retry-After": String(limit.retryAfterSeconds),
          },
        },
      );
    }

    const tokenState = await getActivationTokenState(tokenHash);
    const eligible =
      tokenState.state === "unused" ||
      (tokenState.state === "active" &&
        tokenState.credentials.passwordHash === null &&
        tokenState.credentials.status === "active");
    if (!eligible) {
      return response("TOKEN_UNAVAILABLE", 401);
    }

    return NextResponse.json(
      { valid: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return response("TOKEN_CHECK_UNAVAILABLE", 503);
  }
}
