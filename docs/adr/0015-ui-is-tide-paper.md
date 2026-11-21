# 0015 UI: Tide Paper, no landing page, "edition" is a display name

Date: 2026-11-21. Status: accepted.

## Decision

- UI components are built from the Tide Paper design system. No third-party
  component library is used (WunderUI, named in the original design, is
  cancelled). Colours, type sizes and spacing come from its tokens.
- There is no separate landing page. `/` is the English front page; the
  explanation of echoes, waves and the 14-day review is on the About page.
- The UI shows each run as an "edition" on a newsstand and lets readers look
  back over the last 7 days. An edition is one run's time slot read back from
  `runs` and `wave_points`. The data model still has no editions (0002) and no
  snapshot store is added. Nothing may assume a 60-minute run interval.
- Interactive parts (newsstand, charts, theme switch, menus, search, the
  cookie choice bar) are client components; pages stay server-rendered.

## Why

The newspaper design is the product's face; a generic component kit would
fight it. Reading editions from data that already exists keeps one source of
truth.
