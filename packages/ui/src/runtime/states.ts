/**
 * A component's states for the catalog (ADR 0020, sections 3 and 12): named
 * sets of props. The props are inferred from the component, never from the
 * states (`NoInfer`), so a state with a prop the component does not take is
 * a compile error.
 */
import type { ComponentType } from "preact";

export interface States<P> {
  component: ComponentType<P>;
  states: { readonly [name: string]: P };
}

export function states<P>(
  component: ComponentType<P>,
  states: { readonly [name: string]: NoInfer<P> },
): States<P> {
  return { component, states };
}
