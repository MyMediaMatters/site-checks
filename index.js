import { test, expect } from "@playwright/test";
import { discoverRoutes } from "./lib/routes.js";

// Re-exported so a site can pull both from one place; calling `siteChecks()`
// alone generates no SEO tests.
export { seoChecks } from "./seo.js";

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
      const messages = [];
      page.on("console", (m) => {
        if (m.type() !== "error") return;
        // Record WHERE it came from, not just what it said. A bare message is
        // close to undiagnosable from a CI log.
        messages.push({ text: m.text(), url: m.location()?.url ?? "" });
      });
      await page.goto(path, { waitUntil: "load" });
      // Settle if the page will, but never fail because it will not. This used
      // to be `waitUntil: "networkidle"`, which hung for the full 30s timeout on
      // ASOM's /contact: it embeds a Google Map, and a live map keeps streaming
      // tiles, so the network is never idle. The failure then reported itself as
      // "Test timeout exceeded" on a test named "has no console errors", which
      // is about as misleading as a check can be. Any client site with a map,
      // chat widget or embedded video has the same shape.
      await page.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => {});

      const origin = new URL(page.url()).origin;
      const errors = messages
        // A third-party iframe — a map, a video, a chat widget — logs its own
        // noise into the page's console, and the site owner cannot act on any
        // of it. ASOM's /contact embeds a Google Map that logs
        // "%c%d font-size:0;color:transparent NaN" twice on every load. Only
        // messages from this site's own origin are this site's problem.
        .filter((m) => !m.url || m.url.startsWith(origin))
        .filter((m) => !IGNORED_CONSOLE.some((i) => m.text.includes(i)));

      expect(errors.map((m) => `${m.text}  [${m.url || "no source"}]`)).toEqual([]);
    });
  }

  // ---- accessibility ---------------------------------------------------
  test("skip to content link exists", async ({ page }) => {
    await page.goto("/");
    // `#main` is as common as `#main-content` -- it is the natural id for a
    // <main> landmark -- and only matching the latter two reported a missing
    // skip link on a site that had a working one.
    const skip = page.locator('a[href="#main-content"], a[href="#content"], a[href="#main"]').first();
    expect(await skip.count(), "no skip-to-content link").toBeGreaterThan(0);
    // A skip link pointing at an id nobody kept is the failure worth catching:
    // it is present, it looks right in the markup, and it goes nowhere.
    const target = await skip.getAttribute("href");
    expect(
      await page.locator(`[id="${target.slice(1)}"]`).count(),
      `skip link points at ${target}, which is not on the page`
    ).toBeGreaterThan(0);
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
    // Take the first VISIBLE candidate: a desktop dropdown or search button that is hidden
    // on mobile can precede the hamburger in the DOM and was being picked instead.
    const candidates = page.locator('button[aria-label*="menu" i], button[aria-expanded]');
    let button = candidates.first();
    for (let i = 0; i < (await candidates.count()); i++) {
      if (await candidates.nth(i).isVisible()) {
        button = candidates.nth(i);
        break;
      }
    }
    // A site with no mobile menu is a design choice, not a defect.
    test.skip((await candidates.count()) === 0, "no mobile menu on this site");
    await expect(button).toBeVisible();
    await button.click();
    await expect(page.locator('[role="dialog"], nav').last()).toBeVisible();
  });

  // ---- conditional on the route existing -------------------------------
  if (contactRoute) {
    test("contact form has required fields", async ({ page }) => {
      await page.goto(contactRoute);
      await expect(page.locator('input[name*="name" i], input[name="first"], input[name="full"], input[placeholder*="name" i]').first()).toBeVisible();
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
