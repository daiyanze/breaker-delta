/** @jsxImportSource preact */
import { describe, expect, test } from "bun:test";
// Its styles and their tests: `packages/ui/src/styles/styles.test.ts`.
import { renderDocument } from "../../runtime/index.ts";
import { THEME_KEY } from "../../runtime/theme.ts";
import ThemeSwitch, { flipTheme, shownTheme } from "./ThemeSwitch.island.tsx";
import themeSwitchStates from "./ThemeSwitch.states.tsx";

const NAMES = { toDark: "Switch to dark mode", toLight: "Switch to light mode" };

/** A stand-in for `<html>` and `localStorage`, recording what is stored. */
function page(theme?: string) {
  const root = { dataset: (theme === undefined ? {} : { theme }) as DOMStringMap };
  const stored = new Map<string, string>();
  const storage = () => ({ setItem: (k: string, v: string) => void stored.set(k, v) });
  return { root, stored, storage };
}

describe("the theme the page shows", () => {
  test("is data-theme when set, else the system's", () => {
    expect(shownTheme(page("dark").root, false)).toBe("dark");
    expect(shownTheme(page("light").root, true)).toBe("light");
    expect(shownTheme(page().root, true)).toBe("dark");
    expect(shownTheme(page().root, false)).toBe("light");
    expect(shownTheme(page("sepia").root, true)).toBe("dark");
  });
});

describe("a click", () => {
  test("shows the other theme and stores it under THEME_KEY", () => {
    for (const [set, systemDark, next] of [
      [undefined, false, "dark"],
      [undefined, true, "light"],
      ["dark", false, "light"],
      ["light", true, "dark"],
    ] as const) {
      const p = page(set);
      expect(flipTheme(p.root, systemDark, p.storage)).toBe(next);
      expect(p.root.dataset.theme).toBe(next);
      expect([...p.stored]).toEqual([[THEME_KEY, next]]);
    }
  });

  test("still switches the page when storage refuses, or reading it throws", () => {
    const p = page();
    const refuses = () => ({
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    });
    expect(flipTheme(p.root, false, refuses)).toBe("dark");
    expect(
      flipTheme(p.root, false, () => {
        throw new Error("SecurityError");
      }),
    ).toBe("light");
    expect(p.root.dataset.theme).toBe("light");
  });
});

describe("markup", () => {
  const html = renderDocument(<ThemeSwitch {...NAMES} />).replace("<!doctype html>", "");

  test("a square button with the board's icon and both names, the same on server and client", () => {
    expect(html).toBe(
      `<bd-island name="ThemeSwitch" props="{&quot;toDark&quot;:&quot;Switch to dark mode&quot;,&quot;toLight&quot;:&quot;Switch to light mode&quot;}">` +
        `<button type="button" class="ThemeSwitch">` +
        `<svg class="ThemeSwitch-icon" viewBox="0 0 20 20" aria-hidden="true">` +
        `<circle class="ThemeSwitch-ring" cx="10" cy="10" r="7.5" stroke-width="2"></circle>` +
        `<path class="ThemeSwitch-half" d="M10 2.5 A7.5 7.5 0 0 1 10 17.5 Z"></path></svg>` +
        `<span class="ThemeSwitch-name ThemeSwitch-to-dark">Switch to dark mode</span>` +
        `<span class="ThemeSwitch-name ThemeSwitch-to-light">Switch to light mode</span>` +
        `</button></bd-island>`,
    );
  });

  test("the catalog state renders", () => {
    expect(Object.keys(themeSwitchStates.states)).toEqual(["default"]);
  });
});
