// Renderer, camera rig, picking and the object-label overlay.
import * as THREE from 'three';
import { damp, h } from '../util.js';

export const FX_LAYER = 1; // visible but never picked by the raycaster

export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
camera.layers.enable(FX_LAYER);
export let renderer;

const timer = new THREE.Timer();
const updaters = new Set();
/** Register a per-frame callback (dt, t). Returns an unsubscribe function. */
export const onFrame = (fn) => (updaters.add(fn), () => updaters.delete(fn));

// ---------- camera rig ----------
const camPos = new THREE.Vector3(0, 6, 16);
const camTarget = new THREE.Vector3(0, 3.6, -7);
const home = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
let focus = null;
let intro = 1; // 1 → 0 sweeps the camera in after login
let attract = false; // slow orbit behind the login screen
const inset = { x: 0, y: 0 };
const insetTarget = { x: 0, y: 0 };
let view = { w: 1, h: 1 };

// Points that must stay on screen (clear of the top bar and the dock) in the home view.
const FRAME_POINTS = [
  [-9.6, 0.3, -7], [9.6, 0.3, -7], // back wall, floor level
  [-9.3, 7.3, -6.9], [9.3, 7.3, -6.9], // birthday board & window tops
  [0, 10.1, -6.9], // neon sign
  [9.2, 0.1, -3.6], [9.2, 4, -3.6], // arcade
  [-3.1, 0, 1.75], [4.1, 0, 1.5], [4.1, 2.2, 1.1], // basket, request box
].map((p) => new THREE.Vector3(...p));

// On tall/narrow screens only the middle of the room is framed; people swipe to pan sideways.
const PORTRAIT_POINTS = FRAME_POINTS.map((p) => new THREE.Vector3(THREE.MathUtils.clamp(p.x, -4.8, 4.8), p.y, p.z));
const pan = { x: 0, target: 0, range: 0 };

function homeFor(dist) {
  home.pos.set(0, 5.6 + (dist - 14) * 0.15, -7 + dist);
  home.target.set(0, 3.7, -7);
}

/** Find the closest camera distance that keeps every key prop in frame for this screen shape. */
function computeHome() {
  const cam = camera.clone();
  cam.view = null;
  cam.aspect = view.w / view.h;
  cam.updateProjectionMatrix();
  const portrait = cam.aspect < 0.95;
  const points = portrait ? PORTRAIT_POINTS : FRAME_POINTS;
  pan.range = portrait ? 5.2 : 0;
  pan.target = THREE.MathUtils.clamp(pan.target, -pan.range, pan.range);
  const top = 1 - (2 * 74) / view.h;
  const bottom = -1 + (2 * 92) / view.h;
  for (let dist = 12; dist <= 42; dist += 0.25) {
    homeFor(dist);
    cam.position.copy(home.pos);
    cam.lookAt(home.target);
    cam.updateMatrixWorld();
    const fits = points.every((p) => {
      tmpV.copy(p).project(cam);
      return tmpV.z < 1 && Math.abs(tmpV.x) <= 0.97 && tmpV.y <= top && tmpV.y >= bottom;
    });
    if (fits) return;
  }
}

/** Fly the camera to a registered prop. */
export function focusOn(name) {
  const p = props.get(name);
  if (!p?.focus) return;
  const t = new THREE.Vector3();
  p.obj.getWorldPosition(t);
  if (p.focus.look) t.add(p.focus.look);
  const offset = p.focus.offset.clone();
  if (p.focus.fit) {
    // Back the camera off just enough for the object to fill the space not covered by HUD/panels.
    const w = Math.max(200, view.w - insetTarget.x);
    const h = Math.max(200, view.h - insetTarget.y - 150);
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * (h / view.h);
    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * (w / view.h);
    offset.setLength(Math.max(p.focus.fit.h / 2 / tanV, p.focus.fit.w / 2 / tanH));
  }
  focus = { pos: t.clone().add(offset), target: t };
}
export function focusPoint(pos, target) {
  focus = { pos: pos.clone(), target: target.clone() };
}
export const clearFocus = () => {
  focus = null;
};
export const setAttract = (on) => {
  attract = on;
};
export const playIntro = () => {
  intro = 1;
};
/** Shift the rendered view so the focused object stays visible next to a side panel (x) or above a bottom sheet (y). */
export const setInset = (x = 0, y = 0) => {
  insetTarget.x = x;
  insetTarget.y = y;
};

// ---------- props & labels ----------
const props = new Map();
const labelRoot = document.getElementById('labels');
const tmpV = new THREE.Vector3();

/**
 * Register a clickable object.
 * opts: { label, icon, accent, onClick, focus: {offset, look}, labelAt: Vector3 (local), hoverLift }
 */
