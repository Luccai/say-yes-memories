import { defineConfig } from "playwright/test";

const baseURL = "http://127.0.0.1:3100";

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    locale: "en-US",
    colorScheme: "light",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "bun run start -- -p 3100",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 45_000,
  },
  projects: [
    {
      name: "iphone-se",
      use: { viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true },
    },
    {
      name: "android-360",
      use: { viewport: { width: 360, height: 800 }, hasTouch: true, isMobile: true },
    },
    {
      name: "android-390",
      use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
    },
    {
      name: "desktop",
      use: { viewport: { width: 1440, height: 900 } },
    },
  ],
});
