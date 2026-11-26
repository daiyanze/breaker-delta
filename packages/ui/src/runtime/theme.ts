/**
 * The stored theme (ADR 0020, section 4; C10): the page follows the system
 * until the reader picks a theme, which is kept in `localStorage` under
 * `THEME_KEY` and set as `<html data-theme>`. `THEME_SCRIPT` is the constant
 * script in every page's `<head>` that applies it before first paint, so
 * the other theme never shows first. It is the one inline script.
 */
export const THEME_KEY = "bd-theme";

/**
 * A plain literal, with `THEME_KEY` written out (`Document.test.tsx` checks
 * they agree): a computed string is kept in every browser bundle that
 * imports this file, even unused.
 */
export const THEME_SCRIPT =
  'try{var t=localStorage.getItem("bd-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}';
