# @mmm/site-checks

Shared Playwright checks for My Media Matters sites.

Two suites. `siteChecks()` is the baseline every site gets. `seoChecks()` is the
extra accountability that comes with an SEO retainer — canonicals, structured
data, content depth and the internal link graph. They are separate so a site
that is not on a retainer can run the baseline without inheriting thresholds it
never agreed to.

## Install

```bash
npm install -D github:MyMediaMatters/site-checks#<commit-sha> @playwright/test@^1.62.1
```

Pin the commit SHA, not a branch: `#main` re-resolves on every install, so CI
can start failing on a change nobody made here. Tags are fine where one exists —
check `git ls-remote --tags` before naming one, because the version in
`package.json` moves ahead of the tags.

## Use

```ts
// playwright.config.ts
import { defineConfig } from "@playwright/test";
import { mmmConfig } from "@mmm/site-checks/config";

export default defineConfig(mmmConfig());
```

### Whatever starts the server must be a declared dependency

`mmmConfig` defaults to `npm run dev`. Override `webServerCommand` to run a
binary — `wrangler`, `serve`, `http-server` — and **that binary has to be in the
site's own `devDependencies`**, not merely reachable:

```ts
export default defineConfig(
  mmmConfig({
    baseURL: "http://127.0.0.1:8788",
    webServerCommand: "npx wrangler pages dev .vercel/output/static --port 8788",
  })
);
// package.json must then carry "wrangler" in devDependencies.
```

Leave it undeclared and it still works locally, because some earlier `npx` run
left a binary in `node_modules/.bin`. Then CI installs from the lockfile on a
clean runner and the whole suite dies in three seconds:

```
[WebServer] sh: 1: wrangler: not found
Error: Process from config.webServer was not able to start. Exit code: 127
```

pnpm is where this bites hardest — its strict layout does not hoist transitive
binaries — but npm hoisting is incidental too, not a guarantee. To check before
pushing: `rm -rf node_modules && <pm> install --frozen-lockfile` (npm: `npm ci`),
then confirm `node_modules/.bin/<binary>` exists.

```ts
// tests/site-checks.spec.ts
import { siteChecks } from "@mmm/site-checks";

siteChecks();
```

```ts
// tests/seo-checks.spec.ts — advanced SEO clients only
import { seoChecks } from "@mmm/site-checks";

seoChecks({ analyticsHost: "googletagmanager.com" });
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

## SEO checks

`seoChecks()` shares route discovery with `siteChecks()` and duplicates none of
its checks — `h1`, meta description and image alt text are covered there and are
not repeated here.

Per route: an **absolute** canonical · at least one parseable JSON-LD block with
an `@type` · at least `minWords` words inside `<main>` · at least
`minInternalLinks` in-content links to other pages · analytics loaded (only if
`analyticsHost` is set).

Once per site: canonicals are **unique and share one host** · **no page is
orphaned**.

The orphan check is the reason this suite exists. An orphaned page passes every
single-page check there is — it has a title, an `h1`, a canonical — and crawlers
still reach it late or never, because nothing links to it. Finding one needs the
whole link graph, which no per-page assertion can see. On American Roofing it
caught three case-study pages that every other check passed happily.

Two details worth knowing:

- Links are compared with `.html` stripped. Sites migrated off Weebly or Wix
  keep their indexed `.html` URLs alive as rewrites and link to them in that
  form, while the app router calls the same page `/services`. Without this,
  every such page reads as an orphan.
- The per-route link count is scoped to `<main>`. Header and footer links are on
  every page and say nothing about whether *this* page is wired into the site.
  The orphan check, by contrast, counts links anywhere — a page in the nav is
  not an orphan.

| Option | Default | Effect |
|---|---|---|
| `minWords` | `150` | Minimum words inside `<main>` |
| `minInternalLinks` | `3` | Minimum in-content links to other pages |
| `requireJsonLd` | `true` | Require parseable JSON-LD with an `@type` |
| `requiredTypes` | `[]` | `@type`s that must appear on every page |
| `analyticsHost` | — | e.g. `"googletagmanager.com"`; omit to skip |
| `checkOrphans` | `true` | Fail on a page nothing links to |

`analyticsHost` is matched against the script's **hostname**, never as a
substring of its URL. `src.includes("googletagmanager.com")` reports analytics as
firing for `https://evil.test/?x=googletagmanager.com`, and a check that says yes
for the wrong script is worse than no check.

Route options (`include`, `exclude`, `extraRoutes`, `maxRoutes`, `root`) work
exactly as they do for `siteChecks()`.
