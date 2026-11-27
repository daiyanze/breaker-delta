# See every component in every state

**What it is.** `/_catalog` (#258, ADR 0020 section 12) shows every
component of `@bd/ui` in every state its `<Name>.states.tsx` declares. A
route of the local adapter only: the Cloudflare adapter answers 404. It
reads no query layer, so it is the same with or without a fixture set.

**How to reach it.** `?theme=light|dark` and `?lang=en|zh|ja` pick the
page (default light, English); the links at its top go to the other five.

**Correct looks like:**

- `get /_catalog`: 200. `get` prints the first 2000 characters from
  `<body>`: "This page: light, English.", the links to the six pages, and a list
  of every component with its layer and state names (`ThemeSwitch
  (primitives): default, long, zh, ja`, `Band (patterns): default, note,
  long, zh, ja`, `LanguageMenu (patterns): default, open, long, zh, ja`,
  `SourceTile (patterns): solid, outline, account, search, mail, code,
  favicon, favicon-solid, favicon-failed, small, long, zh, ja`).
  The rest is in the file `get` saved: `<html lang="en"
  data-theme="light">`, and one section per component with one
  `data-shot="<Name>/<state>"` element per state.
- `get "/_catalog?theme=dark&lang=ja"`: the same, with the page's own
  text in Japanese from the site's string tables ("カタログ", "このページ：
  ダーク、日本語。"); the saved file has `<html lang="ja" data-theme="dark">`.
- `get "/_catalog?theme=light&lang=en&shot=Band/long"`: that one state
  alone, the page the screenshot run captures; an unknown component or
  state, or anything after the state (`Band/long/x`): 404. A shot's
  clip is the state's box, every drawn descendant's box, and every pixel
  of the page more than 8 (in a channel) from its background, rounded out
  to whole pixels: an open LanguageMenu's list below the menu and a focus
  ring outside the button are in the shot (`packages/ui/README.md`).
- `get "/_catalog?theme=sepia"` or `?lang=fr`: 404.
- In a browser: each state rendered with the site's stylesheet; in the
  dark page the paper is dark. The theme switch in the catalog is live
  (an island): clicking it flips the page's theme and stores the choice,
  which the next catalog page then shows instead of its `?theme=`. Clear
  `localStorage["bd-theme"]` to go back.
- `bun run ui:screens` passes against the baselines of its OS, and names
  the components whose shots changed when it fails.

**Check it:**

```sh
bun scripts/verify-local.ts up --fixtures busy   # get prints pages only from a fixture instance
bun scripts/verify-local.ts get /_catalog
bun scripts/verify-local.ts get "/_catalog?theme=dark&lang=ja"
bun scripts/verify-local.ts get "/_catalog?theme=sepia"
bun scripts/verify-local.ts down
```

**Edges.** A component folder without a states file, or a states file not
listed in `packages/ui/src/catalog/index.ts`, fails
`packages/ui/src/catalog/catalog.test.tsx` in `bun run check`.
