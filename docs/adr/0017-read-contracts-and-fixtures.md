# 0017 Read contracts and fixtures are the site–pipeline interface

Date: 2026-11-21. Status: proposed (issue #162).

## Decision

- The shapes the site reads are Zod schemas in `@bd/contracts`
  (`read.ts` for the public site, `desk.ts` for the desk). They are not the
  tables (#17); they are what a page receives.
- `ReadQueries` and `DeskQueries` fix the query functions. Two
  implementations return the same shapes: `@bd/fixtures` from JSON files
  now, and the database query layer (#57) later. `/api/v1` (#68) serves the
  public read models unchanged.
- `@bd/fixtures` holds three fixture sets (`busy`, `quiet`, `fresh`) built
  from the board sample data, and one list of contract checks. Every
  implementation must pass the same list.
- `apps/web` picks the query layer by configuration (`READ_SOURCE`), so a page
  can be built and previewed with no database and no pipeline.

## Why

Frontend and backend can then be built in either order. A shape change shows
up as a failing contract test on both sides at once, not as a broken page
after deploy.

## Consequence

- Changing a read contract is an architecture change; fixtures and the
  contract test change in the same PR.
- Summary state is a union: published (with optional "unverified" and
  "source text not read" labels, which can show together), withdrawn, or
  none. That covers the five states on the boards.
- Fixtures never hold subscriber addresses or fetched article text; the
  contract test fails on anything that looks like an email address.
