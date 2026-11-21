export const SLIP_KINDS = Object.freeze(['bd', 'cs', 'ending', 'blend', 'lookalike', 'other']);
export const SLIPS_KEPT = 200;
const TEXT_MAX = 64;


const isText = (v) => typeof v === 'string' && v.length > 0 && v.length <= TEXT_MAX;

export function isSlip(v) {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  const s = (v);
  return typeof s.day === 'number' && Number.isFinite(s.day) && SLIP_KINDS.includes( (s.kind)) && isText(s.item)
    && (s.target === undefined || isText(s.target)) && (s.chose === undefined || isText(s.chose));
}

export function normalizeSlips(list) {
  return (Array.isArray(list) ? list.filter(isSlip) : []).slice(-SLIPS_KEPT).map(({ day, kind, item, target, chose }) => ({
    day, kind, item, ...(target !== undefined ? { target } : {}), ...(chose !== undefined ? { chose } : {}),
  }));
}

export function withSlip(profile, slip) {
  const [kept] = normalizeSlips([slip]);
  if (!kept) return profile;
  return { ...profile, slips: [...(Array.isArray(profile.slips) ? profile.slips : []), kept].slice(-SLIPS_KEPT) };
}
