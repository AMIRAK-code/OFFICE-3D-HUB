// Procedural canvas textures, so the office needs no external art assets.
import * as THREE from 'three';

export const FONT = '"Fredoka", "Nunito", system-ui, sans-serif';
export const BODY_FONT = '"Nunito", "Fredoka", system-ui, sans-serif';

export function canvasTexture(w, h, draw, { repeat, srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  draw?.(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  t.userData.ctx = ctx;
  t.userData.redraw = (fn) => {
    ctx.clearRect(0, 0, w, h);
    fn(ctx, w, h);
    t.needsUpdate = true;
  };
  return t;
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export function wrapText(ctx, text, maxWidth, maxLines = 99) {
  const lines = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else line = test;
      // Break very long words.
      while (ctx.measureText(line).width > maxWidth && line.length > 1) {
        let cut = line.length - 1;
        while (cut > 1 && ctx.measureText(line.slice(0, cut)).width > maxWidth) cut--;
        lines.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    lines.push(line);
  }
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1].replace(/.{0,2}$/, '')}…`;
    return kept;
  }
  return lines;
}

/** Fit text by shrinking the font until it wraps into maxLines. Returns { lines, size }. */
export function fitText(ctx, text, { maxWidth, maxLines, start, min, weight = 700, family = BODY_FONT }) {
  let size = start;
  let lines;
  for (;;) {
    ctx.font = `${weight} ${size}px ${family}`;
    lines = wrapText(ctx, text, maxWidth, 99);
    if (lines.length <= maxLines || size <= min) break;
    size -= 2;
  }
  ctx.font = `${weight} ${size}px ${family}`;
  return { lines: lines.length > maxLines ? wrapText(ctx, text, maxWidth, maxLines) : lines, size };
}

const noise = (ctx, w, h, n, alpha, colors) => {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[i % colors.length];
    ctx.globalAlpha = Math.random() * alpha;
    const s = Math.random() * 2 + 0.5;
    ctx.fillRect(Math.random() * w, Math.random() * h, s, s);
  }
  ctx.globalAlpha = 1;
};

export function woodTexture() {
  return canvasTexture(1024, 1024, (ctx, w, h) => {
    const planks = 8;
    const ph = h / planks;
    const tones = ['#c8925c', '#bf8752', '#cf9a63', '#c48d57', '#b98250'];
    for (let i = 0; i < planks; i++) {
      let x = -Math.random() * w * 0.5;
      while (x < w) {
        const len = w * (0.35 + Math.random() * 0.4);
        ctx.fillStyle = tones[Math.floor(Math.random() * tones.length)];
        ctx.fillRect(x, i * ph, len, ph);
        // grain
        ctx.strokeStyle = 'rgba(90,50,20,0.10)';
        ctx.lineWidth = 1.5;
        for (let g = 0; g < 7; g++) {
          const gy = i * ph + Math.random() * ph;
          ctx.beginPath();
          ctx.moveTo(x, gy);
          ctx.bezierCurveTo(x + len * 0.3, gy + (Math.random() - 0.5) * 10, x + len * 0.6, gy + (Math.random() - 0.5) * 10, x + len, gy);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(60,30,10,0.35)';
        ctx.fillRect(x, i * ph, 3, ph);
        x += len;
      }
      ctx.fillStyle = 'rgba(60,30,10,0.35)';
      ctx.fillRect(0, i * ph, w, 3);
    }
    noise(ctx, w, h, 6000, 0.15, ['#5a3518', '#f0c590']);
  }, { repeat: [2.2, 2.2] });
}

export function corkTexture() {
  return canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#c99a62';
    ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, 26000, 0.55, ['#8a5a2b', '#e2b884', '#a8763f', '#f1cf9c', '#6e4520']);
  }, { repeat: [3, 1.7] });
}

export function wallTexture(base = '#f4e7d6') {
  return canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, 9000, 0.06, ['#b89c7c', '#ffffff']);
    // soft vertical stripes
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    for (let x = 0; x < w; x += 64) ctx.fillRect(x, 0, 28, h);
  }, { repeat: [4, 2] });
}

export function wickerTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#b8803f';
    ctx.fillRect(0, 0, w, h);
    const s = 32;
    for (let y = 0; y < h; y += s) {
      for (let x = 0; x < w; x += s) {
        const flip = ((x + y) / s) % 2 === 0;
        const g = ctx.createLinearGradient(x, y, flip ? x + s : x, flip ? y : y + s);
        g.addColorStop(0, '#d9a45c');
        g.addColorStop(0.5, '#efc07a');
        g.addColorStop(1, '#a86f32');
        ctx.fillStyle = g;
        roundRect(ctx, x + 2, y + 2, s - 4, s - 4, 8);
        ctx.fill();
      }
    }
  }, { repeat: [6, 2] });
}

export function rugTexture() {
  return canvasTexture(1024, 600, (ctx, w, h) => {
    ctx.fillStyle = '#f2d7b6';
    roundRect(ctx, 0, 0, w, h, 90);
    ctx.fill();
    ctx.strokeStyle = '#e07a5f';
    ctx.lineWidth = 22;
    roundRect(ctx, 36, 36, w - 72, h - 72, 70);
    ctx.stroke();
    ctx.strokeStyle = '#3d405b';
    ctx.lineWidth = 8;
    roundRect(ctx, 72, 72, w - 144, h - 144, 50);
    ctx.stroke();
    const cols = ['#81b29a', '#f2cc8f', '#e07a5f', '#3d405b'];
    for (let i = 0; i < 9; i++) {
      for (let j = 0; j < 4; j++) {
        ctx.fillStyle = cols[(i + j) % cols.length];
        ctx.beginPath();
        const cx = 150 + i * 90;
        const cy = 170 + j * 88;
        ctx.moveTo(cx, cy - 26);
        ctx.lineTo(cx + 26, cy);
        ctx.lineTo(cx, cy + 26);
        ctx.lineTo(cx - 26, cy);
        ctx.fill();
      }
    }
    noise(ctx, w, h, 12000, 0.12, ['#000', '#fff']);
  });
}

export function grilleTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#fbe8c8';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5b3a1e';
    for (let y = 14; y < h; y += 16) {
      for (let x = 14; x < w; x += 16) {
        if (Math.hypot(x - w / 2, y - h / 2) < w / 2 - 14) {
          ctx.beginPath();
          ctx.arc(x + ((y / 16) % 2 ? 8 : 0), y, 4.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  });
}

/** Wraps an image in a canvas with padding and a soft drop shadow — makes stickers feel stuck on. */
export function stickerCanvas(img, maxSize = 512) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const scale = Math.min(1, maxSize / Math.max(iw, ih));
  const w = Math.round(iw * scale);
  const hh = Math.round(ih * scale);
  const pad = Math.round(Math.max(w, hh) * 0.08);
  const c = document.createElement('canvas');
  c.width = w + pad * 2;
  c.height = hh + pad * 2;
  const ctx = c.getContext('2d');
  ctx.shadowColor = 'rgba(40,20,0,0.45)';
  ctx.shadowBlur = pad * 0.6;
  ctx.shadowOffsetY = pad * 0.35;
  ctx.drawImage(img, pad, pad, w, hh);
  return c;
}
