import { defineConfig, devices } from "@playwright/test";

const webServerPort = 4173;
const baseUrl = `http://127.0.0.1:${webServerPort}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 60_000,
  expect: {
    timeout: 5_000,
  },
  reporter: process.env.CI
    ? [["github"], ["junit", { outputFile: "test-results/e2e-static-junit.xml" }], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: baseUrl,
    trace: process.env.CI ? "on-first-retry" : "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1280, height: 720 },
    headless: true,
  },
  webServer: {
    command: `npx --yes http-server dist --port ${webServerPort} --silent`,
    url: baseUrl,
    reuseExistingServer: false,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
