/**
 * The feed adapters (M1-06). Each reads its recorded fixture
 * (`bun run record-fixture <group>`, scrubbed), and each rule it adds on top
 * of `parseFeed` is tested with a hand-written body in the source's own form.
 */
import { describe, expect, test } from "bun:test";
import { type Adapter, ParseError, type SourceItem } from "../adapter.ts";
import { LAUNCH_GROUPS } from "../launch-groups.ts";
import { arxiv } from "./arxiv.ts";
import { googleNews, officialBlogs, techMedia } from "./feeds.ts";
import { githubReleases } from "./github-releases.ts";

const fixture = (a: Adapter) =>
  Bun.file(new URL(`../fixtures/${a.groupId}.xml`, import.meta.url)).text();

const groupOf = (a: Adapter) => {
  const g = LAUNCH_GROUPS.find((x) => x.id === a.groupId);
  if (!g) throw new Error(`no launch group ${a.groupId}`);
  return g;
};

const LLAMA = "https://github.com/ggml-org/llama.cpp/releases.atom";

/** The first item each recorded fixture yields, read from the URL it was recorded from. */
const FIRST: [Adapter, string, SourceItem][] = [
  [
    arxiv,
    "",
    {
      url: "https://example.com/item/6",
      title: "text 5",
      publishedAt: Date.UTC(2026, 10, 20, 18, 58, 45),
      heat: null,
    },
  ],
  [
    githubReleases,
    LLAMA,
    {
      url: "https://example.com/item/6",
      title: "ggml-org/llama.cpp text 7",
      publishedAt: Date.UTC(2026, 10, 23, 8, 56, 20),
      heat: null,
    },
  ],
  [
    googleNews,
    "",
    {
      url: "https://example.com/item/12",
      title: "text 11",
      publishedAt: Date.UTC(2026, 10, 22, 19, 12, 41),
      heat: null,
    },
  ],
  [
    officialBlogs,
    "",
    {
      url: "https://example.com/item/12",
      title: "text 10",
      publishedAt: Date.UTC(2026, 10, 22),
      heat: null,
    },
  ],
  [
    techMedia,
    "",
    {
      url: "https://example.com/item/12",
      title: "text 11",
      publishedAt: Date.UTC(2026, 10, 23, 1, 25, 53),
      heat: null,
    },
  ],
];

describe("feed adapters read their recorded fixtures", () => {
  for (const [adapter, url, first] of FIRST) {
    test(adapter.groupId, async () => {
      const items = adapter.parse(await fixture(adapter), url);
      expect(items).toHaveLength(5);
      expect(items[0]).toEqual(first);
    });
  }
});

describe("feed adapters refuse a body that is not a feed", () => {
  for (const [adapter, url] of FIRST) {
    test(adapter.groupId, () => {
      expect(() => adapter.parse('{"items":[]}', url)).toThrow(ParseError);
      expect(() => adapter.parse("<html><body>rate limited</body></html>", url)).toThrow(
        ParseError,
      );
      expect(() => adapter.parse("", url)).toThrow(ParseError);
    });
  }
});

describe("URLs", () => {
  test("bundle groups fetch every member, each as its own URL", () => {
    for (const a of [officialBlogs, techMedia, githubReleases]) {
      const group = groupOf(a);
      expect(group.countsAsOne).toBe(true);
      expect(a.urls(group, 0)).toEqual(group.members ?? []);
      expect(a.urls(group, 0).length).toBeGreaterThan(1);
    }
  });

  test("arxiv asks for the newest submissions in its three categories", () => {
    const [url, ...rest] = arxiv.urls(groupOf(arxiv), 0);
    expect(rest).toEqual([]);
    const params = new URL(url ?? "").searchParams;
    // `+` in a query string is a space: arXiv reads `cat:cs.AI OR cat:cs.CL OR cat:cs.LG`.
    expect(params.get("search_query")).toBe("cat:cs.AI OR cat:cs.CL OR cat:cs.LG");
    expect(params.get("sortBy")).toBe("submittedDate");
    expect(params.get("sortOrder")).toBe("descending");
  });

  test("google_news fetches the URL the reachability probe checked", () => {
    expect(googleNews.urls(groupOf(googleNews), 0)).toEqual([groupOf(googleNews).probeUrl]);
  });
});

describe("one failing feed in a combined group does not affect the others", () => {
  test("each member is parsed on its own; a broken one throws for its URL only", async () => {
    for (const a of [officialBlogs, techMedia, githubReleases]) {
      const [first, second, third] = a.urls(groupOf(a), 0);
      const good = await fixture(a);
      const bodies: [string | undefined, string][] = [
        [first, good],
        [second, "<html><body>503 Service Unavailable</body></html>"],
        [third, good],
      ];
      const read = bodies.map(([url, body]) => {
        try {
          return a.parse(body, url ?? "").length;
        } catch (e) {
          return e instanceof ParseError ? "failed" : "threw";
        }
      });
      expect(read).toEqual([5, "failed", 5]);
    }
  });

  test("a member whose items are all unusable is empty, not an error", () => {
    const body = `<rss version="2.0"><channel><item><title>no link</title></item></channel></rss>`;
    expect(officialBlogs.parse(body, "")).toEqual([]);
  });
});