export function registerProp(name, obj, opts) {
  obj.userData.prop = name;
  const p = { name, obj, ...opts, hoverT: 0, hovered: false, baseScale: obj.scale.clone(), baseY: obj.position.y };
  if (opts.label) {
    p.el = h('button', { class: 'obj-label', style: `--accent:${opts.accent || '#7950f2'}`, onClick: () => opts.onClick?.() },
      h('span', { class: 'ol-ic' }, opts.icon || '•'),
      h('span', { class: 'ol-tx' }, opts.label),
      (p.badge = h('span', { class: 'ol-badge', hidden: true })));
    p.el.addEventListener('pointerenter', () => setHovered(p));
    p.el.addEventListener('pointerleave', () => setHovered(null));
    labelRoot.append(p.el);
  }
  props.set(name, p);
  return p;
}
export const getProp = (name) => props.get(name);

export function setBadge(name, value) {
  const p = props.get(name);
  if (!p?.badge) return;
  p.badge.hidden = !value;
  p.badge.textContent = value || '';
}

let hoveredProp = null;
function setHovered(p) {
  if (hoveredProp === p) return;
  if (hoveredProp) {
    hoveredProp.hovered = false;
    hoveredProp.el?.classList.remove('hover');
  }
  hoveredProp = p;
  if (p) {
    p.hovered = true;
    p.el?.classList.add('hover');
  }
}

// ---------- picking ----------
const raycaster = new THREE.Raycaster();
raycaster.params.Line.threshold = 0.02;
raycaster.params.Points.threshold = 0.02;
const ndc = new THREE.Vector2();

export function raycastAt(clientX, clientY, objects = scene.children) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  return raycaster.intersectObjects(objects, true);
}
export const getRay = () => raycaster.ray;

/** Walk up from a hit mesh to the thing it belongs to: a wall item or a prop. */
export function resolveHit(hit) {
  for (let o = hit?.object; o; o = o.parent) {
    if (o.userData.wallItem) return { type: 'wall', item: o.userData.wallItem, obj: o };
    if (o.userData.prop) return { type: 'prop', prop: props.get(o.userData.prop), obj: o };
  }
  return null;
}

/**
 * Resolve what's under the pointer. Wall items all lie on the same plane, so among
 * overlapping ones prefer the one drawn on top (highest stacking order).
 */
export function pickAt(clientX, clientY) {
  const hits = raycastAt(clientX, clientY);
  const first = resolveHit(hits[0]);
  if (first?.type !== 'wall') return first;
  let best = first;
  for (const h of hits.slice(1)) {
    if (h.distance - hits[0].distance > 0.2) break;
    const r = resolveHit(h);
    if (r?.type === 'wall' && (r.item.data.z || 0) > (best.item.data.z || 0)) best = r;
  }
  return best;
}

/** Wall/drag behaviour is plugged in by wall.js. */
export const delegates = { wall: null };

function setupPointer(canvas) {
  let down = null;
  let dragging = false;

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const hit = pickAt(e.clientX, e.clientY);
    down = { x: e.clientX, y: e.clientY, hit, pan: pan.target };
    if (hit?.type === 'wall' && delegates.wall?.down(e, hit)) {
      dragging = true;
      canvas.setPointerCapture(e.pointerId);
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (dragging) {
      delegates.wall?.move(e);
      return;
    }
    // Swipe to look around the room on narrow screens.
    if (down && pan.range && !focus) {
      pan.target = THREE.MathUtils.clamp(down.pan - ((e.clientX - down.x) / view.w) * 12, -pan.range, pan.range);
    }
    const hit = pickAt(e.clientX, e.clientY);
    setHovered(hit?.type === 'prop' ? hit.prop : null);
    delegates.wall?.hover(hit?.type === 'wall' ? hit : null);
    let cursor = '';
    if (hit?.type === 'prop') cursor = 'pointer';
    if (hit?.type === 'wall') cursor = delegates.wall?.cursorFor(hit) || 'pointer';
    canvas.style.cursor = cursor;
  });

  const finish = (e) => {
    if (dragging) {
      dragging = false;
      delegates.wall?.up(e);
      down = null;
      return;
    }
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const hit = down.hit;
    down = null;
    if (moved > 8 || !hit) return;
    if (hit.type === 'prop') hit.prop.onClick?.(hit);
    else if (hit.type === 'wall') delegates.wall?.click(e, hit);
  };
  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', () => {
    if (dragging) delegates.wall?.cancel?.();
    dragging = false;
    down = null;
  });
  canvas.addEventListener('pointerleave', () => {
    setHovered(null);
    delegates.wall?.hover(null);
  });

  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const hit = pickAt(e.clientX, e.clientY);
    if (hit?.type === 'wall') delegates.wall?.menu(e, hit);
  });
}

// ---------- loop ----------
function resize() {
  // A hidden/collapsed window can report 0×0 — never let that poison the camera maths.
  view = { w: Math.max(1, window.innerWidth), h: Math.max(1, window.innerHeight) };
  renderer.setSize(view.w, view.h);
  camera.aspect = view.w / view.h;
  computeHome();
  camera.updateProjectionMatrix();
}

