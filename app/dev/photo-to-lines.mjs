// Photo -> line drawing, as vector paths. This is how the stick drawings in src/ui/stickart.paths.ts were made.
//
// Take a photo of the stick against a plain light background (even light, no hard shadows), then:
//   node dev/photo-to-lines.mjs photo.png out.json [gamma] [low] [high] [minLength] [scaleUp]
// It writes out.json (the entry for stickart.paths.ts) and out.svg (a preview to look at).
//
// What it does: finds the stick's silhouette (the largest dark shape), lifts the shadows so that black plastic on
// black plastic has some contrast (gamma), runs Canny edge detection inside the silhouette (low / high are the
// hysteresis thresholds, as fractions of the edge strengths found), and follows the edge pixels into polylines,
// dropping fragments shorter than minLength pixels. scaleUp enlarges a small photo first. Parts that are red in the
// photo are kept as filled shapes. The two drawings in the app used: 0.6 0.45 0.72 14 1 (a 1200 px photo) and
// 0.6 0.40 0.70 9 2 (a 450 px one).
import { readFileSync, writeFileSync } from 'node:fs';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
const [file, outFile, gamma = '0.6', lowP = '0.45', highP = '0.72', minLen = '14', up = '1'] = process.argv.slice(2);
const raw = readFileSync(file), src = file.endsWith('.png') ? PNG.sync.read(raw) : jpeg.decode(raw, { useTArray: true });
const S = +up, W = src.width * S, H = src.height * S, N = W * H;
// luminance, optionally enlarged (bilinear) so a small photo gives lines as fine as a large one
const lum0 = new Float32Array(src.width * src.height), red0 = new Uint8Array(src.width * src.height);
for (let i = 0; i < lum0.length; i++) { const r = src.data[4 * i], g = src.data[4 * i + 1], b = src.data[4 * i + 2]; lum0[i] = 0.299 * r + 0.587 * g + 0.114 * b; red0[i] = r > 140 && g < 0.55 * r && b < 0.55 * r ? 1 : 0; }
const lum = new Float32Array(N), red = new Uint8Array(N);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const fx = Math.min(src.width - 1.001, x / S), fy = Math.min(src.height - 1.001, y / S), x0 = fx | 0, y0 = fy | 0, ax = fx - x0, ay = fy - y0, i = y0 * src.width + x0;
  lum[y * W + x] = (lum0[i] * (1 - ax) + lum0[i + 1] * ax) * (1 - ay) + (lum0[i + src.width] * (1 - ax) + lum0[i + src.width + 1] * ax) * ay;
  red[y * W + x] = red0[Math.round(fy) * src.width + Math.round(fx)];
}
const idx = (x, y) => y * W + x;
const morph = (m, r, grow) => { const pass = (s, hz) => { const d = new Uint8Array(N); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let v = grow ? 0 : 1; for (let k = -r; k <= r; k++) { const xx = hz ? x + k : x, yy = hz ? y : y + k; const q = xx < 0 || yy < 0 || xx >= W || yy >= H ? 0 : s[idx(xx, yy)]; if (grow ? q : !q) { v = grow ? 1 : 0; break; } } d[idx(x, y)] = v; } return d; }; return pass(pass(m, true), false); };
function largest(m) { const label = new Int32Array(N); let best = 0, bestArea = 0, n = 0; for (let s = 0; s < N; s++) { if (!m[s] || label[s]) continue; const st = [s]; label[s] = ++n; let a = 0; while (st.length) { const i = st.pop(); a++; const x = i % W; for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) if (j >= 0 && j < N && m[j] && !label[j]) { label[j] = n; st.push(j); } } if (a > bestArea) { bestArea = a; best = n; } } const o = new Uint8Array(N); for (let i = 0; i < N; i++) o[i] = label[i] === best ? 1 : 0; return o; }
function blobs(m, minArea) { const label = new Int32Array(N), out = []; let n = 0; for (let s = 0; s < N; s++) { if (!m[s] || label[s]) continue; const st = [s], px = []; label[s] = ++n; while (st.length) { const i = st.pop(); px.push(i); const x = i % W; for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) if (j >= 0 && j < N && m[j] && !label[j]) { label[j] = n; st.push(j); } } if (px.length >= minArea) { const o = new Uint8Array(N); for (const i of px) o[i] = 1; out.push(o); } } return out; }
function fillHoles(m) { const o = new Uint8Array(N).fill(1), st = []; for (let x = 0; x < W; x++) st.push(idx(x, 0), idx(x, H - 1)); for (let y = 0; y < H; y++) st.push(idx(0, y), idx(W - 1, y)); while (st.length) { const i = st.pop(); if (m[i] || !o[i]) continue; o[i] = 0; const x = i % W, y = (i / W) | 0; if (x > 0) st.push(i - 1); if (x < W - 1) st.push(i + 1); if (y > 0) st.push(i - W); if (y < H - 1) st.push(i + W); } return o; }
function contour(m) { let s = m.indexOf(1); if (s < 0) return []; const at = (x, y) => x >= 0 && y >= 0 && x < W && y < H && m[idx(x, y)], D = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]; const sx = s % W, sy = (s / W) | 0; let x = sx, y = sy, d = 6; const p = []; for (let g = 0; g < 4 * N; g++) { p.push([x, y]); let f = false; for (let k = 0; k < 8; k++) { const nd = (d + 6 + k) % 8, nx = x + D[nd][0], ny = y + D[nd][1]; if (at(nx, ny)) { x = nx; y = ny; d = nd; f = true; break; } } if (!f || (x === sx && y === sy && p.length > 2)) break; } return p; }
function rdp(pts, eps) { if (pts.length < 3) return pts; const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1; const rec = (a, b) => { let w = -1, wd = eps; const [ax, ay] = pts[a], [bx, by] = pts[b], len = Math.hypot(bx - ax, by - ay) || 1; for (let i = a + 1; i < b; i++) { const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / len; if (d > wd) { wd = d; w = i; } } if (w > 0) { keep[w] = 1; rec(a, w); rec(w, b); } }; rec(0, pts.length - 1); return pts.filter((_, i) => keep[i]); }
const chaikin = (pts) => pts.flatMap((p, i) => { const q = pts[(i + 1) % pts.length]; return [[0.75 * p[0] + 0.25 * q[0], 0.75 * p[1] + 0.25 * q[1]], [0.25 * p[0] + 0.75 * q[0], 0.25 * p[1] + 0.75 * q[1]]]; });
const f = (v) => +(v / S).toFixed(1);                        // back to the photo's own pixels
const ring = (m, eps) => { const c = contour(m); const half = Math.floor(c.length / 2); const s = [...rdp(c.slice(0, half + 1), eps), ...rdp(c.slice(half), eps).slice(1, -1)]; return 'M' + chaikin(s).map((p) => `${f(p[0])},${f(p[1])}`).join('L') + 'Z'; };

