/** @jsxImportSource preact */
/**
 * The page the site serves when no query layer is configured. Without one
 * the site knows no languages, so the page is English and has no menu.
 */
import { Band } from "@bd/ui/patterns";
import { Document } from "@bd/ui/runtime";
import type { VNode } from "preact";
import { translator } from "../strings/index.ts";
import { siteHead } from "./head.tsx";

export function placeholderPage(): { document: VNode } {
  const t = translator("en");
  return {
    document: (
      <Document lang="en" title="Breaker Delta" head={siteHead()}>
        <header class="page">
          <h1>Breaker Delta</h1>
        </header>
        <main class="page">
          <Band id="scaffold" name={t("scaffold.name")}>
            <p>{t("scaffold.text")}</p>
          </Band>
        </main>
      </Document>
    ),
  };
}
