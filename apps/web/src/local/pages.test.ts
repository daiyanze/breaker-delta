import { describe, expect, test } from "bun:test";
import { type RankRow, RankRowSchema, type ReadQueries } from "@bd/contracts";
import { createFixtureReadQueries } from "@bd/fixtures";
import { echoStackLayers } from "@bd/ui/patterns";
import { localClock } from "../core/pages/tide.tsx";
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
          /^(?:<header class="page"><div class="DateStrip">[\s\S]*?<\/a><\/span><\/div><\/div><\/header>)?<header class="page"><div class="Masthead">[\s\S]*?<\/header>/,
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
    expect(placeholder).toContain('<h1 class="Masthead-title"><a class="Masthead-home" href="/">');
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
      expect(html).toContain(
        '<span class="ThemeSwitch-name ThemeSwitch-to-dark">Switch to dark mode</span><span class="ThemeSwitch-name ThemeSwitch-to-light">Switch to light mode</span></button></bd-island><span class="SearchEntry">',
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
    expect(when(html)).toContain(">2026年11月19日 星期四</time>");
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
    expect(when(html)).toContain(">2027年1月1日（金）</time>");
    expect(when(html)).toContain("第1号。");
  });

  test("it holds the language menu, the theme switch and the search link in the page's language", async () => {
    const html = await front(createFixtureReadQueries("busy"), "ja");
    const controls = html.slice(html.indexOf('<div class="DateStrip-controls">'));
    expect(controls).toStartWith('<div class="DateStrip-controls"><div class="LanguageMenu">');
    expect(controls).toContain('</details></div><bd-island name="ThemeSwitch"');
    expect(controls).toContain('</bd-island><span class="SearchEntry"><a class="Button');
    expect(controls).toContain('href="/ja/search"');
    expect(controls).toContain(
      '<span class="SearchEntry-label">検索</span></a></span></div></div></header><header class="page"><div class="Masthead">',
    );
  });
});

