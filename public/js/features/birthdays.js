// Birthday board, birthday panel and the office-wide celebration.
import * as THREE from 'three';
import { store, on, act, emit } from '../net.js';
import { h, $, avatarEl, fullName, shortName, MONTHS, isBirthdayToday, daysUntil, fmtBirthday } from '../util.js';
import { openPanel, field, emptyState, busy, toast } from '../ui/kit.js';
import { room } from '../scene/room.js';
import { confettiBurst, setBalloons } from '../scene/fx.js';
import { focusOn } from '../scene/core.js';
import { sfx, playBirthdaySong, whenAudioReady, isMuted } from '../audio.js';

let celebrating = []; // users whose birthday is today
let preview = null; // { users, until }
let banner = null;
let bannerCollapsed = false;
let burstTimer = null;
let collapseTimer = null;
let sangFor = '';

function birthdayRows() {
  return store.list('users')
    .filter((u) => u.birthday)
    .map((u) => ({ user: u, days: daysUntil(u.birthday), date: fmtBirthday(u.birthday), name: shortName(u) }))
    .sort((a, b) => a.days - b.days || a.user.firstName.localeCompare(b.user.firstName));
}

const namesOf = (users) => {
  const names = users.map((u) => u.firstName);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} & ${names.at(-1)}` : names[0];
};

// ---------------------------------------------------------------- celebration
function burstAround() {
  const spots = [new THREE.Vector3(-7.5, 3.5, -6), new THREE.Vector3(0.3, 1.6, -1.2), new THREE.Vector3(6, 3, -4), new THREE.Vector3(-3, 2, 0)];
  spots.forEach((p, i) => setTimeout(() => confettiBurst(p, 140, 6.5), i * 220));
}

function singOnce(key) {
  if (sangFor === key) return;
  sangFor = key;
  whenAudioReady(() => {
    if (!isMuted() && celebrating.length) {
      sfx.party();
      setTimeout(() => playBirthdaySong(), 900);
    }
  });
}

function renderBanner() {
  if (!celebrating.length) {
    banner?.remove();
    banner = null;
    return;
  }
  const users = celebrating;
  const isMe = users.some((u) => u.id === store.me?.id);
  if (!banner) {
    banner = h('div', { class: 'bday-banner' });
    $('#fx-layer').append(banner);
    requestAnimationFrame(() => banner.classList.add('in'));
  }
  banner.classList.toggle('collapsed', bannerCollapsed);
  if (bannerCollapsed) {
    banner.replaceChildren(h('button', {
      class: 'bday-pill',
      onClick: () => {
        bannerCollapsed = false;
        renderBanner();
        burstAround();
      },
    }, '🎂 ', `${namesOf(users)}’s birthday!`));
    return;
  }
  banner.replaceChildren(
    h('button', { class: 'bday-min', 'aria-label': 'Minimise', title: 'Minimise', onClick: () => { bannerCollapsed = true; renderBanner(); } }, '–'),
    h('div', { class: 'bday-avatars' }, ...users.map((u) => h('div', { class: 'bday-av' }, avatarEl(u, 84), h('span', { class: 'hat' }, '🥳')))),
    h('h2', {}, isMe && users.length === 1 ? 'Happy Birthday to YOU! 🎉' : `Happy Birthday, ${namesOf(users)}! 🎉`),
    h('p', {}, preview ? 'This is a preview of the birthday party ✨' : isMe ? 'The whole office is celebrating you today 💛' : 'Today is a special day — leave some love! 🎈'),
    h('div', { class: 'row center gap-sm wrap' },
      h('button', { class: 'btn btn-sm', onClick: () => { sfx.party(); playBirthdaySong(); burstAround(); } }, '🎵 Sing again'),
      h('button', { class: 'btn btn-sm btn-ghost', onClick: () => emit('open', { name: 'cake' }) }, '🎂 Blow the candles'),
      ...(isMe && users.length === 1 ? [] : [h('button', { class: 'btn btn-sm btn-ghost', onClick: () => emit('open', { name: 'send', to: users.find((u) => u.id !== store.me.id)?.id }) }, '💌 Send a sticker')])),
  );
}

function setCelebration(users) {
  const before = celebrating.map((u) => u.id).join(',');
  celebrating = users;
  const after = users.map((u) => u.id).join(',');
  const on = users.length > 0;
  room.cake.show(on);
  room.fairy.party(on);
  setBalloons(on);
  clearInterval(burstTimer);
  if (on) {
    burstTimer = setInterval(() => {
      if (!bannerCollapsed) confettiBurst(new THREE.Vector3((Math.random() - 0.5) * 12, 2.5, -3 - Math.random() * 3), 90, 5.5);
    }, 9000);
    if (before !== after) {
      bannerCollapsed = false;
      burstAround();
      singOnce(`${new Date().toDateString()}:${after}`);
      // Tuck the big banner away after a while so it doesn't block the office.
      clearTimeout(collapseTimer);
      collapseTimer = setTimeout(() => {
        bannerCollapsed = true;
        renderBanner();
      }, 20e3);
    }
  }
  renderBanner();
  drawBoard();
}

export function refreshBirthdays() {
  if (preview && Date.now() > preview.until) preview = null;
  const today = preview ? preview.users : store.list('users').filter((u) => isBirthdayToday(u.birthday));
  setCelebration(today);
}

function drawBoard() {
  const rows = birthdayRows().slice(0, 6).map((r) => ({ date: r.date, name: r.name, days: r.days }));
  room.birthdayBoard.draw(rows, celebrating.length > 0);
}

export function previewCelebration() {
  preview = { users: [store.me], until: Date.now() + 30e3 };
  sangFor = '';
  refreshBirthdays();
  setTimeout(refreshBirthdays, 30.5e3);
}

/** Blow out the candles (clicking the cake). */
export function blowCandles() {
  if (!celebrating.length) return;
  focusOn('cake');
  if (room.cake.blowOut()) {
    sfx.blow();
    setTimeout(() => {
      confettiBurst(new THREE.Vector3(0.3, 2.1, -1.15), 220, 7);
      sfx.party();
      toast('Make a wish! ✨', { icon: '🎂' });
    }, 500);
  }
  setTimeout(() => emit('focus:home'), 2600);
}

// ---------------------------------------------------------------- panel
export function openBirthdays() {
  room.birthdayBoard.flutter();
  sfx.pop();
  openPanel({
    key: 'birthdays',
    title: 'Birthday board',
    subtitle: 'Never miss a colleague’s special day',
    icon: '🎂',
    accent: '#f03e83',
    focus: 'birthdays',
    render(body, panel) {
      const mine = h('section', { class: 'card bday-mine' });
      const today = h('div');
      const upcoming = h('div', { class: 'cards' });
      const months = h('div', { class: 'month-grid' });

      function drawMine() {
        const b = store.me.birthday;
        const month = h('select', { class: 'input', 'aria-label': 'Month' }, h('option', { value: '' }, 'Month'), ...MONTHS.map((m, i) => h('option', { value: String(i + 1) }, m)));
        const day = h('select', { class: 'input', 'aria-label': 'Day' }, h('option', { value: '' }, 'Day'), ...Array.from({ length: 31 }, (_, i) => h('option', { value: String(i + 1) }, String(i + 1))));
        if (b) {
          month.value = String(b.m);
          day.value = String(b.d);
        }
        const save = h('button', { class: 'btn', type: 'button' }, b ? 'Update' : 'Save');
        save.addEventListener('click', () => busy(save, async () => {
          if (!month.value || !day.value) throw new Error('Pick a month and a day');
          await act('profile.update', { birthday: { m: Number(month.value), d: Number(day.value) } });
          sfx.chime();
          toast('Birthday saved — we’ll celebrate! 🎈', { icon: '🎂' });
        }));
        const remove = b ? h('button', { class: 'btn btn-ghost', type: 'button' }, 'Remove') : null;
        remove?.addEventListener('click', () => busy(remove, () => act('profile.update', { birthday: null })));
        mine.replaceChildren(
          h('div', { class: 'row gap-sm' }, avatarEl(store.me, 40), h('div', {}, h('b', {}, 'Your birthday'), h('p', { class: 'small muted' }, b ? `${fmtBirthday(b)} · ${daysUntil(b) === 0 ? 'that’s today! 🎉' : `in ${daysUntil(b)} days`}` : 'Only the day & month — no age needed 😉'))),
          h('div', { class: 'row gap-sm wrap' }, field('Month', month), field('Day', day), h('div', { class: 'row gap-sm end-self' }, save, remove)),
        );
      }

      function drawLists() {
        const rows = birthdayRows();
        const todays = rows.filter((r) => r.days === 0);
        const other = todays.find((r) => r.user.id !== store.me.id);
        today.replaceChildren(...(todays.length ? [h('div', { class: 'bday-today' },
          h('div', { class: 'bday-today-avs' }, ...todays.map((r) => avatarEl(r.user, 48))),
          h('div', { class: 'grow' }, h('b', {}, `🎉 Today: ${namesOf(todays.map((r) => r.user))}`), h('p', { class: 'small' }, other ? 'Send a sticker or blow out the candles on the cake!' : 'Blow out the candles on the cake — make a wish!')),
          other ? h('button', { class: 'btn btn-sm', title: `Send ${other.user.firstName} a sticker`, onClick: () => emit('open', { name: 'send', to: other.user.id }) }, '💌') : null)] : []));
        const next = rows.filter((r) => r.days > 0).slice(0, 8);
        upcoming.replaceChildren(...(next.length ? next.map((r) => h('div', { class: 'bday-row' },
          avatarEl(r.user, 34),
          h('div', { class: 'grow' }, h('b', {}, fullName(r.user)), h('small', { class: 'muted' }, r.date)),
          h('span', { class: `chip${r.days <= 7 ? ' hot' : ''}` }, r.days === 1 ? 'tomorrow' : `in ${r.days} days`))) : [emptyState('📅', 'No upcoming birthdays', 'Ask your colleagues to add theirs!')]));
        const byMonth = MONTHS.map(() => []);
        for (const r of rows) byMonth[r.user.birthday.m - 1].push(r.user);
        const nowM = new Date().getMonth();
        months.replaceChildren(...MONTHS.map((m, i) => h('div', { class: `month${i === nowM ? ' now' : ''}` },
          h('b', {}, m.slice(0, 3)),
          h('div', { class: 'month-avs' }, ...byMonth[i].sort((a, b) => a.birthday.d - b.birthday.d).map((u) => h('span', { title: `${fullName(u)} · ${fmtBirthday(u.birthday)}` }, avatarEl(u, 24)))))));
      }

      body.append(
        mine,
        today,
        h('h3', { class: 'section-title' }, 'Coming up'),
        upcoming,
        h('h3', { class: 'section-title' }, 'All year'),
        months,
        h('div', { class: 'row center' }, h('button', { class: 'btn btn-ghost btn-sm', onClick: () => { previewCelebration(); panel.close(); } }, '✨ Preview a birthday party')),
      );
      drawMine();
      drawLists();
      panel.on('me', drawMine);
      panel.on('col:users', drawLists);
    },
  });
}

export function initBirthdays() {
  on('col:users', refreshBirthdays);
  // Re-check around midnight and every few minutes.
  let day = new Date().toDateString();
  setInterval(() => {
    const d = new Date().toDateString();
    if (d !== day) {
      day = d;
      sangFor = '';
    }
    refreshBirthdays();
  }, 60e3);
  document.fonts?.ready.then(drawBoard);
}
