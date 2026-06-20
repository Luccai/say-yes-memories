import { NextResponse } from "next/server";
import { sessionCookieOptions } from "@/lib/auth";
import { activateWedding, createSession } from "@/lib/dev-store";
import { SESSION_COOKIE_NAME } from "@/lib/security";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    brideName?: string;
    groomName?: string;
    token?: string;
  };

  const result = await activateWedding({
    brideName: body.brideName ?? "",
    groomName: body.groomName ?? "",
    token: body.token ?? "",
  });

  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 401 });
  }

  const session = await createSession(result.wedding.id);
  const response = NextResponse.json({ wedding: result.wedding });
  response.cookies.set(SESSION_COOKIE_NAME, session.id, sessionCookieOptions(request));
  return response;
}
