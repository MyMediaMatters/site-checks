import { test, expect } from "@playwright/test";
import { discoverRoutes } from "./lib/routes.js";

/**
 * SEO / AEO checks.
 *
 * `siteChecks()` covers what a page needs to work: a title, a description, one
 * h1, alt text, no console errors. This covers what a page needs to *rank* and
 * to be quotable by an answer engine: a canonical, structured data, enough
 * content to be worth returning, and a place in the site's link graph.
 *
 * Kept separate from `siteChecks()` on purpose. These are the checks an SEO
 * retainer is accountable for, and a site that is not on a retainer should be
 * able to run the baseline without inheriting thresholds it never agreed to.
 *
 * No check here is duplicated from `siteChecks()` — h1 count, meta description
 * and image alt text live there and are not repeated.
 */

const DEFAULTS = {
  /** Minimum words inside <main>. Below this a page rarely earns a ranking. */
  minWords: 150,
  /** Minimum in-content links to other pages. Nav links do not count. */
  minInternalLinks: 3,
  /** Every page must carry at least one parseable JSON-LD block with an @type. */
  requireJsonLd: true,
  /** JSON-LD @types that must appear on every page, e.g. ["BreadcrumbList"]. */
  requiredTypes: [],
  /** Analytics hostname (e.g. "googletagmanager.com"). Null skips the check. */
  analyticsHost: null,
  /** Fail if a discovered route is linked to from nowhere else on the site. */
  checkOrphans: true,
};

/**
 * `/services.html?x=1#top` -> `/services`.
 *
 * The `.html` suffix is stripped because sites migrated off Weebly/Wix keep
 * their indexed `.html` URLs alive as rewrites and link to them in that form,
 * while the app router calls the same page `/services`. Without this, every
 * such page reads as an orphan.
 */
function normalize(href) {
  const p = href.split("#")[0].split("?")[0].replace(/\.html$/i, "");
  if (p === "" || p === "/") return "/";
  return p.replace(/\/+$/, "");
}

/** Absolute, same-origin or root-relative hrefs, as normalized paths. */
async function linkedPaths(page) {
  const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href")));
  const origin = new URL(page.url()).origin;
  const out = new Set();
  for (const href of hrefs) {
    if (!href) continue;
    let url;
    try {
      url = new URL(href, page.url());
    } catch {
      continue;
    }
    if (url.origin !== origin) continue;
    out.add(normalize(url.pathname));
  }
  return out;
}

/**
 * Generate the SEO / AEO checks. Takes the same route options as `siteChecks`.
 *
 * @param {import("./index.d.ts").SeoChecksOptions} [options]
 */
