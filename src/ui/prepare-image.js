export const MAX_SIDE = 2000;
export const MAX_PIXELS = 50_000_000;
const PEEK_BYTES = 256 * 1024;
const JPEG_QUALITY = 0.92;
const TOO_BIG = "That picture is too big to open here (more than 50 megapixels), so it wasn't added. Save a smaller copy and add that.";



export function fitSize(width, height, max = MAX_SIDE) {
  const scale = Math.min(1, max / Math.max(width, height));
  return { w: Math.max(1, Math.round(width * scale)), h: Math.max(1, Math.round(height * scale)) };
}

export function headerSize(b) {
  const at = ( i, text) => [...text].every((c, k) => b[i + k] === c.charCodeAt(0));
  const be16 = ( i) => (b[i] << 8) | b[i + 1];
  const le16 = ( i) => b[i] | (b[i + 1] << 8);
  const le24 = ( i) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
  const size = ( w, h) => (w > 0 && h > 0 ? { w, h } : null);
  if (b.length >= 24 && b[0] === 0x89 && at(1, 'PNG') && at(12, 'IHDR')) {
    const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
    return size(view.getUint32(16), view.getUint32(20));
  }
  if (b.length >= 25 && at(0, 'RIFF') && at(8, 'WEBP')) {
    if (b.length < 30 && !at(12, 'VP8L')) return null;
    if (at(12, 'VP8X')) return size(le24(24) + 1, le24(27) + 1);
    if (at(12, 'VP8L') && b[20] === 0x2f) {
      const bits = (b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)) >>> 0;
      return size((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
    }
    if (at(12, 'VP8 ') && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) return size(le16(26) & 0x3fff, le16(28) & 0x3fff);
    return null;
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 4 <= b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1];
      if (marker === 0xff) { i++; continue; }
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) { i += 2; continue; }
      const length = be16(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return i + 9 <= b.length ? size(be16(i + 7), be16(i + 5)) : null;
      }
      if (marker === 0xd9 || marker === 0xda || length < 2) return null;
      i += 2 + length;
    }
  }
  return null;
}

async function peekSize(file) {
  try {
    return headerSize(new Uint8Array(await file.slice(0, PEEK_BYTES).arrayBuffer()));
  } catch {
    return null;
  }
}

async function decodeImage(file) {
  if (typeof globalThis.createImageBitmap !== 'function') throw new Error('This browser cannot open pictures here');
  return globalThis.createImageBitmap(file, { imageOrientation: 'from-image' });
}

function encodeImage(picture, { w, h }, type) {
  const canvas = (globalThis.document.createElement('canvas'));
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  if (!g) return Promise.reject(new Error('No canvas to draw the picture on'));
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage( ( (picture)), 0, 0, w, h);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The picture could not be saved again'))), type, JPEG_QUALITY);
  });
}

export async function prepare(file, { decode = decodeImage, encode = encodeImage } = {}) {
  const known = await peekSize(file);
  if (known && known.w * known.h > MAX_PIXELS) {
    throw Object.assign(new Error(`The picture is ${known.w}x${known.h}: too big to open`), { friendly: TOO_BIG });
  }
  const picture = await decode(file);
  try {
    const { width, height } = picture;
    if (!(width > 0 && height > 0)) throw new Error('The picture has no size');
    const size = fitSize(width, height);
    const blob = await encode(picture, size, file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png');
    return { blob, w: size.w, h: size.h };
  } finally {
    picture.close?.();
  }
}
