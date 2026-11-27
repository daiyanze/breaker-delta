/** @jsxImportSource preact */
/**
 * The ticket stub (#115, `design/system/components/TicketStub`): a wave's
 * 14-day test, in a dashed frame, with its stamp. Small on the front page
 * (three side by side, in `TicketStubs`), large on the topic page with the
 * day ticks and the test's hash. The test is in the language it was written
 * in; every other text is finished text in the page's language. Hovering
 * the stub wobbles its stamp. Styles: `TicketStub.css`.
 */
import type { VNode } from "preact";
import { Stamp, type StampProps } from "../Stamp/Stamp.tsx";

/** A text and the BCP 47 tag of the language it is in. */
export interface StubText {
  text: string;
  lang: string;
}

export interface TicketStubProps {
  /** Small on the front page (the default), large on the topic page. */
  size?: "small" | "large";
  stamp: StampProps;
  /** The locked test, word for word, in the language it was written in. */
  criterion: StubText;
  /** The wave the test belongs to; the front page links each stub to it. */
  topic?: StubText & { href: string };
  /**
   * How far the 14 days have gone: "Day 7 of 14" as `label`. A large stub
   * draws a tick per day, the days gone filled. A stub with a verdict has
   * none; it has `note` instead.
   */
  progress?: { day: number; days: number; label: string };
  /** A line after the progress: on the large stub, that code locked the test. */
  note?: string;
  /** The large stub's last line: the test's hash and when it was registered. */
  hash?: string;
}

/**
 * The tick drawing of board 03: one 10-wide bar every 22, in a 30-high
 * `viewBox` (312 wide for 14 days), its lines 2 wide. The drawing scales;
 * `TicketStub.css` caps it at the board's width.
 */
function Ticks(props: { day: number; days: number; label: string }): VNode {
  const step = 22;
  const width = props.days * step + 4;
  return (
    <svg class="TicketStub-ticks" viewBox={`0 0 ${width} 30`} role="img" aria-label={props.label}>
      {Array.from({ length: props.days }, (_, k) => (
        <rect
          key={k}
          class={k < props.day ? "TicketStub-tick TicketStub-tick--gone" : "TicketStub-tick"}
          x={4 + k * step}
          y={2}
          width={10}
          height={26}
          stroke-width={2}
        />
      ))}
    </svg>
  );
}

export function TicketStub(props: TicketStubProps): VNode {
  const size = props.size ?? "small";
  const { progress } = props;
  return (
    <article class="TicketStub" data-size={size}>
      <Stamp {...props.stamp} />
      <p class="TicketStub-criterion" lang={props.criterion.lang}>
        {props.criterion.text}
      </p>
      {props.topic === undefined ? null : (
        <a class="TicketStub-topic" href={props.topic.href} lang={props.topic.lang}>
          {props.topic.text}
        </a>
      )}
      {progress !== undefined && size === "large" ? (
        // Board 03: the ticks, then the day in bold with the note after it.
        <>
          <Ticks {...progress} />
          <p class="TicketStub-day">
            <strong>{progress.label}</strong>
            {props.note === undefined ? null : ` ${props.note}`}
          </p>
        </>
      ) : (
        <>
          {progress === undefined ? null : <p class="TicketStub-small">{progress.label}</p>}
          {props.note === undefined ? null : <p class="TicketStub-small">{props.note}</p>}
        </>
      )}
      {props.hash === undefined ? null : <p class="TicketStub-small">{props.hash}</p>}
    </article>
  );
}
