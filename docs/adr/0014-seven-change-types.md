# 0014 Seven change types

Date: 2026-11-21. Status: accepted.

## Decision

The `events` table records seven types: wave formed, rising, summary updated,
corrected, withdrawn, verdict, and went flat. "Went flat" is new: it is
written once when a wave's state becomes flat.

## Why

The front page writes ebb notices and the Changes page lists waves that went
flat. Both need an event, not a state read at render time.

## Consequence

The Changes page shows and filters all seven.
