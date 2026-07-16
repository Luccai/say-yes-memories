import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { scripts: Record<string, string>; devDependencies: Record<string, string> };
const runner = readFileSync(
  new URL("../scripts/run-db-contract.ts", import.meta.url),
  "utf8",
);

describe("database contract release gate", () => {
  test("runs the database contract during the pre-push check", () => {
    expect(packageJson.scripts.check).toContain("bun run test:db-contract");
    expect(packageJson.scripts["test:db-contract"]).toBe(
      "bun run scripts/run-db-contract.ts",
    );
  });

  test("uses an isolated in-memory PostgreSQL fallback without cloud cost", () => {
    expect(packageJson.devDependencies["@electric-sql/pglite"]).toBe("0.5.4");
    expect(runner).toContain('dataDir: "memory://"');
    expect(runner).toContain("extensions: { pgcrypto }");
    expect(runner).toContain("await readdir(migrationsDirectory)");
    expect(runner).toContain('await database.exec("rollback")');
  });

  test("never silently falls back when an external database was requested", () => {
    expect(runner).toContain("if (databaseUrl)");
    expect(runner).toContain(
      "psql is required when SUPABASE_DB_URL or DATABASE_URL targets an external database.",
    );
  });
});
