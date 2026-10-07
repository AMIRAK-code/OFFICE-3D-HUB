// Realtime hub: presence, live cursors and every board action, over Socket.IO.
import { db, persist, newId, sha256 } from './db.js';
import { isUploadUrl } from './uploads.js';
import * as games from './games.js';

const { UserError } = games;

const PALETTE = ['#ff6b6b', '#ff922b', '#f59f00', '#40c057', '#12b886', '#15aabf', '#228be6', '#4c6ef5', '#7950f2', '#be4bdb', '#e64980', '#fd7e14'];
const NOTE_COLORS = ['#ffe66d', '#ffd6a5', '#caffbf', '#9bf6ff', '#ffc6ff', '#fdffb6'];
const ANON_COLORS = ['#d0bfff', '#b8c0ff', '#c8d6e5'];
const MAX_WALL_ITEMS = 600;
export const MEMO_COLORS = ['#ffe66d', '#ffd6a5', '#caffbf', '#9bf6ff', '#ffc6ff', '#ffadad', '#e9ecef'];
const REC_COLS = ['podcasts', 'music', 'shows', 'books', 'places'];
const PLACE_KINDS = ['restaurant', 'cafe', 'shop', 'bar', 'other'];
const LOOKS_LIKE_URL = /^(https?:\/\/|www\.|maps\.app\.goo\.gl|goo\.gl\/|(?:[\w-]+\.)?google\.[a-z.]+\/maps)/i;
const MAX_COMMENTS = 300;
const JUKEBOX_TRACKS = 5;

export const pickColor = (key) => PALETTE[parseInt(sha256(key).slice(0, 8), 16) % PALETTE.length];

// Admins can remove anyone's stickers and wall notes. Matched on the full name (not just
// the first name) so a new colleague called "Amir" can't take over. Override with
// OFFICE_ADMINS="Amir Akbari, Another Person".
const ADMIN_KEYS = new Set(
  (process.env.OFFICE_ADMINS ?? 'Amir Akbari')
    .split(',')
    .map((n) => n.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .map((n) => {
      const [first, ...rest] = n.split(' ');
      return `${first}|${rest.join(' ')}`.toLocaleLowerCase('en').normalize('NFKC');
    }),
);
export const isAdmin = (u) => !!u && ADMIN_KEYS.has(u.key);

export function publicUser(u) {
  const { id, firstName, lastName, avatar, mood, birthday, color, createdAt, lastSeen } = u;
  return { id, firstName, lastName, avatar, mood, birthday, color, createdAt, lastSeen, admin: isAdmin(u) };
}

const VIEWS = {
  users: publicUser,
  requests: ({ tokenHash, ...rest }) => rest, // never reveal anything that could identify an anonymous author
  games: games.view,
};
const view = (col, item) => (VIEWS[col] ? VIEWS[col](item) : item);

// ---------- input validation ----------
function str(v, max, required = false, label = 'This field') {
  const s = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
  if (required && !s) throw new UserError(`${label} is required`);
  return s.slice(0, max);
}
function text(v, max, required = false, label = 'Text') {
  const s = typeof v === 'string' ? v.trim().replace(/\n{3,}/g, '\n\n') : '';
  if (required && !s) throw new UserError(`${label} is required`);
  return s.slice(0, max);
}
function link(v) {
  const s = str(v, 500);
  if (!s) return '';
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error();
    return u.toString();
  } catch {
    throw new UserError('That link does not look right');
  }
}
const num = (v, min, max, def) => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def);
const unit = (v, def = 0.5) => num(v, 0, 1, def);
const oneOf = (v, list, def) => (list.includes(v) ? v : def);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
function birthday(b) {
  if (b === null) return null;
  const m = Number(b?.m);
  const d = Number(b?.d);
  const days = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (!Number.isInteger(m) || m < 1 || m > 12 || !Number.isInteger(d) || d < 1 || d > days[m - 1]) throw new UserError('Pick a valid date');
  return { m, d };
}
function find(col, id) {
  const item = db[col][id];
  if (!item) throw new UserError('That item no longer exists');
  return item;
}
function own(col, id, me, field = 'by') {
  const item = find(col, id);
  if (item[field] !== me.id) throw new UserError('Only the person who added this can change it');
  return item;
}
function toggle(list, v) {
  const i = list.indexOf(v);
  if (i >= 0) list.splice(i, 1);
  else list.push(v);
}
const nextZ = () => ++db.meta.z;
function place(item, p) {
  if (p.u != null) item.u = unit(p.u, item.u);
  if (p.v != null) item.v = unit(p.v, item.v);
  if (p.rot != null) item.rot = num(p.rot, -Math.PI, Math.PI, item.rot);
  if (p.scale != null) item.scale = num(p.scale, 0.35, 3, item.scale);
  if (p.front) item.z = nextZ();
}
const wallCount = () => Object.keys(db.wall).length + Object.values(db.requests).filter((r) => r.pinned).length;
function canEditRequest(r, me, token) {
  if (r.authorId && r.authorId === me.id) return true;
  return !!(r.tokenHash && typeof token === 'string' && token.length >= 16 && sha256(token) === r.tokenHash);
}

