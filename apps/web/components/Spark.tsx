// Mini wave sparkline — the JSX port of publisher's sparkSvg:
// same 64x26 geometry, area + line + end dot.
export function Spark({ points }: { points: number[] }) {
  if (points.length === 0) return null;
  if (points.length === 1) {
    return (
      <svg className="spark-svg" viewBox="0 0 64 26" width="64" height="26">
        <circle cx="60" cy="13" r="2.6" fill="currentColor" />
      </svg>
    );
  }
  const W = 64;
  const H = 26;
  const P = 3;
  const lo = Math.min(...points);
  const hi = Math.max(...points);
  const rng = hi - lo || 1;
  const pts = points.map(
    (v, i) =>
      [
        P + (i * (W - 2 * P)) / (points.length - 1),
        H - P - ((v - lo) / rng) * (H - 2 * P),
      ] as const,
  );
  const f = (x: number) => x.toFixed(1);
  const line = pts.map(([x, y]) => `${f(x)},${f(y)}`).join(" ");
  const area =
    `M${f(pts[0][0])},${H} ` +
    pts.map(([x, y]) => `L${f(x)},${f(y)}`).join(" ") +
    ` L${f(pts[pts.length - 1][0])},${H} Z`;
  return (
    <svg className="spark-svg" viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
      <path d={area} fill="currentColor" opacity=".16" />
      <polyline
        points={line}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle
        cx={f(pts[pts.length - 1][0])}
        cy={f(pts[pts.length - 1][1])}
        r="2.6"
        fill="currentColor"
      />
    </svg>
  );
}