let labelsDimmed = false;
export const dimLabels = (on) => {
  labelsDimmed = on;
  labelRoot.classList.toggle('dim', on);
};

function updateLabels() {
  for (const p of props.values()) {
    if (!p.el) continue;
    // Props never move, so pin each label to a fixed world point (ignoring the hover lift)
    // — otherwise the button would slide away from the cursor that is hovering it.
    if (!p.anchor) {
      if (p.hoverT > 0.001) continue;
      p.obj.updateWorldMatrix(true, false);
      p.anchor = p.obj.localToWorld((p.labelAt || new THREE.Vector3(0, 1, 0)).clone());
    }
    tmpV.copy(p.anchor).project(camera);
    const visible = tmpV.z < 1 && Math.abs(tmpV.x) < 1.1 && Math.abs(tmpV.y) < 1.1;
    p.el.style.visibility = visible ? 'visible' : 'hidden';
    if (!visible) continue;
    const x = (tmpV.x * 0.5 + 0.5) * view.w;
    const y = (-tmpV.y * 0.5 + 0.5) * view.h;
    p.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
  }
}

/** Project a world point to screen pixels. */
export function toScreen(v, out = { x: 0, y: 0, visible: false }) {
  tmpV.copy(v).project(camera);
  out.visible = tmpV.z < 1 && tmpV.z > -1;
  out.x = (tmpV.x * 0.5 + 0.5) * view.w;
  out.y = (-tmpV.y * 0.5 + 0.5) * view.h;
  return out;
}

function frame(timestamp) {
  timer.update(timestamp);
  const dt = Math.min(timer.getDelta(), 0.1);
  const t = timer.getElapsed();

  // Camera: home pose or a focused pose.
  let pos;
  let target;
  if (attract) {
    const a = Math.sin(t * 0.12) * 0.35;
    pos = tmpPos.set(Math.sin(a) * 9, home.pos.y + 0.6, -7 + Math.cos(a) * (home.pos.z + 7));
    target = home.target;
  } else if (focus) {
    pos = tmpPos.copy(focus.pos);
    target = focus.target;
  } else {
    // No mouse parallax: the room and its buttons stay put so they're easy to click.
    pan.x += (pan.target - pan.x) * damp(dt, 8);
    pos = tmpPos.copy(home.pos);
    pos.x += pan.x;
    target = tmpTarget.copy(home.target);
    target.x += pan.x;
  }
  if (intro > 0) {
    intro = Math.max(0, intro - dt * 0.45);
    const k = intro * intro;
    pos.add(tmpOff.set(-k * 6, k * 5, k * 9));
  }
  const rate = focus ? 3.2 : 2.6;
  if (!Number.isFinite(camPos.x + camPos.y + camPos.z + camTarget.x + camTarget.y + camTarget.z)) {
    camPos.copy(home.pos);
    camTarget.copy(home.target);
  }
  camPos.lerp(pos, damp(dt, rate));
  camTarget.lerp(target, damp(dt, rate));
  camera.position.copy(camPos);
  camera.lookAt(camTarget);

  inset.x += (insetTarget.x - inset.x) * damp(dt, 6);
  inset.y += (insetTarget.y - inset.y) * damp(dt, 6);
  if (Math.abs(inset.x) > 0.5 || Math.abs(inset.y) > 0.5) camera.setViewOffset(view.w, view.h, inset.x / 2, inset.y / 2, view.w, view.h);
  else if (camera.view?.enabled) camera.clearViewOffset();

  // Prop hover springs.
  for (const p of props.values()) {
    p.hoverT += ((p.hovered ? 1 : 0) - p.hoverT) * damp(dt, 10);
    if (p.hoverLift !== false) {
      const s = 1 + p.hoverT * 0.045;
      p.obj.scale.set(p.baseScale.x * s, p.baseScale.y * s, p.baseScale.z * s);
      p.obj.position.y = p.baseY + p.hoverT * 0.07;
    }
  }

  for (const fn of updaters) fn(dt, t);
  updateLabels();
  renderer.render(scene, camera);
}
const tmpPos = new THREE.Vector3();
const tmpOff = new THREE.Vector3();
const tmpTarget = new THREE.Vector3();

export function initCore(container) {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.append(renderer.domElement);
  scene.background = new THREE.Color('#2b2440');
  scene.fog = new THREE.Fog('#2b2440', 30, 60);

  window.addEventListener('resize', resize);
  resize();
  camPos.copy(home.pos).add(new THREE.Vector3(-6, 5, 9));
  camTarget.copy(home.target);
  setupPointer(renderer.domElement);
  renderer.setAnimationLoop(frame);
}

export const viewSize = () => view;
