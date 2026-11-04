export const LINE_THRESHOLD = 100;
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

function fill(layer, mask, w, h, x, y, rgba, seen) {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= w || y >= h) return 0;
  const startAt = y * w + x;
  if (mask[startAt] !== 0 || seen[startAt] !== 0) return 0;
  const [r, g, b, a] = rgba;
  const last = w * h - w;
  let changed = 0;
  const stack = [startAt];
  while (stack.length > 0) {
    const i = (stack.pop());
    if (seen[i] !== 0) continue;
    const row = i - (i % w);
    let left = i;
    let right = i;
    while (left > row && mask[left - 1] === 0 && seen[left - 1] === 0) left--;
    while (right < row + w - 1 && mask[right + 1] === 0 && seen[right + 1] === 0) right++;
    for (let j = left, p = left * 4; j <= right; j++, p += 4) {
      seen[j] = 1;
      if (layer[p] === r && layer[p + 1] === g && layer[p + 2] === b && layer[p + 3] === a) continue;
      layer[p] = r; layer[p + 1] = g; layer[p + 2] = b; layer[p + 3] = a;
      changed++;
    }
    if (row > 0) pushRuns(stack, mask, seen, left - w, right - w);
    if (row < last) pushRuns(stack, mask, seen, left + w, right + w);
  }
  return changed;
}

export function fillRegion(layer, mask, w, h, x, y, rgba) {
  return fill(layer, mask, w, h, x, y, rgba, new Uint8Array(w * h));
}

export function replayFills(w, h, mask, ops) {
  const layer = new Uint8ClampedArray(w * h * 4);
  const seen = new Uint8Array(w * h);
  const list = Array.isArray(ops) ? ops : [];
  for (let k = list.length - 1; k >= 0; k--) {
    const op = list[k];
    const rgba = paintOf(op?.color);
    if (rgba) fill(layer, mask, w, h, op.x, op.y, rgba, seen);
  }
  return layer;
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
