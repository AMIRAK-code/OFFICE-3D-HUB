// The office: walls, furniture and every interactive prop, built from primitives.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { scene, onFrame, registerProp, FX_LAYER } from './core.js';
import * as T from './textures.js';

export const BOARD = { x: 0, y: 4.6, w: 8.6, h: 4.8, z: -6.84 };
const WALL_H = 11.5;

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.02, ...o });
const glow = (o = {}) => new THREE.MeshBasicMaterial({ toneMapped: false, ...o });

function mesh(geo, mat, parent, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent?.add(m);
  return m;
}
const rbox = (w, h, d, r = 0.06) => new RoundedBoxGeometry(w, h, d, 3, Math.max(0.001, Math.min(r, w / 2 - 0.002, h / 2 - 0.002, d / 2 - 0.002)));

// Exposed handles that feature modules use to animate props.
export const room = {};

// ---------------------------------------------------------------- lights & sky
function buildLights() {
  const hemi = new THREE.HemisphereLight('#fff4e4', '#6d5340', 1.5);
  const sun = new THREE.DirectionalLight('#fff0da', 2.3);
  sun.position.set(8, 14, 10);
  sun.target.position.set(-1, 0, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 11, bottom: -9, near: 1, far: 45 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  const lamp = new THREE.PointLight('#ffb36b', 22, 26, 1.4);
  lamp.position.set(-3, 6.8, 1.5);
  scene.add(hemi, sun, sun.target, lamp);
  room.lights = { hemi, sun, lamp };
}

function skyPalette(hour) {
  if (hour < 6 || hour >= 20) return { top: '#0b1030', bottom: '#2c3266', night: true };
  if (hour < 8) return { top: '#6a7bd8', bottom: '#ffb38a', night: false };
  if (hour >= 18) return { top: '#5b4b9a', bottom: '#ff9a6b', night: false };
  return { top: '#4aa3f0', bottom: '#cfeeff', night: false };
}

function drawSky(ctx, w, h) {
  const hour = new Date().getHours();
  const p = skyPalette(hour);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, p.top);
  g.addColorStop(1, p.bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  if (p.night) {
    for (let i = 0; i < 70; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.7})`;
      ctx.fillRect(Math.random() * w, Math.random() * h * 0.7, 2, 2);
    }
    ctx.fillStyle = '#fff6d6';
    ctx.beginPath();
    ctx.arc(w * 0.75, h * 0.22, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.top;
    ctx.beginPath();
    ctx.arc(w * 0.75 + 12, h * 0.2, 24, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const sx = w * (0.15 + ((hour - 7) / 12) * 0.7);
    const sg = ctx.createRadialGradient(sx, h * 0.25, 5, sx, h * 0.25, 90);
    sg.addColorStop(0, 'rgba(255,250,220,1)');
    sg.addColorStop(0.25, 'rgba(255,236,170,0.9)');
    sg.addColorStop(1, 'rgba(255,236,170,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, w, h);
  }
  // City skyline
  let x = 0;
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  while (x < w) {
    const bw = 30 + rnd() * 50;
    const bh = 60 + rnd() * 150;
    ctx.fillStyle = p.night ? '#151834' : 'rgba(70,90,140,0.55)';
    ctx.fillRect(x, h - bh, bw, bh);
    if (p.night) {
      for (let wy = h - bh + 10; wy < h - 8; wy += 14) {
        for (let wx = x + 6; wx < x + bw - 6; wx += 10) {
          if (rnd() > 0.55) {
            ctx.fillStyle = rnd() > 0.5 ? '#ffd86b' : '#ffe9a8';
            ctx.fillRect(wx, wy, 5, 7);
          }
        }
      }
    }
    x += bw + 4;
  }
  return p;
}

function buildRoomShell() {
  // Floor (extends toward the camera so no edge shows)
  const floor = mesh(new THREE.PlaneGeometry(20, 17), std('#ffffff', { map: T.woodTexture(), roughness: 0.7 }), scene, 0, 0, 1.5);
  floor.rotation.x = -Math.PI / 2;
  floor.castShadow = false;

  const H = WALL_H;
  const wallTex = T.wallTexture('#f5e8d6');
  wallTex.repeat.set(4, 2.8);
  const sideTex = T.wallTexture('#efdcc6');
  sideTex.repeat.set(3.4, 2.8);
  const wallMat = std('#ffffff', { map: wallTex, roughness: 0.95 });
  const sideMat = std('#ffffff', { map: sideTex, roughness: 0.95 });
  const back = mesh(new THREE.PlaneGeometry(20, H), wallMat, scene, 0, H / 2, -7);
  back.castShadow = false;
  const left = mesh(new THREE.PlaneGeometry(17, H), sideMat, scene, -10, H / 2, 1.5);
  left.rotation.y = Math.PI / 2;
  left.castShadow = false;
  const right = mesh(new THREE.PlaneGeometry(17, H), sideMat, scene, 10, H / 2, 1.5);
  right.rotation.y = -Math.PI / 2;
  right.castShadow = false;
  const ceiling = mesh(new THREE.PlaneGeometry(20, 17), std('#efe3d3', { roughness: 1 }), scene, 0, H, 1.5);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.castShadow = false;
  // Crown moulding where walls meet the ceiling
  const crown = std('#fbf6ee', { roughness: 0.6 });
  mesh(new THREE.BoxGeometry(20, 0.22, 0.22), crown, scene, 0, H - 0.11, -6.9);
  for (const sx of [-1, 1]) mesh(new THREE.BoxGeometry(0.22, 0.22, 17), crown, scene, sx * 9.9, H - 0.11, 1.5);

  // Wainscot, rail and skirting
  const sage = std('#86a897', { roughness: 0.8 });
  const trim = std('#fbf6ee', { roughness: 0.6 });
  mesh(new THREE.BoxGeometry(20, 1.7, 0.06), sage, scene, 0, 0.85, -6.97).castShadow = false;
  mesh(new THREE.BoxGeometry(20, 0.08, 0.14), trim, scene, 0, 1.72, -6.93);
  mesh(new THREE.BoxGeometry(20, 0.2, 0.1), trim, scene, 0, 0.1, -6.95);
  for (const sx of [-1, 1]) {
    mesh(new THREE.BoxGeometry(0.06, 1.7, 17), sage, scene, sx * 9.97, 0.85, 1.5).castShadow = false;
    mesh(new THREE.BoxGeometry(0.14, 0.08, 17), trim, scene, sx * 9.93, 1.72, 1.5);
    mesh(new THREE.BoxGeometry(0.1, 0.2, 17), trim, scene, sx * 9.95, 0.1, 1.5);
  }

  // Rug
  const rug = mesh(new THREE.PlaneGeometry(8.4, 4.9), std('#ffffff', { map: T.rugTexture(), transparent: true, roughness: 1 }), scene, -0.4, 0.015, -0.9);
  rug.rotation.x = -Math.PI / 2;
  rug.castShadow = false;
}

// ---------------------------------------------------------------- the wall (corkboard)
function buildBoard(open) {
  const g = new THREE.Group();
  g.position.set(BOARD.x, BOARD.y, BOARD.z);
  scene.add(g);
  const backing = mesh(rbox(BOARD.w + 0.1, BOARD.h + 0.1, 0.1, 0.03), std('#7a5230'), g, 0, 0, -0.07);
  backing.castShadow = false;
  const cork = mesh(new THREE.PlaneGeometry(BOARD.w, BOARD.h), std('#ffffff', { map: T.corkTexture(), roughness: 1 }), g, 0, 0, 0);
  cork.castShadow = false;
  cork.userData.isBoard = true;
  const frameMat = std('#8b5a33', { roughness: 0.55 });
  const t = 0.22;
  mesh(rbox(BOARD.w + t * 2, t, 0.22, 0.05), frameMat, g, 0, BOARD.h / 2 + t / 2, 0.02);
  mesh(rbox(BOARD.w + t * 2, t, 0.22, 0.05), frameMat, g, 0, -BOARD.h / 2 - t / 2, 0.02);
  mesh(rbox(t, BOARD.h, 0.22, 0.05), frameMat, g, -BOARD.w / 2 - t / 2, 0, 0.02);
  mesh(rbox(t, BOARD.h, 0.22, 0.05), frameMat, g, BOARD.w / 2 + t / 2, 0, 0.02);
  // Tray for markers along the bottom
  mesh(rbox(3.2, 0.08, 0.3, 0.02), frameMat, g, 1.6, -BOARD.h / 2 - 0.24, 0.16);
  const markerCols = ['#e03131', '#1971c2', '#2f9e44'];
  markerCols.forEach((c, i) => {
    const mk = mesh(new THREE.CapsuleGeometry(0.035, 0.32, 4, 8), std(c), g, 0.8 + i * 0.5, -BOARD.h / 2 - 0.16, 0.18);
    mk.rotation.z = Math.PI / 2;
  });

  room.board = { group: g, cork, items: new THREE.Group() };
  g.add(room.board.items);
  // The whole board is clickable: it zooms in to fill the screen.
  registerProp('wall', g, {
    label: 'The Wall', icon: '🎨', accent: '#0ca678', hoverLift: false,
    labelAt: new THREE.Vector3(0, -BOARD.h / 2 - 0.55, 0.3),
    onClick: () => open('wall'),
    // Frame the board plus the trash can just below it.
    focus: { offset: new THREE.Vector3(0, 0, 1), look: new THREE.Vector3(0, -1.0, 0), fit: { w: BOARD.w + 0.9, h: BOARD.h + 2.6 } },
  });
}

// ---------------------------------------------------------------- birthday board
function buildBirthdayBoard(open) {
  const g = new THREE.Group();
  g.position.set(-7.55, 5.05, -6.92);
  scene.add(g);
  const W = 3.3;
  const H = 3.0;
  mesh(rbox(W + 0.3, H + 0.3, 0.12, 0.08), std('#f783ac', { roughness: 0.5 }), g, 0, 0, 0);
  const tex = T.canvasTexture(560, 510);
  const paper = mesh(new THREE.PlaneGeometry(W, H), std('#ffffff', { map: tex, roughness: 0.9 }), g, 0, 0, 0.07);
  paper.castShadow = false;

  // Bunting
  const flags = new THREE.Group();
  const cols = ['#ff6b6b', '#ffd43b', '#69db7c', '#4dabf7', '#da77f2', '#ff922b', '#f783ac'];
  const n = 9;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const x = -W / 2 - 0.1 + u * (W + 0.2);
    const y = H / 2 + 0.55 - Math.sin(u * Math.PI) * 0.28;
    pts.push(new THREE.Vector3(x, y, 0.16));
    const flag = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.32, 3), std(cols[i % cols.length], { side: THREE.DoubleSide }));
    flag.rotation.z = Math.PI;
    flag.scale.z = 0.15;
    flag.position.set(x, y - 0.17, 0.16);
    flag.castShadow = true;
    flags.add(flag);
  }
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(new THREE.CatmullRomCurve3(pts).getPoints(40)), new THREE.LineBasicMaterial({ color: '#6b4b3a' }));
  flags.add(line);
  g.add(flags);

  let flutter = 0;
  onFrame((dt, t) => {
    flutter = Math.max(0, flutter - dt);
    flags.children.forEach((f, i) => {
      if (f.isMesh) f.rotation.x = Math.sin(t * 2 + i) * 0.08 + Math.sin(t * 18 + i) * flutter * 0.35;
    });
  });

  room.birthdayBoard = {
    group: g,
    flutter: () => {
      flutter = 1.4;
    },
    draw(rows, celebrating) {
      tex.userData.redraw((ctx, w, h) => {
        const bg = ctx.createLinearGradient(0, 0, 0, h);
        bg.addColorStop(0, celebrating ? '#fff0f6' : '#fff8f0');
        bg.addColorStop(1, celebrating ? '#ffdeeb' : '#ffeedd');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#d6336c';
        ctx.font = `700 46px ${T.FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText(celebrating ? '🎉 Party today! 🎉' : '🎂 Birthdays', w / 2, 66);
        ctx.fillStyle = 'rgba(214,51,108,0.25)';
        ctx.fillRect(40, 88, w - 80, 3);
        ctx.textAlign = 'left';
        if (!rows.length) {
          ctx.fillStyle = '#a07a8c';
          ctx.font = `600 30px ${T.BODY_FONT}`;
          ctx.textAlign = 'center';
          ctx.fillText('No birthdays yet —', w / 2, 230);
          ctx.fillText('click to add yours!', w / 2, 272);
          return;
        }
        rows.slice(0, 6).forEach((r, i) => {
          const y = 116 + i * 64;
          const today = r.days === 0;
          ctx.fillStyle = today ? '#f03e3e' : '#ffffff';
          T.roundRect(ctx, 30, y, w - 60, 54, 16);
          ctx.fill();
          ctx.fillStyle = today ? '#ffffff' : '#d6336c';
          ctx.font = `700 26px ${T.FONT}`;
          ctx.fillText(r.date, 48, y + 37);
          ctx.fillStyle = today ? '#ffffff' : '#3b2d42';
          ctx.font = `700 27px ${T.BODY_FONT}`;
          let name = r.name;
          while (ctx.measureText(name).width > 250 && name.length > 3) name = name.slice(0, -2);
          ctx.fillText(name === r.name ? name : `${name}…`, 150, y + 37);
          ctx.textAlign = 'right';
          ctx.font = `700 22px ${T.BODY_FONT}`;
          ctx.fillStyle = today ? '#fff3bf' : '#9c7a8c';
          ctx.fillText(today ? 'TODAY 🎈' : r.days === 1 ? 'tomorrow' : `in ${r.days} days`, w - 48, y + 36);
          ctx.textAlign = 'left';
        });
      });
    },
  };
  room.birthdayBoard.draw([], false);

  registerProp('birthdays', g, {
    label: 'Birthdays', icon: '🎂', accent: '#f03e83', hoverLift: false,
    labelAt: new THREE.Vector3(0, H / 2 + 0.95, 0.2),
    onClick: () => open('birthdays'),
    focus: { offset: new THREE.Vector3(1.4, -0.3, 7.2) },
  });
}

