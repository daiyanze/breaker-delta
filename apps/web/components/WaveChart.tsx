import Link from "next/link";

import type { Lang, Topic } from "../lib/data";

/** The topic page's big wave chart — the JSX port of waveChart in
 * render.ts: same 1020x300 geometry, gradient area, gridlines, one
 * dot per appearance linking to that edition's snapshot. */
export function WaveChart({
  topic,
  editionCount,
  lang,
}: {
  topic: Topic;
  editionCount: number;
  lang: Lang;
}) {
  const apps = topic.apps;
  if (apps.length === 0) return null;
  const W = 1020;
  const H = 300;
  const L = 46;
  const R = 30;
  const T = 18;
  const B = 34;
  const iw = W - L - R;
  const ih = H - T - B;
  const vmax = Math.max(...apps.map((a) => a.heat)) * 1.15 || 1;
  const x = (edition: number) => L + (edition * iw * (2 / 3)) / Math.max(1, editionCount - 1);
  const y = (v: number) => T + ih - (v / vmax) * ih;
  const f0 = (n: number) => n.toFixed(0);
  const pts = apps.map((a) => [x(a.edition), y(a.heat)] as const);
  const line = pts.map(([a, b]) => `${f0(a)},${f0(b)}`).join(" ");
  const area =
    pts.length >= 2
      ? `M${f0(pts[0][0])},${f0(y(0))} ` +
        pts.map(([a, b]) => `L${f0(a)},${f0(b)}`).join(" ") +
        ` L${f0(pts[pts.length - 1][0])},${f0(y(0))} Z`
      : "";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img">
      <defs>
        <linearGradient id="wgrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5eead4" stopOpacity=".38" />
          <stop offset="1" stopColor="#5eead4" stopOpacity=".03" />
        </linearGradient>
      </defs>
      {[0, 0.25, 0.5, 0.75, 1.0].map((gv) => {
        const v = vmax * gv;
        return (
          <g key={gv}>
            <line x1={L} y1={f0(y(v))} x2={W - R} y2={f0(y(v))} stroke="rgba(255,255,255,.07)" />
            <text x={L - 8} y={f0(y(v) + 4)} fill="#5f7189" fontSize="11" textAnchor="end">
              {f0(v)}
            </text>
          </g>
        );
      })}
      {pts.length >= 2 ? (
        <>
          <path d={area} fill="url(#wgrad)" />
          <polyline
            points={line}
            fill="none"
            stroke="#5eead4"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </>
      ) : null}
      {apps.map((a, i) => (
        <Link key={i} href={`/${lang}/edition/${a.date}-${a.slot ?? "None"}`}>
          <circle cx={f0(pts[i][0])} cy={f0(pts[i][1])} r="4.5" fill="#5eead4" />
          <text x={f0(pts[i][0])} y={H - 12} fill="#5f7189" fontSize="11" textAnchor="middle">
            {a.date.slice(5)}
          </text>
          <text x={f0(pts[i][0])} y={f0(pts[i][1] - 10)} fill="#cbd5e1" fontSize="11" textAnchor="middle">
            {a.heat}
          </text>
        </Link>
      ))}
    </svg>
  );
}
