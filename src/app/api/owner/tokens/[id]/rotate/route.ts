import {
  validOwnerResourceId,
  validateTokenRotation,
} from "@/lib/owner/actions";
import { createOwnerAccessToken } from "@/lib/owner/access-tokens";
import { ownerError, ownerJson } from "@/lib/owner/responses";
import { authenticateOwnerRoute } from "@/lib/owner/route-auth";
import { rotateOwnerToken } from "@/lib/owner/store";

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
  const validated = validateTokenRotation(rawBody);
  if (!validated.ok) return ownerError(validated.code, 400);

  try {
    const token = createOwnerAccessToken();
    const stored = await rotateOwnerToken({
      actorSessionId: auth.context.session.id,
      oldTokenId: id,
      newTokenId: token.id,
      newTokenHash: token.tokenHash,
      label: validated.value.label,
      operationKey: validated.value.operationKey,
      now: new Date().toISOString(),
    });
    if (stored.token_hash !== token.tokenHash) {
      return ownerError("TOKEN_ALREADY_ROTATED", 409);
    }
    return ownerJson(request, auth.context, {
      token: {
        id: stored.id,
        rawToken: token.rawToken,
        label: stored.label,
        status: stored.status,
        weddingId: stored.wedding_id,
        createdAt: stored.created_at,
      },
    });
  } catch {
    return ownerError("TOKEN_ROTATION_FAILED", 503);
  }
}