// ---------------------------------------------------------------- window
function buildWindow(open) {
  const g = new THREE.Group();
  g.position.set(7.55, 5.25, -6.95);
  scene.add(g);
  const W = 3.2;
  const H = 2.7;
  const skyTex = T.canvasTexture(512, 432, drawSky);
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(W, H), glow({ map: skyTex }));
  sky.position.z = 0.02;
  g.add(sky);
  const cloudTex = T.canvasTexture(512, 256, (ctx, w, h) => {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 6; i++) {
      const cx = (i / 6) * w + 30;
      const cy = 40 + (i % 3) * 45;
      for (let j = 0; j < 5; j++) {
        ctx.beginPath();
        ctx.ellipse(cx + j * 14, cy + Math.sin(j) * 6, 22, 13, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });
  cloudTex.wrapS = THREE.RepeatWrapping;
  const clouds = new THREE.Mesh(new THREE.PlaneGeometry(W, H * 0.6), glow({ map: cloudTex, transparent: true, opacity: 0.8, depthWrite: false }));
  clouds.position.set(0, H * 0.18, 0.03);
  g.add(clouds);

  const frame = std('#fdfaf5', { roughness: 0.5 });
  const b = 0.16;
  mesh(new THREE.BoxGeometry(W + b * 2, b, 0.24), frame, g, 0, H / 2 + b / 2, 0.08);
  mesh(new THREE.BoxGeometry(W + b * 2, b, 0.24), frame, g, 0, -H / 2 - b / 2, 0.08);
  mesh(new THREE.BoxGeometry(b, H, 0.24), frame, g, -W / 2 - b / 2, 0, 0.08);
  mesh(new THREE.BoxGeometry(b, H, 0.24), frame, g, W / 2 + b / 2, 0, 0.08);
  mesh(new THREE.BoxGeometry(0.07, H, 0.1), frame, g, 0, 0, 0.06);
  mesh(new THREE.BoxGeometry(W, 0.07, 0.1), frame, g, 0, 0.15, 0.06);
  mesh(rbox(W + 0.6, 0.12, 0.5, 0.04), frame, g, 0, -H / 2 - 0.2, 0.2);

  // Curtains
  const curtainMat = std('#6fb5b0', { roughness: 0.9, side: THREE.DoubleSide });
  for (const side of [-1, 1]) {
    const geo = new THREE.PlaneGeometry(0.75, H + 0.9, 18, 1);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 18) * 0.06);
    geo.computeVertexNormals();
    const c = mesh(geo, curtainMat, g, side * (W / 2 + 0.42), -0.15, 0.32);
    c.castShadow = false;
  }
  mesh(new THREE.CylinderGeometry(0.035, 0.035, W + 1.9, 10), std('#7b5a3c'), g, 0, H / 2 + 0.38, 0.32).rotation.z = Math.PI / 2;

  // Small cactus on the sill
  const pot = mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.26, 16), std('#e8875e'), g, -1.0, -H / 2 - 0.01, 0.25);
  const cactus = mesh(new THREE.CapsuleGeometry(0.1, 0.28, 4, 10), std('#4f9d69'), pot, 0, 0.3, 0);
  mesh(new THREE.CapsuleGeometry(0.05, 0.12, 4, 8), std('#4f9d69'), cactus, 0.11, 0.02, 0).rotation.z = -0.9;

  onFrame((dt) => {
    cloudTex.offset.x += dt * 0.006;
  });
  // The window is the "Top Places" board: look outside, pick somewhere to go.
  registerProp('places', g, {
    label: 'Top Places', icon: '📍', accent: '#1c7ed6', hoverLift: false,
    labelAt: new THREE.Vector3(0, H / 2 + 0.55, 0.3),
    onClick: () => open('places'),
    focus: { offset: new THREE.Vector3(0, 0, 1), fit: { w: 5.6, h: 4.6 } },
  });
  let lastHour = new Date().getHours();
  const applyTime = () => {
    const p = skyPalette(new Date().getHours());
    room.lights.sun.intensity = p.night ? 0.45 : 2.3;
    room.lights.sun.color.set(p.night ? '#9fb2ff' : '#fff0da');
    room.lights.hemi.intensity = p.night ? 0.75 : 1.5;
    room.lights.lamp.intensity = p.night ? 40 : 22;
    clouds.material.opacity = p.night ? 0.15 : 0.8;
  };
  applyTime();
  setInterval(() => {
    const hr = new Date().getHours();
    if (hr !== lastHour) {
      lastHour = hr;
      skyTex.userData.redraw(drawSky);
      applyTime();
    }
  }, 60e3);
}

// ---------------------------------------------------------------- neon sign & pendant lamps
function buildNeonSign() {
  const tex = T.canvasTexture(1024, 200);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.5625), glow({ map: tex, transparent: true, depthWrite: false }));
  sign.position.set(0, 9.35, -6.94);
  scene.add(sign);
  const light = new THREE.PointLight('#ff6ec7', 6, 9, 1.6);
  light.position.set(0, 9.3, -5.6);
  scene.add(light);
  let text = 'Office Board';
  const draw = (on) => tex.userData.redraw((ctx, w, h) => {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let size = 120;
    ctx.font = `600 ${size}px ${T.FONT}`;
    while (ctx.measureText(text).width > w - 80 && size > 40) ctx.font = `600 ${(size -= 4)}px ${T.FONT}`;
    for (const [blur, color] of on ? [[40, '#ff2fb4'], [18, '#ff6ec7'], [0, '#ffe3f5']] : [[0, 'rgba(255,150,210,0.35)']]) {
      ctx.shadowColor = color;
      ctx.shadowBlur = blur;
      ctx.fillStyle = color;
      ctx.fillText(text, w / 2, h / 2 + 6);
    }
  });
  draw(true);
  let flicker = 0;
  onFrame((dt) => {
    flicker -= dt;
    if (flicker < -14 - Math.random() * 20) {
      flicker = 0.25;
      draw(false);
      light.intensity = 1;
    } else if (flicker < 0 && flicker > -dt * 1.5) {
      draw(true);
      light.intensity = 6;
    }
  });
  room.sign = {
    setText(t) {
      text = t;
      draw(true);
    },
  };
}

