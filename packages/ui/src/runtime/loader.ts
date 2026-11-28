/**
 * The loader (ADR 0020, sections 2 and 11): `/client/loader.js`, on every
 * page. It defines `<bd-island>`; each one imports its island's module
 * (`<name>.island.js`, beside the loader) and Preact, and hydrates the
 * component with the props read back from its `props` attribute. Preact is
 * imported only when a page has an island, so a page without one loads
 * this file alone.
 *
 * It also closes the drop-down menus with Esc (`menu.ts`), bundled into this
 * file: a menu works without JavaScript, and the loader is the one script
 * every page has.
 */
import type { ComponentType } from "preact";
import { watchMenus } from "./menu.ts";

/**
 * `ISLAND_TAG` (`element.ts`), written out: an import, even of a constant,
 * becomes a chunk the loader would load on every page. `build.test.ts`
 * checks the two agree and that the built loader imports nothing up front.
 */
const ISLAND_TAG = "bd-island";

/** An island's name is its file name: letters and digits, starting with a capital. */
const NAME = /^[A-Z][A-Za-z0-9]*$/;

interface IslandModule {
  default: { component: ComponentType<object> };
}

class IslandElement extends HTMLElement {
  connectedCallback(): void {
    const name = this.getAttribute("name");
    if (name === null || !NAME.test(name)) {
      console.error(`${ISLAND_TAG}: not an island name: ${name}`);
      return;
    }
    const props = JSON.parse(this.getAttribute("props") ?? "{}") as object;
    const url = new URL(`${name}.island.js`, import.meta.url).href;
    void Promise.all([import("preact"), import(url) as Promise<IslandModule>]).then(
      ([{ h, hydrate }, module]) => hydrate(h(module.default.component, props), this),
    );
  }
}

if (customElements.get(ISLAND_TAG) === undefined) customElements.define(ISLAND_TAG, IslandElement);

// A module runs once per page, however many times it is linked.
watchMenus(document);
