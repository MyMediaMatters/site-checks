export interface SiteChecksOptions {
  /** Project root to scan for the app router. Defaults to process.cwd(). */
  root?: string;
  /** Skip discovery and test exactly these routes. */
  include?: string[];
  /** Route prefixes to exclude. Overrides the built-in auth-area defaults. */
  exclude?: string[];
  /** Routes to add to discovery — e.g. one instance of a [slug] route. */
  extraRoutes?: string[];
  /** Cap routes tested. Emits a warning naming what was dropped. */
  maxRoutes?: number;
}
export function siteChecks(options?: SiteChecksOptions): void;

export interface SeoChecksOptions extends SiteChecksOptions {
  /** Minimum words inside <main>. Default 150. */
  minWords?: number;
  /** Minimum in-content links to other pages. Default 3. Nav links do not count. */
  minInternalLinks?: number;
  /** Require a parseable JSON-LD block with an @type on every page. Default true. */
  requireJsonLd?: boolean;
  /** JSON-LD @types that must appear on every page, e.g. ["BreadcrumbList"]. */
  requiredTypes?: string[];
  /** Analytics hostname, e.g. "googletagmanager.com". Omit to skip the check. */
  analyticsHost?: string;
  /** Fail if a discovered route is linked to from nowhere else. Default true. */
  checkOrphans?: boolean;
}
export function seoChecks(options?: SeoChecksOptions): void;
