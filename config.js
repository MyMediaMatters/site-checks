import { discoverRoutes } from "./lib/routes.js";

/**
 * Standard Playwright config for an MMM site.
 * Pass overrides; they are shallow-merged over the defaults.
 */
export function mmmConfig(options = {}) {
  const { baseURL = "http://localhost:3000", webServerCommand = "npm run dev", ...rest } = options;

  return {
    testDir: "./tests",
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: [["html", { open: "never" }]],
    use: {
      baseURL: process.env.PLAYWRIGHT_BASE_URL ?? baseURL,
      trace: "on-first-retry",
      screenshot: "only-on-failure",
    },
    // Skipped when PLAYWRIGHT_BASE_URL points at an already-running site.
    webServer: process.env.PLAYWRIGHT_BASE_URL
      ? undefined
      : {
          command: webServerCommand,
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
    projects: [
      { name: "chromium", use: { browserName: "chromium" } },
      { name: "Mobile Chrome", use: { browserName: "chromium", isMobile: true, hasTouch: true, viewport: { width: 393, height: 851 } } },
    ],
    ...rest,
  };
}

export { discoverRoutes };
