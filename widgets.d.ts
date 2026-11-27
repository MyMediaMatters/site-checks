export interface WidgetChecksOptions {
  /** Project root. Defaults to process.cwd(). */
  root?: string;
  /** Folder holding the original Weebly capture. Default "capture". */
  captureDir?: string;
  /** Decisions file. Default "widgets.json". */
  declarationFile?: string;
}
export function widgetChecks(options?: WidgetChecksOptions): void;
export function findWidgetIds(root?: string, captureDir?: string): Map<string, Set<string>>;
