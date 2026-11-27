import { describe, expect, test } from "bun:test";
import type { ReadQueries } from "@bd/contracts";
import { createFixtureReadQueries } from "@bd/fixtures";
import { createSite } from "../core/site.ts";

// The site core cannot import fixtures (check-deps), so the pages it renders
// from fixture data are checked here. The pages are Preact (#271): the
// renderer writes no line breaks and escapes `<`, `&` and, in attributes, `"`.

/** The front page the site serves from `q`, as HTML; `/` is English, the default. */
async function front(q: ReadQueries | null, lang?: string): Promise<string> {
  const path = lang === undefined || lang === "en" ? "/" : `/${lang}/`;
  return (await createSite(() => q).fetch(new Request(`http://x${path}`))).text();
}

/** The page after its `<head>`, which holds the document's own two scripts (#272). */
const body = (html: string) => html.slice(html.indexOf("</head>"));

describe("every page uses the band", () => {
  const pages = async () => ({
    placeholder: await front(null),
    busy: await front(createFixtureReadQueries("busy")),
    fresh: await front(createFixtureReadQueries("fresh")),
  });

  test("all page content sits in bands inside the page width", async () => {
    for (const [name, html] of Object.entries(await pages())) {
      const body = html.slice(html.indexOf("<body>") + 6, html.indexOf("</body>"));
      const outside = body
        .replace(
          /^<header class="page">(?:<div class="DateStrip">[\s\S]*?<\/a><\/div><\/div>)?<h1>[^<]+<\/h1><\/header>/,
          "",
        )
        .replace(/^<main class="page">(?:<section class="Band"[\s\S]*?<\/section>)+<\/main>$/, "");
      expect({ name, outside }).toEqual({ name, outside: "" });
    }
  });

  test("each page has its heading and its bands, named by their rail headings", async () => {
    const { placeholder, busy, fresh } = await pages();
    expect(placeholder).toContain('<html lang="en">');
    expect(placeholder).toContain("<h1>Breaker Delta</h1>");
    expect(placeholder).toContain('aria-labelledby="band-scaffold"');
    expect(placeholder).toContain("2.0 scaffold. The site arrives in milestone M3.");
    expect(busy).toContain('aria-labelledby="band-front"');
    expect(busy).toContain('<h2 id="band-front" class="Band-name">Front page</h2>');
    expect(busy).toContain('<h2 id="band-classifieds" class="Band-name">Classifieds</h2>');
    expect(busy).toContain("edition. Sea state");
    expect(busy).toContain("16 waves up");
    expect(fresh).toContain('<h2 id="band-front" class="Band-name">The sea is flat.</h2>');
    expect(fresh).toContain("Nothing has been scanned yet. Next scan: ");
  });

  test("the front page holds the theme switch island; the placeholder holds no island, issues 272 and 105", async () => {
    const { placeholder, busy, fresh } = await pages();
    for (const html of [busy, fresh]) {
      expect(html).toContain(
        '<bd-island name="ThemeSwitch" props="{&quot;toDark&quot;:&quot;Switch to dark mode&quot;,&quot;toLight&quot;:&quot;Switch to light mode&quot;}"><button type="button" class="ThemeSwitch">',
      );
      // In the date strip, before the search link (#109).
      expect(html).toContain(
        '<span class="ThemeSwitch-name ThemeSwitch-to-dark">Switch to dark mode</span><span class="ThemeSwitch-name ThemeSwitch-to-light">Switch to light mode</span></button></bd-island><a class="DateStrip-search"',
      );
    }
    // Its names come from the string tables (#107), so they follow the page's language.
    const zh = await front(createFixtureReadQueries("busy"), "zh");
    expect(zh).toContain(
      '<bd-island name="ThemeSwitch" props="{&quot;toDark&quot;:&quot;切换到深色模式&quot;,&quot;toLight&quot;:&quot;切换到浅色模式&quot;}"><button type="button" class="ThemeSwitch">',
    );
    expect(zh).toContain(
      '<span class="ThemeSwitch-name ThemeSwitch-to-dark">切换到深色模式</span><span class="ThemeSwitch-name ThemeSwitch-to-light">切换到浅色模式</span></button></bd-island>',
    );
    expect(placeholder).not.toContain("<bd-island");
    for (const html of [placeholder, busy]) {
      expect(html).toContain('<script type="module" src="/client/loader.js"></script>');
    }
  });
});

