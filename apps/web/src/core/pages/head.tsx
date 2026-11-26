/** @jsxImportSource preact */
/** What every page of the site adds to the `<head>` after the stylesheet. */
import type { VNode } from "preact";
import { ICON_LINKS } from "../icon.ts";

/** Until launch, no page is indexed; then the icons. */
export function siteHead(): VNode {
  return (
    <>
      <meta name="robots" content="noindex" />
      {ICON_LINKS.map((link) => (
        <link key={link.href} {...link} />
      ))}
    </>
  );
}