// #110: every public page opens with the same masthead, in its own language.
// #110: every public page opens with the same masthead, in its own language.
describe("every page has the masthead", () => {
  const masthead = (html: string) => {
    const at = html.indexOf('<header class="page"><div class="Masthead">');
    return at === -1 ? "" : html.slice(at, html.indexOf("</header>", at));
  };

  test("the placeholder and every fixture set's front page, the front page marked", async () => {
    const pages = [
      await front(null),
      ...(await Promise.all(
        (["busy", "fresh", "quiet"] as const).map((s) => front(createFixtureReadQueries(s))),
      )),
    ];
    for (const html of pages) {
      const m = masthead(html);
      expect(m).toContain('<h1 class="Masthead-title"><a class="Masthead-home" href="/">');
      expect(m).toContain('<nav class="Masthead-nav" aria-label="Main">');
      expect(m).toContain('<a class="Masthead-link" href="/" aria-current="page">Front page</a>');
      expect(m).toContain('<a class="Masthead-link" href="/record">Track record</a>');
      expect(m).toContain('<summary class="Masthead-button">Sections<svg');
      expect(m.match(/aria-current="page"/g)?.length).toBe(2);
      expect(html.match(/class="Masthead"/g)?.length).toBe(1);
    }
  });

  test("its links and labels are in the page's language", async () => {
    const zh = masthead(await front(createFixtureReadQueries("busy"), "zh"));
    expect(zh).toContain('<a class="Masthead-home" href="/zh/">');
    expect(zh).toContain('<nav class="Masthead-nav" aria-label="主导航">');
    expect(zh).toContain('<a class="Masthead-link" href="/zh/" aria-current="page">头版</a>');
    expect(zh).toContain('<a class="Masthead-link" href="/zh/record">战绩</a>');
    expect(zh).toContain('<summary class="Masthead-button">栏目<svg');
    expect(zh).toContain('<span class="Masthead-name">Breaker Delta</span>');
    const ja = masthead(await front(createFixtureReadQueries("busy"), "ja"));
    expect(ja).toContain('<a class="Masthead-link" href="/ja/changes">変更</a>');
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

describe("were we right?, issue 123", () => {
  /** The "Were we right?" band of a page, from its section to the next. */
  const band = (html: string) => {
    const start = html.indexOf('<section class="Band" aria-labelledby="band-verdicts"');
    if (start < 0) throw new Error("no verdicts band");
    return html.slice(start, html.indexOf("</section>", start) + 10);
  };

  test("busy: a stub per test coming due and per recent verdict, the name on sun, a link to the track record", async () => {
    const q = createFixtureReadQueries("busy");
    const edition = await q.edition();
    if (edition === null) throw new Error("busy has an edition");
    const page = await front(q);
    const html = band(page);
    expect(html).toStartWith(
      '<section class="Band" aria-labelledby="band-verdicts" data-link><div class="Band-rail"><h2 id="band-verdicts" class="Band-name"><span class="Band-mark">Were we right?</span></h2>',
    );
    const { due, recent } = edition.verdicts;
    expect(html.match(/<article class="TicketStub" data-size="small">/g)).toHaveLength(
      due.length + recent.length,
    );
    expect(html.match(/data-kind="due" data-loud>Due Nov 26</g)).toHaveLength(due.length);
    expect(html).toContain('<span class="Stamp" data-kind="hit">Hit</span>');
    expect(html).toContain('<span class="Stamp" data-kind="partial">Partial</span>');
    expect(html).toContain("Day 7 of 14");
    expect(html).toContain("Confirmed Nov 19");
    // The busy set's partial verdict was revised.
    expect(html).toContain("Revised Nov 18");
    expect(html).toContain(
      'href="/topic/chipmaker-board-founder-ceo" lang="en">Founder CEO ousted</a>',
    );
    // Verdicts are in, so the note does not say there are none.
    expect(html).not.toContain("No verdicts yet");
    expect(html).toEndWith(
      '</ul></div><a class="Band-link" href="/record">Open the track record</a></section>',
    );
    // After the fading notices and before the classifieds, as on boards 01 and 02.
    expect(page.indexOf("band-verdicts")).toBeGreaterThan(page.indexOf("band-fading"));
    expect(page.indexOf("band-verdicts")).toBeLessThan(page.indexOf("band-classifieds"));
  });

  test("in each language: the band's name, the stamps and the link's path", async () => {
    const q = createFixtureReadQueries("busy");
    const zh = band(await front(q, "zh"));
    expect(zh).toContain('<span class="Band-mark">我们说对了吗？</span>');
    expect(zh).toContain(">11月26日到期<");
    expect(zh).toContain('<a class="Band-link" href="/zh/record">查看战绩</a>');
    const ja = band(await front(q, "ja"));
    expect(ja).toContain('<span class="Band-mark">当たったか？</span>');
    expect(ja).toContain(">11月26日 期限<");
    expect(ja).toContain('<a class="Band-link" href="/ja/record">的中記録を見る</a>');
  });

  test("quiet: before any verdict and with nothing due, the first due date; never blank", async () => {
    const q = createFixtureReadQueries("quiet");
    const edition = await q.edition();
    expect(edition?.verdicts).toEqual({ due: [], recent: [] });
    expect((await q.trackRecord()).firstDueAt).toBe("2026-11-26T18:00:00+09:00");
    const html = band(await front(q));
    expect(html).toContain(
      '<p class="Band-note">Every wave gets one test, locked the moment it forms and checked 14 days later against outside reporting. No verdicts yet. When they land, each stub gets stamped.</p>',
    );
    expect(html).toContain(
      '<div class="Band-body"><p>The first test comes due on Nov 26.</p></div><a class="Band-link" href="/record">Open the track record</a>',
    );
    expect(html).not.toContain("TicketStubs");
  });

  test("with verdicts but none recent and nothing listed as due, that none is due", async () => {
    const base = createFixtureReadQueries("busy");
    const plain = await base.edition();
    if (plain === null) throw new Error("busy has an edition");
    expect((await base.trackRecord()).firstDueAt).toBeNull();
    const q = { ...base, edition: async () => ({ ...plain, verdicts: { due: [], recent: [] } }) };
    const html = band(await front(q));
    expect(html).toContain(
      '<div class="Band-body"><p>No test is due right now. Every verdict so far is in the track record.</p></div>',
    );
    expect(html).not.toContain("No verdicts yet");
  });

  test("with no test registered or waiting, it says so", async () => {
    const base = createFixtureReadQueries("quiet");
    const plain = await base.trackRecord();
    const none = {
      ...base,
      trackRecord: async () => ({ ...plain, firstDueAt: null, registered: 0 }),
    };
    expect(band(await front(none))).toContain(
      "<p>No wave has formed yet, so no test is locked.</p>",
    );
    const done = {
      ...base,
      trackRecord: async () => ({
        ...plain,
        firstDueAt: null,
        score: { ...plain.score, confirmed: 2, hit: 2 },
      }),
    };
    expect(band(await front(done))).toContain("<p>No test is due right now.");
  });

  test("the track record is read only when the edition lists no recent verdict", async () => {
    const base = createFixtureReadQueries("busy");
    let reads = 0;
    const counted = {
      ...base,
      trackRecord: async () => {
        reads += 1;
        return base.trackRecord();
      },
    };
    await front(counted);
    expect(reads).toBe(0);
    const quiet = createFixtureReadQueries("quiet");
    await front({ ...quiet, trackRecord: counted.trackRecord });
    expect(reads).toBe(1);
  });

  test("a test past its due date with no verdict is under review, on its last day", async () => {
    const base = createFixtureReadQueries("busy");
    const plain = await base.edition();
    const first = plain?.verdicts.due[0];
    if (plain === null || first === undefined) throw new Error("busy has a due test");
    const late = { ...first, dueAt: "2026-11-19T10:00:00+09:00" };
    const q = {
      ...base,
      edition: async () => ({ ...plain, verdicts: { due: [late], recent: plain.verdicts.recent } }),
    };
    const html = band(await front(q));
    expect(html).toContain('<span class="Stamp" data-kind="under_review">Under review</span>');
    expect(html).not.toContain("data-loud");
    expect(html).toContain("Day 7 of 7");
  });

  test("a test with markup renders as text", async () => {
    const base = createFixtureReadQueries("busy");
    const plain = await base.edition();
    const first = plain?.verdicts.due[0];
    if (plain === null || first === undefined) throw new Error("busy has a due test");
    const marked = {
      ...first,
      criterion: { ...first.criterion, text: "<img src=x onerror=alert(1)>" },
    };
    const q = {
      ...base,
      edition: async () => ({ ...plain, verdicts: { ...plain.verdicts, due: [marked] } }),
    };
    const html = band(await front(q));
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=alert(1)>");
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

  test("rank 1 is the lead, 2 and 3 the second tier, 4 to 6 the third; the index lists them all", async () => {
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
    expect(en).not.toContain("<ol start=");
    // In the front band, a headline links each of the six tallest waves and
    // the index (#120) links every wave once. A falling wave is linked again
    // from its fading notice further down (issue 122), and a wave formed
    // today from the tide table (#121), and some from their ticket stubs in
    // "Were we right?" (#123), all outside this band: the slice
    // ends where the next band starts.
    const start = en.indexOf('aria-labelledby="band-front"');
    const band = en.slice(start, en.indexOf('<section class="Band"', start));
    slugs.forEach((s, k) => {
      expect([s, band.split(`href="${s}"`).length - 1]).toEqual([s, k < 6 ? 2 : 1]);
    });
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
    // The site's own links: topics, the changes that went flat (#122) and the
    // track record (#123).
    expect(main).not.toMatch(/href="(?!\/topic\/|https:\/\/|\/changes\?type=went_flat"|\/record")/);
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

// #121: the tide table, from the edition's `tideTable` and the site's time zone.
describe("the tide table", () => {
  test("the busy front page has it after the front band, one dot and one link per wave", async () => {
    const html = await front(createFixtureReadQueries("busy"));
    const main = html.slice(html.indexOf("<main"));
    expect(main.indexOf('id="band-front"')).toBeLessThan(main.indexOf('id="band-tide"'));
    // Boards 01 and 02's order: front page, tide table, fading notices,
    // "Were we right?" (#123), classifieds.
    expect(main.indexOf('id="band-tide"')).toBeLessThan(main.indexOf('id="band-fading"'));
    expect(main.indexOf('id="band-fading"')).toBeLessThan(main.indexOf('id="band-verdicts"'));
    expect(main.indexOf('id="band-verdicts"')).toBeLessThan(main.indexOf('id="band-classifieds"'));
    expect(main).toContain('<h2 id="band-tide" class="Band-name">Tide table</h2>');
    expect(main).toContain('aria-label="5 stories became waves today, between 08:00 and 14:00."');
    expect(main.match(/<circle class="TideTable-dot"/g)?.length).toBe(5);
    // Latest first; a wave with no summary keeps its source's own headline.
    expect(main).toContain(
      '<a class="TideTable-link" href="/topic/open-weights-quarter-price"><span class="TideTable-at">14:00</span><span class="TideTable-title" lang="en">Open-weights model released with pricing at 25% of flagship</span><span class="TideTable-wave">126</span></a>',
    );
    expect(main).toContain('<text class="TideTable-nowLabel" x="58.333%" y="22">now</text>');
  });

  test("in Chinese, its text and links are the page's language", async () => {
    const html = await front(createFixtureReadQueries("busy"), "zh");
    expect(html).toContain('<h2 id="band-tide" class="Band-name">潮汐表</h2>');
    expect(html).toContain('aria-label="今天有 5 个故事成了浪，时间在 08:00 到 14:00 之间。"');
    expect(html).toContain(
      '<a class="TideTable-link" href="/zh/topic/six-banks-offline"><span class="TideTable-at">10:00</span><span class="TideTable-title" lang="zh">美国六家银行同一个下午相继宕机</span>',
    );
    expect(html).toContain(">满潮 09:30</text>");
  });

  test("left out with one new wave (board 19) and on a flat sea", async () => {
    for (const set of ["quiet", "fresh"] as const) {
      expect(await front(createFixtureReadQueries(set))).not.toContain("TideTable");
    }
  });

  test("a formation time is read in the site's time zone", () => {
    expect(localClock("2026-11-19T08:00:00+09:00", "Asia/Tokyo")).toEqual({ at: "08:00", hour: 8 });
    expect(localClock("2026-11-18T23:30:00Z", "Asia/Tokyo")).toEqual({ at: "08:30", hour: 8.5 });
    expect(localClock("2026-11-19T00:45:00+09:00", "UTC")).toEqual({ at: "15:45", hour: 15.75 });
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

describe("the index, issue 120", () => {
  /** The index island's server markup. */
  const indexOf = (html: string) =>
    html.slice(html.indexOf('<aside class="Index"'), html.indexOf("</aside>") + 8);
  const ROW =
    /<a class="IndexRow" href="([^"]+)"><span class="IndexRow-rank">(\d+)<\/span><span class="IndexRow-title" lang="([\w-]+)">([^<]+)<\/span><span class="IndexRow-leader" aria-hidden="true"><\/span><span class="IndexRow-change( IndexRow-new)?">([^<]*)<\/span><data class="IndexRow-number( IndexRow-new)?" value="([\d.]+)">(\d+)<\/data><\/a>/g;
  const rowsOf = (html: string) =>
    [...indexOf(html).matchAll(ROW)].map((m) => ({
      href: m[1],
      rank: Number(m[2]),
      lang: m[3],
      title: m[4],
      change: m[6],
      red: m[5] !== undefined && m[7] !== undefined,
      number: Number(m[9]),
    }));

  test("every wave, tallest first, each linking to its topic page, in the front band's right rail", async () => {
    const q = createFixtureReadQueries("busy");
    const edition = await q.edition();
    if (edition === null) throw new Error("busy has an edition");
    const en = await front(q);
    expect(en).toContain(
      '<section class="Band" data-variant="front" aria-labelledby="band-front">',
    );
    expect(en).toContain('<div class="Band-aside"><bd-island name="Index" props="');
    const rows = rowsOf(en);
    expect(rows).toHaveLength(16);
    expect(rows.map((r) => r.href)).toEqual(edition.ranking.map((r) => `/topic/${r.slug}`));
    expect(rows.map((r) => r.rank)).toEqual(edition.ranking.map((r) => r.rank));
    expect(rows.map((r) => r.number)).toEqual(edition.ranking.map((r) => Math.round(r.height)));
    // The short title, not the headline.
    expect(rows[0]?.title).toBe("Founder CEO ousted");
    // The index comes after the headlines in the band, so under them on phones.
    expect(en.indexOf('<div class="Band-aside">')).toBeGreaterThan(en.indexOf("Headline-key"));
  });

  test("the change: new (red) for a wave formed today, the rounded percent otherwise, nothing when level", async () => {
    const en = rowsOf(await front(createFixtureReadQueries("busy")));
    const at = (rank: number) => en[rank - 1];
    expect(at(1)).toMatchObject({ change: "+63%", red: false });
    expect(at(2)).toMatchObject({ change: "new", red: true });
    expect(at(5)).toMatchObject({ change: "−18%", red: false });
    expect(at(7)).toMatchObject({ change: "new", red: true });
    expect(at(16)).toMatchObject({ change: "", red: false });
    expect(en.filter((r) => r.red).map((r) => r.rank)).toEqual([2, 3, 4, 6, 7]);
  });

  test("a null change on a wave that formed before today shows nothing and is not red", async () => {
    const base = createFixtureReadQueries("busy");
    const plain = await base.edition();
    if (plain === null) throw new Error("busy has an edition");
    const yesterday = { change24h: null, formedAt: "2026-11-18T23:30:00+09:00" };
    const ranking = plain.ranking.map((r, i) =>
      i === 7 ? RankRowSchema.parse({ ...r, ...yesterday }) : r,
    );
    const rows = rowsOf(await front({ ...base, edition: async () => ({ ...plain, ranking }) }));
    expect(rows[7]).toMatchObject({ change: "", red: false });
  });

  // Review of #301: the change is shown rounded, so a fraction under 0.5 is level.
  test("the change is the rounded percent: 12.6 is +13%, -12.6 is −13%, ±0.4 is level", async () => {
    const base = createFixtureReadQueries("busy");
    const plain = await base.edition();
    if (plain === null) throw new Error("busy has an edition");
    const changes = new Map([
      [0, 12.6],
      [4, -12.6],
      [7, 0.4],
      [8, -0.4],
    ]);
    const ranking = plain.ranking.map((r, i) => {
      const change24h = changes.get(i);
      return change24h === undefined ? r : RankRowSchema.parse({ ...r, change24h });
    });
    const rows = rowsOf(await front({ ...base, edition: async () => ({ ...plain, ranking }) }));
    expect([0, 4, 7, 8].map((i) => rows[i]?.change)).toEqual(["+13%", "−13%", "", ""]);
  });

  test("the phone button shows all sixteen; the text follows the page's language, the titles keep theirs", async () => {
    const q = createFixtureReadQueries("busy");
    const en = indexOf(await front(q));
    expect(en).toContain('<h2 id="index-name" class="Index-name">The index</h2>');
    expect(en).toContain(
      '<button type="button" class="Index-more" aria-controls="index-list" aria-expanded="false">Show all 16 waves</button>',
    );
    expect(en).toContain(
      '<p class="Index-note">Red numbers formed today. The change is over 24 hours.</p>',
    );
    const zhHtml = await front(q, "zh");
    const zh = rowsOf(zhHtml);
    expect(zh[0]).toMatchObject({ lang: "zh", title: "创始人 CEO 出局", change: "+63%" });
    expect(zh[1]).toMatchObject({ change: "新", red: true });
    // Rank 7 has no Chinese short title or headline: its title keeps its own language.
    expect(zh[6]?.lang).not.toBe("zh");
    expect(indexOf(zhHtml)).toContain(">显示全部 16 个浪</button>");
    expect(indexOf(await front(q, "ja"))).toContain(">16 の波をすべて表示</button>");
  });

  test("a quiet sea's two waves: no button; a flat sea: no index", async () => {
    const quiet = indexOf(await front(createFixtureReadQueries("quiet")));
    expect(rowsOf(quiet)).toHaveLength(2);
    expect(quiet).not.toContain("<button");
    expect(await front(createFixtureReadQueries("fresh"))).not.toContain("Index");
  });
});
