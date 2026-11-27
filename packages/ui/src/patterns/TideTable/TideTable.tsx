/** @jsxImportSource preact */
/**
 * The tide table (#121, boards 01 and 02): a picture of the day, when waves
 * formed, hour by hour. A 24-hour chart whose sea surface swells at each
 * wave's formation hour (`surface.ts`), a red dot per wave with its height,
 * high water marked, and under it a list of the same waves as links, which
 * is what a screen reader reads: the chart is one image with a summary.
 *
 * Two SVGs, one inside the other. The inner one holds the sea in hours
 * across and pixels down, stretched to the width (`preserveAspectRatio`
 * none, strokes that do not scale); the outer one holds everything with
 * text or a round shape, placed by a share of the width and drawn in
 * pixels, so the type keeps its size and the page never scrolls sideways.
 * Styles: `TideTable.css`.
 */
import type { VNode } from "preact";
import {
  across,
  areaPath,
  clock,
  HEIGHT,
  HOURS,
  highWater,
  labelOffsets,
  PER_HOUR,
  seaY,
  surfacePath,
  WATERLINE,
} from "./surface.ts";

/** One wave formed today, as the page has resolved it. */
export interface TideWave {
  /** The wave's topic page. */
  href: string;
  /** The hour of the day it formed, 0 to 24, in the site's time zone. */
  hour: number;
  /** The same as a clock time, `HH:MM`. */
  at: string;
  /** Its headline, and the headline's language (BCP 47). */
  title: string;
  lang: string;
  /** Its wave height now, computed by `@bd/core`; shown rounded. */
  height: number;
}

export interface TideTableProps {
  /** The waves formed today, in any order. */
  waves: readonly TideWave[];
  /** The edition's hour of the day, 0 to 24: where the surface ends. */
  now: number;
  /** The chart's one-line summary for a screen reader. */
  summary: string;
  /** The label over the line at `now`. */
  nowLabel: string;
  /** The label over the hours after `now`. */
  laterLabel: string;
  /** High water's label, given its time as `HH:MM`. */
  highWaterLabel: (time: string) => string;
}

/** Where the text sits, in pixels from the top (board 01). */
const NOW_LABEL_Y = 22;
const NOW_LINE_TOP = 30;
const LATER_LABEL_Y = 150;
const HOUR_LABEL_Y = 252;
const TICK = 4;
const MAJOR_TICK = 8;
/** High water's level line and label, above the highest point. */
const HIGH_LINE = -26;
const HIGH_LABEL = -34;
/** How far short of the highest point the level line stops, in hours. */
const HIGH_LINE_SHORT = 0.75;
/** "still to come" only where the rest of the day has room for it. */
const LATER_MIN_HOURS = 6;

const HOUR_MARKS = Array.from({ length: HOURS + 1 }, (_, h) => h);
const HOUR_LABELS = HOUR_MARKS.filter((h) => h % 3 === 0);

export function TideTable(props: TideTableProps): VNode {
  const now = Math.min(Math.max(props.now, 0), HOURS);
  const waves = props.waves
    .map((w) => ({ ...w, hour: Math.min(Math.max(w.hour, 0), now) }))
    .sort((a, b) => a.hour - b.hour);
  const high = highWater(waves, now);
  const surface = surfacePath(waves, high.level, now);
  const highY = seaY(waves, high.level, high.hour);
  const dots = waves.map((w) => ({ hour: w.hour, y: seaY(waves, high.level, w.hour) }));
  const offsets = labelOffsets(dots);
  return (
    <div class="TideTable">
      <div class="TideTable-chart">
        <svg class="TideTable-svg" role="img" aria-label={props.summary}>
          <svg
            class="TideTable-sea"
            viewBox={`0 0 ${HOURS * PER_HOUR} ${HEIGHT}`}
            preserveAspectRatio="none"
            width="100%"
            height="100%"
            aria-hidden="true"
          >
            <g class="TideTable-crest">
              <path class="TideTable-area" d={areaPath(surface, now)} />
              <path class="TideTable-surface" d={surface} />
            </g>
          </svg>
          {waves.length === 0 ? null : (
            <g>
              <line
                class="TideTable-high"
                x1="0"
                x2={across(Math.max(high.hour - HIGH_LINE_SHORT, 0))}
                y1={highY + HIGH_LINE}
                y2={highY + HIGH_LINE}
              />
              <text class="TideTable-highLabel" x="0" y={highY + HIGH_LABEL}>
                {props.highWaterLabel(clock(high.hour))}
              </text>
            </g>
          )}
          {waves.map((w, i) => {
            const y = dots[i]?.y ?? 0;
            return (
              <g key={w.href}>
                <circle class="TideTable-dot" cx={across(w.hour)} cy={y} />
                <text class="TideTable-height" x={across(w.hour)} y={y + (offsets[i] ?? 0)}>
                  {Math.round(w.height)}
                </text>
              </g>
            );
          })}
          {HOUR_MARKS.map((h) => (
            <line
              key={h}
              class="TideTable-tick"
              x1={across(h)}
              x2={across(h)}
              y1={WATERLINE}
              y2={WATERLINE + (h % 3 === 0 ? MAJOR_TICK : TICK)}
            />
          ))}
          <line class="TideTable-waterline" x1="0" x2="100%" y1={WATERLINE} y2={WATERLINE} />
          <line
            class="TideTable-now"
            x1={across(now)}
            x2={across(now)}
            y1={NOW_LINE_TOP}
            y2={WATERLINE}
          />
          <text class="TideTable-nowLabel" x={across(now)} y={NOW_LABEL_Y}>
            {props.nowLabel}
          </text>
          {HOURS - now < LATER_MIN_HOURS ? null : (
            <text class="TideTable-later" x={across((now + HOURS) / 2)} y={LATER_LABEL_Y}>
              {props.laterLabel}
            </text>
          )}
          {HOUR_LABELS.map((h) => (
            <text
              key={h}
              class={h % 6 === 0 ? "TideTable-hour" : "TideTable-hour TideTable-hour-odd"}
              x={across(h)}
              y={HOUR_LABEL_Y}
            >
              {clock(h)}
            </text>
          ))}
        </svg>
      </div>
      <ol class="TideTable-list">
        {[...waves].reverse().map((w) => (
          <li key={w.href} class="TideTable-item">
            <a class="TideTable-link" href={w.href}>
              <span class="TideTable-at">{w.at}</span>
              <span class="TideTable-title" lang={w.lang}>
                {w.title}
              </span>
              <span class="TideTable-wave">{Math.round(w.height)}</span>
            </a>
          </li>
        ))}
      </ol>
    </div>
  );
}
