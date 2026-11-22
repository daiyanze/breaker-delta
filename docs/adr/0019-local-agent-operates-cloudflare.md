# 0019 The local agent operates Cloudflare

Date: 2026-11-22. Status: proposed. Amends 0016.

## Decision

The local agent may change Breaker Delta's Cloudflare resources with
wrangler: Workers, D1 databases, the R2 bucket, crons, vars and secrets.
This replaces 0016's "only the deploy job holds Cloudflare credentials; the
local agent never does". The rest of 0016 holds.

### Credential

- The agent uses its own **account-owned API token**, not the owner's
  `wrangler login`. The token has only these permissions, on this account:
  Workers Scripts Edit, D1 Edit, Workers R2 Storage Edit, and Account
  Settings Read.
- The owner creates and revokes it in the dashboard. It is a separate token
  from the one the deploy job uses, so revoking one does not break the
  other.
- It lives outside the repository, in a file only the owner's user can read
  (for example `~/.config/breaker-delta/cloudflare.env`, mode 600). Wrangler
  reads it from `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
- Its value never appears in the repository, in logs, or in issues, PRs or
  chat.

### What the agent may do

- **Configuration is code.** A change to a Worker, a binding, a cron or a
  var is made in `wrangler.jsonc` through a PR. Changes made only in the
  dashboard are not allowed. Secret values are the exception: they are set
  with `wrangler secret put`, and only their names are written down.
- **Deploys.** Until automatic deploys are on (#12), the agent deploys
  `develop` after the owner merges. After that, deploying is the deploy
  job's work. The agent deploys by hand only for a rollback the owner asks
  for.
- **Schema.** Migrations go to D1 only through
  `wrangler d1 migrations apply`.

### What it may not do

- **Read data rows** of `bd-content` (fetched content: invariant 6) or
  `bd-private` (subscriber data). The agent may read the schema
  (`sqlite_master`, `PRAGMA`), row counts, and the status columns of `runs`
  and `run_steps`, never their error text.
- **Write rows.** No `INSERT`, `UPDATE` or `DELETE` through
  `d1 execute`: only `apps/pipeline` writes (invariant 7), and published
  rows are append-only (invariant 4).
- **Delete or roll back without asking.** Deleting a Worker, a database, a
  bucket or a secret, and rolling back a deploy, each need the owner's
  explicit yes in the chat, every time.

### Record

Every change to Cloudflare is listed, with the commands run, in the issue
or PR it was done for.

## Why

The owner wants the agent to set up and change Cloudflare instead of
running wrangler by hand. A scoped token limits what a mistake can reach.
The data rules keep fetched content and subscriber data out of a session
that writes code. Keeping configuration in the repository leaves every
change reviewable.

## Consequences

- #10 and later Cloudflare changes are done by the local agent.
- The owner creates the agent's token once (#10) and can revoke it at any
  time without affecting CI.
- If the token is ever exposed, the owner revokes it and creates a new one.
