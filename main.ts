// The Daily Meridian — one image that sums up the world news of Tuesday 24 November 2026.
//
// The program draws the front page itself, from scratch, every run: a masthead
// with the day named in full, one big panel for the day's lead story (Houthi
// drones strike Riyadh's PIF Tower for the second time in five days), four
// supporting panels (Gaza, Estonia–Russia, NATO in space, the leaked toll of
// Russia's war) and a recap ticker along the foot. Everything is vector-drawn
// with a hand-built stroke font, so the output is byte-for-byte identical on
// every run and needs nothing beyond the Node standard library.
//
// Run it the way the harness does:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// and it writes entry.png into the output directory (/output on the grader).

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

// ---------------------------------------------------------------------------
// Canvas: a plain RGB raster with alpha-blended drawing primitives.
// ---------------------------------------------------------------------------

const W = 1024;
const H = 1024;

type RGB = [number, number, number];

const px = new Float32Array(W * H * 3);

function blend(x: number, y: number, c: RGB, a: number): void {
  if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
  const i = (y * W + x) * 3;
  const keep = 1 - a;
  px[i] = px[i] * keep + c[0] * a;
  px[i + 1] = px[i + 1] * keep + c[1] * a;
  px[i + 2] = px[i + 2] * keep + c[2] * a;
}

function fillAll(c: RGB): void {
  for (let i = 0; i < W * H; i++) {
    px[i * 3] = c[0];
    px[i * 3 + 1] = c[1];
    px[i * 3 + 2] = c[2];
  }
}

function fillRect(x: number, y: number, w: number, h: number, c: RGB, a = 1): void {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(W, Math.ceil(x + w));
  const y1 = Math.min(H, Math.ceil(y + h));
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) blend(xx, yy, c, a);
  }
}

function fillCircle(cx: number, cy: number, r: number, c: RGB, a = 1): void {
  const x0 = Math.floor(cx - r - 1);
  const x1 = Math.ceil(cx + r + 1);
  const y0 = Math.floor(cy - r - 1);
  const y1 = Math.ceil(cy + r + 1);
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      const d = Math.hypot(xx + 0.5 - cx, yy + 0.5 - cy);
      const cov = Math.min(1, Math.max(0, r + 0.5 - d));
      if (cov > 0) blend(xx, yy, c, a * cov);
    }
  }
}

function ringCircle(cx: number, cy: number, r: number, half: number, c: RGB, a = 1): void {
  const x0 = Math.floor(cx - r - half - 1);
  const x1 = Math.ceil(cx + r + half + 1);
  const y0 = Math.floor(cy - r - half - 1);
  const y1 = Math.ceil(cy + r + half + 1);
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      const d = Math.abs(Math.hypot(xx + 0.5 - cx, yy + 0.5 - cy) - r);
      const cov = Math.min(1, Math.max(0, half + 0.5 - d));
      if (cov > 0) blend(xx, yy, c, a * cov);
    }
  }
}

function fillPoly(pts: Array<[number, number]>, c: RGB, a = 1): void {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const x0 = Math.max(0, Math.floor(minX));
  const x1 = Math.min(W - 1, Math.ceil(maxX));
  const y0 = Math.max(0, Math.floor(minY));
  const y1 = Math.min(H - 1, Math.ceil(maxY));
  const n = pts.length;
  for (let yy = y0; yy <= y1; yy++) {
    for (let xx = x0; xx <= x1; xx++) {
      const cx = xx + 0.5;
      const cy = yy + 0.5;
      let inside = false;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const [xi, yi] = pts[i];
        const [xj, yj] = pts[j];
        if ((yi > cy) !== (yj > cy) && cx < ((xj - xi) * (cy - yi)) / (yj - yi) + xi) {
          inside = !inside;
        }
      }
      if (inside) blend(xx, yy, c, a);
    }
  }
}

