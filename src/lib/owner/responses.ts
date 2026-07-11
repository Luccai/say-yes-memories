import { NextResponse } from "next/server";
import {
  deleteOwnerSessionCookies,
  setOwnerSessionCookie,
} from "@/lib/owner/cookies";
import type { OwnerSessionRow } from "@/lib/owner/store";

export type OwnerRequestContext = {
  rawToken: string;
  session: OwnerSessionRow;
};

export function ownerJson(
  request: Request,
  context: OwnerRequestContext,
  body: unknown,
  init?: { status?: number },
) {
  const response = NextResponse.json(body, {
    status: init?.status ?? 200,
    headers: { "Cache-Control": "no-store" },
  });
  setOwnerSessionCookie(response, context.rawToken, request);
  return response;
}

export function ownerUnauthorized() {
  const response = NextResponse.json(
    { code: "OWNER_SESSION_REQUIRED" },
    { status: 401, headers: { "Cache-Control": "no-store" } },
  );
  deleteOwnerSessionCookies(response);
  return response;
}

export function ownerError(code: string, status = 400) {
  return NextResponse.json(
    { code },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
