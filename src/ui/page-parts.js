import { composePage } from '../engine/page-recipe.js';


const DIR = 'assets/art/pageparts';
export const READ_PARTS_MS = 8000;

export const partUrl = (id) => `${DIR}/${id}.svg`;

export async function readParts(fetchFn = (url) => globalThis.fetch(url)) {
  const read = async (url, kind) => {
    const response = await fetchFn(url);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return response[kind]();
  };
  const all = async () => {
    const index = await read(`${DIR}/index.json`, 'json');
    const svgs = await Promise.all(index.map((part) => read(partUrl(part.id), 'text')));
    return new Map(index.map((part, i) => [part.id, { ...part, svg: svgs[i] }]));
  };
  let timer;
  const late = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('The page parts took too long to read')), READ_PARTS_MS); });
  try {
    return await Promise.race([all(), (late)]);
  } finally {
    clearTimeout(timer);
  }
}

export function cachedParts(read = readParts) {
  let parts = null;
  return () => {
    parts ??= read().catch((err) => {
      parts = null;
      throw err;
    });
    return parts;
  };
}

export const pageUrl = (recipe, parts) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(composePage(recipe, parts))}`;
