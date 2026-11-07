import { h } from '../../core/dom.js';
import { createLock } from '../../core/lock.js';
import { CHOOSABLE_LESSONS, LAST_LESSON } from '../../curriculum/lessons.js';
import { HEROES, heroOf, heroWords, withHero } from '../../profile/hero.js';
import { newProfile } from '../../profile/profile.js';
import { clampTaughtUpTo, normalizeSettings } from '../../profile/settings.js';
import { artUrl, layeredArt } from '../../ui/components.js';
import { castArt, LOOK_OPTIONS, outfitArt } from '../../ui/story-stage.js';
import { dressupChoices } from '../dressup.js';
import { hashPin, isValidPin, unsavedBanner } from './gate.js';
import { RESTORED_MESSAGE, restoreControls } from './restore.js';



export const SETUP_STEPS = Object.freeze(['pin', 'names', 'hero', 'look', 'outfit', 'kitten', 'start', 'lesson', 'copilot', 'soundcheck']);

export const CHILD_STEPS = Object.freeze(['hero', 'look', 'outfit', 'kitten']);

export const NEW_STUDENT_LINES = Object.freeze({
  hero: 'newstudent.hero', look: 'newstudent.look', outfit: 'newstudent.outfit', kitten: 'newstudent.kitten', start: 'newstudent.done',
});

export const ASSESS_START = 1;

export const setupSteps = (settings) => (typeof settings.pin === 'string' ? SETUP_STEPS.filter((step) => step !== 'pin') : SETUP_STEPS);

export const NAME_MAX = 24;
const FIRST_LESSON = 1;

const capitalized = (id) => id.charAt(0).toUpperCase() + id.slice(1);

export const HERO_LABELS = Object.freeze({ princess: 'Princess', prince: 'Prince' });

export const LOOK_CHOICES = Object.freeze({
  skin: Object.freeze(LOOK_OPTIONS.skin.map((id) => ({ id, label: `Skin ${id.slice(1)}` }))),
  hair: Object.freeze(LOOK_OPTIONS.hair.map((id) => ({ id, label: capitalized(id) }))),
  hairColor: Object.freeze(LOOK_OPTIONS.hairColor.map((id) => ({ id, label: capitalized(id) }))),
  kittenFur: Object.freeze(LOOK_OPTIONS.kittenFur.map((id) => ({ id, label: capitalized(id) }))),
});

export const PRINCE_HAIR_LABELS = Object.freeze({ long: 'Swept', curly: 'Curly', bun: 'Tufted' });
const PRINCE_LOOK_CHOICES = Object.freeze({
  ...LOOK_CHOICES,
  hair: Object.freeze(LOOK_CHOICES.hair.map(({ id }) => ({ id, label: PRINCE_HAIR_LABELS[ (id)] ?? capitalized(id) }))),
});

export const lookChoices = (hero) => (hero === 'prince' ? PRINCE_LOOK_CHOICES : LOOK_CHOICES);

export const lastContentLesson = (content) => Math.max(0, ...(content.words ?? []).map((w) => w.lesson).filter(Number.isFinite));

export function contentNote(taughtUpTo, content) {
  const last = lastContentLesson(content);
  return taughtUpTo > last ? `This version has practice words up to lesson ${last}; later lessons arrive in updates.` : null;
}

export const cleanName = (name) => String(name ?? '').replace(/\s+/g, ' ').trim();

export function checkSetupStep(step, answers) {
  if (step === 'pin') {
    if (!isValidPin(answers.pin)) return 'Choose a PIN of 4 to 8 digits.';
    if (answers.pin !== answers.pin2) return "The two PINs don't match. Type the same PIN in both boxes.";
  }
  if (step === 'names') {
    const princess = cleanName(answers.princessName);
    const kitten = cleanName(answers.kittenName);
    if (!princess) return "Type the child's name.";
    if (!kitten) return 'Type a name for the kitten.';
    if (princess.length > NAME_MAX || kitten.length > NAME_MAX) return `Keep each name to ${NAME_MAX} characters or fewer.`;
  }
  if (step === 'lesson') {
    const n = answers.taughtUpTo;
    if (!Number.isInteger(n) || (n) < FIRST_LESSON || (n) > LAST_LESSON) return `Choose a lesson from ${FIRST_LESSON} to ${LAST_LESSON}.`;
  }
  return null;
}

