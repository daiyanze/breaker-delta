/** @jsxImportSource preact */
/**
 * The source tile (#113; `design/system/components/SourceTile`, boards 01
 * and 03): a small square before a source's name. Solid (ink ground, paper
 * icon) for the source where the story started, outlined (no ground, the
 * text's colour) for one that picked it up later. Inside, the source site's
 * own favicon, or a generic icon by the kind of source.
 *
 * A tile with a favicon is the island (`SourceTile.island.tsx`), which
 * shows the favicon once it has loaded; one without is plain markup. The
 * markup is `tile.tsx`, the styles `SourceTile.css`. The tile is never
 * alone: the name is part of the component (README, "图标必须带文字来源名").
 */
import type { VNode } from "preact";
import SourceTileIsland from "./SourceTile.island.tsx";
import { type SourceTileProps, Tile } from "./tile.tsx";

export { kindOf, SOURCE_KINDS, type SourceKind, type SourceTileProps } from "./tile.tsx";

export function SourceTile(props: SourceTileProps): VNode {
  return props.favicon === undefined ? <Tile {...props} /> : <SourceTileIsland {...props} />;
}
