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
export { FadingNotices, type FadingNoticesProps } from "./FadingNotices/FadingNotices.tsx";
export {
  Footer,
  type FooterLink,
  type FooterProps,
  type FooterSubscribe,
} from "./Footer/Footer.tsx";
export {
  FULL_HEIGHT as HEADLINE_FULL_HEIGHT,
  Headline,
  type HeadlineLead,
  type HeadlineProps,
  type HeadlineStory,
  type HeadlineTier,
  headlineSize,
} from "./Headline/Headline.tsx";
export { default as Index, type IndexProps } from "./Index/Index.island.tsx";
export { IndexRow, type IndexRowProps } from "./IndexRow/IndexRow.tsx";
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
export { STAMP_KINDS, Stamp, type StampKind, type StampProps } from "./Stamp/Stamp.tsx";
export { type StubText, TicketStub, type TicketStubProps } from "./TicketStub/TicketStub.tsx";
export { TicketStubs, type TicketStubsProps } from "./TicketStubs/TicketStubs.tsx";
export { TideTable, type TideTableProps, type TideWave } from "./TideTable/TideTable.tsx";
export {
  MARK_KINDS,
  type MarkKind,
  VerdictMark,
  type VerdictMarkProps,
} from "./VerdictMark/VerdictMark.tsx";
export { VerdictMarks, type VerdictMarksProps } from "./VerdictMarks/VerdictMarks.tsx";
