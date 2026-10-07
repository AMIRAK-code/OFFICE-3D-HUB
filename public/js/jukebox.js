// The office jukebox: five lo-fi tracks synthesized live with WebAudio.
// Playback state (track, playing, position) is shared by everyone via the server;
// each person's speaker is local and ALWAYS starts muted when they enter.
import { store, on, emit, act } from './net.js';
import { getAudio, unlockAudio, whenAudioReady } from './audio.js';
import { store as local, persistLocal } from './util.js';

const CHORDS = {
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  m9: [0, 3, 10, 14],
  dom7: [0, 4, 7, 10],
};
const midi = (n) => 440 * 2 ** ((n - 69) / 12);

export const TRACKS = [
  { name: 'Rainy Window', mood: 'Soft rain, warm keys', bpm: 72, swing: 0.2, key: [[53, 'maj7'], [52, 'm7'], [50, 'm7'], [48, 'maj7']], scale: [0, 2, 4, 7, 9], melodyRoot: 72, kick: [0, 10], density: 0.34 },
  { name: 'Late Night Coffee', mood: 'Slow and smoky', bpm: 78, swing: 0.24, key: [[57, 'm9'], [50, 'm7'], [55, 'dom7'], [48, 'maj7']], scale: [0, 3, 5, 7, 10], melodyRoot: 69, kick: [0, 7, 10], density: 0.3 },
  { name: 'Sunday Slow', mood: 'Lazy morning light', bpm: 64, swing: 0.16, key: [[48, 'maj7'], [45, 'm7'], [50, 'm7'], [55, 'dom7']], scale: [0, 2, 4, 7, 9], melodyRoot: 72, kick: [0], density: 0.26 },
  { name: 'Focus Mode', mood: 'Steady groove for deep work', bpm: 84, swing: 0.12, key: [[50, 'm7'], [55, 'dom7'], [48, 'maj7'], [57, 'm7']], scale: [0, 3, 5, 7, 10], melodyRoot: 74, kick: [0, 6, 10], density: 0.22 },
  { name: 'Neon Drizzle', mood: 'City lights after dark', bpm: 70, swing: 0.26, key: [[53, 'maj7'], [57, 'm7'], [50, 'm7'], [55, 'dom7']], scale: [0, 2, 4, 7, 9], melodyRoot: 77, kick: [0, 3, 10], density: 0.38 },
];

// ---------------------------------------------------------------- local listening state (never persisted: muted on every visit)
let listening = false;
let volume = Math.min(1, Math.max(0, Number(local('officeboard.jukeboxVolume', 0.6)) || 0.6));

export const isListening = () => listening;
export const getVolume = () => volume;

export function setListening(on_) {
  if (listening === on_) return;
  listening = on_;
  if (on_) {
    unlockAudio(); // allowed: this runs from a click
    whenAudioReady(() => listening && sync());
  } else sync();
  emit('jukebox:listen', listening);
}

export function setVolume(v) {
  volume = Math.min(1, Math.max(0, v));
  persistLocal('officeboard.jukeboxVolume', volume);
  if (engine) engine.bus.gain.setTargetAtTime(volume * 0.9, engine.ctx.currentTime, 0.05);
}

// ---------------------------------------------------------------- shared state helpers
const serverNow = () => Date.now() + store.clockOffset;

/** Seconds into the current track (as of now). */
export function position() {
  const j = store.jukebox;
  if (!j) return 0;
  return j.pos + (j.playing ? (serverNow() - j.at) / 1000 : 0);
}

export const current = () => store.jukebox;
export const isPlaying = () => !!store.jukebox?.playing;

export const play = () => act('jukebox.set', { playing: true });
export const pause = () => act('jukebox.set', { playing: false });
export const toggle = () => act('jukebox.set', { playing: !isPlaying() });
export const select = (track) => act('jukebox.set', { track, playing: true });
export const next = () => select(((store.jukebox?.track ?? 0) + 1) % TRACKS.length);
export const previous = () => select(((store.jukebox?.track ?? 0) + TRACKS.length - 1) % TRACKS.length);

