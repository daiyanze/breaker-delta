# DateStrip

## Purpose

The row above the masthead on every public page (#109): a tear-off
calendar, the full date with the issue number and the sea state, the
yellow wave-count tag, and the page's controls (language menu, theme
switch, search). Not an island; the theme switch inside it is one.

## Design

- `design/system/components/DateStrip/README.md`, and boards 01 and 02
  (`design/boards/Front2.dc.html`, `design/boards/FrontMobile.dc.html`);
  the empty and quiet states from boards 17 and 19
  (`design/boards/Empty2.dc.html`, `design/boards/Quiet2.dc.html`).
- Calendar: `red` header with `paper` text, `ink` outline of one and a
  half `rule-thin`, `shadow-paper`, turned -4°. Day in the display face at
  `kicker` size on phones and `clip-headline` size from the two-column
  breakpoint (the board's 22px and 27px; 27px is no token).
- Tag: `sun` with `on-sun` text, `shadow-paper`, turned -2°. The count in
  the display face at `body` size on phones and `kicker` size from the
  breakpoint (the board's 17px and 20px); the second line at `label`.
- Spacing `space-1` to `space-5`; the row is at least `space-8` tall on
  wide screens. Controls are `--control-min-height` square on phones and
  the search icon is `--icon-size` (`src/tokens/supplement.ts`). The
  breakpoint is `TWO_COLUMNS_FROM`.
- On phones the date and its line are read out but not shown, the tag
  shows its short line, and the search link is the icon alone.

## Props

- `month`, `day`: the calendar's header and figure, finished text.
- `date`, `dateTime`: the full date in the page's language, and as
  `YYYY-MM-DD` for `<time datetime>`.
- `line`: the issue number and the sea state, a finished sentence.
- `count`, `note`, `shortNote`: the tag's first line, its second line on
  wide screens, and its second line on phones. The site fills the numbers
  in from the read contracts.
- `search`: the search link's `href` and its name.
- `children`: the controls before the search link, in order: the language
  menu, then the theme switch.

## States

- `default`: board 01, a choppy day.
- `calm`: board 19, a quiet day.
- `flat`: board 17, before the first scan: no waves, the next scan's time.
- `long`: a long month, date, line, tag and labels, so the wrapping is in
  the shot.
- `zh`, `ja`: each language's own date and tag text.

## Do not

- Compute a count, the sea state or the issue number here: they come
  from data, as finished text.
- Hide the date from screen readers on phones: it is clipped, not removed.
- Let the row scroll sideways: it wraps.
