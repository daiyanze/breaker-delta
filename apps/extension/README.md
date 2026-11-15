# Breaker Delta Echo Catcher — 浪尖雷达 · 收波

**English** · [中文](README.zh-CN.md)

The browser extension for Breaker Delta / 浪尖雷达 (Chrome first,
version 0.6.1). It travels with you while you browse: when you spot
something that might take off, capture it in one click; when you open
a page the radar already tracks, it tells you how high the wave is.

> Privacy in one line: the extension only reads the current page when
> you click, never collects browsing history, and keeps everything in
> your own browser. See "Privacy" below.

## What it does

| Feature | What you get |
|---|---|
| 🌀 One-click echo capture | Click the toolbar icon on any page to save its title, URL, your selected text, and a one-line note into a local echo inbox |
| ✓ Tracked status | The popup immediately shows whether the current page's topic is already tracked by the radar, its heat, and when it was first seen |
| 🌊 Heat badge | On GitHub / Hacker News / Reddit / X / Product Hunt, opening a page that matches a tracked topic shows a badge bar (topic title, heat, first-seen date, link to the topic page); breaking topics get a ⚡ marker |
| ⚡ Alert count | The orange number on the toolbar icon = how many topics are currently breaking out (resonance / surge) |
| 🚀 One-click submit （投波） | Click 投波 on any echo (or 逐条投波 for the whole inbox) and a GitHub "new issue" page opens in the data repo with title, body and label already filled in — you only click Submit. No token needed |
| ⚙ Settings page | Choose the target data repo and instance site, whether capturing opens the submit page immediately, and whether local copies are kept after submitting |
| 📤 Export echoes | Copy the whole inbox as GitHub Issue text, or download it as JSON |

## Install (unpacked, developer mode)

The extension is not on the Chrome Web Store yet; install it as an
unpacked extension.

**Option A — ready-made sideload copy (fastest)**

`~/workspace/breaker-delta-extension/` is a pre-built copy (build
output plus a live data snapshot). Skip to step 2 below and pick that
folder.

**Option B — build from source**

```bash
# from the root of the engine repo daiyanze/breaker-delta
npm run build -w @breaker-delta/extension
```

Output lands in `apps/extension/dist/`. Note: the topic/alert data
(`data/topics.json`, `data/alerts.json`) is instance data and is not
stored in the code repo — after building, copy both files from a site
build or the published site into `dist/data/` as described in
`data/README.md`. Option A's copy already includes a snapshot.

**Load it**

1. Open `chrome://extensions/`
2. Turn on "Developer mode" (top right)
3. Click "Load unpacked" and select the build folder (Option B:
   `apps/extension/dist/`; Option A: the sideload copy folder)
4. The Breaker Delta icon appears in the toolbar; the orange badge
   number is the alert count in the bundled data snapshot (no number
   is shown when there are no alerts)

Pin the extension to the toolbar so capturing takes one click less.

## Usage

### Capture a echo

1. On any page, optionally select the text you find important first
2. Click the toolbar icon — the popup shows the page title and URL;
   if text is selected it tells you "N characters selected, the
   excerpt will be saved with the echo"
3. Optionally add a one-line note: why this looks like a echo
4. Click "🌀 收下这个回波"

The top of the popup also tells you whether this page is already
tracked: if it is, you see the topic title, heat, and first-seen
date, plus a "查看话题" link to the topic page on the site; if not,
it suggests capturing a echo and watching it.

### Echo inbox

The lower half of the popup is your local echo inbox, newest first.
Each echo shows its title, URL, your note, and an excerpt of the
selected text (hover for the full text). Click a title or URL to
reopen the page; delete echoes one by one.

### Submit echoes （投波）

Each echo has a **🌀 投波** button: it opens the data repo's "new
issue" page with the `echo.md` template and the echo's title, URL,
reason and excerpt already filled in (GitHub's documented prefill
parameters). You only review and click **Submit** on GitHub — the
extension never submits for you and needs no token. **🌀 逐条投波**
does the same for every not-yet-submitted echo, one tab each. After
the page opens, the echo is marked "投波页已打开" (or removed, if
you turned off keeping local copies in Settings); the extension
cannot see whether you actually clicked Submit on GitHub, so the
mark means "page opened", not "submitted".

