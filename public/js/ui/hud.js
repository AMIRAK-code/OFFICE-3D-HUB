// Heads-up display: top bar, dock, profile/mood menu and the People panel.
import { store, on, act, api, auth, emit } from '../net.js';
import { h, $, avatarEl, fullName, timeAgo, MOODS, pickFile, resizeImage, fmtBirthday } from '../util.js';
import { openPanel, openPopover, closePopover, menuItem, toast, toastError, emptyState } from './kit.js';
import { sfx, isMuted, setMuted } from '../audio.js';
import { unreadMail } from '../features/mail.js';
import { KINDS } from '../features/games.js';

const DOCK = [
  ['radio', '📻', 'Radio', '#ff7a2f'],
  ['tv', '📺', 'Watchlist', '#228be6'],
  ['books', '📚', 'Books', '#d9480f'],
  ['basket', '🧺', 'Giveaways', '#0f8a4a'],
  ['birthdays', '🎂', 'Birthdays', '#f03e83'],
  ['requests', '📌', 'Requests', '#f59f00'],
  ['games', '🕹️', 'Games', '#7950f2'],
  ['stickers', '🎨', 'Stickers', '#0ca678'],
];

let els = {};

export async function changeAvatar() {
  const file = await pickFile('image/png,image/jpeg,image/webp');
  if (!file) return;
  try {
    const dataUrl = await resizeImage(file, { max: 256, square: true, type: 'image/jpeg', quality: 0.88 });
    await api.upload('avatar', dataUrl);
    sfx.pop();
    toast('Looking good! Avatar updated.', { icon: '📸' });
  } catch (err) {
    toastError(err);
  }
}

function moodPicker() {
  return h('div', { class: 'mood-grid' }, ...MOODS.map((m) => h('button', {
    class: `mood-btn${store.me.mood === m ? ' on' : ''}`,
    'aria-label': `Set mood ${m}`,
    onClick: () => {
      closePopover();
      sfx.pop();
      act('profile.update', { mood: store.me.mood === m ? '' : m }).catch(toastError);
    },
  }, m)));
}

function openMeMenu() {
  const me = store.me;
  openPopover(els.me, [
    h('div', { class: 'menu-head' }, avatarEl(me, 40), h('div', {}, h('b', {}, fullName(me)), h('small', {}, me.birthday ? `🎂 ${fmtBirthday(me.birthday)}` : 'No birthday set yet'))),
    h('div', { class: 'menu-note' }, 'How are you feeling today?'),
    moodPicker(),
    me.mood ? menuItem('🫥', 'Clear my mood', () => act('profile.update', { mood: '' }).catch(toastError)) : null,
    menuItem('📸', 'Change my avatar', changeAvatar),
    menuItem('🎂', me.birthday ? 'Edit my birthday' : 'Add my birthday', () => emit('open', { name: 'birthdays' })),
    menuItem('✉️', 'Sticker mail', () => emit('open', { name: 'mail' })),
    menuItem('🚪', 'Log out', async () => {
      try {
        await api.logout();
      } catch {
        /* ignore */
      }
      auth.clear();
      location.reload();
    }, { danger: true }),
  ], { className: 'menu me-menu' });
}

function drawMe() {
  const me = store.me;
  if (!me || !els.me) return;
  els.me.replaceChildren(avatarEl(me, 34), h('span', { class: 'me-name' }, me.firstName), h('span', { class: 'me-mood', title: 'Set your mood' }, me.mood || '🙂'));
}

function drawOnline() {
  const online = store.list('users').filter((u) => store.online.has(u.id));
  els.stack.replaceChildren(...online.slice(0, 5).map((u) => avatarEl(u, 28, 'online')));
  els.count.textContent = `${online.length} online`;
}

function drawMail() {
  const n = unreadMail();
  els.mailBadge.hidden = !n;
  els.mailBadge.textContent = n > 9 ? '9+' : String(n);
}

function drawSound() {
  els.sound.textContent = isMuted() ? '🔇' : '🔊';
  els.sound.title = isMuted() ? 'Sound off' : 'Sound on';
}

function tickClock() {
  const d = new Date();
  els.clock.textContent = d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }) + ' · ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function setDockActive(name) {
  for (const b of els.dock?.querySelectorAll('[data-open]') || []) if (b.dataset.open !== 'stickers') b.classList.toggle('active', b.dataset.open === name);
}

