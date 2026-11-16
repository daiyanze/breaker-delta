import Link from "next/link";

import { LANG_LABEL } from "@breaker-delta/publisher";

import { LANGS, type Lang } from "../lib/data";
import { s, sArr } from "../lib/strings";
import { DOCS_URL } from "./Footer";
import { ThemeToggle } from "./ThemeToggle";

/** Tab keys in the static mast's order; the docs tab links out to
 * the standalone docs site. */
const TAB_KEYS = [
  "index",
  "rising",
  "echoes",
  "submit",
  "categories",
  "sources",
  "track",
  "archive",
  "about",
  "docs",
] as const;

const TAB_HREFS: Record<string, string> = {
  index: "",
  rising: "rising",
  echoes: "echoes",
  submit: "submit",
  categories: "categories",
  sources: "sources",
  track: "track-record",
  archive: "archive",
  about: "about",
};

/** Page masthead: brand mark, wordmark + site name, theme toggle,
 * language switcher (same page in each language, like the static
 * build), nav tabs. `active` is a tab key; `path` is the current
 * page's route suffix ("" for the board). */
export function Mast({
  lang,
  active,
  path = "",
}: {
  lang: Lang;
  active: string;
  path?: string;
}) {
  const tabs = sArr(lang, "tabs");
  const prefix = lang === "zh" ? "" : `${lang}/`;
  return (
    <>
      <header className="mast">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="mastmark" src="/icon-96.png" alt="" />
        <div>
          <div className="wordmark">BREAKER DELTA</div>
          <div className="pg-title">{s(lang, "site_name")}</div>
        </div>
        <div className="mast-ctl">
          <ThemeToggle title={s(lang, "theme")} />
          <span className="langs">
            {LANGS.map((l) => (
              <Link
                key={l}
                href={`/${l}${path ? `/${path}` : ""}`}
                className={l === lang ? "on" : ""}
              >
                {LANG_LABEL[l]}
              </Link>
            ))}
          </span>
        </div>
      </header>
      <nav className="tabs">
        {tabs.map((label, i) => {
          const key = TAB_KEYS[i];
          if (key === "docs") {
            return (
              <a key={key} href={`${DOCS_URL}${prefix}docs.html`}>
                {label}
              </a>
            );
          }
          const href = TAB_HREFS[key];
          return (
            <Link
              key={key}
              href={`/${lang}${href ? `/${href}` : ""}`}
              className={key === active ? "on" : ""}
            >
              {label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
