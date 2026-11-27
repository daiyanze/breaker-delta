/** @jsxImportSource preact */
import { describe, expect, test } from "bun:test";
import type { SourceGroup } from "@bd/contracts";
import type { VNode } from "preact";
import { Document, renderDocument } from "../../runtime/index.ts";
import SourceTile, { kindOf, SOURCE_KINDS, type SourceKind } from "./SourceTile.island.tsx";
import sourceTileStates from "./SourceTile.states.tsx";

// The tile's styles and their tests: `packages/ui/src/styles/styles.test.ts`.

/** What a tile renders to, through the one renderer the site uses. */
function body(node: VNode): string {
  const html = renderDocument(
    <Document lang="en" title="T">
      {node}
    </Document>,
  );
  return html.slice(html.indexOf("<body>") + 6, html.indexOf("</body>"));
}

describe("source tile markup", () => {
  test("an island around the tile and the name", () => {
    const html = body(
      <SourceTile name="Hacker News" fill="solid" kind="forum" label="Started here" />,
    );
    expect(html).toStartWith('<bd-island name="SourceTile"');
    expect(html).toContain('<span class="SourceTile" data-size="regular">');
    expect(html).toContain(
      '<span class="SourceTile-tile" data-fill="solid" role="img" aria-label="Started here">',
    );
    expect(html).toContain('<span class="SourceTile-name">Hacker News</span>');
  });

  test("without a label the tile is hidden from assistive technology", () => {
    const html = body(<SourceTile name="Reddit" fill="outline" kind="forum" size="small" />);
    expect(html).toContain('data-fill="outline" aria-hidden="true">');
    expect(html).toContain('data-size="small"');
    expect(html).not.toContain("role=");
  });

  test("without a favicon the generic icon is the only icon", () => {
    const html = body(<SourceTile name="A" fill="outline" kind="search" />);
    expect(html).not.toContain("<img");
    expect(html).toContain('data-kind="search"');
  });

  test("a favicon goes before the generic icon, which stays for when it fails", () => {
    const html = body(
      <SourceTile name="A" fill="outline" kind="press" favicon="https://example.com/f.ico" />,
    );
    const img = html.indexOf('<img class="SourceTile-favicon" src="https://example.com/f.ico"');
    expect(img).toBeGreaterThan(-1);
    expect(html.indexOf('class="SourceTile-glyph"')).toBeGreaterThan(img);
    // An empty alt (Preact writes `alt`, which HTML reads as `alt=""`): a
    // failed favicon draws nothing. No referrer goes to the site.
    expect(html).toContain('f.ico" alt loading="lazy"');
    expect(html).toContain('referrerpolicy="no-referrer"');
  });

  test("name and label are text", () => {
    const html = body(<SourceTile name="<b>" fill="solid" kind="code" label={'"x"'} />);
    expect(html).toContain('<span class="SourceTile-name">&lt;b></span>');
    expect(html).toContain('aria-label="&quot;x&quot;"');
  });

  test("each kind draws its own icon", () => {
    const drawn = SOURCE_KINDS.map((kind) => {
      const html = body(<SourceTile name="A" fill="outline" kind={kind} />);
      return html.slice(html.indexOf("<svg"), html.indexOf("</svg>"));
    });
    expect(new Set(drawn).size).toBe(SOURCE_KINDS.length);
  });

  test("every state renders a tile with its name", () => {
    for (const props of Object.values(sourceTileStates.states)) {
      expect(body(<SourceTile {...props} />)).toContain(
        `<span class="SourceTile-name">${props.name}</span>`,
      );
    }
  });
});

describe("kind of a source group", () => {
  test("every category has a kind, and the README's named ones their own icon", () => {
    // A `Record` over the contract's categories: a new category fails the type check here.
    const want: Record<SourceGroup["category"], SourceKind> = {
      lab_blog: "press",
      code_host: "code",
      forum: "forum",
      model_hub: "press",
      papers: "press",
      launches: "press",
      government: "press",
      key_accounts: "account",
      press: "press",
      search: "search",
      reference: "press",
      charts: "press",
    };
    for (const [category, kind] of Object.entries(want)) {
      expect({ category, kind: kindOf(category as SourceGroup["category"]) }).toEqual({
        category,
        kind,
      });
    }
  });
});
