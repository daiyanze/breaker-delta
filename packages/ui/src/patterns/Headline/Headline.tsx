/** @jsxImportSource preact */
/**
 * The front page's headlines in three tiers (#119,
 * `design/system/components/Headline`, boards 01 and 02): the lead story,
 * then the second tier (ranks 2 and 3) and the third (ranks 4 to 6) in
 * newspaper columns. A headline's size follows its wave's height:
 * `base + height ÷ 200 × span`, per tier, desktop and phone (`HEADLINE` in
 * the tokens supplement). A wave formed today has a red number; a wave
 * going out is set in `ink-2` at weight 500. The lead has a red kicker, the
 * echo stack (#114), its height in red and a trend line that draws itself
 * on load. Styles: `Headline.css`.
 *
 * The size is set by CSS from the height, so the page holds no style
 * attribute: the title carries `data-height`, the height rounded and
 * clamped to 0 to 200 and written in three digits, which `Headline.css`
 * reads digit by digit (its first two and its last).
 */
import type { VNode } from "preact";
import { HEADLINE } from "../../tokens/index.ts";
import { EchoStack } from "../EchoStack/EchoStack.tsx";

/** The height at which a headline reaches its tier's full size. */
export const FULL_HEIGHT = 200;

export type HeadlineTier = "lead" | "second" | "third";

/** One story under a headline. Every string is finished text in the page's language. */
export interface HeadlineStory {
  /** The topic page. */
  href: string;
  /** The headline, in its own language. */
  title: { lang: string; text: string };
  /** The wave's height, as `@bd/core` computed it. */
  height: number;
  /** The wave formed today: its number is red. */
  formedToday: boolean;
  /** The wave is going out (down over 24 hours): its headline is `ink-2` at weight 500. */
  fading: boolean;
  /** The change over 24 hours, e.g. "Up 63% in 24 hours." */
  delta: string;
  /** Sources and echoes, e.g. "6 independent sources, 31 echoes."; the third tier leaves it out. */
  meta: string;
}

export interface HeadlineLead extends HeadlineStory {
  /** The line above the headline, e.g. "Tallest wave right now". */
  kicker: string;
  /** The echo stack's label, naming its number of sheets (`EchoStack`). */
  stackLabel: string;
  /** Heights at the last few runs, oldest first, ending at this run. */
  trend: readonly number[];
  /** What the trend line shows, read out in place of the picture. */
  trendLabel: string;
}

export interface HeadlineProps {
  lead: HeadlineLead;
  /** Ranks 2 and 3. */
  second: readonly HeadlineStory[];
  /** Ranks 4 to 6. */
  third: readonly HeadlineStory[];
  /** The one-line key under the tiers. */
  note?: string;
}

const px = (value: string) => Number.parseFloat(value);

/** A headline's size in pixels: `base + height ÷ 200 × span`, the height clamped to 0 to 200. */
export function headlineSize(tier: HeadlineTier, height: number, phone = false): number {
  const where = phone ? "Phone" : "";
  const base = px(HEADLINE[`${tier}${where}Base`]);
  const span = px(HEADLINE[`${tier}${where}Span`]);
  return base + (scaleHeight(height) / FULL_HEIGHT) * span;
}

/** The height the size is read from: rounded, at least 0 and at most 200. */
export function scaleHeight(height: number): number {
  if (!Number.isFinite(height)) return height > 0 ? FULL_HEIGHT : 0;
  return Math.min(FULL_HEIGHT, Math.max(0, Math.round(height)));
}

/** `data-height`: the scale height in three digits, "042". */
export function heightDigits(height: number): string {
  return String(scaleHeight(height)).padStart(3, "0");
}

/** The trend line's path in the `0 0 520 110` box, the board's geometry; one point is a level line. */
export function trendPath(trend: readonly number[]): string {
  if (trend.length < 2) return "M4,60 L516,60";
  const max = Math.max(...trend);
  const min = Math.min(...trend) * 0.85;
  const range = max - min || 1;
  const step = 512 / (trend.length - 1);
  const points = trend.map(
    (v, k) => `${Math.round(4 + k * step)},${Math.round(98 - ((v - min) / range) * 86)}`,
  );
  return `M${points.join(" L")}`;
}

function Title(props: { story: HeadlineStory; tier: HeadlineTier }): VNode {
  const { story } = props;
  const cls = `Headline-title Headline-title-${props.tier}${story.fading ? " Headline-fading" : ""}`;
  return (
    <h3 class={cls} data-height={heightDigits(story.height)}>
      <a class="Headline-link" href={story.href} lang={story.title.lang}>
        {story.title.text}
      </a>
    </h3>
  );
}

function WaveNumber(props: { height: number; red: boolean; tier: HeadlineTier }): VNode {
  const cls = `Headline-number Headline-number-${props.tier}${props.red ? " Headline-new" : ""}`;
  return (
    <data class={cls} value={props.height}>
      {Math.round(props.height)}
    </data>
  );
}

function Story(props: { story: HeadlineStory; tier: "second" | "third" }): VNode {
  const { story, tier } = props;
  return (
    <article class={`Headline-story Headline-${tier}`}>
      <WaveNumber height={story.height} red={story.formedToday} tier={tier} />
      <Title story={story} tier={tier} />
      <p class="Headline-note">
        {story.delta}
        {tier === "second" ? <span class="Headline-meta"> {story.meta}</span> : null}
      </p>
    </article>
  );
}

function Lead(props: { lead: HeadlineLead }): VNode {
  const { lead } = props;
  const line = trendPath(lead.trend);
  return (
    <article class="Headline-lead">
      <p class="Headline-kicker">{lead.kicker}</p>
      <Title story={lead} tier="lead" />
      <div class="Headline-figures">
        <EchoStack height={lead.height} label={lead.stackLabel} />
        {/* The lead's height is always red (`wave-number`: "头条…的浪高数字，用 red"). */}
        <WaveNumber height={lead.height} red={true} tier="lead" />
        <div class="Headline-trend">
          <svg class="Headline-chart" viewBox="0 0 520 110" role="img" aria-label={lead.trendLabel}>
            <path class="Headline-chart-area" d={`${line} L516,104 L4,104 Z`} />
            <path class="Headline-chart-line" pathLength={1} d={line} />
            <path class="Headline-chart-base" d="M4,104 L516,104" />
          </svg>
          <p class="Headline-lead-note">
            <strong>{lead.delta}</strong> {lead.meta}
          </p>
        </div>
      </div>
    </article>
  );
}

export function Headline(props: HeadlineProps): VNode {
  return (
    <div class="Headline">
      <Lead lead={props.lead} />
      {props.second.length === 0 ? null : (
        <div class="Headline-columns Headline-columns-second">
          {props.second.map((s) => (
            <Story key={s.href} story={s} tier="second" />
          ))}
        </div>
      )}
      {props.third.length === 0 ? null : (
        <div class="Headline-columns Headline-columns-third">
          {props.third.map((s) => (
            <Story key={s.href} story={s} tier="third" />
          ))}
        </div>
      )}
      {props.note === undefined ? null : <p class="Headline-key">{props.note}</p>}
    </div>
  );
}
