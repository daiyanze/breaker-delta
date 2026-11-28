/** @jsxImportSource preact */
/**
 * The way into search (#112; boards 01 and 02, the tools above the
 * masthead): a secondary `Button` with a magnifier that goes to the search
 * page, where the search box itself is (#142). A link, not a form: search
 * is a page of its own with the query in its URL.
 *
 * From the two-column breakpoint it shows its label beside the magnifier; on
 * phones the magnifier alone, a square control, while the label stays its
 * name, read out but not shown. Styles: `SearchEntry.css`.
 */
import type { VNode } from "preact";
import { Button } from "../Button/Button.tsx";

export interface SearchEntryProps {
  /** The search page, in the page's language. */
  href: string;
  /** Its name in the page's language, finished: "Search". */
  label: string;
}

export function SearchEntry(props: SearchEntryProps): VNode {
  return (
    <span class="SearchEntry">
      <Button variant="secondary" href={props.href}>
        <svg class="Button-icon" viewBox="0 0 18 18" aria-hidden="true">
          <circle cx="8" cy="8" r="5.5" />
          <path d="M12.5 12.5 L16 16" />
        </svg>
        <span class="SearchEntry-label">{props.label}</span>
      </Button>
    </span>
  );
}