You must be signed in to GitHub with permission to open issues in
the target repo. Very long excerpts are truncated so the prefilled
URL stays within GitHub's length limit.

### Export echoes

- **📋 导出投波 (Export as issue text)**: copies the whole inbox in
  GitHub Issue format — paste it into a new issue in the data repo
  (`breaker-delta-data`) and the echoes enter the radar's scan flow
- **⬇ 下载 JSON (Download JSON)**: downloads all echoes as
  `breaker-delta-echoes.json` for archiving

### Settings

Open via ⚙ 设置 in the popup footer or the extension's "Options"
page: **data repo** (owner/repo receiving submissions, default
`daiyanze/breaker-delta-data`; a full github.com URL also works),
**instance site URL** (topic links + where topics/alerts data is
fetched from — point it at your own instance if you run one),
**open the submit page right after capturing**, and **keep the
local copy after submitting**. Settings live in
`chrome.storage.local` only.

### Heat badge

On the five supported sites, a page whose URL or title matches a
tracked topic gets a badge bar in the bottom-right corner. You can
dismiss it with × (it comes back on reload). The badge only runs on
those five sites; capturing works on any page.

## Where the data comes from, and how to update it

`topics.json` / `alerts.json` are generated by the Breaker Delta site
build from each edition's data and published with the site under
`https://daiyanze.github.io/breaker-delta-data/data/`. Since 0.6.0
the extension **fetches them from the configured instance site** (on
install, on browser startup, and when the popup opens) and caches
them locally; the bundled snapshot is only a fallback when the site
cannot be reached or the cache is empty. You can force a refresh
from the Settings page. The bundled snapshot can still be refreshed
manually by overwriting the two files in the extension folder's
`data/` directory and clicking the reload button on the extension's
card at `chrome://extensions/`. Still no backend, no accounts.

## Permissions (why only these three)

| Permission | Why |
|---|---|
| `activeTab` | Grants temporary access to the current tab only when you click the extension icon — used to read the title, URL, and selected text. The extension cannot touch your pages at any other time |
| `scripting` | Together with `activeTab`, reads the selected text when you capture |
| `storage` | Stores the echo inbox locally in your browser |

The content script (badge) runs only on the five sites listed above,
as declared in the manifest; it is never injected anywhere else. The
extension requests no `tabs`, `history`, `cookies`, or `<all_urls>`
permission. The only network requests the extension ever makes are
downloading `data/topics.json` / `data/alerts.json` from the instance
site configured in Settings (default: the official instance), and
opening GitHub issue pages when you click 投波.

## Privacy

- **No browsing history**: the extension never records which pages
  you visit. On the five sites, the content script compares the
  current page's URL/title against the bundled topic index locally;
  the result never leaves the browser
- **Active actions only**: capturing happens only when you click
  "收下这个回波", and only takes the current page's title, URL, your
  selected text, and your note
- **Local data only**: the echo inbox lives in your browser and is
  never uploaded automatically; exporting is manual and you decide
  where the content goes
- **Downloads only**: the data refresh only ever *downloads* the
  public topics/alerts JSON from your configured instance site; it
  sends nothing anywhere
- **No telemetry, no third-party code**

## Troubleshooting

**The toolbar icon shows no badge number.**
Normal when there are no breaking alerts. Also check that
`data/alerts.json` exists in the extension folder (Option B builds
need it copied in — see Install).

**No heat badge on a page I expected.**
Check in order: ① is the page on one of the five sites? ② is the
topic actually tracked (only snapshot topics get badges)? ③ does
`data/topics.json` exist and is it non-empty? ④ reload the page. If
the topic was tracked recently, refresh the data snapshot first.

**Capturing says the current page cannot be read.**
Protected pages (`chrome://` internals, the Web Store, etc.) cannot
be read — that is a Chrome restriction. Try a normal web page.

**My selected text was not saved.**
Select the text first, then open the popup (if the selection is lost
when the popup opens, there is nothing to read). The popup shows
"N characters selected" when an excerpt will be saved.

