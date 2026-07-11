import { createHmac } from "node:crypto";

function metadataSecret() {
  const value = process.env.AUTH_RATE_LIMIT_SECRET;
  if (!value || Buffer.byteLength(value, "utf8") < 32) {
    throw new Error("AUTH_RATE_LIMIT_SECRET must contain at least 32 bytes.");
  }
  return value;
}

function trustedRequestIp(request: Request) {
  return (
    request.headers.get("x-vercel-forwarded-for") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip")?.trim() ??
    "unknown"
  );
}

function protectedHash(scope: string, value: string) {
  return createHmac("sha256", metadataSecret())
    .update(`${scope}\0${value}`, "utf8")
    .digest("hex");
}

export function ownerRequestMetadata(request: Request) {
  const userAgent = request.headers.get("user-agent")?.slice(0, 512) ?? "unknown";
  const ip = trustedRequestIp(request);

  return {
    userAgentHash: protectedHash("owner-user-agent", userAgent),
    ipHash: protectedHash("owner-ip", ip),
  };
}
