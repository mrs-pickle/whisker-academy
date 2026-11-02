import { shownWord } from '../../activities/charm.js';
import { h } from '../../core/dom.js';
import { cornerFrame } from './gate.js';
import { shortDate } from './progress.js';


const HOW_WORDS = Object.freeze({ right: 'right', helped: 'with help', missed: 'not yet', self: 'she checked herself', passed: 'passed again' });

const scenesOf = (content) => (content?.story ?? []).flatMap(( ch) => [...ch.scenes, ...ch.side]);

export function passLabel({ id, mode }, content) {
  const at = id.indexOf(':');
  const kind = id.slice(0, at);
  const name = id.slice(at + 1);
  switch (kind) {
    case 'pa': {
      const item = content?.warmup?.find(( pa) => pa.id === name);
      return item ? `Warm-up: ${item.word}` : id;
    }
    case 'g': return `Sound card: ${name} (${mode === 'hear' ? 'hearing' : 'saying'} its sound)`;
    case 'pr': return `Listening pair: ${name.slice(name.indexOf(':') + 1).replace('/', ' / ')}`;
    case 'w': return `${mode === 'spell' ? 'Spelling' : 'Reading'}: ${name}`;
    case 'n': return `Made-up word: ${name}`;
    case 'ch': {
      const chain = content?.chains?.find(( ch) => ch.id === name);
      return chain ? `Word chain: ${chain.steps.join(', ')}` : id;
    }
    case 'iw': return `Word charm: ${shownWord(name)}`;
    case 's': {
      const line = scenesOf(content).flatMap((scene) => scene.sentences).find((s) => s.id === name);
      return line ? `Story line: ${line.text}` : id;
    }
    case 'q': {
      const question = scenesOf(content).find((scene) => scene.id === name)?.question;
      const text = question && content.voice?.[question.line]?.text;
      return text ? `Story question: ${text}` : id;
    }
    default: return id;
  }
}

const howWords = (how) => (how === null ? '' : `: ${HOW_WORDS[how]}`);

export function passStatus({ back, how, closed }) {
  if (closed !== null) return `Done ${shortDate(closed)}${howWords(how)}`;
  if (back !== null && how !== null) return `Came back ${shortDate(back)}${howWords(how)}. Comes again in a later lesson.`;
  return 'Waiting to come back';
}

function inOrder(passes) {
  const latest = [...passes].reverse();
  return [
    ...latest.filter((r) => r.closed === null).sort((a, b) => b.day - a.day),
    ...latest.filter((r) => r.closed !== null).sort((a, b) => (b.closed) - (a.closed)),
  ];
}

export function mount(el, ctx, params = {}) {
  const body = cornerFrame(el, ctx, params, 'passes');
  if (!body) return () => {};
  const passes = inOrder(ctx.profile.passes ?? []);
  body.append(
    h('p', { class: 'gu-hint' }, 'What she passed, and where each one stands. A pass is not scored.'),
    passes.length === 0 ? h('p', { class: 'gu-empty' }, 'No passes yet.') : h('table', { class: 'gu-table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'What'), h('th', {}, 'Passed on'), h('th', {}, 'Lessons'), h('th', {}, 'Where it stands'))),
      h('tbody', {}, passes.map((record) => h('tr', {},
        h('td', {}, passLabel(record, ctx.content)), h('td', {}, shortDate(record.day)), h('td', {}, record.times), h('td', {}, passStatus(record)))))));
  return () => {};
}
