import { NextResponse } from "next/server";
import { sessionCookieOptions } from "@/lib/auth";
import { validateActivationRequest } from "@/lib/auth/customer-input";
import {
  activateCustomerWedding,
  claimLegacyCustomerWedding,
  createCustomerSession,
  getActivationTokenState,
  getCustomerWedding,
} from "@/lib/auth/customer-store";
import { hashPassword } from "@/lib/auth/passwords";
import {
  createSessionToken,
  hashActivationKey,
} from "@/lib/auth/session-tokens";
import {
  clearCustomerIdentifierLimit,
  consumeCustomerAuthLimits,
} from "@/lib/auth/rate-limit";
import { toPublicWedding } from "@/lib/public-wedding";
import { createId, hashToken, SESSION_COOKIE_NAME } from "@/lib/security";
import { makeBaseWeddingSlug } from "@/lib/text";

function errorResponse(code: string, status: number) {
  return NextResponse.json(
    { code, message: "The studio could not be opened with those details." },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function sameName(left: string, right: string) {
  return left.trim().toLocaleLowerCase() === right.trim().toLocaleLowerCase();
}

export async function POST(request: Request) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return errorResponse("INVALID_REQUEST", 400);
  }

  const validated = validateActivationRequest(rawBody);
  if (!validated.ok) {
    return errorResponse(validated.code, 400);
  }

  const input = validated.value;
  const tokenHash = hashToken(input.token);

  try {
    const limit = await consumeCustomerAuthLimits(request, "activate", tokenHash);
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

    const tokenState = await getActivationTokenState(tokenHash);
    if (tokenState.state === "missing") {
      return errorResponse("INVALID_CREDENTIALS", 401);
    }

    const now = new Date().toISOString();
    const passwordHash = await hashPassword(input.password);
    const sessionSecret = createSessionToken();
    let weddingId: string;

    if (
      tokenState.state === "active" &&
      tokenState.credentials.passwordHash === null
    ) {
      if (
        !sameName(tokenState.credentials.brideName, input.brideName) ||
        !sameName(tokenState.credentials.groomName, input.groomName)
      ) {
        return errorResponse("INVALID_CREDENTIALS", 401);
      }

      const claimed = await claimLegacyCustomerWedding({
        tokenHash,
        passwordHash,
        eventDate: input.eventDate,
        timezone: input.timezone,
        now,
      });
      await createCustomerSession({
        weddingId: claimed.id,
        sessionId: sessionSecret.id,
        sessionTokenHash: sessionSecret.tokenHash,
        passwordVersion: claimed.passwordVersion,
        now,
      });
      weddingId = claimed.id;
    } else {
      const activated = await activateCustomerWedding({
        tokenHash,
        activationKeyHash: hashActivationKey(input.activationKey),
        weddingId: createId("wed"),
        sessionId: sessionSecret.id,
        sessionTokenHash: sessionSecret.tokenHash,
        passwordHash,
        brideName: input.brideName,
        groomName: input.groomName,
        eventDate: input.eventDate,
        timezone: input.timezone,
        baseSlug: makeBaseWeddingSlug(input.brideName, input.groomName),
        now,
      });
      weddingId = activated.result_wedding_id;
    }

    const wedding = await getCustomerWedding(weddingId);
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
