import type { SiteChecksOptions } from "./index.js";

export interface MmmConfigOptions extends Record<string, unknown> {
  /** Where the suite points. Default http://localhost:3000. */
  baseURL?: string;
  /** How Playwright starts the site. Default `npm run dev`. */
  webServerCommand?: string;
}

/**
 * Standard Playwright config for an MMM site. Extra keys are shallow-merged
 * over the defaults, so passing `projects` replaces the whole browser matrix.
 * Deliberately loose: the return value is handed straight to defineConfig.
 */
export function mmmConfig(options?: MmmConfigOptions): Record<string, unknown>;

export { discoverRoutes } from "./lib/routes.js";
export type { SiteChecksOptions };
