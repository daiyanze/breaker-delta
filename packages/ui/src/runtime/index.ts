/**
 * `@bd/ui/runtime` (ADR 0020, section 3): the document every page is, the
 * one function that turns it into HTML, `island` and `states` for the
 * catalog. The loader (`loader.ts`) is not exported: `@bd/ui/build` bundles
 * it for the browser.
 */
export { CLIENT, Document, type DocumentProps, renderDocument } from "./Document.tsx";
export { ISLAND_TAG, type Island, island, type Jsonable } from "./island.ts";
export { type States, states } from "./states.ts";
export { THEME_KEY, THEME_SCRIPT } from "./theme.ts";
