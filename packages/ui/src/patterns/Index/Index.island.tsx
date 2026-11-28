/** @jsxImportSource preact */
/**
 * The index (#120, boards 01 and 02, `design/system/components/IndexRow`):
 * the whole ranking beside the headlines, one `IndexRow` per wave, tallest
 * first. On desktop it shows every row and fills the height of its column
 * (the band's aside, `Band`); on phones it sits under the headlines and
 * shows the first `INDEX_PHONE_ROWS`, with a button that shows the rest.
 * That button is why this is an island; everything else is the server's
 * markup. Styles: `Index.css`.
 *
 * It imports `island.ts` and the supplement directly, not the runtime's or
 * the tokens' index, so the renderer never reaches its browser bundle.
 */
import { useState } from "preact/hooks";
import { island } from "../../runtime/island.ts";
import { INDEX_PHONE_ROWS } from "../../tokens/supplement.ts";
import { IndexRow, type IndexRowProps } from "../IndexRow/IndexRow.tsx";

export interface IndexProps {
  /** Unique on the page: the heading is `<id>-name`, the list `<id>-list`. */
  id: string;
  /** The heading, "The index". */
  name: string;
  /** Beside the heading, how the rows are ordered: "by height". */
  order: string;
  /** Every wave that is up, tallest first. */
  rows: readonly IndexRowProps[];
  /** The key under the rows, "Red numbers formed today. …"; desktop only, as on the boards. */
  note: string;
  /** The phone button while rows are hidden, "Show all 16 waves". */
  showAll: string;
  /** The phone button once every row shows, "Show the top 8". */
  showFewer: string;
  /** Start with every row showing on phones (the catalog's `open` state); pages leave it out. */
  open?: boolean;
}

function Index(props: IndexProps) {
  const [open, setOpen] = useState(props.open === true);
  const listId = `${props.id}-list`;
  const nameId = `${props.id}-name`;
  const more = props.rows.length > INDEX_PHONE_ROWS;
  return (
    <aside class="Index" aria-labelledby={nameId}>
      <div class="Index-head">
        <h2 id={nameId} class="Index-name">
          {props.name}
        </h2>
        <span class="Index-order">{props.order}</span>
      </div>
      <ol id={listId} class={open ? "Index-list Index-open" : "Index-list"}>
        {props.rows.map((row) => (
          <li key={row.href} class="Index-item">
            <IndexRow {...row} />
          </li>
        ))}
      </ol>
      <p class="Index-note">{props.note}</p>
      {more ? (
        <button
          type="button"
          class="Index-more"
          aria-controls={listId}
          aria-expanded={open ? "true" : "false"}
          onClick={() => setOpen(!open)}
        >
          {open ? props.showFewer : props.showAll}
        </button>
      ) : null}
    </aside>
  );
}

export default island("Index", Index);