export function starterChoices(wardrobe, hero) {
  const fresh = withHero(newProfile(), hero === 'prince' ? 'prince' : 'princess');
  const choices = dressupChoices(wardrobe, { ...fresh, unlocked: { ...fresh.unlocked, wardrobe: [] } });
  return { outfit: choices.outfit.map(({ value, label }) => ({ value, label })), crown: choices.crown.map(({ value, label }) => ({ value, label })) };
}

export async function finishSetup(settings, answers, wardrobe) {
  const taughtUpTo = clampTaughtUpTo(answers.taughtUpTo);
  const pin = typeof settings.pin === 'string' && !answers.pin ? settings.pin : await hashPin(String(answers.pin));
  const next = normalizeSettings({ ...settings, taughtUpTo, copilot: answers.copilot !== false, pin });
  const profile = withHero(newProfile(taughtUpTo), heroOf({ look: answers.look }));
  profile.princessName = cleanName(answers.princessName).slice(0, NAME_MAX);
  profile.kittenName = cleanName(answers.kittenName).slice(0, NAME_MAX);
  for (const [key, choices] of Object.entries(LOOK_CHOICES)) {
    const value = answers.look?.[ (key)];
    if (choices.some((choice) => choice.id === value)) profile.look[ (key)] = (value);
  }
  const starters = starterChoices(wardrobe, heroOf(profile));
  for (const key of (['outfit', 'crown'])) {
    const value = answers.look?.[key];
    if (starters[key].some((choice) => choice.value === value)) profile.look[key] = (value);
  }
  return { settings: next, profile };
}

