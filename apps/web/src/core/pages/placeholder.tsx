/** @jsxImportSource preact */
/** The page the site serves when no query layer is configured. */
import { Band } from "@bd/ui/patterns";
import { Document } from "@bd/ui/runtime";
import type { VNode } from "preact";
import { siteHead } from "./head.tsx";

export function placeholderPage(): { document: VNode } {
  return {
    document: (
      <Document lang="en" title="Breaker Delta" head={siteHead()}>
        <header class="page">
          <h1>Breaker Delta</h1>
        </header>
        <main class="page">
          <Band id="scaffold" name="Scaffold">
            <p>2.0 scaffold. The site arrives in milestone M3.</p>
          </Band>
        </main>
      </Document>
    ),
  };
}