export function createHub(io) {
  const online = new Map(); // userId -> Set<socketId>
  // The office jukebox: one shared state for everyone (kept in memory, starts playing track 1).
  const jukebox = { track: 0, playing: true, pos: 0, at: Date.now(), by: null };
  const jukeboxView = () => ({ state: { ...jukebox }, now: Date.now() });
  const live = new Map(); // gameId -> game
  const leaveTimers = new Map();

  const upsert = (col, item, room) => (room ? io.to(room) : io).emit('col:upsert', { col, item: view(col, item) });
  const remove = (col, id, room) => (room ? io.to(room) : io).emit('col:remove', { col, id });
  const toastTo = (userId, toast) => io.to(`u:${userId}`).emit('toast', toast);
  const toastOthers = (me, toast) => io.except(`u:${me.id}`).emit('toast', toast);

  function snapshot(me) {
    const cols = {};
    for (const c of ['users', 'stickers', 'wall', 'requests', ...REC_COLS, 'giveaways']) {
      cols[c] = Object.values(db[c]).map((x) => view(c, x));
    }
    cols.games = [...live.values()].map(games.view);
    cols.mail = Object.values(db.mail).filter((m) => m.to === me.id || m.from === me.id);
    return { me: publicUser(me), online: [...online.keys()], cols, jukebox: jukeboxView() };
  }

  function dropGame(g) {
    live.delete(g.id);
    remove('games', g.id);
  }

  function leaveAllGames(userId) {
    for (const g of [...live.values()]) {
      if (!g.players.includes(userId)) continue;
      if (games.leave(g, userId)) dropGame(g);
      else upsert('games', g);
    }
  }

  // Finished/abandoned tables disappear after a while.
  setInterval(() => {
    const now = Date.now();
    for (const g of [...live.values()]) {
      const idle = now - g.updatedAt;
      if ((g.status === 'done' && idle > 10 * 60e3) || (g.status === 'waiting' && idle > 60 * 60e3)) dropGame(g);
    }
  }, 60e3).unref();

  const A = {
    // ---------- profile ----------
    // ---------- jukebox ----------
    'jukebox.set'(me, p) {
      const now = Date.now();
      const elapsed = jukebox.playing ? (now - jukebox.at) / 1000 : 0;
      if ('track' in p) {
        const t = Number(p.track);
        if (!Number.isInteger(t) || t < 0 || t >= JUKEBOX_TRACKS) throw new UserError('Unknown track');
        if (t !== jukebox.track) {
          jukebox.track = t;
          jukebox.pos = 0;
          jukebox.playing = p.playing !== false; // picking a track starts it
        } else {
          jukebox.pos += elapsed;
        }
      } else {
        jukebox.pos += elapsed;
      }
      if (typeof p.playing === 'boolean') jukebox.playing = p.playing;
      jukebox.at = now;
      jukebox.by = me.id;
      io.emit('jukebox', jukeboxView());
    },

    // ---------- profile ----------
    'profile.update'(me, p) {
      if ('mood' in p) me.mood = str(p.mood, 16);
      if ('birthday' in p) me.birthday = birthday(p.birthday);
      persist();
      upsert('users', me);
    },

    // ---------- sticker library & wall ----------
    'sticker.remove'(me, { id }) {
      if (isAdmin(me)) find('stickers', id);
      else own('stickers', id, me);
      delete db.stickers[id];
      remove('stickers', id);
      for (const w of Object.values(db.wall)) {
        if (w.stickerId === id) {
          delete db.wall[w.id];
          remove('wall', w.id);
        }
      }
      persist();
    },
    'wall.add'(me, p) {
      const s = find('stickers', p.stickerId);
      if (wallCount() >= MAX_WALL_ITEMS) throw new UserError('The wall is full! Remove a few stickers first.');
      const w = { id: newId(), stickerId: s.id, url: s.url, by: me.id, u: unit(p.u), v: unit(p.v), rot: num(p.rot, -Math.PI, Math.PI, 0), scale: num(p.scale, 0.35, 3, 1), z: nextZ(), at: Date.now() };
      db.wall[w.id] = w;
      persist();
      upsert('wall', w);
      return { id: w.id };
    },
    'wall.addNote'(me, p) {
      if (wallCount() >= MAX_WALL_ITEMS) throw new UserError('The wall is full! Remove a few items first.');
      const w = {
        id: newId(),
        text: text(p.text, 200, true, 'Your note'),
        color: oneOf(p.color, MEMO_COLORS, MEMO_COLORS[0]),
        by: me.id,
        u: unit(p.u, rand(0.15, 0.85)),
        v: unit(p.v, rand(0.2, 0.8)),
        rot: num(p.rot, -Math.PI, Math.PI, rand(-0.1, 0.1)),
        scale: 1,
        z: nextZ(),
        at: Date.now(),
      };
      db.wall[w.id] = w;
      persist();
      upsert('wall', w);
      return { id: w.id };
    },
    'wall.update'(me, p) {
      const w = own('wall', p.id, me);
      place(w, p);
      persist();
      upsert('wall', w);
    },
    'wall.remove'(me, { id }) {
      if (isAdmin(me)) find('wall', id);
      else own('wall', id, me);
      delete db.wall[id];
      persist();
      remove('wall', id);
    },

    // ---------- requests (public + anonymous) ----------
    'request.add'(me, p) {
      const anonymous = !!p.anonymous;
      if (anonymous && (typeof p.token !== 'string' || p.token.length < 16)) throw new UserError('Missing anonymous key');
      if (p.pinned && wallCount() >= MAX_WALL_ITEMS) throw new UserError('The wall is full! Post it without pinning.');
      const r = {
        id: newId(),
        text: text(p.text, 280, true, 'Your request'),
        anonymous,
        authorId: anonymous ? null : me.id,
        tokenHash: anonymous ? sha256(p.token) : null,
        pinned: !!p.pinned,
        u: rand(0.08, 0.92),
        v: rand(0.12, 0.85),
        rot: rand(-0.12, 0.12),
        color: pick(anonymous ? ANON_COLORS : NOTE_COLORS),
        z: nextZ(),
        votes: [],
        status: 'open',
        at: Date.now(),
      };
      db.requests[r.id] = r;
      persist();
      upsert('requests', r);
      toastOthers(me, { icon: anonymous ? '🕶️' : '📌', text: anonymous ? 'New anonymous request on the board' : `${me.firstName} posted a request` });
      return { id: r.id };
    },
    'request.update'(me, p) {
      const r = find('requests', p.id);
      if (!canEditRequest(r, me, p.token)) throw new UserError('Only the author can move or edit this note');
      if ('pinned' in p) r.pinned = !!p.pinned;
      place(r, p);
      persist();
      upsert('requests', r);
    },
    'request.status'(me, { id, status }) {
      const r = find('requests', id);
      r.status = oneOf(status, ['open', 'done'], r.status);
      persist();
      upsert('requests', r);
    },
    'request.vote'(me, { id }) {
      const r = find('requests', id);
      toggle(r.votes, me.id);
      persist();
      upsert('requests', r);
    },
    'request.remove'(me, p) {
      const r = find('requests', p.id);
      if (!canEditRequest(r, me, p.token)) throw new UserError('Only the author can delete this note');
      delete db.requests[r.id];
      persist();
      remove('requests', r.id);
    },

    // ---------- recommendations ----------
    'podcasts.add'(me, p) {
      const item = { id: newId(), title: str(p.title, 120, true, 'Title'), host: str(p.host, 80), url: link(p.url), note: text(p.note, 400), by: me.id, likes: [], at: Date.now() };
      db.podcasts[item.id] = item;
      persist();
      upsert('podcasts', item);
      toastOthers(me, { icon: '📻', text: `${me.firstName} recommends the podcast “${item.title}”` });
      return { id: item.id };
    },
    'shows.add'(me, p) {
      const item = {
        id: newId(),
        title: str(p.title, 120, true, 'Title'),
        kind: oneOf(p.kind, ['movie', 'series'], 'movie'),
        platform: str(p.platform, 40),
        rating: Math.round(num(Number(p.rating), 0, 5, 0)),
        url: link(p.url),
        note: text(p.note, 400),
        by: me.id,
        likes: [],
        at: Date.now(),
      };
      db.shows[item.id] = item;
      persist();
      upsert('shows', item);
      toastOthers(me, { icon: '📺', text: `${me.firstName} recommends the ${item.kind} “${item.title}”` });
      return { id: item.id };
    },

    // ---------- Too Good To Go basket ----------
    'giveaways.add'(me, p) {
      const photo = p.photo == null || p.photo === '' ? null : p.photo;
      if (photo !== null && !isUploadUrl(photo)) throw new UserError('Invalid photo');
      const item = { id: newId(), title: str(p.title, 80, true, 'Item name'), desc: text(p.desc, 300), pickup: str(p.pickup, 120), photo, by: me.id, status: 'available', claimedBy: null, at: Date.now() };
      db.giveaways[item.id] = item;
      persist();
      upsert('giveaways', item);
      toastOthers(me, { icon: '🧺', text: `${me.firstName} is giving away “${item.title}”` });
      return { id: item.id };
    },
    'giveaways.claim'(me, { id }) {
      const it = find('giveaways', id);
      if (it.by === me.id) throw new UserError('That is your own item 🙂');
      if (it.status !== 'available') throw new UserError('Someone was faster — it is already taken!');
      it.status = 'reserved';
      it.claimedBy = me.id;
      persist();
      upsert('giveaways', it);
      toastTo(it.by, { icon: '🧺', text: `${me.firstName} ${me.lastName} would like your “${it.title}”` });
    },
    'giveaways.release'(me, { id }) {
      const it = find('giveaways', id);
      if (me.id !== it.claimedBy && me.id !== it.by) throw new UserError('You did not reserve this item');
      if (it.claimedBy && it.claimedBy !== me.id) toastTo(it.claimedBy, { icon: '🧺', text: `Your reservation for “${it.title}” was cancelled` });
      it.status = 'available';
      it.claimedBy = null;
      persist();
      upsert('giveaways', it);
    },
    'giveaways.done'(me, { id }) {
      const it = own('giveaways', id, me);
      it.status = 'given';
      persist();
      upsert('giveaways', it);
    },

    // ---------- sticker mail ----------
    'mail.send'(me, p) {
      const to = find('users', p.to);
      if (to.id === me.id) throw new UserError('Send it to a colleague instead 😉');
      const s = find('stickers', p.stickerId);
      const m = { id: newId(), from: me.id, to: to.id, stickerId: s.id, url: s.url, message: str(p.message, 140), at: Date.now(), seen: false };
      db.mail[m.id] = m;
      persist();
      io.to(`u:${to.id}`).to(`u:${me.id}`).emit('col:upsert', { col: 'mail', item: m });
      io.to(`u:${to.id}`).emit('mail:arrived', m);
      return { id: m.id };
    },
    'mail.seen'(me, { ids }) {
      if (!Array.isArray(ids)) return;
      for (const id of ids.slice(0, 200)) {
        const m = db.mail[id];
        if (m && m.to === me.id && !m.seen) {
          m.seen = true;
          upsert('mail', m, `u:${me.id}`);
        }
      }
      persist();
    },

    // ---------- games ----------
    'game.create'(me, { kind, invite }) {
      const g = games.create(kind, me.id);
      // One open table per person keeps the lobby tidy.
      for (const old of [...live.values()]) if (old.status === 'waiting' && old.players[0] === me.id) dropGame(old);
      live.set(g.id, g);
      upsert('games', g);
      const name = games.KINDS[kind].name;
      const action = { label: 'Join', act: 'game.join', payload: { id: g.id } };
      if (invite && db.users[invite] && invite !== me.id) toastTo(invite, { icon: '🕹️', text: `${me.firstName} invites you to play ${name}!`, action, sticky: true });
      else toastOthers(me, { icon: '🕹️', text: `${me.firstName} opened a ${name} table`, action });
      return { id: g.id };
    },
    'game.join'(me, { id }) {
      const g = live.get(id);
      if (!g) throw new UserError('That table is gone');
      games.join(g, me.id);
      upsert('games', g);
      toastTo(g.players[0], { icon: '🎮', text: `${me.firstName} joined your ${games.KINDS[g.kind].name} table!` });
      return { id: g.id };
    },
    'game.move'(me, { id, move }) {
      const g = live.get(id);
      if (!g) throw new UserError('That game is gone');
      games.move(g, me.id, move);
      upsert('games', g);
    },
    'game.rematch'(me, { id }) {
      const g = live.get(id);
      if (!g) throw new UserError('That game is gone');
      games.rematch(g, me.id);
      upsert('games', g);
    },
    'game.leave'(me, { id }) {
      const g = live.get(id);
      if (!g) return;
      if (games.leave(g, me.id)) dropGame(g);
      else upsert('games', g);
    },
  };

  A['music.add'] = (me, p) => {
    const item = { id: newId(), title: str(p.title, 120, true, 'Song or album'), artist: str(p.artist, 80), genre: str(p.genre, 40), url: link(p.url), note: text(p.note, 400), by: me.id, likes: [], comments: [], at: Date.now() };
    db.music[item.id] = item;
    persist();
    upsert('music', item);
    toastOthers(me, { icon: '🎵', text: `${me.firstName} recommends “${item.title}”${item.artist ? ` by ${item.artist}` : ''}` });
    return { id: item.id };
  };
  A['places.add'] = (me, p) => {
    const title = str(p.title, 100, true, 'Place name');
    const raw = str(p.map, 500);
    if (!raw) throw new UserError('Add a Google Maps link or the address');
    let url;
    let address = '';
    if (LOOKS_LIKE_URL.test(raw)) url = link(raw);
    else {
      // A plain address: build a Google Maps search link from it.
      address = raw.slice(0, 160);
      url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${title} ${address}`)}`;
    }
    const item = { id: newId(), title, kind: oneOf(p.kind, PLACE_KINDS, 'other'), address, rating: Math.round(num(Number(p.rating), 0, 5, 0)), url, note: text(p.note, 400), by: me.id, likes: [], comments: [], at: Date.now() };
    db.places[item.id] = item;
    persist();
    upsert('places', item);
    toastOthers(me, { icon: '📍', text: `${me.firstName} shared a place: “${item.title}”` });
    return { id: item.id };
  };
  A['books.add'] = (me, p) => {
    const item = { id: newId(), title: str(p.title, 120, true, 'Title'), author: str(p.author, 80), rating: Math.round(num(Number(p.rating), 0, 5, 0)), url: link(p.url), note: text(p.note, 400), by: me.id, likes: [], comments: [], at: Date.now() };
    db.books[item.id] = item;
    persist();
    upsert('books', item);
    toastOthers(me, { icon: '📚', text: `${me.firstName} recommends the book “${item.title}”` });
    return { id: item.id };
  };

  // Shared like / comment actions for every kind of recommendation.
  for (const col of REC_COLS) {
    A[`${col}.like`] = (me, { id }) => {
      const it = find(col, id);
      toggle(it.likes, me.id);
      persist();
      upsert(col, it);
    };
    A[`${col}.comment`] = (me, p) => {
      const it = find(col, p.id);
      it.comments ||= [];
      if (it.comments.length >= MAX_COMMENTS) throw new UserError('This thread is full');
      it.comments.push({ id: newId(), by: me.id, text: text(p.text, 300, true, 'Your comment'), at: Date.now() });
      persist();
      upsert(col, it);
      if (it.by !== me.id) toastTo(it.by, { icon: '💬', text: `${me.firstName} commented on “${it.title}”` });
    };
    A[`${col}.uncomment`] = (me, p) => {
      const it = find(col, p.id);
      const i = (it.comments || []).findIndex((c) => c.id === p.commentId);
      if (i < 0) throw new UserError('That comment is gone');
      if (it.comments[i].by !== me.id && it.by !== me.id) throw new UserError('You can only delete your own comments');
      it.comments.splice(i, 1);
      persist();
      upsert(col, it);
    };
  }
  for (const col of [...REC_COLS, 'giveaways']) {
    A[`${col}.remove`] = (me, { id }) => {
      own(col, id, me);
      delete db[col][id];
      persist();
      remove(col, id);
    };
  }

  // ---------- connection lifecycle ----------
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    const session = typeof token === 'string' ? db.sessions[token] : null;
    const user = session && db.users[session.userId];
    if (!user) return next(new Error('unauthorized'));
    socket.data.userId = user.id;
    next();
  });

  io.on('connection', (socket) => {
    const me = db.users[socket.data.userId];
    socket.join(`u:${me.id}`);
    clearTimeout(leaveTimers.get(me.id));
    leaveTimers.delete(me.id);

    let sockets = online.get(me.id);
    if (!sockets) {
      sockets = new Set();
      online.set(me.id, sockets);
      socket.broadcast.emit('presence', { id: me.id, online: true });
    }
    sockets.add(socket.id);
    me.lastSeen = Date.now();
    persist();
    socket.emit('init', snapshot(me));

    socket.on('cursor', (p) => {
      const ok = Array.isArray(p) && p.length === 3 && p.every((n) => Number.isFinite(n) && Math.abs(n) < 100);
      socket.broadcast.volatile.emit('cursor', { id: me.id, p: ok ? p : null });
    });
    socket.on('ping:click', () => socket.broadcast.volatile.emit('ping:click', { id: me.id }));

    socket.on('act', (type, payload, ack) => {
      if (typeof ack !== 'function') return;
      const handler = Object.hasOwn(A, type) ? A[type] : null;
      if (!handler) return ack({ ok: false, error: 'Unknown action' });
      try {
        const result = handler(me, payload && typeof payload === 'object' ? payload : {});
        ack({ ok: true, ...(result || {}) });
      } catch (err) {
        if (!(err instanceof UserError)) console.error(`Action ${type} failed:`, err);
        ack({ ok: false, error: err instanceof UserError ? err.message : 'Something went wrong' });
      }
    });

    socket.on('disconnect', () => {
      sockets.delete(socket.id);
      if (sockets.size) return;
      online.delete(me.id);
      me.lastSeen = Date.now();
      persist();
      io.emit('presence', { id: me.id, online: false });
      io.emit('cursor', { id: me.id, p: null });
      // Give people a moment to reload the page before forfeiting their games.
      leaveTimers.set(me.id, setTimeout(() => {
        leaveTimers.delete(me.id);
        if (!online.has(me.id)) leaveAllGames(me.id);
      }, 20e3));
    });
  });

  return { upsert, remove, online };
}
