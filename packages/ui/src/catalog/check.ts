/**
 * The check that keeps the catalog whole (#258, ADR 0020 section 12): every
 * component folder has a states file, and every states file is in
 * `CATALOG`. Components are found by folder, so one added by another
 * branch fails here until its states are listed. `catalog.test.tsx` runs
 * it on the package's own files.
 */
import type { CatalogEntry } from "./index.ts";

/** `primitives/Band/x.tsx` -> the component folder `primitives/Band`, or null. */
const FOLDER = /^(primitives|patterns)\/([^/]+)\/[^/]+$/;

/**
 * What is wrong with the catalog, given every file under `src` (paths
 * relative to it, `/`-separated). Empty when nothing is.
 */
export function catalogProblems(
  files: readonly string[],
  catalog: readonly CatalogEntry[],
): string[] {
  const folders = new Map<string, { layer: string; name: string; files: Set<string> }>();
  for (const path of files) {
    const found = FOLDER.exec(path);
    if (found === null) continue;
    const [, layer = "", name = ""] = found;
    const key = `${layer}/${name}`;
    const folder = folders.get(key) ?? { layer, name, files: new Set<string>() };
    folder.files.add(path.slice(key.length + 1));
    folders.set(key, folder);
  }
  const problems: string[] = [];
  for (const [key, folder] of [...folders].sort(([a], [b]) => a.localeCompare(b))) {
    if (!folder.files.has(`${folder.name}.states.tsx`)) {
      problems.push(
        `${key} has no ${folder.name}.states.tsx: every component declares its states (issue 258)`,
      );
    } else if (!catalog.some((e) => `${e.layer}/${e.name}` === key)) {
      problems.push(
        `${key}/${folder.name}.states.tsx is not in CATALOG (packages/ui/src/catalog/index.ts)`,
      );
    }
  }
  const seen = new Set<string>();
  for (const e of catalog) {
    // The name keys the page's `data-shot` elements and the screenshots' paths.
    if (seen.has(e.name)) problems.push(`CATALOG lists ${e.name} twice: names must be unique`);
    seen.add(e.name);
    if (!folders.has(`${e.layer}/${e.name}`)) {
      problems.push(`CATALOG lists ${e.layer}/${e.name}, which has no folder`);
    }
    if (e.componentName !== e.name) {
      problems.push(
        `CATALOG's ${e.name} entry renders ${e.componentName}: states from another folder`,
      );
    }
    if (e.states.length === 0) problems.push(`${e.name} declares no states`);
  }
  return problems;
}
