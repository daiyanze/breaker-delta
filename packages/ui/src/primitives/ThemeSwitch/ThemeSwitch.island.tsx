/** @jsxImportSource preact */
/**
 * The theme switch (#105, in its smallest form for #272): a button that
 * flips `<html data-theme>` between light and dark and stores the choice
 * under `THEME_KEY`, which the constant script in `Document` applies before
 * first paint on the next load. Until it is clicked the page follows the
 * system. `aria-pressed` says whether the dark theme is on; it is set once
 * the island runs, since the server cannot know the stored choice. #105
 * finishes its design. Styles: `ThemeSwitch.css`.
 *
 * It imports `island.ts` and `theme.ts` directly, not the runtime's index,
 * so the renderer never reaches its browser bundle.
 */
import { useEffect, useState } from "preact/hooks";
import { island } from "../../runtime/island.ts";
import { THEME_KEY } from "../../runtime/theme.ts";
import type { Theme } from "../../tokens/index.ts";

export interface ThemeSwitchProps {
  /** The button's text, a finished string ("Dark theme"). */
  label: string;
}

/** The theme the page shows: the one set on `<html>`, else the system's. */
function shown(): Theme {
  const set = document.documentElement.dataset.theme;
  if (set === "light" || set === "dark") return set;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function ThemeSwitch(props: ThemeSwitchProps) {
  const [theme, setTheme] = useState<Theme | null>(null);
  useEffect(() => setTheme(shown()), []);
  const flip = () => {
    const next: Theme = shown() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Storage refused (a private window): the switch still works for this page.
    }
    setTheme(next);
  };
  return (
    <button
      type="button"
      class="ThemeSwitch"
      onClick={flip}
      {...(theme === null ? {} : { "aria-pressed": theme === "dark" })}
    >
      {props.label}
    </button>
  );
}

export default island("ThemeSwitch", ThemeSwitch);
