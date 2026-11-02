import { h } from '../core/dom.js';
import { buildSession } from '../engine/session-builder.js';
import { latestAccuracy } from '../profile/profile.js';
import { createMonitor } from '../engine/frustration.js';
import { bigButton } from '../ui/components.js';






export const ACTIVITY_IDS = Object.freeze(['warmup', 'cards', 'spell', 'chain', 'charm', 'story']);


function forcedItem(a, { word, scene, mode }, content, profile) {
  const item = (id, defaultMode) => ({ id, mode: mode || defaultMode, isNew: false, isReview: false });
  if (a === 'story') return scene ? item(`s:${scene}`, 'read') : null;
  if (!word) return null;
  switch (a) {
    case 'spell': return item(`w:${word}`, 'spell');
    case 'charm': return item(`iw:${word}`, 'read');
    case 'chain': {
      const chains = content.chains ?? [];
      const chain = chains.find(( c) => c.id === word) ?? chains.find(( c) => c.steps.includes(word));
      return chain ? item(`ch:${chain.id}`, 'spell') : null;
    }
    case 'cards': {
      if (word.includes('/')) {
        const [x, y] = word.split('/');
        const kind = ['ie', 'ssh'].find(k => (content.pairs?.[k] ?? []).some(( p) => p[0] === x && p[1] === y)) ?? 'ie';
        return item(`pr:${kind}:${word}`, 'listen');
      }
      if (profile.deck.some(( c) => c.g === word)) return item(`g:${word}`, 'see');
      return item(`w:${word}`, 'read');
    }
    case 'warmup': {
      const list = content.warmup ?? [];
      const pa = list.find(( p) => p.id === word) ?? list.find(( p) => p.word === word);
      return pa ? item(`pa:${pa.id}`, 'pa') : null;
    }
    default: return null;
  }
}

export function debugRound(plan, a, params, { content, profile }) {
  const found = plan.rounds.find(r => r.activity === a);
  let items = found ? [...found.items] : [];
  const forced = forcedItem(a, params, content, profile);
  if (forced) items = a === 'story' ? [forced] : [forced, ...items.filter(i => !(i.id === forced.id && i.mode === forced.mode))];
  return { activity: (a), items };
}

export function mount(el, ctx, params) {
  let live = true;
  const a = params.a ?? '';
  const panel = (...children) => el.replaceChildren(h('div', { class: 'activity-debug' }, ...children));

  if (!ACTIVITY_IDS.includes(a)) {
    panel(h('h2', {}, 'Activity harness'), h('p', {}, `Add &a= with one of: ${ACTIVITY_IDS.join(', ')}.`));
    return () => { live = false; };
  }

  const start = async () => {
    const activity = await import(`../activities/${a}.js`);
    const plan = buildSession({
      content: ctx.content,
      states: new Map(ctx.states),
      settings: ctx.settings,
      profile: ctx.profile,
      day: ctx.day,
      rng: ctx.rng,
      lastAccuracy: latestAccuracy(ctx.profile),
    });
    const round = debugRound(plan, a, params, ctx);
    const monitor = createMonitor();
    const results = [];
    const hooks = {
      record(id, mode, { correct, helped, ms }, { monitor: watched = true, scored = true } = {}) {
        results.push({ id, mode, correct, helped, ms, scored, watched });
        if (watched && scored) monitor.record({ correct, ms });
        console.info(`[activity] ${id}#${mode}`, { correct, helped, ms, watched, scored, monitor: monitor.signal() });
      },
      undo() {
        const at = results.findLastIndex(r => r.scored);
        if (at < 0) return null;
        const [undone] = results.splice(at, 1);
        if (undone.watched) monitor.undo();
        console.info(`[activity] undo ${undone.id}#${undone.mode}`);
        return { id: undone.id, mode: undone.mode };
      },
      pass(id, mode) {
        console.info(`[activity] pass ${id}#${mode}`);
      },
      monitor,
      copilot: params.copilot === '0' ? false : params.copilot === '1' ? true : ctx.settings.copilot,
      protege: params.protege === '1',
    };
    console.info(`[activity] ${a} round`, round.items.map(i => `${i.id}#${i.mode}${i.isNew ? ' (new)' : ''}`));
    const host = h('div', { class: 'activity-host' });
    el.replaceChildren(host);
    await activity.run(host, ctx, round, hooks);
    if (!live) return;
    panel(
      h('h2', {}, `The ${a} round is over (${results.length} answers)`),
      h('ol', {}, results.map(r => h('li', {},
        `${r.id} #${r.mode}: ${r.correct ? 'right first time' : 'missed'}${r.helped ? ', helped' : ''}, ${r.ms} ms${r.scored ? '' : ' (self-check, not scored)'}`))),
      h('p', {}, `Frustration monitor: ${monitor.signal()}`),
      bigButton({ label: 'Play it again', onClick: () => { begin(); } }),
    );
  };
  const begin = () => start().catch((err) => {
    console.error(`The ${a} activity could not run`, err);
    if (live) panel(h('h2', {}, 'Activity harness'), h('p', {}, `The ${a} activity could not run here yet; the console says why.`));
  });
  begin();
  return () => { live = false; };
}
