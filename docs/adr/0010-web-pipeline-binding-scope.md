# 0010 What apps/web may ask apps/pipeline to do

Date: 2026-11-21. Status: accepted.

## Decision

The service binding from `apps/web` to `apps/pipeline` carries three groups of
methods, and nothing else:

- subscription: subscribe, confirm, change preferences, unsubscribe;
- share cards: draw and store one card (0009);
- the desk: every write action, and the Mail tab's subscriber actions (look
  up, export, delete, add by hand).

`apps/web` never binds the private database and has no write access to the
content database or to object storage. Subscriber addresses pass through the
desk only for a signed-in editor; they never reach logs, metrics or the public
data export.

## Why

The desk needs to show and manage the mailing list, but the public-facing
Worker must not hold a code path that can read the list on its own.

## Consequence

"Export all" in the Mail tab is a download for the editor. It is separate from
the public data export, which never contains addresses.
