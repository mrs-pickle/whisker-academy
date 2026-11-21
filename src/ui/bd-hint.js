import { h } from '../core/dom.js';

export const BD_HINT_MS = 2600;
const LIGHT_MS = 500;
const SVG_NS = 'http://www.w3.org/2000/svg';

export function placeSettingSvg() {
  return `<svg xmlns="${SVG_NS}" viewBox="0 0 640 360" class="bd-svg" role="img" aria-label="Butter on the left, like b. A drink on the right, like d.">`
    + '<rect x="20" y="300" width="600" height="18" rx="9" class="bd-table"/>'
    + '<ellipse cx="320" cy="292" rx="92" ry="20" class="bd-plate"/><ellipse cx="320" cy="290" rx="60" ry="11" class="bd-plate-in"/>'
    + '<g class="bd-butter"><rect x="96" y="150" width="16" height="146" rx="8" class="bd-knife"/>'
    + '<path d="M112 296 L112 222 A37 37 0 0 1 112 296 Z" class="bd-pat"/>'
    + '<rect x="70" y="292" width="110" height="10" rx="5" class="bd-dish"/>'
    + '<text x="128" y="118" class="bd-letter">b</text></g>'
    + '<g class="bd-drink"><path d="M528 296 L528 222 A37 37 0 0 0 528 296 Z" class="bd-glass"/>'
    + '<rect x="528" y="150" width="16" height="146" rx="8" class="bd-straw"/>'
    + '<text x="512" y="118" class="bd-letter">d</text></g>'
    + '</svg>';
}

export async function bdHint(view) {
  if (!view.live()) return;
  const parsed = new globalThis.DOMParser().parseFromString(placeSettingSvg(), 'image/svg+xml');
  const svg = document.importNode(parsed.documentElement, true);
  let close = () => {};
  const closed = new Promise((resolve) => { close = () => resolve(undefined); });
  const panel = h('button', { type: 'button', class: 'bd-hint', 'aria-label': 'Butter and drink: b and d. Tap to go on.', onClick: () => close() }, svg);
  view.root.append(panel);
  const wait = (ms) => Promise.race([new Promise((resolve) => setTimeout(resolve, ms)), closed]);
  try {
    for (const [part, clip] of ([['butter', 'p.b'], ['drink', 'p.d']])) {
      if (!view.live()) return;
      panel.setAttribute('data-lit', part);
      await wait(LIGHT_MS);
      await Promise.race([view.play([clip]), closed]);
    }
    panel.setAttribute('data-lit', 'both');
    await wait(BD_HINT_MS);
  } finally {
    panel.remove();
  }
}