// ---------------------------------------------------------------- synthesis
function rng(seed) {
  // mulberry32: every listener generates the exact same "random" melody and hats
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

let engine = null;

function makeNoise(ctx) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function startEngine(trackIdx, posSec) {
  const audio = getAudio();
  if (!audio || audio.ctx.state !== 'running') return null;
  const { ctx, master } = audio;
  const tr = TRACKS[trackIdx];
  const stepDur = 60 / tr.bpm / 4; // 16th note
  const noiseBuf = makeNoise(ctx);

  // Signal chain: everything -> warm lowpass -> bus (volume) -> master
  const bus = ctx.createGain();
  bus.gain.value = 0;
  bus.gain.setTargetAtTime(volume * 0.9, ctx.currentTime, 0.4); // gentle fade-in
  const warm = ctx.createBiquadFilter();
  warm.type = 'lowpass';
  warm.frequency.value = 3600;
  warm.Q.value = 0.4;
  warm.connect(bus);
  bus.connect(master);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 64;
  bus.connect(analyser);

  // Echo for the melody
  const echoIn = ctx.createGain();
  const echo = ctx.createDelay(2);
  echo.delayTime.value = stepDur * 3;
  const fb = ctx.createGain();
  fb.gain.value = 0.38;
  const echoLp = ctx.createBiquadFilter();
  echoLp.type = 'lowpass';
  echoLp.frequency.value = 1800;
  echoIn.connect(echo);
  echo.connect(echoLp);
  echoLp.connect(fb);
  fb.connect(echo);
  echoLp.connect(warm);

  // Tape wobble: a slow LFO nudging pitch of the keys
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.55;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 9;
  lfo.connect(lfoGain);
  lfo.start();

  // Constant soft vinyl hiss
  const hiss = ctx.createBufferSource();
  hiss.buffer = noiseBuf;
  hiss.loop = true;
  const hissF = ctx.createBiquadFilter();
  hissF.type = 'bandpass';
  hissF.frequency.value = 2400;
  hissF.Q.value = 0.5;
  const hissG = ctx.createGain();
  hissG.gain.value = 0.012;
  hiss.connect(hissF).connect(hissG).connect(warm);
  hiss.start();

  const tone = (freq, t, dur, { type = 'sine', gain = 0.1, attack = 0.02, to = warm, wobble = false, detune = 0 } = {}) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    if (wobble) lfoGain.connect(o.detune);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(to);
    o.start(t);
    o.stop(t + dur + 0.05);
    o.onended = () => {
      if (wobble) lfoGain.disconnect(o.detune);
    };
  };
  const noise = (t, dur, { gain = 0.1, type = 'highpass', freq = 6000, q = 0.7 } = {}) => {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(warm);
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.05);
  };

  const keys = (notes, t, dur, vel) => {
    notes.forEach((n, i) => {
      const f = midi(n);
      const at = t + i * 0.018; // gentle strum
      // Electric-piano-ish: a sine body plus a soft bell partial
      tone(f, at, dur, { gain: 0.07 * vel, attack: 0.015, wobble: true });
      tone(f * 2, at, dur * 0.5, { type: 'triangle', gain: 0.02 * vel, attack: 0.01, wobble: true });
      tone(f * 4.01, at, 0.35, { gain: 0.006 * vel, attack: 0.004, wobble: true });
    });
  };

  const playStep = (step, t) => {
    const bar = Math.floor(step / 16);
    const s16 = step % 16;
    const [root, quality] = tr.key[bar % tr.key.length];
    const notes = CHORDS[quality].map((i) => root + i + (i > 12 ? -12 : 0));
    const r = rng(trackIdx * 100003 + step * 7919 + 13);
    const swingOffset = s16 % 2 === 1 ? tr.swing * stepDur : 0;
    const at = t + swingOffset + (r() - 0.5) * 0.006; // human looseness

    if (s16 === 0) keys(notes, at, stepDur * 15, 1);
    if (s16 === 10 && bar % 2 === 1) keys(notes, at, stepDur * 5, 0.7);
    // Bass
    if (s16 === 0) tone(midi(root - 12), at, stepDur * 6, { gain: 0.16, attack: 0.03 });
    if (s16 === 10) tone(midi(root - 12 + (bar % 2 ? 7 : 0)), at, stepDur * 4, { gain: 0.12, attack: 0.03 });
    // Drums
    if (tr.kick.includes(s16)) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(140, at);
      o.frequency.exponentialRampToValueAtTime(42, at + 0.18);
      g.gain.setValueAtTime(0.34, at);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
      o.connect(g).connect(warm);
      o.start(at);
      o.stop(at + 0.35);
    }
    if (s16 === 4 || s16 === 12) {
      noise(at, 0.2, { gain: 0.16, type: 'bandpass', freq: 1700, q: 0.8 });
      tone(190, at, 0.12, { type: 'triangle', gain: 0.06 });
    }
    if (s16 % 2 === 0) noise(at, 0.045, { gain: 0.035 + r() * 0.035, freq: 7500 });
    if (r() < 0.09) noise(at, 0.02, { gain: 0.05, freq: 3000 }); // vinyl pop
    // Sparse melody (pentatonic), echoing away
    if (s16 % 2 === 0 && r() < tr.density * (s16 % 4 === 0 ? 0.7 : 1)) {
      const pick = tr.scale[Math.floor(r() * tr.scale.length)];
      const oct = r() < 0.25 ? -12 : 0;
      const f = midi(tr.melodyRoot + pick + oct);
      const g = ctx.createGain();
      g.gain.value = 0.55;
      g.connect(echoIn);
      g.connect(warm);
      tone(f, at, stepDur * 3, { type: 'triangle', gain: 0.07, attack: 0.008, to: g, wobble: true });
    }
  };

  // Scheduler: keep ~2s of audio queued ahead. Song-time s plays at audio time origin + s.
  const origin = ctx.currentTime - posSec;
  let nextStep = Math.ceil(posSec / stepDur);
  const LOOKAHEAD = 2.2;
  const pump = () => {
    const horizon = ctx.currentTime + LOOKAHEAD;
    while (origin + nextStep * stepDur < horizon) {
      const t = origin + nextStep * stepDur;
      if (t >= ctx.currentTime - 0.02) playStep(nextStep, Math.max(t, ctx.currentTime));
      nextStep++;
    }
  };
  pump();
  const timer = setInterval(pump, 250);

  return {
    ctx, bus, analyser,
    stop() {
      clearInterval(timer);
      bus.gain.cancelScheduledValues(ctx.currentTime);
      bus.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
      setTimeout(() => {
        try {
          hiss.stop();
          lfo.stop();
        } catch {
          /* already stopped */
        }
        bus.disconnect();
        analyser.disconnect();
      }, 700);
    },
  };
}

/** Make the audio match the shared state and whether this person is listening. */
function sync() {
  const j = store.jukebox;
  const should = listening && j?.playing;
  if (engine) {
    engine.stop();
    engine = null;
  }
  if (should) engine = startEngine(j.track, position());
}

/** 0..1 loudness of what this device is currently playing (0 when muted). */
const levelBuf = new Uint8Array(32);
export function level() {
  if (!engine) return 0;
  engine.analyser.getByteFrequencyData(levelBuf);
  let sum = 0;
  for (let i = 0; i < 16; i++) sum += levelBuf[i];
  return Math.min(1, sum / 16 / 160);
}

export function initJukebox() {
  on('jukebox', () => sync());
  // The audio context can be suspended when the tab sleeps: resync on return.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && listening) sync();
  });
}
