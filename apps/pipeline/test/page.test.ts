/** Reading one evidence page for the enrich step (#45): fetch with caps, extract its text. */
import { describe, expect, test } from "bun:test";
import { fetchPage, htmlText, isPublicHost, pageText } from "../src/sources/page.ts";

/** Hand-written markup in the shapes real pages use; no fetched text (invariant 6). */
const ARTICLE = `<!doctype html>
<html><head><title>Ignored head</title>
<meta charset="utf-8"><style>p { color: red } </p></style>
<script>if (a < b && "</div>") { document.write("<p>no</p>") }</script>
</head>
<body>
<nav><a href="/">Home</a> <a href="/about">About</a></nav>
<!-- a comment <p>hidden</p> -->
<article>
  <h1>Model&nbsp;X ships</h1>
  <p>It&#8217;s out &amp; it&#x2014;works.<br>Second line</p>
  <p data-x="a > b">Quoted &gt; attribute</p>
  <ul><li>One</li><li>Two</li></ul>
  <template><p>template text</p></template>
  <svg><text>svg text</text></svg>
  <noscript>enable js</noscript>
  <p>1 < 2 and &unknown; stays</p>
</article>
<aside>Related links</aside>
<footer>Copyright</footer>
</body></html>`;

describe("htmlText", () => {
  test("keeps the visible text, one block per line, and decodes character references", () => {
    expect(htmlText(ARTICLE)).toBe(
      [
        "Model X ships",
        "It’s out & it—works.",
        "Second line",
        "Quoted > attribute",
        "One",
        "Two",
        "1 < 2 and &unknown; stays",
      ].join("\n"),
    );
  });

  test("drops script, style, comments, nav, aside and footer, whatever case the tags use", () => {
    const text = htmlText(
      "<SCRIPT>x()</SCRIPT><Style>a{}</Style><NAV>n</NAV><p>kept</p><!-- c --><Footer>f</Footer>",
    );
    expect(text).toBe("kept");
  });

  test("an unclosed comment or skipped element ends the text; an unclosed tag is dropped", () => {
    expect(htmlText("<p>before</p><!-- never closed <p>after</p>")).toBe("before");
    expect(htmlText("<p>before</p><script>never closed")).toBe("before");
    expect(htmlText("<p>before</p><div class='x")).toBe("before");
  });

  test("invalid numeric references become U+FFFD", () => {
    expect(htmlText("a&#0;b&#xD800;c&#x110000;d")).toBe("a�b�c�d");
  });

  test("a head whose end tag is left out ends at <body>", () => {
    expect(
      htmlText(
        "<!doctype html><html><head><title>T</title><body><p>Article text</p></body></html>",
      ),
    ).toBe("Article text");
  });

  test("a `<body>` inside a head's script or style does not end the head", () => {
    expect(
      htmlText(
        '<html><head><script>document.write("<body>"); hiddenCall()</script></head><body><p>A</p></body></html>',
      ),
    ).toBe("A");
    expect(htmlText("<head><style>/* <body> */ a{}</style><title>T</title><body><p>B</p>")).toBe(
      "B",
    );
  });

  test("an apostrophe in an unquoted attribute value does not open a quote", () => {
    expect(htmlText("<p>Before</p><img alt=it's src=x.png><p>After text</p>")).toBe(
      "Before\nAfter text",
    );
  });

  test("a long run of markup is read in linear time", () => {
    const html = `${"<div a='1'>".repeat(50_000)}x${"<!-".repeat(50_000)}`;
    const started = performance.now();
    htmlText(html);
    expect(performance.now() - started).toBeLessThan(1_000);
  });
});

describe("pageText", () => {
  test("reads HTML, XHTML, a missing type as HTML, and plain text as it is", () => {
    expect(pageText("<p>a</p>", "text/html; charset=utf-8", 100)).toBe("a");
    expect(pageText("<p>a</p>", "application/xhtml+xml", 100)).toBe("a");
    expect(pageText("<p>a</p>", null, 100)).toBe("a");
    expect(pageText("  line one \n\n\n line   two ", "text/plain", 100)).toBe("line one\nline two");
  });

  test("other types have no text", () => {
    expect(pageText("{}", "application/json", 100)).toBeNull();
    expect(pageText("%PDF", "application/pdf", 100)).toBeNull();
  });

  test("an empty page has no text", () => {
    expect(pageText("<script>x</script>", "text/html", 100)).toBeNull();
  });

  test("the text is cut to the cap without splitting a surrogate pair", () => {
    expect(pageText("abcdef", "text/plain", 4)).toBe("abcd");
    expect(pageText("ab\u{1F600}cd", "text/plain", 3)).toBe("ab");
  });
});

