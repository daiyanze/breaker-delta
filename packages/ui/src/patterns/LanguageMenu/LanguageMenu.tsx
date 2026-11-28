/** @jsxImportSource preact */
/**
 * The language menu (boards 01 and 02, #107): a set of links to the same
 * page in each language, not an in-page switch. A `<details>` disclosure,
 * so it opens without JavaScript. On phones the button shows the globe
 * only; its label still names the language. A drop-down menu
 * (`MENU_ATTRIBUTE`, #112): Esc or a click outside closes it once the
 * loader runs. Styles: `LanguageMenu.css`.
 */
import type { VNode } from "preact";
import { MENU_ATTRIBUTE } from "../../runtime/menu.ts";

export interface LanguageLink {
  /** The same page in this language. */
  href: string;
  /** The link's language, a BCP 47 tag (`hreflang` and `lang`). */
  lang: string;
  /** The language's own name for itself: English, 中文, 日本語. */
  name: string;
  /** The page's own language. */
  current: boolean;
}

export interface LanguageMenuProps {
  /** The button's accessible name, in the page's language: "Language: English". */
  label: string;
  links: readonly LanguageLink[];
  /**
   * Starts open. The list opens by a click, so the catalog gives its open
   * state as this prop (ADR 0020, section 12); pages leave it out.
   */
  open?: boolean;
}

export function LanguageMenu(props: LanguageMenuProps): VNode {
  const current = props.links.find((l) => l.current);
  return (
    <div class="LanguageMenu">
      <details
        class="LanguageMenu-details"
        {...{ [MENU_ATTRIBUTE]: "" }}
        open={props.open === true}
      >
        <summary class="LanguageMenu-button" aria-label={props.label}>
          <svg class="LanguageMenu-icon" viewBox="0 0 18 18" aria-hidden="true">
            <circle cx="9" cy="9" r="7" />
            <path d="M2 9 H16 M9 2 C5.5 5.5 5.5 12.5 9 16 C12.5 12.5 12.5 5.5 9 2" />
          </svg>
          {current === undefined ? null : <span class="LanguageMenu-current">{current.name}</span>}
          <svg class="LanguageMenu-chevron" viewBox="0 0 12 8" aria-hidden="true">
            <path d="M1 1 L6 6 L11 1" />
          </svg>
        </summary>
        <div class="LanguageMenu-list">
          {props.links.map((l) => (
            <a
              key={l.lang}
              class="LanguageMenu-link"
              href={l.href}
              hreflang={l.lang}
              lang={l.lang}
              {...(l.current ? { "aria-current": "true" } : {})}
            >
              {l.name}
            </a>
          ))}
        </div>
      </details>
    </div>
  );
}