**I changed code/data but nothing changed.**
Click the reload (↻) button on the extension's card at
`chrome://extensions/` — data-only changes need a reload too.

**Will I lose my echo inbox?**
It lives in `chrome.storage.local`; uninstalling the extension
clears it. Export important echoes (issue text / JSON) as a backup.

## Data formats

### Echoes (stored under the `echoes` key in `chrome.storage.local`)

Inboxes saved by version 0.4.0 or earlier under the legacy `seeds` key are migrated automatically the first time the popup opens.

```json
{
  "id": "echo-<timestamp>-<random>",
  "title": "Page title",
  "url": "Page URL",
  "selectedText": "Text selected at capture time, may be empty",
  "note": "One-line reason, may be empty",
  "capturedAt": "2026-11-15T00:00:00.000Z",
  "issueOpenedAt": "2026-11-15T01:00:00.000Z (optional, set when the prefilled issue page was opened)"
}
```

Settings are stored under the `settings` key (`dataRepo`,
`siteBase`, `openIssueAfterCapture`, `keepLocalAfterSubmit` — see
`logic.ts` `DEFAULT_SETTINGS`), and the fetched topics/alerts cache
under `dataCache` (`topics`, `alerts`, `fetchedAt`).

The issue-text export uses the same fields as the web submission
form and the GitHub Issue template:

```
标题：…
链接：…
理由：… (falls back to an excerpt of the selected text)
```

### data/topics.json (topic index, used by the badge)

Generated by the site build from the editions (published as
`site/data/topics.json`); copy it into the extension before use (see
`data/README.md` — the file is not stored in this repo). Per topic:

```json
{
  "generated_at": "…",
  "topics": [
    {
      "slug": "topic-page-slug",
      "title": "Topic title",
      "heat": 128,
      "first_seen": "2026-11-13",
      "level": "must",
      "url_patterns": ["github.com/example-org/agent-framework"],
      "title_keywords": ["agent-framework"]
    }
  ]
}
```

Matching rule: the page URL contains any `url_patterns` substring,
or the page title/URL contains any `title_keywords` entry
(case-insensitive).

### data/alerts.json (breaking alerts, used by the toolbar count)

Also generated by the site build. Rules: `resonance` = first seen in
the latest edition with ≥2 independent sources; `surge` = an
already-tracked topic whose heat rose ≥30 against the previous point
(new topics only ever report resonance). Entries carry `topic_slug`,
`title`, `reason`, `heat_before` / `heat_after`, `edition` /
`triggered_at`, and a `dedupe_key` (`slug:reason:edition`). The
background worker fetches both files from the configured instance
site at install/startup into the local `dataCache`, sets the badge
from the cached alerts, and falls back to the bundled snapshot when
the fetch fails; it does not poll on a timer.

## For developers

This directory is the extension's home in the engine repo
(`daiyanze/breaker-delta`, monorepo package `@breaker-delta/extension`).
TypeScript (strict) sources live in `src/`: `logic.ts` holds the pure
logic (page matching, badge count, topic links, echo records,
settings, prefilled issue URLs);
`popup.ts` / `content.ts` / `background.ts` / `options.ts` are the
four entry points. Domain data shapes use `@breaker-delta/core` types — the same
definitions the site publisher uses — so the extension never
re-implements the engine's rules. Build tooling is esbuild (a
devDependency only; the extension itself has zero runtime
dependencies).

```bash
npm run build -w @breaker-delta/extension   # build into dist/
npm test -w @breaker-delta/extension        # logic tests
```

```
apps/extension/
├── manifest.json      # MV3 manifest (permissions + site matches)
├── popup.html / popup.css
├── options.html / options.css   # settings page
├── content.css        # badge bar styles
├── src/               # popup / content / background / logic
├── scripts/bundle.mjs # esbuild bundling + static copy → dist/
├── test/              # node:test suites for logic.ts
├── data/              # topics.json / alerts.json land here (not in git)
├── icons/             # toolbar icons
└── dist/              # build output: a loadable extension folder
```

The icons are simple wave placeholders for now; a brand icon pass
comes later. A Safari build (same WebExtensions code via Xcode) is
planned only after the Chrome version proves itself.
