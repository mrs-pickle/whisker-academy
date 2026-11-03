import { h } from '../core/dom.js';
import { createArrivalGuard, createLock } from '../core/lock.js';
import { readSaved } from '../profile/saved.js';
import { MAX_STUDENTS, studentPrefix } from '../profile/students.js';
import { artUrl, bigButton, layeredArt } from '../ui/components.js';
import { castArt } from '../ui/story-stage.js';

export const START_VOICE = Object.freeze({
  newStudent: 'v.start.newstudent',
  continue: 'v.start.continue',
  assessment: 'v.start.assessment',
  grownups: 'v.start.grownups',
  who: 'v.start.who',
});

export const nameClip = (id) => `start.name.${id}`;

export const SAY_AT_MOST_MS = 2500;

export const startChoices = (students) => ({ newStudent: students < MAX_STUDENTS, glow: students === 0, continue: students > 0, assessment: students > 0 });

export function mount(el, ctx) {
  const lock = createLock();
  let arrival = createArrivalGuard();
  let cold = !ctx.audio.unlocked();
  const students = ctx.store.students();
  const choices = startChoices(students.length);

  const press = (then, line) => (event) => {
    if (lock.locked() || (!cold && !arrival.allows(event))) return;
    if (cold) {
      cold = false;
      ctx.audio.unlock();
    }
    lock.run(async () => { await say(line); await then(); }).catch((err) => console.warn('The start menu could not go on', err));
  };
  const say = async (line) => {
    if (!line || typeof ctx.say !== 'function') return;
    const most = new Promise((resolve) => { setTimeout(resolve, SAY_AT_MOST_MS); });
    try { await Promise.race([ctx.say(line.slice('v.'.length)), most]); } catch (err) { console.warn('A start menu word could not play', err); }
  };
  const settled = async () => {
    if (!ctx.store.registered() && students.length > 0) await ctx.useStudent(students[0].id);
  };
  const play = async (id) => {
    await ctx.useStudent(id);
    await ctx.router.go('hub');
  };
  const assess = async (id) => {
    await ctx.useStudent(id);
    await ctx.router.go('grownup/gate', { next: 'assessment' });
  };

  const menu = h('div', { class: 'start-menu' },
    choices.newStudent ? h('div', { class: ['start-new', choices.glow && 'glow'] }, bigButton({ label: 'New Student', icon: 'ui/sparkle', onClick: press(async () => {
      if (ctx.store.registered() || students.length > 0) await ctx.newStudent();
      await ctx.router.go('grownup/setup');
    }, START_VOICE.newStudent) })) : null,
    choices.continue ? bigButton({ label: 'Continue', icon: 'ui/paw', onClick: press(async () => {
      if (students.length === 1) await play(students[0].id);
      else await showPicker(play);
    }, START_VOICE.continue) }) : null,
    choices.assessment ? bigButton({ label: 'Reading check', icon: 'ui/stone-on', onClick: press(async () => {
      if (students.length === 1) await assess(students[0].id);
      else await showPicker(assess);
    }, START_VOICE.assessment) }) : null,
    bigButton({ label: 'Grown-ups', icon: 'ui/book', onClick: press(async () => {
      await settled();
      await ctx.router.go('grownup/gate');
    }, START_VOICE.grownups) }));

  const screen = h('div', { class: 'start' },
    h('img', { class: 'scene-bg', src: artUrl('bg/hub'), alt: '' }),
    h('h1', { class: 'hub-title' }, "Meadowlark's World", h('span', { class: 'hub-subtitle' }, 'Whisker Academy')),
    menu);
  el.append(screen);

  async function showPicker(then) {
    const heroes = await Promise.all(students.map(async ({ id }) => ({ id, profile: (await readSaved(ctx.store.base, id)).profile, named: await useName(id) })));
    let picked = false;
    const back = h('button', { type: 'button', class: 'start-back', onClick: () => { if (!lock.locked()) { picker.remove(); menu.hidden = false; } } }, 'Back');
    const picker = h('div', { class: 'start-picker', role: 'group', 'aria-label': 'Who is playing?' },
      heroes.map(({ id, profile }) => h('button', { type: 'button', class: 'start-hero', 'data-student': id,
        onClick: ( event) => {
          if (lock.locked() || !arrival.allows(event)) return;
          picked = true;
          lock.run(async () => { if (heroes.some((x) => x.id === id && x.named)) await sayName(id); await then(id); }).catch((err) => console.warn('The student could not be opened', err));
        } },
      layeredArt(castArt('princess', profile.look), 'start-hero-art'),
      h('span', { class: 'start-hero-name' }, typeof profile.princessName === 'string' ? profile.princessName.trim() : ''))),
      back);
    menu.hidden = true;
    arrival = createArrivalGuard();
    screen.append(picker);
    const names = heroes.filter((x) => x.named).map((x) => nameClip(x.id));
    (async () => {
      if (typeof ctx.say === 'function') await ctx.say(START_VOICE.who.slice('v.'.length));
      if (names.length > 0 && picker.isConnected && !picked) await ctx.audio.playSeq(names);
    })().catch(( err) => console.warn("The picker's question could not play", err));
  }

  async function useName(id) {
    if (typeof ctx.audio?.setOverride !== 'function') return false;
    try {
      const blob = await ctx.store.base.getBlob(`${studentPrefix(id)}rec:name.princess`);
      await ctx.audio.setOverride(nameClip(id), blob ?? null);
      return Boolean(blob);
    } catch (err) {
      console.warn('A recorded name could not be read', err);
      return false;
    }
  }

  async function sayName(id) {
    const most = new Promise((resolve) => { setTimeout(resolve, SAY_AT_MOST_MS); });
    try { await Promise.race([ctx.audio.play(nameClip(id)), most]); } catch (err) { console.warn('A recorded name could not play', err); }
  }
  return () => {};
}
