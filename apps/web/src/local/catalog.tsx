/** @jsxImportSource preact */
/**
 * `/_catalog` (#258, ADR 0020 section 12): every component of `@bd/ui` in
 * every state it declares, in one theme and one language per page. A route
 * of the local adapter only, so the Cloudflare adapter never has it.
 *
 * `?theme=light|dark` and `?lang=` pick the page; the links at the top go
 * to every other one. Each state is in an element marked `data-shot`, which
 * the screenshot run (`apps/web/scripts/screens.ts`) captures. The page is
 * made of plain elements and the base styles: it has no CSS of its own.
 */
import { type Language, LanguageSchema } from "@bd/contracts";
import { CATALOG, THEMES } from "@bd/ui/catalog";
import { Document, renderDocument } from "@bd/ui/runtime";
import type { Theme } from "@bd/ui/tokens";

export const CATALOG_PATH = "/_catalog";

/** The languages every state is shown in: the site's. */
export const LANGUAGES: readonly Language[] = LanguageSchema.options;

/** The page's address for one theme and one language. */
export function catalogHref(theme: Theme, lang: Language): string {
  return `${CATALOG_PATH}?theme=${theme}&lang=${lang}`;
}

function page(theme: Theme, lang: Language): string {
  return renderDocument(
    <Document lang={lang} title="Catalog" theme={theme}>
      <header class="page">
        <h1>Catalog</h1>
        <p>
          {CATALOG.length} components, {THEMES.length} themes, {LANGUAGES.length} languages. This
          page: {theme}, {lang}.
        </p>
        <ul>
          {THEMES.flatMap((t) =>
            LANGUAGES.map((l) => (
              <li key={`${t}-${l}`}>
                <a
                  href={catalogHref(t, l)}
                  {...(t === theme && l === lang ? { "aria-current": "page" } : {})}
                >
                  {t}, {l}
                </a>
              </li>
            )),
          )}
        </ul>
        <ul>
          {CATALOG.map((e) => (
            <li key={e.name}>
              <a href={`#${e.name}`}>{e.name}</a> ({e.layer}): {e.states.join(", ")}
            </li>
          ))}
        </ul>
      </header>
      <main class="page">
        {CATALOG.map((e) => (
          <section key={e.name} id={e.name} aria-labelledby={`catalog-${e.name}`}>
            <h2 id={`catalog-${e.name}`}>{e.name}</h2>
            <p>
              {e.layer}, {e.states.length} states
            </p>
            {e.states.map((state) => (
              <div key={state}>
                <h3>{state}</h3>
                <div data-shot={`${e.name}/${state}`}>{e.render(state)}</div>
              </div>
            ))}
          </section>
        ))}
      </main>
    </Document>,
  );
}

const isTheme = (v: string): v is Theme => (THEMES as readonly string[]).includes(v);
const isLanguage = (v: string): v is Language => (LANGUAGES as readonly string[]).includes(v);

/** Serves `/_catalog`, or null for any other path. An unknown theme or language is a 404. */
export function serveCatalog(request: Request): Response | null {
  const url = new URL(request.url);
  if (url.pathname !== CATALOG_PATH) return null;
  const theme = url.searchParams.get("theme") ?? "light";
  const lang = url.searchParams.get("lang") ?? "en";
  if (!isTheme(theme) || !isLanguage(lang)) {
    return new Response("unknown theme or language", { status: 404 });
  }
  return new Response(page(theme, lang), {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
