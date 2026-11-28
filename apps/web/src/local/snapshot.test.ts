import { describe, expect, test } from "bun:test";
import { createFixtureReadQueries, FIXTURE_SET_NAMES } from "@bd/fixtures";
import { ICON_FILES } from "../core/icon.ts";
import { handle, type SiteVars } from "../select.ts";

// #269: every page and icon file the site renders, byte for byte. Recorded
// before the tokens moved to `@bd/ui`, so the move is shown to change no
// output. #270 changed it on purpose: each page's inline `<style>` became
// one `<link rel="stylesheet" href="/client/ui.css">`. #271 changed it on
// purpose again: pages are rendered by Preact (no line breaks, `&lt;`-style
// escapes, the `.Band` classes). #107 changed it on purpose: strings come
// from the tables, each head has hreflang links, a page with more than one
// language has the language menu, and a language is a path (`/zh/`), not
// `?lang=`; `/en/` redirects to `/`. #272 changed it on purpose: every
// page's head holds the theme script and the island loader, and the front
// page's header the theme switch island. #114 and #119 changed it on
// purpose: the front page's six tallest waves are the three tiers of
// headlines, the lead with the echo stack. #111 changed it on purpose: the
// front page ends with the footer, its form only where mail is on. #120
// changed it on purpose: the front band holds the index island in its right
// rail, every wave a row, in place of the plain list of ranks 7 on. #122
// changed it on purpose: the front page has the fading notices band
// between the front page and the classifieds. #121 changed it on purpose:
// the busy front page has the tide table band after the front band. #123
// changed it on purpose: the front page has the "Were we right?" band
// between the fading notices and the classifieds. #109 changed it on
// purpose: the front page's header opens with the date strip, which holds
// the language menu, the theme switch and the search entry. Update with
// `bun test --update-snapshots`
// purpose: every page's header is the masthead (the mark and the wordmark
// as the `<h1>` link home, the navigation, the wave), and the front page
// opens with the date strip above it. Update with
// `bun test --update-snapshots`
// only when a change to the output is intended, and say so in the PR.

async function render(path: string, vars: SiteVars): Promise<string> {
  const res = await handle(new Request(`http://site${path}`), vars);
  const location = res.headers.get("location");
  const to = location === null ? "" : ` -> ${location}`;
  return `${res.status} ${res.headers.get("content-type")}${to}\n${await res.text()}`;
}

describe("rendered output", () => {
  test("the placeholder site", async () => {
    for (const path of ["/", "/health", "/nope"]) {
      expect(await render(path, {})).toMatchSnapshot(`placeholder ${path}`);
    }
  });

  for (const set of FIXTURE_SET_NAMES) {
    test(`the ${set} fixture set, in every language`, async () => {
      const vars = { READ_SOURCE: "fixtures", FIXTURE_SET: set };
      const { languages } = await createFixtureReadQueries(set).siteMeta();
      const paths = ["/", ...languages.map((l) => `/${l}/`), "/nope"];
      for (const path of paths) {
        expect(await render(path, vars)).toMatchSnapshot(`${set} ${path}`);
      }
    });
  }

  test("an unknown fixture set", async () => {
    const vars = { READ_SOURCE: "fixtures", FIXTURE_SET: "nope" };
    expect(await render("/", vars)).toMatchSnapshot("unknown set");
  });

  test("every icon file", () => {
    for (const f of ICON_FILES) expect(f.source).toMatchSnapshot(f.file);
  });
});
