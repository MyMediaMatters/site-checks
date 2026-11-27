import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ID_RE = /commonninja_component[^"'<>]*?pid-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;

function* htmlFiles(dir, depth = 0) {
  if (depth > 5 || !existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) yield* htmlFiles(p, depth + 1);
    else if (/\.html?$/i.test(name) && s.size < 8_000_000) yield p;
  }
}

/** Common Ninja widget ids found in the original capture, with the files they were seen in. */
export function findWidgetIds(root = process.cwd(), captureDir = "capture") {
  const found = new Map();
  for (const file of htmlFiles(join(root, captureDir))) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(ID_RE)) {
      const id = m[1].toLowerCase();
      if (!found.has(id)) found.set(id, new Set());
      found.get(id).add(file.slice(root.length + 1));
    }
  }
  return found;
}