function buildPendants() {
  for (const x of [-5.6, 5.6]) {
    const g = new THREE.Group();
    g.position.set(x, WALL_H, -2.6);
    scene.add(g);
    const swing = new THREE.Group();
    g.add(swing);
    const len = 2.5;
    mesh(new THREE.CylinderGeometry(0.015, 0.015, len, 6), std('#2d2a33'), swing, 0, -len / 2, 0);
    const shade = mesh(new THREE.CylinderGeometry(0.22, 0.62, 0.55, 28, 1, true), std('#f2b84b', { side: THREE.DoubleSide, roughness: 0.5 }), swing, 0, -len - 0.2, 0);
    shade.castShadow = false;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 10), glow({ color: '#fff4d6' }));
    bulb.position.y = -len - 0.38;
    bulb.layers.set(FX_LAYER);
    swing.add(bulb);
    const l = new THREE.PointLight('#ffcf8a', 8, 10, 1.4);
    l.position.y = -len - 0.6;
    swing.add(l);
    const phase = x;
    onFrame((dt, t) => {
      swing.rotation.z = Math.sin(t * 0.9 + phase) * 0.025;
    });
  }
}

// ---------------------------------------------------------------- fairy lights
function buildFairyLights() {
  const pts = [];
  const swags = 5;
  for (let i = 0; i <= 200; i++) {
    const u = i / 200;
    const x = -9.9 + u * 19.8;
    const local = (u * swags) % 1;
    pts.push(new THREE.Vector3(x, 7.78 - Math.sin(local * Math.PI) * 0.32, -6.88));
  }
  scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#4a3b30' })));
  const count = 50;
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.065, 10, 8), glow({ color: '#ffffff' }), count);
  bulbs.layers.set(FX_LAYER);
  const palette = ['#ffd27a', '#ff8fa3', '#8ce99a', '#74c0fc', '#ffe066'].map((c) => new THREE.Color(c));
  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    const p = pts[Math.round((i / (count - 1)) * 200)];
    m.setPosition(p.x, p.y - 0.07, p.z + 0.02);
    bulbs.setMatrixAt(i, m);
    bulbs.setColorAt(i, palette[i % palette.length]);
  }
  scene.add(bulbs);
  const c = new THREE.Color();
  let boost = 0;
  room.fairy = {
    party: (on) => {
      boost = on ? 1 : 0;
    },
  };
  onFrame((dt, t) => {
    for (let i = 0; i < count; i++) {
      const k = 0.55 + 0.45 * Math.sin(t * (1.3 + boost * 4) + i * 1.7);
      c.copy(palette[(i + (boost ? Math.floor(t * 4) : 0)) % palette.length]).multiplyScalar(0.6 + k * (0.9 + boost));
      bulbs.setColorAt(i, c);
    }
    bulbs.instanceColor.needsUpdate = true;
  });
}

// ---------------------------------------------------------------- desk, monitor, mug
function buildDesk() {
  const g = new THREE.Group();
  g.position.set(-6.5, 0, -4.95);
  scene.add(g);
  const top = std('#d9b48a', { roughness: 0.5 });
  const metal = std('#3d3846', { roughness: 0.4, metalness: 0.4 });
  mesh(rbox(4.4, 0.14, 1.9, 0.05), top, g, 0, 1.62, 0);
  for (const [x, z] of [[-2.05, -0.8], [-2.05, 0.8], [2.05, -0.8], [2.05, 0.8]]) mesh(new THREE.BoxGeometry(0.1, 1.55, 0.1), metal, g, x, 0.78, z);
  const cab = mesh(rbox(1.15, 1.25, 1.6, 0.05), std('#f1ebe2'), g, 1.3, 0.66, -0.05);
  for (let i = 0; i < 3; i++) mesh(rbox(0.3, 0.05, 0.05, 0.02), metal, cab, 0, 0.4 - i * 0.4, 0.82);

  // Monitor
  mesh(rbox(0.7, 0.05, 0.45, 0.02), metal, g, 0.9, 1.72, -0.45);
  mesh(new THREE.BoxGeometry(0.09, 0.55, 0.09), metal, g, 0.9, 1.98, -0.5);
  mesh(rbox(2.0, 1.2, 0.09, 0.04), std('#25222d'), g, 0.9, 2.55, -0.45);
  const screenTex = T.canvasTexture(400, 230);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.88, 1.08), glow({ map: screenTex }));
  screen.position.set(0.9, 2.55, -0.4);
  g.add(screen);
  mesh(rbox(1.25, 0.05, 0.42, 0.02), std('#eeeeee'), g, 0.75, 1.72, 0.35);
  const mug = mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.3, 18), std('#ff6b6b'), g, 1.85, 1.84, 0.4);
  mesh(new THREE.TorusGeometry(0.08, 0.025, 8, 16), std('#ff6b6b'), mug, 0.16, 0, 0);

  // Steam puffs
  const steamTex = T.canvasTexture(64, 64, (ctx) => {
    const gr = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    gr.addColorStop(0, 'rgba(255,255,255,0.8)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, 64, 64);
  });
  const puffs = [];
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: steamTex, transparent: true, depthWrite: false, opacity: 0 }));
    s.layers.set(FX_LAYER);
    s.userData.t = i / 6;
    g.add(s);
    puffs.push(s);
  }
  onFrame((dt, t) => {
    for (const s of puffs) {
      s.userData.t = (s.userData.t + dt * 0.25) % 1;
      const k = s.userData.t;
      s.position.set(1.85 + Math.sin(t * 2 + k * 6) * 0.05, 2.02 + k * 0.7, 0.4);
      s.scale.setScalar(0.12 + k * 0.25);
      s.material.opacity = Math.sin(k * Math.PI) * 0.45;
    }
  });

  room.monitor = {
    draw(online, total) {
      screenTex.userData.redraw((ctx, w, h) => {
        const gr = ctx.createLinearGradient(0, 0, w, h);
        gr.addColorStop(0, '#3b5bdb');
        gr.addColorStop(1, '#9c36b5');
        ctx.fillStyle = gr;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(0, 0, w, 26);
        ctx.fillStyle = '#fff';
        ctx.font = `700 15px ${T.BODY_FONT}`;
        ctx.fillText('● ● ●   office-board', 12, 18);
        ctx.font = `700 36px ${T.FONT}`;
        ctx.fillText(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), 22, 92);
        ctx.font = `700 22px ${T.BODY_FONT}`;
        ctx.fillText(`👥 ${online} online`, 22, 140);
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.font = `600 18px ${T.BODY_FONT}`;
        ctx.fillText(total === 1 ? 'Invite your colleagues!' : `${total} colleagues on the board`, 22, 172);
        ctx.fillText('Have a great day ✨', 22, 202);
      });
    },
  };
  room.monitor.draw(1, 1);
  return g;
}

// ---------------------------------------------------------------- radio
function buildRadio(desk, open) {
  const g = new THREE.Group();
  g.position.set(-0.95, 1.69, -0.1);
  desk.add(g);
  const inner = new THREE.Group();
  g.add(inner);
  const body = mesh(rbox(1.6, 0.95, 0.6, 0.14), std('#ff7a2f', { roughness: 0.45 }), inner, 0, 0.475, 0);
  const grille = mesh(new THREE.CircleGeometry(0.33, 40), std('#ffffff', { map: T.grilleTexture(), roughness: 0.8 }), inner, -0.38, 0.47, 0.302);
  grille.castShadow = false;
  const dialTex = T.canvasTexture(256, 128);
  const dial = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.3), glow({ map: dialTex }));
  dial.position.set(0.38, 0.6, 0.303);
  inner.add(dial);
  const cream = std('#fff1d6', { roughness: 0.4 });
  const knobs = [0.2, 0.56].map((x) => {
    const k = mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.08, 20), cream, inner, x, 0.25, 0.32);
    k.rotation.x = Math.PI / 2;
    mesh(new THREE.BoxGeometry(0.02, 0.03, 0.1), std('#5b3a1e'), k, 0, 0, 0.06).rotation.x = Math.PI / 2;
    return k;
  });
  const handle = mesh(new THREE.TorusGeometry(0.5, 0.04, 8, 30, Math.PI), std('#5b3a1e'), inner, 0, 0.95, 0);
  handle.scale.y = 0.55;
  const antennaPivot = new THREE.Group();
  antennaPivot.position.set(0.66, 0.95, -0.15);
  inner.add(antennaPivot);
  const antenna = mesh(new THREE.CylinderGeometry(0.014, 0.02, 1.1, 8), std('#c0c4cc', { metalness: 0.8, roughness: 0.25 }), antennaPivot, 0, 0.55, 0);
  mesh(new THREE.SphereGeometry(0.04, 10, 8), std('#c0c4cc', { metalness: 0.8, roughness: 0.25 }), antenna, 0, 0.55, 0);
  antennaPivot.rotation.z = -0.55;

  let active = false;
  let needle = 0.3;
  const drawDial = () => dialTex.userData.redraw((ctx, w, h) => {
    ctx.fillStyle = active ? '#fff3bf' : '#e9dcc0';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#7a5a3a';
    ctx.fillStyle = '#7a5a3a';
    ctx.font = `700 16px ${T.BODY_FONT}`;
    for (let i = 0; i <= 20; i++) {
      const x = 16 + (i / 20) * (w - 32);
      ctx.lineWidth = i % 5 === 0 ? 3 : 1.5;
      ctx.beginPath();
      ctx.moveTo(x, 70);
      ctx.lineTo(x, i % 5 === 0 ? 40 : 55);
      ctx.stroke();
      if (i % 5 === 0) ctx.fillText(String(88 + i), x - 9, 100);
    }
    ctx.fillStyle = '#e03131';
    ctx.fillRect(16 + needle * (w - 32) - 2, 18, 4, 90);
    if (active) {
      ctx.fillStyle = 'rgba(255,170,0,0.25)';
      ctx.fillRect(0, 0, w, h);
    }
  });
  drawDial();

  // Floating music notes
  const noteTex = ['♪', '♫', '♬'].map((ch) => T.canvasTexture(64, 64, (ctx) => {
    ctx.font = '700 52px serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 4;
    ctx.fillText(ch, 32, 50);
  }));
  const noteCols = ['#ff922b', '#f06595', '#845ef7', '#20c997', '#339af0'];
  const notes = [];
  let spawnT = 0;
  let pulse = 0;
  onFrame((dt, t) => {
    if (active) {
      spawnT -= dt;
      if (spawnT <= 0) {
        spawnT = 0.28;
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: noteTex[notes.length % 3], color: noteCols[Math.floor(Math.random() * noteCols.length)], transparent: true, depthWrite: false }));
        s.layers.set(FX_LAYER);
        s.position.set(-0.38 + (Math.random() - 0.5) * 0.3, 0.8, 0.35);
        s.scale.setScalar(0.32);
        s.userData = { life: 0, vx: (Math.random() - 0.5) * 0.6, phase: Math.random() * 6 };
        g.add(s);
        notes.push(s);
      }
      needle += (0.62 + Math.sin(t * 0.7) * 0.05 - needle) * dt * 3;
    }
    for (let i = notes.length - 1; i >= 0; i--) {
      const s = notes[i];
      s.userData.life += dt;
      const L = s.userData.life;
      s.position.y += dt * 0.9;
      s.position.x += Math.sin(t * 3 + s.userData.phase) * dt * 0.4 + s.userData.vx * dt;
      s.material.opacity = Math.min(1, L * 4) * Math.max(0, 1 - L / 2.2);
      if (L > 2.2) {
        g.remove(s);
        s.material.dispose();
        notes.splice(i, 1);
      }
    }
    pulse = active ? 1 + Math.max(0, Math.sin(t * 9.4)) * 0.08 : 1;
    grille.scale.setScalar(pulse);
    inner.scale.set(1, 1 + (pulse - 1) * 0.2, 1);
    antennaPivot.rotation.z = -0.55 + (active ? Math.sin(t * 6) * 0.12 : 0);
    knobs[0].rotation.y = active ? t * 2 : knobs[0].rotation.y;
    if (active && Math.floor(t * 10) % 2 === 0) drawDial();
  });

  room.radio = {
    setActive(on) {
      active = on;
      if (!on) {
        needle = 0.3;
        drawDial();
      }
    },
  };

  registerProp('radio', g, {
    label: 'Podcast Radio', icon: '📻', accent: '#ff7a2f',
    labelAt: new THREE.Vector3(0, 1.55, 0.3),
    onClick: () => open('radio'),
    focus: { offset: new THREE.Vector3(2.4, 1.3, 4.4), look: new THREE.Vector3(0.5, 0.6, 0) },
  });
}

