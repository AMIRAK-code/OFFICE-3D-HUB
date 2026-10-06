// Sticker library tray: upload, drag onto the wall, starter emoji pack, desktop file drop.
import { api, store, on, act, emit } from '../net.js';
import { h, $, resizeImage, readFile, pickFile, fullName } from '../util.js';
import { toast, toastError, openPopover, menuItem, confirmDialog } from '../ui/kit.js';
import { boardUVAt, placeSticker, highlightBoard, isOverTrash } from '../scene/wall.js';
import { room } from '../scene/room.js';
import { sfx } from '../audio.js';

export const STARTER = ['🎉', '❤️', '👍', '🔥', '⭐', '😂', '🚀', '☕', '🍕', '🌈', '🦄', '🐱', '👏', '💯', '🌻', '🍩', '🥳', '🙏'];
const isEmojiSticker = (s) => s.name.startsWith('emoji ');

export async function uploadStickerFile(file) {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error('Stickers can be PNG, JPG, WEBP or GIF images');
  let dataUrl = file.type === 'image/gif' && file.size < 2.3e6 ? await readFile(file) : await resizeImage(file, { max: 512, type: 'image/png' });
  if (dataUrl.length > 3.3e6) dataUrl = await resizeImage(file, { max: 512, type: 'image/webp', quality: 0.85 });
  const res = await api.upload('sticker', dataUrl, file.name.replace(/\.[^.]+$/, '').slice(0, 30));
  return res.sticker;
}

/** Emoji stickers are rendered to PNG once, then shared by everyone. */
export async function ensureEmojiSticker(emoji) {
  const name = `emoji ${emoji}`;
  const existing = store.list('stickers').find((s) => s.name === name);
  if (existing) return existing;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.font = '196px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, 128, 142);
  const res = await api.upload('sticker', c.toDataURL('image/png'), name);
  return res.sticker;
}

async function uploadFromPicker() {
  const file = await pickFile();
  if (!file) return null;
  const id = toast('Uploading sticker…', { icon: '⏳', sticky: true });
  try {
    const s = await uploadStickerFile(file);
    sfx.pop();
    toast('Sticker added — drag it onto the wall!', { icon: '🎨' });
    return s;
  } catch (err) {
    toastError(err);
    return null;
  } finally {
    id();
  }
}

// ---------------------------------------------------------------- drag from tray
function makeDraggable(tile, resolveSticker, onTap, sticker = null) {
  tile.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY };
    let ghost = null;
    const tilt = (Math.random() - 0.5) * 16;
    const move = (ev) => {
      if (!ghost && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > 6) {
        ghost = h('div', { class: 'drag-ghost' }, tile.querySelector('img, .emoji')?.cloneNode(true));
        document.body.append(ghost);
        highlightBoard(true);
        sfx.click();
      }
      if (!ghost) return;
      ghost.style.transform = `translate(${ev.clientX}px, ${ev.clientY}px) translate(-50%, -50%) rotate(${tilt}deg)`;
      const trash = isOverTrash(ev.clientX, ev.clientY);
      room.trash.setOpen(trash);
      ghost.classList.toggle('trash', trash);
      ghost.classList.toggle('over', !trash && !!boardUVAt(ev.clientX, ev.clientY));
    };
    const up = async (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      highlightBoard(false);
      if (!ghost) {
        if (ev.type === 'pointerup') onTap();
        return;
      }
      const g = ghost;
      room.trash.setOpen(false);
      if (ev.type === 'pointerup' && isOverTrash(ev.clientX, ev.clientY)) {
        g.classList.add('drop');
        setTimeout(() => g.remove(), 260);
        await trashLibrarySticker(sticker);
        return;
      }
      const pos = ev.type === 'pointerup' ? boardUVAt(ev.clientX, ev.clientY) : null;
      if (!pos) {
        g.classList.add('back');
        setTimeout(() => g.remove(), 250);
        return;
      }
      g.classList.add('drop');
      setTimeout(() => g.remove(), 260);
      try {
        const s = await resolveSticker();
        await placeSticker(s.id, pos);
      } catch (err) {
        toastError(err);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  });
}

async function trashLibrarySticker(sticker) {
  if (!sticker) return toast('Starter stickers can’t be thrown away — drag your own uploads here instead', { icon: '🗑️' });
  if (sticker.by !== store.me.id) return toast('You can only throw away stickers you uploaded', { icon: '🗑️' });
  if (!(await confirmDialog('Throw this sticker away? It will also disappear from the wall.'))) return;
  try {
    await act('sticker.remove', { id: sticker.id });
    room.trash.gulp();
    sfx.blow();
  } catch (err) {
    toastError(err);
  }
}

