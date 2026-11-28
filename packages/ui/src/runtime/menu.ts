/**
 * Drop-down menus (#112): a `<details>` with `MENU_ATTRIBUTE` opens and
 * closes without JavaScript, from the pointer and the keyboard (Enter or
 * Space on its `<summary>`). The loader adds the two things a disclosure
 * lacks: Esc closes every open menu, and the focus goes back to the button
 * of the one that held it; a click outside a menu closes it.
 *
 * The loader is this file's one importer in the browser bundle. An island
 * that imported it too would turn it into a shared chunk the loader loads
 * on every page; `build.test.ts` fails then.
 */

/** The attribute that marks a `<details>` as a drop-down menu. */
export const MENU_ATTRIBUTE = "data-menu";

/** The open menus of a page. */
export const OPEN_MENUS = `details[${MENU_ATTRIBUTE}][open]`;

/** The part of a `<details>` element the closing reads and writes. */
export interface MenuElement {
  open: boolean;
  contains(other: unknown): boolean;
  querySelector(selector: "summary"): { focus(): void } | null;
}

/**
 * Closes each menu, except one that holds `inside` (the target of a click).
 * The one that held `focused` gives the focus back to its button, so the
 * keyboard stays where the menu was. Returns how many it closed.
 */
export function closeMenus(
  menus: Iterable<MenuElement>,
  at: { focused?: unknown; inside?: unknown },
): number {
  let closed = 0;
  for (const menu of menus) {
    if (at.inside != null && menu.contains(at.inside)) continue;
    const held = at.focused != null && menu.contains(at.focused);
    menu.open = false;
    closed += 1;
    if (held) menu.querySelector("summary")?.focus();
  }
  return closed;
}

/** The part of a page the menus listen on. */
export interface MenuPage {
  activeElement: unknown;
  querySelectorAll(selector: string): Iterable<MenuElement>;
  addEventListener(
    type: "keydown" | "click",
    listener: (event: { key?: string; target: unknown }) => void,
  ): void;
}

/** Esc closes every open menu; a click outside one closes it. Called once, by the loader. */
export function watchMenus(page: MenuPage): void {
  page.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closeMenus(page.querySelectorAll(OPEN_MENUS), { focused: page.activeElement });
  });
  page.addEventListener("click", (event) => {
    closeMenus(page.querySelectorAll(OPEN_MENUS), { inside: event.target });
  });
}