// ---------------------------------------------------------------- TV
function buildTV(open) {
  const stand = new THREE.Group();
  stand.position.set(5.25, 0, -5.45);
  scene.add(stand);
  const wood = std('#7a5538', { roughness: 0.6 });
  mesh(rbox(3.9, 0.95, 1.2, 0.06), wood, stand, 0, 0.62, 0);
  for (const x of [-1.75, 1.75]) for (const z of [-0.45, 0.45]) mesh(new THREE.CylinderGeometry(0.05, 0.035, 0.16, 8), std('#2d2a33'), stand, x, 0.08, z);
  for (const x of [-0.97, 0.97]) {
    const door = mesh(rbox(1.85, 0.75, 0.04, 0.02), std('#946a48', { roughness: 0.5 }), stand, x, 0.62, 0.61);
    mesh(new THREE.SphereGeometry(0.045, 10, 8), std('#e9c46a', { metalness: 0.7, roughness: 0.3 }), door, x > 0 ? -0.75 : 0.75, 0, 0.04);
  }
  // succulent
  const pot = mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.28, 16), std('#f1ece4'), stand, 1.6, 1.24, 0.15);
  for (let i = 0; i < 7; i++) {
    const leaf = mesh(new THREE.SphereGeometry(0.1, 10, 8), std(i % 2 ? '#74b88a' : '#5aa37a'), pot, 0, 0.2, 0);
    leaf.scale.set(0.6, 1.4, 0.6);
    leaf.rotation.set(Math.cos(i) * 0.7, 0, Math.sin(i) * 0.7);
  }

  const tv = new THREE.Group();
  tv.position.set(5.0, 1.1, -5.5);
  scene.add(tv);
  const inner = new THREE.Group();
  tv.add(inner);
  const dark = std('#18171d', { roughness: 0.35, metalness: 0.3 });
  mesh(rbox(1.2, 0.06, 0.45, 0.02), dark, inner, 0, 0.03, 0);
  mesh(new THREE.BoxGeometry(0.22, 0.24, 0.1), dark, inner, 0, 0.16, 0);
  mesh(rbox(3.45, 2.05, 0.16, 0.05), dark, inner, 0, 1.3, 0);
  const W = 640;
  const H = 360;
  const tex = T.canvasTexture(W, H);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(3.25, 1.83), glow({ map: tex }));
  screen.position.set(0, 1.3, 0.082);
  inner.add(screen);
  const tvLight = new THREE.PointLight('#7cc4ff', 0, 9, 1.5);
  tvLight.position.set(0, 1.3, 1.4);
  inner.add(tvLight);

  // Pre-baked static frames
  const statics = Array.from({ length: 4 }, () => {
    const c = document.createElement('canvas');
    c.width = 160;
    c.height = 90;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(160, 90);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  });

  const state = { mode: 'off', phase: 'off', t: 0, slide: 0, slideT: 0, getSlides: () => [] };
  const SLIDE_COLORS = [['#7048e8', '#e64980'], ['#1c7ed6', '#12b886'], ['#f76707', '#e8590c'], ['#0b7285', '#5f3dc4'], ['#c2255c', '#f59f00']];

  function drawOff(ctx) {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#1d1f27');
    g.addColorStop(1, '#0c0d12');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.beginPath();
    ctx.moveTo(W * 0.1, 0);
    ctx.lineTo(W * 0.35, 0);
    ctx.lineTo(W * 0.15, H);
    ctx.lineTo(-W * 0.1, H);
    ctx.fill();
  }
  function drawStatic(ctx, t) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(statics[Math.floor(t * 30) % statics.length], 0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 2);
  }
  function drawSlide(ctx, t) {
    const slides = state.getSlides();
    if (!slides.length) {
      const bars = ['#ffffff', '#ffe066', '#66d9e8', '#69db7c', '#f783ac', '#ff6b6b', '#4dabf7'];
      bars.forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.fillRect((i * W) / bars.length, 0, W / bars.length + 1, H * 0.7);
      });
      ctx.fillStyle = '#1a1b25';
      ctx.fillRect(0, H * 0.7, W, H * 0.3);
      ctx.fillStyle = '#fff';
      ctx.font = `700 30px ${T.FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('No signal — add a recommendation!', W / 2, H * 0.87);
      ctx.textAlign = 'left';
      return;
    }
    const s = slides[state.slide % slides.length];
    const [c1, c2] = SLIDE_COLORS[state.slide % SLIDE_COLORS.length];
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, c1);
    g.addColorStop(1, c2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // film strip
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, 0, W, 34);
    ctx.fillRect(0, H - 34, W, 34);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    const off = (t * 40) % 40;
    for (let x = -40; x < W + 40; x += 40) {
      ctx.fillRect(x + off, 9, 22, 16);
      ctx.fillRect(x - off, H - 25, 22, 16);
    }
    ctx.fillStyle = '#fff';
    ctx.font = `700 22px ${T.BODY_FONT}`;
    ctx.fillText(`${s.kind === 'series' ? '📺 SERIES' : '🎬 MOVIE'}${s.platform ? `  ·  ${s.platform.toUpperCase()}` : ''}`, 36, 80);
    const { lines, size } = T.fitText(ctx, s.title, { maxWidth: W - 72, maxLines: 2, start: 58, min: 30, weight: 700, family: T.FONT });
    lines.forEach((ln, i) => ctx.fillText(ln, 36, 140 + i * (size + 6)));
    const y = 140 + lines.length * (size + 6) + 6;
    ctx.font = '30px serif';
    ctx.fillText('★'.repeat(s.rating || 0) + '☆'.repeat(5 - (s.rating || 0)), 36, y);
    ctx.font = `700 22px ${T.BODY_FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(`Recommended by ${s.by}`, 36, H - 52);
    ctx.textAlign = 'right';
    ctx.fillText(`CH ${(state.slide % slides.length) + 1}`, W - 30, 80);
    ctx.textAlign = 'left';
    // vignette + scanlines
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    for (let yy = 0; yy < H; yy += 3) ctx.fillRect(0, yy, W, 1);
  }

  let jiggle = 0;
  let drawAcc = 0;
  onFrame((dt, t) => {
    jiggle = Math.max(0, jiggle - dt * 2);
    inner.rotation.z = Math.sin(t * 40) * jiggle * 0.02;
    if (state.mode === 'off' && state.phase === 'off') return;
    state.t += dt;
    drawAcc += dt;
    if (drawAcc < 1 / 30) return;
    drawAcc = 0;
    const ctx = tex.userData.ctx;
    ctx.clearRect(0, 0, W, H);
    if (state.phase === 'boot') {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      const k = Math.min(1, state.t / 0.35);
      const bh = Math.max(2, H * k * k);
      ctx.fillStyle = '#e8f6ff';
      ctx.fillRect(W * 0.5 * (1 - Math.min(1, k * 3)), H / 2 - bh / 2, W * Math.min(1, k * 3), bh);
      tvLight.intensity = 10 * k;
      if (state.t > 0.35) Object.assign(state, { phase: 'static', t: 0 });
    } else if (state.phase === 'static') {
      drawStatic(ctx, t);
      tvLight.intensity = 8 + Math.random() * 6;
      if (state.t > 0.45) Object.assign(state, { phase: 'show', t: 0, slideT: 0 });
    } else if (state.phase === 'show') {
      state.slideT += 1 / 30;
      if (state.slideT > 4.2) {
        state.slide++;
        Object.assign(state, { phase: 'static', t: 0.3 });
      }
      drawSlide(ctx, t);
      tvLight.intensity = 9;
    } else if (state.phase === 'shutdown') {
      drawSlide(ctx, t);
      const k = Math.min(1, state.t / 0.4);
      ctx.fillStyle = '#000';
      const keep = H * (1 - k) * (1 - k);
      ctx.fillRect(0, 0, W, H / 2 - keep / 2);
      ctx.fillRect(0, H / 2 + keep / 2, W, H);
      if (k > 0.7) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#e8f6ff';
        const dot = (1 - k) * 60;
        ctx.beginPath();
        ctx.arc(W / 2, H / 2, dot, 0, Math.PI * 2);
        ctx.fill();
      }
      tvLight.intensity = 9 * (1 - k);
      if (state.t > 0.45) {
        Object.assign(state, { mode: 'off', phase: 'off' });
        tex.userData.redraw(drawOff);
        tvLight.intensity = 0;
        return;
      }
    }
    tex.needsUpdate = true;
  });
  tex.userData.redraw(drawOff);

  room.tv = {
    setSlides(fn) {
      state.getSlides = fn;
    },
    turnOn() {
      jiggle = 1;
      Object.assign(state, { mode: 'on', phase: 'boot', t: 0 });
    },
    turnOff() {
      if (state.mode === 'off') return;
      Object.assign(state, { phase: 'shutdown', t: 0 });
    },
    get isOn() {
      return state.mode === 'on';
    },
  };

  registerProp('tv', tv, {
    label: 'Movie & Series TV', icon: '📺', accent: '#228be6',
    labelAt: new THREE.Vector3(0, 2.62, 0.2),
    onClick: () => open('tv'),
    focus: { offset: new THREE.Vector3(-1.4, 0.4, 6.6), look: new THREE.Vector3(0, 1.3, 0) },
  });
}

