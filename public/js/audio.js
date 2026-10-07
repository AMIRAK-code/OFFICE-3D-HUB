// Synthesized sound effects and music (WebAudio) — no audio files needed.
import { store as readLocal, persistLocal } from './util.js';

let ctx = null;
let master = null;
let muted = readLocal('officeboard.muted', false);
const VOLUME = 0.55;
const unlockWaiters = new Set();

/** Must be called from a user gesture at least once (browsers block autoplay). */
function flushWaiters() {
  if (ctx?.state !== 'running') return;
  const waiting = [...unlockWaiters];
  unlockWaiters.clear();
  for (const fn of waiting) fn();
}

export function unlockAudio() {
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : VOLUME;
      master.connect(ctx.destination);
      ctx.onstatechange = flushWaiters;
    }
    if (ctx.state === 'suspended') ctx.resume().then(flushWaiters, () => {});
    else flushWaiters();
  } catch {
    /* audio unavailable */
  }
}
/** The shared AudioContext and master gain (null until the first user gesture). */
export const getAudio = () => (ctx ? { ctx, master } : null);
export const audioReady = () => !!ctx && ctx.state === 'running';
/** Run fn as soon as audio is allowed to play. */
export function whenAudioReady(fn) {
  if (audioReady()) fn();
  else unlockWaiters.add(fn);
}
for (const evt of ['pointerdown', 'keydown']) window.addEventListener(evt, unlockAudio, { capture: true });

export const isMuted = () => muted;
export function setMuted(m) {
  muted = m;
  persistLocal('officeboard.muted', m);
  if (master) master.gain.setTargetAtTime(m ? 0 : VOLUME, ctx.currentTime, 0.05);
}

const midi = (n) => 440 * 2 ** ((n - 69) / 12);

function tone(freq, start, dur, { type = 'sine', gain = 0.2, attack = 0.01, dest = master, slideTo } = {}) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(dest);
  o.start(start);
  o.stop(start + dur + 0.05);
}

let noiseBuf = null;
function noise(start, dur, { gain = 0.1, type = 'bandpass', freq = 1200, freqTo, q = 0.8 } = {}) {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, start);
  if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, start + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(f).connect(g).connect(master);
  src.start(start);
  src.stop(start + dur + 0.05);
}

const play = (fn) => {
  if (!audioReady() || muted) return;
  try {
    fn(ctx.currentTime + 0.01);
  } catch {
    /* ignore audio errors */
  }
};

export const sfx = {
  pop: () => play((t) => tone(500, t, 0.12, { slideTo: 1300, gain: 0.25 })),
  click: () => play((t) => tone(1400, t, 0.05, { type: 'triangle', gain: 0.12 })),
  slap: () => play((t) => {
    noise(t, 0.12, { gain: 0.35, freq: 900, type: 'lowpass' });
    tone(180, t, 0.12, { slideTo: 90, gain: 0.25 });
  }),
  whoosh: () => play((t) => noise(t, 0.35, { gain: 0.12, freq: 400, freqTo: 3000 })),
  chime: () => play((t) => [84, 88, 91].forEach((n, i) => tone(midi(n), t + i * 0.09, 0.6, { type: 'triangle', gain: 0.12 }))),
  mail: () => play((t) => {
    tone(midi(88), t, 0.35, { type: 'sine', gain: 0.22 });
    tone(midi(93), t + 0.16, 0.6, { type: 'sine', gain: 0.22 });
  }),
  error: () => play((t) => tone(160, t, 0.22, { type: 'square', gain: 0.06 })),
  tune: () => play((t) => {
    noise(t, 0.6, { gain: 0.1, freq: 600, freqTo: 2400, q: 3 });
    tone(midi(60), t + 0.1, 0.5, { type: 'sine', gain: 0.05, slideTo: midi(72) });
    [72, 76, 79, 84].forEach((n, i) => tone(midi(n), t + 0.55 + i * 0.08, 0.4, { type: 'triangle', gain: 0.1 }));
  }),
  tvOn: () => play((t) => {
    tone(60, t, 0.25, { type: 'sawtooth', gain: 0.06, slideTo: 15000 });
    noise(t + 0.3, 0.45, { gain: 0.12, type: 'highpass', freq: 2000 });
    tone(midi(81), t + 0.8, 0.25, { type: 'square', gain: 0.04 });
  }),
  tvOff: () => play((t) => tone(4000, t, 0.25, { type: 'sine', gain: 0.05, slideTo: 80 })),
  arcade: () => play((t) => [60, 64, 67, 72, 76, 79, 84].forEach((n, i) => tone(midi(n), t + i * 0.05, 0.12, { type: 'square', gain: 0.05 }))),
  win: () => play((t) => [72, 76, 79, 84, 79, 84].forEach((n, i) => tone(midi(n), t + i * 0.11, 0.3, { type: 'square', gain: 0.06 }))),
  lose: () => play((t) => [67, 63, 60].forEach((n, i) => tone(midi(n), t + i * 0.18, 0.35, { type: 'triangle', gain: 0.1 }))),
  blow: () => play((t) => noise(t, 0.8, { gain: 0.25, freq: 700, freqTo: 300, type: 'lowpass' })),
  party: () => play((t) => {
    [67, 72, 76, 79].forEach((n, i) => tone(midi(n), t + i * 0.1, 0.5, { type: 'square', gain: 0.05 }));
    tone(midi(84), t + 0.45, 0.9, { type: 'square', gain: 0.06 });
    noise(t + 0.45, 0.4, { gain: 0.08, type: 'highpass', freq: 5000 });
  }),
};

