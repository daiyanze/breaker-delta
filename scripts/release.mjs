// Breaker Delta release packaging.
//
// Builds every distributable artifact for one release and stages them
// in release-dist/ (gitignored):
//
//   breaker-delta-<version>.mjs            the single-file CLI bundle
//   breaker-delta-skill-<version>.zip      Skill + plugin manifest + the
//                                          CLI bundle, in repo layout so
//                                          SKILL.md's paths work as-is
//   breaker-delta-extension-<ext>.zip      the Chrome extension (its own
//                                          version line), manifest.json
//                                          at the zip root, ready to load
//                                          or upload to the Web Store
//   SHA256SUMS.txt                         checksums for all of the above
//   RELEASE_NOTES.md                       the CHANGELOG section for this
//                                          version (used as the GitHub
//                                          Release body by the workflow)
//
// Version policy: ONE engine version lives in the root package.json and
// must match packages/{core,fetchers,publisher}, apps/cli, the CLI's
// VERSION constant and .claude-plugin/plugin.json. The extension keeps
// its own version line (manifest.json must equal its package.json).
// Any mismatch aborts the release. Use scripts/bump.mjs to move the
// engine version.
//
// Usage:
//   bun scripts/release.mjs [--version X.Y.Z] [--out DIR] [--skip-tests]
//
// The GitHub workflow (.github/workflows/release.yml) runs this on a
// v* tag and creates the GitHub Release from the staged files.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
function argValue(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}
const skipTests = args.includes("--skip-tests");
const outDir = path.resolve(root, argValue("--out") ?? "release-dist");

function readJson(rel) {
  return JSON.parse(readFileSync(path.join(root, rel), "utf8"));
}
function fail(msg) {
  console.error(`release: error: ${msg}`);
  process.exit(1);
}
function run(cmd, cmdArgs, opts = {}) {
  console.log(`$ ${cmd} ${cmdArgs.join(" ")}`);
  execFileSync(cmd, cmdArgs, { cwd: root, stdio: "inherit", ...opts });
}

// ------------------------------------------------------------ versions

const engineVersion = argValue("--version") ?? readJson("package.json").version;
if (!/^\d+\.\d+\.\d+$/.test(engineVersion)) fail(`bad version "${engineVersion}"`);

const versionChecks = [
  ["package.json", readJson("package.json").version],
  ["packages/core/package.json", readJson("packages/core/package.json").version],
  ["packages/fetchers/package.json", readJson("packages/fetchers/package.json").version],
  ["packages/publisher/package.json", readJson("packages/publisher/package.json").version],
  ["apps/cli/package.json", readJson("apps/cli/package.json").version],
  [".claude-plugin/plugin.json", readJson(".claude-plugin/plugin.json").version],
];
for (const [file, v] of versionChecks) {
  if (v !== engineVersion) fail(`${file} is ${v}, expected ${engineVersion} (run scripts/bump.mjs)`);
}
const cliContext = readFileSync(path.join(root, "apps/cli/src/context.ts"), "utf8");
const cliVersion = cliContext.match(/export const VERSION = "([^"]+)"/)?.[1];
if (cliVersion !== engineVersion) {
  fail(`apps/cli/src/context.ts VERSION is ${cliVersion}, expected ${engineVersion}`);
}

const extManifest = readJson("apps/extension/manifest.json");
const extPkg = readJson("apps/extension/package.json");
if (extManifest.version !== extPkg.version) {
  fail(`extension manifest (${extManifest.version}) != extension package.json (${extPkg.version})`);
}
const extVersion = extManifest.version;

console.log(`release: engine v${engineVersion}, extension v${extVersion}`);

// ------------------------------------------------------------ test + build

if (!skipTests) {
  run("bun", ["run", "test"]);
} else {
  console.log("release: skipping tests (--skip-tests)");
}
run("bun", ["run", "bundle"]); // builds every workspace + the CLI single file

const cliBundle = path.join(root, "apps/cli/dist/breaker-delta.mjs");
if (!existsSync(cliBundle)) fail(`CLI bundle missing: ${cliBundle}`);
const extDist = path.join(root, "apps/extension/dist");
if (!existsSync(path.join(extDist, "manifest.json"))) fail(`extension dist missing: ${extDist}`);

// ------------------------------------------------------------ staging

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const assets = [];

// 1. CLI single file
const cliAsset = `breaker-delta-${engineVersion}.mjs`;
cpSync(cliBundle, path.join(outDir, cliAsset));
chmodSync(path.join(outDir, cliAsset), 0o755);
assets.push(cliAsset);

