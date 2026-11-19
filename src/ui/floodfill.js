export const LINE_THRESHOLD = 100;
export const EDGE_THRESHOLD = 200;
const EDGE_REACH = 2;
export const GAP = 2;
export const FRINGE = 2;
export const SHUT = 2;
export const REPLAY_REACH = 3;
const HEX = /^#[0-9a-f]{6}$/i;
export const ERASE_COLOR = '#ffffff';
const CLEAR = Object.freeze([0, 0, 0, 0]);


export function lineMask(rgba, w, h, threshold = LINE_THRESHOLD) {
  const n = w * h;
  if (!Number.isInteger(n) || n < 0 || rgba.length !== n * 4) throw new RangeError(`lineMask: ${rgba.length} bytes is not a ${w}×${h} picture`);
  const mask = new Uint8Array(n);
  const below = threshold * 1000 * 255;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const a = rgba[p + 3];
    const lum = (299 * rgba[p] + 587 * rgba[p + 1] + 114 * rgba[p + 2]) * a + 1000 * 255 * (255 - a);
    if (lum < below) mask[i] = 1;
  }
  return mask;
}

function grow(src, w, h, r) {
  const rows = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let last = -Infinity;
    for (let x = 0; x < w + r; x++) {
      if (x < w && src[row + x] !== 0) last = x;
      if (x - r >= 0 && x - last <= 2 * r) rows[row + x - r] = 1;
    }
  }
  const out = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) {
    let last = -Infinity;
    for (let y = 0; y < h + r; y++) {
      if (y < h && rows[y * w + x] !== 0) last = y;
      if (y - r >= 0 && y - last <= 2 * r) out[(y - r) * w + x] = 1;
    }
  }
  return out;
}

export function paperOf(rgba, n) {
  if (n <= 0) return 255;
  const counts = new Uint32Array(256);
  for (let p = 0; p < n * 4; p += 4) {
    const a = rgba[p + 3];
    counts[Math.round(((299 * rgba[p] + 587 * rgba[p + 1] + 114 * rgba[p + 2]) * a + 1000 * 255 * (255 - a)) / (1000 * 255))]++;
  }
  let seen = 0;
  for (let lum = 0; lum < 256; lum++) {
    seen += counts[lum];
    if (seen * 2 >= n) return lum;
  }
  return 255;
}

export const faintBelow = (paper) => Math.min(EDGE_THRESHOLD, paper - (255 - EDGE_THRESHOLD));

export function edgeMask(rgba, w, h) {
  const dark = lineMask(rgba, w, h);
  const below = faintBelow(paperOf(rgba, w * h));
  if (below <= LINE_THRESHOLD) return dark;
  const faint = lineMask(rgba, w, h, below);
  const near = grow(dark, w, h, EDGE_REACH);
  for (let i = 0; i < dark.length; i++) dark[i] |= faint[i] & near[i];
  return dark;
}

const ACROSS = Object.freeze([[1, 0], [0, 1], [1, 1], [1, -1]]);

export function closeGaps(mask, w, h) {
  const out = mask.slice();
  const bound = (x, y) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] !== 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x] !== 0) continue;
      for (const [dx, dy] of ACROSS) {
        let shut = false;
        for (let a = 1; a <= GAP && !shut; a++) {
          if (!bound(x - a * dx, y - a * dy)) continue;
          for (let b = 1; a + b <= GAP + 1; b++) if (bound(x + b * dx, y + b * dy)) { shut = true; break; }
        }
        if (shut) { out[y * w + x] = SHUT; break; }
      }
    }
  }
  return out;
}

export const speckSize = (w, h) => Math.max(16, Math.round((w * h) / 40000));

export function fillSpecks(mask, w, h, least) {
  const n = w * h;
  const done = new Uint8Array(n);
  const run = [];
  for (let s = 0; s < n; s++) {
    if (mask[s] !== 0 || done[s] !== 0) continue;
    run.length = 0;
    done[s] = 1;
    run.push(s);
    for (let k = 0; k < run.length; k++) {
      const i = run[k];
      const x = i % w;
      if (x > 0 && mask[i - 1] === 0 && done[i - 1] === 0) { done[i - 1] = 1; run.push(i - 1); }
      if (x < w - 1 && mask[i + 1] === 0 && done[i + 1] === 0) { done[i + 1] = 1; run.push(i + 1); }
      if (i >= w && mask[i - w] === 0 && done[i - w] === 0) { done[i - w] = 1; run.push(i - w); }
      if (i + w < n && mask[i + w] === 0 && done[i + w] === 0) { done[i + w] = 1; run.push(i + w); }
    }
    if (run.length < least) for (const i of run) mask[i] = SHUT;
  }
  return mask;
}

