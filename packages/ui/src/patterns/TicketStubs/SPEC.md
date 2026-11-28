# TicketStubs

## Purpose

Small ticket stubs side by side (#115): the front page's "Were we right?"
band. A list, so a screen reader counts them. Not an island.

## Design

- `design/system/components/TicketStub/README.md` ("首页放三张并排的小票根":
  three small stubs side by side on the front page), board 01
  (`design/boards/Front2.dc.html`).
- Tokens: `space-5` between stubs; each at least two thirds of `rail`
  wide (board 01's 230px) or the whole width: three to a row from a 728px column (board 01 at 1440 wide), two at narrower desktop widths and
  one on phones. A stub left over keeps its column's width.

## Props

- `stubs`: each stub's `TicketStub` props without `size` (always small),
  plus an `id` that keys it (the prediction's id).

## States

- `default`: board 01's three due stubs.
- `one`: one stub, which keeps its column's width.
- `zh`, `ja`: two stubs in each language, whose text sets their height.

## Do not

- Put a large stub in a row: the topic page shows its one large stub alone.
- Cap the count here: the page decides which stubs to show.
