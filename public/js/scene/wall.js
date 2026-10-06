// Stickers and pinned request notes on the corkboard: rendering, dragging, menus, live sync.
import * as THREE from 'three';
import { onFrame, delegates, raycastAt, getRay, focusPoint, renderer, FX_LAYER } from './core.js';
import { room, BOARD } from './room.js';
import * as T from './textures.js';
import { store, on, act, emit } from '../net.js';
import { h, clamp, damp, loadImage, shortName, fullName, timeAgo, avatarEl, getAnonToken, removeAnonToken } from '../util.js';
import { openPopover, menuItem, toastError, confirmDialog } from '../ui/kit.js';
import { sfx } from '../audio.js';

const items = new Map();
const unitPlane = new THREE.PlaneGeometry(1, 1);
const pinGeo = new THREE.SphereGeometry(0.055, 14, 10);
const pinMat = new THREE.MeshStandardMaterial({ color: '#e03131', roughness: 0.25, metalness: 0.1 });
const texCache = new Map();
const STICKER_SIZE = 1.5;
const NOTE_SIZE = 1.2;
let hovered = null;
let dragging = null;
let lastSend = 0;

function stickerTexture(url) {
  if (!texCache.has(url)) {
    texCache.set(url, loadImage(url).then((img) => {
      const c = T.stickerCanvas(img, 512);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      return { tex, aspect: c.width / c.height };
    }).catch(() => null));
  }
  return texCache.get(url);
}

const ownsSticker = (w) => w.by === store.me?.id;
const ownsNote = (r) => (r.authorId && r.authorId === store.me?.id) || !!getAnonToken(r.id);
const canEdit = (it) => (it.type === 'sticker' ? ownsSticker(it.data) : ownsNote(it.data));
const toLocal = (u, v) => ({ x: (u - 0.5) * BOARD.w, y: (v - 0.5) * BOARD.h });
const toUV = (x, y) => ({ u: clamp(x / BOARD.w + 0.5, 0, 1), v: clamp(y / BOARD.h + 0.5, 0, 1) });

// ---------------------------------------------------------------- notes
function noteSignature(r) {
  const author = r.authorId ? store.user(r.authorId) : null;
  return [r.text, r.color, r.status, r.votes.length, r.anonymous, author ? shortName(author) : ''].join('|');
}

