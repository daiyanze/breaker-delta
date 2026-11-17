// Code plugin host (Plugin-P1; design: PLUGINS.md §4B).
//
// The implementation lives in @breaker-delta/plugin-host (Rewrite
// Phase 2a-ii) — the execution half of the one plugin host: seven
// slots (fetcher / exit / score / entities / review / page /
// tools), manifest permission enforcement on the plugin ctx, and
// the edition write-back passes. This module re-exports it under
// the CLI's historical path; the CLI is its only consumer (the web
// app never executes plugin code).

export * from "@breaker-delta/plugin-host";
