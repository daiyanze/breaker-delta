/** @jsxImportSource preact */
/**
 * The source tile with a favicon (#113), an island: `SourceTile.tsx` uses
 * it only when a favicon is given, so a tile without one loads nothing in
 * the browser.
 *
 * The favicon is hidden until it has loaded (`tile.tsx`): the island marks
 * it `data-loaded` from its `load` event, or at hydration when it had
 * already loaded (`faviconLoaded`). A favicon that fails, or one on a page
 * with JavaScript off, is never shown, and the generic icon stays.
 *
 * It imports `island.ts` directly, not the runtime's index, so the renderer
 * never reaches its browser bundle.
 */
import type { VNode } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { island } from "../../runtime/island.ts";
import { faviconLoaded, type SourceTileProps, Tile } from "./tile.tsx";

function SourceTile(props: SourceTileProps): VNode {
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    if (faviconLoaded(ref.current)) setLoaded(true);
  }, []);
  const onLoad = () => setLoaded(faviconLoaded(ref.current));
  return <Tile {...props} faviconState={{ loaded, ref, onLoad }} />;
}

export default island("SourceTile", SourceTile);