// A thick line segment, stamped as a capsule with a soft edge.
function strokeSeg(x1: number, y1: number, x2: number, y2: number, half: number, c: RGB, a = 1): void {
  const minX = Math.floor(Math.min(x1, x2) - half - 1);
  const maxX = Math.ceil(Math.max(x1, x2) + half + 1);
  const minY = Math.floor(Math.min(y1, y2) - half - 1);
  const maxY = Math.ceil(Math.max(y1, y2) + half + 1);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  for (let yy = minY; yy <= maxY; yy++) {
    for (let xx = minX; xx <= maxX; xx++) {
      const cx = xx + 0.5;
      const cy = yy + 0.5;
      let t = len2 === 0 ? 0 : ((cx - x1) * dx + (cy - y1) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(cx - (x1 + t * dx), cy - (y1 + t * dy));
      const cov = Math.min(1, Math.max(0, half + 0.5 - d));
      if (cov > 0) blend(xx, yy, c, a * cov);
    }
  }
}

function strokeLine(pts: Array<[number, number]>, half: number, c: RGB, a = 1): void {
  for (let i = 0; i + 1 < pts.length; i++) {
    strokeSeg(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], half, c, a);
  }
}

function dashedLine(x1: number, y1: number, x2: number, y2: number, half: number, dash: number, gap: number, c: RGB, a = 1): void {
  const total = Math.hypot(x2 - x1, y2 - y1);
  const ux = (x2 - x1) / total;
  const uy = (y2 - y1) / total;
  for (let s = 0; s < total; s += dash + gap) {
    const e = Math.min(total, s + dash);
    strokeSeg(x1 + ux * s, y1 + uy * s, x1 + ux * e, y1 + uy * e, half, c, a);
  }
}

// Deterministic pseudo-random stream, so the picture never changes.
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// A hand-drawn stroke font. Glyphs live on a grid 20 wide, cap height 28,
// baseline at y = 28, descenders to y = 36. Each glyph is a set of polylines
// written as "x y x y ..." runs separated by "|".
// ---------------------------------------------------------------------------

const GLYPHS: Record<string, [number, string]> = {
  A: [20, '0 28 10 0 20 28 | 4 18 16 18'],
  B: [19, '2 0 2 28 | 2 0 13 0 17 4 17 10 13 14 2 14 | 13 14 18 17 18 23 14 28 2 28'],
  C: [19, '18 6 14 1 8 0 3 3 2 8 2 20 3 25 8 28 14 27 18 22'],
  D: [19, '2 0 2 28 | 2 0 10 0 16 5 18 14 16 23 10 28 2 28'],
  E: [18, '18 0 2 0 2 28 18 28 | 2 14 14 14'],
  F: [17, '18 0 2 0 2 28 | 2 14 14 14'],
  G: [19, '18 6 14 1 8 0 3 3 2 8 2 20 3 25 8 28 14 28 18 24 18 16 11 16'],
  H: [20, '2 0 2 28 | 18 0 18 28 | 2 14 18 14'],
  I: [8, '4 0 4 28'],
  J: [17, '16 0 16 20 13 26 8 28 3 26 2 21'],
  K: [19, '2 0 2 28 | 17 0 3 15 | 5 12 18 28'],
  L: [17, '2 0 2 28 17 28'],
  M: [20, '0 28 0 0 10 12 20 0 20 28'],
  N: [20, '2 28 2 0 18 28 18 0'],
  O: [20, '10 0 4 2 2 7 2 21 4 26 10 28 16 26 18 21 18 7 16 2 10 0'],
  P: [18, '2 28 2 0 12 0 17 4 17 10 12 14 2 14'],
  Q: [20, '10 0 4 2 2 7 2 21 4 26 10 28 16 26 18 21 18 7 16 2 10 0 | 12 20 19 29'],
  R: [19, '2 28 2 0 12 0 17 4 17 10 12 14 2 14 | 10 14 18 28'],
  S: [19, '17 5 13 1 8 0 3 3 3 8 6 12 14 16 17 20 17 24 13 27 7 28 3 24'],
  T: [20, '1 0 19 0 | 10 0 10 28'],
  U: [20, '2 0 2 19 5 26 10 28 15 26 18 19 18 0'],
  V: [20, '0 0 10 28 20 0'],
  W: [20, '0 0 4 28 10 8 16 28 20 0'],
  X: [20, '1 0 19 28 | 19 0 1 28'],
  Y: [20, '0 0 10 13 20 0 | 10 13 10 28'],
  Z: [18, '2 0 18 0 2 28 18 28'],
  '0': [19, '10 0 5 2 3 7 3 21 5 26 10 28 15 26 17 21 17 7 15 2 10 0'],
  '1': [19, '7 5 14 0 14 28 | 6 28 20 28'],
  '2': [19, '3 6 6 1 11 0 16 3 17 8 14 14 3 28 18 28'],
  '3': [19, '3 4 7 1 12 1 16 5 15 10 10 13 | 10 13 16 15 17 20 14 26 8 28 3 25'],
  '4': [19, '13 28 13 0 2 20 19 20'],
  '5': [19, '17 0 4 0 4 12 9 10 15 12 17 18 15 25 9 28 3 25'],
  '6': [19, '16 4 11 1 6 3 3 10 2 19 5 26 10 28 15 26 17 21 16 15 11 12 5 14'],
  '7': [19, '2 0 18 0 8 28'],
  '8': [19, '10 13 6 11 4 7 5 2 10 0 15 2 16 7 14 11 10 13 | 10 13 15 16 16 21 14 26 10 28 6 26 4 21 5 16 10 13'],
  '9': [19, '4 24 9 27 14 25 17 18 18 9 15 2 10 0 5 2 4 7 6 12 11 15 17 13'],
  '.': [7, '3 26 4 26'],
  ',': [7, '4 24 3 30'],
  "'": [7, '4 0 3 6'],
  ':': [7, '3 6 4 6 | 3 21 4 21'],
  '-': [13, '2 14 11 14'],
  '!': [7, '3 0 3 19 | 3 25 4 25'],
  '?': [18, '3 5 6 1 11 0 15 3 16 7 13 11 10 13 10 17 | 10 25 10 26'],
  '(': [15, '13 1 7 6 5 14 7 22 13 27'],
  ')': [15, '7 1 13 6 15 14 13 22 7 27'],
  '/': [17, '2 28 15 0'],
  '+': [19, '10 6 10 22 | 2 14 18 14'],
  '%': [19, '2 2 8 2 8 8 2 8 2 2 | 5 0 15 28 | 12 20 18 20 18 26 12 26 12 20'],
  ' ': [10, ''],
};

