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
          /^<header class="page">(?:<div class="LanguageMenu">[\s\S]*?<\/details><\/div>)?<h1>[^<]+<\/h1>(?:<bd-island name="ThemeSwitch"[^>]*>[\s\S]*?<\/bd-island>)?<\/header>/,
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
        '<h1>Breaker Delta</h1><bd-island name="ThemeSwitch" props="{&quot;toDark&quot;:&quot;Switch to dark mode&quot;,&quot;toLight&quot;:&quot;Switch to light mode&quot;}"><button type="button" class="ThemeSwitch">',
      );
      expect(html).toContain(
        '<span class="ThemeSwitch-name ThemeSwitch-to-dark">Switch to dark mode</span><span class="ThemeSwitch-name ThemeSwitch-to-light">Switch to light mode</span></button></bd-island></header>',
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
    // The site's own links: topics, and the changes that went flat (#122).
    expect(html.slice(html.indexOf("<main"))).not.toMatch(
      /href="(?!\/topic\/|https:\/\/|\/changes\?type=went_flat")/,
    );
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

// #122: the fading notices, from the edition's `ebb`. The sentence is the
// fixed pattern of the string tables; the numbers are the data's.
describe("the fading notices", () => {
  const notices = (html: string) =>
    html.slice(html.indexOf('<section class="Band" aria-labelledby="band-fading">'));

  test("one notice per wave going out, its numbers from the data", async () => {
    const q = createFixtureReadQueries("busy");
    const edition = await q.edition();
    if (edition === null) throw new Error("busy has an edition");
    const html = notices(await front(q));
    expect(html).toContain('<h2 id="band-fading" class="Band-name">Fading notices</h2>');
    expect(html.match(/<article class="Notice">/g)?.length).toBe(edition.ebb.notices.length);
    for (const n of edition.ebb.notices) {
      expect(html).toContain(`href="/topic/${n.slug}"`);
      expect(html).toContain(
        `Peaked at ${Math.round(n.peak.height)}. Survived by ${n.echoCount} echoes.`,
      );
    }
    // Board 01's first notice: formed Nov 13 (JST), peak 188, 22 echoes, now 144, down 18%.
    expect(html).toContain(
      '<p class="Notice-text">A wave since Nov 13. Peaked at 188. Survived by 22 echoes.</p><p class="Notice-now">Now 144, down 18% in 24 hours</p>',
    );
    expect(html).toContain('aria-label="A wave line flattening, now at 144"');
    expect(html).toContain(
      `<a class="FadingNotices-flat" href="/changes?type=went_flat">Read the ${edition.ebb.wentFlat24h} that went flat</a>`,
    );
  });

  test("in each language, with the day in that language and links in its path", async () => {
    const q = createFixtureReadQueries("busy");
    const zh = notices(await front(q, "zh"));
    expect(zh).toContain('<h2 id="band-fading" class="Band-name">退潮启事</h2>');
    expect(zh).toContain("11月13日成浪。最高 188。身后留下 22 条回波。");
    expect(zh).toContain("现在 144，24 小时内下降 18%");
    expect(zh).toContain('href="/zh/topic/frontier-model-backlash" lang="zh"');
    expect(zh).toContain('href="/zh/changes?type=went_flat"');
    const ja = notices(await front(q, "ja"));
    expect(ja).toContain("11月13日に波となる。最高 188。遺したエコーは 22 件。");
  });

  test("no link when no wave went flat; one echo is an echo; no fall, no percentage", async () => {
    const base = createFixtureReadQueries("busy");
    const plain = await base.edition();
    const first = plain?.ebb.notices[0];
    if (plain === null || plain === undefined || first === undefined) {
      throw new Error("busy has ebb notices");
    }
    const ebb = {
      wentFlat24h: 0,
      notices: [{ ...first, echoCount: 1, change24h: null, height: 143.6 }],
    };
    const html = notices(await front({ ...base, edition: async () => ({ ...plain, ebb }) }));
    expect(html).not.toContain("FadingNotices-flat");
    expect(html).toContain("Survived by 1 echo.</p>");
    expect(html).toContain('<p class="Notice-now">Now 144</p>');
  });

  test("a wave that rose in 24 hours shows its height and no fall", async () => {
    const base = createFixtureReadQueries("busy");
    const plain = await base.edition();
    const first = plain?.ebb.notices[0];
    if (plain === null || first === undefined) throw new Error("busy has ebb notices");
    const ebb = { wentFlat24h: 0, notices: [{ ...first, change24h: 5 }] };
    const html = notices(await front({ ...base, edition: async () => ({ ...plain, ebb }) }));
    expect(html).toContain(`<p class="Notice-now">Now ${Math.round(first.height)}</p>`);
    expect(html).not.toContain("down");
  });

  test("the day a wave formed is the site's day, not the machine's", async () => {
    // 09:00 in Tokyo is 13:00 the day before in Pago Pago (UTC-11): a page
    // that formatted the day in the machine's zone (JST or UTC here and in
    // CI) would print Nov 13.
    const base = createFixtureReadQueries("busy");
    const meta = await base.siteMeta();
    const plain = await base.edition();
    const first = plain?.ebb.notices[0];
    if (plain === null || first === undefined) throw new Error("busy has ebb notices");
    const ebb = {
      wentFlat24h: 0,
      notices: [{ ...first, formedAt: "2026-11-13T09:00:00+09:00" }],
    };
    const html = notices(
      await front({
        ...base,
        siteMeta: async () => ({ ...meta, timeZone: "Pacific/Pago_Pago" }),
        edition: async () => ({ ...plain, ebb }),
      }),
    );
    expect(html).toContain('<p class="Notice-text">A wave since Nov 12.');
  });

  test("when no wave is going out, the whole section is one sentence", async () => {
    const base = createFixtureReadQueries("busy");
    const plain = await base.edition();
    if (plain === null) throw new Error("busy has an edition");
    const ebb = { wentFlat24h: 3, notices: [] };
    const html = await front({ ...base, edition: async () => ({ ...plain, ebb }) });
    expect(html).toContain(
      '<section class="Band" aria-labelledby="band-fading"><div class="Band-rail"><h2 id="band-fading" class="Band-name">Fading notices</h2></div><div class="Band-body"><div class="FadingNotices"><p class="FadingNotices-none">No wave is going out.</p></div></div></section>',
    );
  });
});
