# 0002 Echoes stack into waves

Date: 2026-11-18. Status: accepted.

## Decision

Every fetched item is an echo. Echoes about the same thing form a topic. A
topic becomes a wave when its echoes come from at least `waveThreshold`
independent sources (default 2). Wave height is computed from the echoes and
decays over time. There are no tiers and no editions; the site shows a live
board ordered by wave height and a feed of change events.

## Why

Grading by a model was the least reproducible part of the earlier design.
With this model the only judgment a model makes is which topic an echo
belongs to. Everything else is arithmetic that can be tested and recomputed.

## Consequences

- A topic that is not yet a wave is shown as echoes only, with original
  titles and links, and no model-written text.
- Summaries are written when a topic first becomes a wave and rewritten only
  on material change.
- Topic assignment is the critical model task. It gets its own evals and a
  manual correction path (merge, split, reassign) with an audit trail.
- The wave-height formula must keep two properties, enforced by tests: one
  more independent source never lowers the height; with no new echoes the
  height never rises. Coefficients are set in M1 in a follow-up ADR.