export function initHud(config) {
  const hud = $('#hud');
  els.me = h('button', { class: 'glass me-chip', 'aria-label': 'Your profile and mood', onClick: openMeMenu });
  els.stack = h('span', { class: 'stack' });
  els.count = h('span', { class: 'online-count' });
  els.mailBadge = h('span', { class: 'badge', hidden: true });
  els.sound = h('button', {
    class: 'glass icon-btn',
    onClick: () => {
      setMuted(!isMuted());
      drawSound();
      sfx.click();
    },
  });
  els.clock = h('small', { class: 'clock' });
  els.conn = h('span', { class: 'conn', title: 'Connected' });
  els.dock = h('nav', { class: 'dock glass', 'aria-label': 'Office features' }, ...DOCK.map(([name, icon, label, accent]) => h('button', {
    class: 'dock-btn',
    dataset: { open: name },
    style: `--accent:${accent}`,
    onClick: () => emit('open', { name }),
  }, h('span', { class: 'dock-ic' }, icon), h('small', {}, label), h('span', { class: 'dock-badge', hidden: true }))));

  hud.replaceChildren(
    h('header', { class: 'topbar' },
      h('div', { class: 'brand glass' }, h('span', { class: 'logo' }, '🏢'), h('div', {}, h('b', {}, config.officeName), els.clock), els.conn),
      h('div', { class: 'top-right' },
        h('button', { class: 'glass people-btn', 'aria-label': 'People', onClick: () => emit('open', { name: 'people' }) }, els.stack, els.count),
        h('button', { class: 'glass icon-btn', 'aria-label': 'Sticker mail', title: 'Sticker mail', onClick: () => emit('open', { name: 'mail' }) }, '📬', els.mailBadge),
        els.sound,
        els.me)),
    els.dock,
  );
  hud.classList.remove('hidden');
  drawSound();
  tickClock();
  setInterval(tickClock, 15e3);

  on('me', drawMe);
  on('presence', drawOnline);
  on('col:users', () => {
    drawOnline();
    drawMe();
  });
  on('col:mail', drawMail);
  on('connection', (ok) => {
    els.conn.classList.toggle('off', !ok);
    els.conn.title = ok ? 'Connected' : 'Reconnecting…';
    if (!ok) toast('Connection lost — reconnecting…', { icon: '📡', type: 'error' });
  });
}

export function setDockBadge(name, value) {
  const b = els.dock?.querySelector(`[data-open="${name}"] .dock-badge`);
  if (!b) return;
  b.hidden = !value;
  b.textContent = value > 99 ? '99+' : String(value || '');
}

// ---------------------------------------------------------------- people panel
export function openPeople() {
  openPanel({
    key: 'people',
    title: 'People',
    subtitle: 'Everyone on the office board',
    icon: '👥',
    accent: '#4c6ef5',
    render(body, panel) {
      const search = h('input', { class: 'input input-sm', type: 'search', placeholder: 'Search people…', 'aria-label': 'Search people' });
      const list = h('div', { class: 'people-list' });
      search.addEventListener('input', () => draw());
      body.append(search, list);
      function draw() {
        const q = search.value.trim().toLowerCase();
        const users = store.list('users')
          .filter((u) => !q || fullName(u).toLowerCase().includes(q))
          .sort((a, b) => Number(store.online.has(b.id)) - Number(store.online.has(a.id)) || a.firstName.localeCompare(b.firstName));
        list.replaceChildren(...(users.length ? users.map((u) => {
          const isMe = u.id === store.me.id;
          const online = store.online.has(u.id);
          return h('div', { class: 'person' },
            avatarEl(u, 42, online ? 'online' : ''),
            h('div', { class: 'grow' },
              h('b', {}, fullName(u), isMe ? h('span', { class: 'muted' }, ' (you)') : null, u.mood ? h('span', { class: 'mood' }, ` ${u.mood}`) : null),
              h('small', { class: 'muted' }, online ? '● online now' : `seen ${timeAgo(u.lastSeen || u.createdAt)}`, u.birthday ? ` · 🎂 ${fmtBirthday(u.birthday)}` : '')),
            isMe ? null : h('div', { class: 'row gap-xs' },
              h('button', { class: 'icon-btn-sm', title: `Send ${u.firstName} a sticker`, 'aria-label': `Send ${u.firstName} a sticker`, onClick: () => emit('open', { name: 'send', to: u.id }) }, '💌'),
              h('button', {
                class: 'icon-btn-sm',
                title: `Invite ${u.firstName} to a game`,
                'aria-label': `Invite ${u.firstName} to a game`,
                onClick: (e) => openPopover(e.currentTarget, [
                  h('div', { class: 'menu-note' }, `Play with ${u.firstName}:`),
                  ...Object.entries(KINDS).map(([k, info]) => menuItem(info.icon, info.name, () => emit('invite', { kind: k, to: u.id }))),
                ], { className: 'menu' }),
              }, '🕹️')));
        }) : [emptyState('🔍', 'Nobody found', 'Try another name.')]));
      }
      draw();
      panel.on('presence', draw);
      panel.on('col:users', draw);
    },
  });
}