// silhouette
const redBlobs = morph(morph(red, 2 * S, false), 2 * S, true);
let dark = new Uint8Array(N); for (let i = 0; i < N; i++) dark[i] = lum[i] < 170 || redBlobs[i] ? 1 : 0;
const kk = Math.max(1, Math.round(W / 450));
const body = fillHoles(largest(morph(morph(dark, 2 * kk, true), 2 * kk, false)));
const near = morph(body, 3 * kk, true);

// Canny
let g = new Float32Array(N); for (let i = 0; i < N; i++) g[i] = 255 * Math.pow(lum[i] / 255, +gamma);
const K = [1, 4, 7, 4, 1].map((v) => v / 17);
const conv = (s, hz) => { const d = new Float32Array(N); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let a = 0; for (let k = -2; k <= 2; k++) { const xx = Math.min(W - 1, Math.max(0, hz ? x + k : x)), yy = Math.min(H - 1, Math.max(0, hz ? y : y + k)); a += s[yy * W + xx] * K[k + 2]; } d[y * W + x] = a; } return d; };
for (let p = 0; p < 2; p++) g = conv(conv(g, true), false);
const mag = new Float32Array(N), dir = new Uint8Array(N);
for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = idx(x, y); const gx = g[i - W + 1] + 2 * g[i + 1] + g[i + W + 1] - g[i - W - 1] - 2 * g[i - 1] - g[i + W - 1], gy = g[i + W - 1] + 2 * g[i + W] + g[i + W + 1] - g[i - W - 1] - 2 * g[i - W] - g[i - W + 1]; mag[i] = Math.hypot(gx, gy); const a = ((Math.atan2(gy, gx) * 180) / Math.PI + 180) % 180; dir[i] = a < 22.5 || a >= 157.5 ? 0 : a < 67.5 ? 1 : a < 112.5 ? 2 : 3; }
const thin = new Float32Array(N), ST = [[1, 0], [1, 1], [0, 1], [-1, 1]];
for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = idx(x, y), [dx, dy] = ST[dir[i]]; if (near[i] && mag[i] >= mag[i + dy * W + dx] && mag[i] > mag[i - dy * W - dx]) thin[i] = mag[i]; }
const sorted = Float32Array.from(thin).filter((v) => v > 0).sort(), lo = sorted[Math.floor(sorted.length * +lowP)], hi = sorted[Math.floor(sorted.length * +highP)];
const edge = new Uint8Array(N), st = []; for (let i = 0; i < N; i++) if (thin[i] >= hi) { edge[i] = 1; st.push(i); }
while (st.length) { const i = st.pop(); for (const d of [-W - 1, -W, -W + 1, -1, 1, W - 1, W, W + 1]) { const j = i + d; if (j > 0 && j < N && !edge[j] && thin[j] >= lo) { edge[j] = 1; st.push(j); } } }

