/** @jsxImportSource preact */
/**
 * The masthead every public page opens with (#110): the `Masthead` of
 * `@bd/ui`, filled from the string tables in the page's language, each
 * section's link in that language too. Pages that are not built yet are
 * linked already, at the paths their issues will serve them on.
 */
import type { Language } from "@bd/contracts";
import { Masthead } from "@bd/ui/patterns";
import type { ComponentChildren, VNode } from "preact";
import { type Languages, pathIn } from "../languages.ts";
import { type StringKey, translator } from "../strings/index.ts";

/** The site's sections, in the masthead's order. */
export const SECTIONS = [
  { section: "front", path: "/", label: "nav.front" },
  { section: "changes", path: "/changes", label: "nav.changes" },
  { section: "echoes", path: "/echoes", label: "nav.echoes" },
  { section: "record", path: "/record", label: "nav.record" },
  { section: "sources", path: "/sources", label: "nav.sources" },
  { section: "about", path: "/about", label: "nav.about" },
] as const satisfies readonly { section: string; path: string; label: StringKey }[];

export type Section = (typeof SECTIONS)[number]["section"];

export interface MastheadOptions {
  lang: Language;
  /** The site's languages, which set each link's path; the placeholder has none. */
  site?: Languages;
  /** The section the page belongs to, marked in the navigation. */
  current: Section | null;
  /** The wordmark: the site's name. */
  name: string;
  /** The wordmark is the page's heading: the front page's. */
  heading?: boolean;
  /** The language menu and the theme switch. */
  tools?: ComponentChildren;
}

export function pageMasthead(o: MastheadOptions): VNode {
  const t = translator(o.lang);
  const path = (p: string) => (o.site === undefined ? p : pathIn(p, o.lang, o.site));
  return (
    <header class="page">
      <Masthead
        home={path("/")}
        name={o.name}
        navLabel={t("nav.label")}
        sectionsLabel={t("nav.sections")}
        links={SECTIONS.map((s) => ({
          href: path(s.path),
          label: t(s.label),
          current: s.section === o.current,
        }))}
        heading={o.heading === true}
        tools={o.tools}
      />
    </header>
  );
}
