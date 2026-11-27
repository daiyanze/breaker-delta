# TicketStubs

## Purpose

Small ticket stubs side by side (#115): the front page's "Were we right?"
band. A list, so a screen reader counts them. Not an island.

## Design

- `design/system/components/TicketStub/README.md` ("首页放三张并排的小票根":
  three small stubs side by side on the front page), board 01
  (`design/boards/Front2.dc.html`).
- Tokens: `space-5` between stubs; each at least two thirds of `rail`
  wide (board 01's 230px), so three fit the content column on desktop and
  a phone has one to a row.

## Props

- `stubs`: each stub's `TicketStub` props without `size` (always small),
  plus an `id` that keys it (the prediction's id).

## States

- `default`: board 01's three due stubs.
- `one`: one stub, which takes the whole row.
- `zh`, `ja`: two stubs in each language, whose text sets their height.

## Do not

- Put a large stub in a row: the topic page shows its one large stub alone.
- Cap the count here: the page decides which stubs to show.
