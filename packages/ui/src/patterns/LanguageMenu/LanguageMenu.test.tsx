/** @jsxImportSource preact */
import { describe, expect, test } from "bun:test";
import type { VNode } from "preact";
import { Document, renderDocument } from "../../runtime/index.ts";
import menuStates from "./LanguageMenu.states.tsx";
import { LanguageMenu } from "./LanguageMenu.tsx";

function body(node: VNode): string {
  const html = renderDocument(
    <Document lang="en" title="T">
      {node}
    </Document>,
  );
  return html.slice(html.indexOf("<body>") + 6, html.indexOf("</body>"));
}

describe("language menu", () => {
  test("a disclosure of links, one per language, the current one marked", () => {
    const zh = menuStates.states.zh;
    if (zh === undefined) throw new Error("the zh state");
    const html = body(<LanguageMenu {...zh} />);
    expect(html).toStartWith('<div class="LanguageMenu"><details class="LanguageMenu-details">');
    expect(html).toContain('<summary class="LanguageMenu-button" aria-label="语言：中文">');
    expect(html).toContain('<span class="LanguageMenu-current">中文</span>');
    expect(html).toContain(
      '<a class="LanguageMenu-link" href="/" hreflang="en" lang="en">English</a>',
    );
    expect(html).toContain(
      '<a class="LanguageMenu-link" href="/zh/" hreflang="zh" lang="zh" aria-current="true">中文</a>',
    );
    expect(html.match(/aria-current/g)?.length).toBe(1);
    expect(html).not.toContain("<script");
    expect(html).not.toContain("style=");
  });

  test("names and labels are text", () => {
    const html = body(
      <LanguageMenu
        label={'"><b>'}
        links={[{ href: "/?a=1&b=2", lang: "en", name: "<i>", current: true }]}
      />,
    );
    expect(html).toContain('aria-label="&quot;>&lt;b>"');
    expect(html).toContain('href="/?a=1&amp;b=2"');
    expect(html).toContain(">&lt;i></span>");
  });

  test("every state renders a menu", () => {
    for (const props of Object.values(menuStates.states)) {
      expect(body(<LanguageMenu {...props} />)).toStartWith('<div class="LanguageMenu">');
    }
  });
});
