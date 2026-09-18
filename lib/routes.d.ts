import type { SiteChecksOptions } from "../index.js";

/** Public routes derived from the Next app router on disk. Always includes "/". */
export function discoverRoutes(options?: SiteChecksOptions): string[];

/** Auth areas and non-page routes skipped unless `exclude` overrides them. */
export const DEFAULT_EXCLUDE: string[];
