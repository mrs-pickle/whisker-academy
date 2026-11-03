import { h } from '../../core/dom.js';
import { createLock } from '../../core/lock.js';
import { checkBackup, importBackup } from '../../profile/backup.js';
import { heroWords } from '../../profile/hero.js';
import { readSaved } from '../../profile/saved.js';
import { MAX_STUDENTS } from '../../profile/students.js';
import { switchStudent } from '../../profile/switch-student.js';

export const EMPTY_BACKUP = 'This backup has no progress in it; restoring it removes her progress here.';

export const restoreQuestion = (name, { hasProgress = true } = {}, hx = ( text) => text) => (hasProgress
  ? `Restore "${name}"? ${hx('It replaces her progress, the settings (including the grown-up PIN) and the recordings in this browser with the ones in the file.')}`
  : `Restore "${name}"? ${hx(EMPTY_BACKUP)} It also replaces the settings (including the grown-up PIN) and the recordings in this browser with the ones in the file.`);

export const RESTORED_MESSAGE = 'Backup restored. Her progress, the settings and the recordings are back. The grown-up PIN is now the one from the backup, so use that PIN from now on.';

export const NO_PIN_MESSAGE = "That backup was made before setup was finished, so it can't be used to start here. Answer the setup questions instead.";

export const DEVICE_RESTORED = 'Backup restored. Every student on this device, the settings and the recordings are the ones from the file. The grown-up PIN is now the one from the backup, so use that PIN from now on.';

export const RESTORED_KEPT_PIN = 'Backup restored. Her progress and the recordings from the file are back. The grown-up PIN stays the one you use now.';

export const deviceQuestion = (name, students) => `Restore "${name}"? It holds everything from a device (${students === 1 ? 'one student' : `${students} students`}). It replaces every student on this device, the settings (including the grown-up PIN) and the recordings with the ones in the file.`;

export const studentQuestion = (name, { hasProgress = true }) => `Restore "${name}"? It holds one student's progress${hasProgress ? '' : ' (none yet: it was saved before setup was finished)'}. Choose where it goes. Replacing a student's progress cannot be undone; the grown-up PIN stays as it is, unless the student it replaces is the only one here.`;


export async function restoreTargets(ctx, { kind, hasProgress }) {
  if (kind === 'device') return [{ how: 'device', id: null, label: 'Restore everything on this device', keepPin: false }];
  const store = ctx.store;
  if (typeof store?.students !== 'function') return [{ how: 'replace', id: null, label: 'Restore this backup', keepPin: false }];
  const list = store.students();
  if (!store.registered()) return [{ how: 'replace', id: null, label: 'Restore this backup', keepPin: list.length > 0 }];
  const targets = [];
  if (list.length < MAX_STUDENTS && hasProgress) targets.push({ how: 'add', id: null, label: 'Add it as a new student', keepPin: true });
  for (const { id } of list) {
    const name = (await readSaved(store.base, id)).profile.princessName.trim();
    targets.push({ how: 'replace', id, label: name ? `Replace ${name}'s progress with it` : 'Replace this student\'s progress with it', keepPin: list.length > 1 });
  }
  return targets;
}

export async function restoreInto(ctx, target, text) {
  if (target.how === 'device') return importBackup(ctx.store.base ?? ctx.store, text);
  if (target.how === 'add') {
    const back = ctx.store.student;
    await switchStudent(ctx, () => { ctx.store.startNew(); });
    const result = await importBackup(ctx.store, text, { keepPin: true });
    if (result.ok && ctx.store.registered()) return result;
    await switchStudent(ctx, () => ctx.store.use(back));
    return result.ok ? { ok: false, reason: 'That backup has no progress in it, so no student was added.' } : result;
  }
  if (target.id !== null && target.id !== ctx.store.student) await switchStudent(ctx, () => ctx.store.use(target.id));
  return importBackup(ctx.store, text, { keepPin: target.keepPin });
}

export function restoreControls(ctx, { needsPin = false, onRestored } = {}) {
  const hx = heroWords(ctx);
  const lock = createLock();
  const message = h('p', { class: 'gu-message', role: 'status', 'aria-live': 'polite' });
  const confirmBox = h('div', { class: 'gu-confirm', hidden: true });
  let picked = null;

  const input = (h('input', { type: 'file', class: 'gu-file', hidden: true, accept: '.json,application/json',
    onChange: () => { pick(input.files?.[0] ?? null).catch((err) => console.error('The backup file could not be checked', err)); } }));

  const pick = (file) => lock.run(async () => {
    input.value = '';
    picked = null;
    confirmBox.hidden = true;
    message.textContent = '';
    if (!file) return;
    let text;
    try {
      text = await file.text();
    } catch (err) {
      console.error('The backup file could not be read', err);
      message.textContent = "That file couldn't be read, so nothing was changed.";
      return;
    }
    const checked = checkBackup(text);
    if (!checked.ok) { message.textContent = checked.reason; return; }
    if (needsPin && !checked.hasPin) { message.textContent = NO_PIN_MESSAGE; return; }
    picked = { name: file.name, text };
    const targets = await restoreTargets(ctx, checked);
    const question = checked.kind === 'device' ? deviceQuestion(file.name, checked.students)
      : targets.length > 1 || targets[0].keepPin ? studentQuestion(file.name, checked) : restoreQuestion(file.name, checked, hx);
    confirmBox.replaceChildren(
      h('p', {}, question),
      h('div', { class: 'gu-row' },
        targets.map((target, i) => h('button', { type: 'button', class: ['gu-button', i === 0 && 'gu-primary'], 'data-restore': target.how,
          onClick: () => { restore(target); } }, target.label)),
        h('button', { type: 'button', class: 'gu-button', onClick: () => { picked = null; confirmBox.hidden = true; } }, 'Cancel')));
    confirmBox.hidden = false;
    confirmBox.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  });

  const restore = (target) => lock.run(async () => {
    const file = picked;
    picked = null;
    confirmBox.hidden = true;
    if (!file) return;
    const result = await restoreInto(ctx, target, file.text);
    if (!result.ok) { message.textContent = result.reason; return; }
    if (target.how === 'device') await ctx.store.reload();
    const saved = await readSaved(ctx.store);
    ctx.settings = saved.settings;
    ctx.profile = saved.profile;
    ctx.states = saved.states;
    ctx.today = saved.today;
    ctx.pages = null;
    await ctx.audio.reloadOverrides();
    await ctx.save();
    message.textContent = target.how === 'device' ? DEVICE_RESTORED : target.keepPin ? hx(RESTORED_KEPT_PIN) : hx(RESTORED_MESSAGE);
    onRestored?.();
  }).catch((err) => {
    console.error('The backup could not be restored', err);
    message.textContent = "The backup couldn't be restored in this browser window.";
  });

  const choose = h('button', { type: 'button', class: 'gu-button', onClick: () => input.click() }, 'Choose a backup file');
  return { nodes: [choose, input, confirmBox, message], message };
}
