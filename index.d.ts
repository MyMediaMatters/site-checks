export interface SiteChecksOptions {
  /** Project root to scan for the app router. Defaults to process.cwd(). */
  root?: string;
  /** Skip discovery and test exactly these routes. */
  include?: string[];
  /** Route prefixes to exclude. Overrides the built-in auth-area defaults. */
  exclude?: string[];
  /** Cap routes tested. Emits a warning naming what was dropped. */
  maxRoutes?: number;
}
export function siteChecks(options?: SiteChecksOptions): void;
