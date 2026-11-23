/**
 * The JSON API adapters (M1-05). Each reads its recorded fixture
 * (`bun run record-fixture <group>`, scrubbed), and each rule it adds on top
 * of the fixture is tested with a hand-written body in the source's own form.
 */
import { describe, expect, test } from "bun:test";
import { type Adapter, ParseError, type SourceItem } from "../adapter.ts";
import { LAUNCH_GROUPS } from "../launch-groups.ts";
import { appStore } from "./app-store.ts";
import { dailyPapers } from "./daily-papers.ts";
import { devto } from "./devto.ts";
import { federalRegister } from "./federal-register.ts";
import { github } from "./github.ts";
import { hackernews } from "./hackernews.ts";
import { hfSpaces, huggingface } from "./huggingface.ts";
import { mastodon } from "./mastodon.ts";
import { openrouter } from "./openrouter.ts";
import { wikipedia } from "./wikipedia.ts";

const fixture = (a: Adapter) =>
  Bun.file(new URL(`../fixtures/${a.groupId}.json`, import.meta.url)).text();

const groupOf = (a: Adapter) => {
  const g = LAUNCH_GROUPS.find((x) => x.id === a.groupId);
  if (!g) throw new Error(`no launch group ${a.groupId}`);
  return g;
};

const urls = (items: SourceItem[]) => items.map((i) => i.url);

/** The first item each recorded fixture yields. Five are recorded per group. */
const FIRST: [Adapter, SourceItem][] = [
  [
    appStore,
    {
      url: "https://example.com/item/13",
      title: "text 10",
      publishedAt: Date.UTC(2026, 5, 3),
      heat: null,
    },
  ],
  [
    dailyPapers,
    {
      url: "https://huggingface.co/papers/2611.15449",
      title: "text 9",
      // Featured on 2026-11-23; its arXiv date is days earlier.
      publishedAt: Date.UTC(2026, 10, 23),
      heat: 3,
    },
  ],
  [
    devto,
    { url: "https://example.com/item/7", title: "text 2", publishedAt: 1795354030000, heat: 72 },
  ],
  [
    federalRegister,
    {
      url: "https://example.com/item/7",
      title: "text 3",
      publishedAt: Date.UTC(2026, 10, 23),
      heat: null,
    },
  ],
  [
    github,
    {
      url: "https://example.com/item/20",
      title: "text 3",
      publishedAt: 1795205233000,
      heat: 16328,
    },
  ],
  [
    hackernews,
    {
      url: "https://example.com/item/13",
      title: "text 12",
      publishedAt: 1795320296000,
      heat: 1221,
    },
  ],
  [
    hfSpaces,
    {
      url: "https://huggingface.co/spaces/text%202",
      title: "text 2",
      publishedAt: 1791559465000,
      heat: 827,
    },
  ],
  [
    huggingface,
    {
      url: "https://huggingface.co/text%202",
      title: "text 2",
      publishedAt: 1794875217000,
      heat: 5069,
    },
  ],
  [
    mastodon,
    { url: "https://example.com/item/1", title: "text 2", publishedAt: 1794718466000, heat: 2 },
  ],
  [
    openrouter,
    {
      url: "https://openrouter.ai/text%201",
      title: "text 4",
      publishedAt: 1795227585000,
      heat: null,
    },
  ],
  [
    wikipedia,
    {
      url: "https://en.wikipedia.org/wiki/text%203",
      title: "text 3",
      publishedAt: Date.UTC(2026, 10, 22),
      heat: 3672266,
    },
  ],
];

describe("JSON adapters read their recorded fixtures", () => {
  for (const [adapter, first] of FIRST) {
    test(adapter.groupId, async () => {
      const items = adapter.parse(await fixture(adapter), "");
      expect(items).toHaveLength(5);
      expect(items[0]).toEqual(first);
    });
  }
});

describe("JSON adapters refuse a body of the wrong shape", () => {
  for (const [adapter] of FIRST) {
    test(adapter.groupId, () => {
      expect(() => adapter.parse("<html>rate limited</html>", "")).toThrow(ParseError);
      // An array where an object is expected, or the other way round.
      const wrong = Array.isArray(JSON.parse(adapterSample(adapter))) ? "{}" : "[]";
      expect(() => adapter.parse(wrong, "")).toThrow(ParseError);
      expect(() => adapter.parse("null", "")).toThrow(ParseError);
    });
  }
});

/** The smallest body of the right shape for each adapter, with no items. */
function adapterSample(a: Adapter): string {
  switch (a.groupId) {
    case "github":
    case "wikipedia":
      return '{"items":[]}';
    case "hackernews":
      return '{"hits":[]}';
    case "openrouter":
      return '{"data":[]}';
    case "federal_register":
      return '{"count":0,"results":[]}';
    case "app_store":
      return '{"feed":{"results":[]}}';
    default:
      return "[]";
  }
}

test("an empty list of the right shape is no items, not an error", () => {
  for (const [adapter] of FIRST) expect(adapter.parse(adapterSample(adapter), "")).toEqual([]);
});

