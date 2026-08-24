# @mmm/site-checks

Shared Playwright checks for My Media Matters sites.

## Install

```bash
npm install -D github:MyMediaMatters/site-checks#v0.1.0 @playwright/test@1.62.1
```

## Use

```ts
// playwright.config.ts
import { defineConfig } from "@playwright/test";
import { mmmConfig } from "@mmm/site-checks/config";

export default defineConfig(mmmConfig());
```

```ts
// tests/site-checks.spec.ts
import { siteChecks } from "@mmm/site-checks";

siteChecks();
```

That is the whole per-repo footprint. There is no `PAGES` array to maintain.

## How routes are found

Routes are derived from the Next.js app router on disk — route groups `(site)`
are unwrapped, dynamic segments `[slug]` are skipped, and auth areas
(`/dashboard`, `/admin`, `/portal`, `/api`, …) are excluded by default.

This is done **synchronously from the filesystem, not by fetching
`/sitemap.xml`**, because Playwright collects tests *before* it starts
`webServer` — nothing that needs the site running is available that early.

Add a page, it gets tested. Nothing to remember.

## Options

| Option | Effect |
|---|---|
| `include` | Skip discovery, test exactly these routes |
| `exclude` | Route prefixes to skip (replaces the auth defaults) |
| `extraRoutes` | Routes to **add** to discovery — use for one instance of a `[slug]` route |
| `maxRoutes` | Cap routes tested; warns naming how many were dropped |
| `root` | Project root to scan (defaults to `process.cwd()`) |

```ts
// a site with auth-gated areas the defaults do not know about
siteChecks({ exclude: ["/dashboard", "/designer", "/sales"] });

// cover one instance of each dynamic route
siteChecks({ extraRoutes: ["/services/concrete", "/locations/enid-concrete"] });
```

Dynamic routes cannot be enumerated from disk — the params do not exist there.
`extraRoutes` adds representative instances **on top of** discovery; `include`
replaces discovery entirely and should be rare.

## Checks

Per route: returns 200 · title (≤60 chars) · meta description (≤160) · exactly
one `h1` · all images have alt text · no console errors.

Once per site: skip-to-content link · `lang` attribute · header nav visible ·
nav links resolve · mobile menu opens · favicon · Open Graph tags.

Conditional: contact-form fields (only if a contact route exists) · footer
privacy link (only if a privacy route exists). A site without those pages is not
failed for lacking them.
