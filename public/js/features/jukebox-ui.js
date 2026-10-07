// Jukebox panel: shared play/pause/track controls + this person's own mute and volume.
import { store } from '../net.js';
import { h, fullName } from '../util.js';
import { openPanel, toastError } from '../ui/kit.js';
import { room } from '../scene/room.js';
import { sfx } from '../audio.js';
import * as jb from '../jukebox.js';

const run = (p) => p.catch(toastError);

export function openJukebox() {
  room.jukebox.bounce();
  openPanel({
    key: 'jukebox',
    title: 'Office Jukebox',
    subtitle: 'Lo-fi for everyone — you start muted',
    icon: '🎵',
    accent: '#d6336c',
    focus: 'jukebox',
    render(body, panel) {
      const listenCard = h('section', { class: 'card jb-listen' });
      const nowCard = h('section', { class: 'card jb-now' });
      const list = h('div', { class: 'jb-tracks' });
      body.append(listenCard, nowCard, h('h3', { class: 'section-title' }, 'Lo-fi playlist'), list);

      function drawListen() {
        const on = jb.isListening();
        const vol = h('input', { type: 'range', min: '0', max: '100', value: String(Math.round(jb.getVolume() * 100)), 'aria-label': 'Your jukebox volume', class: 'jb-vol' });
        vol.addEventListener('input', () => jb.setVolume(Number(vol.value) / 100));
        listenCard.className = `card jb-listen${on ? ' on' : ''}`;
        listenCard.replaceChildren(...[
          h('button', {
            class: `btn jb-listen-btn${on ? '' : ' muted'}`,
            'aria-pressed': String(on),
            onClick: () => {
              jb.setListening(!on);
              sfx.click();
            },
          }, on ? '🎧 Listening — tap to mute' : '🔇 You’re muted — tap to listen'),
          on ? h('label', { class: 'jb-vol-row' }, h('span', {}, '🔈'), vol, h('span', {}, '🔊')) : null,
          h('p', { class: 'small muted' }, 'Muting only affects your speakers. The play, pause and track buttons control the music for everyone who is listening.'),
        ].filter(Boolean));
      }

      function drawNow() {
        const j = store.jukebox;
        if (!j) return;
        const tr = jb.TRACKS[j.track];
        const by = j.by ? store.user(j.by) : null;
        nowCard.className = `card jb-now${j.playing ? ' playing' : ''}`;
        nowCard.replaceChildren(
          h('div', { class: 'jb-eq', 'aria-hidden': 'true' }, ...Array.from({ length: 5 }, (_, i) => h('i', { style: `--d:${i * 0.17}s` }))),
          h('div', { class: 'grow' },
            h('b', { class: 'jb-title' }, tr.name),
            h('small', { class: 'muted' }, `${tr.mood} · ${tr.bpm} BPM`),
            by ? h('small', { class: 'muted jb-by' }, `${j.playing ? 'Playing' : 'Paused'} by ${by.id === store.me.id ? 'you' : fullName(by)}`) : null),
          h('div', { class: 'jb-controls' },
            h('button', { class: 'icon-btn-sm', 'aria-label': 'Previous track', onClick: () => run(jb.previous()) }, '⏮'),
            h('button', { class: 'btn jb-play', 'aria-label': j.playing ? 'Pause for everyone' : 'Play for everyone', onClick: () => run(jb.toggle()) }, j.playing ? '❚❚' : '▶'),
            h('button', { class: 'icon-btn-sm', 'aria-label': 'Next track', onClick: () => run(jb.next()) }, '⏭')));
      }

      function drawList() {
        const j = store.jukebox;
        list.replaceChildren(...jb.TRACKS.map((tr, i) => {
          const cur = j?.track === i;
          return h('button', { class: `jb-track${cur ? ' cur' : ''}`, onClick: () => run(cur ? jb.toggle() : jb.select(i)) },
            h('span', { class: 'jb-num' }, cur && j.playing ? '♪' : String(i + 1)),
            h('span', { class: 'grow' }, h('b', {}, tr.name), h('small', { class: 'muted' }, tr.mood)),
            h('span', { class: 'chip' }, `${tr.bpm} BPM`));
        }));
      }

      const draw = () => {
        drawNow();
        drawList();
      };
      drawListen();
      draw();
      panel.on('jukebox', draw);
      panel.on('jukebox:listen', drawListen);
      panel.on('col:users', drawNow);
    },
  });
}