interface GlyphShape {
  width: number;
  lines: Array<Array<[number, number]>>;
}

const SHAPES: Record<string, GlyphShape> = {};
for (const ch of Object.keys(GLYPHS)) {
  const [width, spec] = GLYPHS[ch];
  const lines: Array<Array<[number, number]>> = [];
  if (spec.trim().length > 0) {
    for (const run of spec.split('|')) {
      const nums = run.trim().split(/\s+/).map(Number);
      const pts: Array<[number, number]> = [];
      for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
      lines.push(pts);
    }
  }
  SHAPES[ch] = { width, lines };
}

function glyphOf(ch: string): GlyphShape {
  return SHAPES[ch] ?? SHAPES['?'];
}

// cap: cap height in pixels. tracking: extra pixels between glyphs.
function textWidth(text: string, cap: number, tracking: number): number {
  const unit = cap / 28;
  let w = 0;
  for (const ch of text) w += glyphOf(ch).width * unit + tracking;
  return text.length > 0 ? w - tracking : 0;
}

function drawText(
  text: string,
  x: number,
  yBase: number,
  cap: number,
  c: RGB,
  bold: boolean,
  tracking: number,
  align: 'left' | 'center' | 'right',
): number {
  const unit = cap / 28;
  const half = (bold ? 2.35 : 1.7) * unit;
  let pen = x;
  if (align === 'center') pen = x - textWidth(text, cap, tracking) / 2;
  if (align === 'right') pen = x - textWidth(text, cap, tracking);
  for (const ch of text) {
    const g = glyphOf(ch);
    for (const line of g.lines) {
      const pts = line.map(
        ([gx, gy]) => [pen + gx * unit, yBase - 28 * unit + gy * unit] as [number, number],
      );
      strokeLine(pts, half, c);
    }
    pen += g.width * unit + tracking;
  }
  return pen - x;
}

function wrapText(text: string, cap: number, maxW: number, tracking: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    const trial = cur === '' ? word : cur + ' ' + word;
    if (textWidth(trial, cap, tracking) <= maxW || cur === '') {
      cur = trial;
    } else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur !== '') lines.push(cur);
  return lines;
}

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

const PAPER: RGB = [246, 241, 231];
const INK: RGB = [24, 22, 18];
const RED: RGB = [172, 44, 34];
const NAVY: RGB = [26, 44, 74];
const GOLD: RGB = [206, 152, 56];
const CREAM: RGB = [250, 246, 236];
const GRAY: RGB = [104, 100, 92];

// ---------------------------------------------------------------------------
// Scene pieces
// ---------------------------------------------------------------------------

