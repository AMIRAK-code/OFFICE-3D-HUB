// Sticker mail: send a sticker to a colleague, the inbox, and the arrival animation.
import { store, on, act } from '../net.js';
import { h, avatarEl, fullName, timeAgo } from '../util.js';
import { openModal, openPanel, toast, busy, segmented, emptyState } from '../ui/kit.js';
import { ensureEmojiSticker, STARTER } from './stickers.js';
import { sfx } from '../audio.js';

export function unreadMail() {
  return store.list('mail').filter((m) => m.to === store.me?.id && !m.seen).length;
}

export function openSendSticker({ to = null, stickerId = null } = {}) {
  const sel = { to, stickerId, emoji: stickerId ? null : '🎉' };
  // Emoji stickers are shown in the starter row, so select them there.
  const picked = stickerId && store.cols.stickers.get(stickerId);
  if (picked?.name.startsWith('emoji ')) Object.assign(sel, { stickerId: null, emoji: picked.name.slice(6) });
  openModal({
    title: 'Send a sticker',
    icon: '💌',
    className: 'modal-send',
    render(body, modal) {
      const search = h('input', { class: 'input input-sm', placeholder: 'Search colleagues…', 'aria-label': 'Search colleagues' });
      const people = h('div', { class: 'pick-people' });
      const stickers = h('div', { class: 'pick-stickers' });
      const msg = h('input', { class: 'input', maxlength: '140', placeholder: 'Add a little message (optional)' });
      const sendBtn = h('button', { class: 'btn' }, 'Send 💌');

      const drawPeople = () => {
        const q = search.value.trim().toLowerCase();
        const users = store.list('users')
          .filter((u) => u.id !== store.me.id && (!q || fullName(u).toLowerCase().includes(q)))
          .sort((a, b) => Number(store.online.has(b.id)) - Number(store.online.has(a.id)) || a.firstName.localeCompare(b.firstName));
        people.replaceChildren(...(users.length ? users.map((u) => h('button', {
          type: 'button',
          class: `person-chip${sel.to === u.id ? ' selected' : ''}`,
          onClick: () => {
            sel.to = u.id;
            drawPeople();
          },
        }, avatarEl(u, 26, store.online.has(u.id) ? 'online' : ''), h('span', {}, fullName(u)))) : [h('p', { class: 'muted small' }, q ? 'Nobody matches that name.' : 'No colleagues have joined yet.')]));
      };
      const drawStickers = () => {
        const lib = store.list('stickers').filter((s) => !s.name.startsWith('emoji ')).sort((a, b) => b.at - a.at);
        stickers.replaceChildren(
          ...lib.map((s) => h('button', {
            type: 'button',
            class: `tile${sel.stickerId === s.id ? ' selected' : ''}`,
            onClick: () => {
              Object.assign(sel, { stickerId: s.id, emoji: null });
              drawStickers();
            },
          }, h('img', { src: s.url, alt: s.name }))),
          ...STARTER.map((e) => h('button', {
            type: 'button',
            class: `tile tile-emoji${sel.emoji === e ? ' selected' : ''}`,
            onClick: () => {
              Object.assign(sel, { stickerId: null, emoji: e });
              drawStickers();
            },
          }, h('span', { class: 'emoji' }, e))),
        );
      };
      search.addEventListener('input', drawPeople);
      sendBtn.addEventListener('click', () => busy(sendBtn, async () => {
        if (!sel.to) throw new Error('Pick a colleague first');
        const sticker = sel.stickerId ? { id: sel.stickerId } : await ensureEmojiSticker(sel.emoji);
        await act('mail.send', { to: sel.to, stickerId: sticker.id, message: msg.value });
        sfx.whoosh();
        toast(`Sticker sent to ${store.user(sel.to)?.firstName}!`, { icon: '💌' });
        modal.close();
      }));
      body.append(
        h('div', { class: 'row between' }, h('span', { class: 'field-label' }, 'To'), search),
        people,
        h('span', { class: 'field-label' }, 'Sticker'),
        stickers,
        msg,
        h('div', { class: 'row end' }, sendBtn),
      );
      drawPeople();
      drawStickers();
      modal.on('col:stickers', drawStickers);
      modal.on('presence', drawPeople);
    },
  });
}

export function openMail() {
  openPanel({
    key: 'mail',
    title: 'Sticker mail',
    subtitle: 'Little surprises from your colleagues',
    icon: '✉️',
    accent: '#e64980',
    render(body, panel) {
      let tab = 'in';
      const list = h('div', { class: 'cards mail-list' });
      body.append(
        h('div', { class: 'row between' },
          segmented([['in', '📥 Received'], ['out', '📤 Sent']], tab, (v) => {
            tab = v;
            draw();
          }),
          h('button', { class: 'btn btn-sm', onClick: () => openSendSticker() }, '💌 Send one')),
        list,
      );
      function draw() {
        const me = store.me.id;
        const items = store.list('mail').filter((m) => (tab === 'in' ? m.to === me : m.from === me)).sort((a, b) => b.at - a.at);
        list.replaceChildren(...(items.length ? items.map((m) => {
          const other = store.user(tab === 'in' ? m.from : m.to);
          return h('article', { class: `card mail-card${tab === 'in' && !m.seen ? ' unseen' : ''}` },
            h('img', { class: 'mail-sticker', src: m.url, alt: 'sticker' }),
            h('div', { class: 'grow' },
              h('div', { class: 'row gap-sm' }, avatarEl(other, 24), h('b', {}, tab === 'in' ? `From ${fullName(other)}` : `To ${fullName(other)}`)),
              m.message ? h('p', { class: 'mail-msg' }, `“${m.message}”`) : null,
              h('small', { class: 'muted' }, timeAgo(m.at))),
            tab === 'in' && other ? h('button', { class: 'btn btn-sm btn-ghost', onClick: () => openSendSticker({ to: other.id }) }, '↩ Reply') : null);
        }) : [emptyState(tab === 'in' ? '📭' : '📤', tab === 'in' ? 'No stickers yet' : 'Nothing sent yet', tab === 'in' ? 'When someone sends you a sticker it lands here.' : 'Brighten someone’s day — send them a sticker!')]));
        const unseen = store.list('mail').filter((m) => m.to === me && !m.seen).map((m) => m.id);
        if (unseen.length) act('mail.seen', { ids: unseen }).catch(() => {});
      }
      draw();
      panel.on('col:mail', draw);
    },
  });
}

function showArrival(m) {
  const from = store.user(m.from);
  sfx.mail();
  const card = h('div', { class: 'mail-fly', role: 'status' },
    h('img', { src: m.url, alt: 'sticker' }),
    h('div', { class: 'mail-fly-note' }, avatarEl(from, 30),
      h('div', {}, h('b', {}, `${from?.firstName || 'Someone'} sent you a sticker!`), m.message ? h('span', {}, `“${m.message}”`) : null)));
  document.body.append(card);
  requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('in')));
  let gone = false;
  const done = () => {
    if (gone) return;
    gone = true;
    card.classList.add('out');
    setTimeout(() => card.remove(), 800);
  };
  card.addEventListener('click', () => {
    done();
    openMail();
  });
  setTimeout(done, 5000);
}

export function initMail() {
  // Don't play the arrival animation to an empty room — wait until the tab is visible again.
  const queue = [];
  const flush = () => {
    if (document.hidden) return;
    queue.splice(0).forEach((m, i) => setTimeout(() => showArrival(m), i * 1200));
  };
  on('mail:arrived', (m) => {
    queue.push(m);
    flush();
  });
  document.addEventListener('visibilitychange', flush);
}
