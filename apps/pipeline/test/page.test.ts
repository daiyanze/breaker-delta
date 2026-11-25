/** Reading one evidence page for the enrich step (#45): fetch with caps, extract its text. */
import { describe, expect, test } from "bun:test";
import { fetchPage, htmlText, pageText } from "../src/sources/page.ts";

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
