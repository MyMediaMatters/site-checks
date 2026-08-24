import fs from "node:fs";
import path from "node:path";

/**
 * Derive testable public routes from a Next.js app router directory.
 *
 * Done synchronously and without a running server on purpose: Playwright
 * collects tests BEFORE it starts `webServer`, so anything that needs the site
 * to be up (fetching /sitemap.xml, for instance) cannot run at collection time.
 * The filesystem is the only source available that early.
 */

const PAGE_FILES = ["page.tsx", "page.ts", "page.jsx", "page.js", "page.mdx"];

// Areas that are behind auth or are not standalone pages. Public-site checks
// (meta description, h1, nav) are meaningless here and would fail on a redirect.
const DEFAULT_EXCLUDE = ["/dashboard", "/portal", "/admin", "/embed", "/api", "/login", "/studio"];

function findAppDir(root) {
  for (const c of ["src/app", "app"]) {
    const p = path.join(root, c);
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) return p;
  }
  return null;
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) walk(fp, out);
    else if (PAGE_FILES.includes(e.name)) out.push(fp);
  }
  return out;
}

/** `(marketing)/about/page.tsx` -> `/about`; returns null for dynamic routes. */
function toRoute(appDir, file) {
  const rel = path.relative(appDir, path.dirname(file));
  const segments = rel
    .split(path.sep)
    .filter(Boolean)
    // route groups `(site)` and parallel routes `@modal` are not URL segments
    .filter((s) => !(s.startsWith("(") && s.endsWith(")")))
    .filter((s) => !s.startsWith("@"));

  // `[slug]`, `[...all]` need real params we cannot invent
  if (segments.some((s) => s.includes("[") || s.includes("]"))) return null;

  return "/" + segments.join("/");
}

function matches(route, patterns) {
  return patterns.some((p) => route === p || route.startsWith(p + "/"));
}

/**
 * @param {{root?: string, exclude?: string[], include?: string[]}} [options]
 * @returns {string[]} sorted public routes, always including "/"
 */
export function discoverRoutes(options = {}) {
  const root = options.root ?? process.cwd();
  if (options.include?.length) return [...new Set(options.include)].sort();

  const appDir = findAppDir(root);
  if (!appDir) return ["/"];

  const exclude = options.exclude ?? DEFAULT_EXCLUDE;
  const routes = new Set();

  for (const file of walk(appDir)) {
    const route = toRoute(appDir, file);
    if (route && !matches(route, exclude)) routes.add(route);
  }

  routes.add("/");
  return [...routes].sort();
}

export { DEFAULT_EXCLUDE };
