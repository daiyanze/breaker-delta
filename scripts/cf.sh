#!/bin/sh
# Run wrangler with the agent's own Cloudflare token (ADR 0019), never with
# the owner's `wrangler login`: if no token is found, it stops instead of
# letting wrangler fall back to a stored login.
#
# Usage: scripts/cf.sh <wrangler arguments>     e.g. scripts/cf.sh whoami
#
# Looks in, in order: the macOS keychain, the Secret Service (Linux
# `secret-tool`), then $BD_CF_ENV (default ~/.config/breaker-delta/cloudflare.env,
# lines CLOUDFLARE_API_TOKEN=... and CLOUDFLARE_ACCOUNT_ID=...). The file is
# read, not sourced. Values are never printed. See docs/development.md.
set -eu

file="${BD_CF_ENV:-$HOME/.config/breaker-delta/cloudflare.env}"
token=""
account=""

if command -v security >/dev/null 2>&1; then
  token="$(security find-generic-password -s breaker-delta-cloudflare-token -w 2>/dev/null || true)"
  account="$(security find-generic-password -s breaker-delta-cloudflare-account -w 2>/dev/null || true)"
elif command -v secret-tool >/dev/null 2>&1; then
  token="$(secret-tool lookup service breaker-delta-cloudflare-token 2>/dev/null || true)"
  account="$(secret-tool lookup service breaker-delta-cloudflare-account 2>/dev/null || true)"
fi

if [ -z "$token" ] && [ -f "$file" ]; then
  token="$(sed -n 's/^CLOUDFLARE_API_TOKEN=//p' "$file")"
  account="$(sed -n 's/^CLOUDFLARE_ACCOUNT_ID=//p' "$file")"
fi

if [ -z "$token" ] || [ -z "$account" ]; then
  echo "scripts/cf.sh: no Cloudflare token or account ID found; not running wrangler." >&2
  echo "See docs/development.md, \"Cloudflare credential\". Ask the owner; never ask for the value in chat." >&2
  exit 1
fi

export CLOUDFLARE_API_TOKEN="$token"
export CLOUDFLARE_ACCOUNT_ID="$account"
exec bun x --bun wrangler "$@"
