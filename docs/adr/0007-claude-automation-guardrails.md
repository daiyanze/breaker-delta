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
