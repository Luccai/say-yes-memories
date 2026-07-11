import { NextResponse } from "next/server";
import { hashPassword } from "@/lib/auth/passwords";
import { setOwnerSessionCookie } from "@/lib/owner/cookies";
import { validateOwnerSetupRequest } from "@/lib/owner/input";
import {
  clearOwnerAuthLimit,
  consumeOwnerAuthLimit,
} from "@/lib/owner/rate-limit";
import { ownerRequestMetadata } from "@/lib/owner/request-metadata";
import { createOwnerSessionToken } from "@/lib/owner/session-tokens";
import { verifyOwnerSetupCode } from "@/lib/owner/setup-secret";
import { getOwnerCredentials, setupOwner } from "@/lib/owner/store";

function errorResponse(code: string, status: number) {
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
    return errorResponse("INVALID_REQUEST", 400);
  }

  const validated = validateOwnerSetupRequest(rawBody);
  if (!validated.ok) {
    return errorResponse(validated.code, 400);
  }

  try {
    if (await getOwnerCredentials()) {
      return errorResponse("SETUP_ALREADY_COMPLETED", 409);
    }

    const limit = await consumeOwnerAuthLimit(request, "setup");
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
    if (!verifyOwnerSetupCode(validated.value.setupCode)) {
      return errorResponse("INVALID_SETUP_CODE", 401);
    }

    const session = createOwnerSessionToken();
    const metadata = ownerRequestMetadata(request);
    await setupOwner({
      passwordHash: await hashPassword(validated.value.password),
      sessionId: session.id,
      sessionTokenHash: session.tokenHash,
      deviceLabel: validated.value.deviceLabel,
      userAgentHash: metadata.userAgentHash,
      ipHash: metadata.ipHash,
      now: new Date().toISOString(),
    });
    await clearOwnerAuthLimit(limit).catch(() => undefined);

    const response = NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
    setOwnerSessionCookie(response, session.rawToken, request);
    return response;
  } catch (error) {
    if (error instanceof Error && error.message.includes("already completed")) {
      return errorResponse("SETUP_ALREADY_COMPLETED", 409);
    }
    return errorResponse("SETUP_UNAVAILABLE", 503);
  }
}
