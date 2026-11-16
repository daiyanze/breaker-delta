#!/usr/bin/env bash
# Cloudflare Pages build for the dynamic site (P2c): used by the
# breaker-delta-next preview project and, after the cutover, by the
# breaker-delta production project.
#
# Runs in the DATA repo checkout; the Pages build command clones
# this engine repo into ./engine first:
#   git clone --depth 1 https://github.com/daiyanze/breaker-delta.git engine \
#     && bash engine/scripts/build-pages.sh
#
# Assembles the Pages advanced-mode output into ./site (the vinext
# Worker bundle as _worker.js plus its static chunks, _routes.json
# sending everything but /_next/static/* to the worker).
#
# The Pages API exposes no build-log text, so on failure this
# script still exits 0 and deploys the log as the site's only page
# (site/index.html + site/build-log.txt) — a failed preview build
# is then readable over HTTP instead of being a black box.
set -u
ROOT="$PWD"
LOG="$ROOT/build-log.txt"
exec >"$LOG" 2>&1
set -x

fail() {
  set +x
  echo "BUILD FAILED: $1"
  mkdir -p "$ROOT/site"
  {
    echo "<pre>"
    tail -c 60000 "$LOG" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g'
    echo "</pre>"
  } >"$ROOT/site/index.html"
  cp "$LOG" "$ROOT/site/build-log.txt"
  exit 0
}

cd "$ROOT/engine" || fail "no engine clone"
npm i -g bun || fail "npm i -g bun"
bun install --frozen-lockfile || fail "bun install"
bun run build || fail "bun run build (packages)"
cd apps/web || fail "cd apps/web"
BD_TARGET=cf bun x vite build || fail "vite build (cf target)"
cd "$ROOT" || fail "back to root"
rm -rf site
mkdir site
cp -r engine/apps/web/dist/server/. site/ || fail "assemble output"
mv site/index.js site/_worker.js || fail "worker entry"
printf '{"version":1,"include":["/*"],"exclude":["/_next/static/*"]}' >site/_routes.json
cp "$LOG" site/build-log.txt
set +x
echo "BUILD OK"
