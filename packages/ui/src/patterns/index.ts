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
export { STAMP_KINDS, Stamp, type StampKind, type StampProps } from "./Stamp/Stamp.tsx";
export { type StubText, TicketStub, type TicketStubProps } from "./TicketStub/TicketStub.tsx";
export { TicketStubs, type TicketStubsProps } from "./TicketStubs/TicketStubs.tsx";
export {
  MARK_KINDS,
  type MarkKind,
  VerdictMark,
  type VerdictMarkProps,
} from "./VerdictMark/VerdictMark.tsx";
export { VerdictMarks, type VerdictMarksProps } from "./VerdictMarks/VerdictMarks.tsx";
