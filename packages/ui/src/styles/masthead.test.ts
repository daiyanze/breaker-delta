import { describe, expect, test } from "bun:test";
import { cssRules, normalize, parseCss } from "./css.ts";
import { CSS_FILES } from "./index.ts";

// The masthead's rules (#110), read from its file as `uiCss()` holds it.
const file = CSS_FILES.find((f) => f.path === "patterns/Masthead/Masthead.css");
const rules = cssRules(parseCss(file?.text ?? ""));
const WIDE = "(min-width: 960px)";
const STILL = "(prefers-reduced-motion: reduce)";

/** The declarations of `selector`, outside any media query or inside `media`, normalized. */
function decls(selector: string, media?: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rules) {
    if (r.selector !== selector || r.media.join(" and ") !== (media ?? "")) continue;
    for (const [p, v] of r.declarations) out[p] = normalize(v);
  }
  return out;
}

describe("the masthead's stylesheet", () => {
  test("is in the sheet", () => {
    expect(file?.layer).toBe("patterns");
  });

  test("the current item's line is the 4px rule, in red", () => {
    expect(decls(".Masthead-link[aria-current]")["box-shadow"]).toBe(
      normalize("inset 0 calc(-1 * var(--rule-heavy)) 0 var(--red)"),
    );
    expect(decls(".Masthead-item[aria-current]")["box-shadow"]).toBe(
      normalize("inset var(--rule-heavy) 0 0 var(--red)"),
    );
  });

  test("with reduced motion on, everything that moves stands still", () => {
    const animation = (r: (typeof rules)[number]) =>
      r.declarations.find(([p]) => p === "animation")?.[1];
    const stopped = rules
      .filter((r) => r.media.join() === STILL && animation(r) === "none")
      .flatMap((r) => r.selector.split(/,\s*/));
    const moving = rules
      .filter((r) => r.media.length === 0 && animation(r) !== undefined)
      .map((r) => r.selector);
    expect(moving.sort()).toEqual([
      ".Masthead-pitch",
      ".Masthead-rise",
      ".Masthead-swell",
      ".Masthead-voyage",
    ]);
    expect(stopped.sort()).toEqual(moving);
  });

  test("phones get the disclosure and the simplest mark; the breakpoint unfolds the navigation", () => {
    expect(decls(".Masthead-nav").display).toBe("none");
    expect(decls(".Masthead-nav", WIDE).display).toBe("flex");
    expect(decls(".Masthead-sections", WIDE).display).toBe("none");
    expect(decls(".Masthead-detail").display).toBe("none");
    expect(decls(".Masthead-detail", WIDE).display).toBe("inline");
  });

  test("the wave band clips what moves in it, so nothing scrolls sideways", () => {
    expect(decls(".Masthead-wave").overflow).toBe("hidden");
  });
});
