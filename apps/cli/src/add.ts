// plugin add / preset add (Plugin-P3): install a pack from a URL.
//
// The URL points at the pack's primary file — plugin.yaml for a
// plugin, config.yaml for a preset — and every sibling file the
// pack needs resolves relative to it (the shape of a GitHub raw
// directory, which is how packs are shared). Safety rails, per the
// P3 design discussion:
//
//   - https only (http allowed for loopback, for local sharing and
//     tests); redirects may not leave the original host.
//   - Bare filenames only (no paths, no traversal), ≤8 files,
//     ≤256 KiB per file; every file is SHA-256 hashed.
//   - Declarative packs (no code entry) install directly — they
//     are data. Code plugins additionally need --yes: before the
//     flag is given the command prints the manifest's slots and
//     declared permissions plus every file's hash and refuses.
//     A code plugin runs with the engine's trust level, so the
//     confirmation is the user's, not a formality.
//   - Installs are recorded in state/installs.json (source URL,
//     per-file hashes, timestamp); doctor re-verifies the hashes
//     and warns on drift (a hand-edited or swapped file).
//   - Refuses to overwrite an existing pack without --replace.

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { URL } from "node:url";

import { installsFileSchema, validate } from "@breaker-delta/core";
import { parseYaml } from "@breaker-delta/fetchers";

import { RuntimeError, UsageError } from "./commands.js";
import type { CliContext } from "./context.js";
import type { PluginManifestFull } from "./plugins.js";

const MAX_FILES = 8;
const MAX_FILE_BYTES = 256 * 1024;
const BARE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const PRESET_NAME_RE = /^[a-z0-9][a-z0-9-_]*$/;

export interface FetchedFile {
  name: string;
  text: string;
  sha256: string;
}

function isLoopback(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

function checkUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UsageError(`add: not a URL: ${raw}`);
  }
  if (url.protocol === "https:") return url;
  if (url.protocol === "http:" && isLoopback(url.hostname)) return url;
  throw new UsageError(
    `add: only https URLs are accepted (http only for localhost): ${raw}`,
  );
}

/** Fetch one file as text, following ≤3 redirects that stay on the
 *  original host. Returns null on 404 (for optional siblings). */
