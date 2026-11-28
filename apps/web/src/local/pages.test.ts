import { describe, expect, test } from "bun:test";
import { type RankRow, RankRowSchema, type ReadQueries } from "@bd/contracts";
import { createFixtureReadQueries } from "@bd/fixtures";
import { echoStackLayers } from "@bd/ui/patterns";
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
        .replace(
          /^<main class="page">(?:<section class="Band"[\s\S]*?<\/section>)+<\/main>(?:<footer class="Footer">[\s\S]*<\/footer>)?$/,
          "",
        );
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

// #111: every page ends with the footer, in the page's language. The form
// shows only when the site sends email (#81 hides it otherwise).
describe("the footer", () => {
  test("the busy set sends email, so its footer has the form; fresh and quiet do not", async () => {
    const busy = await front(createFixtureReadQueries("busy"));
    expect(busy).toContain(
      '</main><footer class="Footer"><div class="Footer-top"><form class="Footer-form" method="post" action="/subscribe">',
    );
    expect(busy).toContain(">One email a day, with the new waves.</label>");
    for (const set of ["fresh", "quiet"] as const) {
      const html = await front(createFixtureReadQueries(set));
      expect(html).toContain('</main><footer class="Footer"><div class="Footer-top"><nav');
      expect(html).not.toContain("<form");
    }
  });

  test("its text and links follow the page's language", async () => {
    const zh = await front(createFixtureReadQueries("busy"), "zh");
    expect(zh).toContain('action="/zh/subscribe"');
    expect(zh).toContain(">每天一封邮件，带来新成的浪。</label>");
    expect(zh).toContain('<nav class="Footer-nav" aria-label="页脚">');
    expect(zh).toContain(
      '<a class="Footer-link" href="/zh/about#height"><span class="Footer-long">浪高是怎么算的</span><span class="Footer-short">浪高怎么算</span></a>',
    );
    expect(zh).toContain('<span class="Footer-note">Breaker Delta 是开源项目。</span>');
    // Every link: the three about sections in the page's language, then the repository.
    const links = (html: string) =>
      [...html.matchAll(/<a class="Footer-link" href="([^"]+)"/g)].map((m) => m[1]);
    const repo = "https://github.com/daiyanze/breaker-delta";
    expect(links(zh)).toEqual(["/zh/about#height", "/zh/about#own", "/zh/about#open", repo]);
    const ja = await front(createFixtureReadQueries("busy"), "ja");
    expect(links(ja)).toEqual(["/ja/about#height", "/ja/about#own", "/ja/about#open", repo]);
    const en = await front(createFixtureReadQueries("busy"));
    expect(links(en)).toEqual(["/about#height", "/about#own", "/about#open", repo]);
    expect(en).toContain(
      '<a class="Footer-link" href="https://github.com/daiyanze/breaker-delta">GitHub</a>',
    );
  });
});

describe("the echo stack, issue 114", () => {
  test("the tallest wave has one, its sheets following its height, its label in the page's language", async () => {
    const q = createFixtureReadQueries("busy");
    const edition = await q.edition();
    const top = edition?.ranking[0];
    if (top === undefined) throw new Error("the busy set has a ranking");
    const layers = echoStackLayers(top.height);
    const en = await front(q);
    expect(en.match(/<svg class="EchoStack"/g)).toHaveLength(1);
    expect(en).toContain(
      `<svg class="EchoStack" viewBox="0 0 120 220" role="img" aria-label="Echoes stacking into a wave, ${layers} layers high">`,
    );
    const start = en.indexOf('<svg class="EchoStack"');
    const stack = en.slice(start, en.indexOf("</svg>", start));
    expect(stack.match(/<rect /g)).toHaveLength(layers);
    // It sits in the lead story, under its headline and before its height (#119).
    expect(en.indexOf('<svg class="EchoStack"')).toBeGreaterThan(en.indexOf("Headline-title-lead"));
    expect(en.indexOf('<svg class="EchoStack"')).toBeLessThan(en.indexOf("Headline-number-lead"));
    expect(await front(q, "zh")).toContain(`aria-label="回波叠成浪，高 ${layers} 层"`);
    expect(await front(q, "ja")).toContain(`aria-label="エコーが重なって波に、${layers} 層の高さ"`);
  });

  test("a flat sea has none", async () => {
    expect(await front(createFixtureReadQueries("fresh"))).not.toContain("EchoStack");
  });
});

