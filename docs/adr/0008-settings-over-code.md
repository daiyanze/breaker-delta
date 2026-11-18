# 0008 Behavior comes from settings

Date: 2026-11-18. Status: accepted.

## Decision

Run interval, per-group intervals, keywords, wave threshold, half-life,
calm-down rule, "rising" threshold, summary rewrite rule, per-run summary
budget, languages, provider chains and review window are settings stored in
the database, validated by a contract, with defaults in `@bd/contracts`.

The timer fires every 15 minutes and only decides whether a run is due, so
changing the interval needs no deploy.

Two things are not settings: sources are cited by echo ID only, and a review
criterion cannot change once registered.

## Why

Local users must be able to tune the tool without touching code, and the
hosted instance must be tunable without a release.
