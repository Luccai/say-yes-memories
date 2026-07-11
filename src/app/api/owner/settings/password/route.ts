import { NextResponse } from "next/server";
import { hashPassword, verifyPassword } from "@/lib/auth/passwords";
import { validateOwnerPasswordChange } from "@/lib/owner/actions";
import { setOwnerSessionCookie } from "@/lib/owner/cookies";
import { ownerRequestMetadata } from "@/lib/owner/request-metadata";
import { ownerError } from "@/lib/owner/responses";
import { authenticateOwnerRoute } from "@/lib/owner/route-auth";
import { createOwnerSessionToken } from "@/lib/owner/session-tokens";
import { changeOwnerPassword, getOwnerCredentials } from "@/lib/owner/store";

export async function POST(request: Request) {
  const auth = await authenticateOwnerRoute(request);
  if (!auth.ok) return auth.response;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return ownerError("INVALID_REQUEST", 400);
  }
  const validated = validateOwnerPasswordChange(rawBody);
  if (!validated.ok) return ownerError(validated.code, 400);

  try {
    const credentials = await getOwnerCredentials();
    if (
      !credentials ||
      credentials.passwordVersion !== auth.context.session.password_version ||
      !(await verifyPassword(
        validated.value.currentPassword,
        credentials.passwordHash,
      ))
    ) {
      return ownerError("INVALID_CURRENT_PASSWORD", 401);
    }

    const nextSession = createOwnerSessionToken();
    const metadata = ownerRequestMetadata(request);
    await changeOwnerPassword({
      actorSessionId: auth.context.session.id,
      expectedPasswordVersion: credentials.passwordVersion,
      passwordHash: await hashPassword(validated.value.password),
      newSessionId: nextSession.id,
      newSessionTokenHash: nextSession.tokenHash,
      deviceLabel: validated.value.deviceLabel,
      userAgentHash: metadata.userAgentHash,
      ipHash: metadata.ipHash,
      operationKey: validated.value.operationKey,
      now: new Date().toISOString(),
    });

    const response = NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
    setOwnerSessionCookie(response, nextSession.rawToken, request);
    return response;
  } catch {
    return ownerError("PASSWORD_CHANGE_FAILED", 503);
  }
}