// ---------------------------------------------------------------- Too Good To Go basket
function buildBasket(open) {
  const g = new THREE.Group();
  g.position.set(-3.0, 0, 0.9);
  g.rotation.y = 0.25;
  scene.add(g);
  const inner = new THREE.Group();
  g.add(inner);
  const profile = [[0.0, 0.0], [0.52, 0.0], [0.62, 0.08], [0.72, 0.4], [0.8, 0.72]].map(([x, y]) => new THREE.Vector2(x, y));
  const wicker = T.wickerTexture();
  mesh(new THREE.LatheGeometry(profile, 36), std('#ffffff', { map: wicker, side: THREE.DoubleSide, roughness: 0.9 }), inner, 0, 0, 0);
  const rim = mesh(new THREE.TorusGeometry(0.8, 0.06, 10, 40), std('#a86f32', { roughness: 0.8 }), inner, 0, 0.72, 0);
  rim.rotation.x = Math.PI / 2;
  const handle = mesh(new THREE.TorusGeometry(0.78, 0.05, 8, 32, Math.PI), std('#a86f32', { roughness: 0.8 }), inner, 0, 0.72, 0);
  handle.scale.y = 1.05;
  // Cloth liner
  const cloth = mesh(new THREE.CircleGeometry(0.7, 24), std('#ff8787', { roughness: 1, side: THREE.DoubleSide }), inner, 0, 0.42, 0);
  cloth.rotation.x = -Math.PI / 2;

  // Food items that appear as giveaways are listed
  const itemsGroup = new THREE.Group();
  inner.add(itemsGroup);
  const makers = [
    () => { const a = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), std('#e03131', { roughness: 0.35 })); mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.1), std('#5c3d1e'), a, 0, 0.18, 0); mesh(new THREE.SphereGeometry(0.06, 8, 6), std('#40c057'), a, 0.05, 0.19, 0).scale.set(1, 0.4, 0.6); return a; },
    () => { const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.38, 4, 12), std('#d9a05b', { roughness: 0.8 })); b.rotation.z = Math.PI / 2; return b; },
    () => { const o = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), std('#fd7e14', { roughness: 0.6 })); return o; },
    () => { const c = new THREE.Group(); mesh(new THREE.BoxGeometry(0.22, 0.34, 0.22), std('#f8f9fa'), c, 0, 0.05, 0); mesh(new THREE.BoxGeometry(0.225, 0.12, 0.225), std('#4dabf7'), c, 0, -0.02, 0); return c; },
    () => { const cr = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.065, 10, 16, Math.PI * 1.3), std('#e8a25a', { roughness: 0.7 })); cr.rotation.x = Math.PI / 2; return cr; },
    () => { const m = new THREE.Group(); mesh(new THREE.CylinderGeometry(0.13, 0.1, 0.14, 14), std('#f3c4d7'), m, 0, 0, 0); mesh(new THREE.SphereGeometry(0.15, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), std('#7b4a2a'), m, 0, 0.07, 0); return m; },
    () => { const p = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10), std('#94d82d', { roughness: 0.5 })); p.scale.set(0.9, 1.15, 0.9); return p; },
  ];
  const spots = [[0, 0.55, 0], [0.32, 0.55, 0.15], [-0.3, 0.55, 0.12], [0.12, 0.55, -0.3], [-0.18, 0.55, -0.28], [0.05, 0.72, 0.05], [0.3, 0.68, -0.12]];
  let hop = 0;
  function setCount(n) {
    while (itemsGroup.children.length > n) itemsGroup.remove(itemsGroup.children[itemsGroup.children.length - 1]);
    while (itemsGroup.children.length < Math.min(n, spots.length)) {
      const i = itemsGroup.children.length;
      const it = makers[i % makers.length]();
      it.traverse((o) => { o.castShadow = true; });
      it.position.set(...spots[i]);
      it.userData.base = spots[i][1];
      it.rotation.y = i * 1.3;
      itemsGroup.add(it);
    }
  }
  setCount(0);

  // Hanging "Too Good To Go" tag
  const tagTex = T.canvasTexture(320, 120, (ctx, w, h) => {
    ctx.fillStyle = '#0f8a4a';
    T.roundRect(ctx, 0, 0, w, h, 26);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(30, h / 2, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `700 34px ${T.FONT}`;
    ctx.fillText('Too Good', 56, 52);
    ctx.fillText('To Go 🌱', 56, 92);
  });
  const tagPivot = new THREE.Group();
  tagPivot.position.set(0.55, 1.2, 0.35);
  inner.add(tagPivot);
  const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.3), std('#ffffff', { map: tagTex, side: THREE.DoubleSide, roughness: 0.6 }));
  tag.position.y = -0.22;
  tag.castShadow = true;
  tagPivot.add(tag);

  onFrame((dt, t) => {
    hop = Math.max(0, hop - dt * 1.4);
    tagPivot.rotation.z = Math.sin(t * 1.6) * 0.12 + Math.sin(t * 14) * hop * 0.4;
    inner.rotation.z = Math.sin(t * 22) * hop * 0.04;
    itemsGroup.children.forEach((it, i) => {
      it.position.y = it.userData.base + Math.abs(Math.sin(t * 9 + i)) * hop * 0.35;
    });
  });

  room.basket = {
    setCount,
    hop: () => {
      hop = 1;
    },
  };
  registerProp('basket', g, {
    label: 'Too Good To Go', icon: '🧺', accent: '#0f8a4a',
    labelAt: new THREE.Vector3(0, 1.9, 0),
    onClick: () => open('basket'),
    focus: { offset: new THREE.Vector3(1.6, 3.0, 4.6), look: new THREE.Vector3(0, 0.5, 0) },
  });
}

