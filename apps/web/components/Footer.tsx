import Link from "next/link";

import type { Lang } from "../lib/data";
import { s, sArr } from "../lib/strings";

export const DOCS_URL = process.env.BD_DOCS_URL ?? "https://docs.breakerdelta.com/";

/** Page footer (foot() in render.ts): copyright, about, docs,
 * GitHub, X, RSS, Atom. Feed links are per-language in the static
 * site (relative feed.xml inside each language dir). */
export function Footer({ lang }: { lang: Lang }) {
  const prefix = lang === "zh" ? "" : `${lang}/`;
  const feedPrefix = lang === "zh" ? "/" : `/${lang}/`;
  return (
    <footer>
      <div className="copy">
        © 2026 Dai · <Link href={`/${lang}/about`}>{s(lang, "foot_about")}</Link> ·{" "}
        <a href={`${DOCS_URL}${prefix}docs.html`}>{sArr(lang, "tabs")[9]}</a> ·{" "}
        <a href="https://github.com/daiyanze/breaker-delta" rel="noopener">
          GitHub
        </a>{" "}
        ·{" "}
        <a href="https://x.com/daiyanze" rel="noopener">
          X
        </a>{" "}
        · <a href={`${feedPrefix}feed.xml`}>RSS</a> ·{" "}
        <a href={`${feedPrefix}atom.xml`}>Atom</a>
      </div>
    </footer>
  );
}