async function fetchText(
  url: URL,
  originHost: string,
  label: string,
): Promise<string | null> {
  let current = url;
  for (let hop = 0; hop <= 3; hop++) {
    const res = await fetch(current, { redirect: "manual" });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new RuntimeError(`add: ${label}: redirect without a location`);
      const next = new URL(loc, current);
      if (next.host !== originHost) {
        throw new RuntimeError(
          `add: ${label}: redirect leaves the original host (${originHost} → ${next.host}) — refused`,
        );
      }
      if (next.protocol !== current.protocol && !isLoopback(next.hostname)) {
        throw new RuntimeError(`add: ${label}: redirect changes protocol — refused`);
      }
      current = next;
      continue;
    }
    if (res.status === 404) return null;
    if (!res.ok) throw new RuntimeError(`add: ${label}: HTTP ${res.status} for ${current}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_FILE_BYTES) {
      throw new RuntimeError(
        `add: ${label}: ${buf.length} bytes exceeds the ${MAX_FILE_BYTES}-byte per-file cap`,
      );
    }
    return buf.toString("utf-8");
  }
  throw new RuntimeError(`add: ${label}: too many redirects`);
}

function siblingUrl(primary: URL, name: string): URL {
  if (!BARE_NAME_RE.test(name) || name.includes("..")) {
    throw new UsageError(`add: pack references a non-bare filename: ${name}`);
  }
  const url = new URL(primary.href);
  const parts = url.pathname.split("/");
  parts[parts.length - 1] = name;
  url.pathname = parts.join("/");
  return url;
}

async function fetchPack(
  primaryUrl: URL,
  primaryName: string,
  siblingNames: string[],
  optional: Set<string>,
): Promise<FetchedFile[]> {
  const names = [primaryName, ...siblingNames.filter((n) => n !== primaryName)];
  if (names.length > MAX_FILES) {
    throw new RuntimeError(`add: pack wants ${names.length} files, over the ${MAX_FILES}-file cap`);
  }
  const files: FetchedFile[] = [];
  for (const name of names) {
    const text = await fetchText(siblingUrl(primaryUrl, name), primaryUrl.host, name);
    if (text === null) {
      if (optional.has(name)) continue;
      throw new RuntimeError(`add: required file ${name} not found next to ${primaryUrl.href}`);
    }
    files.push({
      name,
      text,
      sha256: crypto.createHash("sha256").update(text, "utf-8").digest("hex"),
    });
  }
  return files;
}

// ------------------------------------------------------------- install record

interface InstallRecord {
  source: string;
  installed_at: string;
  files: Record<string, string>;
}
interface InstallsFile {
  plugins: Record<string, InstallRecord>;
  presets: Record<string, InstallRecord>;
}

function installsPath(ctx: CliContext): string {
  return path.join(ctx.dataDir, "state", "installs.json");
}

export function readInstalls(ctx: CliContext): InstallsFile {
  try {
    const raw = JSON.parse(fs.readFileSync(installsPath(ctx), "utf-8")) as Partial<InstallsFile>;
    return { plugins: raw.plugins ?? {}, presets: raw.presets ?? {} };
  } catch {
    return { plugins: {}, presets: {} };
  }
}

function recordInstall(
  ctx: CliContext,
  kind: "plugins" | "presets",
  id: string,
  source: string,
  files: FetchedFile[],
): void {
  const all = readInstalls(ctx);
  all[kind][id] = {
    source,
    installed_at: new Date().toISOString(),
    files: Object.fromEntries(files.map((f) => [f.name, f.sha256])),
  };
  // Rewrite Phase 0: the install record is a cross-boundary file —
  // never write one that fails its schema.
  const schemaErrors = validate(installsFileSchema, all);
  if (schemaErrors.length > 0) {
    throw new RuntimeError(`installs record failed schema validation: ${schemaErrors[0]}`);
  }
  fs.mkdirSync(path.dirname(installsPath(ctx)), { recursive: true });
  fs.writeFileSync(installsPath(ctx), JSON.stringify(all, null, 2) + "\n", "utf-8");
}

function writePack(dir: string, files: FetchedFile[], replace: boolean): void {
  if (fs.existsSync(dir) && !replace) {
    throw new RuntimeError(
      `add: ${dir} already exists — refusing to overwrite (pass --replace to reinstall)`,
    );
  }
  fs.mkdirSync(dir, { recursive: true });
  for (const f of files) {
    fs.writeFileSync(path.join(dir, f.name), f.text, "utf-8");
  }
}

// ------------------------------------------------------------- plugin add

export interface AddResult {
  kind: "plugin" | "preset";
  id: string;
  dir: string;
  files: FetchedFile[];
  code: boolean;
}

/** Sibling files a plugin pack may need, derived from its manifest:
 *  the panel definition (fixed name), the grading-injection pair
 *  (fixed names), and the code entry. */
function pluginSiblings(manifest: PluginManifestFull): { names: string[]; optional: Set<string> } {
  const names: string[] = [];
  const optional = new Set<string>();
  // Panel packs always pair plugin.yaml with panel.yaml; code-only
  // packs may not have one.
  names.push("panel.yaml");
  if (!manifest.entry) optional.delete("panel.yaml"); // panel plugin: required
  else optional.add("panel.yaml");
  for (const extra of ["prompt.md", "schema.yaml"]) {
    names.push(extra);
    optional.add(extra);
  }
  if (manifest.entry) {
    if (!BARE_NAME_RE.test(manifest.entry) || manifest.entry.includes("..")) {
      throw new UsageError(`add: plugin entry is not a bare filename: ${manifest.entry}`);
    }
    names.push(manifest.entry);
  }
  return { names, optional };
}

export async function addPlugin(
  ctx: CliContext,
  rawUrl: string,
  opts: { yes: boolean; replace: boolean },
): Promise<AddResult> {
  const url = checkUrl(rawUrl);
  const primaryName = decodeURIComponent(url.pathname.split("/").pop() ?? "");
  if (primaryName !== "plugin.yaml") {
    throw new UsageError(
      `add: a plugin URL must point at the pack's plugin.yaml, got: ${primaryName || rawUrl}`,
    );
  }
  const manifestText = await fetchText(url, url.host, "plugin.yaml");
  if (manifestText === null) throw new RuntimeError(`add: plugin.yaml not found at ${rawUrl}`);
  const manifest = (parseYaml(manifestText) ?? {}) as PluginManifestFull;
  if (!manifest.id || !/^[a-z0-9][a-z0-9-_]*$/.test(manifest.id)) {
    throw new RuntimeError(`add: plugin.yaml has no valid id (got: ${String(manifest.id)})`);
  }
  const { names, optional } = pluginSiblings(manifest);
  const files = await fetchPack(url, "plugin.yaml", names, optional);
  const isCode = typeof manifest.entry === "string" && manifest.entry !== "";
  if (isCode && !opts.yes) {
    const perms = manifest.permissions ?? {};
    const lines = [
      `plugin "${manifest.id}" is a CODE plugin (entry: ${manifest.entry}) — it will run with the engine's trust level.`,
      `  slots: ${(manifest.slots ?? []).join(", ") || "(none declared)"}`,
      `  permissions: network=${JSON.stringify(perms.network ?? null)} secrets=${JSON.stringify(perms.secrets ?? null)} write=${JSON.stringify(perms.write ?? null)}`,
      `  files (sha256):`,
      ...files.map((f) => `    ${f.name}  ${f.sha256}`),
      `Re-run with --yes to install it.`,
    ];
    throw new RuntimeError(lines.join("\n"));
  }
  const dir = path.join(ctx.dataDir, "plugins", manifest.id);
  writePack(dir, files, opts.replace);
  recordInstall(ctx, "plugins", manifest.id, rawUrl, files);
  return { kind: "plugin", id: manifest.id, dir, files, code: isCode };
}

