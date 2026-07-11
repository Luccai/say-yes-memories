import { validateTokenIssue } from "@/lib/owner/actions";
import { createOwnerAccessToken } from "@/lib/owner/access-tokens";
import { listOwnerTokens } from "@/lib/owner/data";
import { ownerError, ownerJson } from "@/lib/owner/responses";
import { authenticateOwnerRoute } from "@/lib/owner/route-auth";
import { issueOwnerToken } from "@/lib/owner/store";

export async function GET(request: Request) {
  const auth = await authenticateOwnerRoute(request);
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  try {
    return ownerJson(
      request,
      auth.context,
      await listOwnerTokens({
        limit: Number(url.searchParams.get("limit") ?? 100),
        offset: Number(url.searchParams.get("offset") ?? 0),
      }),
    );
  } catch {
    return ownerError("TOKENS_UNAVAILABLE", 503);
  }
}

export async function POST(request: Request) {
  const auth = await authenticateOwnerRoute(request);
  if (!auth.ok) return auth.response;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return ownerError("INVALID_REQUEST", 400);
  }
  const validated = validateTokenIssue(rawBody);
  if (!validated.ok) return ownerError(validated.code, 400);

  try {
    const token = createOwnerAccessToken();
    const stored = await issueOwnerToken({
      actorSessionId: auth.context.session.id,
      tokenId: token.id,
      tokenHash: token.tokenHash,
      label: validated.value.label,
      operationKey: validated.value.operationKey,
      now: new Date().toISOString(),
    });
    if (stored.token_hash !== token.tokenHash) {
      return ownerError("TOKEN_ALREADY_CREATED", 409);
    }
    return ownerJson(request, auth.context, {
      token: {
        id: stored.id,
        rawToken: token.rawToken,
        label: stored.label,
        status: stored.status,
        createdAt: stored.created_at,
      },
    });
  } catch {
    return ownerError("TOKEN_ISSUE_FAILED", 503);
  }
}
