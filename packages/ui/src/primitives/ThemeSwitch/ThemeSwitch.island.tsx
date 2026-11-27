/** @jsxImportSource preact */
/**
 * The theme switch (#105; boards 01 and 02): a square button with a
 * half-filled circle that flips `<html data-theme>` between light and dark
 * and stores the choice under `THEME_KEY`, which the constant script in
 * `Document` applies before first paint on the next load. Until it is
 * clicked the page follows the system.
 *
 * Its name says what a click does ("Switch to dark mode"). Both names are in
 * the markup and the stylesheet hides the one that does not apply, by the
 * same rules that pick the theme, so the name is right from the first paint,
 * before the island runs, and the server and the browser render the same
 * markup. Styles: `ThemeSwitch.css`.
 *
 * It imports `island.ts` and `theme.ts` directly, not the runtime's index,
 * so the renderer never reaches its browser bundle.
 */
import { island } from "../../runtime/island.ts";
import { THEME_KEY } from "../../runtime/theme.ts";
import type { Theme } from "../../tokens/index.ts";

export interface ThemeSwitchProps {
  /** The button's name while the light theme shows, a finished string ("Switch to dark mode"). */
  toDark: string;
  /** The button's name while the dark theme shows ("Switch to light mode"). */
  toLight: string;
}

/** The theme the page shows: the one set on `<html>`, else the system's. */
export function shownTheme(root: { dataset: DOMStringMap }, systemDark: boolean): Theme {
  const set = root.dataset.theme;
  if (set === "light" || set === "dark") return set;
  return systemDark ? "dark" : "light";
}

/**
 * Shows the other theme and stores it. A storage that refuses (a private
 * window; reading `localStorage` itself can throw) leaves the switch
 * working for this page.
 */
export function flipTheme(
  root: { dataset: DOMStringMap },
  systemDark: boolean,
  storage: () => Pick<Storage, "setItem">,
): Theme {
  const next: Theme = shownTheme(root, systemDark) === "dark" ? "light" : "dark";
  root.dataset.theme = next;
  try {
    storage().setItem(THEME_KEY, next);
  } catch {
    // Storage refused: the choice lasts for this page only.
  }
  return next;
}

function ThemeSwitch(props: ThemeSwitchProps) {
  const flip = () => {
    flipTheme(
      document.documentElement,
      matchMedia("(prefers-color-scheme: dark)").matches,
      () => localStorage,
    );
  };
  return (
    <button type="button" class="ThemeSwitch" onClick={flip}>
      <svg class="ThemeSwitch-icon" viewBox="0 0 20 20" aria-hidden="true">
        <circle class="ThemeSwitch-ring" cx="10" cy="10" r="7.5" stroke-width="2" />
        <path class="ThemeSwitch-half" d="M10 2.5 A7.5 7.5 0 0 1 10 17.5 Z" />
      </svg>
      <span class="ThemeSwitch-name ThemeSwitch-to-dark">{props.toDark}</span>
      <span class="ThemeSwitch-name ThemeSwitch-to-light">{props.toLight}</span>
    </button>
  );
}

export default island("ThemeSwitch", ThemeSwitch);
