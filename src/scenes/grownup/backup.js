import { h } from '../../core/dom.js';
import { createLock } from '../../core/lock.js';
import { exportBackup } from '../../profile/backup.js';
import { heroWords } from '../../profile/hero.js';
import { PRE_STUDENTS_BACKUP_KEY } from '../../profile/migrate.js';
import { createStudentStore } from '../../profile/students.js';
import { cornerFrame } from './gate.js';
import { removeStudentSection } from './remove-student.js';
import { restoreControls } from './restore.js';

const MS_PER_DAY = 86400000;

const isoDate = (day) => new Date(day * MS_PER_DAY).toISOString().slice(0, 10);

export const backupFileName = (day) => `whisker-academy-backup-${isoDate(day)}.json`;

export const deviceBackupFileName = (day) => `whisker-academy-device-backup-${isoDate(day)}.json`;

export const PRE_STUDENTS_FILE_NAME = 'whisker-academy-backup-before-students.json';

export function downloadText(el, urls, text, name) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  urls.push(url);
  const link = h('a', { href: url, download: name, hidden: true });
  el.append(link);
  link.click();
  link.remove();
}

export function mount(el, ctx, params = {}) {
  const body = cornerFrame(el, ctx, params, 'backup');
  if (!body) return () => {};
  const hx = heroWords(ctx);
  const lock = createLock();
  const urls = [];
  const base = ctx.store.base ?? null;
  const students = typeof ctx.store.students === 'function' ? ctx.store.students() : [];
  const name = typeof ctx.profile?.princessName === 'string' ? ctx.profile.princessName.trim() : '';

  const exportMessage = h('p', { class: 'gu-message', role: 'status', 'aria-live': 'polite' });
  const deviceMessage = h('p', { class: 'gu-message', role: 'status', 'aria-live': 'polite' });

  const saveFile = (make, file, message, done) => lock.run(async () => {
    let text;
    try {
      await ctx.save();
      text = await make();
    } catch (err) {
      console.error('The backup could not be made', err);
      message.textContent = `The backup couldn't be made: ${err instanceof Error ? err.message : err}`;
      return;
    }
    downloadText(el, urls, text, file);
    message.textContent = `Backup file made: ${file}. ${done}`;
  });
  const save = () => saveFile(() => exportBackup(ctx.store), backupFileName(ctx.day), exportMessage,
    hx('Your browser puts it in your Downloads. Keep it somewhere safe; it holds her progress and your recordings.'));
  const saveDevice = () => saveFile(() => exportBackup( (base)), deviceBackupFileName(ctx.day), deviceMessage,
    'Your browser puts it in your Downloads. Keep it somewhere safe; it holds every student on this device and your recordings.');

  const restoring = restoreControls(ctx);
  const removing = base && students.length > 1 ? removeStudentSection(ctx, {
    backup: async ( id) => {
      await ctx.save();
      const file = backupFileName(ctx.day);
      downloadText(el, urls, await exportBackup(studentView(ctx, id)), file);
      return file;
    },
  }) : null;

  const older = h('section', { class: 'gu-setting', 'data-setting': 'pre-students', hidden: true });
  if (base) {
    base.get(PRE_STUDENTS_BACKUP_KEY).then(( text) => {
      if (typeof text !== 'string') return;
      const message = h('p', { class: 'gu-message', role: 'status', 'aria-live': 'polite' });
      older.append(
        h('h2', { class: 'gu-setting-label' }, 'The backup made before students'),
        h('p', { class: 'gu-help' }, hx('When this version first opened, it kept a copy of her progress as it was, before a second student could be added. Nothing was lost; this copy is only in case. Save it as a file to keep it.')),
        h('button', { type: 'button', class: 'gu-button', onClick: () => {
          lock.run(async () => {
            downloadText(el, urls, text, PRE_STUDENTS_FILE_NAME);
            message.textContent = `Backup file made: ${PRE_STUDENTS_FILE_NAME}.`;
          }).catch((err) => console.error(err));
        } }, 'Save the backup made before students'),
        message);
      older.hidden = false;
    }).catch(( err) => console.error('The backup made before students could not be read', err));
  }

  body.append(...[
    h('p', {}, hx("Her progress lives only in this browser on this computer. Save a backup now and then, and before moving to another computer: restore it there from this screen.")),
    h('section', { class: 'gu-setting' },
      h('h2', { class: 'gu-setting-label' }, students.length > 1 && name ? `Save ${name}'s backup file` : 'Save a backup file'),
      h('p', { class: 'gu-help' }, hx('One .json file with her progress, the settings, the color-in pages and your recordings.')),
      h('button', { type: 'button', class: 'gu-button gu-primary', onClick: () => { save().catch((err) => console.error(err)); } }, 'Save a backup file'),
      exportMessage),
    base ? h('section', { class: 'gu-setting', 'data-setting': 'device-backup' },
      h('h2', { class: 'gu-setting-label' }, 'Save everything on this device'),
      h('p', { class: 'gu-help' }, 'One .json file with every student on this device, the settings and your recordings. Restoring it replaces every student on the computer it is restored on.'),
      h('button', { type: 'button', class: 'gu-button', onClick: () => { saveDevice().catch((err) => console.error(err)); } }, 'Save everything on this device'),
      deviceMessage) : null,
    h('section', { class: 'gu-setting' },
      h('h2', { class: 'gu-setting-label' }, 'Restore from a backup file'),
      h('p', { class: 'gu-help' }, students.length > 0
        ? "Pick a backup file saved from this game. It is checked first; a file that is not a good backup changes nothing. One student's file can replace a student here, or be added as a new one while there is room; a file of everything on a device replaces every student here. Restoring brings back the grown-up PIN from the file, unless another student stays on this device."
        : 'Pick a backup file saved from this game. It is checked first; a file that is not a good backup changes nothing. A restore also brings back the grown-up PIN from the file.'),
      ...restoring.nodes),
    older,
    removing].filter((node) => node !== null));
  return () => { for (const url of urls) URL.revokeObjectURL(url); };
}

function studentView(ctx, id) {
  return ctx.store.student === id ? ctx.store : createStudentStore(ctx.store.base, { students: ctx.store.students(), current: id });
}
