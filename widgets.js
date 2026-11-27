import { test, expect } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { findWidgetIds } from "./lib/widget-ids.js";

export { findWidgetIds };

/**
 * Widget decisions: no embedded widget may disappear from a rebuild without
 * somebody having looked at what it showed.
 *
 * Why this exists: a headless browser measures a Common Ninja widget at 0x0
 * (its content is in shadow DOM), so rebuilds recorded such widgets as "empty"
 * and dropped them. On american-roofing that removed an 8-card roofing-systems
 * grid from /new-roof (found 2026-11-26).
 *
 * How it works: it scans the original Weebly capture (`capture/**\/*.html`) for
 * Common Ninja widget ids. Every id must have an entry in `widgets.json` at the
 * repo root saying what happened to it:
 *
 *   {
 *     "<widget id>": { "decision": "replaced", "page": "/new-roof", "expect": "Thermoplastic Polyolefin" },
 *     "<widget id>": { "decision": "kept" },
 *     "<widget id>": { "decision": "removed", "reason": "...", "evidence": "what a real browser showed, and when" }
 *   }
 *
 *  - replaced: the page must contain the `expect` text (a phrase from the widget's content).
 *  - kept: the built page must still embed the widget.
 *  - removed: needs a `reason` and the `evidence` that it showed nothing worth keeping.
 *
 * Repos with no Common Ninja widget in their capture get no tests from this.
 */

/** @param {import("./widgets.d.ts").WidgetChecksOptions} [options] */
export function widgetChecks(options = {}) {
  const root = options.root ?? process.cwd();
  const ids = findWidgetIds(root, options.captureDir ?? "capture");
  const declFile = join(root, options.declarationFile ?? "widgets.json");
  const decisions = existsSync(declFile) ? JSON.parse(readFileSync(declFile, "utf8")) : {};

  for (const [id, files] of ids) {
    const short = id.slice(0, 8);
    const d = decisions[id];

    test(`Common Ninja widget ${short} has a recorded decision`, () => {
      expect(
        d,
        `Widget ${id} is in the original capture (${[...files][0]}). Add it to widgets.json as replaced, kept or removed. ` +
          `A widget that measures 0x0 in headless Chrome is NOT empty: read its config at ` +
          `https://cdn.commoninja.com/api/v1/embed/${id} or look at it in a real browser first.`,
      ).toBeTruthy();
      expect(["replaced", "kept", "removed"]).toContain(d.decision);
    });

    if (!d) continue;

    if (d.decision === "replaced") {
      test(`Common Ninja widget ${short} replacement shows its content on ${d.page}`, async ({ page }) => {
        expect(d.page && d.expect, "replaced needs `page` and `expect`").toBeTruthy();
        await page.goto(d.page);
        await expect(page.locator("body")).toContainText(d.expect);
      });
    } else if (d.decision === "kept") {
      test(`Common Ninja widget ${short} is still embedded`, async ({ page }) => {
        const pages = d.page ? [d.page] : ["/"];
        let seen = 0;
        for (const p of pages) {
          await page.goto(p);
          seen += await page.locator(`[class*="pid-${id}"]`).count();
        }
        expect(seen, `widget ${id} not found on ${pages.join(", ")}`).toBeGreaterThan(0);
      });
    } else if (d.decision === "removed") {
      test(`Common Ninja widget ${short} removal has a reason and evidence`, () => {
        expect(d.reason, "removed needs a `reason`").toBeTruthy();
        expect(d.evidence, "removed needs `evidence`: what a real browser or the config showed, and when").toBeTruthy();
      });
    }
  }
}
