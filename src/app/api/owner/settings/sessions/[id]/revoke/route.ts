import {
  validOwnerResourceId,
  validateSessionRevocation,
} from "@/lib/owner/actions";
import { ownerError, ownerJson } from "@/lib/owner/responses";
import { authenticateOwnerRoute } from "@/lib/owner/route-auth";
import { revokeOwnerDeviceSession } from "@/lib/owner/store";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const auth = await authenticateOwnerRoute(request);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  if (!validOwnerResourceId(id)) return ownerError("INVALID_ID", 400);
  if (id === auth.context.session.id) {
    return ownerError("USE_LOGOUT_FOR_CURRENT_DEVICE", 409);
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return ownerError("INVALID_REQUEST", 400);
  }
  const validated = validateSessionRevocation(rawBody);
  if (!validated.ok) return ownerError(validated.code, 400);

  try {
    const session = await revokeOwnerDeviceSession({
      actorSessionId: auth.context.session.id,
      targetSessionId: id,
      operationKey: validated.value.operationKey,
      now: new Date().toISOString(),
    });
    return ownerJson(request, auth.context, {
      session: {
        id: session.id,
        revokedAt: session.revoked_at,
      },
    });
  } catch {
    return ownerError("SESSION_REVOCATION_FAILED", 503);
  }
}