function fakeFetch(respond: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: string[] = [];
  const f = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    calls.push(url);
    return respond(url, init);
  }) as typeof fetch;
  return { fetch: f, calls };
}

const OPTS = { timeoutMs: 1000, maxBytes: 1024 * 1024, maxChars: 4000 };

describe("isPublicHost", () => {
  test("public names and addresses pass", () => {
    for (const url of [
      "https://example.com/a",
      "http://news.example.co.uk/",
      "https://93.184.216.34/",
      "https://[2606:2800:220:1:248:1893:25c8:1946]/",
      "https://172.32.0.1/",
      "https://100.128.0.1/",
    ]) {
      expect([url, isPublicHost(new URL(url))]).toEqual([url, true]);
    }
  });

  test("loopback, private, link-local, unspecified and local names are refused", () => {
    for (const url of [
      "http://localhost/",
      "http://LOCALHOST:8080/",
      "http://app.localhost/",
      "http://router/",
      "http://printer.local/",
      "http://db.internal/",
      "http://nas.lan/",
      "http://x.home.arpa/",
      "http://127.0.0.1/",
      "http://127.1.2.3/",
      "http://2130706433/", // 127.0.0.1 as one number; the URL parser normalises it
      "http://0x7f.1/",
      "http://0.0.0.0/",
      "http://10.0.0.1/",
      "http://172.16.0.1/",
      "http://172.31.255.255/",
      "http://192.168.1.1/",
      "http://169.254.169.254/",
      "http://100.64.0.1/",
      "http://224.0.0.1/",
      "http://255.255.255.255/",
      "http://[::1]/",
      "http://[::]/",
      "http://[fe80::1]/",
      "http://[fc00::1]/",
      "http://[fd12:3456::1]/",
      "http://[ff02::1]/",
      "http://[::ffff:127.0.0.1]/",
      "http://[::ffff:192.168.0.1]/",
      "http://[::127.0.0.1]/", // IPv4-compatible, ::/96
      "http://[::8.8.8.8]/",
      "http://[::ffff:0:127.0.0.1]/", // IPv4-translated
      "http://[::ffff:0:8.8.8.8]/",
      "http://[64:ff9b::127.0.0.1]/", // NAT64
      "http://[64:ff9b::8.8.8.8]/",
      "http://[64:ff9b:1::1]/", // local-use NAT64, /48
      "http://[64:ff9b:1:ffff::1]/",
      "http://[fec0::1]/", // deprecated site-local
      "http://[feff::1]/",
    ]) {
      expect([url, isPublicHost(new URL(url))]).toEqual([url, false]);
    }
  });
});

