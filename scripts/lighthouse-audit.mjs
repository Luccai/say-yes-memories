import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { launch } from "chrome-launcher";
import lighthouse from "lighthouse";
import { chromium } from "playwright";

const root = process.cwd();
const port = 3199;
const origin = `http://127.0.0.1:${port}`;
const outputDir = path.join(root, ".lighthouseci");
const profileDir = path.join(root, `.lighthouse-profile-${process.pid}`);
const targets = [
  { name: "login", url: `${origin}/login` },
  { name: "demo-admin", url: `${origin}/admin/mary-john` },
  { name: "demo-guest", url: `${origin}/mary-john?demo=1` },
];
const thresholds = {
  performance: 0.85,
  accessibility: 0.95,
  lcpMs: 2_500,
  cls: 0.1,
};

async function waitForServer(processHandle) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    if (processHandle.exitCode !== null) {
      throw new Error(`Production server exited with code ${processHandle.exitCode}.`);
    }
    try {
      const response = await fetch(`${origin}/login`, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {
      // Server is still booting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Production server did not become ready for Lighthouse.");
}

function metric(lhr, id) {
  const value = lhr.audits[id]?.numericValue;
  return typeof value === "number" ? value : Number.POSITIVE_INFINITY;
}

function score(lhr, category) {
  const value = lhr.categories[category]?.score;
  return typeof value === "number" ? value : 0;
}

await mkdir(outputDir, { recursive: true });
await mkdir(profileDir, { recursive: true });
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const server = spawn(process.execPath, [nextBin, "start", "-p", String(port)], {
  cwd: root,
  env: process.env,
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});
let serverError = "";
server.stderr?.on("data", (chunk) => {
  serverError = `${serverError}${String(chunk)}`.slice(-4_000);
});

let chrome;
let failed = false;
try {
  await waitForServer(server);
  chrome = await launch({
    chromePath: chromium.executablePath(),
    userDataDir: profileDir,
    chromeFlags: [
      "--headless=new",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });

  for (const target of targets) {
    const result = await lighthouse(target.url, {
      port: chrome.port,
      output: "json",
      logLevel: "error",
      onlyCategories: ["performance", "accessibility"],
      formFactor: "mobile",
      screenEmulation: {
        mobile: true,
        width: 390,
        height: 844,
        deviceScaleFactor: 2,
        disabled: false,
      },
    });
    if (!result) throw new Error(`Lighthouse returned no result for ${target.url}.`);

    const lhr = result.lhr;
    const summary = {
      performance: score(lhr, "performance"),
      accessibility: score(lhr, "accessibility"),
      lcpMs: metric(lhr, "largest-contentful-paint"),
      cls: metric(lhr, "cumulative-layout-shift"),
    };
    await writeFile(
      path.join(outputDir, `${target.name}.json`),
      JSON.stringify(lhr),
      "utf8",
    );

    const checks = [
      summary.performance >= thresholds.performance,
      summary.accessibility >= thresholds.accessibility,
      summary.lcpMs <= thresholds.lcpMs,
      summary.cls <= thresholds.cls,
    ];
    if (checks.includes(false)) failed = true;
    process.stdout.write(
      `${target.name}: performance=${Math.round(summary.performance * 100)}, ` +
        `accessibility=${Math.round(summary.accessibility * 100)}, ` +
        `LCP=${Math.round(summary.lcpMs)}ms, CLS=${summary.cls.toFixed(3)}\n`,
    );
  }
} catch (error) {
  failed = true;
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}${serverError ? `\n${serverError}` : ""}\n`,
  );
} finally {
  if (chrome) {
    try {
      await chrome.kill();
    } catch {
      // A finished Chrome process needs no further cleanup.
    }
  }
  if (server.exitCode === null) server.kill();
  await new Promise((resolve) => setTimeout(resolve, 500));
  await rm(profileDir, { recursive: true, force: true, maxRetries: 3 }).catch(
    () => undefined,
  );
}

if (failed) {
  process.stderr.write(
    "Lighthouse thresholds failed: performance>=85, accessibility>=95, LCP<=2500ms, CLS<=0.1.\n",
  );
  process.exit(1);
}
