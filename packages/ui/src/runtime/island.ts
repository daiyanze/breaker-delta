/**
 * Islands (ADR 0020, section 2): the parts of a page that run in the
 * browser. An island lives in `<Name>.island.tsx` and default-exports
 * `island("<Name>", Component)`; its module is `/client/<Name>.island.js`.
 *
 * On the server it renders `<bd-island name="…" props="…">` around the
 * component's HTML. The props are JSON in an attribute, so the renderer
 * escapes them like any other text. In the browser the loader
 * (`loader.ts`) imports the module and hydrates the component with the
 * props read back from the attribute.
 *
 * This file is in every island's bundle: it imports `preact` only, never
 * the renderer.
 */
import { type ComponentType, h, type VNode } from "preact";

/**
 * `T` itself when it is JSON all the way down, `never` where it is not. A
 * function, a `Date`, a `Map`, a `VNode` (so `children`) and `unknown` are
 * not; a prop typed `object`, `{}` or `any` passes, which the type cannot
 * catch (ADR 0020, section 2).
 */
export type Jsonable<T> = T extends string | number | boolean | null | undefined
  ? T
  : T extends (...args: never[]) => unknown
    ? never
    : T extends readonly (infer U)[]
      ? readonly Jsonable<U>[]
      : T extends object
        ? { readonly [K in keyof T]: Jsonable<T[K]> }
        : never;

/** The element every island is rendered in; the loader defines it. */
export const ISLAND_TAG = "bd-island";

export interface Island<P> {
  (props: P): VNode;
  /** The file name before `.island.tsx`, and the module's URL. */
  islandName: string;
  /** What the loader hydrates in the browser. */
  component: ComponentType<P>;
}

export function island<P extends object>(
  name: string,
  component: ComponentType<P> & (P extends Jsonable<P> ? unknown : "island props must be JSON"),
): Island<P> {
  const render = (props: P): VNode => {
    const attributes = { name, props: JSON.stringify(props) };
    return h(ISLAND_TAG, attributes, h(component, props)) as VNode;
  };
  return Object.assign(render, { islandName: name, component });
}