export const fillMask = (rgba, w, h) => fillSpecks(closeGaps(edgeMask(rgba, w, h), w, h), w, h, speckSize(w, h));

export function nearestOpen(mask, w, h, x, y, reach) {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= w || y >= h) return null;
  if (mask[y * w + x] === 0) return { x, y };
  const r = Math.max(0, Math.floor(reach));
  let best = null;
  let bestD = r * r + 1;
  for (let dy = -r; dy <= r; dy++) {
    const Y = y + dy;
    if (Y < 0 || Y >= h) continue;
    for (let dx = -r; dx <= r; dx++) {
      const X = x + dx;
      const d = dx * dx + dy * dy;
      if (X < 0 || X >= w || d >= bestD || mask[Y * w + X] !== 0) continue;
      best = { x: X, y: Y };
      bestD = d;
    }
  }
  return best;
}

export function rgbaOf(hex) {
  if (typeof hex !== 'string' || !HEX.test(hex)) return null;
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

export function paintOf(hex) {
  if (typeof hex === 'string' && hex.toLowerCase() === ERASE_COLOR) return CLEAR;
  return rgbaOf(hex);
}

function pushRuns(stack, mask, seen, from, to) {
  let inRun = false;
  for (let j = from; j <= to; j++) {
    const open = mask[j] === 0 && seen[j] === 0;
    if (open && !inRun) stack.push(j);
    inRun = open;
  }
}

function paint(layer, i, rgba) {
  const p = i * 4;
  if (layer[p] === rgba[0] && layer[p + 1] === rgba[1] && layer[p + 2] === rgba[2] && layer[p + 3] === rgba[3]) return 0;
  layer[p] = rgba[0]; layer[p + 1] = rgba[1]; layer[p + 2] = rgba[2]; layer[p + 3] = rgba[3];
  return 1;
}

function fill(layer, mask, w, h, x, y, rgba, done, mark, taken) {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= w || y >= h) return 0;
  const startAt = y * w + x;
  if (mask[startAt] !== 0 || done[startAt] !== 0) return 0;
  const last = w * h - w;
  let changed = 0;
  const color = (j) => {
    if (taken === null) { changed += paint(layer, j, rgba); return; }
    if (taken[j] !== 0) return;
    taken[j] = 1;
    changed += paint(layer, j, rgba);
  };
  const runs = [];
  const stack = [startAt];
  while (stack.length > 0) {
    const i = (stack.pop());
    if (done[i] !== 0) continue;
    const row = i - (i % w);
    let left = i;
    let right = i;
    while (left > row && mask[left - 1] === 0 && done[left - 1] === 0) left--;
    while (right < row + w - 1 && mask[right + 1] === 0 && done[right + 1] === 0) right++;
    for (let j = left; j <= right; j++) {
      done[j] = 1;
      color(j);
    }
    runs.push(left, right);
    if (row > 0) pushRuns(stack, mask, done, left - w, right - w);
    if (row < last) pushRuns(stack, mask, done, left + w, right + w);
  }
  const reached = [];
  let ring = [];
  const take = (j) => {
    if (mask[j] === 0 || mark[j] !== 0) return;
    mark[j] = 1;
    reached.push(j);
    color(j);
    ring.push(j);
  };
  for (let k = 0; k < runs.length; k += 2) {
    const left = runs[k], right = runs[k + 1];
    const row = left - (left % w);
    const from = Math.max(row, left - 1), to = Math.min(row + w - 1, right + 1);
    take(from); take(to);
    if (row > 0) for (let j = from - w; j <= to - w; j++) take(j);
    if (row < last) for (let j = from + w; j <= to + w; j++) take(j);
  }
  const shut = ring.filter((i) => mask[i] === SHUT);
  while (shut.length > 0) {
    const i = (shut.pop());
    const col = i % w;
    for (const j of [col > 0 ? i - 1 : -1, col < w - 1 ? i + 1 : -1, i - w, i + w]) {
      if (j < 0 || j >= w * h || mask[j] !== SHUT || mark[j] !== 0) continue;
      mark[j] = 1;
      reached.push(j);
      color(j);
      shut.push(j);
      ring.push(j);
    }
  }
  for (let depth = 1; depth < FRINGE; depth++) {
    const prev = ring;
    ring = [];
    for (const i of prev) {
      const col = i % w;
      for (let dy = -w; dy <= w; dy += w) {
        const j = i + dy;
        if (j < 0 || j >= w * h) continue;
        if (col > 0) take(j - 1);
        if (dy !== 0) take(j);
        if (col < w - 1) take(j + 1);
      }
    }
  }
  for (const j of reached) mark[j] = 0;
  return changed;
}