// follow the edge pixels into polylines
const NB = [1, -1, W, -W, W + 1, W - 1, -W + 1, -W - 1], used = new Uint8Array(N), lines = [];
const degree = (i) => NB.reduce((n, d) => n + (edge[i + d] ? 1 : 0), 0);
const walk = (start) => { const pts = []; let i = start; while (i >= 0) { used[i] = 1; pts.push([i % W, (i / W) | 0]); let next = -1; for (const d of NB) { const j = i + d; if (edge[j] && !used[j]) { next = j; break; } } i = next; } return pts; };
for (const ends of [true, false]) for (let i = W; i < N - W; i++) if (edge[i] && !used[i] && (!ends || degree(i) === 1)) { const p = walk(i); if (p.length >= +minLen * S) lines.push(p); }
const d = lines.map((p) => 'M' + rdp(p, 0.75 * S).map((q) => `${f(q[0])},${f(q[1])}`).join('L')).join('');
const result = { w: src.width, h: src.height, box: null, body: ring(morph(morph(body, kk, false), kk, true), 0.9 * kk), lines: d, reds: blobs(redBlobs, 25 * kk * kk).map((m) => ring(m, 0.8 * kk)) };
{ // the part of the photo the stick occupies, with a little margin
  const n = result.body.match(/-?\d+\.?\d*/g).map(Number), xs = n.filter((_, i) => i % 2 === 0), ys = n.filter((_, i) => i % 2 === 1), pad = Math.round(src.width / 80);
  result.box = [Math.floor(Math.min(...xs)) - pad, Math.floor(Math.min(...ys)) - pad, Math.ceil(Math.max(...xs) - Math.min(...xs)) + 2 * pad, Math.ceil(Math.max(...ys) - Math.min(...ys)) + 2 * pad];
}
writeFileSync(outFile, JSON.stringify({ box: result.box, body: result.body, lines: result.lines, reds: result.reds }));
writeFileSync(outFile.replace(/\.json$/, '.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${result.w} ${result.h}" width="${result.w * (result.w < 600 ? 2 : 1)}"><rect width="100%" height="100%" fill="#050403"/><path d="${result.body}" fill="#15110b"/><path d="${d}" fill="none" stroke="#f3dcc0" stroke-width="${result.w / 900}" stroke-linecap="round" stroke-linejoin="round"/>${result.reds.map((r) => `<path d="${r}" fill="#b3271d" fill-opacity=".8"/>`).join('')}</svg>`);
console.log(`${file}: ${result.w}x${result.h} (worked at x${S}); ${lines.length} lines, path ${(d.length / 1024).toFixed(0)} KB, ${result.reds.length} red parts`);
