# 0003 The model proposes, code decides, sources are IDs

Date: 2026-11-18. Status: accepted.

## Decision

Model calls return structured output validated against a contract. They have
no tools, no network and no database access. Any reference to a source in
model output is an echo ID; code maps IDs to URLs. Wave status, height, rank
and review registration are computed by `packages/core`.

## Why

- A model cannot invent a link or a source if it can only cite IDs.
- Prompt injection in fetched text can at worst spoil one summary or
  misassign one echo.
- Results are reproducible and recomputable from stored echoes.

## Consequence

Three contracts exist: assign, summarize, verdict. Adding a fourth needs a
new ADR.
