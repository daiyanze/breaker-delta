/**
 * The Blobs port on a directory (ADR 0018). A key is a path under `root`;
 * a key the port does not allow is refused, so no key can name a file
 * outside `root`. Writes go to `root/.tmp` first and are renamed into
 * place, so a reader never sees half a file. The content type is not kept:
 * nothing local serves these files over HTTP.
 */
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Blobs } from "@bd/ports";

const SEGMENT = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/;

function checkKey(key: string): string[] {
  const segments = key.split("/");
  if (!segments.every((s) => SEGMENT.test(s))) throw new Error(`invalid blob key: ${key}`);
  return segments;
}

function isMissing(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "ENOENT";
}

/** Every key under `dir`, which is the key prefix `base`. Dot entries are skipped. */
async function walk(dir: string, base: string, out: string[]): Promise<void> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (isMissing(err)) return;
    throw err;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const key = `${base}${entry.name}`;
    if (entry.isDirectory()) await walk(join(dir, entry.name), `${key}/`, out);
    else if (entry.isFile()) out.push(key);
  }
}

export function directoryBlobs(root: string): Blobs {
  const tmp = join(root, ".tmp");
  let next = 0;
  return {
    async get(key) {
      try {
        return new Uint8Array(await readFile(join(root, ...checkKey(key))));
      } catch (err) {
        if (isMissing(err)) return null;
        throw err;
      }
    },
    async put(key, body) {
      const path = join(root, ...checkKey(key));
      await mkdir(dirname(path), { recursive: true });
      await mkdir(tmp, { recursive: true });
      const part = join(tmp, `${process.pid}-${Date.now()}-${next++}`);
      await writeFile(part, body);
      await rename(part, path);
    },
    async delete(key) {
      await rm(join(root, ...checkKey(key)), { force: true });
    },
    async list(prefix) {
      // Walk only the deepest folder the prefix names, then match the rest.
      const cut = prefix.lastIndexOf("/") + 1;
      const base = prefix.slice(0, cut);
      if (base !== "") checkKey(base.slice(0, -1));
      const keys: string[] = [];
      await walk(join(root, ...(base === "" ? [] : base.slice(0, -1).split("/"))), base, keys);
      return keys.filter((k) => k.startsWith(prefix)).sort();
    },
  };
}
