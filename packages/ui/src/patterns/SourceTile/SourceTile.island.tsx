/** @jsxImportSource preact */
/**
 * The source tile (#113; `design/system/components/SourceTile`, boards 01
 * and 03): a small square before a source's name. Solid (ink ground, paper
 * icon) for the source where the story started, outlined (paper ground,
 * ink icon) for one that picked it up later. Inside, the source site's own
 * favicon, or a generic icon by the kind of source.
 *
 * The generic icon is always in the markup; the stylesheet hides it while a
 * favicon is there. A favicon that fails to load is removed, in the
 * browser, so the generic icon shows: the error is caught by the handler
 * once the island has run, and by `complete` with no width for one that
 * failed before. Without JavaScript a failed favicon leaves the tile empty
 * (`alt=""` draws nothing), never a broken-image mark.
 *
 * The tile is never alone: the name is part of the component (README,
 * "图标必须带文字来源名"). Styles: `SourceTile.css`.
 *
 * It imports `island.ts` directly, not the runtime's index, so the renderer
 * never reaches its browser bundle; from `@bd/contracts`, types only.
 */
import type { SourceGroup } from "@bd/contracts";
import type { VNode } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { island } from "../../runtime/island.ts";

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

function SourceTile(props: SourceTileProps): VNode {
  const [failed, setFailed] = useState(false);
  const favicon = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const img = favicon.current;
    if (img?.complete && img.naturalWidth === 0) setFailed(true);
  }, []);
  const showFavicon = props.favicon !== undefined && !failed;
  const named =
    props.label === undefined
      ? { "aria-hidden": true as const }
      : { role: "img" as const, "aria-label": props.label };
  return (
    <span class="SourceTile" data-size={props.size ?? "regular"}>
      <span class="SourceTile-tile" data-fill={props.fill} {...named}>
        {showFavicon ? (
          <img
            ref={favicon}
            class="SourceTile-favicon"
            src={props.favicon}
            alt=""
            loading="lazy"
            decoding="async"
            referrerpolicy="no-referrer"
            onError={() => setFailed(true)}
          />
        ) : null}
        <Glyph kind={props.kind} />
      </span>
      <span class="SourceTile-name">{props.name}</span>
    </span>
  );
}

export default island("SourceTile", SourceTile);
