"use client";

import { useRouter } from "next/navigation";

/** Board time slider: the static page swaps rows client-side from an
 * embedded payload; here each position is a server-rendered board
 * state (?e=<index>), so the slider navigates. Same control, same
 * window (the most recent states), no embedded data blob. */
export function Slider({
  lang,
  labels,
  baseIndex,
  current,
  caption,
  currentLabel,
}: {
  lang: string;
  labels: string[];
  /** Global edition index of labels[0] (the window may start after 0). */
  baseIndex: number;
  current: number;
  caption: string;
  currentLabel: string;
}) {
  const router = useRouter();
  if (labels.length < 2) return null;
  return (
    <div className="slider-box">
      <span className="slider-cap">{caption}</span>
      <input
        type="range"
        min={0}
        max={labels.length - 1}
        step={1}
        defaultValue={current - baseIndex}
        onChange={(e) => {
          const i = Number(e.target.value);
          router.push(`/${lang}?e=${baseIndex + i}`);
        }}
      />
      <span className="slider-cur">{currentLabel}</span>
    </div>
  );
}
