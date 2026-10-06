// Boot sequence and the glue between the 3D office, the realtime store and the UI.
import { initCore, setAttract, playIntro, setBadge, clearFocus } from './scene/core.js';
import { buildRoom, room } from './scene/room.js';
import { initWall } from './scene/wall.js';
import './scene/fx.js';
import { initCursors } from './cursors.js';
import { api, auth, connect, on, store, act } from './net.js';
import { $ } from './util.js';
import { showLogin, showWelcome, hideLogin } from './ui/login.js';
import { initHud, openPeople, setDockActive, setDockBadge } from './ui/hud.js';
import { toast, toastError, closePanel, currentPanel } from './ui/kit.js';
import { openRecs, tvSlides } from './features/recs.js';
import { openBasket } from './features/basket.js';
import { openBirthdays, initBirthdays, blowCandles } from './features/birthdays.js';
import { openRequests } from './features/requests.js';
import { openGames, joinGame } from './features/games.js';
import { toggleTray, initStickers } from './features/stickers.js';
import { openMail, openSendSticker, initMail } from './features/mail.js';
import { openWall, closeWall } from './features/wallview.js';

const PANELS = {
  radio: () => openRecs('radio'),
  tv: () => openRecs('tv'),
  books: () => openRecs('books'),
  basket: openBasket,
  birthdays: openBirthdays,
  requests: (o) => openRequests(o),
  games: (o) => openGames(o),
  people: openPeople,
  mail: openMail,
};
const ACTIONS = {
  stickers: () => toggleTray(),
  send: (o) => openSendSticker(o),
  cake: blowCandles,
  wall: () => openWall(),
  trash: () => toast('Drag your stickers (or your notes) from the wall into the trash can to throw them away', { icon: '🗑️' }),
};

function open(name, opts = {}) {
  if (!store.ready) return;
  if (ACTIONS[name]) return ACTIONS[name](opts);
  if (!PANELS[name]) return;
  closeWall();
  // Clicking the same dock button again closes the panel (unless we need to jump somewhere).
  if (currentPanel() === name && !opts.noteId && !opts.gameId) return closePanel();
  PANELS[name](opts);
}

function wireScene() {
  const basket = () => {
    const n = store.list('giveaways').filter((g) => g.status === 'available').length;
    room.basket.setCount(n);
    setBadge('basket', n);
    setDockBadge('basket', n);
  };
  const requests = () => {
    const n = store.list('requests').filter((r) => r.status === 'open').length;
    room.requestBox.setCount(n);
    setBadge('requests', n);
    setDockBadge('requests', n);
  };
  const recs = () => {
    setBadge('radio', store.cols.podcasts.size + store.cols.music.size);
    setBadge('tv', store.cols.shows.size);
    setBadge('books', store.cols.books.size);
    room.bookshelf.setCount(store.cols.books.size);
  };
  const games = () => {
    const n = store.list('games').filter((g) => g.status === 'waiting' && g.players[0] !== store.me?.id).length;
    setBadge('games', n);
    setDockBadge('games', n);
  };
  const monitor = () => room.monitor.draw(store.online.size, store.cols.users.size);
  on('col:giveaways', basket);
  on('col:requests', requests);
  on('col:podcasts', recs);
  on('col:shows', recs);
  on('col:music', recs);
  on('col:books', recs);
  on('col:games', games);
  on('presence', monitor);
  on('col:users', monitor);
  setInterval(monitor, 30e3);
  room.tv.setSlides(tvSlides);
}

function wireEvents() {
  on('open', ({ name, ...opts }) => open(name, opts));
  on('panel', (key) => setDockActive(key));
  on('focus:home', () => {
    if (!currentPanel()) clearFocus();
  });
  on('invite', async ({ kind, to }) => {
    try {
      const res = await act('game.create', { kind, invite: to });
      toast(`Invitation sent to ${store.user(to)?.firstName}!`, { icon: '🕹️' });
      openGames({ gameId: res.id });
    } catch (err) {
      toastError(err);
    }
  });
  on('toast', (t) => {
    const action = t.action?.act === 'game.join' ? { label: t.action.label, onClick: () => joinGame(t.action.payload.id) } : undefined;
    toast(t.text, { icon: t.icon, sticky: !!t.sticky, duration: 6000, action });
  });
  on('unauthorized', () => {
    auth.clear();
    location.reload();
  });
}

async function boot() {
  // Canvas textures use the web fonts, so give them a moment to load.
  await Promise.race([
    Promise.all(['700 40px Fredoka', '600 40px Fredoka', '700 30px Nunito', '800 30px Nunito'].map((f) => document.fonts.load(f))).catch(() => {}),
    new Promise((r) => setTimeout(r, 2500)),
  ]);
  initCore($('#stage'));
  buildRoom(open);
  initWall();
  $('#boot').classList.add('gone');

  const config = await api.config().catch(() => ({ officeName: 'Office Board', passcodeRequired: false }));
  document.title = config.officeName;
  room.sign.setText(config.officeName);

  let user = null;
  let welcome = null;
  let returning = true;
  if (auth.token) {
    try {
      user = (await api.me()).user;
    } catch {
      auth.clear();
    }
  }
  if (!user) {
    setAttract(true);
    const res = await showLogin(config);
    user = res.user;
    returning = !res.isNew;
    if (res.isNew || !user.avatar) welcome = await showWelcome(user);
    hideLogin();
    setAttract(false);
    playIntro();
  }

  initHud(config);
  initCursors();
  initStickers();
  initMail();
  initBirthdays();
  wireScene();
  wireEvents();
  on('ready', () => {
    if (welcome?.birthday) act('profile.update', { birthday: welcome.birthday }).catch(() => {});
    toast(returning ? `Welcome back, ${store.me.firstName}! 👋` : `Welcome to the office, ${store.me.firstName}! Drag a sticker onto the wall to say hi 🎨`, { icon: '🏢', duration: 6000 });
  });
  connect();
}

boot().catch((err) => {
  console.error(err);
  $('#boot')?.classList.add('gone');
  document.body.append(Object.assign(document.createElement('pre'), { className: 'fatal', textContent: `Something went wrong while starting the office:\n${err.message}` }));
});