export function mount(el, ctx) {
  const setUp = typeof ctx.store?.registered === 'function' ? ctx.store.registered() : typeof ctx.settings.pin === 'string';
  if (setUp) {
    ctx.router.go('grownup/gate').catch(( err) => console.error('The grown-up gate could not open', err));
    return () => {};
  }
  const lock = createLock();
  const draft = ctx.setupDraft ?? { index: 0, answers: { pin: '', pin2: '', princessName: '', kittenName: '', look: { ...ctx.profile.look },
    taughtUpTo: ctx.settings.taughtUpTo, copilot: ctx.settings.copilot } };
  ctx.setupDraft = draft;
  const { answers } = draft;
  const steps = setupSteps(ctx.settings);
  const hx = heroWords({ profile: { look: answers.look } });

  const count = h('p', { class: 'gu-step-count' });
  const panel = h('div', { class: 'gu-setup-step' });
  const message = h('p', { class: 'gu-message', role: 'status', 'aria-live': 'polite' });
  const back = h('button', { type: 'button', class: 'gu-button', onClick: () => { draft.index = Math.max(0, draft.index - 1); show(); } }, 'Back');
  const next = h('button', { type: 'submit', class: 'gu-button gu-primary' }, 'Next');

  const field = (label, id, value, set, attrs = {}) => h('div', { class: 'gu-field' },
    h('label', { class: 'gu-label', for: id }, label),
    h('input', { class: 'gu-input', id, value, autocomplete: 'off', onInput: ( e) => set( (e.target).value), ...attrs }));

  const swatchRow = (key, title, choices) => h('div', { class: 'gu-swatch-row', role: 'group', 'aria-label': title },
    h('p', { class: 'gu-label' }, title),
    h('div', { class: 'gu-swatches' }, choices.map(({ id, label }) => {
      const look = { ...answers.look, [key]: id };
      const art = key === 'kittenFur' ? layeredArt(castArt('kitten', look), 'gu-swatch-kitten')
        : key === 'outfit' ? layeredArt([outfitArt(id, look)], 'gu-swatch-princess')
          : layeredArt(castArt('princess', look), 'gu-swatch-princess');
      return h('button', { type: 'button', class: 'gu-swatch', 'data-choice': `${key}:${id}`, 'aria-pressed': String(answers.look[key] === id), 'aria-label': label,
        onClick: () => { answers.look[key] = id; show(`${key}:${id}`); } },
      h('span', { class: 'gu-swatch-art' }, art), h('span', { class: 'gu-swatch-label' }, label));
    })));
  const swatches = (key, title) => swatchRow(key, title, lookChoices(heroOf({ look: answers.look }))[key]);
  const starterRow = (key) => starterChoices(ctx.content?.wardrobe, heroOf({ look: answers.look }))[key].map(({ value, label }) => ({ id: value, label }));
  const preview = () => h('div', { class: 'gu-look-preview', 'aria-hidden': 'true' },
    layeredArt(castArt('princess', answers.look), 'gu-look-princess'), layeredArt(castArt('kitten', answers.look), 'gu-look-kitten'));

  const chooseHero = (hero) => {
    if (hero === 'prince') answers.look.hero = hero;
    else delete answers.look.hero;
    show(`hero:${hero}`);
  };

  const lessonSelect = () => h('select', { class: 'gu-select', id: 'gu-setup-lesson',
    onChange: ( e) => { answers.taughtUpTo = Number( (e.target).value); show(); } },
  CHOOSABLE_LESSONS.map((lesson) => h('option', { value: String(lesson.n), selected: lesson.n === answers.taughtUpTo }, `${lesson.n}: ${lesson.concept}`)));

  const assessFromSelect = () => h('select', { class: 'gu-select', id: 'gu-setup-assess-from',
    onChange: ( e) => { const v = (e.target).value; answers.assessFrom = v === '' ? null : Number(v); } },
  h('option', { value: '', selected: answers.assessFrom == null }, 'Start from the beginning'),
  CHOOSABLE_LESSONS.map((lesson) => h('option', { value: String(lesson.n), selected: lesson.n === answers.assessFrom }, `${lesson.n}: ${lesson.concept}`)));

  const restoring = restoreControls(ctx, { needsPin: true, onRestored: () => restored() });
  const restored = () => {
    const hx = heroWords(ctx);
    ctx.setupDraft = null;
    count.textContent = '';
    back.hidden = true;
    next.hidden = true;
    message.textContent = '';
    panel.replaceChildren(
      h('h1', { class: 'gu-title' }, 'Welcome back!'),
      h('p', {}, hx(RESTORED_MESSAGE)),
      h('button', { type: 'button', class: 'gu-button gu-primary', onClick: () => { lock.run(() => ctx.router.go('hub')).catch((err) => console.error('The castle could not open', err)); } }, 'Go to the castle'));
  };

  const lessonNote = () => {
    const note = contentNote(answers.taughtUpTo, ctx.content);
    return note ? h('p', { class: 'gu-hint' }, note) : null;
  };

  const views = {
    hero: () => [
      h('h1', { class: 'gu-title' }, 'Who is the hero of the story?'),
      h('p', { class: 'gu-hint' }, 'The child picks, with you beside or on their own. You can change this later in Settings.'),
      h('div', { class: 'gu-hero-choices', role: 'group', 'aria-label': 'The hero' }, HEROES.map((hero) => h('button', {
        type: 'button', class: 'gu-choice gu-hero-choice', 'data-choice': `hero:${hero}`, 'aria-pressed': String(heroOf({ look: answers.look }) === hero),
        onClick: () => chooseHero(hero) },
      h('span', { class: 'gu-look-preview' }, layeredArt(castArt('princess', { ...answers.look, hero }), 'gu-look-princess')),
      h('span', { class: 'gu-hero-name' }, HERO_LABELS[hero])))),
    ],
    pin: () => [
      h('h1', { class: 'gu-title' }, "Welcome! A few questions for the grown-up"),
      h('p', {}, "First, choose a PIN for the grown-up corner, where the settings and your child's progress are. It keeps little fingers out; holding a button for 3 seconds opens the corner too."),
      field('PIN (4 to 8 digits)', 'gu-setup-pin', answers.pin, (v) => { answers.pin = v; }, { type: 'password', inputmode: 'numeric', maxlength: '8' }),
      field('The same PIN again', 'gu-setup-pin2', answers.pin2, (v) => { answers.pin2 = v; }, { type: 'password', inputmode: 'numeric', maxlength: '8' }),
      h('section', { class: 'gu-restore' },
        h('h2', { class: 'gu-subtitle' }, 'Restoring from a backup?'),
        h('p', { class: 'gu-hint' }, 'If your child already plays on another computer, skip these questions: choose the backup file saved there. It brings back their progress, the settings, the recordings and the PIN.'),
        ...restoring.nodes),
    ],
    names: () => [
      h('h1', { class: 'gu-title' }, 'The names'),
      h('p', {}, 'Your child will see these names in the game. The narrator says the title of the hero and "Kitty"; you can record the names in your own voice later, in Sound check.'),
      field("Your child's name", 'gu-setup-princess', answers.princessName, (v) => { answers.princessName = v; }, { maxlength: String(NAME_MAX) }),
      field("The kitten's name", 'gu-setup-kitten', answers.kittenName, (v) => { answers.kittenName = v; }, { maxlength: String(NAME_MAX) }),
      h('p', { class: 'gu-hint' }, 'Next, the child picks a princess or a prince, and how they look: pass the screen over, or pick together.'),
    ],
    look: () => [
      h('h1', { class: 'gu-title' }, 'How you look'),
      h('div', { class: 'gu-look' }, preview(),
        h('div', { class: 'gu-look-choices' }, swatches('skin', 'Skin'), swatches('hair', 'Hair'), swatches('hairColor', 'Hair color'))),
    ],
    outfit: () => [
      h('h1', { class: 'gu-title' }, 'Something to wear'),
      h('div', { class: 'gu-look' }, preview(),
        h('div', { class: ['gu-look-choices', 'gu-wear-choices'] }, swatchRow('outfit', 'Outfit', starterRow('outfit')), swatchRow('crown', 'Crown', starterRow('crown')))),
    ],
    kitten: () => [
      h('h1', { class: 'gu-title' }, 'Your kitten'),
      h('div', { class: 'gu-look' }, preview(), h('div', { class: 'gu-look-choices' }, swatches('kittenFur', 'Kitten fur'))),
    ],
    start: () => [
      h('h1', { class: 'gu-title' }, hx('Last, for the grown-up: her lesson')),
      h('p', {}, hx("The Assessment is 5 to 10 minutes of reading with you beside her, marking each word, as on her first day. She hears only that it is a day at the Academy, never a test. It suggests a UFLI lesson; you keep it or change it, and her tutor's number wins.")),
      h('div', { class: 'gu-field' }, h('label', { class: 'gu-label', for: 'gu-setup-assess-from' }, hx('Her lesson, roughly, if you know it')),
        assessFromSelect(),
        h('p', { class: 'gu-hint' }, 'The reading starts just below it, and goes down by itself if that is too hard.')),
      h('div', { class: 'gu-row gu-start-choices' },
        h('button', { type: 'button', class: 'gu-button gu-primary', 'data-choice': 'start:assessment', onClick: () => finish('assessment', undefined, { assess: true }) }, 'Do the Assessment now (recommended)'),
        h('button', { type: 'button', class: 'gu-button', 'data-choice': 'start:lesson', onClick: () => forward() }, 'I know the lesson')),
    ],
    lesson: () => [
      h('h1', { class: 'gu-title' }, hx('Which UFLI lesson has she been taught up to?')),
      h('p', {}, hx("Everything she reads or spells in the game uses only the patterns taught up to this lesson. Ask her tutor if you're not sure; you can change it any time in Settings as her tutor moves on.")),
      h('div', { class: 'gu-field' }, h('label', { class: 'gu-label', for: 'gu-setup-lesson' }, 'Taught up to lesson'), lessonSelect()),
      lessonNote(),
    ],
    copilot: () => [
      h('h1', { class: 'gu-title' }, hx('Will a grown-up play with her?')),
      h('p', {}, hx("The game works best with a grown-up beside her (the co-pilot). When it's your turn, you judge her reading with ✓ Yes, ↻ Try again or 🔊 Help. On days with no grown-up, she checks herself instead. She can switch this at the start of each session too.")),
      h('div', { class: 'gu-segmented', role: 'group', 'aria-label': 'Co-pilot' },
        [[true, hx('Yes, a grown-up plays with her (co-pilot on)')], [false, hx('No, she plays on her own')]].map(([value, label]) =>
          h('button', { type: 'button', class: 'gu-choice', 'aria-pressed': String(answers.copilot === value), onClick: () => { answers.copilot = (value); show(); } }, (label)))),
    ],
    soundcheck: () => [
      h('h1', { class: 'gu-title' }, 'One more thing: a 5-minute sound check'),
      h('p', {}, hx("The narrator's voice was made by Mom. The letter sounds are Mom's own recordings. Before her first session, please spend about 5 minutes in Sound check listening to the letter sounds (about 45 short clips).")),
      h('p', {}, 'If a sound is off (an extra "uh" on /b/, say), flag it, or record it again in your own voice. Your recording replaces it everywhere in the game.'),
      h('div', { class: 'gu-row' },
        h('button', { type: 'button', class: 'gu-button gu-primary', onClick: () => finish('grownup/soundcheck', { unlocked: true }) }, 'Finish and open Sound check'),
        h('button', { type: 'button', class: 'gu-button', onClick: () => finish('hub') }, 'Finish and go to the castle')),
    ],
  };

  let said = '';
  function show(focusChoice) {
    const step = steps[draft.index];
    const child = CHILD_STEPS.includes(step);
    card.classList.toggle('gu-setup-child', child);
    count.textContent = child ? '' : `Step ${draft.index + 1} of ${steps.length}`;
    panel.replaceChildren(...views[step]().filter((node) => node !== null));
    back.hidden = draft.index === 0;
    next.hidden = draft.index === steps.length - 1 || step === 'start';
    message.textContent = '';
    if (step !== said) {
      said = step;
      const line = NEW_STUDENT_LINES[ (step)];
      if (line && typeof ctx.say === 'function') ctx.say(line).catch(( err) => console.warn('A New Student line could not play', err));
      else ctx.setReplay?.(null);
    }
    const focus = focusChoice ? panel.querySelector(`[data-choice="${focusChoice}"]`) : panel.querySelector('input, select');
    (focus)?.focus();
  }

  function forward() {
    const problem = checkSetupStep(steps[draft.index], answers);
    if (problem) { message.textContent = hx(problem); return; }
    draft.index = Math.min(steps.length - 1, draft.index + 1);
    show();
  }

  const finish = (scene, params, { assess = false } = {}) => lock.run(async () => {
    const done = await finishSetup(ctx.settings, assess ? { ...answers, taughtUpTo: ASSESS_START } : answers, ctx.content?.wardrobe);
    ctx.settings = done.settings;
    const from = Number.isInteger(answers.assessFrom) ? { assessFrom: answers.assessFrom } : {};
    ctx.profile = assess ? { ...done.profile, assessFirst: true, ...from } : done.profile;
    try {
      await ctx.save();
    } catch (err) {
      console.error('Setup could not be saved', err);
      message.textContent = "Saving didn't work in this browser window. Please try Finish again.";
      return;
    }
    ctx.setupDraft = null;
    await ctx.router.go(scene, params);
  }).catch((err) => console.error('Setup could not finish', err));

  const card = h('form', { class: 'gu-card gu-setup', onSubmit: ( event) => { event.preventDefault(); forward(); } },
    unsavedBanner(ctx),
    count,
    panel,
    message,
    h('div', { class: 'gu-row gu-setup-nav' }, back, next));
  el.append(h('div', { class: 'grownup' },
    h('img', { class: 'scene-bg', src: artUrl('bg/grownup'), alt: '' }),
    card));
  show();
  return () => {};
}
