# Read the site in another language

**What it is.** Each enabled language has its own pages (#107). The enabled
languages and the default are settings (`languages`, read back as
`SiteMeta.languages` and `defaultLanguage`); the fixture sets `busy` and
`fresh` have English, Chinese and Japanese, `quiet` English only. The
interface text comes from the string tables in `apps/web/src/core/strings`.

**How to reach it.** The default language has no prefix (`/`), every other
one is a prefix: `/zh/`, `/ja/`. The language menu at the top of a page
links to the same page in each language. A visit from outside the site to a
page without a prefix is sent by the browser's language.

**Correct looks like:**

- Every page's `<head>` has `<link rel="alternate" hreflang="…">` for each
  enabled language, then `hreflang="x-default"` pointing at the page
  without a prefix; all absolute URLs. `quiet` has `en` and `x-default`
  only, and no menu.
- `get /zh/`: `<html lang="zh">`, Chinese interface text, topic links under
  `/zh/topic/`, the menu with 中文 marked `aria-current="true"`.
- Each menu link opens the same page in that language, with the query
  (`?set=fresh`) kept.
- `curl -H 'Accept-Language: ja' -H 'Sec-Fetch-Site: none' <site>/`: 302 to
  `/ja/`, `Vary: Accept-Language, Sec-Fetch-Site`. With English first, no
  match or no header: the English page. With `Sec-Fetch-Site: same-origin`
  (a link on this site, such as English in the menu): the English page, not
  redirected.
- `/en/` (the default's prefix) and a prefix of a language that is not
  enabled (`/ja/?set=quiet`): 302 to the page without it.
- In a browser at 1440 and 390 wide, light and dark: the menu opens below
  its button, inside the page; no horizontal scrollbar. At 390 the button
  is the globe alone.

**Check it:**

```sh
bun scripts/verify-local.ts up --fixtures busy
bun scripts/verify-local.ts get /zh/
bun scripts/verify-local.ts get /en/
bun scripts/verify-local.ts get "/ja/?set=quiet"
bun scripts/verify-local.ts down
```

`get` follows redirects and sends no `Accept-Language`; check the browser
redirect with `curl -sI` and the headers above against the site URL `up`
prints.

**Edges.** The site only reads; nothing in the database changes.

- A browser that sends no `Sec-Fetch-Site` (Safari before 16.4, some
  embedded webviews) and ranks `zh` or `ja` first is redirected from every
  page without a prefix, every time: choosing English in the menu sends it
  back to its language, and English has no URL it can bookmark. This is the
  cost of redirecting without a cookie (#107, fork 2).
- A redirect's `Location` is always a path on this site: the path after a
  prefix loses extra leading slashes (`/en//host/x` goes to `/host/x`), and
  a path starting with `//` or `/\` and no prefix is a 404.
