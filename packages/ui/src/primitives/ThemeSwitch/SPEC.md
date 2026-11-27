# ThemeSwitch

An island (ADR 0020, section 2): `/client/ThemeSwitch.island.js`.

- A button. A click flips `<html data-theme>` between `light` and `dark`
  and stores the choice in `localStorage` under `THEME_KEY`
  (`@bd/ui/runtime`). The constant script in `Document` applies it before
  first paint on the next load, so the other theme never shows first.
- Until it is clicked the page follows the system (`light-dark()` under
  `color-scheme`).
- Props: `label`, the button's text as a finished string.
- `aria-pressed` is true while the dark theme shows. It is set once the
  island runs: the server cannot know the stored choice.
- Styles: the secondary button of `design/system/components/Button`,
  inverted while pressed.

This is the smallest form, made for #272. #105 finishes its design (the
masthead's switch on boards 01).
