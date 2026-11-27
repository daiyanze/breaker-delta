/**
 * `@bd/ui/patterns` (ADR 0020, section 3): the Tide Paper parts, one folder
 * per `design/system/components/<Name>`.
 */
export { Band, type BandProps } from "./Band/Band.tsx";
export {
  EchoStack,
  type EchoStackProps,
  echoStackLayers,
  MAX_LAYERS as ECHO_STACK_MAX_LAYERS,
  MIN_LAYERS as ECHO_STACK_MIN_LAYERS,
} from "./EchoStack/EchoStack.tsx";
export {
  FULL_HEIGHT as HEADLINE_FULL_HEIGHT,
  Headline,
  type HeadlineLead,
  type HeadlineProps,
  type HeadlineStory,
  type HeadlineTier,
  headlineSize,
} from "./Headline/Headline.tsx";
export {
  type LanguageLink,
  LanguageMenu,
  type LanguageMenuProps,
} from "./LanguageMenu/LanguageMenu.tsx";
