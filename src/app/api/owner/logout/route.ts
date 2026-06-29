import { NextResponse } from "next/server";
import { clearOwnerCookie } from "@/lib/owner-auth";

export async function POST(request: Request) {
  await clearOwnerCookie();
  return NextResponse.redirect(new URL("/owner/upgrades", request.url), 303);
}
