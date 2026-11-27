/**
 * `@bd/ui/catalog` (ADR 0020, sections 3 and 12): every component's states,
 * for the local site's `/_catalog` page and its screenshot run. Imported by
 * no component, and only by the local adapter: the Cloudflare adapter never
 * has the page.
 *
 * One entry per component folder under `primitives` and `patterns`, in
 * layer order. A folder without a `<Name>.states.tsx`, or a states file
 * missing from this list, fails `catalog.test.tsx`. A state is a set of
 * props; hover and focus are not states, the screenshot run moves the
 * pointer and the focus (section 12).
 */
import { type ComponentType, h, type VNode } from "preact";
import bandStates from "../patterns/Band/Band.states.tsx";
import echoStackStates from "../patterns/EchoStack/EchoStack.states.tsx";
import languageMenuStates from "../patterns/LanguageMenu/LanguageMenu.states.tsx";
import tideTableStates from "../patterns/TideTable/TideTable.states.tsx";
import themeSwitchStates from "../primitives/ThemeSwitch/ThemeSwitch.states.tsx";
import type { States } from "../runtime/index.ts";
import type { Theme } from "../tokens/index.ts";

/** The layers a component lives in, first to last. */
export type ComponentLayer = "primitives" | "patterns";

export interface CatalogEntry {
  /** The component folder's name, `Band`. */
  name: string;
  layer: ComponentLayer;
  /**
   * The name of the component the states render: its island name, or its
   * function's name. `check.ts` compares it with `name`.
   */
  componentName: string;
  /** The state names, in the order the states file declares them. */
  states: readonly string[];
  /** The component in one of its states. */
  render(state: string): VNode;
}

/** The themes every state is shown in. */
export const THEMES: readonly Theme[] = ["light", "dark"];

function entry<P>(name: string, layer: ComponentLayer, declared: States<P>): CatalogEntry {
  const component = declared.component as ComponentType<P> & { islandName?: string };
  return {
    name,
    layer,
    componentName: component.islandName ?? component.name,
    states: Object.keys(declared.states),
    render(state) {
      const props = declared.states[state];
      if (props === undefined) throw new Error(`${name} has no state "${state}"`);
      return h(declared.component as ComponentType<object>, props as object);
    },
  };
}

/** Every component with its states, primitives first. */
export const CATALOG: readonly CatalogEntry[] = [
  entry("ThemeSwitch", "primitives", themeSwitchStates),
  entry("Band", "patterns", bandStates),
  entry("EchoStack", "patterns", echoStackStates),
  entry("LanguageMenu", "patterns", languageMenuStates),
  entry("TideTable", "patterns", tideTableStates),
];
