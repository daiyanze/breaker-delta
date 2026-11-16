import Link from "next/link";

import { LANGS, type Lang } from "../lib/data";
import { s, sArr } from "../lib/strings";

const LANG_SHORT: Record<Lang, string> = { zh: "中", en: "EN", ja: "日" };

/** Page masthead: wordmark + nav tabs + language switcher. Mirrors
 * the static build's mast (same classes, same tab set). */
export function Mast({ lang, active }: { lang: Lang; active: string }) {
  const tabs = sArr(lang, "tabs");
  // Static tab order: board, rising, echoes, categories, sources,
  // archive, about, record, landing — hrefs in the static site are
  // flat .html files; here they are routes under /{lang}.
  const hrefs = [
    "",
    "rising",
    "echoes",
    "categories",
    "sources",
    "archive",
    "about",
    "track-record",
    "landing",
  ];
  return (
    <>
      <header className="mast">
        <span className="wordmark">{s(lang, "site_name")}</span>
        <span className="mast-ctl">
          <span className="langs">
            {LANGS.map((l) => (
              <Link key={l} href={`/${l}`} className={l === lang ? "on" : ""}>
                {LANG_SHORT[l]}
              </Link>
            ))}
          </span>
        </span>
      </header>
      <nav className="tabs">
        {tabs.map((label, i) => (
          <Link
            key={i}
            href={`/${lang}${hrefs[i] ? `/${hrefs[i]}` : ""}`}
            className={hrefs[i] === active ? "on" : ""}
          >
            {label}
          </Link>
        ))}
      </nav>
    </>
  );
}
