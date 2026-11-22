# 0019 The local agent operates Cloudflare

Date: 2026-11-22. Status: accepted. Amends 0007 and 0016.

## Decision

The local agent may change Breaker Delta's Cloudflare resources with
wrangler: Workers, D1 databases, the R2 bucket, crons, vars and secrets.
This replaces two sentences:

- ADR 0007: "Cloudflare credentials live in protected environments used by
  deploy jobs only."
- ADR 0016: "Only the deploy job holds Cloudflare credentials; the local
  agent never does."

The rest of both ADRs holds.

### Credential

- The agent uses its own **account-owned API token**, not the owner's
  `wrangler login`. The token has only these permissions, on this account:
  - Workers: `Admin` at the Workers product scope. #10 creates the two
    Workers, and creating a Worker needs product-level Admin; `Editor` (the
    legacy Workers Scripts Edit) can only change Workers that exist.
  - D1 Edit, Workers R2 Storage Edit, Account Settings Read.
- After #10 the owner may narrow the Workers permission to `Editor` scoped
  to `bd-pipeline` and `bd-web`. Creating or deleting a Worker then needs
  the owner to widen it again.
- The owner creates, widens and revokes it. It is a separate token from the
  one the deploy job uses, so revoking one does not break the other.
- It lives outside the repository, in a file only the owner's user can read
  (for example `~/.config/breaker-delta/cloudflare.env`, mode 600).
  Wrangler reads it from `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
  An account-owned token cannot read user memberships, so
  `CLOUDFLARE_ACCOUNT_ID` must be set.
- Its value never appears in the repository, in logs, or in issues, PRs or
  chat.
- The permission set has not been checked until #10 runs. If a command
  fails for lack of a permission, the agent stops, names the command and the
  permission, and the owner decides whether to widen the token.
- The token cannot enforce the data rules below. D1 Edit can read and write
  rows, R2 Edit can read and write objects, and the Workers roles can read
  logs and traces. The data rules are rules for the agent.

### Configuration is code

A change to a Worker, a binding, a cron or a var is made in
`wrangler.jsonc` through a PR. Changes made only in the dashboard are not
allowed. Secret values are the exception: they are set with
`wrangler secret put`, and only their names are written down.

### Deploys

Until automatic deploys are on (#12), the agent deploys after the owner
merges, in the same order as `deploy.yml`:

1. a clean checkout of `origin/develop` at the merged commit;
2. `bun install --frozen-lockfile` and `bun run check`;
3. from `apps/pipeline`, `wrangler d1 migrations apply bd-content --remote`,
   but only after the owner says yes to the list of migrations to apply,
   because a migration cannot be undone. If the owner says no, stop: do not
   deploy;
4. deploy `apps/pipeline`;
5. deploy `apps/web`.

After #12, deploying is the deploy job's work. The agent deploys by hand
only for a rollback the owner asks for.

### Data: the agent never sees it and never changes it

The rule, by its effect: **no content of `bd-content`, `bd-private` or
`bd-blobs` reaches the agent's session, and the agent changes none of it
except through migrations, or through an action the owner approved under
"Ask every time".** Production data is touched only by code deployed
through the procedure above.

- `bd-content` holds fetched content (invariant 6).
- `bd-private` holds subscriber data.
- `bd-blobs` holds share cards, snapshots and exports.
- Only `apps/pipeline` writes content (invariant 7), and published rows are
  append-only (invariant 4).

Not allowed, as examples:

- `d1 execute` that reads data rows, or that writes any row (`INSERT`,
  `UPDATE`, `DELETE`);
- `d1 export`;
- `r2 object get`, `r2 object put` and `r2 object delete`;
- `wrangler tail`, and Workers Logs or traces in the dashboard or the API.
  These can carry fetched text once the pipeline fetches. To diagnose a
  production failure, the agent asks the owner to read the logs;
- running Worker code against production resources outside the deploy
  procedure: `wrangler dev --remote` or remote bindings, `versions upload`
  from a branch, or a deploy from any tree other than the merged
  `origin/develop`.

Allowed:

- the schema: `sqlite_master` and `PRAGMA table_info`;
- `SELECT COUNT(*)` on any table;
- these columns only: `runs.slot`, `runs.status`, `runs.started_at`,
  `runs.finished_at`, and `run_steps.slot`, `run_steps.step`,
  `run_steps.status`, `run_steps.attempts`, `run_steps.finished_at`. Never
  `run_steps.output` or `run_steps.error`;
- resource metadata: `d1 info`, `d1 list`, `r2 bucket list`;
- wrangler's own output for the command it ran.

A new table or column is not readable until this list names it.

### Ask every time

Each of these needs the owner's explicit yes in the chat, every time:

- deleting a Worker, a database, a bucket or a secret;
- rolling back a deploy;
- `d1 time-travel restore`;
- applying migrations (see Deploys).

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

- #10 stays labelled `owner:human`. The owner creates the token, then asks
  the agent to do the rest. `/next` does not pick it up.
- Later Cloudflare changes are done by the local agent under these rules.
- If the token is ever exposed, the owner revokes it and creates a new one.

## Amendment (2026-11-22): where the token lives

The token may live in the system keychain as well as in a mode-600 file.
Every wrangler call goes through `scripts/cf.sh`. The script loads the
token for that one command, and it stops when no token is found: wrangler
would otherwise use the owner's stored `wrangler login`. How to store and
use the token is in `docs/development.md`, "Cloudflare credential".