function drawNote(it) {
  const r = it.data;
  const author = r.authorId ? store.user(r.authorId) : null;
  it.sig = noteSignature(r);
  it.tex.userData.redraw((ctx, w, hh) => {
    const pad = 26;
    const fold = 34;
    ctx.save();
    ctx.shadowColor = 'rgba(60,40,10,0.38)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 9;
    ctx.fillStyle = r.color;
    ctx.beginPath();
    ctx.moveTo(pad, pad);
    ctx.lineTo(w - pad, pad);
    ctx.lineTo(w - pad, hh - pad - fold);
    ctx.lineTo(w - pad - fold, hh - pad);
    ctx.lineTo(pad, hh - pad);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    const g = ctx.createLinearGradient(0, pad, 0, hh - pad);
    g.addColorStop(0, 'rgba(255,255,255,0.35)');
    g.addColorStop(0.3, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.05)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.13)';
    ctx.beginPath();
    ctx.moveTo(w - pad - fold, hh - pad);
    ctx.lineTo(w - pad, hh - pad - fold);
    ctx.lineTo(w - pad - fold, hh - pad - fold);
    ctx.closePath();
    ctx.fill();

    ctx.font = `800 21px ${T.BODY_FONT}`;
    ctx.fillStyle = 'rgba(43,33,64,0.55)';
    ctx.fillText(r.anonymous ? '🕶️ ANONYMOUS' : '📢 REQUEST', pad + 22, pad + 46);
    ctx.fillStyle = '#2b2140';
    const { lines, size } = T.fitText(ctx, r.text, { maxWidth: w - pad * 2 - 44, maxLines: 6, start: 40, min: 20, weight: 600, family: T.FONT });
    lines.forEach((ln, i) => ctx.fillText(ln, pad + 22, pad + 96 + i * (size + 7)));
    ctx.font = `700 22px ${T.BODY_FONT}`;
    ctx.fillStyle = 'rgba(43,33,64,0.7)';
    ctx.fillText(r.anonymous ? '— anonymous' : `— ${shortName(author)}`, pad + 22, hh - pad - 22);
    ctx.textAlign = 'right';
    ctx.fillText(`👍 ${r.votes.length}`, w - pad - fold - 8, hh - pad - 22);
    ctx.textAlign = 'left';
    if (r.status === 'done') {
      ctx.save();
      ctx.translate(w / 2, hh / 2);
      ctx.rotate(-0.35);
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = '#2b8a3e';
      ctx.lineWidth = 8;
      T.roundRect(ctx, -125, -44, 250, 88, 14);
      ctx.stroke();
      ctx.fillStyle = '#2b8a3e';
      ctx.font = `700 54px ${T.FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('DONE ✓', 0, 19);
      ctx.restore();
    }
  });
}

// ---------------------------------------------------------------- items
function setTarget(it, d) {
  const p = toLocal(d.u, d.v);
  it.target = { x: p.x, y: p.y, rot: d.rot || 0, scale: d.scale || 1 };
  const order = 10 + (d.z || 0);
  it.obj.traverse((o) => {
    o.renderOrder = order;
  });
}

function createItem(type, data) {
  const it = { key: `${type}:${data.id}`, type, id: data.id, data, aspect: 1, appear: 0, hover: 0, flash: 0, loaded: false, removing: 0 };
  if (type === 'sticker') {
    it.mat = new THREE.MeshStandardMaterial({ transparent: true, depthWrite: false, roughness: 0.55, opacity: 0 });
    it.obj = new THREE.Mesh(unitPlane, it.mat);
    stickerTexture(data.url).then((r) => {
      if (!r || it.disposed) return;
      it.mat.map = r.tex;
      it.mat.needsUpdate = true;
      it.aspect = r.aspect;
      it.loaded = true;
    });
  } else {
    it.tex = T.canvasTexture(400, 400);
    it.mat = new THREE.MeshStandardMaterial({ map: it.tex, transparent: true, depthWrite: false, roughness: 0.85, opacity: 0 });
    const g = new THREE.Group();
    const paper = new THREE.Mesh(unitPlane, it.mat);
    const pin = new THREE.Mesh(pinGeo, pinMat);
    pin.position.set(0, 0.37, 0.05);
    pin.castShadow = true;
    g.add(paper, pin);
    it.obj = g;
    it.loaded = true;
    drawNote(it);
  }
  it.obj.userData.wallItem = it;
  setTarget(it, data);
  it.cur = { ...it.target };
  room.board.items.add(it.obj);
  items.set(it.key, it);
  return it;
}

function upsertItem(type, data) {
  const key = `${type}:${data.id}`;
  let it = items.get(key);
  if (!it) {
    it = createItem(type, data);
    if (store.ready) setTimeout(() => sfx.slap(), 120);
    return;
  }
  it.data = data;
  it.removing = 0;
  if (dragging?.it !== it) setTarget(it, data);
  if (type === 'note' && it.sig !== noteSignature(data)) drawNote(it);
}

function removeItem(key) {
  const it = items.get(key);
  if (!it || it.removing) return;
  it.removing = 1;
  if (hovered === it) hovered = null;
}

function disposeItem(it) {
  it.disposed = true;
  room.board.items.remove(it.obj);
  it.mat.dispose();
  it.tex?.dispose();
  items.delete(it.key);
}

function syncAll() {
  const want = new Set();
  for (const w of store.list('wall')) {
    want.add(`sticker:${w.id}`);
    upsertItem('sticker', w);
  }
  for (const r of store.list('requests')) {
    if (!r.pinned) continue;
    want.add(`note:${r.id}`);
    upsertItem('note', r);
  }
  for (const key of items.keys()) if (!want.has(key)) removeItem(key);
}

// ---------------------------------------------------------------- dragging & menus
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -(BOARD.z + 0.02));
const tmp = new THREE.Vector3();
function boardPoint(clientX, clientY) {
  raycastAt(clientX, clientY, []);
  if (!getRay().intersectPlane(dragPlane, tmp)) return null;
  return { x: tmp.x - BOARD.x, y: tmp.y - BOARD.y };
}

function sendPlace(it, final) {
  const { u, v } = toUV(it.target.x, it.target.y);
  const payload = { id: it.id, u, v, front: final };
  if (it.type === 'note') payload.token = getAnonToken(it.id);
  act(it.type === 'sticker' ? 'wall.update' : 'request.update', payload).catch(final ? toastError : () => {});
}

function update(it, patch) {
  const d = it.data;
  if (patch.rot != null) it.target.rot = patch.rot;
  if (patch.scale != null) it.target.scale = clamp(patch.scale, 0.35, 3);
  const payload = { id: d.id, ...patch };
  if (it.type === 'note') payload.token = getAnonToken(d.id);
  sfx.click();
  act(it.type === 'sticker' ? 'wall.update' : 'request.update', payload).catch(toastError);
}

const tool = (icon, label, fn) => h('button', { class: 'tool', title: label, 'aria-label': label, onClick: fn }, icon);

function showMenu(e, it) {
  const d = it.data;
  const own = canEdit(it);
  const content = [];
  if (it.type === 'sticker') {
    const by = store.user(d.by);
    content.push(h('div', { class: 'menu-head' }, avatarEl(by, 30),
      h('div', {}, h('b', {}, own ? 'Your sticker' : fullName(by)), h('small', {}, `stuck ${timeAgo(d.at)}`))));
    if (own) {
      content.push(h('div', { class: 'menu-tools' },
        tool('↺', 'Rotate left', () => update(it, { rot: it.data.rot - 0.26 })),
        tool('↻', 'Rotate right', () => update(it, { rot: it.data.rot + 0.26 })),
        tool('＋', 'Bigger', () => update(it, { scale: it.data.scale * 1.2 })),
        tool('－', 'Smaller', () => update(it, { scale: it.data.scale / 1.2 })),
        tool('⤒', 'Bring to front', () => update(it, { front: true }))));
    }
    content.push(menuItem('💌', 'Send this sticker to someone', () => emit('open', { name: 'send', stickerId: d.stickerId })));
    if (own) content.push(menuItem('🗑️', 'Remove from the wall', () => act('wall.remove', { id: d.id }).catch(toastError), { danger: true }));
  } else {
    const author = d.authorId ? store.user(d.authorId) : null;
    const voted = d.votes.includes(store.me.id);
    content.push(h('div', { class: 'menu-head' }, d.anonymous ? h('span', { class: 'av anon', style: '--s:30px' }, '🕶️') : avatarEl(author, 30),
      h('div', {}, h('b', {}, d.anonymous ? (own ? 'Your anonymous note' : 'Anonymous') : own ? 'Your note' : fullName(author)), h('small', {}, timeAgo(d.at)))));
    if (own) {
      content.push(h('div', { class: 'menu-tools' },
        tool('↺', 'Rotate left', () => update(it, { rot: it.data.rot - 0.15 })),
        tool('↻', 'Rotate right', () => update(it, { rot: it.data.rot + 0.15 })),
        tool('⤒', 'Bring to front', () => update(it, { front: true }))));
    }
    content.push(menuItem('👍', voted ? 'Remove my +1' : '+1 this request', () => act('request.vote', { id: d.id }).catch(toastError)));
    content.push(menuItem(d.status === 'done' ? '↩️' : '✅', d.status === 'done' ? 'Reopen' : 'Mark as done', () => act('request.status', { id: d.id, status: d.status === 'done' ? 'open' : 'done' }).catch(toastError)));
    content.push(menuItem('🔍', 'Open in Requests', () => emit('open', { name: 'requests', noteId: d.id })));
    if (own) {
      content.push(menuItem('📍', 'Unpin from the wall', () => act('request.update', { id: d.id, pinned: false, token: getAnonToken(d.id) }).catch(toastError)));
      content.push(menuItem('🗑️', 'Delete request', async () => {
        if (!(await confirmDialog('Delete this request for everyone?'))) return;
        act('request.remove', { id: d.id, token: getAnonToken(d.id) }).then(() => removeAnonToken(d.id), toastError);
      }, { danger: true }));
    }
  }
  sfx.click();
  openPopover({ x: e.clientX, y: e.clientY }, content, { className: 'menu' });
}

delegates.wall = {
  hover(hit) {
    hovered = hit?.item || null;
  },
  cursorFor(hit) {
    return canEdit(hit.item) ? 'grab' : 'pointer';
  },
  down(e, hit) {
    const it = hit.item;
    if (!canEdit(it)) return false;
    const p = boardPoint(e.clientX, e.clientY);
    if (!p) return false;
    dragging = { it, dx: it.cur.x - p.x, dy: it.cur.y - p.y, sx: e.clientX, sy: e.clientY, moved: false };
    return true;
  },
  move(e) {
    if (!dragging) return;
    const p = boardPoint(e.clientX, e.clientY);
    if (!p) return;
    if (!dragging.moved) {
      if (Math.hypot(e.clientX - dragging.sx, e.clientY - dragging.sy) < 5) return;
      dragging.moved = true;
      renderer.domElement.style.cursor = 'grabbing';
      dragging.it.obj.traverse((o) => {
        o.renderOrder = 1e7;
      });
      sfx.click();
    }
    const { it } = dragging;
    const over = isOverTrash(e.clientX, e.clientY);
    if (over !== !!dragging.overTrash) {
      dragging.overTrash = over;
      room.trash.setOpen(over);
      if (over) sfx.click();
    }
    if (over) {
      // Hover the item over the bin's mouth so it's clear what will happen.
      it.target.x = TRASH_LOCAL.x;
      it.target.y = TRASH_LOCAL.y + 0.9;
      return;
    }
    it.target.x = clamp(p.x + dragging.dx, -BOARD.w / 2, BOARD.w / 2);
    it.target.y = clamp(p.y + dragging.dy, -BOARD.h / 2, BOARD.h / 2);
    const now = performance.now();
    if (now - lastSend > 90) {
      lastSend = now;
      sendPlace(it, false);
    }
  },
  up(e) {
    const d = dragging;
    dragging = null;
    renderer.domElement.style.cursor = '';
    if (!d) return;
    if (!d.moved) {
      delegates.wall.click(e, { item: d.it });
      return;
    }
    if (d.overTrash) {
      throwAway(d.it);
      return;
    }
    sendPlace(d.it, true);
    sfx.slap();
  },
  cancel() {
    if (dragging?.overTrash) room.trash.setOpen(false);
    if (dragging?.moved) {
      setTarget(dragging.it, dragging.it.data);
      sendPlace(dragging.it, true);
    }
    dragging = null;
  },
  click(e, hit) {
    const it = hit.item;
    if (it.type === 'note') emit('open', { name: 'requests', noteId: it.id });
    else showMenu(e, it);
  },
  menu(e, hit) {
    showMenu(e, hit.item);
  },
};

// ---------------------------------------------------------------- trash can
const TRASH_LOCAL = { x: -3.75 - BOARD.x, y: 1.2 - BOARD.y };

/** Is this screen point over the 3D trash can? */
export function isOverTrash(clientX, clientY) {
  return !!room.trash && raycastAt(clientX, clientY, [room.trash.group]).length > 0;
}

async function throwAway(it) {
  const restore = () => {
    room.trash.setOpen(false);
    setTarget(it, it.data);
  };
  try {
    if (it.type === 'sticker') {
      it.target.y = TRASH_LOCAL.y; // drop it in
      await act('wall.remove', { id: it.id });
    } else {
      if (!(await confirmDialog('Throw this request away? It will be deleted for everyone.'))) return restore();
      await act('request.remove', { id: it.id, token: getAnonToken(it.id) });
      removeAnonToken(it.id);
    }
    room.trash.gulp();
    sfx.blow();
  } catch (err) {
    restore();
    toastError(err);
  }
}

// ---------------------------------------------------------------- public API
/** Board UV under a screen point, or null when the point isn't on the (visible) board. */
export function boardUVAt(clientX, clientY) {
  const hit = raycastAt(clientX, clientY)[0];
  let onBoard = false;
  for (let o = hit?.object; o; o = o.parent) {
    if (o === room.board.group) {
      onBoard = true;
      break;
    }
  }
  if (!onBoard) return null;
  const p = boardPoint(clientX, clientY);
  if (!p || Math.abs(p.x) > BOARD.w / 2 || Math.abs(p.y) > BOARD.h / 2) return null;
  return toUV(p.x, p.y);
}

export function placeSticker(stickerId, pos = { u: 0.15 + Math.random() * 0.7, v: 0.15 + Math.random() * 0.7 }) {
  return act('wall.add', { stickerId, u: pos.u, v: pos.v, rot: (Math.random() - 0.5) * 0.5, scale: 1 });
}

let glowT = 0;
let glowOn = false;
export function highlightBoard(on) {
  glowOn = on;
}

export function focusNote(id) {
  const it = items.get(`note:${id}`);
  if (!it) return false;
  const p = new THREE.Vector3();
  it.obj.getWorldPosition(p);
  focusPoint(p.clone().add(new THREE.Vector3(0.6, -0.2, 4.6)), p);
  it.flash = 1.6;
  return true;
}

export function initWall() {
  // Drop-target glow around the board
  const glowTex = T.canvasTexture(512, 300, (ctx, w, hh) => {
    ctx.strokeStyle = '#63e6be';
    ctx.lineWidth = 12;
    ctx.shadowColor = '#63e6be';
    ctx.shadowBlur = 20;
    ctx.setLineDash([28, 16]);
    T.roundRect(ctx, 16, 16, w - 32, hh - 32, 22);
    ctx.stroke();
  });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(BOARD.w + 0.9, BOARD.h + 0.9), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
  glow.position.z = 0.16;
  glow.layers.set(FX_LAYER);
  room.board.group.add(glow);

  onFrame((dt, t) => {
    glowT += ((glowOn ? 1 : 0) - glowT) * damp(dt, 10);
    glow.material.opacity = glowT * (0.65 + Math.sin(t * 6) * 0.3);
    glow.visible = glowT > 0.01;

    for (const it of items.values()) {
      if (it.loaded && it.appear < 1) it.appear = Math.min(1, it.appear + dt * 3.4);
      const k = damp(dt, 16);
      it.cur.x += (it.target.x - it.cur.x) * k;
      it.cur.y += (it.target.y - it.cur.y) * k;
      it.cur.rot += (it.target.rot - it.cur.rot) * k;
      it.cur.scale += (it.target.scale - it.cur.scale) * k;
      it.hover += ((hovered === it ? 1 : 0) - it.hover) * damp(dt, 12);
      it.flash = Math.max(0, it.flash - dt);
      const a = it.appear;
      const slap = 1 + (1 - a) * (1 - a) * 0.8;
      const isDrag = dragging?.it === it && dragging.moved;
      let s = it.cur.scale * slap * (1 + it.hover * 0.06 + (isDrag ? 0.1 : 0));
      if (it.removing) {
        it.removing = Math.max(0, it.removing - dt * 4);
        s *= it.removing;
        if (!it.removing) {
          disposeItem(it);
          continue;
        }
      }
      if (it.type === 'sticker') {
        const base = STICKER_SIZE * s;
        it.obj.scale.set(it.aspect >= 1 ? base : base * it.aspect, it.aspect >= 1 ? base / it.aspect : base, 1);
      } else {
        it.obj.scale.setScalar(NOTE_SIZE * s);
      }
      it.mat.opacity = Math.min(1, a * 2.5);
      it.obj.position.set(it.cur.x, it.cur.y, 0.02 + (isDrag ? 0.12 : 0));
      it.obj.rotation.z = it.cur.rot + (isDrag ? Math.sin(t * 9) * 0.04 : 0) + Math.sin(t * 22) * it.flash * 0.08;
    }
  });

  on('col:wall', (e) => {
    if (e.type === 'reset') syncAll();
    else if (e.type === 'remove') removeItem(`sticker:${e.id}`);
    else upsertItem('sticker', e.item);
  });
  on('col:requests', (e) => {
    if (e.type === 'reset') syncAll();
    else if (e.type === 'remove') removeItem(`note:${e.id}`);
    else if (e.item.pinned) upsertItem('note', e.item);
    else removeItem(`note:${e.item.id}`);
  });
  on('col:users', () => {
    for (const it of items.values()) if (it.type === 'note' && it.sig !== noteSignature(it.data)) drawNote(it);
  });
  document.fonts?.ready.then(() => {
    for (const it of items.values()) if (it.type === 'note') drawNote(it);
  });
}
