/** @jsxImportSource preact */
/** What every page of the site adds to the `<head>` after the stylesheet, and its language menu. */
import type { SiteMeta } from "@bd/contracts";
import { LanguageMenu } from "@bd/ui/patterns";
import type { VNode } from "preact";
import { ICON_LINKS } from "../icon.ts";
import { alternates, locate, pathIn } from "../languages.ts";
import type { RouteContext } from "../routes.ts";
import { LANGUAGE_NAMES, translator } from "../strings/index.ts";

/** Until launch, no page is indexed; then the icons, then the page in each language. */
export function siteHead(languages: readonly { hreflang: string; href: string }[] = []): VNode {
  return (
    <>
      <meta name="robots" content="noindex" />
      {ICON_LINKS.map((link) => (
        <link key={link.href} {...link} />
      ))}
      {languages.map((l) => (
        <link key={l.hreflang} rel="alternate" hreflang={l.hreflang} href={l.href} />
      ))}
    </>
  );
}

/**
 * The page's head and language menu (#107): `hreflang` for every enabled
 * language plus `x-default`, and links to the same page, query included,
 * in each language. No menu when one language is enabled.
 */
export function pageLanguages(
  ctx: Pick<RouteContext, "url" | "lang">,
  meta: Pick<SiteMeta, "languages" | "defaultLanguage">,
): { head: VNode; menu: VNode | null } {
  const at = locate(ctx.url.pathname, meta);
  const path = (at.kind === "page" ? at.path : at.location) + ctx.url.search;
  const head = siteHead(alternates(path, ctx.url.origin, meta));
  if (meta.languages.length < 2) return { head, menu: null };
  const t = translator(ctx.lang);
  const menu = (
    <LanguageMenu
      label={t("language.menu", { language: LANGUAGE_NAMES[ctx.lang] })}
      links={meta.languages.map((lang) => ({
        href: pathIn(path, lang, meta),
        lang,
        name: LANGUAGE_NAMES[lang],
        current: lang === ctx.lang,
      }))}
    />
  );
  return { head, menu };
}
