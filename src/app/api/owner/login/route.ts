import { NextResponse } from "next/server";
import {
  isOwnerPasswordConfigured,
  setOwnerCookie,
  verifyOwnerPassword,
} from "@/lib/owner-auth";

export async function POST(request: Request) {
  const formData = await request.formData();
  const password = String(formData.get("password") ?? "");
  const redirectUrl = new URL("/owner/upgrades", request.url);

  if (!isOwnerPasswordConfigured()) {
    redirectUrl.searchParams.set("error", "Owner password is not configured.");
    return NextResponse.redirect(redirectUrl, 303);
  }

  if (!verifyOwnerPassword(password)) {
    redirectUrl.searchParams.set("error", "Invalid owner password.");
    return NextResponse.redirect(redirectUrl, 303);
  }

  await setOwnerCookie();
  return NextResponse.redirect(redirectUrl, 303);
}
