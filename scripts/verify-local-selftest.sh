#!/usr/bin/env bash
# Runs the verify-local procedure's own steps end to end against the real app:
# up, doctor, drive one mapped feature (the front page from fixtures, plus a
# tick), capture evidence, down. Then checks that cleanup kept the evidence and
# removed the instance. CI runs it in spike-local.yml; it also runs as is.
set -euo pipefail
cd "$(dirname "$0")/.."

v() { bun scripts/verify-local.ts "$@"; }
fail() {
  echo "[selftest] FAIL $*" >&2
  v down || true
  exit 1
}

v up --fixtures busy
v doctor

front="$(v get /)"
# The date strip (#109) opens the page with the edition's day, sea state and counts.
if ! grep -q "No. 323. Sea state: choppy." <<<"$front"; then fail "front page has no date strip line"; fi

v tick
runs="$(v sql "SELECT status FROM runs")"
if ! grep -q '"status": "done"' <<<"$runs"; then fail "no finished run in the database"; fi

state=".verify/current.json"
run_dir="$(bun -e "console.log(JSON.parse(await Bun.file('$state').text()).runDir)")"
pid="$(bun -e "console.log(JSON.parse(await Bun.file('$state').text()).pid)")"
v down

if kill -0 "$pid" 2>/dev/null; then fail "pid $pid still running after down"; fi
if [ -e "$run_dir/data" ]; then fail "data folder left behind"; fi
if [ -e "$state" ]; then fail "state file left behind"; fi
for f in steps.tsv instance.log 01-root.html 02-tick.json 03-sql.json; do
  if [ ! -s "$run_dir/$f" ]; then fail "evidence $f missing after down"; fi
done
echo "[selftest] PASS evidence kept in $run_dir"
