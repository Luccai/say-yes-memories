import { NextResponse } from "next/server";
import { sessionCookieOptions } from "@/lib/auth";
import { validateLoginRequest } from "@/lib/auth/customer-input";
import {
  createCustomerSession,
  getCustomerWedding,
  resolveCustomerByActiveToken,
  resolveCustomerBySlug,
} from "@/lib/auth/customer-store";
import { verifyPassword } from "@/lib/auth/passwords";
import { createSessionToken } from "@/lib/auth/session-tokens";
import {
  clearCustomerIdentifierLimit,
  consumeCustomerAuthLimits,
} from "@/lib/auth/rate-limit";
import { toPublicWedding } from "@/lib/public-wedding";
import { hashToken, SESSION_COOKIE_NAME } from "@/lib/security";

function errorResponse(code: string, status: number) {
  return NextResponse.json(
    { code, message: "The studio address, token, or password is not correct." },
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

  const validated = validateLoginRequest(rawBody);
  if (!validated.ok) {
    return errorResponse(validated.code, 400);
  }

  try {
    const rateIdentifier =
      validated.value.mode === "token"
        ? hashToken(validated.value.identifier)
        : validated.value.identifier;
    const limit = await consumeCustomerAuthLimits(
      request,
      "login",
      rateIdentifier,
    );
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

    const credentials =
      validated.value.mode === "slug"
        ? await resolveCustomerBySlug(validated.value.identifier)
        : await resolveCustomerByActiveToken(
            hashToken(validated.value.identifier),
          );

    if (!credentials || credentials.status !== "active") {
      return errorResponse("INVALID_CREDENTIALS", 401);
    }
    if (!credentials.passwordHash) {
      return errorResponse("SETUP_REQUIRED", 409);
    }
    if (
      !(await verifyPassword(validated.value.password, credentials.passwordHash))
    ) {
      return errorResponse("INVALID_CREDENTIALS", 401);
    }

    const now = new Date().toISOString();
    const sessionSecret = createSessionToken();
    await createCustomerSession({
      weddingId: credentials.id,
      sessionId: sessionSecret.id,
      sessionTokenHash: sessionSecret.tokenHash,
      passwordVersion: credentials.passwordVersion,
      now,
    });

    const wedding = await getCustomerWedding(credentials.id);
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
