// Particle effects: 3D confetti bursts and floating party balloons.
import * as THREE from 'three';
import { scene, camera, onFrame, FX_LAYER } from './core.js';

const COLORS = ['#ff6b6b', '#ffd43b', '#69db7c', '#4dabf7', '#da77f2', '#ff922b', '#f783ac', '#38d9a9'].map((c) => new THREE.Color(c));

// ---------- confetti ----------
const MAX = 900;
const confetti = new THREE.InstancedMesh(
  new THREE.PlaneGeometry(0.09, 0.15),
  new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }),
  MAX,
);
confetti.layers.set(FX_LAYER);
confetti.frustumCulled = false;
const parts = Array.from({ length: MAX }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), rv: new THREE.Vector3() }));
const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const one = new THREE.Vector3(1, 1, 1);
const zero = new THREE.Vector3(0, 0, 0);
let cursor = 0;
let alive = 0;
// Start with every instance collapsed so nothing renders before the first burst.
m4.compose(zero, q, zero);
for (let i = 0; i < MAX; i++) {
  confetti.setMatrixAt(i, m4);
  confetti.setColorAt(i, COLORS[i % COLORS.length]);
}

/** Throw confetti from a world position. */
export function confettiBurst(origin, count = 160, power = 6) {
  for (let i = 0; i < count; i++) {
    const idx = cursor;
    const pt = parts[idx];
    cursor = (cursor + 1) % MAX;
    pt.life = 3 + Math.random() * 1.5;
    pt.p.copy(origin);
    const a = Math.random() * Math.PI * 2;
    const up = 0.6 + Math.random() * 0.8;
    const s = power * (0.4 + Math.random() * 0.6);
    pt.v.set(Math.cos(a) * s * 0.6, up * s, Math.sin(a) * s * 0.6);
    pt.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    pt.rv.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);
    confetti.setColorAt(idx, COLORS[i % COLORS.length]);
  }
  confetti.instanceColor.needsUpdate = true;
  alive = 1;
}

function updateConfetti(dt) {
  if (!alive) return;
  let any = false;
  for (let i = 0; i < MAX; i++) {
    const pt = parts[i];
    if (pt.life <= 0) {
      m4.compose(zero, q.identity(), zero);
      confetti.setMatrixAt(i, m4);
      continue;
    }
    any = true;
    pt.life -= dt;
    pt.v.y -= 7.5 * dt;
    pt.v.multiplyScalar(1 - dt * 1.6);
    pt.v.y = Math.max(pt.v.y, -2.2); // paper flutters down slowly
    pt.p.addScaledVector(pt.v, dt);
    if (pt.p.y < 0.02) {
      pt.p.y = 0.02;
      pt.v.set(0, 0, 0);
      pt.rv.multiplyScalar(0.9);
    }
    pt.r.x += pt.rv.x * dt;
    pt.r.y += pt.rv.y * dt;
    pt.r.z += pt.rv.z * dt;
    const s = Math.min(1, pt.life * 2);
    m4.compose(pt.p, q.setFromEuler(pt.r), one.set(s, s, s));
    confetti.setMatrixAt(i, m4);
  }
  confetti.instanceMatrix.needsUpdate = true;
  if (!any) alive = 0;
}

// ---------- balloons ----------
const balloonGroup = new THREE.Group();
balloonGroup.visible = false;
const balloons = [];
const BALLOON_COLS = ['#ff6b6b', '#ffd43b', '#4dabf7', '#f783ac', '#69db7c', '#9775fa', '#ff922b'];
const sphere = new THREE.SphereGeometry(0.42, 24, 18);
const knot = new THREE.ConeGeometry(0.07, 0.12, 10);

for (let i = 0; i < 16; i++) {
  const b = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: BALLOON_COLS[i % BALLOON_COLS.length], roughness: 0.22, metalness: 0.05, transparent: true });
  const body = new THREE.Mesh(sphere, mat);
  body.scale.set(1, 1.18, 1);
  const k = new THREE.Mesh(knot, mat);
  k.position.y = -0.52;
  k.rotation.x = Math.PI;
  const pts = [];
  for (let j = 0; j <= 12; j++) pts.push(new THREE.Vector3(Math.sin(j * 0.9) * 0.05, -0.58 - j * 0.13, 0));
  const string = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#888' }));
  b.add(body, k, string);
  b.traverse((o) => o.layers.set(FX_LAYER));
  b.userData.mats = [mat, string.material];
  string.material.transparent = true;
  const side = i % 2 ? 1 : -1;
  Object.assign(b.userData, {
    x: side * (2.5 + Math.random() * 6.8),
    z: -6 + Math.random() * 7,
    speed: 0.45 + Math.random() * 0.4,
    phase: Math.random() * 10,
    y: -2 - Math.random() * 10,
  });
  balloons.push(b);
  balloonGroup.add(b);
}
scene.add(confetti, balloonGroup);

let balloonsOn = false;
export function setBalloons(on) {
  balloonsOn = on;
  if (on) {
    balloonGroup.visible = true;
    balloons.forEach((b, i) => {
      b.userData.y = -1.5 - (i % 8) * 1.2 - Math.random();
    });
  }
}

onFrame((dt, t) => {
  updateConfetti(dt);
  if (!balloonGroup.visible) return;
  let visible = 0;
  for (const b of balloons) {
    const u = b.userData;
    u.y += u.speed * dt;
    if (u.y > 10) {
      if (balloonsOn) u.y = -1.5;
      else continue;
    }
    visible++;
    b.position.set(u.x + Math.sin(t * 0.7 + u.phase) * 0.35, u.y, u.z);
    b.rotation.z = Math.sin(t * 0.9 + u.phase) * 0.12;
    // Fade balloons that drift between the camera and whatever it is looking at.
    const fade = THREE.MathUtils.clamp((b.position.distanceTo(camera.position) - 3) / 4, 0, 1);
    for (const m of u.mats) m.opacity = fade;
    b.visible = fade > 0.02;
  }
  if (!balloonsOn && !visible) balloonGroup.visible = false;
});