export function seoChecks(options = {}) {
  const opts = { ...DEFAULTS, ...options };
  const routes = discoverRoutes(options);
  const limited = opts.maxRoutes ? routes.slice(0, opts.maxRoutes) : routes;

  if (opts.maxRoutes && routes.length > opts.maxRoutes) {
    console.warn(
      `[site-checks/seo] Testing ${limited.length} of ${routes.length} routes (maxRoutes=${opts.maxRoutes}). ` +
        `${routes.length - limited.length} not covered.`
    );
  }

  // ---- per-route -------------------------------------------------------
  for (const path of limited) {
    test(`seo ${path} has an absolute canonical URL`, async ({ page }) => {
      await page.goto(path);
      const href = await page.locator("link[rel=canonical]").first().getAttribute("href");
      expect(href, "no <link rel=canonical>").toBeTruthy();
      // A relative canonical is legal HTML and a liability: it resolves against
      // whatever host served the page, so a preview deployment starts claiming
      // canonicity for the client's own URLs.
      expect(href, `canonical is not absolute: ${href}`).toMatch(/^https?:\/\//);
    });

    if (opts.requireJsonLd) {
      test(`seo ${path} has structured data`, async ({ page }) => {
        await page.goto(path);
        const raw = await page.$$eval('script[type="application/ld+json"]', (s) =>
          s.map((n) => n.textContent ?? "")
        );
        expect(raw.length, "no JSON-LD on the page").toBeGreaterThan(0);

        const types = [];
        for (const block of raw) {
          let parsed;
          try {
            parsed = JSON.parse(block);
          } catch (e) {
            // Unparseable JSON-LD is worse than none: it looks present to us
            // and is discarded silently by every consumer that matters.
            throw new Error(`JSON-LD does not parse: ${e.message}`);
          }
          for (const node of [].concat(parsed["@graph"] ?? parsed)) {
            if (node?.["@type"]) types.push(...[].concat(node["@type"]));
          }
        }
        expect(types.length, "JSON-LD present but no @type").toBeGreaterThan(0);
        for (const required of opts.requiredTypes) {
          expect(types, `missing required @type ${required}`).toContain(required);
        }
      });
    }

    test(`seo ${path} has at least ${opts.minWords} words of content`, async ({ page }) => {
      await page.goto(path);
      const main = page.locator("main").first();
      expect(await main.count(), "no <main> landmark").toBeGreaterThan(0);
      const text = (await main.innerText()).split(/\s+/).filter(Boolean);
      expect(text.length).toBeGreaterThanOrEqual(opts.minWords);
    });

    test(`seo ${path} links out to other pages in content`, async ({ page }) => {
      await page.goto(path);
      // Scoped to <main> deliberately. Header and footer links are on every
      // page and say nothing about whether this page is wired into the site.
      const hrefs = await page.$$eval("main a[href]", (as) => as.map((a) => a.getAttribute("href")));
      const self = normalize(path);
      const out = new Set(
        hrefs
          .filter((h) => h?.startsWith("/"))
          .map(normalize)
          .filter((p) => p !== self)
      );
      expect(out.size, `in-content links: ${[...out].join(", ") || "none"}`).toBeGreaterThanOrEqual(
        opts.minInternalLinks
      );
    });

    if (opts.analyticsHost) {
      test(`seo ${path} loads analytics`, async ({ page }) => {
        await page.goto(path);
        const hosts = await page.$$eval("script[src]", (s) => s.map((n) => n.src));
        // Host comparison, never `src.includes(host)`: that matches
        // `https://evil.test/?x=googletagmanager.com` and
        // `https://googletagmanager.com.attacker.test/gtag.js` alike, and a
        // check that reports analytics for the wrong script is worse than none.
        const found = hosts.some((src) => {
          let host;
          try {
            host = new URL(src, page.url()).hostname.toLowerCase();
          } catch {
            return false;
          }
          return host === opts.analyticsHost || host.endsWith("." + opts.analyticsHost);
        });
        expect(found, `no script from ${opts.analyticsHost}`).toBe(true);
      });
    }
  }

  // ---- site-wide -------------------------------------------------------
  test("seo canonicals are unique and share one host", async ({ page }) => {
    const seen = new Map();
    for (const path of limited) {
      await page.goto(path);
      const href = await page.locator("link[rel=canonical]").first().getAttribute("href");
      if (!href) continue; // reported per-route above; not re-failed here
      // Two pages claiming one canonical tells search engines one of them does
      // not exist. Two hosts (www vs apex, or a preview domain) splits the
      // site's authority in half.
      expect(seen.has(href), `canonical ${href} is also on ${seen.get(href)}`).toBe(false);
      seen.set(href, path);
    }
    const hosts = [...new Set([...seen.keys()].map((u) => new URL(u).host))];
    expect(hosts.length, `canonicals point at more than one host: ${hosts.join(", ")}`).toBeLessThanOrEqual(1);
  });

  if (opts.checkOrphans) {
    test("seo no page is orphaned", async ({ page }) => {
      // An orphan is a real page that nothing links to. Every other check
      // passes on one happily -- it has a title, an h1, a canonical -- while
      // crawlers reach it late or never. Found by building the link graph,
      // which no single-page check can do.
      const linkedTo = new Set();
      for (const path of limited) {
        await page.goto(path);
        for (const p of await linkedPaths(page)) {
          if (p !== normalize(path)) linkedTo.add(p);
        }
      }
      const orphans = limited.filter((p) => p !== "/" && !linkedTo.has(normalize(p)));
      expect(orphans, `nothing links to: ${orphans.join(", ")}`).toEqual([]);
    });
  }
}
