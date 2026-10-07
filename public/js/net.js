// Socket connection, the shared client-side store and a tiny event bus.

const TOKEN_KEY = 'officeboard.token';

export const auth = {
  get token() {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* ignore */
    }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  },
};

async function call(method, url, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`;
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status });
  return data;
}

export const api = {
  config: () => call('GET', '/api/config'),
  login: (body) => call('POST', '/api/login', body),
  me: () => call('GET', '/api/me'),
  logout: () => call('POST', '/api/logout'),
  upload: (kind, dataUrl, name) => call('POST', '/api/upload', { kind, dataUrl, name }),
};

// ---------- event bus ----------
const listeners = new Map();
export function on(evt, fn) {
  let set = listeners.get(evt);
  if (!set) listeners.set(evt, (set = new Set()));
  set.add(fn);
  return () => set.delete(fn);
}
export function emit(evt, data) {
  for (const fn of listeners.get(evt) || []) {
    try {
      fn(data);
    } catch (err) {
      console.error(`Listener for ${evt} failed`, err);
    }
  }
}

// ---------- store ----------
const COLS = ['users', 'stickers', 'wall', 'requests', 'podcasts', 'music', 'shows', 'books', 'places', 'giveaways', 'games', 'mail'];

export const store = {
  me: null,
  ready: false,
  jukebox: null, // { track, playing, pos, at (server time), by }
  clockOffset: 0, // server time minus this device's time
  online: new Set(),
  cols: Object.fromEntries(COLS.map((c) => [c, new Map()])),
  user(id) {
    return this.cols.users.get(id);
  },
  list(col) {
    return [...this.cols[col].values()];
  },
};

let socket = null;

function setJukebox({ state, now }) {
  store.clockOffset = now - Date.now();
  store.jukebox = state;
  emit('jukebox', state);
}

export function connect() {
  socket = window.io({ auth: { token: auth.token }, transports: ['websocket', 'polling'] });

  socket.on('connect_error', (err) => {
    if (err.message === 'unauthorized') emit('unauthorized');
  });
  socket.on('connect', () => emit('connection', true));
  socket.on('disconnect', () => emit('connection', false));

  socket.on('init', (data) => {
    store.me = data.me;
    store.online = new Set(data.online);
    store.online.add(data.me.id);
    for (const c of COLS) store.cols[c] = new Map((data.cols[c] || []).map((i) => [i.id, i]));
    if (data.jukebox) setJukebox(data.jukebox);
    const first = !store.ready;
    store.ready = true;
    if (first) emit('ready');
    emit('me', store.me);
    emit('presence', {});
    for (const c of COLS) emit(`col:${c}`, { type: 'reset' });
  });

  socket.on('col:upsert', ({ col, item }) => {
    const map = store.cols[col];
    if (!map) return;
    const prev = map.get(item.id);
    map.set(item.id, item);
    if (col === 'users' && item.id === store.me?.id) {
      store.me = item;
      emit('me', item);
    }
    emit(`col:${col}`, { type: prev ? 'update' : 'add', item, prev });
  });

  socket.on('col:remove', ({ col, id }) => {
    const map = store.cols[col];
    if (!map) return;
    const prev = map.get(id);
    map.delete(id);
    emit(`col:${col}`, { type: 'remove', id, prev });
  });

  socket.on('presence', ({ id, online }) => {
    if (online) store.online.add(id);
    else store.online.delete(id);
    emit('presence', { id, online });
  });

  socket.on('jukebox', (d) => setJukebox(d));
  socket.on('cursor', (d) => emit('cursor', d));
  socket.on('ping:click', (d) => emit('ping', d));
  socket.on('toast', (t) => emit('toast', t));
  socket.on('mail:arrived', (m) => emit('mail:arrived', m));
}

/** Perform a server action. Resolves with the server's reply or rejects with a friendly message. */
export function act(type, payload = {}) {
  return new Promise((resolve, reject) => {
    if (!socket?.connected) return reject(new Error('You are offline — reconnecting…'));
    socket.timeout(10000).emit('act', type, payload, (err, res) => {
      if (err) return reject(new Error('The server did not respond — check your connection'));
      if (!res?.ok) return reject(new Error(res?.error || 'Something went wrong'));
      resolve(res);
    });
  });
}

export function sendCursor(p) {
  if (socket?.connected) socket.volatile.emit('cursor', p);
}

export function sendPing() {
  if (socket?.connected) socket.volatile.emit('ping:click');
}
