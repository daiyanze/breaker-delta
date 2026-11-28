/**
 * `@bd/ui/primitives` (ADR 0020, section 3): the controls the patterns and
 * pages are made from.
 */

export { Button, type ButtonProps, type ButtonVariant } from "./Button/Button.tsx";
export { type FilterItem, Filters, type FiltersProps } from "./Filters/Filters.tsx";
export { Notice, type NoticeProps } from "./Notice/Notice.tsx";
export { SearchEntry, type SearchEntryProps } from "./SearchEntry/SearchEntry.tsx";
export {
  default as ThemeSwitch,
  type ThemeSwitchProps,
} from "./ThemeSwitch/ThemeSwitch.island.tsx";