// ---------------------------------------------------------------- request box
function buildRequestBox(open) {
  const g = new THREE.Group();
  g.position.set(3.7, 0, 1.0);
  g.rotation.y = -0.35;
  scene.add(g);
  const inner = new THREE.Group();
  g.add(inner);
  mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.05, 12), std('#3d3846', { metalness: 0.3 }), inner, 0, 0.52, 0);
  mesh(new THREE.CylinderGeometry(0.35, 0.4, 0.06, 20), std('#3d3846', { metalness: 0.3 }), inner, 0, 0.03, 0);
  const box = mesh(rbox(1.05, 0.8, 0.72, 0.12), std('#fab005', { roughness: 0.4 }), inner, 0, 1.42, 0);
  mesh(rbox(0.62, 0.06, 0.06, 0.02), std('#2b2530'), box, 0, 0.26, 0.35);
  const labelTex = T.canvasTexture(320, 120);
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.32), std('#ffffff', { map: labelTex, roughness: 0.6 }));
  label.position.set(0, -0.07, 0.365);
  box.add(label);
  const flagPivot = new THREE.Group();
  flagPivot.position.set(0.54, 0.05, 0.1);
  box.add(flagPivot);
  const pole = mesh(new THREE.BoxGeometry(0.04, 0.55, 0.04), std('#2b2530'), flagPivot, 0, 0.27, 0);
  mesh(new THREE.BoxGeometry(0.03, 0.2, 0.28), std('#e03131'), pole, 0, 0.17, -0.13);

  let up = 0;
  let upTarget = 0;
  let bounce = 0;
  onFrame((dt, t) => {
    up += (upTarget - up) * dt * 5;
    bounce = Math.max(0, bounce - dt * 1.5);
    flagPivot.rotation.x = -(1 - up) * 1.4;
    inner.rotation.z = Math.sin(t * 20) * bounce * 0.05;
  });
  room.requestBox = {
    setCount(n) {
      upTarget = n > 0 ? 1 : 0;
      labelTex.userData.redraw((ctx, w, h) => {
        ctx.fillStyle = '#fff9db';
        T.roundRect(ctx, 0, 0, w, h, 20);
        ctx.fill();
        ctx.fillStyle = '#5c3c00';
        ctx.font = `700 40px ${T.FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText('REQUESTS', w / 2, 58);
        ctx.font = `700 28px ${T.BODY_FONT}`;
        ctx.fillText(n ? `${n} open` : 'all done ✓', w / 2, 98);
      });
    },
    bounce: () => {
      bounce = 1;
    },
  };
  room.requestBox.setCount(0);
  registerProp('requests', g, {
    label: 'Request Box', icon: '📌', accent: '#f59f00',
    labelAt: new THREE.Vector3(0, 2.25, 0),
    onClick: () => open('requests'),
    focus: { offset: new THREE.Vector3(-1.2, 1.6, 4.8), look: new THREE.Vector3(0, 1.3, 0) },
  });
}

// ---------------------------------------------------------------- arcade
function buildArcade(open) {
  const g = new THREE.Group();
  g.position.set(8.35, 0, -4.0);
  g.rotation.y = -0.75;
  scene.add(g);
  const purple = std('#5f3dc4', { roughness: 0.45 });
  const darkP = std('#2b2350', { roughness: 0.5 });
  mesh(rbox(1.5, 1.75, 1.2, 0.06), purple, g, 0, 0.875, 0);
  const panel = mesh(rbox(1.5, 0.16, 0.75, 0.04), darkP, g, 0, 1.82, 0.32);
  panel.rotation.x = 0.28;
  mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.22, 8), std('#222'), panel, -0.35, 0.16, 0);
  mesh(new THREE.SphereGeometry(0.075, 14, 10), std('#e03131', { roughness: 0.3 }), panel, -0.35, 0.28, 0);
  ['#ffd43b', '#4dabf7', '#69db7c'].forEach((c, i) => mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 14), std(c, { roughness: 0.3 }), panel, 0.1 + i * 0.22, 0.09, 0.05));
  mesh(rbox(1.5, 1.55, 0.85, 0.06), purple, g, 0, 2.7, -0.18);
  const bezel = mesh(rbox(1.32, 1.08, 0.06, 0.03), std('#111'), g, 0, 2.72, 0.24);
  bezel.rotation.x = -0.1;
  const scrW = 256;
  const scrH = 210;
  const tex = T.canvasTexture(scrW, scrH);
  tex.magFilter = THREE.NearestFilter;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.98), glow({ map: tex }));
  screen.position.set(0, 0, 0.035);
  bezel.add(screen);
  mesh(rbox(1.58, 0.45, 0.98, 0.05), darkP, g, 0, 3.67, -0.12);
  const marqueeTex = T.canvasTexture(400, 110, (ctx, w, h) => {
    const gr = ctx.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, '#f72585');
    gr.addColorStop(1, '#7209b7');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, w, h);
    ctx.font = `700 64px ${T.FONT}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.shadowColor = '#fff';
    ctx.shadowBlur = 14;
    ctx.fillText('GAMES', w / 2, 78);
  });
  const marquee = new THREE.Mesh(new THREE.PlaneGeometry(1.45, 0.38), glow({ map: marqueeTex }));
  marquee.position.set(0, 3.67, 0.375);
  g.add(marquee);
  for (const sx of [-1, 1]) mesh(new THREE.BoxGeometry(0.03, 3.4, 0.06), glow({ color: '#ff4fd8' }), g, sx * 0.765, 1.95, 0.55);
  const neon = new THREE.PointLight('#c77dff', 6, 6, 1.5);
  neon.position.set(0, 2.8, 1.2);
  g.add(neon);

  // Mini pong attract mode
  const pong = { bx: 120, by: 100, vx: 90, vy: 70, p1: 100, p2: 100, s1: 3, s2: 2 };
  let flash = 0;
  let acc = 0;
  onFrame((dt, t) => {
    flash = Math.max(0, flash - dt);
    acc += dt;
    if (acc < 1 / 24) return;
    const step = acc;
    acc = 0;
    pong.bx += pong.vx * step;
    pong.by += pong.vy * step;
    if (pong.by < 30 || pong.by > scrH - 10) pong.vy *= -1;
    if (pong.bx < 22) { pong.vx = Math.abs(pong.vx); if (Math.abs(pong.by - pong.p1) > 24) pong.s2++; }
    if (pong.bx > scrW - 22) { pong.vx = -Math.abs(pong.vx); if (Math.abs(pong.by - pong.p2) > 24) pong.s1++; }
    pong.p1 += (pong.by - pong.p1) * step * 3.2;
    pong.p2 += (pong.by - pong.p2) * step * 2.6;
    const ctx = tex.userData.ctx;
    ctx.fillStyle = flash > 0 ? `rgba(255,255,255,${flash})` : '#0b0820';
    ctx.fillRect(0, 0, scrW, scrH);
    ctx.fillStyle = '#7df9ff';
    for (let y = 30; y < scrH; y += 14) ctx.fillRect(scrW / 2 - 1, y, 2, 7);
    ctx.fillRect(10, pong.p1 - 18, 6, 36);
    ctx.fillStyle = '#ff6bd6';
    ctx.fillRect(scrW - 16, pong.p2 - 18, 6, 36);
    ctx.fillStyle = '#fff';
    ctx.fillRect(pong.bx - 4, pong.by - 4, 8, 8);
    ctx.font = '700 18px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${pong.s1 % 10}   ${pong.s2 % 10}`, scrW / 2, 22);
    if (Math.floor(t * 2) % 2 === 0) {
      ctx.fillStyle = '#ffe066';
      ctx.font = '700 14px monospace';
      ctx.fillText('PRESS START', scrW / 2, scrH - 14);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let y = 0; y < scrH; y += 3) ctx.fillRect(0, y, scrW, 1);
    ctx.textAlign = 'left';
    tex.needsUpdate = true;
    neon.intensity = 5 + Math.sin(t * 3) * 1.5;
  });

  room.arcade = {
    flash: () => {
      flash = 1;
    },
  };
  registerProp('games', g, {
    label: 'Game Arcade', icon: '🕹️', accent: '#7950f2',
    labelAt: new THREE.Vector3(0, 4.25, 0),
    onClick: () => open('games'),
    focus: { offset: new THREE.Vector3(-3.6, 0.9, 3.4), look: new THREE.Vector3(0, 2.4, 0) },
  });
}

// ---------------------------------------------------------------- jukebox
function buildJukebox(open) {
  const g = new THREE.Group();
  g.position.set(-9.45, 0, -2.0);
  g.rotation.y = Math.PI / 2;
  scene.add(g);
  const inner = new THREE.Group();
  g.add(inner);
  const body = std('#8a2346', { roughness: 0.4, metalness: 0.15 });
  const trim = std('#f1c453', { roughness: 0.3, metalness: 0.7 });
  const dark = std('#2a1620', { roughness: 0.6 });
  // Cabinet: rounded block topped with a half-cylinder dome
  mesh(rbox(1.35, 1.35, 0.8, 0.08), body, inner, 0, 0.82, 0);
  const domeGeo = new THREE.CylinderGeometry(0.675, 0.675, 0.8, 32, 1, false, 0, Math.PI);
  domeGeo.rotateX(Math.PI / 2);
  domeGeo.rotateZ(Math.PI / 2);
  mesh(domeGeo, body, inner, 0, 1.5, 0);
  mesh(rbox(1.5, 0.14, 0.9, 0.05), dark, inner, 0, 0.07, 0);
  for (const x of [-0.6, 0.6]) mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.1, 10), dark, inner, x, 0.02, 0.28);
  // Screen with the track name and an equalizer
  const tex = T.canvasTexture(320, 240);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.75), glow({ map: tex }));
  screen.position.set(0, 1.28, 0.405);
  inner.add(screen);
  mesh(rbox(1.1, 0.85, 0.05, 0.03), trim, inner, 0, 1.28, 0.385).castShadow = false;
  // Speaker grille & coin slot
  const grille = mesh(new THREE.CircleGeometry(0.3, 28), std('#ffffff', { map: T.grilleTexture(), roughness: 0.8 }), inner, 0, 0.5, 0.405);
  grille.castShadow = false;
  mesh(rbox(0.22, 0.05, 0.04, 0.01), dark, inner, 0.0, 0.88, 0.41);
  // Neon tubes
  const neonMat = glow({ color: '#ff4fd8' });
  const arc = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.03, 8, 40, Math.PI), neonMat);
  arc.position.set(0, 1.5, 0.42);
  arc.layers.set(FX_LAYER);
  inner.add(arc);
  const sideMat = glow({ color: '#4dd9ff' });
  for (const x of [-0.64, 0.64]) {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.3, 8), sideMat);
    tube.position.set(x, 0.82, 0.42);
    tube.layers.set(FX_LAYER);
    inner.add(tube);
  }
  const light = new THREE.PointLight('#ff6ee0', 0, 7, 1.6);
  light.position.set(0, 1.4, 1.4);
  inner.add(light);

  const state = { name: 'Rainy Window', mood: '', playing: false, bpm: 72, level: () => 0 };
  const bars = Array.from({ length: 14 }, () => 0);
  let drawAcc = 0;
  let bounce = 0;
  onFrame((dt, t) => {
    bounce = Math.max(0, bounce - dt * 1.5);
    const hue = (t * 40) % 360;
    const on = state.playing;
    neonMat.color.setHSL(((300 + (on ? hue * 0.4 : 0)) % 360) / 360, 1, on ? 0.62 : 0.4);
    sideMat.color.setHSL(((190 + (on ? hue * 0.3 : 0)) % 360) / 360, 1, on ? 0.6 : 0.35);
    light.intensity = on ? 4 + Math.sin(t * 5) * 1.5 : 0.6;
    inner.rotation.z = Math.sin(t * 22) * bounce * 0.03;
    inner.position.y = on ? Math.abs(Math.sin((t * state.bpm) / 60 * Math.PI)) * 0.012 : 0;
    drawAcc += dt;
    if (drawAcc < 1 / 20) return;
    drawAcc = 0;
    const beat = (t * state.bpm) / 60;
    const real = state.level();
    bars.forEach((_, i) => {
      const fake = on ? 0.25 + 0.55 * Math.abs(Math.sin(beat * Math.PI * (0.5 + (i % 5) * 0.23) + i)) * (0.6 + 0.4 * Math.sin(beat * 2 + i * 1.7)) : 0.04;
      const target = real > 0.02 ? Math.min(1, fake * 0.5 + real * (0.5 + 0.5 * Math.sin(i * 1.3 + t * 3))) : fake;
      bars[i] += (target - bars[i]) * 0.5;
    });
    tex.userData.redraw((ctx, w, h) => {
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#2b1055');
      bg.addColorStop(1, '#120a2a');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      ctx.textAlign = 'center';
      ctx.fillStyle = on ? '#ffe3fb' : '#a99bc2';
      ctx.font = `700 ${state.name.length > 14 ? 30 : 36}px ${T.FONT}`;
      ctx.fillText(state.name, w / 2, 62);
      ctx.fillStyle = '#c9a8ff';
      ctx.font = `600 20px ${T.BODY_FONT}`;
      ctx.fillText(on ? '♪ now playing' : '❚❚ paused', w / 2, 94);
      const bw = (w - 60) / bars.length;
      bars.forEach((v, i) => {
        const bh = 10 + v * 100;
        const gr = ctx.createLinearGradient(0, h - 24 - bh, 0, h - 24);
        gr.addColorStop(0, '#ff6ee0');
        gr.addColorStop(1, '#4dd9ff');
        ctx.fillStyle = gr;
        ctx.fillRect(30 + i * bw + 2, h - 24 - bh, bw - 4, bh);
      });
    });
  });

  room.jukebox = {
    setInfo(info) {
      Object.assign(state, info);
    },
    setLevelFn(fn) {
      state.level = fn;
    },
    bounce: () => {
      bounce = 1;
    },
  };
  registerProp('jukebox', g, {
    label: 'Jukebox', icon: '🎵', accent: '#d6336c', hoverLift: false,
    labelAt: new THREE.Vector3(0, 2.35, 0.2),
    onClick: () => open('jukebox'),
    focus: { offset: new THREE.Vector3(1, 0, 0.15), look: new THREE.Vector3(0, 1.0, 0), fit: { w: 2.6, h: 2.8 } },
  });
}

// ---------------------------------------------------------------- dartboard
const DART_SECTORS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