describe("the three tiers of headlines, issue 119", () => {
  const titles = (html: string, tier: string) =>
    [
      ...html.matchAll(
        new RegExp(
          `Headline-title-${tier}[^"]*" data-height="(\\d+)"><a class="Headline-link" href="([^"]+)"`,
          "g",
        ),
      ),
    ].map((m) => [m[1], m[2]]);

  test("rank 1 is the lead, 2 and 3 the second tier, 4 to 6 the third, the rest a list", async () => {
    const q = createFixtureReadQueries("busy");
    const edition = await q.edition();
    if (edition === null) throw new Error("busy has an edition");
    const en = await front(q);
    const slugs = edition.ranking.map((r) => `/topic/${r.slug}`);
    const digits = (h: number) => String(Math.min(200, Math.round(h))).padStart(3, "0");
    const at = (k: number) => [digits(edition.ranking[k]?.height ?? 0), slugs[k]];
    expect(titles(en, "lead")).toEqual([at(0)]);
    expect(titles(en, "second")).toEqual([at(1), at(2)]);
    expect(titles(en, "third")).toEqual([at(3), at(4), at(5)]);
    const list = en.slice(en.indexOf('<ol start="7">'));
    expect(list).toContain(`href="${slugs[6]}"`);
    expect(list.slice(0, list.indexOf("</ol>")).match(/<li>/g)).toHaveLength(
      edition.ranking.length - 6,
    );
    // Every wave is linked once.
    for (const s of slugs) expect(en.split(`href="${s}"`)).toHaveLength(2);
  });

  test("formed today (by formedAt, in the site time zone) is red; down over 24 hours is fading; the kicker says which", async () => {
    const q = createFixtureReadQueries("busy");
    const en = await front(q);
    // Ranks 2 and 3 formed today; rank 5 (frontier-model-backlash) is down 18%.
    expect(en).toContain(
      '<data class="Headline-number Headline-number-second Headline-new" value="181">181</data>',
    );
    expect(en).toContain(
      '<data class="Headline-number Headline-number-third" value="144">144</data>',
    );
    expect(en).toContain(
      '<h3 class="Headline-title Headline-title-third Headline-fading" data-height="144"><a class="Headline-link" href="/topic/frontier-model-backlash"',
    );
    expect(en.match(/Headline-fading/g)).toHaveLength(1);
    expect(en).toContain('<p class="Headline-kicker">Tallest wave right now</p>');
    expect(en).toContain("<strong>Up 63% in 24 hours.</strong> 6 independent sources, 31 echoes.");
    expect(en).toContain('<p class="Headline-note">Down 18% in 24 hours.</p>');
    expect(en).toContain('aria-label="Wave height of the tallest story up to 14:00"');
    // The quiet set's tallest wave formed this run.
    const quiet = await front(createFixtureReadQueries("quiet"));
    expect(quiet).toContain('<p class="Headline-kicker">Formed today, already the tallest</p>');
    expect(quiet).toContain("<strong>New today.</strong>");
    expect(quiet).toContain('<path class="Headline-chart-line" pathLength="1" d="M4,60 L516,60">');
  });

  test("the text follows the page's language; the headline keeps its own", async () => {
    const q = createFixtureReadQueries("busy");
    const zh = await front(q, "zh");
    expect(zh).toContain('<p class="Headline-kicker">此刻最高的浪</p>');
    expect(zh).toContain("<strong>24 小时内上涨 63%。</strong> 6 个独立来源，31 条回波。");
    expect(zh).toMatch(
      /Headline-title-lead" data-height="196"><a class="Headline-link" href="\/zh\/topic\/[^"]+" lang="zh">/,
    );
    const ja = await front(q, "ja");
    expect(ja).toContain('<p class="Headline-kicker">いまいちばん高い波</p>');
  });

  test("a flat sea has no headlines", async () => {
    expect(await front(createFixtureReadQueries("fresh"))).not.toContain("Headline");
  });
});

// Review of #297: the line under a headline is worded from `formedAt` and
// the rounded change, not from a null change alone.
describe("the line under a headline, issue 119", () => {
  /**
   * The busy front page (edition 2026-11-19 14:00 in Asia/Tokyo) with rank 5,
   * a third-tier story, changed; returns its title element and its note.
   */
  async function rank5(change: Partial<RankRow>, lang?: string) {
    const base = createFixtureReadQueries("busy");
    const plain = await base.edition();
    if (plain === null) throw new Error("busy has an edition");
    expect((await base.siteMeta()).timeZone).toBe("Asia/Tokyo");
    expect(plain.startsAt).toBe("2026-11-19T14:00:00+09:00");
    const ranking = plain.ranking.map((r, i) =>
      i === 4 ? RankRowSchema.parse({ ...r, ...change }) : r,
    );
    const html = await front({ ...base, edition: async () => ({ ...plain, ranking }) }, lang);
    const start = html.indexOf(`/topic/${plain.ranking[4]?.slug}"`);
    const article = html.slice(
      html.lastIndexOf("<article", start),
      html.indexOf("</article>", start),
    );
    return {
      note: /<p class="Headline-note">([^<]*)<\/p>/.exec(article)?.[1],
      fading: article.includes("Headline-fading"),
      red: article.includes("Headline-new"),
    };
  }

  test("no change 24 hours ago: today, yesterday or earlier, by formedAt's day in the site's time zone", async () => {
    const cases: [string, string, string, string, boolean][] = [
      // formedAt, en, zh, ja, red
      ["2026-11-19T09:00:00+09:00", "New today.", "今天新成。", "きょうできた波。", true],
      // 15:30 UTC on the 18th is 00:30 on the 19th in Tokyo: today.
      ["2026-11-18T15:30:00Z", "New today.", "今天新成。", "きょうできた波。", true],
      ["2026-11-18T23:30:00+09:00", "Formed yesterday.", "昨天新成。", "きのうできた波。", false],
      // 14:00 UTC on the 18th is 23:00 on the 18th in Tokyo: yesterday.
      ["2026-11-18T14:00:00Z", "Formed yesterday.", "昨天新成。", "きのうできた波。", false],
      // Formed three days ago, flat 24 hours ago, up again.
      [
        "2026-11-16T09:00:00+09:00",
        "Up again after going flat.",
        "退平后再次涌起。",
        "いったん凪いだあと、ふたたび立った波。",
        false,
      ],
    ];
    for (const [formedAt, en, zh, ja, red] of cases) {
      const row = { change24h: null, formedAt };
      expect({ formedAt, ...(await rank5(row)) }).toEqual({
        formedAt,
        note: en,
        fading: false,
        red,
      });
      expect((await rank5(row, "zh")).note).toBe(zh);
      expect((await rank5(row, "ja")).note).toBe(ja);
    }
  });

  test("a change is worded as it is shown, rounded; a rounded 0 is level and not going out", async () => {
    const cases: [number, string, boolean][] = [
      [-0.3, "Level over 24 hours.", false],
      [0, "Level over 24 hours.", false],
      [0.4, "Level over 24 hours.", false],
      [-0.5, "Level over 24 hours.", false],
      [-0.6, "Down 1% in 24 hours.", true],
      [0.5, "Up 1% in 24 hours.", false],
      [-18.4, "Down 18% in 24 hours.", true],
      [62.7, "Up 63% in 24 hours.", false],
    ];
    for (const [change24h, note, fading] of cases) {
      expect({ change24h, ...(await rank5({ change24h })) }).toEqual({
        change24h,
        note,
        fading,
        red: false,
      });
    }
    expect((await rank5({ change24h: -0.3 }, "zh")).note).toBe("24 小时内持平。");
    expect((await rank5({ change24h: -0.3 }, "ja")).note).toBe("24 時間で横ばい。");
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
    const main = html.slice(html.indexOf("<main"), html.indexOf("</main>"));
    expect(main).not.toMatch(/href="(?!\/topic\/|https:\/\/)/);
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