function star(cx: number, cy: number, rOut: number, rIn: number, spikes: number, c: RGB, a = 1): void {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? rOut : rIn;
    const t = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
    pts.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]);
  }
  fillPoly(pts, c, a);
}

// The hero scene: Riyadh at dusk, the PIF Tower, a drone and the burst.
function heroScene(x: number, y: number, w: number, h: number): void {
  // Sky: horizontal bands from deep blue to a burnt-orange horizon.
  const top: RGB = [38, 52, 92];
  const mid: RGB = [146, 84, 66];
  const low: RGB = [232, 164, 92];
  const bands = 48;
  for (let i = 0; i < bands; i++) {
    const t = i / (bands - 1);
    const c: RGB = t < 0.55
      ? [top[0] + (mid[0] - top[0]) * (t / 0.55), top[1] + (mid[1] - top[1]) * (t / 0.55), top[2] + (mid[2] - top[2]) * (t / 0.55)]
      : [mid[0] + (low[0] - mid[0]) * ((t - 0.55) / 0.45), mid[1] + (low[1] - mid[1]) * ((t - 0.55) / 0.45), mid[2] + (low[2] - mid[2]) * ((t - 0.55) / 0.45)];
    fillRect(x, y + (h * i) / bands, w, h / bands + 1, c);
  }
  // Low sun, left of the tower.
  fillCircle(x + w * 0.30, y + h * 0.66, 26, [248, 205, 130]);
  fillCircle(x + w * 0.30, y + h * 0.66, 40, [248, 205, 130], 0.25);

  const ground = y + h * 0.94;
  const sil: RGB = [16, 20, 34];
  // Background towers.
  const rand = rng(20261124);
  let bx = x + 6;
  while (bx < x + w - 30) {
    const bw = 26 + rand() * 44;
    const bh = h * (0.22 + rand() * 0.3);
    if (bx + bw < x + w * 0.52 || bx > x + w * 0.72) {
      fillRect(bx, ground - bh, bw, bh, sil, 0.82);
    }
    bx += bw + 4 + rand() * 14;
  }
  // The PIF Tower: a tall tapered shaft, slightly twisted, centre-right.
  const tx = x + w * 0.615;
  const tBase = ground;
  const tTop = y + h * 0.06;
  fillPoly(
    [
      [tx - 34, tBase],
      [tx - 20, tTop + 60],
      [tx - 6, tTop],
      [tx + 16, tTop + 26],
      [tx + 30, tBase],
    ],
    [12, 16, 28],
  );
  // Lit windows on the tower, a steady deterministic pattern.
  const wrand = rng(1124);
  for (let row = 0; row < 26; row++) {
    for (let col = 0; col < 4; col++) {
      if (wrand() < 0.42) {
        const wy = tTop + 26 + row * ((tBase - tTop - 40) / 26);
        const wx = tx - 22 + col * 12 + (row % 2) * 2;
        fillRect(wx, wy, 6, 4, [250, 205, 110], 0.9);
      }
    }
  }
  // Foreground blocks either side.
  fillRect(x, ground - h * 0.16, w * 0.2, h * 0.16, sil);
  fillRect(x + w * 0.82, ground - h * 0.2, w * 0.18, h * 0.2, sil);
  fillRect(x, ground, w, y + h - ground, [10, 12, 20]);

  // The burst, high on the tower's shaft.
  const ex = tx + 44;
  const ey = tTop + 74;
  star(ex, ey, 46, 17, 9, [238, 122, 40]);
  star(ex, ey, 27, 10, 8, [250, 186, 74]);
  fillCircle(ex, ey, 10, [255, 226, 150]);
  // Smoke drifting off the burst.
  fillCircle(ex + 42, ey - 18, 17, [70, 66, 70], 0.55);
  fillCircle(ex + 72, ey - 30, 23, [80, 76, 80], 0.45);
  fillCircle(ex + 108, ey - 40, 29, [92, 88, 90], 0.35);

  // The drone, upper left, with a dashed run toward the tower.
  const dx = x + w * 0.16;
  const dy = y + h * 0.2;
  dashedLine(dx + 30, dy + 16, ex - 52, ey + 6, 2.2, 10, 9, [250, 240, 220], 0.75);
  const drone: RGB = [10, 12, 18];
  strokeSeg(dx - 34, dy - 14, dx + 34, dy + 14, 4, drone);
  strokeSeg(dx - 34, dy + 14, dx + 34, dy - 14, 4, drone);
  fillCircle(dx, dy, 11, drone);
  for (const [ox, oy] of [[-34, -14], [34, 14], [-34, 14], [34, -14]] as Array<[number, number]>) {
    ringCircle(dx + ox, dy + oy, 10, 2.6, drone);
  }
  fillCircle(dx, dy + 12, 3.4, [255, 70, 50]);
}