function dartboardTexture() {
  return T.canvasTexture(512, 512, (ctx, w) => {
    const c = w / 2;
    const R = c - 6;
    const ring = (r0, r1, a0, a1, color) => {
      ctx.beginPath();
      ctx.arc(c, c, R * r1, a0, a1);
      ctx.arc(c, c, R * r0, a1, a0, true);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    };
    ctx.fillStyle = '#15151b';
    ctx.beginPath();
    ctx.arc(c, c, c, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 20; i++) {
      const a0 = (i * 18 - 9 - 90) * (Math.PI / 180);
      const a1 = a0 + (18 * Math.PI) / 180;
      const dark = i % 2 === 0;
      const base = dark ? '#1c1c22' : '#f3e6c4';
      const accent = dark ? '#d6283a' : '#1f9d55';
      ring(0.0935, 0.953, a0, a1, base);
      ring(0.953, 1.0, a0, a1, accent);
      ring(0.582, 0.629, a0, a1, accent);
    }
    ring(0.0374, 0.0935, 0, Math.PI * 2, '#1f9d55');
    ring(0, 0.0374, 0, Math.PI * 2, '#d6283a');
    // wires
    ctx.strokeStyle = 'rgba(200,200,210,0.7)';
    ctx.lineWidth = 1.2;
    for (const f of [0.0374, 0.0935, 0.582, 0.629, 0.953, 1]) {
      ctx.beginPath();
      ctx.arc(c, c, R * f, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let i = 0; i < 20; i++) {
      const a = (i * 18 - 9 - 90) * (Math.PI / 180);
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * R * 0.0935, c + Math.sin(a) * R * 0.0935);
      ctx.lineTo(c + Math.cos(a) * R, c + Math.sin(a) * R);
      ctx.stroke();
    }
    ctx.fillStyle = '#fff';
    ctx.font = `700 34px ${T.FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    DART_SECTORS.forEach((n, i) => {
      const a = (i * 18 - 90) * (Math.PI / 180);
      ctx.fillText(String(n), c + Math.cos(a) * (c - 1) * 0.985, c + Math.sin(a) * (c - 1) * 0.985);
    });
  });
}

function buildDartboard(open) {
  const g = new THREE.Group();
  g.position.set(-9.9, 4.7, 1.2);
  g.rotation.y = Math.PI / 2;
  scene.add(g);
  const inner = new THREE.Group();
  g.add(inner);
  const R = 0.95;
  // Cabinet: wooden surround with two little doors that stay open
  const wood = std('#7a4a2a', { roughness: 0.55 });
  const surround = mesh(new THREE.CylinderGeometry(R + 0.22, R + 0.22, 0.12, 40), wood, inner, 0, 0, 0.04);
  surround.rotation.x = Math.PI / 2;
  mesh(new THREE.CylinderGeometry(R, R, 0.08, 48), std('#15151b'), inner, 0, 0, 0.12).rotation.x = Math.PI / 2;
  const face = new THREE.Mesh(new THREE.CircleGeometry(R, 48), new THREE.MeshStandardMaterial({ map: dartboardTexture(), roughness: 0.85 }));
  face.position.z = 0.165;
  face.receiveShadow = true;
  inner.add(face);
  // Darts stuck in the board
  const dartGroup = new THREE.Group();
  inner.add(dartGroup);
  const makeDart = (color) => {
    const d = new THREE.Group();
    const barrel = mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.28, 10), std('#c0c4cc', { metalness: 0.8, roughness: 0.3 }), d, 0, 0, 0.16);
    barrel.rotation.x = Math.PI / 2;
    const tip = mesh(new THREE.CylinderGeometry(0.003, 0.012, 0.1, 8), std('#e9ecef', { metalness: 0.9 }), d, 0, 0, 0.03);
    tip.rotation.x = Math.PI / 2;
    mesh(new THREE.BoxGeometry(0.18, 0.012, 0.12), std(color), d, 0, 0, 0.34);
    mesh(new THREE.BoxGeometry(0.012, 0.18, 0.12), std(color), d, 0, 0, 0.34);
    return d;
  };
  [[0.3, -0.38, '#e03131'], [-0.05, -0.05, '#228be6'], [0.0, -0.57, '#e03131']].forEach(([x, y, color], i) => {
    const d = makeDart(color);
    d.position.set(x * R, -y * R, 0.165);
    d.rotation.set(0.08 * (i - 1), -0.1 * i, 0);
    dartGroup.add(d);
  });
  let shake = 0;
  onFrame((dt, t) => {
    shake = Math.max(0, shake - dt * 1.6);
    dartGroup.rotation.z = Math.sin(t * 40) * shake * 0.03;
    inner.rotation.z = Math.sin(t * 40) * shake * 0.01;
  });
  room.dartboard = {
    shake: () => {
      shake = 1;
    },
  };
  registerProp('darts', g, {
    label: 'Darts', icon: '🎯', accent: '#d6283a', hoverLift: false,
    labelAt: new THREE.Vector3(0, -R - 0.5, 0.3),
    onClick: () => open('darts'),
    focus: { offset: new THREE.Vector3(1, 0, 0.12), fit: { w: 3.0, h: 3.0 } },
  });
}

// ---------------------------------------------------------------- trash can
function buildTrash(open) {
  const g = new THREE.Group();
  g.position.set(-3.75, 0, -6.15);
  scene.add(g);
  const inner = new THREE.Group();
  g.add(inner);
  const metal = std('#20c997', { roughness: 0.35, metalness: 0.35, side: THREE.DoubleSide });
  mesh(new THREE.CylinderGeometry(0.42, 0.33, 1.0, 28, 1, true), metal, inner, 0, 0.5, 0);
  mesh(new THREE.CircleGeometry(0.33, 24), std('#12b886'), inner, 0, 0.01, 0).rotation.x = -Math.PI / 2;
  mesh(new THREE.TorusGeometry(0.42, 0.03, 8, 30), std('#e6fcf5', { metalness: 0.3 }), inner, 0, 1.0, 0).rotation.x = Math.PI / 2;
  // ribs
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const rib = mesh(new THREE.BoxGeometry(0.04, 0.9, 0.02), std('#0ca678'), inner, Math.cos(a) * 0.385, 0.5, Math.sin(a) * 0.385);
    rib.rotation.y = -a;
    rib.rotation.z = Math.cos(a) * 0.09;
    rib.rotation.x = -Math.sin(a) * 0.09;
  }
  // Lid hinged at the back
  const hinge = new THREE.Group();
  hinge.position.set(0, 1.02, -0.42);
  inner.add(hinge);
  const lid = mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.07, 28), std('#12b886', { roughness: 0.3, metalness: 0.35 }), hinge, 0, 0.03, 0.42);
  mesh(new THREE.TorusGeometry(0.1, 0.025, 8, 16, Math.PI), std('#e6fcf5'), lid, 0, 0.04, 0);
  // Generous invisible hit area so it's an easy drop target
  const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 1.9, 12), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.y = 0.9;
  g.add(hit);

  let open01 = 0;
  let openTarget = 0;
  let gulp = 0;
  onFrame((dt, t) => {
    open01 += (openTarget - open01) * Math.min(1, dt * 12);
    gulp = Math.max(0, gulp - dt * 1.8);
    hinge.rotation.x = -open01 * 1.25 - Math.abs(Math.sin(t * 18)) * gulp * 0.6;
    inner.rotation.z = Math.sin(t * 25) * gulp * 0.06;
    inner.scale.setScalar(1 + open01 * 0.08);
  });
  room.trash = {
    group: g,
    worldPos: new THREE.Vector3(-3.75, 1.2, -6.15),
    setOpen(on) {
      openTarget = on ? 1 : 0;
    },
    gulp() {
      gulp = 1;
      openTarget = 0;
    },
  };
  registerProp('trash', g, {
    label: 'Trash', icon: '🗑️', accent: '#0ca678', hoverLift: false,
    labelAt: new THREE.Vector3(0, 1.55, 0),
    onClick: () => {
      gulp = 0.6;
      open('trash');
    },
  });
}

// ---------------------------------------------------------------- coffee table & cake
function buildCoffeeTable(open) {
  const g = new THREE.Group();
  g.position.set(0.4, 0, -1.25);
  scene.add(g);
  const wood = std('#c98d55', { roughness: 0.5 });
  mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.1, 40), wood, g, 0, 0.86, 0);
  mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.8, 14), std('#3d3846'), g, 0, 0.42, 0);
  mesh(new THREE.CylinderGeometry(0.6, 0.65, 0.05, 30), std('#3d3846'), g, 0, 0.03, 0);

  // Vase with tulips
  const vase = new THREE.Group();
  vase.position.set(0.45, 0.91, -0.2);
  g.add(vase);
  mesh(new THREE.CylinderGeometry(0.14, 0.11, 0.42, 18), std('#74c0fc', { roughness: 0.2, metalness: 0.1 }), vase, 0, 0.21, 0);
  ['#ff6b6b', '#ffd43b', '#f783ac'].forEach((c, i) => {
    const a = (i / 3) * Math.PI * 2;
    const stem = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5), std('#2f9e44'), vase, Math.cos(a) * 0.05, 0.6, Math.sin(a) * 0.05);
    stem.rotation.set(Math.sin(a) * 0.2, 0, -Math.cos(a) * 0.2);
    mesh(new THREE.SphereGeometry(0.07, 10, 8), std(c, { roughness: 0.5 }), stem, 0, 0.27, 0).scale.y = 1.4;
  });
  // A few books
  mesh(rbox(0.6, 0.08, 0.45, 0.02), std('#4263eb'), g, -0.45, 0.95, 0.25).rotation.y = 0.3;
  mesh(rbox(0.55, 0.07, 0.4, 0.02), std('#f08c00'), g, -0.42, 1.02, 0.24).rotation.y = 0.1;

  // Cake (hidden unless someone celebrates)
  const cake = new THREE.Group();
  cake.position.set(-0.1, 0.91, 0.1);
  cake.visible = false;
  g.add(cake);
  mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.05, 36), std('#f8f9fa', { roughness: 0.3 }), cake, 0, 0.025, 0);
  mesh(new THREE.CylinderGeometry(0.5, 0.52, 0.34, 36), std('#f7a8c4', { roughness: 0.6 }), cake, 0, 0.22, 0);
  mesh(new THREE.TorusGeometry(0.5, 0.045, 8, 36), std('#fff0f6'), cake, 0, 0.39, 0).rotation.x = Math.PI / 2;
  mesh(new THREE.CylinderGeometry(0.36, 0.38, 0.28, 36), std('#fff3e0', { roughness: 0.6 }), cake, 0, 0.53, 0);
  mesh(new THREE.TorusGeometry(0.36, 0.04, 8, 36), std('#f783ac'), cake, 0, 0.67, 0).rotation.x = Math.PI / 2;
  const sprinkleCols = ['#ff6b6b', '#4dabf7', '#ffd43b', '#69db7c', '#da77f2'];
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * 0.3;
    const s = mesh(new THREE.BoxGeometry(0.04, 0.012, 0.012), std(sprinkleCols[i % 5]), cake, Math.cos(a) * r, 0.675, Math.sin(a) * r);
    s.rotation.y = Math.random() * 3;
    s.castShadow = false;
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    mesh(new THREE.SphereGeometry(0.05, 10, 8), std('#e03131', { roughness: 0.3 }), cake, Math.cos(a) * 0.43, 0.42, Math.sin(a) * 0.43);
  }
  const flames = [];
  const flameMat = glow({ color: '#ffc94d' });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    const candle = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.26, 10), std(sprinkleCols[i]), cake, Math.cos(a) * 0.22, 0.8, Math.sin(a) * 0.22);
    mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.04), std('#333'), candle, 0, 0.15, 0);
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), flameMat);
    flame.scale.set(1, 1.9, 1);
    flame.position.set(0, 0.21, 0);
    flame.layers.set(FX_LAYER);
    candle.add(flame);
    flames.push(flame);
  }
  const candleLight = new THREE.PointLight('#ffae42', 0, 5, 1.6);
  candleLight.position.set(0, 1.3, 0);
  cake.add(candleLight);
  let lit = true;
  let relight = 0;
  onFrame((dt, t) => {
    if (!cake.visible) return;
    if (!lit) {
      relight -= dt;
      if (relight <= 0) lit = true;
    }
    flames.forEach((f, i) => {
      f.visible = lit;
      f.scale.set(1 + Math.sin(t * 23 + i) * 0.1, 1.9 + Math.sin(t * 17 + i * 2) * 0.3, 1);
    });
    candleLight.intensity = lit ? 3 + Math.sin(t * 20) * 0.6 : 0;
    cake.rotation.y = Math.sin(t * 0.5) * 0.15;
  });

  room.cake = {
    group: cake,
    show(on) {
      cake.visible = on;
      vase.visible = !on;
      lit = true;
    },
    blowOut() {
      if (!lit) return false;
      lit = false;
      relight = 6;
      return true;
    },
  };
  registerProp('cake', cake, {
    hoverLift: false,
    onClick: () => open('cake'),
    focus: { offset: new THREE.Vector3(0, 1.7, 4.2), look: new THREE.Vector3(0, 0.5, 0) },
  });
}

// ---------------------------------------------------------------- decor
function buildPlant(x, z, scale = 1) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.scale.setScalar(scale);
  scene.add(g);
  mesh(new THREE.CylinderGeometry(0.45, 0.34, 0.85, 24), std('#d9704a', { roughness: 0.8 }), g, 0, 0.425, 0);
  mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 24), std('#4a3426'), g, 0, 0.83, 0);
  const leaves = new THREE.Group();
  leaves.position.y = 0.8;
  g.add(leaves);
  const greens = ['#2f9e44', '#37b24d', '#40c057', '#2b8a3e'];
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2;
    const tilt = 0.35 + (i % 3) * 0.22;
    const stem = new THREE.Group();
    stem.rotation.set(Math.sin(a) * tilt, 0, -Math.cos(a) * tilt);
    leaves.add(stem);
    const len = 0.9 + (i % 4) * 0.25;
    const leaf = mesh(new THREE.SphereGeometry(0.5, 14, 10), std(greens[i % 4], { roughness: 0.6 }), stem, 0, len, 0);
    leaf.scale.set(0.38, len * 0.7, 0.1);
    leaf.rotation.y = a;
  }
  const phase = Math.random() * 10;
  onFrame((dt, t) => {
    leaves.rotation.z = Math.sin(t * 0.8 + phase) * 0.03;
    leaves.rotation.x = Math.cos(t * 0.6 + phase) * 0.02;
  });
}

function buildBeanBag() {
  const bag = mesh(new THREE.SphereGeometry(1, 28, 18), std('#845ef7', { roughness: 0.9 }), scene, -6.3, 0.52, 1.0);
  bag.scale.set(1.0, 0.56, 0.95);
  const top = mesh(new THREE.SphereGeometry(0.6, 20, 14), std('#7048e8', { roughness: 0.9 }), scene, -6.45, 0.95, 0.75);
  top.scale.set(1, 0.5, 0.9);
}

function buildClock() {
  const g = new THREE.Group();
  g.position.set(-9.93, 5.55, -3.0);
  g.rotation.y = Math.PI / 2;
  scene.add(g);
  const rim = mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.1, 40), std('#343a40'), g, 0, 0, 0.02);
  rim.rotation.x = Math.PI / 2;
  const faceTex = T.canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#fffdf7';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#343a40';
    ctx.font = `700 30px ${T.FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 1; i <= 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.fillText(String(i), w / 2 + Math.sin(a) * 96, h / 2 - Math.cos(a) * 96);
    }
  });
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.62, 40), std('#ffffff', { map: faceTex, roughness: 0.5 }));
  face.position.z = 0.075;
  g.add(face);
  const hand = (len, wid, color, z) => {
    const pivot = new THREE.Group();
    pivot.position.z = z;
    g.add(pivot);
    const m = new THREE.Mesh(new THREE.BoxGeometry(wid, len, 0.015), std(color));
    m.position.y = len / 2 - 0.05;
    pivot.add(m);
    return pivot;
  };
  const hr = hand(0.34, 0.05, '#343a40', 0.085);
  const mn = hand(0.5, 0.035, '#343a40', 0.095);
  const sc = hand(0.52, 0.015, '#e03131', 0.105);
  onFrame(() => {
    const d = new Date();
    const s = d.getSeconds() + d.getMilliseconds() / 1000;
    const m = d.getMinutes() + s / 60;
    const hh = (d.getHours() % 12) + m / 60;
    sc.rotation.z = -(s / 60) * Math.PI * 2;
    mn.rotation.z = -(m / 60) * Math.PI * 2;
    hr.rotation.z = -(hh / 12) * Math.PI * 2;
  });
}

