/**
 * `@bd/ui/runtime` (ADR 0020, section 3): the document every page is, the
 * one function that turns it into HTML, and `states` for the catalog.
 * `island` and the loader come with `ui-islands`.
 */
export { CLIENT, Document, type DocumentProps, renderDocument } from "./Document.tsx";
export { type States, states } from "./states.ts";
