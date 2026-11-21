# 0004 One codebase, two run modes

Date: 2026-11-18. Status: superseded by 0018 on 2026-11-21.

## Decision

Local mode and Cloudflare deployment both ship at launch and run the same
Worker code. Locally the code runs in the Workers runtime on the user's
machine: the database is a SQLite file, blobs are a directory, no account is
needed.

## Why

A second orchestrator and a second database driver would double the surface
to maintain and test.

## Constraint this adds

No cloud-only service on the required path. Email, access protection and
hosted models are optional features. How the desk is protected is decided in
0011; how mail is delivered in 0012.

## Fallback

If spike 1 fails, extract runtime interfaces and add a native Bun
implementation. That costs a second implementation and more time.

## Spike 1 result (2026-11-21)

The Workers runtime does run locally through wrangler, with no account and no
network, on Linux, macOS and Windows (`docs/spikes/m0.md`). The approach is
still dropped: it makes Cloudflare's toolchain a requirement of local mode.
0018 replaces it with a native Bun runtime and a Cloudflare adapter.
