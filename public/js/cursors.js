// Live cursors. Each pointer is shared as a 3D point on whatever surface it hovers,
// then projected back onto every colleague's screen — so it lines up regardless of window size.
import * as THREE from 'three';
import { on, store, sendCursor, sendPing } from './net.js';
import { raycastAt, toScreen, onFrame } from './scene/core.js';
import { h, avatarEl, damp } from './util.js';

const root = document.getElementById('cursors');
const remotes = new Map();
const scr = { x: 0, y: 0, visible: false };
let pending = null;
let lastSent = null;
let lastAt = 0;

const ARROW = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 2.5l15.5 7.6-6.6 1.9-3 6.4z" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';

function buildTag(r, user) {
  const parts = [avatarEl(user, 22), h('span', { class: 'rc-name' }, user.firstName)];
  if (user.mood) parts.push(h('span', { class: 'rc-mood' }, user.mood));
  r.tag.replaceChildren(...parts);
  r.el.style.setProperty('--c', user.color);
}

function getRemote(id) {
  let r = remotes.get(id);
  if (r) return r;
  const user = store.user(id);
  if (!user) return null;
  const arrow = h('div', { class: 'rc-arrow' });
  arrow.innerHTML = ARROW;
  const tag = h('div', { class: 'rc-tag' });
  const el = h('div', { class: 'rc hidden' }, arrow, tag);
  root.append(el);
  r = { id, el, tag, cur: new THREE.Vector3(), target: null, shown: false };
  buildTag(r, user);
  remotes.set(id, r);
  return r;
}

function drop(id) {
  const r = remotes.get(id);
  if (!r) return;
  r.el.remove();
  remotes.delete(id);
}

export function initCursors() {
  window.addEventListener('pointermove', (e) => {
    pending = { x: e.clientX, y: e.clientY };
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => {
    pending = null;
    lastSent = null;
    sendCursor(null);
  });
  window.addEventListener('blur', () => {
    lastSent = null;
    sendCursor(null);
  });
  document.getElementById('stage').addEventListener('pointerdown', () => sendPing());

  on('cursor', ({ id, p }) => {
    if (id === store.me?.id) return;
    if (!p) {
      const r = remotes.get(id);
      if (r) r.target = null;
      return;
    }
    const r = getRemote(id);
    if (!r) return;
    if (!r.target) r.cur.set(p[0], p[1], p[2]);
    r.target = new THREE.Vector3(p[0], p[1], p[2]);
    r.lastAt = performance.now();
  });

  on('ping', ({ id }) => {
    const r = remotes.get(id);
    if (!r?.shown) return;
    const ring = h('div', { class: 'rc-ping', style: `left:${r.x}px;top:${r.y}px;--c:${store.user(id)?.color || '#fff'}` });
    root.append(ring);
    setTimeout(() => ring.remove(), 800);
  });

  on('col:users', (e) => {
    if (e.type === 'reset') {
      for (const id of [...remotes.keys()]) drop(id);
      return;
    }
    const r = e.item && remotes.get(e.item.id);
    if (r) buildTag(r, e.item);
  });
  on('presence', ({ id, online }) => {
    if (id && !online) drop(id);
  });

  onFrame((dt) => {
    // Send my own cursor ~20×/s
    const now = performance.now();
    if (pending && now - lastAt > 50) {
      const hit = raycastAt(pending.x, pending.y)[0];
      const p = hit ? [+hit.point.x.toFixed(2), +hit.point.y.toFixed(2), +hit.point.z.toFixed(2)] : null;
      if (String(p) !== String(lastSent)) {
        sendCursor(p);
        lastSent = p;
      }
      pending = null;
      lastAt = now;
    }
    // Draw everyone else's
    for (const r of remotes.values()) {
      const idle = now - (r.lastAt || 0) > 60e3;
      const show = !!r.target && !idle;
      if (show) {
        r.cur.lerp(r.target, damp(dt, 14));
        toScreen(r.cur, scr);
      }
      const visible = show && scr.visible;
      if (visible !== r.shown) {
        r.shown = visible;
        r.el.classList.toggle('hidden', !visible);
      }
      if (visible) {
        r.x = scr.x;
        r.y = scr.y;
        r.el.style.transform = `translate3d(${scr.x.toFixed(1)}px, ${scr.y.toFixed(1)}px, 0)`;
      }
    }
  });
}
