/** @jsxImportSource preact */
/**
 * The source tile's markup, shared by the plain component (`SourceTile.tsx`,
 * a tile with no favicon) and the island (`SourceTile.island.tsx`, a tile
 * with one). No hooks and no runtime import, so both the server and the
 * island's browser bundle take it.
 *
 * The generic icon is always in the markup and shows by default. A favicon
 * is in the markup too, but hidden (`display: none`, which still loads it)
 * until the island marks it `data-loaded`; only then does the stylesheet
 * swap it in for the generic icon. So a favicon that fails to load, or any
 * favicon with JavaScript off, is never drawn: the generic icon stays, and
 * no browser's broken-image mark can show.
 */
import type { SourceGroup } from "@bd/contracts";
import type { Ref, VNode } from "preact";

/** The generic icons, one per kind of source (README, "图标内容"). */
export const SOURCE_KINDS = ["forum", "account", "press", "search", "mail", "code"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export interface SourceTileProps {
  /** The source's name, finished text; shown after the tile. */
  name: string;
  /** `solid`: where the story started. `outline`: picked it up later. */
  fill: "solid" | "outline";
  /** Which generic icon the tile shows without a favicon. */
  kind: SourceKind;
  /** The source site's favicon URL. Left out for a group of sites, or when there is none. */
  favicon?: string;
  /**
   * What the tile means, read out for it ("Source where the story started").
   * Without it the tile is hidden from assistive technology, as in the
   * classifieds, where the fill carries no meaning.
   */
  label?: string;
  /** `small` is the classifieds' 30px tile; `regular` (the default) 34px. */
  size?: "regular" | "small";
}

/**
 * The generic icon for a source group's category. The README names six
 * kinds; the categories with no kind of their own (blogs, papers, model
 * hubs, launches, government, reference, charts) are media or blogs, the
 * newspaper. `mail` has no category yet: a newsletter group passes it.
 */
export function kindOf(category: SourceGroup["category"]): SourceKind {
  switch (category) {
    case "forum":
      return "forum";
    case "key_accounts":
      return "account";
    case "search":
      return "search";
    case "code_host":
      return "code";
    default:
      return "press";
  }
}

/**
 * Whether an image has loaded with something to draw. One that has not
 * finished, failed, or reports no width keeps the generic icon: a width of
 * 0 is how a failed image reads, and the safe reading of anything unclear.
 */
export function faviconLoaded(img: { complete: boolean; naturalWidth: number } | null): boolean {
  return img !== null && img.complete && img.naturalWidth > 0;
}

/** The generic icons on an 18-unit board, drawn as on boards 01 and 03. */
function Glyph(props: { kind: SourceKind }): VNode {
  const shapes: Record<SourceKind, VNode> = {
    forum: <path d="M3 4 H15 V12 H8 L5 15 V12 H3 Z" />,
    account: (
      <>
        <circle cx="9" cy="6" r="3" />
        <path d="M3 15.5 C3 12 6 10.8 9 10.8 S15 12 15 15.5" />
      </>
    ),
    press: (
      <path d="M3 3 H13 V15 H3 Z M13 6 H15.5 V15 H13 M5.5 6.5 H10.5 M5.5 9.5 H10.5 M5.5 12.5 H10.5" />
    ),
    search: (
      <>
        <circle cx="8" cy="8" r="4.8" />
        <path d="M11.6 11.6 L15.5 15.5" />
      </>
    ),
    mail: <path d="M2.5 4.5 H15.5 V13.5 H2.5 Z M2.5 5 L9 10 L15.5 5" />,
    code: <path d="M6.5 5 L2.5 9 L6.5 13 M11.5 5 L15.5 9 L11.5 13" />,
  };
  return (
    <svg class="SourceTile-glyph" viewBox="0 0 18 18" aria-hidden="true" data-kind={props.kind}>
      {shapes[props.kind]}
    </svg>
  );
}

/** How the island drives the favicon; the plain component passes none. */
export interface FaviconState {
  loaded: boolean;
  ref: Ref<HTMLImageElement>;
  onLoad: () => void;
}

/** The tile and the name. */
export function Tile(props: SourceTileProps & { faviconState?: FaviconState }): VNode {
  const named =
    props.label === undefined
      ? { "aria-hidden": true as const }
      : { role: "img" as const, "aria-label": props.label };
  const state = props.faviconState;
  return (
    <span class="SourceTile" data-size={props.size ?? "regular"}>
      <span class="SourceTile-tile" data-fill={props.fill} {...named}>
        {props.favicon !== undefined && state !== undefined ? (
          <img
            ref={state.ref}
            class="SourceTile-favicon"
            src={props.favicon}
            alt=""
            decoding="async"
            referrerpolicy="no-referrer"
            data-loaded={state.loaded ? "" : undefined}
            onLoad={state.onLoad}
          />
        ) : null}
        <Glyph kind={props.kind} />
      </span>
      <span class="SourceTile-name">{props.name}</span>
    </span>
  );
}