// "Happy Birthday to You" (public domain melody), as a little music box waltz.
const BEAT = 0.46;
const MELODY = [
  [67, 0.75], [67, 0.25],
  [69, 1], [67, 1], [72, 1],
  [71, 2], [67, 0.75], [67, 0.25],
  [69, 1], [67, 1], [74, 1],
  [72, 2], [67, 0.75], [67, 0.25],
  [79, 1], [76, 1], [72, 1],
  [71, 1], [69, 1], [77, 0.75], [77, 0.25],
  [76, 1], [72, 1], [74, 1],
  [72, 3],
];
const CHORDS = { C: [48, [55, 60, 64]], G: [43, [55, 59, 62]], F: [41, [53, 57, 60]] };
const HARMONY = [[1, 'C'], [4, 'G'], [7, 'G'], [10, 'C'], [13, 'C'], [16, 'F'], [19, 'C'], [21, 'G'], [22, 'C']];

let song = null;
export function playBirthdaySong() {
  if (!audioReady()) return false;
  stopBirthdaySong();
  const out = ctx.createGain();
  out.gain.value = 1;
  out.connect(master);
  const t0 = ctx.currentTime + 0.1;
  let beat = 0;
  for (const [n, d] of MELODY) {
    const t = t0 + beat * BEAT;
    const dur = Math.max(0.35, d * BEAT * 1.4);
    tone(midi(n), t, dur, { type: 'sine', gain: 0.22, dest: out });
    tone(midi(n + 12), t, dur * 0.6, { type: 'triangle', gain: 0.05, dest: out });
    beat += d;
  }
  for (const [b, name] of HARMONY) {
    const [bass, triad] = CHORDS[name];
    const t = t0 + b * BEAT;
    tone(midi(bass), t, BEAT * 1.2, { type: 'triangle', gain: 0.16, dest: out });
    const span = name === 'G' && b === 21 ? 1 : 2;
    for (let k = 1; k <= span; k++) {
      for (const n of triad) tone(midi(n), t + k * BEAT, BEAT * 0.8, { type: 'sine', gain: 0.035, dest: out });
    }
  }
  const length = beat * BEAT + 1.2;
  const timer = setTimeout(() => {
    if (song?.out === out) song = null;
  }, length * 1000);
  song = { out, timer };
  return true;
}
export function stopBirthdaySong() {
  if (!song) return;
  const { out, timer } = song;
  clearTimeout(timer);
  out.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
  setTimeout(() => out.disconnect(), 600);
  song = null;
}
