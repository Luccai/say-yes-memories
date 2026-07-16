import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { PGlite, type Results } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const databaseUrl = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL;
const root = join(import.meta.dir, "..");
const migrationsDirectory = join(root, "supabase", "migrations");
const contractsDirectory = join(root, "supabase", "tests");
const contractFiles = [
  "secure_upload_contract.sql",
  "daily_maintenance_contract.sql",
  "product_readiness_hardening_contract.sql",
];

async function runAgainstConfiguredDatabase(url: string) {
  const psql = Bun.which("psql");
  if (!psql) {
    throw new Error(
      "psql is required when SUPABASE_DB_URL or DATABASE_URL targets an external database.",
    );
  }

  const contractPath = join(contractsDirectory, "product_ready_contract.sql");
  const processHandle = Bun.spawn(
    [psql, "--set", "ON_ERROR_STOP=1", "--file", contractPath],
    {
      env: { ...process.env, PGDATABASE: url },
      stdin: "ignore",
      stdout: "inherit",
      stderr: "inherit",
    },
  );
  const exitCode = await processHandle.exited;
  if (exitCode !== 0) {
    throw new Error(`External database contract failed with exit code ${exitCode}.`);
  }
}

function printContractResults(results: Results[]) {
  for (const result of results) {
    for (const row of result.rows) {
      if ("result" in row) console.log(JSON.stringify(row.result));
    }
  }
}

async function runInIsolatedPGlite() {
  console.log("No database URL supplied; starting isolated in-memory PostgreSQL.");
  const database = await PGlite.create({
    dataDir: "memory://",
    extensions: { pgcrypto },
  });

  try {
    await database.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create schema extensions;
      create extension pgcrypto with schema extensions;
      set search_path to public, extensions;

      create schema storage;
      create table storage.buckets (
        id text primary key,
        name text not null unique,
        public boolean not null default false,
        file_size_limit bigint,
        allowed_mime_types text[]
      );
    `);

    const migrationFiles = (await readdir(migrationsDirectory))
      .filter((file) => file.endsWith(".sql"))
      .sort();
    for (const file of migrationFiles) {
      console.log(`Applying ${file}`);
      await database.exec(await readFile(join(migrationsDirectory, file), "utf8"));
    }

    await database.exec("begin");
    try {
      for (const file of contractFiles) {
        console.log(`Running ${file}`);
        const results = await database.exec(
          await readFile(join(contractsDirectory, file), "utf8"),
        );
        printContractResults(results);
      }
    } finally {
      await database.exec("rollback");
    }
    console.log("Isolated PostgreSQL migration and contract verification passed.");
  } finally {
    await database.close();
  }
}

try {
  if (databaseUrl) {
    await runAgainstConfiguredDatabase(databaseUrl);
  } else {
    await runInIsolatedPGlite();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
