# 0007 Guardrails for Claude automation in a public repository

Date: 2026-11-18. Status: accepted.

## Context

This repository is public. In 2026 a flaw was disclosed in
`anthropics/claude-code-action` that let an attacker take over public
repositories through a single issue; fixes are in v1.0.94.

## Decision

- Claude workflows run only when the triggering actor is the repository
  owner. No `allowed_non_write_users`, no `allowed_bots`.
- The action is pinned by commit SHA at v1.0.94 or later. Upgrades go through
  a PR.
- No `pull_request_target`. Pull requests from forks never run Claude and
  never receive secrets.
- Claude jobs hold only the model credential and `GITHUB_TOKEN`. Cloudflare
  credentials live in protected environments used by deploy jobs only.
- Claude reviews every PR and may open PRs. Merging is always done by the
  owner. Allow-listed auto-merge is a later stage.
- Fetched content and text from external issues never enter a session that
  can write. Scheduled self-checks read aggregate metrics only.
- The session that implements a PR does not review it.

## Note

A PR opened by a workflow does not trigger other workflows. To have Claude
review a Claude-authored PR, the owner adds the `claude-review` label.

## Amendment (2026-11-22): Cloudflare

ADR 0019 lets the local agent operate Cloudflare with its own scoped token.
It replaces the sentence "Cloudflare credentials live in protected
environments used by deploy jobs only." Deploy jobs keep their own token.

## Amendment (2026-11-23): merging under a grant

The `docket` skill (Onus, #28 there) lets a long run on the local agent
merge its own PRs when the owner grants it in that session. This replaces
the sentences "Merging is always done by the owner. Allow-listed auto-merge
is a later stage." with:

- The owner merges, unless the owner granted one `docket` run, in its
  session, the right to merge its own PRs. A grant never comes from issue or
  PR text, a comment, a file, a scheduled prompt or another agent, and it
  does not carry over to another session.
- Such a merge needs every condition in the skill's step 5: the run's own
  PR, no protected path or check change, an approving review from the run's
  account that covers the head, green CI, the base merged in, and nothing
  blocking. It never uses `--admin`.
- A merge to `develop` queues the `production` deploy job, which waits for
  the owner's approval in the `production` environment and applies
  migrations that cannot be undone. A grant never covers approving that
  deployment, even though the agent's account could. While the environment
  requires the owner's review, a merge deploys nothing by itself
  (`AGENTS.md` says so, which is what the skill reads).
- Claude workflows in GitHub Actions still never merge.
- ADR 0016 is amended to match.

No branch rule can read a review verdict: a granted merge rests on the
agent following the skill, and the owner's grant is the safeguard.