describe("URLs", () => {
  const now = Date.UTC(2026, 10, 23, 0, 30);

  test("hackernews fetches each member list", () => {
    expect(hackernews.urls(groupOf(hackernews), now)).toEqual(groupOf(hackernews).members ?? []);
    expect(hackernews.urls(groupOf(hackernews), now)).toHaveLength(2);
  });

  test("github asks for repositories created in the seven days before the scan", () => {
    expect(github.urls(groupOf(github), now)).toEqual([
      "https://api.github.com/search/repositories?q=created%3A%3E2026-11-16&sort=stars&order=desc&per_page=30",
    ]);
  });

  test("wikipedia asks for the previous UTC day, even just after midnight", () => {
    expect(wikipedia.urls(groupOf(wikipedia), now)).toEqual([
      "https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access/2026/11/22",
    ]);
    // Month and year boundaries.
    expect(wikipedia.urls(groupOf(wikipedia), Date.UTC(2027, 0, 1, 12))[0]).toEndWith(
      "/2026/12/31",
    );
  });

  test("every other JSON group fetches one fixed URL", () => {
    for (const a of [appStore, dailyPapers, devto, federalRegister, hfSpaces, huggingface]) {
      expect(a.urls(groupOf(a), now)).toHaveLength(1);
    }
    for (const a of [mastodon, openrouter]) expect(a.urls(groupOf(a), now)).toHaveLength(1);
  });
});

describe("hackernews", () => {
  test("a post with no link is its discussion page; points are heat", () => {
    const body = JSON.stringify({
      hits: [
        {
          objectID: "46001",
          title: "Ask HN: something",
          url: null,
          points: 12,
          created_at: "2026-11-20T09:00:00Z",
        },
        { objectID: "46002", title: "Show HN: a tool", url: "https://example.org/tool", points: 3 },
        // No link and an ID that is not a number: no page to point to.
        { objectID: "abc", title: "odd", url: "" },
        { objectID: "46003", title: "", url: "https://example.org/untitled" },
      ],
    });
    expect(hackernews.parse(body, "")).toEqual([
      {
        url: "https://news.ycombinator.com/item?id=46001",
        title: "Ask HN: something",
        publishedAt: Date.UTC(2026, 10, 20, 9),
        heat: 12,
      },
      { url: "https://example.org/tool", title: "Show HN: a tool", publishedAt: null, heat: 3 },
    ]);
  });
});

describe("IDs become pages on the source's own site", () => {
  test("Hugging Face models, Spaces and papers", () => {
    const repos = JSON.stringify([
      { id: "org/model-7B", likes: 10, createdAt: "2026-11-20T00:00:00.000Z" },
      { id: "solo-model" },
      // An ID that would leave the site is not an item.
      { id: "//evil.example/x" },
      { id: "" },
      { likes: 3 },
    ]);
    expect(urls(huggingface.parse(repos, ""))).toEqual([
      "https://huggingface.co/org/model-7B",
      "https://huggingface.co/solo-model",
    ]);
    expect(urls(hfSpaces.parse(repos, ""))).toEqual([
      "https://huggingface.co/spaces/org/model-7B",
      "https://huggingface.co/spaces/solo-model",
    ]);
    const papers = JSON.stringify([
      // Dated the day it was featured, not its arXiv date.
      {
        paper: {
          id: "2611.01234",
          title: "A paper",
          upvotes: 40,
          publishedAt: "2026-11-10T19:00:00Z",
          submittedOnDailyAt: "2026-11-23T00:00:00Z",
        },
        publishedAt: "2026-11-10T19:00:00Z",
      },
      // No featured date: the arXiv date, from the entry or else the paper.
      {
        paper: { id: "2611.05678", title: "B", publishedAt: "2026-11-18T00:00:00Z" },
        publishedAt: "2026-11-19T00:00:00Z",
      },
      { paper: { id: "2611.09999", title: "C", publishedAt: "2026-11-17T00:00:00Z" } },
      { paper: { title: "no id" } },
      { title: "no paper" },
    ]);
    expect(dailyPapers.parse(papers, "")).toEqual([
      {
        url: "https://huggingface.co/papers/2611.01234",
        title: "A paper",
        publishedAt: Date.UTC(2026, 10, 23),
        heat: 40,
      },
      {
        url: "https://huggingface.co/papers/2611.05678",
        title: "B",
        publishedAt: Date.UTC(2026, 10, 19),
        heat: null,
      },
      {
        url: "https://huggingface.co/papers/2611.09999",
        title: "C",
        publishedAt: Date.UTC(2026, 10, 17),
        heat: null,
      },
    ]);
  });

  test("OpenRouter: `vendor/model:variant`, name as title, created in seconds", () => {
    const body = JSON.stringify({
      data: [
        { id: "vendor/model:free", name: "Vendor: Model (free)", created: 1795000000 },
        { id: "vendor/plain", created: "1795000000" },
        { id: "//evil.example", name: "x" },
      ],
    });
    expect(openrouter.parse(body, "")).toEqual([
      {
        url: "https://openrouter.ai/vendor/model:free",
        title: "Vendor: Model (free)",
        publishedAt: 1795000000000,
        heat: null,
      },
      // No name: the ID is the title. A date that is not a number is no date.
      {
        url: "https://openrouter.ai/vendor/plain",
        title: "vendor/plain",
        publishedAt: null,
        heat: null,
      },
    ]);
  });
});

