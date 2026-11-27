/** @jsxImportSource preact */
/**
 * `/_catalog` (#258, ADR 0020 section 12): every component of `@bd/ui` in
 * every state it declares, in one theme and one language per page. A route
 * of the local adapter only, so the Cloudflare adapter never has it.
 *
 * `?theme=light|dark` and `?lang=` pick the page; the links at the top go
 * to every other one. Each state is in an element marked `data-shot`;
 * `&shot=<Name>/<state>` serves that state alone, which is what the
 * screenshot run (`apps/web/scripts/screens.ts`) captures. The page is
 * made of plain elements and the base styles: it has no CSS of its own.
 */
import { type Language, LanguageSchema } from "@bd/contracts";
import { CATALOG, THEMES } from "@bd/ui/catalog";
import { Document, renderDocument } from "@bd/ui/runtime";
import type { Theme } from "@bd/ui/tokens";

export const CATALOG_PATH = "/_catalog";

/** The languages every state is shown in: the site's. */
export const LANGUAGES: readonly Language[] = LanguageSchema.options;

/**
 * The page's address for one theme and one language; with `shot`
 * (`<Name>/<state>`), the page holding that one state alone.
 */
export function catalogHref(theme: Theme, lang: Language, shot?: string): string {
  const one = shot === undefined ? "" : `&shot=${encodeURIComponent(shot)}`;
  return `${CATALOG_PATH}?theme=${theme}&lang=${lang}${one}`;
}

/**
 * One state alone on a page, for the screenshot run: where a state sits on
 * the full page depends on everything above it, and a fractional offset
 * changes its rounded size, so a state added to one component would move
 * the shots of the others.
 */
function onePage(theme: Theme, lang: Language, shot: string): string | null {
  const [name, state] = shot.split("/");
  const entry = CATALOG.find((e) => e.name === name);
  if (entry === undefined || state === undefined || !entry.states.includes(state)) return null;
  return renderDocument(
    <Document lang={lang} title={`Catalog: ${shot}`} theme={theme}>
      <main class="page">
        <div data-shot={shot}>{entry.render(state)}</div>
      </main>
    </Document>,
  );
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
  const shot = url.searchParams.get("shot");
  const html = shot === null ? page(theme, lang) : onePage(theme, lang, shot);
  if (html === null) return new Response("unknown component or state", { status: 404 });
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
