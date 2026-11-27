/**
 * `@bd/ui/build` (ADR 0020, section 11): the files the browser loads from
 * `/client/`: `ui.css`, the loader, one module per `*.island.tsx` and their
 * shared chunks (Preact). The only area of `@bd/ui` that may use a Bun API.
 *
 * - Local, from source: the site's local adapter calls `buildClient()` at
 *   start and serves the files from memory.
 * - The executable: `build:local` writes them with
 *   `packages/ui/scripts/write-client.ts` and embeds the folder.
 * - Cloudflare: wrangler's build command writes them to
 *   `apps/web/public/client/`.
 *
 * The build's root is the package folder (`packages/ui`), not the working directory, so the
 * chunk names do not change with where it is run from.
 */
import { basename, join } from "node:path";
import { uiCss } from "../styles/index.ts";

export interface ClientFile {
  /** Under `/client/`: "ui.css", "loader.js", "ThemeSwitch.island.js", "chunk-ab12.js". */
  path: string;
  type: "text/css; charset=utf-8" | "text/javascript; charset=utf-8";
  /** ArrayBuffer-backed, so the DOM's `BodyInit` (which Preact's types bring in) takes it. */
  body: Uint8Array<ArrayBuffer>;
}

const SRC = join(import.meta.dir, "..");
export const LOADER = join(SRC, "runtime", "loader.ts");
const ISLAND_FILE = /^([A-Z][A-Za-z0-9]*)\.island\.tsx$/;

/** Every `*.island.tsx` under `src`, sorted, as absolute paths. */
export async function islandFiles(): Promise<string[]> {
  const found: string[] = [];
  for await (const path of new Bun.Glob("**/*.island.tsx").scan({ cwd: SRC, absolute: true })) {
    if (!ISLAND_FILE.test(basename(path))) {
      throw new Error(`an island's file name is <Name>.island.tsx, letters and digits: ${path}`);
    }
    found.push(path);
  }
  return found.sort();
}

/** The loader and the islands, bundled for the browser with their shared chunks. */
async function scripts(): Promise<ClientFile[]> {
  const result = await Bun.build({
    entrypoints: [LOADER, ...(await islandFiles())],
    root: join(SRC, ".."),
    target: "browser",
    format: "esm",
    splitting: true,
    minify: true,
    naming: { entry: "[name].[ext]", chunk: "chunk-[hash].[ext]" },
  });
  if (!result.success) {
    throw new AggregateError(result.logs, "the client build failed");
  }
  const texts = new Map<string, string>();
  for (const output of result.outputs) {
    texts.set(output.path.replace(/^\.\//, ""), await output.text());
  }
  return [...renameChunks(texts)]
    .map(([path, text]) => ({
      path,
      type: "text/javascript; charset=utf-8" as const,
      body: new TextEncoder().encode(text),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

const CHUNK = /^chunk-([a-z0-9]+)\.js$/;

/**
 * Bun's chunk hashes change with the working directory (Bun 1.4.2), though
 * their bytes do not. Each chunk is renamed after a hash of its own text,
 * once the ids of the chunks it imports are renamed in it, so the names
 * depend on the sources alone. Bun's id is replaced everywhere it appears:
 * the file names in imports and the ids in the loader's preload table.
 */
function renameChunks(texts: Map<string, string>): Map<string, string> {
  const pending = new Set<string>();
  for (const path of texts.keys()) {
    const id = CHUNK.exec(path)?.[1];
    if (id !== undefined) pending.add(id);
  }
  let out = texts;
  while (pending.size > 0) {
    const chunkText = (id: string) => out.get(`chunk-${id}.js`) ?? "";
    const next = [...pending].find((id) =>
      [...pending].every((other) => other === id || !chunkText(id).includes(other)),
    );
    if (next === undefined) throw new Error("the client chunks import each other in a cycle");
    const fresh = Bun.hash(chunkText(next)).toString(36).padStart(13, "0").slice(-8);
    out = new Map(
      [...out].map(([path, text]) => [path.replaceAll(next, fresh), text.replaceAll(next, fresh)]),
    );
    pending.delete(next);
  }
  return out;
}

export async function buildClient(): Promise<readonly ClientFile[]> {
  return [
    { path: "ui.css", type: "text/css; charset=utf-8", body: new TextEncoder().encode(uiCss()) },
    ...(await scripts()),
  ];
}