// ---------------------------------------------------------------- tray
let tray = null;

function stickerMenu(tile, resolve, sticker) {
  const own = sticker && sticker.by === store.me.id;
  const by = sticker && store.user(sticker.by);
  openPopover(tile, [
    sticker && !isEmojiSticker(sticker) ? h('div', { class: 'menu-note' }, own ? 'Uploaded by you' : `Uploaded by ${fullName(by)}`) : null,
    menuItem('📍', 'Stick it on the wall', async () => {
      try {
        const s = await resolve();
        await placeSticker(s.id);
      } catch (err) {
        toastError(err);
      }
    }),
    menuItem('💌', 'Send to a colleague', async () => {
      try {
        const s = await resolve();
        emit('open', { name: 'send', stickerId: s.id });
      } catch (err) {
        toastError(err);
      }
    }),
    own ? menuItem('🗑️', 'Delete from library', async () => {
      if (!(await confirmDialog('Delete this sticker? It will also disappear from the wall.'))) return;
      act('sticker.remove', { id: sticker.id }).catch(toastError);
    }, { danger: true }) : null,
  ], { className: 'menu', placement: 'above' });
}

function renderTray() {
  if (!tray) return;
  const grid = tray.querySelector('.tray-grid');
  const library = store.list('stickers').filter((s) => !isEmojiSticker(s)).sort((a, b) => b.at - a.at);
  const tiles = [];
  tiles.push(h('button', { class: 'tile tile-upload', title: 'Upload a sticker', onClick: uploadFromPicker }, h('span', {}, '＋'), h('small', {}, 'Upload')));
  for (const s of library) {
    const tile = h('button', { class: 'tile', title: s.name }, h('img', { src: s.url, alt: s.name, draggable: 'false', loading: 'lazy' }));
    const resolve = async () => s;
    makeDraggable(tile, resolve, () => stickerMenu(tile, resolve, s), s);
    tiles.push(tile);
  }
  if (library.length) tiles.push(h('span', { class: 'tray-sep' }));
  for (const emoji of STARTER) {
    const tile = h('button', { class: 'tile tile-emoji', title: 'Starter sticker' }, h('span', { class: 'emoji' }, emoji));
    const resolve = () => ensureEmojiSticker(emoji);
    makeDraggable(tile, resolve, () => stickerMenu(tile, resolve, null));
    tiles.push(tile);
  }
  grid.replaceChildren(...tiles);
}

export function toggleTray(force) {
  const open = force ?? !tray?.classList.contains('open');
  if (!tray) {
    tray = h('section', { class: 'tray', 'aria-label': 'Sticker library' },
      h('header', { class: 'tray-head' },
        h('div', {}, h('b', {}, '🎨 Stickers'), h('span', { class: 'muted' }, ' — drag onto the wall, into the 🗑️ trash, or tap one for more')),
        h('button', { class: 'panel-close', 'aria-label': 'Close stickers', onClick: () => toggleTray(false) }, '✕')),
      h('div', { class: 'tray-grid' }));
    $('#hud').append(tray);
    renderTray();
  }
  tray.classList.toggle('open', open);
  document.body.classList.toggle('tray-open', open);
  $('#hud [data-open="stickers"]')?.classList.toggle('active', open);
  if (open) sfx.pop();
}

export function initStickers() {
  on('col:stickers', renderTray);

  // Drop image files from the desktop: onto the wall = stick it there, anywhere else = add to the library.
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  window.addEventListener('dragover', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    highlightBoard(!!boardUVAt(e.clientX, e.clientY));
  });
  window.addEventListener('dragleave', (e) => {
    if (!e.relatedTarget) highlightBoard(false);
  });
  window.addEventListener('drop', async (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    highlightBoard(false);
    const file = [...e.dataTransfer.files].find((f) => f.type.startsWith('image/'));
    if (!file || !store.ready) return;
    const pos = boardUVAt(e.clientX, e.clientY);
    const done = toast('Uploading sticker…', { icon: '⏳', sticky: true });
    try {
      const s = await uploadStickerFile(file);
      if (pos) await placeSticker(s.id, pos);
      else {
        toggleTray(true);
        toast('Sticker added to the library!', { icon: '🎨' });
      }
      sfx.pop();
    } catch (err) {
      toastError(err);
    } finally {
      done();
    }
  });
}
