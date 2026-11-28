/** @jsxImportSource preact */
/**
 * Filter items (#112; `design/system/components/PageHero`, boards 11 to 16
 * and 26): a row of square 1px-outlined links, the selected one `ink`
 * behind `paper`. Each item is a URL of its own, not a state of the page,
 * so a filtered list can be bookmarked and shared; the selected one is the
 * page itself (`aria-current="page"`). The row wraps when it is too narrow.
 * Styles: `Filters.css`.
 */
import type { VNode } from "preact";

export interface FilterItem {
  /** The list with this filter applied. */
  href: string;
  /** Its text, finished, in the page's language: "New waves", "Echoes, 31". */
  label: string;
  /** The filter the page shows. */
  current: boolean;
}

export interface FiltersProps {
  /** The row's accessible name, in the page's language: "Filter". */
  label: string;
  items: readonly FilterItem[];
}

export function Filters(props: FiltersProps): VNode {
  return (
    <nav class="Filters" aria-label={props.label}>
      {props.items.map((item) => (
        <a
          key={item.href}
          class="Filters-item"
          href={item.href}
          {...(item.current ? { "aria-current": "page" } : {})}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}
