import { NextResponse } from "next/server";
import { sessionCookieOptions } from "@/lib/auth";
import { validateRecoveryRequest } from "@/lib/auth/customer-input";
import {
  createCustomerSession,
  getCustomerWedding,
  resetCustomerPassword,
  resolveCustomerByActiveToken,
} from "@/lib/auth/customer-store";
import { hashPassword } from "@/lib/auth/passwords";
import { createSessionToken } from "@/lib/auth/session-tokens";
import {
  clearCustomerIdentifierLimit,
  consumeCustomerAuthLimits,
} from "@/lib/auth/rate-limit";
import { toPublicWedding } from "@/lib/public-wedding";
import { hashToken, SESSION_COOKIE_NAME } from "@/lib/security";

function errorResponse(code: string, status: number) {
  return NextResponse.json(
    { code, message: "The password could not be reset with that token." },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return errorResponse("INVALID_REQUEST", 400);
  }

  const validated = validateRecoveryRequest(rawBody);
  if (!validated.ok) {
    return errorResponse(validated.code, 400);
  }

  try {
    const tokenHash = hashToken(validated.value.token);
    const limit = await consumeCustomerAuthLimits(request, "recover", tokenHash);
    if (!limit.allowed) {
      return NextResponse.json(
        { code: "TOO_MANY_ATTEMPTS", message: "Try again later." },
        {
          status: 429,
          headers: {
            "Cache-Control": "no-store",
            "Retry-After": String(limit.retryAfterSeconds),
          },
        },
      );
    }

    const existing = await resolveCustomerByActiveToken(tokenHash);
    if (!existing || existing.status !== "active") {
      return errorResponse("INVALID_CREDENTIALS", 401);
    }
    if (!existing.passwordHash) {
      return errorResponse("SETUP_REQUIRED", 409);
    }

    const now = new Date().toISOString();
    const updated = await resetCustomerPassword({
      tokenHash,
      passwordHash: await hashPassword(validated.value.password),
      now,
    });
    const sessionSecret = createSessionToken();
    await createCustomerSession({
      weddingId: updated.id,
      sessionId: sessionSecret.id,
      sessionTokenHash: sessionSecret.tokenHash,
      passwordVersion: updated.passwordVersion,
      now,
    });

    const wedding = await getCustomerWedding(updated.id);
    if (!wedding) {
      return errorResponse("MEMBERSHIP_UNAVAILABLE", 503);
    }

    await clearCustomerIdentifierLimit(limit).catch(() => undefined);

    const response = NextResponse.json(
      { wedding: toPublicWedding(wedding) },
      { headers: { "Cache-Control": "no-store" } },
    );
    response.cookies.set(
      SESSION_COOKIE_NAME,
      sessionSecret.rawToken,
      sessionCookieOptions(request),
    );
    return response;
  } catch {
    return errorResponse("INVALID_CREDENTIALS", 401);
  }
}