// A small scene strip for the Gaza panel: rooftops, a plume, a flash.
function gazaStrip(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, [96, 104, 122]);
  fillRect(x, y + h * 0.55, w, h * 0.45, [70, 74, 88]);
  const sil: RGB = [30, 32, 40];
  fillRect(x + w * 0.04, y + h * 0.42, w * 0.2, h * 0.58, sil);
  fillRect(x + w * 0.28, y + h * 0.3, w * 0.16, h * 0.7, sil);
  fillRect(x + w * 0.62, y + h * 0.48, w * 0.22, h * 0.52, sil);
  fillRect(x + w * 0.87, y + h * 0.36, w * 0.11, h * 0.64, sil);
  fillCircle(x + w * 0.52, y + h * 0.3, 15, [200, 200, 205], 0.5);
  fillCircle(x + w * 0.55, y + h * 0.18, 20, [205, 205, 210], 0.42);
  fillCircle(x + w * 0.6, y + h * 0.08, 25, [210, 210, 214], 0.34);
  star(x + w * 0.36, y + h * 0.62, 17, 7, 8, [244, 150, 60]);
  fillCircle(x + w * 0.36, y + h * 0.62, 5, [255, 220, 150]);
}

// Estonia panel strip: a striped border barrier between two flags.
function borderStrip(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, [178, 196, 208]);
  fillRect(x, y + h * 0.72, w, h * 0.28, [96, 110, 96]);
  // Flag poles and flags: Estonia (blue-black-white) left, Russia (white-blue-red) right.
  const pole: RGB = [40, 40, 44];
  strokeSeg(x + w * 0.16, y + h * 0.78, x + w * 0.16, y + h * 0.1, 2.4, pole);
  fillRect(x + w * 0.16, y + h * 0.1, w * 0.17, h * 0.13, [36, 84, 168]);
  fillRect(x + w * 0.16, y + h * 0.23, w * 0.17, h * 0.13, [18, 18, 20]);
  fillRect(x + w * 0.16, y + h * 0.36, w * 0.17, h * 0.13, [238, 238, 238]);
  strokeSeg(x + w * 0.84, y + h * 0.78, x + w * 0.84, y + h * 0.1, 2.4, pole);
  fillRect(x + w * 0.67, y + h * 0.1, w * 0.17, h * 0.13, [238, 238, 238]);
  fillRect(x + w * 0.67, y + h * 0.23, w * 0.17, h * 0.13, [30, 70, 170]);
  fillRect(x + w * 0.67, y + h * 0.36, w * 0.17, h * 0.13, [196, 40, 40]);
  // The barrier arm, red and white, across the middle.
  const by = y + h * 0.62;
  fillRect(x + w * 0.08, by - 7, w * 0.84, 14, [236, 236, 236]);
  for (let i = 0; i < 6; i++) {
    fillPoly(
      [
        [x + w * 0.08 + i * w * 0.14, by + 7],
        [x + w * 0.08 + i * w * 0.14 + w * 0.07, by - 7],
        [x + w * 0.08 + i * w * 0.14 + w * 0.14, by - 7],
        [x + w * 0.08 + i * w * 0.14 + w * 0.07, by + 7],
      ],
      RED,
    );
  }
  fillRect(x + w * 0.06, by - 12, 10, h * 0.34, [52, 52, 56]);
  fillRect(x + w * 0.9, by - 12, 10, h * 0.34, [52, 52, 56]);
}