// 2. Skill package, in repo layout (skills/…, .claude-plugin/…, apps/cli/dist/…)
const skillStage = path.join(outDir, "_skill");
mkdirSync(path.join(skillStage, "skills"), { recursive: true });
cpSync(path.join(root, "skills/breaker-delta"), path.join(skillStage, "skills/breaker-delta"), { recursive: true });
mkdirSync(path.join(skillStage, ".claude-plugin"), { recursive: true });
cpSync(path.join(root, ".claude-plugin/plugin.json"), path.join(skillStage, ".claude-plugin/plugin.json"));
mkdirSync(path.join(skillStage, "apps/cli/dist"), { recursive: true });
cpSync(cliBundle, path.join(skillStage, "apps/cli/dist/breaker-delta.mjs"));
const skillAsset = `breaker-delta-skill-${engineVersion}.zip`;
zipDir(skillStage, path.join(outDir, skillAsset));
rmSync(skillStage, { recursive: true, force: true });
assets.push(skillAsset);

// 3. Extension package: dist contents, manifest at zip root.
//    Excludes the tsc build tree and any instance data JSON (topics /
//    alerts are instance data and never ship in an engine release).
const extStage = path.join(outDir, "_extension");
cpSync(extDist, extStage, {
  recursive: true,
  filter: (src) => {
    const rel = path.relative(extDist, src);
    if (rel.startsWith(`tsc${path.sep}`) || rel === "tsc") return false;
    if (rel === path.join("data", "topics.json") || rel === path.join("data", "alerts.json")) return false;
    return true;
  },
});
const extAsset = `breaker-delta-extension-${extVersion}.zip`;
zipDir(extStage, path.join(outDir, extAsset));
rmSync(extStage, { recursive: true, force: true });
assets.push(extAsset);

// 4. Checksums
const sums = assets
  .map((name) => {
    const hash = createHash("sha256").update(readFileSync(path.join(outDir, name))).digest("hex");
    return `${hash}  ${name}`;
  })
  .join("\n");
writeFileSync(path.join(outDir, "SHA256SUMS.txt"), `${sums}\n`);

// 5. Release notes from CHANGELOG.md (the `## <version>` section)
writeFileSync(path.join(outDir, "RELEASE_NOTES.md"), extractNotes(engineVersion));

console.log("\nstaged release assets:");
for (const name of [...assets, "SHA256SUMS.txt", "RELEASE_NOTES.md"]) {
  const size = statSync(path.join(outDir, name)).size;
  console.log(`  ${name}  (${(size / 1024).toFixed(1)} KiB)`);
}
console.log(`\nrelease: done — v${engineVersion} staged in ${path.relative(root, outDir)}/`);

// ------------------------------------------------------------ helpers

function zipDir(dir, outFile) {
  // Uses the system zip (present on macOS, Linux and GitHub runners).
  // -r recurse, -X strip extra attributes, -q quiet. Zip root = dir's
  // contents, which is what both the skill package and the extension
  // package need.
  try {
    execFileSync("zip", ["-r", "-X", "-q", outFile, "."], { cwd: dir, stdio: "inherit" });
  } catch {
    fail("`zip` command not found or failed — install zip and retry");
  }
  // Sanity: the archive must list at least one entry.
  const listing = execFileSync("zipinfo", ["-1", outFile], { encoding: "utf8" });
  const count = listing.split("\n").filter((l) => l.trim()).length;
  if (!count) fail(`zip produced an empty archive: ${outFile}`);
}

function extractNotes(version) {
  const changelog = readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
  const lines = changelog.split("\n");
  const start = lines.findIndex((l) => l.startsWith(`## ${version}`));
  if (start < 0) {
    return `Breaker Delta v${version}\n\nSee CHANGELOG.md for details.\n`;
  }
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith("## ")) { end = i; break; }
  }
  const section = lines.slice(start + 1, end).join("\n").trim();
  const downloads = [
    "## Downloads",
    "",
    `- \`breaker-delta-${version}.mjs\` — the single-file CLI (Bun ≥ 1.2, no dependencies). Run: \`bun breaker-delta-${version}.mjs --help\``,
    `- \`breaker-delta-skill-${version}.zip\` — the Agent Skill (SKILL.md + plugin manifest + the CLI bundle, in repo layout). Unzip into a workspace and point your agent harness at \`skills/breaker-delta/\`.`,
    `- \`breaker-delta-extension-${extVersion}.zip\` — the Chrome extension (unpacked). Load via \`chrome://extensions/\` → Developer mode → Load unpacked. Ships without instance data; see the extension README for how to add \`topics.json\` / \`alerts.json\`.`,
    "- `SHA256SUMS.txt` — checksums for all assets.",
  ].join("\n");
  return `${section}\n\n${downloads}\n`;
}
