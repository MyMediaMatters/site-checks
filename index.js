import { test, expect } from "@playwright/test";
import { discoverRoutes } from "./lib/routes.js";

const IGNORED_CONSOLE = ["favicon", "analytics", "gtag", "clarity"];

/**
 * Generate the standard MMM site checks.
 *
 * Routes are derived from the app router unless `include` is given. Checks that
 * depend on a page existing (contact form, privacy policy) are only generated
 * when that route is actually present, so a site without one is not failed for
 * lacking it.
 *
 * @param {import("./index.d.ts").SiteChecksOptions} [options]
 */
export function siteChecks(options = {}) {
  const routes = discoverRoutes(options);
  const limited = options.maxRoutes ? routes.slice(0, options.maxRoutes) : routes;

  if (options.maxRoutes && routes.length > options.maxRoutes) {
    // Never truncate silently -- a capped run must not read as full coverage.
    console.warn(
      `[site-checks] Testing ${limited.length} of ${routes.length} routes (maxRoutes=${options.maxRoutes}). ` +
        `${routes.length - limited.length} not covered.`
    );
  }

  const contactRoute = limited.find((r) => /contact/.test(r));
  const privacyRoute = limited.find((r) => /privacy/.test(r));

  // ---- per-route -------------------------------------------------------
  for (const path of limited) {
    test(`page ${path} returns 200`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
    });

    test(`page ${path} has a title`, async ({ page }) => {
      await page.goto(path);
      const title = await page.title();
      expect(title.length).toBeGreaterThan(0);
      expect(title.length).toBeLessThanOrEqual(60);
    });

    test(`page ${path} has a meta description`, async ({ page }) => {
      await page.goto(path);
      const description = await page.locator('meta[name="description"]').getAttribute("content");
      expect(description).toBeTruthy();
      expect(description.length).toBeLessThanOrEqual(160);
    });

    test(`page ${path} has exactly one h1`, async ({ page }) => {
      await page.goto(path);
      expect(await page.locator("h1").count()).toBe(1);
    });

    test(`page ${path} — all images have alt text`, async ({ page }) => {
      await page.goto(path);
      const images = page.locator("img");
      for (let i = 0; i < (await images.count()); i++) {
        expect(await images.nth(i).getAttribute("alt")).not.toBeNull();
      }
    });

    test(`page ${path} has no console errors`, async ({ page }) => {
      const errors = [];
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      await page.goto(path, { waitUntil: "networkidle" });
      expect(errors.filter((e) => !IGNORED_CONSOLE.some((i) => e.includes(i)))).toEqual([]);
    });
  }

  // ---- accessibility ---------------------------------------------------
  test("skip to content link exists", async ({ page }) => {
    await page.goto("/");
    expect(await page.locator('a[href="#main-content"], a[href="#content"]').count()).toBeGreaterThan(0);
  });

  test("page has lang attribute", async ({ page }) => {
    await page.goto("/");
    expect(await page.locator("html").getAttribute("lang")).toBeTruthy();
  });

  // ---- navigation ------------------------------------------------------
  test("header navigation is visible on desktop", async ({ page, isMobile }) => {
    test.skip(!!isMobile, "desktop only");
    await page.goto("/");
    await expect(page.locator("header nav, nav[aria-label]").first()).toBeVisible();
  });

  test("all nav links resolve to real pages", async ({ page }) => {
    await page.goto("/");
    const links = page.locator("header nav a, header a");
    for (let i = 0; i < (await links.count()); i++) {
      const href = await links.nth(i).getAttribute("href");
      if (href?.startsWith("/")) {
        expect((await page.request.get(href)).status(), `nav link ${href}`).toBe(200);
      }
    }
  });

  test("mobile menu opens", async ({ page, isMobile }) => {
    test.skip(!isMobile, "mobile only");
    await page.goto("/");
    const button = page
      .locator('button[aria-label*="menu" i], button[aria-expanded]')
      .first();
    // A site with no mobile menu is a design choice, not a defect.
    test.skip((await button.count()) === 0, "no mobile menu on this site");
    await expect(button).toBeVisible();
    await button.click();
    await expect(page.locator('[role="dialog"], nav').last()).toBeVisible();
  });

  // ---- conditional on the route existing -------------------------------
  if (contactRoute) {
    test("contact form has required fields", async ({ page }) => {
      await page.goto(contactRoute);
      await expect(page.locator('input[name*="name" i], input[placeholder*="name" i]').first()).toBeVisible();
      await expect(page.locator('input[name*="email" i], input[type="email"]').first()).toBeVisible();
      await expect(page.locator('textarea, input[name*="message" i]').first()).toBeVisible();
      await expect(page.locator('button[type="submit"], input[type="submit"]').first()).toBeVisible();
    });
  }

  if (privacyRoute) {
    test("footer links to the privacy policy", async ({ page }) => {
      await page.goto("/");
      await expect(page.locator('footer a[href*="privacy"]').first()).toBeVisible();
    });
  }

  // ---- metadata --------------------------------------------------------
  test("favicon exists", async ({ page }) => {
    await page.goto("/");
    expect(await page.locator('link[rel="icon"], link[rel="shortcut icon"]').count()).toBeGreaterThan(0);
  });

  test("Open Graph tags exist on homepage", async ({ page }) => {
    await page.goto("/");
    expect(await page.locator('meta[property="og:title"]').getAttribute("content")).toBeTruthy();
    expect(await page.locator('meta[property="og:description"]').getAttribute("content")).toBeTruthy();
  });
}