// NATO panel scene: a satellite over a night field.
function satelliteScene(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, [14, 22, 44]);
  const rand = rng(2411);
  for (let i = 0; i < 60; i++) {
    fillCircle(x + rand() * w, y + rand() * h, 1.4, [235, 240, 250], 0.85);
  }
  // Orbit arc.
  const cx = x + w * 0.5;
  const cy = y + h * 1.15;
  for (let i = 0; i <= 40; i++) {
    const t = Math.PI * (1.12 + (i / 40) * 0.76);
    const ox = cx + Math.cos(t) * w * 0.62;
    const oy = cy + Math.sin(t) * w * 0.62;
    if (i % 2 === 0) fillCircle(ox, oy, 2, [160, 190, 230], 0.8);
  }
  // Satellite body and panel wings, tilted.
  const sx = x + w * 0.5;
  const sy = y + h * 0.44;
  fillPoly([[sx - 52, sy - 12], [sx - 14, sy - 20], [sx - 10, sy + 14], [sx - 48, sy + 20]], [38, 84, 150]);
  fillPoly([[sx + 14, sy - 20], [sx + 52, sy - 12], [sx + 48, sy + 20], [sx + 10, sy + 14]], [38, 84, 150]);
  strokeSeg(sx - 50, sy - 16, sx - 46, sy + 18, 1.4, [120, 170, 225]);
  strokeSeg(sx + 50, sy - 16, sx + 46, sy + 18, 1.4, [120, 170, 225]);
  fillRect(sx - 13, sy - 17, 26, 34, [196, 200, 208]);
  fillRect(sx - 13, sy - 17, 26, 8, [150, 40, 36]);
  fillCircle(sx, sy + 26, 6, [220, 224, 230]);
  strokeSeg(sx, sy + 17, sx, sy + 21, 2, [220, 224, 230]);
}

// ---------------------------------------------------------------------------
// Compose the page
// ---------------------------------------------------------------------------

fillAll(PAPER);

const M = 26; // page margin
const CW = W - M * 2; // content width

function panelFrame(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, CREAM);
  strokeSeg(x, y, x + w, y, 1.6, INK);
  strokeSeg(x, y + h, x + w, y + h, 1.6, INK);
  strokeSeg(x, y, x, y + h, 1.6, INK);
  strokeSeg(x + w, y, x + w, y + h, 1.6, INK);
}

function tag(x: number, y: number, text: string): void {
  const cap = 15;
  const w = textWidth(text, cap, 2.5) + 18;
  fillRect(x, y, w, 26, RED);
  drawText(text, x + 9, y + 20, cap, CREAM, true, 2.5, 'left');
}

// Masthead.
strokeSeg(M, 20, W - M, 20, 2.4, INK);
strokeSeg(M, 27, W - M, 27, 1, INK);
drawText('THE DAILY MERIDIAN', W / 2, 84, 45, INK, true, 3, 'center');
strokeSeg(M, 98, W - M, 98, 1, INK);

// The date, in a black band: the day named in full.
fillRect(M, 106, CW, 44, INK);
drawText('TUESDAY 24 NOVEMBER 2026', W / 2, 138, 25, CREAM, true, 6, 'center');
fillRect(M + 14, 121, 14, 14, RED);
fillRect(W - M - 28, 121, 14, 14, RED);

// Hero panel.
const heroY = 162;
const heroH = 416;
panelFrame(M, heroY, CW, heroH);
heroScene(M + 3, heroY + 3, CW - 6, 186);
drawText('RIYADH, SAUDI ARABIA - SECOND ATTACK IN FIVE DAYS', M + 22, heroY + 224, 16.5, RED, true, 2, 'left');
drawText('HOUTHI DRONES STRIKE', M + 22, heroY + 272, 41, INK, true, 2, 'left');
drawText("RIYADH'S TALLEST TOWER", M + 22, heroY + 324, 41, INK, true, 2, 'left');
const heroSub = wrapText(
  'A DRONE HIT THE 385-METRE PIF TOWER, THE CAPITAL\'S TALLEST BUILDING AND HOME OF THE SOVEREIGN WEALTH FUND. 11 PEOPLE WERE WOUNDED, AMONG THEM WORKERS REPAIRING DAMAGE FROM THE FIRST STRIKE ON 19 NOVEMBER. THE COALITION VOWED A DECISIVE RESPONSE.',
  15,
  CW - 44,
  1.1,
);
heroSub.forEach((line, i) => {
  drawText(line, M + 22, heroY + 356 + i * 20, 15, [58, 54, 48], false, 1.1, 'left');
});

// Second row: Gaza and Estonia.
const row2Y = heroY + heroH + 12;
const row2H = 196;
const halfW = (CW - 12) / 2;

