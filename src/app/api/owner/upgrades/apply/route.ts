import { NextResponse } from "next/server";
import { isOwnerAuthenticated } from "@/lib/owner-auth";
import { applyPremiumExtension } from "@/lib/supabase-store";

export async function POST(request: Request) {
  const redirectUrl = new URL("/owner/upgrades", request.url);

  if (!(await isOwnerAuthenticated())) {
    redirectUrl.searchParams.set("error", "Owner session required.");
    return NextResponse.redirect(redirectUrl, 303);
  }

  const formData = await request.formData();
  const studioCode = String(formData.get("studioCode") ?? "").trim().toUpperCase();
  const etsyOrderNumber = String(formData.get("etsyOrderNumber") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  redirectUrl.searchParams.set("studioCode", studioCode);

  try {
    await applyPremiumExtension({
      studioCode,
      etsyOrderNumber,
      note: note || undefined,
    });
    redirectUrl.searchParams.set("applied", "1");
  } catch (error) {
    redirectUrl.searchParams.set(
      "error",
      error instanceof Error ? error.message : "Premium extension could not be applied.",
    );
  }

  return NextResponse.redirect(redirectUrl, 303);
}
