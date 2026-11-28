import { describe, expect, test } from "bun:test";
import { closeMenus, MENU_ATTRIBUTE, type MenuElement, type MenuPage, watchMenus } from "./menu.ts";

/** A stand-in for an open `<details data-menu>` holding the nodes in `holds`. */
function menu(name: string, holds: readonly string[], log: string[]) {
  const m: MenuElement & { name: string } = {
    name,
    open: true,
    contains: (other) => typeof other === "string" && (other === name || holds.includes(other)),
    querySelector: () => ({ focus: () => void log.push(`focus ${name} summary`) }),
  };
  return m;
}

describe("closing the drop-down menus (issue 112)", () => {
  test("Esc closes every open menu; the one holding the focus gives it to its button", () => {
    const log: string[] = [];
    const a = menu("a", ["a-link"], log);
    const b = menu("b", ["b-link"], log);
    expect(closeMenus([a, b], { focused: "b-link" })).toBe(2);
    expect([a.open, b.open]).toEqual([false, false]);
    expect(log).toEqual(["focus b summary"]);
  });

  test("with the focus outside every menu, nothing takes it", () => {
    const log: string[] = [];
    const a = menu("a", ["a-link"], log);
    expect(closeMenus([a], { focused: "body" })).toBe(1);
    expect(closeMenus([menu("c", [], log)], { focused: null })).toBe(1);
    expect(log).toEqual([]);
  });

  test("a click closes the menus it is not inside, and keeps the focus where it is", () => {
    const log: string[] = [];
    const a = menu("a", ["a-link"], log);
    const b = menu("b", ["b-link"], log);
    expect(closeMenus([a, b], { inside: "a-link" })).toBe(1);
    expect([a.open, b.open]).toEqual([true, false]);
    expect(log).toEqual([]);
  });

  test("the page listens for Esc and clicks; other keys close nothing", () => {
    const log: string[] = [];
    const a = menu("a", ["a-link"], log);
    const listeners = new Map<string, (event: { key?: string; target: unknown }) => void>();
    let asked = "";
    const page: MenuPage = {
      activeElement: "a-link",
      querySelectorAll: (selector) => {
        asked = selector;
        return a.open ? [a] : [];
      },
      addEventListener: (type, listener) => void listeners.set(type, listener),
    };
    watchMenus(page);
    expect([...listeners.keys()]).toEqual(["keydown", "click"]);
    listeners.get("keydown")?.({ key: "Enter", target: "a-link" });
    expect(a.open).toBe(true);
    listeners.get("keydown")?.({ key: "Escape", target: "a-link" });
    expect(asked).toBe(`details[${MENU_ATTRIBUTE}][open]`);
    expect(a.open).toBe(false);
    expect(log).toEqual(["focus a summary"]);
    a.open = true;
    listeners.get("click")?.({ target: "a-link" });
    expect(a.open).toBe(true);
    listeners.get("click")?.({ target: "elsewhere" });
    expect(a.open).toBe(false);
  });
});
