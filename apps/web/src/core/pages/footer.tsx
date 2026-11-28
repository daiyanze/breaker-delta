/** @jsxImportSource preact */
/**
 * The footer every public page ends with (#111), in the page's language.
 * The subscribe form shows only when the site sends email (`mail.enabled`;
 * #81 hides it when no delivery method is set up) and posts to
 * `/subscribe`, which #81 serves. Three links go to sections of the about
 * page (board 09: `#height`, `#own`, `#open`), the fourth to the source.
 */
import type { SiteMeta } from "@bd/contracts";
import { Footer } from "@bd/ui/patterns";
import type { VNode } from "preact";
import { pathIn } from "../languages.ts";
import type { RouteContext } from "../routes.ts";
import { translator } from "../strings/index.ts";

/** Where Breaker Delta's source is; a copy run by someone else is still this project. */
export const REPOSITORY = "https://github.com/daiyanze/breaker-delta";

export function siteFooter(
  ctx: Pick<RouteContext, "lang">,
  meta: Pick<SiteMeta, "languages" | "defaultLanguage" | "mail">,
): VNode {
  const t = translator(ctx.lang);
  const about = (section: string) => `${pathIn("/about", ctx.lang, meta)}#${section}`;
  return (
    <Footer
      {...(meta.mail.enabled
        ? {
            subscribe: {
              action: pathIn("/subscribe", ctx.lang, meta),
              label: t("footer.subscribe"),
              placeholder: t("footer.email"),
              button: t("footer.submit"),
            },
          }
        : {})}
      navLabel={t("footer.nav")}
      links={[
        { href: about("height"), label: t("footer.scoring"), short: t("footer.scoring.short") },
        { href: about("own"), label: t("footer.own"), short: t("footer.own.short") },
        { href: about("open"), label: t("footer.data"), short: t("footer.data.short") },
        { href: REPOSITORY, label: t("footer.github") },
      ]}
      art={t("footer.art")}
      notes={[t("footer.open")]}
    />
  );
}
