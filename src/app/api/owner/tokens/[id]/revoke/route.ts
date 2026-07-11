import {
  validOwnerResourceId,
  validateTokenRevocation,
} from "@/lib/owner/actions";
import { ownerError, ownerJson } from "@/lib/owner/responses";
import { authenticateOwnerRoute } from "@/lib/owner/route-auth";
import { revokeOwnerToken } from "@/lib/owner/store";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const auth = await authenticateOwnerRoute(request);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  if (!validOwnerResourceId(id)) return ownerError("INVALID_ID", 400);

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return ownerError("INVALID_REQUEST", 400);
  }
  const validated = validateTokenRevocation(rawBody);
  if (!validated.ok) return ownerError(validated.code, 400);

  try {
    const token = await revokeOwnerToken({
      actorSessionId: auth.context.session.id,
      tokenId: id,
      reason: validated.value.reason,
      operationKey: validated.value.operationKey,
      now: new Date().toISOString(),
    });
    return ownerJson(request, auth.context, {
      token: { id: token.id, status: token.status, revokedAt: token.revoked_at },
    });
  } catch {
    return ownerError("TOKEN_REVOCATION_FAILED", 503);
  }
}
