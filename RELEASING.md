# Releasing Breaker Delta

**English** · [中文](RELEASING.zh-CN.md)

One release publishes every distributable form of the project at
once — the engine/CLI, the Agent Skill, and the Chrome extension —
as assets on a GitHub Release.

## Release assets

| Asset | What it is |
|---|---|
| `breaker-delta-<version>.mjs` | The single-file CLI (Node ≥ 20, zero dependencies, executable). This is the "breaker-delta" artifact: engine + CLI in one file |
| `breaker-delta-skill-<version>.zip` | The Agent Skill package: `skills/breaker-delta/SKILL.md`, `.claude-plugin/plugin.json`, and the CLI bundle at `apps/cli/dist/breaker-delta.mjs` — in repo layout, so the paths SKILL.md references work as-is after unzipping |
| `breaker-delta-extension-<ext-version>.zip` | The Chrome extension (unpacked, `manifest.json` at the zip root). Contains no instance data — `data/` holds only the README scaffolding; users add `topics.json` / `alerts.json` as the extension README describes |
| `SHA256SUMS.txt` | SHA-256 checksums for the three assets |

The release body is the matching `## <version>` section of
`CHANGELOG.md`, extracted automatically, plus a Downloads list.

## Versioning

- **One engine version** for the whole monorepo: root `package.json`,
  `packages/{core,fetchers,publisher}`, `apps/cli`, the CLI `VERSION`
  constant (`apps/cli/src/context.ts`), and `.claude-plugin/plugin.json`
  all carry the same `X.Y.Z`. Git tags are `vX.Y.Z`.
- **The extension has its own version line** (`apps/extension/manifest.json`
  = `apps/extension/package.json`), because it changes on its own
  cadence. It is stamped into its asset name, not the release tag.
- `scripts/release.mjs` verifies every stamp before building and
  aborts on any mismatch.

## Cut a release

```bash
# 1. Bump the engine version (skip if the version is already set)
npm run bump -- 0.22.0        # = node scripts/bump.mjs 0.22.0

# 2. Add a `## 0.22.0` section at the top of CHANGELOG.md

# 3. Verify everything locally (full test suite + packaging dry run)
npm test
npm run release               # stages assets into release-dist/
node release-dist/breaker-delta-0.22.0.mjs --help

# 4. Commit, tag, push — pushing the tag triggers the workflow
git commit -am "0.22.0"
git tag v0.22.0
git push origin main v0.22.0
```

The `release` workflow (`.github/workflows/release.yml`) then runs
the full test suite, rebuilds and stages the assets with
`scripts/release.mjs`, and creates the GitHub Release with the
CHANGELOG section as its body.

**Dry run without a release:** trigger the workflow manually
(Actions → release → Run workflow) on any branch. It builds the same
assets and uploads them as a workflow artifact, but never creates a
Release.

## Notes

- Assets are built from the tag's tree; never edit them by hand.
- `release-dist/` is gitignored — it is a staging area, not a source.
- The extension zip deliberately ships without `topics.json` /
  `alerts.json`: those are instance data (they live in data repos
  such as `breaker-delta-data`), and the engine repo — and its
  releases — contain no collected data.
- If the workflow fails on the version check, some stamp was missed:
  run `npm run bump -- <version>` and re-tag.