export function fillRegion(layer, mask, w, h, x, y, rgba) {
  return fill(layer, mask, w, h, x, y, rgba, new Uint8Array(w * h), new Uint8Array(w * h), null);
}

export function fillAt(layer, mask, w, h, x, y, rgba, reach) {
  const at = nearestOpen(mask, w, h, x, y, reach);
  return at ? { ...at, changed: fillRegion(layer, mask, w, h, at.x, at.y, rgba) } : null;
}

export function replayFills(w, h, mask, ops, older) {
  const n = w * h;
  const layer = new Uint8ClampedArray(n * 4);
  const taken = new Uint8Array(n);
  const mark = new Uint8Array(n);
  const list = Array.isArray(ops) ? ops : [];
  const split = older ? Math.max(0, Math.min(list.length, Math.floor(older.count))) : 0;
  const replay = (on, from, to) => {
    const done = new Uint8Array(n);
    for (let k = to - 1; k >= from; k--) {
      const op = list[k];
      const rgba = paintOf(op?.color);
      const at = rgba ? nearestOpen(on, w, h, op.x, op.y, REPLAY_REACH) : null;
      if (rgba && at) fill(layer, on, w, h, at.x, at.y, rgba, done, mark, taken);
    }
  };
  replay(mask, split, list.length);
  if (older && split > 0) replay(older.mask, 0, split);
  return layer;
}

export function regionSeeds(regionOf, mask, w, h) {
  const n = w * h;
  const done = new Uint8Array(n);
  const seeds = [];
  const stack = [];
  const area = [];
  for (let s = 0; s < n; s++) {
    if (mask[s] !== 0 || done[s] !== 0) continue;
    area.length = 0;
    done[s] = 1;
    stack.push(s);
    const votes = new Map();
    while (stack.length > 0) {
      const i = (stack.pop());
      area.push(i);
      const r = regionOf[i];
      if (r > 0) votes.set(r, (votes.get(r) ?? 0) + 1);
      const x = i % w;
      if (x > 0 && mask[i - 1] === 0 && done[i - 1] === 0) { done[i - 1] = 1; stack.push(i - 1); }
      if (x < w - 1 && mask[i + 1] === 0 && done[i + 1] === 0) { done[i + 1] = 1; stack.push(i + 1); }
      if (i >= w && mask[i - w] === 0 && done[i - w] === 0) { done[i - w] = 1; stack.push(i - w); }
      if (i + w < n && mask[i + w] === 0 && done[i + w] === 0) { done[i + w] = 1; stack.push(i + w); }
    }
    let region = 0;
    let most = 0;
    for (const [r, count] of votes) if (count > most || (count === most && r < region)) { region = r; most = count; }
    if (region === 0) continue;
    let first = n;
    for (const i of area) if (regionOf[i] === region && i < first) first = i;
    seeds.push({ x: first % w, y: Math.floor(first / w), region });
  }
  return seeds;
}

export function cleanOps(value, w, h) {
  if (!Array.isArray(value)) return [];
  const ops = [];
  for (const op of value) {
    if (op === null || typeof op !== 'object') continue;
    const { x, y, color } = op;
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= w || y >= h) continue;
    if (typeof color === 'string' && HEX.test(color)) ops.push({ x, y, color: color.toLowerCase() });
  }
  return ops;
}
