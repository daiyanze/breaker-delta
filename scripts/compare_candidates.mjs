// Compare two candidates files (Python vs Node dual-run) and print
// a per-source table: status, item counts, URL overlap.
// Usage: node scripts/compare_candidates.mjs <py.json> <node.json>

import * as fs from "node:fs";

const [pyPath, nodePath] = process.argv.slice(2);
const py = JSON.parse(fs.readFileSync(pyPath, "utf-8"));
const nd = JSON.parse(fs.readFileSync(nodePath, "utf-8"));

const pyBy = new Map(py.sources.map((s) => [s.source, s]));
const ndBy = new Map(nd.sources.map((s) => [s.source, s]));
const sources = [...pyBy.keys()];

console.log("| source | py status | node status | py n | node n | url overlap (inter/min) | inter/union |");
console.log("|---|---|---|---|---|---|---|");
let statusMismatch = 0;
for (const src of sources) {
  const a = pyBy.get(src);
  const b = ndBy.get(src);
  if (!b) {
    console.log(`| ${src} | ${a.status} | MISSING | ${a.items.length} | - | - | - |`);
    statusMismatch += 1;
    continue;
  }
  const urlsA = new Set(a.items.map((i) => i.url));
  const urlsB = new Set(b.items.map((i) => i.url));
  const inter = [...urlsA].filter((u) => urlsB.has(u)).length;
  const union = new Set([...urlsA, ...urlsB]).size;
  const min = Math.min(urlsA.size, urlsB.size);
  const pct = (x) => (Number.isFinite(x) ? x.toFixed(2) : "-");
  if (a.status !== b.status) statusMismatch += 1;
  console.log(
    `| ${src} | ${a.status} | ${b.status} | ${a.items.length} | ${b.items.length} | ` +
      `${min ? pct(inter / min) : "-"} (${inter}/${min}) | ${union ? pct(inter / union) : "-"} |`,
  );
}
console.log("");
console.log(`py resonance groups: ${py.resonance.length}; node resonance groups: ${nd.resonance.length}`);
console.log(`py missing: ${JSON.stringify(py.missing)}`);
console.log(`node missing: ${JSON.stringify(nd.missing)}`);
console.log(`status mismatches: ${statusMismatch}`);
const pyTotal = py.sources.reduce((n, s) => n + s.items.length, 0);
const ndTotal = nd.sources.reduce((n, s) => n + s.items.length, 0);
console.log(`total items: py=${pyTotal} node=${ndTotal}`);