describe("gh_releases", () => {
  const atom = (title: string) => `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
  <title>Release notes from vllm</title>
  <entry>
    <id>tag:github.com,2008:Repository/599547518/v0.11.0</id>
    <updated>2026-11-20T10:00:00Z</updated>
    <link rel="alternate" type="text/html" href="https://github.com/vllm-project/vllm/releases/tag/v0.11.0"/>
    <title>${title}</title>
    <content type="html">&lt;p&gt;notes&lt;/p&gt;</content>
    <media:thumbnail height="30" width="30" url="https://avatars.githubusercontent.com/u/1?s=60&amp;v=4"/>
  </entry>
</feed>`;

  test("the title names the repository the feed is for, dated by `updated`", () => {
    expect(
      githubReleases.parse(atom("v0.11.0"), "https://github.com/vllm-project/vllm/releases.atom"),
    ).toEqual([
      {
        url: "https://github.com/vllm-project/vllm/releases/tag/v0.11.0",
        title: "vllm-project/vllm v0.11.0",
        publishedAt: Date.UTC(2026, 10, 20, 10),
        heat: null,
      },
    ]);
  });

  test("every member's repository is read from its URL", () => {
    const titles = groupOf(githubReleases).members?.map(
      (url) => githubReleases.parse(atom("v1"), url)[0]?.title,
    );
    expect(titles).toEqual([
      "ggml-org/llama.cpp v1",
      "vllm-project/vllm v1",
      "anthropics/claude-code v1",
    ]);
  });

  test("a URL that is not a GitHub releases feed adds no prefix", () => {
    expect(githubReleases.parse(atom("v1"), "https://example.org/x.atom")[0]?.title).toBe("v1");
    expect(githubReleases.parse(atom("v1"), "")[0]?.title).toBe("v1");
  });
});

describe("arxiv", () => {
  const feed = (entries: string) => `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:arxiv="http://arxiv.org/schemas/atom"
  xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/">
  <opensearch:totalResults>2</opensearch:totalResults>
  ${entries}
</feed>`;

  test("a paper is its abstract page, dated by its first version, not its latest", () => {
    const body = feed(`<entry>
    <id>http://arxiv.org/abs/2611.01234v3</id>
    <updated>2026-11-22T17:00:00Z</updated>
    <published>2026-09-01T12:00:00Z</published>
    <title>Scaling Laws for
      Something&#8217;s Models</title>
    <link href="https://arxiv.org/abs/2611.01234v3" rel="alternate" type="text/html"/>
    <link title="pdf" href="https://arxiv.org/pdf/2611.01234v3" rel="related" type="application/pdf"/>
    <arxiv:primary_category term="cs.CL"/>
  </entry>`);
    expect(arxiv.parse(body, "")).toEqual([
      {
        url: "https://arxiv.org/abs/2611.01234v3",
        title: "Scaling Laws for Something’s Models",
        publishedAt: Date.UTC(2026, 8, 1, 12),
        heat: null,
      },
    ]);
  });

  test("an error the API sends with HTTP 200 is a ParseError, not an item", () => {
    const body = feed(`<entry>
    <id>http://arxiv.org/api/errors#incorrect_id_format_for_x</id>
    <title>Error</title>
    <summary>incorrect id format for x</summary>
    <updated>2026-11-23T00:00:00-05:00</updated>
    <link href="http://arxiv.org/api/errors#incorrect_id_format_for_x" rel="alternate" type="text/html"/>
  </entry>`);
    expect(() => arxiv.parse(body, "")).toThrow(ParseError);
  });

  test("no new papers is no items", () => {
    expect(arxiv.parse(feed(""), "")).toEqual([]);
  });
});

describe("google_news", () => {
  test("links stay Google's article pages; the publisher element is not the item", () => {
    const body = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel>
  <title>"AI" - Google News</title>
  <item>
    <title>A headline &amp; more - The Publisher</title>
    <link>https://news.google.com/rss/articles/CBMiAbc?oc=5</link>
    <guid isPermaLink="false">CBMiAbc</guid>
    <pubDate>Sun, 22 Nov 2026 19:12:41 GMT</pubDate>
    <description>&lt;a href="https://news.google.com/rss/articles/CBMiAbc?oc=5"&gt;A headline&lt;/a&gt;</description>
    <source url="https://publisher.example">The Publisher</source>
  </item>
</channel></rss>`;
    expect(googleNews.parse(body, "")).toEqual([
      {
        url: "https://news.google.com/rss/articles/CBMiAbc?oc=5",
        title: "A headline & more - The Publisher",
        publishedAt: Date.UTC(2026, 10, 22, 19, 12, 41),
        heat: null,
      },
    ]);
  });
});
