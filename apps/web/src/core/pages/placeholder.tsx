/** @jsxImportSource preact */
/**
 * The page the site serves when no query layer is configured. Without one
 * the site knows no languages, so the page is English and has no menu. It
 * stands at `/`, so its masthead marks the front page; it has no island.
 */
import { Band } from "@bd/ui/patterns";
import { Document } from "@bd/ui/runtime";
import type { VNode } from "preact";
import { translator } from "../strings/index.ts";
import { siteHead } from "./head.tsx";
import { pageMasthead } from "./masthead.tsx";

export function placeholderPage(): { document: VNode } {
  const t = translator("en");
  return {
    document: (
      <Document lang="en" title="Breaker Delta" head={siteHead()}>
        {pageMasthead({ lang: "en", current: "front", name: "Breaker Delta", heading: true })}
        <main class="page">
          <Band id="scaffold" name={t("scaffold.name")}>
            <p>{t("scaffold.text")}</p>
          </Band>
        </main>
      </Document>
    ),
  };
}
