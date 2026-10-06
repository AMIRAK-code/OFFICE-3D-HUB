import express from 'express';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { db, persist, newId, newToken, UPLOAD_DIR } from './db.js';
import { saveDataUrlImage, MAX_UPLOAD_BYTES } from './uploads.js';
import { createHub, publicUser, pickColor } from './hub.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PASSCODE = (process.env.OFFICE_PASSCODE || '').trim();
const OFFICE_NAME = (process.env.OFFICE_NAME || 'Office Board').trim();

// Forget sign-in sessions that haven't been created in the last ~6 months.
const SESSION_TTL = 180 * 24 * 3600e3;
for (const [token, s] of Object.entries(db.sessions)) {
  if (Date.now() - s.at > SESSION_TTL || !db.users[s.userId]) delete db.sessions[token];
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e6 });
const hub = createHub(io);

app.disable('x-powered-by');
app.use(express.json({ limit: Math.ceil(MAX_UPLOAD_BYTES * 1.4) }));
app.use(express.static(path.join(ROOT, 'public')));
app.use('/vendor/three/build', express.static(path.join(ROOT, 'node_modules/three/build'), { maxAge: '7d' }));
app.use('/vendor/three/addons', express.static(path.join(ROOT, 'node_modules/three/examples/jsm'), { maxAge: '7d' }));
app.use('/uploads', express.static(UPLOAD_DIR, {
  maxAge: '30d',
  immutable: true,
  setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
}));

// ---------- helpers ----------
const cleanName = (s) => (typeof s === 'string' ? s.trim().replace(/\s+/g, ' ').slice(0, 40) : '');
const keyOf = (first, last) => `${first}|${last}`.toLocaleLowerCase('en').normalize('NFKC');

function userFromReq(req) {
  const auth = req.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const session = token && db.sessions[token];
  return session ? db.users[session.userId] : null;
}

function passcodeOk(input) {
  const a = crypto.createHash('sha256').update(String(input || '')).digest();
  const b = crypto.createHash('sha256').update(PASSCODE).digest();
  return crypto.timingSafeEqual(a, b);
}

// Very small brute-force guard for the office passcode.
const failures = new Map();
function tooManyFailures(ip) {
  const f = failures.get(ip);
  if (!f || Date.now() - f.since > 60e3) return false;
  return f.count >= 8;
}
function recordFailure(ip) {
  const f = failures.get(ip);
  if (!f || Date.now() - f.since > 60e3) failures.set(ip, { count: 1, since: Date.now() });
  else f.count++;
}

// ---------- API ----------
app.get('/api/config', (req, res) => {
  res.json({ officeName: OFFICE_NAME, passcodeRequired: !!PASSCODE });
});

app.post('/api/login', (req, res) => {
  const { firstName, lastName, passcode } = req.body || {};
  if (PASSCODE) {
    if (tooManyFailures(req.ip)) return res.status(429).json({ error: 'Too many attempts — wait a minute and try again.' });
    if (!passcodeOk(passcode)) {
      recordFailure(req.ip);
      return res.status(401).json({ error: 'Wrong office passcode' });
    }
  }
  const first = cleanName(firstName);
  const last = cleanName(lastName);
  if (!first || !last) return res.status(400).json({ error: 'Please enter both your name and your surname' });

  const key = keyOf(first, last);
  let user = Object.values(db.users).find((u) => u.key === key);
  const isNew = !user;
  if (!user) {
    const now = Date.now();
    user = { id: newId(), key, firstName: first, lastName: last, avatar: null, mood: '', birthday: null, color: pickColor(key), createdAt: now, lastSeen: now };
    db.users[user.id] = user;
    hub.upsert('users', user);
  }
  const token = newToken();
  db.sessions[token] = { userId: user.id, at: Date.now() };
  persist();
  res.json({ token, user: publicUser(user), isNew });
});

app.get('/api/me', (req, res) => {
  const user = userFromReq(req);
  if (!user) return res.status(401).json({ error: 'Not signed in' });
  res.json({ user: publicUser(user) });
});

app.post('/api/logout', (req, res) => {
  const auth = req.get('authorization') || '';
  delete db.sessions[auth.replace(/^Bearer /, '')];
  persist();
  res.json({ ok: true });
});

app.post('/api/upload', (req, res) => {
  const user = userFromReq(req);
  if (!user) return res.status(401).json({ error: 'Not signed in' });
  const { kind, dataUrl, name } = req.body || {};
  if (!['avatar', 'sticker', 'photo'].includes(kind)) return res.status(400).json({ error: 'Unknown upload type' });
  let url;
  try {
    url = saveDataUrlImage(dataUrl);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  if (kind === 'avatar') {
    user.avatar = url;
    hub.upsert('users', user);
  }
  if (kind === 'sticker') {
    const sticker = { id: newId(), url, name: cleanName(name) || 'sticker', by: user.id, at: Date.now() };
    db.stickers[sticker.id] = sticker;
    hub.upsert('stickers', sticker);
    persist();
    return res.json({ url, sticker });
  }
  persist();
  res.json({ url });
});

app.use((err, req, res, next) => {
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'That image is too large (max 2.5 MB).' });
  next(err);
});

server.listen(PORT, HOST, () => {
  const lan = Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => `http://${i.address}:${PORT}`);
  console.log(`\n  🏢 ${OFFICE_NAME} is open!\n`);
  console.log(`  Local:   http://localhost:${PORT}`);
  for (const url of lan) console.log(`  Network: ${url}`);
  console.log(PASSCODE ? '\n  🔒 Office passcode is required to enter.\n' : '\n  🔓 No office passcode set (set OFFICE_PASSCODE to require one).\n');
});
