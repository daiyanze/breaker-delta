# 0016 Development runs on a local agent

Date: 2026-11-21. Status: accepted. Amends 0007.

## Decision

Code is written by an agent on the owner's machine, not by a GitHub workflow.
The flow is: branch from `develop`, implement, run `bun run check`, push the
branch, open a PR, CI checks it, the owner merges, and the merge to `develop`
deploys both Workers to Cloudflare.

- `develop` is the default branch. It takes no direct pushes; a red `check`
  blocks the merge, so failing code is never deployed.
- The two Claude workflows stay in the repository but are off. Each runs only
  when its repository variable (`CLAUDE_REVIEW`, `CLAUDE_IMPLEMENT`) is `on`
  and a model secret exists. With both off the repository needs no model
  secret.
- Deploys stay in the protected `production` environment. Only the deploy job
  holds Cloudflare credentials; the local agent never does.

## What still holds from 0007

- The session that implements a PR does not review it. Review is a separate
  local session using `.claude/commands/review.md`, or the review workflow if
  it is switched on.
- Fetched content never enters a session that can write code. On a machine
  that runs both `bun run local` and a coding agent, scan output and
  `.bd-data/` stay out of the coding session.
- Pull requests from forks never run Claude and never receive secrets. No
  `pull_request_target`.
- If a Claude workflow is switched on, it is pinned by commit SHA and runs
  only for the repository owner.

## Why

The owner already runs an agent locally, so a second, hosted copy adds a
secret to manage and a red check on every PR without adding capacity.

## Consequence

Issues labelled `owner:claude-ok` are done by the local agent. Nothing on
GitHub starts work by itself: a label or a comment does not trigger anything
while the workflows are off.