// ------------------------------------------------------------- preset add

export async function addPreset(
  ctx: CliContext,
  rawUrl: string,
  opts: { replace: boolean; name?: string },
): Promise<AddResult> {
  const url = checkUrl(rawUrl);
  const primaryName = decodeURIComponent(url.pathname.split("/").pop() ?? "");
  if (!/^config\.(yaml|yml|json)$/.test(primaryName)) {
    throw new UsageError(
      `add: a preset URL must point at the preset's config.yaml, got: ${primaryName || rawUrl}`,
    );
  }
  const segments = url.pathname.split("/").filter(Boolean);
  const derived = decodeURIComponent(segments[segments.length - 2] ?? "");
  const name = opts.name ?? derived;
  if (!PRESET_NAME_RE.test(name)) {
    throw new UsageError(
      `add: cannot derive a valid preset name from the URL (got "${derived}") — pass --name <name>`,
    );
  }
  const files = await fetchPack(url, primaryName, ["brief.md"], new Set(["brief.md"]));
  // Sanity: the config must parse.
  const cfgText = files.find((f) => f.name === primaryName)?.text ?? "";
  if (primaryName.endsWith(".json")) JSON.parse(cfgText);
  else parseYaml(cfgText);
  const dir = path.join(ctx.dataDir, "presets", name);
  writePack(dir, files, opts.replace);
  recordInstall(ctx, "presets", name, rawUrl, files);
  return { kind: "preset", id: name, dir, files, code: false };
}

// ------------------------------------------------------------- doctor support

/** Re-verify recorded installs against the files on disk. */
export function verifyInstalls(
  ctx: CliContext,
): { name: string; status: "ok" | "warn"; detail: string }[] {
  const all = readInstalls(ctx);
  const checks: { name: string; status: "ok" | "warn"; detail: string }[] = [];
  const verify = (kind: "plugins" | "presets", id: string, rec: InstallRecord) => {
    const dir = path.join(ctx.dataDir, kind, id);
    const drift: string[] = [];
    for (const [name, hash] of Object.entries(rec.files)) {
      const file = path.join(dir, name);
      if (!fs.existsSync(file)) {
        drift.push(`${name} missing`);
        continue;
      }
      const now = crypto
        .createHash("sha256")
        .update(fs.readFileSync(file, "utf-8"), "utf-8")
        .digest("hex");
      if (now !== hash) drift.push(`${name} changed`);
    }
    checks.push({
      name: `install ${kind === "plugins" ? "plugin" : "preset"} ${id}`,
      status: drift.length > 0 ? "warn" : "ok",
      detail:
        drift.length > 0
          ? `installed from ${rec.source}, drifted: ${drift.join(", ")} (reinstall with add --replace to restore)`
          : `from ${rec.source}, ${Object.keys(rec.files).length} file(s) match the install hashes`,
    });
  };
  for (const [id, rec] of Object.entries(all.plugins)) verify("plugins", id, rec);
  for (const [id, rec] of Object.entries(all.presets)) verify("presets", id, rec);
  return checks;
}
