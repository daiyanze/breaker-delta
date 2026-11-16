import type { Lang } from "../lib/data";
import { s } from "../lib/strings";

/** Collapsible "how the wave height works" explainer (heatHelp in
 * render.ts), shown under the board and the rising page. */
export function HeatHelp({ lang }: { lang: Lang }) {
  return (
    <details className="help">
      <summary>{s(lang, "heat_help_t")}</summary>
      <div
        className="helpbody"
        dangerouslySetInnerHTML={{ __html: s(lang, "heat_help") }}
      />
    </details>
  );
}
