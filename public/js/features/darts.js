// Darts: the board, the swaying crosshair and the throw controls.
import { store, act } from '../net.js';
import { h } from '../util.js';
import { toastError } from '../ui/kit.js';
import { room } from '../scene/room.js';
import { sfx } from '../audio.js';

const SECTOR_NUMS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
const SVG_NS = 'http://www.w3.org/2000/svg';

function svg(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  el.append(...kids.filter(Boolean));
  return el;
}
const polar = (r, deg) => [Math.sin((deg * Math.PI) / 180) * r, -Math.cos((deg * Math.PI) / 180) * r];
function wedge(r0, r1, d0, d1) {
  const [x0, y0] = polar(r1, d0);
  const [x1, y1] = polar(r1, d1);
  const [x2, y2] = polar(r0, d1);
  const [x3, y3] = polar(r0, d0);
  return `M${x0} ${y0} A${r1} ${r1} 0 0 1 ${x1} ${y1} L${x2} ${y2} A${r0} ${r0} 0 0 0 ${x3} ${y3}Z`;
}

/** The crosshair sways on its own — time your throw to land where you want. */
const sway = (t) => [Math.sin(t * 1.9) * 0.62 + Math.sin(t * 4.3 + 1) * 0.12, Math.cos(t * 1.4 + 0.5) * 0.58 + Math.sin(t * 3.7) * 0.12];

const pending = new Set();

export function throwDart(g) {
  const meIdx = g.players.indexOf(store.me.id);
  if (meIdx < 0 || g.status !== 'playing' || g.state.turn !== meIdx || pending.has(g.id)) return;
  const [x, y] = sway(performance.now() / 1000);
  pending.add(g.id);
  room.dartboard?.shake();
  act('game.move', { id: g.id, move: { x: x + (Math.random() - 0.5) * 0.04, y: y + (Math.random() - 0.5) * 0.04 } })
    .then(() => sfx.slap(), toastError)
    .finally(() => pending.delete(g.id));
}

/** How many of a player's darts to show on the board right now. */
function visibleCount(g, p) {
  const s = g.state;
  if (g.status === 'playing' && s.turn === p) return 3 - s.left;
  const len = s.throws[p].length;
  return len === 0 ? 0 : ((len - 1) % 3) + 1;
}

function board(g, meIdx) {
  const s = g.state;
  const aiming = meIdx >= 0 && g.status === 'playing' && s.turn === meIdx;
  const el = svg('svg', { viewBox: '-1.12 -1.12 2.24 2.24', class: `dart-board${aiming ? ' aiming' : ''}`, role: 'img', 'aria-label': 'Dartboard' });
  el.append(svg('circle', { r: 1.1, fill: '#15151b' }));
  for (let i = 0; i < 20; i++) {
    const d0 = i * 18 - 9;
    const dark = i % 2 === 0;
    const accent = dark ? '#d6283a' : '#1f9d55';
    el.append(
      svg('path', { d: wedge(0.0935, 0.953, d0, d0 + 18), fill: dark ? '#1c1c22' : '#f3e6c4' }),
      svg('path', { d: wedge(0.953, 1, d0, d0 + 18), fill: accent }),
      svg('path', { d: wedge(0.582, 0.629, d0, d0 + 18), fill: accent }));
    const [tx, ty] = polar(1.065, i * 18);
    el.append(svg('text', { x: tx, y: ty, 'text-anchor': 'middle', 'dominant-baseline': 'central', fill: '#fff', 'font-size': 0.1, 'font-weight': 700 }, String(SECTOR_NUMS[i])));
  }
  el.append(svg('circle', { r: 0.0935, fill: '#1f9d55' }), svg('circle', { r: 0.0374, fill: '#d6283a' }));
  g.players.forEach((_, p) => {
    const n = visibleCount(g, p);
    s.throws[p].slice(s.throws[p].length - n).forEach((d) => {
      el.append(svg('g', { transform: `translate(${d.x} ${d.y})` },
        svg('circle', { r: 0.035, fill: p === 0 ? '#ff6b6b' : '#ffd43b', stroke: '#fff', 'stroke-width': 0.012 }),
        svg('circle', { r: 0.012, fill: '#222' })));
    });
  });
  if (aiming) {
    const cross = svg('g', { class: 'crosshair' },
      svg('circle', { r: 0.075, fill: 'rgba(255,255,255,0.12)', stroke: '#000', 'stroke-width': 0.04 }),
      svg('circle', { r: 0.075, fill: 'none', stroke: '#fff', 'stroke-width': 0.022 }),
      svg('path', { d: 'M-0.14 0H-0.04M0.04 0H0.14M0 -0.14V-0.04M0 0.04V0.14', stroke: '#000', 'stroke-width': 0.05 }),
      svg('path', { d: 'M-0.14 0H-0.04M0.04 0H0.14M0 -0.14V-0.04M0 0.04V0.14', stroke: '#fff', 'stroke-width': 0.024 }));
    el.append(cross);
    // The board isn't in the page yet when this runs, so wait for it to be attached,
    // then keep swaying until the next re-render removes it.
    let attached = false;
    let waited = 0;
    const tick = () => {
      if (cross.isConnected) attached = true;
      else if (attached || ++waited > 60) return;
      const [x, y] = sway(performance.now() / 1000);
      cross.setAttribute('transform', `translate(${x} ${y})`);
      requestAnimationFrame(tick);
    };
    tick();
    el.addEventListener('pointerdown', () => throwDart(g));
  }
  return el;
}

export function dartsView(g, meIdx) {
  const s = g.state;
  const mine = meIdx >= 0 && g.status === 'playing' && s.turn === meIdx;
  const name = (i) => (i === meIdx ? 'You' : store.user(g.players[i])?.firstName || 'Opponent');
  const total = s.throws[0].length + s.throws[1].length;
  return h('div', { class: 'darts' },
    h('div', { class: 'dart-info' },
      h('span', { class: 'chip' }, `Round ${Math.min(s.round, s.rounds)} / ${s.rounds}`),
      g.status === 'playing' ? h('span', { class: 'chip' }, `🎯 ${s.left} dart${s.left === 1 ? '' : 's'} left`) : null),
    board(g, meIdx),
    s.last
      ? h('div', { class: 'dart-last', key: total }, `${name(s.last.p)}: ${s.last.label}`, h('b', {}, ` +${s.last.s}`))
      : h('div', { class: 'dart-last muted' }, 'Closest to the bullseye scores the most'),
    mine ? h('button', { class: 'btn btn-lg dart-throw', onClick: () => throwDart(g) }, '🎯 Throw!  ', h('kbd', {}, 'Space')) : null,
    mine ? h('p', { class: 'small muted center' }, 'The crosshair wobbles — click the board or press Space at the right moment.') : null);
}
