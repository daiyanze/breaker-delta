/**
 * `@bd/ui/patterns` (ADR 0020, section 3): the Tide Paper parts, one folder
 * per `design/system/components/<Name>`.
 */
export { Band, type BandProps } from "./Band/Band.tsx";
export {
  type LanguageLink,
  LanguageMenu,
  type LanguageMenuProps,
} from "./LanguageMenu/LanguageMenu.tsx";
export {
  kindOf,
  SOURCE_KINDS,
  type SourceKind,
  SourceTile,
  type SourceTileProps,
} from "./SourceTile/SourceTile.tsx";