function buildShelf(open) {
  // Book Club bookcase on the right wall — each recommended book adds a book to the lower shelf.
  const g = new THREE.Group();
  g.position.set(9.72, 4.75, 1.6);
  g.rotation.y = -Math.PI / 2;
  scene.add(g);
  const inner = new THREE.Group();
  g.add(inner);
  const wood = std('#c98d55', { roughness: 0.55 });
  for (const y of [0, -1.0]) mesh(rbox(3.0, 0.1, 0.55, 0.03), wood, inner, 0, y, 0.25);
  for (const x of [-1.5, 1.5]) mesh(rbox(0.1, 1.15, 0.55, 0.03), wood, inner, x, -0.45, 0.25);
  const cols = ['#e64980', '#4c6ef5', '#fab005', '#12b886', '#7950f2', '#fd7e14', '#15aabf', '#e03131', '#40c057', '#be4bdb', '#f59f00', '#228be6'];
  // Top shelf: a few books, a trophy and a plant
  cols.slice(0, 5).forEach((c, i) => {
    const b = mesh(rbox(0.16, 0.55 + (i % 2) * 0.12, 0.38, 0.02), std(c), inner, -1.25 + i * 0.19, 0.33 + (i % 2) * 0.06, 0.25);
    if (i === 4) b.rotation.z = -0.25;
  });
  const trophy = new THREE.Group();
  trophy.position.set(0.55, 0.05, 0.25);
  inner.add(trophy);
  const gold = std('#fcc419', { metalness: 0.8, roughness: 0.25 });
  mesh(new THREE.BoxGeometry(0.3, 0.1, 0.3), std('#343a40'), trophy, 0, 0.05, 0);
  mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.2, 10), gold, trophy, 0, 0.2, 0);
  mesh(new THREE.CylinderGeometry(0.17, 0.08, 0.25, 20), gold, trophy, 0, 0.42, 0);
  mesh(new THREE.SphereGeometry(0.17, 14, 10), std('#20c997', { roughness: 0.5 }), inner, 1.15, 0.22, 0.25);
  // Lower shelf fills up with recommendations
  const lower = new THREE.Group();
  lower.position.set(-1.35, -0.95, 0.25);
  inner.add(lower);
  let wiggle = 0;
  onFrame((dt, t) => {
    wiggle = Math.max(0, wiggle - dt * 1.5);
    lower.children.forEach((b, i) => {
      b.position.y = b.userData.y + Math.abs(Math.sin(t * 10 + i)) * wiggle * 0.12;
    });
  });
  room.bookshelf = {
    setCount(n) {
      const want = Math.min(n, 14);
      while (lower.children.length > want) lower.remove(lower.children[lower.children.length - 1]);
      while (lower.children.length < want) {
        const i = lower.children.length;
        const hgt = 0.5 + ((i * 7) % 4) * 0.06;
        const b = mesh(rbox(0.15 + (i % 3) * 0.02, hgt, 0.38, 0.02), std(cols[(i + 5) % cols.length]), lower, i * 0.2, hgt / 2, 0);
        b.userData.y = hgt / 2;
        if (i === want - 1 && i > 2) b.rotation.z = -0.18;
      }
    },
    wiggle() {
      wiggle = 1;
    },
  };
  registerProp('books', g, {
    label: 'Book Club', icon: '📚', accent: '#d9480f',
    labelAt: new THREE.Vector3(0, 0.95, 0.3),
    onClick: () => open('books'),
    focus: { offset: new THREE.Vector3(-5.2, 0.2, 0.6), look: new THREE.Vector3(0, -0.4, 0) },
  });
}

/** Build everything. `open(name)` is called when a prop is clicked. */
export function buildRoom(open) {
  buildLights();
  buildRoomShell();
  buildBoard(open);
  buildBirthdayBoard(open);
  buildWindow(open);
  buildNeonSign();
  buildPendants();
  buildFairyLights();
  const desk = buildDesk();
  buildRadio(desk, open);
  buildTV(open);
  buildBasket(open);
  buildRequestBox(open);
  buildTrash(open);
  buildDartboard(open);
  buildJukebox(open);
  buildArcade(open);
  buildCoffeeTable(open);
  buildPlant(-9.0, -6.1, 1.1);
  buildPlant(9.0, -6.2, 1.0);
  buildPlant(-8.9, 3.2, 0.9);
  buildBeanBag();
  buildClock();
  buildShelf(open);
}