describe("fetchPage", () => {
  test("returns the page's text", async () => {
    const f = fakeFetch(
      () => new Response("<p>Hello</p>", { headers: { "content-type": "text/html" } }),
    );
    expect(await fetchPage("https://x.test/a", { ...OPTS, fetch: f.fetch })).toEqual({
      ok: true,
      text: "Hello",
    });
    expect(f.calls).toEqual(["https://x.test/a"]);
  });

  test("only http(s) URLs are fetched", async () => {
    const f = fakeFetch(() => new Response("x"));
    for (const url of ["javascript:alert(1)", "file:///etc/passwd", "ftp://x.test/a", "nope"]) {
      expect(await fetchPage(url, { ...OPTS, fetch: f.fetch })).toEqual({
        ok: false,
        error: "not a web URL",
      });
    }
    expect(f.calls).toEqual([]);
  });

  test("a non-public host is not fetched", async () => {
    const f = fakeFetch(() => new Response("<p>local only</p>"));
    for (const url of ["http://127.0.0.1:8080/admin", "http://localhost/", "http://[::1]/"]) {
      expect(await fetchPage(url, { ...OPTS, fetch: f.fetch })).toEqual({
        ok: false,
        error: "not a public host",
      });
    }
    expect(f.calls).toEqual([]);
  });

  test("follows redirects itself, checking every hop", async () => {
    const hops: Record<string, Response> = {};
    const f = fakeFetch((url, init) => {
      expect(init?.redirect).toBe("manual");
      return hops[url] ?? new Response("gone", { status: 404 });
    });
    const redirect = (to: string, status = 302) =>
      new Response(null, { status, headers: { location: to } });
    hops["https://x.test/a"] = redirect("/b", 301);
    hops["https://x.test/b"] = redirect("https://y.test/c", 307);
    hops["https://y.test/c"] = new Response("<p>Landed</p>", {
      headers: { "content-type": "text/html" },
    });
    expect(await fetchPage("https://x.test/a", { ...OPTS, fetch: f.fetch })).toEqual({
      ok: true,
      text: "Landed",
    });
    expect(f.calls).toEqual(["https://x.test/a", "https://x.test/b", "https://y.test/c"]);
  });

  test("a redirect to a non-public host or another scheme is refused before it is fetched", async () => {
    for (const to of [
      "http://127.0.0.1/admin",
      "http://169.254.169.254/latest",
      "file:///etc/passwd",
    ]) {
      const f = fakeFetch((url) =>
        url === "https://x.test/a"
          ? new Response(null, { status: 302, headers: { location: to } })
          : new Response("<p>secret</p>"),
      );
      const result = await fetchPage("https://x.test/a", { ...OPTS, fetch: f.fetch });
      expect([to, result.ok]).toEqual([to, false]);
      expect(f.calls).toEqual(["https://x.test/a"]);
    }
  });

  test("a redirect without a location, or too many redirects, is a failure", async () => {
    const none = fakeFetch(() => new Response(null, { status: 302 }));
    expect(await fetchPage("https://x.test/a", { ...OPTS, fetch: none.fetch })).toEqual({
      ok: false,
      error: "redirect without a location",
    });
    let n = 0;
    const loop = fakeFetch(
      () => new Response(null, { status: 302, headers: { location: `/r${++n}` } }),
    );
    expect(await fetchPage("https://x.test/a", { ...OPTS, fetch: loop.fetch })).toEqual({
      ok: false,
      error: "too many redirects",
    });
    expect(loop.calls.length).toBe(6);
  });

  test("a failed status, a network error, a timeout or another type is a failure in its own words", async () => {
    const status = fakeFetch(() => new Response("secret body", { status: 403 }));
    expect(await fetchPage("https://x.test/a", { ...OPTS, fetch: status.fetch })).toEqual({
      ok: false,
      error: "HTTP 403",
    });
    const thrown = fakeFetch(() => {
      throw new TypeError("connect failed: quoted body");
    });
    expect(await fetchPage("https://x.test/a", { ...OPTS, fetch: thrown.fetch })).toEqual({
      ok: false,
      error: "TypeError",
    });
    const slow = fakeFetch(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    expect(
      await fetchPage("https://x.test/a", { ...OPTS, timeoutMs: 10, fetch: slow.fetch }),
    ).toEqual({ ok: false, error: "TimeoutError" });
    const pdf = fakeFetch(
      () => new Response("%PDF", { headers: { "content-type": "application/pdf" } }),
    );
    expect(await fetchPage("https://x.test/a", { ...OPTS, fetch: pdf.fetch })).toEqual({
      ok: false,
      error: "no text (application/pdf)",
    });
  });

  test("reads at most maxBytes of the body", async () => {
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled++;
        if (pulled > 1000) controller.close();
        else controller.enqueue(new TextEncoder().encode("a".repeat(1024)));
      },
    });
    const f = fakeFetch(() => new Response(body, { headers: { "content-type": "text/plain" } }));
    const result = await fetchPage("https://x.test/a", {
      ...OPTS,
      maxBytes: 4096,
      maxChars: 100_000,
      fetch: f.fetch,
    });
    expect(result).toEqual({ ok: true, text: "a".repeat(4096) });
    expect(pulled).toBeLessThan(10);
  });

  test("decodes the charset the response names, utf-8 when unknown", async () => {
    const latin1 = new Uint8Array([0x63, 0x61, 0x66, 0xe9]); // "café" in ISO-8859-1
    const named = fakeFetch(
      () => new Response(latin1, { headers: { "content-type": "text/plain; charset=iso-8859-1" } }),
    );
    expect(await fetchPage("https://x.test/a", { ...OPTS, fetch: named.fetch })).toEqual({
      ok: true,
      text: "café",
    });
    const unknown = fakeFetch(
      () =>
        new Response(new TextEncoder().encode("café"), {
          headers: { "content-type": "text/plain; charset=x-made-up" },
        }),
    );
    expect(await fetchPage("https://x.test/a", { ...OPTS, fetch: unknown.fetch })).toEqual({
      ok: true,
      text: "café",
    });
  });
});
