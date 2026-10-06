// Small DOM + formatting helpers shared by every UI module.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Hyperscript-style element builder. Strings are always inserted as text, never HTML. */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value' && 'value' in el) el.value = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (dt, rate) => 1 - Math.exp(-dt * rate);

export const fullName = (u) => (u ? `${u.firstName} ${u.lastName}` : 'Someone');
export const shortName = (u) => (u ? `${u.firstName} ${u.lastName.charAt(0)}.` : 'Someone');
export const initials = (u) => (u ? `${u.firstName.charAt(0)}${u.lastName.charAt(0)}`.toUpperCase() : '?');

export function avatarEl(user, size = 32, cls = '') {
  const el = h('span', { class: `av ${cls}`, style: `--s:${size}px;--c:${user?.color || '#9a94ad'}`, title: user ? fullName(user) : '' });
  if (user?.avatar) el.append(h('img', { src: user.avatar, alt: '', draggable: 'false' }));
  else el.append(h('span', { class: 'av-ini' }, initials(user)));
  return el;
}

export function timeAgo(ts) {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const hrs = Math.round(m / 60);
  if (hrs < 24) return `${hrs} h ago`;
  const d = Math.round(hrs / 24);
  if (d < 7) return `${d} day${d > 1 ? 's' : ''} ago`;
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** Is the given {m,d} birthday celebrated today? Feb 29 birthdays party on Feb 28 in normal years. */
export function isBirthdayToday(b, now = new Date()) {
  if (!b) return false;
  const m = now.getMonth() + 1;
  const d = now.getDate();
  if (b.m === m && b.d === d) return true;
  return b.m === 2 && b.d === 29 && !isLeap(now.getFullYear()) && m === 2 && d === 28;
}

/** Days until the next occurrence of a birthday (0 = today). */
export function daysUntil(b, now = new Date()) {
  if (isBirthdayToday(b, now)) return 0;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(now.getFullYear(), b.m - 1, b.d);
  if (next < today) next = new Date(now.getFullYear() + 1, b.m - 1, b.d);
  return Math.round((next - today) / 86400000);
}

export const fmtBirthday = (b) => (b ? `${b.d} ${MONTHS[b.m - 1].slice(0, 3)}` : '');

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = src;
  });
}

export function readFile(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('Could not read file'));
    r.readAsDataURL(file);
  });
}

/** Downscale (and optionally square-crop) an image file in the browser before uploading. */
export async function resizeImage(file, { max = 512, square = false, type = 'image/png', quality = 0.9 } = {}) {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error('Please choose a PNG, JPG, WEBP or GIF image');
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    let sw = img.naturalWidth;
    let sh = img.naturalHeight;
    let sx = 0;
    let sy = 0;
    if (square) {
      const s = Math.min(sw, sh);
      sx = (sw - s) / 2;
      sy = (sh - s) / 2;
      sw = sh = s;
    }
    const scale = Math.min(1, max / Math.max(sw, sh));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(sw * scale));
    c.height = Math.max(1, Math.round(sh * scale));
    const ctx = c.getContext('2d');
    if (type === 'image/jpeg') {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
    }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
    return c.toDataURL(type, quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Opens the native file picker and resolves with the chosen file (or null). */
export function pickFile(accept = 'image/png,image/jpeg,image/webp,image/gif') {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept, style: 'display:none' });
    input.addEventListener('change', () => {
      resolve(input.files?.[0] || null);
      input.remove();
    });
    document.body.append(input);
    input.click();
  });
}

export const randomToken = () => [...crypto.getRandomValues(new Uint8Array(20))].map((b) => b.toString(16).padStart(2, '0')).join('');

export function store(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}
export function persistLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode — ignore */
  }
}

// Anonymous requests: the author keeps a secret key locally; the server only stores its hash.
const ANON_KEY = 'officeboard.anon';
export const getAnonToken = (id) => store(ANON_KEY, {})[id] || null;
export function saveAnonToken(id, token) {
  const all = store(ANON_KEY, {});
  all[id] = token;
  persistLocal(ANON_KEY, all);
}
export function removeAnonToken(id) {
  const all = store(ANON_KEY, {});
  delete all[id];
  persistLocal(ANON_KEY, all);
}

export const MOODS = ['😀', '😎', '🤓', '🥳', '😴', '🤒', '🤯', '😤', '🥰', '🤔', '😇', '🫠', '☕', '🍕', '🎧', '💻', '🏖️', '🔥', '🚀', '🧘', '🙈', '🌧️', '🌈', '🎯'];
