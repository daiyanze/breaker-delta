#!/bin/bash
# Build a Breaker Delta site for Cloudflare Pages from THIS repo's
# data directory. Used by the Direct Upload path (see README.md);
# the git-connected path runs the same steps as a Pages build
# command instead.
#
# Layout expected next to this script (copy the template's files
# into your own data repo root, or run from a checkout):
#   data/            your instance data (config.yaml, editions/, state/)
#                    — override with DATA_DIR=/path/to/data
#   site/            build output (created)
#   engine/          engine checkout (created, reused on re-runs)
set -euo pipefail
cd "$(dirname "$0")"

ENGINE_REPO="${ENGINE_REPO:-https://github.com/daiyanze/breaker-delta.git}"
DATA_DIR="${DATA_DIR:-$PWD/data}"

if [ ! -d engine ]; then
  git clone --depth 1 "$ENGINE_REPO" engine
else
  git -C engine pull --ff-only
fi
cd engine
bun install --frozen-lockfile
bun run bundle
cd ..

bun engine/apps/cli/dist/breaker-delta.mjs \
  --data-dir "$DATA_DIR" --root-dir "$PWD/engine" \
  publish --out "$PWD/site"
echo "Built site/ from $DATA_DIR"
