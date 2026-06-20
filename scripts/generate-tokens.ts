import { promises as fs } from "node:fs";
import path from "node:path";
import { createPublicToken, hashToken } from "../src/lib/security";

const count = Number(process.argv[2] ?? 1000);
const root = process.cwd();
const localDataDir = path.join(root, ".local-data");
const privateDir = path.join(root, "private");
const tokenSeedPath = path.join(localDataDir, "token-hashes.json");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const csvPath = path.join(privateDir, `say-yes-digital-tokens-${timestamp}.csv`);

if (!Number.isInteger(count) || count <= 0) {
  throw new Error("Token count must be a positive integer.");
}

await fs.mkdir(localDataDir, { recursive: true });
await fs.mkdir(privateDir, { recursive: true });

const rawTokens = new Set<string>();

while (rawTokens.size < count) {
  rawTokens.add(createPublicToken());
}

const now = new Date().toISOString();
const tokenRows = Array.from(rawTokens).map((token, index) => ({
  id: `etsy-token-${String(index + 1).padStart(4, "0")}`,
  token,
  tokenHash: hashToken(token),
  createdAt: now,
}));

await fs.writeFile(
  tokenSeedPath,
  `${JSON.stringify(
    tokenRows.map(({ id, tokenHash, createdAt }) => ({ id, tokenHash, createdAt })),
    null,
    2,
  )}\n`,
  "utf8",
);

const csv = [
  "id,token",
  ...tokenRows.map(({ id, token }) => `${id},${token}`),
].join("\n");

await fs.writeFile(csvPath, `${csv}\n`, "utf8");

console.log(`Generated ${count} tokens.`);
console.log(`Token hashes: ${tokenSeedPath}`);
console.log(`Raw CSV: ${csvPath}`);