// #109: the date strip, from the edition's fields in the site's time zone.
describe("the date strip", () => {
  /** The strip's left part: the calendar, the date and the tag. */
  const when = (html: string) =>
    html.slice(
      html.indexOf('<div class="DateStrip-when">'),
      html.indexOf('<div class="DateStrip-controls">'),
    );

  test("the busy edition: its day, issue number, sea state and counts", async () => {
    const html = await front(createFixtureReadQueries("busy"));
    expect(when(html)).toBe(
      '<div class="DateStrip-when"><span class="DateStrip-calendar" aria-hidden="true"><span class="DateStrip-month">Nov</span><span class="DateStrip-day">19</span></span><span class="DateStrip-text"><time class="DateStrip-date" datetime="2026-11-19">Thursday, November 19, 2026</time><span class="DateStrip-line">No. 323. Sea state: choppy.</span></span><span class="DateStrip-tag"><strong class="DateStrip-count">16 waves up</strong><span class="DateStrip-note">5 new today, scanned 14:00</span><span class="DateStrip-short">5 new today</span></span></div>',
    );
  });

  test("the counts and the sea state come from the edition", async () => {
    const base = createFixtureReadQueries("quiet");
    const plain = await base.edition();
    if (plain === null) throw new Error("quiet has an edition");
    const html = await front(base);
    expect(when(html)).toContain("Sea state: calm.");
    expect(when(html)).toContain(">2 waves up<");
    expect(when(html)).toContain(">1 new today, scanned 14:00<");
    const one = { ...plain, waveCount: 1, formedToday: 3, seaState: "moderate" as const };
    const changed = await front({ ...base, edition: async () => one });
    expect(when(changed)).toContain("Sea state: moderate.");
    expect(when(changed)).toContain(">1 wave up<");
    expect(when(changed)).toContain(">3 new today<");
  });

  test("before the first scan: the next run's day, a flat sea, no waves, the first scan's time", async () => {
    const html = await front(createFixtureReadQueries("fresh"), "zh");
    expect(when(html)).toContain('<span class="DateStrip-month">11月</span>');
    expect(when(html)).toContain('datetime="2026-11-19"');
    expect(when(html)).toContain("第 323 期。海况：无浪。");
    expect(when(html)).toContain(">0 个浪<");
    expect(when(html)).toContain(
      '<span class="DateStrip-note">15:00 首次扫描</span><span class="DateStrip-short">15:00 首次扫描</span>',
    );
  });

  test("the day is the site's: a run just after midnight in Tokyo is the next day", async () => {
    const base = createFixtureReadQueries("busy");
    const plain = await base.edition();
    if (plain === null) throw new Error("busy has an edition");
    const late = { ...plain, startsAt: "2026-12-31T15:30:00Z", label: "00:30" };
    const html = await front({ ...base, edition: async () => late }, "ja");
    expect(when(html)).toContain('datetime="2027-01-01"');
    expect(when(html)).toContain(
      '<span class="DateStrip-month">1月</span><span class="DateStrip-day">1</span>',
    );
    expect(when(html)).toContain("第1号。");
  });

  test("it holds the language menu, the theme switch and the search link in the page's language", async () => {
    const html = await front(createFixtureReadQueries("busy"), "ja");
    const controls = html.slice(html.indexOf('<div class="DateStrip-controls">'));
    expect(controls).toStartWith('<div class="DateStrip-controls"><div class="LanguageMenu">');
    expect(controls).toContain('</details></div><bd-island name="ThemeSwitch"');
    expect(controls).toContain('</bd-island><a class="DateStrip-search" href="/ja/search">');
    expect(controls).toContain(
      '<span class="DateStrip-search-name">検索</span></a></div></div><h1>',
    );
  });
});

// #46: a model-written headline that holds markup renders as text. The
// pipeline refuses such text before storing it (`writesNoMarkup`); this is
// the second guard, at render.
describe("model text renders as text", () => {
  test("a headline with markup adds no element and no link", async () => {
    const base = createFixtureReadQueries("busy");
    const plain = await base.edition();
    if (plain === null) throw new Error("busy has an edition");
    const injected = [
      '<a href="javascript:alert(1)">x</a>',
      "<img src=x onerror=alert(1)>",
      "</a><script>alert(1)</script>",
      '" onmouseover="alert(1)',
    ];
    const ranking = plain.ranking.map((row, i) => ({
      ...row,
      headlines: row.headlines.map((h) => ({ ...h, text: injected[i % injected.length] ?? "" })),
    }));
    const html = await front({ ...base, edition: async () => ({ ...plain, ranking }) }, "en");
    const before = await front(base, "en");
    const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;
    expect(count(html, /<a\b/g)).toBe(count(before, /<a\b/g));
    expect(body(html)).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html.slice(html.indexOf("<main"))).not.toMatch(/href="(?!\/topic\/|https:\/\/)/);
    expect(html).not.toContain('" onmouseover');
    expect(html).toContain("&lt;img src=x onerror=alert(1)>");
  });
});

// #271: escaping is the renderer's. Fixture text with `<script>` and `&`, and
// an attribute with `"`, appear only in their escaped forms.
describe("the renderer escapes fixture text", () => {
  test("<script>, & and an attribute's quote appear only escaped", async () => {
    const base = createFixtureReadQueries("busy");
    const plain = await base.edition();
    if (plain === null) throw new Error("busy has an edition");
    const [first, ...rest] = plain.classifieds.items;
    if (first === undefined) throw new Error("busy has classifieds");
    const marked = {
      ...first,
      groupName: "Group & <script>one</script>",
      url: 'https://example.test/?q="quoted"',
      title: { ...first.title, text: "A <script>x</script> & b" },
    };
    const edition = { ...plain, classifieds: { ...plain.classifieds, items: [marked, ...rest] } };
    const html = await front({ ...base, edition: async () => edition }, "en");
    expect(html).toContain("Group &amp; &lt;script>one&lt;/script>: ");
    expect(html).toContain('href="https://example.test/?q=&quot;quoted&quot;"');
    expect(html).toContain(">A &lt;script>x&lt;/script> &amp; b</a>");
    expect(body(html)).not.toContain("<script");
    expect(html).not.toContain(" & ");
    expect(html).not.toContain('"quoted"');
  });
});
