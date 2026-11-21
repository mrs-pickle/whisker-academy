import { bdHint } from '../ui/bd-hint.js';
import { letterSlip, wordSlip } from '../engine/slips.js';



export const BD_HINTS_PER_ROUND = 1;

export function kindOf(seen, segsOf) {
  if (seen.words) return wordSlip(seen.target, seen.chose, segsOf);
  const kind = letterSlip(seen.target, seen.chose, { box: seen.box, segs: seen.segs });
  return kind === 'other' && seen.last ? 'ending' : kind;
}

export function wireSlips(view, hooks) {
  const words = new Map([...(view.ctx?.content?.instant ?? []), ...(view.ctx?.content?.words ?? [])].map((w) => [w.w, w.segs]));
  const segsOf = (w) => words.get(w);
  let hints = 0;
  view.noteSlip = async (seen) => {
    if (!seen || typeof seen.target !== 'string' || typeof seen.chose !== 'string' || seen.target === seen.chose) return;
    const kind = kindOf(seen, segsOf);
    try {
      hooks.slip?.({ kind, item: seen.item, target: seen.target, chose: seen.chose });
    } catch (err) {
      console.error('A slip could not be kept', err);
    }
    if (kind === 'bd' && hints < BD_HINTS_PER_ROUND && view.live()) {
      hints++;
      await bdHint(view);
    }
  };
}