panelFrame(M, row2Y, halfW, row2H);
tag(M + 14, row2Y + 12, 'GAZA');
gazaStrip(M + 14, row2Y + 44, halfW - 28, 48);
const gazaHead = wrapText('ISRAELI STRIKE KILLS HAMAS SECURITY CHIEF', 19, halfW - 28, 1);
gazaHead.forEach((line, i) => {
  drawText(line, M + 14, row2Y + 120 + i * 25, 19, INK, true, 1, 'left');
});
const gazaBody = wrapText(
  'AN AIRSTRIKE KILLED NAEEM ABU NAHEL, HEAD OF HAMAS INTERNAL SECURITY, AND SIX OTHERS.',
  13.5,
  halfW - 28,
  1,
);
gazaBody.forEach((line, i) => {
  drawText(line, M + 14, row2Y + 120 + gazaHead.length * 25 + 3 + i * 18, 13.5, [58, 54, 48], false, 1, 'left');
});

const exX = M + halfW + 12;
panelFrame(exX, row2Y, halfW, row2H);
tag(exX + 14, row2Y + 12, 'ESTONIA - RUSSIA');
borderStrip(exX + 14, row2Y + 44, halfW - 28, 48);
const estHead = wrapText("MOSCOW WARNS ESTONIA: BORDER CLOSURE MEANS 'OPEN WAR'", 19, halfW - 28, 1);
estHead.forEach((line, i) => {
  drawText(line, exX + 14, row2Y + 122 + i * 25, 19, INK, true, 1, 'left');
});
const estBody = wrapText(
  'RUSSIA SAID SHUTTING THE CROSSINGS ON 1 DECEMBER WOULD BE TREATED AS AN ACT OF OPEN WAR.',
  13.5,
  halfW - 28,
  1,
);
estBody.forEach((line, i) => {
  drawText(line, exX + 14, row2Y + 122 + estHead.length * 25 + 3 + i * 18, 13.5, [58, 54, 48], false, 1, 'left');
});

// Third row: NATO in space, and the leaked toll as a big number.
const row3Y = row2Y + row2H + 12;
const row3H = 150;

panelFrame(M, row3Y, halfW, row3H);
tag(M + 14, row3Y + 12, 'NATO - SPACE');
satelliteScene(M + 14, row3Y + 46, 104, row3H - 58);
const natoHead = wrapText('NATO VOWS TO ANSWER RUSSIA\'S NUCLEAR SATELLITE THREAT', 18, halfW - 146, 0.8);
natoHead.forEach((line, i) => {
  drawText(line, M + 132, row3Y + 60 + i * 22, 18, INK, true, 0.8, 'left');
});
drawText('ALLIANCE CHIEF: NATO WILL', M + 132, row3Y + 126, 12, [58, 54, 48], false, 0.8, 'left');
drawText('COUNTER THE THREAT.', M + 132, row3Y + 143, 12, [58, 54, 48], false, 0.8, 'left');

const statX = M + halfW + 12;
fillRect(statX, row3Y, halfW, row3H, NAVY);
drawText('THE TOLL OF THE WAR IN UKRAINE', statX + 20, row3Y + 34, 15, GOLD, true, 2, 'left');
drawText('700,000', statX + 20, row3Y + 102, 58, CREAM, true, 2, 'left');
drawText('RUSSIAN MILITARY DEATHS MAY HAVE BEEN', statX + 20, row3Y + 124, 13.5, CREAM, false, 1, 'left');
drawText('REACHED, LEAKED DATA SUGGESTS', statX + 20, row3Y + 142, 13.5, CREAM, false, 1, 'left');

// Recap ticker along the foot.
const tickY = row3Y + row3H + 12;
fillRect(M, tickY, CW, 40, INK);
drawText(
  'SECOND STRIKE ON RIYADH IN FIVE DAYS - 11 WOUNDED - GAZA CEASEFIRE HOLDS - YEMEN WAR REIGNITED',
  W / 2,
  tickY + 27,
  14,
  CREAM,
  true,
  1,
  'center',
);

// ---------------------------------------------------------------------------
// PNG encoding (truecolour, filter 0 rows, zlib from the standard library)
// ---------------------------------------------------------------------------

const CRC_TABLE: number[] = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE.push(c >>> 0);
}

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(): Buffer {
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    const rowStart = y * (1 + W * 3);
    raw[rowStart] = 0;
    for (let x = 0; x < W; x++) {
      const src = (y * W + x) * 3;
      const dst = rowStart + 1 + x * 3;
      raw[dst] = Math.round(px[src]);
      raw[dst + 1] = Math.round(px[src + 1]);
      raw[dst + 2] = Math.round(px[src + 2]);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour RGB
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return png;
}

const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'entry.png'), encodePng());
