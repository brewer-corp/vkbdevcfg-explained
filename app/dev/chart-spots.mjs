// Read control positions out of one of VKB's fill-in charts (the PDFs linked from their product pages as "Gladiator
// Profile Templates"). Each box on a chart has a leader line that ends on the control the box is for; the lines are
// vectors in the PDF, so their ends are exact. This is where the `spots` in src/ui/stickart.paths.ts come from.
//
//   pdfimages -png chart.pdf chart        # the photo, for dev/photo-to-lines.mjs and for this script
//   node dev/chart-spots.mjs chart        # needs chart.pdf and chart-000.png; writes chart.spots.json
//
// Needs poppler's pdftocairo and pdftotext. Positions come out in the photo's pixels.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
const base = process.argv[2];
execSync(`pdftocairo -svg ${base}.pdf ${base}.svg`);
const svg = readFileSync(`${base}.svg`, 'utf8');
const mat = (s) => s.match(/matrix\(([^)]*)\)/)[1].split(',').map(Number);
const img = mat(svg.match(/<use xlink:href="#source-\d+" transform="[^"]*"/)[0]);       // photo pixel -> page point
const toPhoto = ([x, y]) => [(x - img[4]) / img[0], (y - img[5]) / img[3]];

// red segments, in page points
const segs = [];
for (const m of svg.matchAll(/<path[^>]*stroke="rgb\(([\d.]+)%, ([\d.]+)%, ([\d.]+)%\)"[^>]*d="([^"]*)"[^>]*transform="([^"]*)"/g)) {
  if (!(+m[1] > 70 && +m[2] < 40 && +m[3] < 40)) continue;
  const t = mat(m[5]), pts = [...m[4].matchAll(/[ML] (-?[\d.]+) (-?[\d.]+)/g)].map((p) => [t[0] * +p[1] + t[2] * +p[2] + t[4], t[1] * +p[1] + t[3] * +p[2] + t[5]]);
  for (let i = 1; i < pts.length; i++) segs.push([pts[i - 1], pts[i]]);
}
// join segments that share an end into leaders; a leader's free ends are the points used once
const key = (p) => `${Math.round(p[0])},${Math.round(p[1])}`, near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1.6;
const group = segs.map((_, i) => i);
const find = (i) => (group[i] === i ? i : (group[i] = find(group[i])));
for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) if (segs[i].some((p) => segs[j].some((q) => near(p, q)))) group[find(i)] = find(j);
const leaders = new Map();
segs.forEach((s, i) => { const g = find(i); if (!leaders.has(g)) leaders.set(g, []); leaders.get(g).push(s); });

// the stick's silhouette, to tell which end of a leader is on it
const png = PNG.sync.read(readFileSync(`${base}-000.png`)), W = png.width, H = png.height;
const dark = (x, y) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= W || y >= H) return false; const i = 4 * (y * W + x); return 0.299 * png.data[i] + 0.587 * png.data[i + 1] + 0.114 * png.data[i + 2] < 170 || (png.data[i] > 140 && png.data[i + 1] < 90); };
const onStick = (p) => { const [x, y] = toPhoto(p); let n = 0; for (let dy = -18; dy <= 18; dy += 6) for (let dx = -18; dx <= 18; dx += 6) if (dark(x + dx, y + dy)) n++; return n; };

// box titles, from the text layer
const words = [...execSync(`pdftotext -bbox ${base}.pdf -`).toString().matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)</g)].map((m) => ({ x: +m[1], y: +m[2], t: m[5] }));
const ID = { A1: 'a1', A2: 'a2', A3: 'a3', A4: 'a4', B1: 'b1', C1: 'c1', D1: 'd1', Sw1: 'sw1', En1: 'en', Base: 'f', Rapid: 'rapid', Main: 'trigger' };
const titles = words.filter((w, i) => ID[w.t] && !(w.t === 'A1' && words[i + 1]?.t === 'Ministick')).map((w) => ({ id: ID[w.t], y: w.y, side: w.x < 300 ? 'left' : 'right' }));
const boxOf = (p) => {
  const side = p[0] < 396 ? 'left' : 'right', col = titles.filter((t) => t.side === side).sort((a, b) => a.y - b.y);
  let best = col[0]; for (const t of col) if (p[1] >= t.y - 6) best = t;
  return best.id;
};

const spots = {};
for (const pts of leaders.values()) {
  // a free end is a segment end that no other segment of the same leader touches (joints overlap by half a point)
  const ends = pts.flatMap((seg) => seg.filter((p) => !pts.some((other) => other !== seg && other.some((q) => near(p, q)))));
  if (ends.length !== 2) { console.log('  odd leader, ends:', ends.length); continue; }
  const [control, box] = onStick(ends[0]) >= onStick(ends[1]) ? ends : [ends[1], ends[0]];
  spots[boxOf(box)] = toPhoto(control).map(Math.round);
}
writeFileSync(`${base}.spots.json`, JSON.stringify(spots));
console.log(`${base}: ${segs.length} segments, ${leaders.size} leaders ->`, Object.keys(spots).length, 'controls:', JSON.stringify(spots));