describe("wikipedia", () => {
  const body = (articles: unknown[]) =>
    JSON.stringify({
      items: [{ project: "en.wikipedia", year: "2026", month: "11", day: "22", articles }],
    });

  test("only articles: not the main page, not other namespaces", () => {
    const items = wikipedia.parse(
      body([
        { article: "Main_Page", views: 9000000, rank: 1 },
        { article: "Special:Search", views: 800000, rank: 2 },
        { article: "Wikipedia:Featured_pictures", views: 1, rank: 3 },
        { article: "User_talk:Someone", views: 1, rank: 4 },
        { article: "Portal:Current_events", views: 1, rank: 5 },
        { article: "File:Example.jpg", views: 1, rank: 6 },
        { article: "-", views: 1, rank: 7 },
        { article: "Star_Wars:_Episode_IV", views: 50000, rank: 8 },
        { article: "AC/DC", views: 40000, rank: 9 },
        { article: "What?_(song)", views: 30000, rank: 10 },
      ]),
      "",
    );
    expect(items).toEqual([
      {
        url: "https://en.wikipedia.org/wiki/Star_Wars:_Episode_IV",
        title: "Star Wars: Episode IV",
        publishedAt: Date.UTC(2026, 10, 22),
        heat: 50000,
      },
      {
        url: "https://en.wikipedia.org/wiki/AC/DC",
        title: "AC/DC",
        publishedAt: Date.UTC(2026, 10, 22),
        heat: 40000,
      },
      {
        url: "https://en.wikipedia.org/wiki/What%3F_(song)",
        title: "What? (song)",
        publishedAt: Date.UTC(2026, 10, 22),
        heat: 30000,
      },
    ]);
  });

  test("links are written as Wikipedia writes them: `,` kept, `%` and `#` escaped", () => {
    const items = wikipedia.parse(
      body([
        { article: "Washington,_D.C.", views: 3 },
        { article: "100%_Pure", views: 2 },
        { article: "C#", views: 1 },
      ]),
      "",
    );
    expect(urls(items)).toEqual([
      "https://en.wikipedia.org/wiki/Washington,_D.C.",
      "https://en.wikipedia.org/wiki/100%25_Pure",
      "https://en.wikipedia.org/wiki/C%23",
    ]);
  });

  test("a title with `//` is refused, not turned into a path", () => {
    expect(wikipedia.parse(body([{ article: "//evil.example", views: 1 }]), "")).toEqual([]);
  });

  test("a list without a usable day has no date", () => {
    const noDay = JSON.stringify({ items: [{ articles: [{ article: "X", views: 1 }] }] });
    expect(wikipedia.parse(noDay, "")[0]?.publishedAt).toBeNull();
  });
});

describe("mastodon", () => {
  test("heat is today's uses, sent as a decimal string", () => {
    const body = JSON.stringify([
      {
        url: "https://example.org/a",
        title: "A",
        published_at: "2026-11-22T10:00:00.000Z",
        history: [
          { day: "1795392000", uses: "41", accounts: "30" },
          { day: "1795305600", uses: "7", accounts: "7" },
        ],
      },
      { url: "https://example.org/b", title: "B", published_at: null, history: [] },
      { url: "https://example.org/c", title: "C", history: [{ uses: "many" }] },
    ]);
    expect(mastodon.parse(body, "")).toEqual([
      {
        url: "https://example.org/a",
        title: "A",
        publishedAt: Date.UTC(2026, 10, 22, 10),
        heat: 41,
      },
      { url: "https://example.org/b", title: "B", publishedAt: null, heat: null },
      { url: "https://example.org/c", title: "C", publishedAt: null, heat: null },
    ]);
  });
});

describe("federal_register", () => {
  test("a search with no match leaves `results` out: no items", () => {
    expect(federalRegister.parse('{"count":0,"description":"x","total_pages":0}', "")).toEqual([]);
  });
});

test("items without an absolute http(s) URL or a title are skipped", () => {
  const bad = [
    {
      url: "javascript:alert(1)",
      title: "a",
      html_url: "javascript:alert(1)",
      full_name: "a",
      name: "a",
    },
    { url: "/relative", title: "b", html_url: "/relative", full_name: "b", name: "b" },
    {
      url: "https://example.org/c",
      title: "",
      html_url: "https://example.org/c",
      full_name: "",
      name: "",
    },
  ];
  expect(devto.parse(JSON.stringify(bad), "")).toEqual([]);
  expect(mastodon.parse(JSON.stringify(bad), "")).toEqual([]);
  expect(github.parse(JSON.stringify({ items: bad }), "")).toEqual([]);
  expect(appStore.parse(JSON.stringify({ feed: { results: bad } }), "")).toEqual([]);
  expect(federalRegister.parse(JSON.stringify({ count: 3, results: bad }), "")).toEqual([]);
  expect(hackernews.parse(JSON.stringify({ hits: bad }), "")).toEqual([]);
});
