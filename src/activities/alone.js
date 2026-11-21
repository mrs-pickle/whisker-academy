import { run as runCards } from './cards.js';


export function run(el, ctx, round, hooks) {
  return runCards(el, ctx, round, hooks, { start: 'v.alone.start', name: 'alone' });
}
