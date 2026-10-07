// Game arcade: lobby, invites and the three two-player mini games.
import { store, act } from '../net.js';
import { h, avatarEl, fullName } from '../util.js';
import { openPanel, currentPanel, emptyState, busy, toast, toastError, openPopover, menuItem } from '../ui/kit.js';
import { room } from '../scene/room.js';
import { sfx } from '../audio.js';
import { focusOn } from '../scene/core.js';
import { dartsView, throwDart } from './darts.js';

export const KINDS = {
  ttt: { name: 'Tic-Tac-Toe', icon: '❌⭕', desc: 'Three in a row wins' },
  c4: { name: 'Connect Four', icon: '🔴🟡', desc: 'Drop discs, connect four' },
  rps: { name: 'Rock Paper Scissors', icon: '✊✌️', desc: 'Best of three rounds' },
  darts: { name: 'Darts', icon: '🎯', desc: '3 rounds, highest score wins' },
};
const RPS = { rock: '✊', paper: '✋', scissors: '✌️' };
const DISC = ['#fa5252', '#fcc419'];
const MARK = ['✕', '◯'];

let viewing = null;
let redraw = null;
const myPicks = new Map();

const isActiveFor = (g, id) => g.players.includes(id) && !g.gone.includes(id);

export function myActiveGame() {
  const me = store.me?.id;
  return store.list('games').filter((g) => isActiveFor(g, me)).sort((a, b) => b.updatedAt - a.updatedAt)[0] || null;
}

async function create(kind, invite) {
  const res = await act('game.create', { kind, invite });
  viewing = res.id;
  sfx.arcade();
  if (invite) toast(`Invitation sent to ${store.user(invite)?.firstName}!`, { icon: '🕹️' });
  redraw?.();
}

export async function joinGame(id) {
  try {
    await act('game.join', { id });
    sfx.arcade();
    openGames({ gameId: id });
  } catch (err) {
    toastError(err);
  }
}

function invitePopover(anchor, kind) {
  const people = store.list('users').filter((u) => u.id !== store.me.id && store.online.has(u.id));
  openPopover(anchor, people.length
    ? [h('div', { class: 'menu-note' }, 'Invite someone who’s online:'), ...people.map((u) => menuItem(avatarEl(u, 22), fullName(u), () => create(kind, u.id).catch(toastError)))]
    : [h('div', { class: 'menu-note' }, 'Nobody else is online right now 😴 — open a table and they’ll get a notification when they join.')],
  { className: 'menu' });
}

// ---------------------------------------------------------------- lobby
function lobby() {
  const games = store.list('games');
  const waiting = games.filter((g) => g.status === 'waiting');
  const live = games.filter((g) => g.status === 'playing');
  return h('div', { class: 'games-lobby' },
    h('div', { class: 'game-types' }, ...Object.entries(KINDS).map(([k, info]) => h('div', { class: `card game-type gt-${k}` },
      h('div', { class: 'gt-icon' }, info.icon),
      h('b', {}, info.name),
      h('small', { class: 'muted' }, info.desc),
      h('div', { class: 'row gap-sm center' },
        h('button', { class: 'btn btn-sm', onClick: (e) => busy(e.currentTarget, () => create(k)) }, 'Open table'),
        h('button', { class: 'btn btn-sm btn-ghost', onClick: (e) => invitePopover(e.currentTarget, k) }, 'Invite…'))))),
    h('h3', { class: 'section-title' }, `Open tables (${waiting.length})`),
    ...(waiting.length ? waiting.map((g) => {
      const host = store.user(g.players[0]);
      const mine = g.players[0] === store.me.id;
      return h('div', { class: 'card table-row' },
        avatarEl(host, 32),
        h('div', { class: 'grow' }, h('b', {}, mine ? 'Your table' : fullName(host)), h('small', { class: 'muted' }, `${KINDS[g.kind].name} · waiting for an opponent`)),
        mine
          ? h('button', { class: 'btn btn-sm btn-ghost', onClick: () => { viewing = g.id; redraw(); } }, 'View')
          : h('button', { class: 'btn btn-sm', onClick: () => joinGame(g.id) }, 'Join ▶'));
    }) : [emptyState('🪑', 'No open tables', 'Open one and your colleagues will be notified.')]),
    live.length ? h('h3', { class: 'section-title' }, `Playing now (${live.length})`) : null,
    ...live.map((g) => h('div', { class: 'card table-row' },
      h('div', { class: 'stack' }, ...g.players.map((id) => avatarEl(store.user(id), 28))),
      h('div', { class: 'grow' }, h('b', {}, g.players.map((id) => store.user(id)?.firstName).join(' vs ')), h('small', { class: 'muted' }, KINDS[g.kind].name)),
      h('button', { class: 'btn btn-sm btn-ghost', onClick: () => { viewing = g.id; redraw(); } }, '👀 Watch'))),
  );
}

// ---------------------------------------------------------------- game view
function statusLine(g, meIdx) {
  const s = g.state;
  const name = (i) => (i === meIdx ? 'You' : store.user(g.players[i])?.firstName || 'Opponent');
  if (g.status === 'waiting') return 'Waiting for an opponent to join…';
  if (g.status === 'done') {
    if (s.winner === 'draw') return 'It’s a draw! 🤝';
    if (s.forfeit) return `${name(s.winner)} win${s.winner === meIdx ? '' : 's'} — opponent left the table`;
    return s.winner === meIdx ? 'You win! 🏆' : `${name(s.winner)} wins! 🎉`;
  }
  if (g.kind === 'rps') {
    if (meIdx < 0) return 'Players are choosing…';
    if (s.picked[meIdx]) return s.picked[1 - meIdx] ? 'Revealing…' : `Waiting for ${name(1 - meIdx)}…`;
    return s.picked[1 - meIdx] ? `${name(1 - meIdx)} has picked — your move!` : 'Pick your move!';
  }
  return s.turn === meIdx ? 'Your turn!' : `${name(s.turn)}’s turn…`;
}

function playerBadge(g, i, meIdx) {
  const id = g.players[i];
  if (!id) return h('div', { class: 'player empty' }, h('span', { class: 'av', style: '--s:40px' }, '?'), h('small', {}, 'Waiting…'));
  const u = store.user(id);
  const turn = g.status === 'playing' && g.kind !== 'rps' && g.state.turn === i;
  const mark = g.kind === 'ttt' ? MARK[i] : g.kind === 'c4' ? h('i', { class: 'disc-dot', style: `background:${DISC[i]}` }) : g.state ? String(g.kind === 'darts' ? g.state.scores[i] : g.state.score[i]) : '';
  return h('div', { class: `player${turn ? ' turn' : ''}${g.gone.includes(id) ? ' gone' : ''}` },
    avatarEl(u, 40),
    h('b', {}, i === meIdx ? 'You' : u?.firstName || '?'),
    h('span', { class: 'mark' }, mark));
}

function move(g, mv) {
  act('game.move', { id: g.id, move: mv }).then(() => sfx.click(), toastError);
}

function tttBoard(g, meIdx) {
  const s = g.state;
  const canPlay = g.status === 'playing' && s.turn === meIdx;
  return h('div', { class: 'ttt' }, ...s.board.map((c, i) => h('button', {
    class: `cell${s.line?.includes(i) ? ' win' : ''}${c !== null ? ` p${c}` : ''}`,
    disabled: !canPlay || c !== null,
    'aria-label': `Square ${i + 1}`,
    onClick: () => move(g, i),
  }, c === null ? '' : MARK[c])));
}

function c4Board(g, meIdx) {
  const s = g.state;
  const canPlay = g.status === 'playing' && s.turn === meIdx;
  const cols = [];
  for (let c = 0; c < 7; c++) {
    const cells = [];
    for (let r = 0; r < 6; r++) {
      const i = r * 7 + c;
      const v = s.board[i];
      cells.push(h('span', { class: `slot${v !== null ? ' filled' : ''}${s.line?.includes(i) ? ' win' : ''}${s.last === i ? ' last' : ''}`, style: v !== null ? `--disc:${DISC[v]}; --row:${r}` : '' }));
    }
    cols.push(h('button', { class: 'c4-col', disabled: !canPlay || s.board[c] !== null, 'aria-label': `Column ${c + 1}`, onClick: () => move(g, c) }, ...cells));
  }
  return h('div', { class: 'c4', style: canPlay ? `--hover:${DISC[meIdx]}` : '' }, ...cols);
}

function rpsBoard(g, meIdx) {
  const s = g.state;
  const key = `${g.id}:${s.rounds.length}`;
  const mine = myPicks.get(key);
  const last = s.rounds.at(-1);
  const name = (i) => (i === meIdx ? 'You' : store.user(g.players[i])?.firstName || 'Opponent');
  return h('div', { class: 'rps' },
    h('div', { class: 'rps-score' }, h('b', {}, String(s.score[0])), h('span', {}, '–'), h('b', {}, String(s.score[1]))),
    last ? h('div', { class: 'rps-last', key: s.rounds.length }, h('span', { class: 'big' }, RPS[last.picks[0]]), h('span', { class: 'vs' }, 'vs'), h('span', { class: 'big' }, RPS[last.picks[1]]),
      h('small', {}, last.winner === null ? 'Tie round!' : `${name(last.winner)} won round ${s.rounds.length}`)) : h('div', { class: 'rps-last muted' }, 'First to 2 wins'),
    meIdx >= 0 && g.status === 'playing' ? h('div', { class: 'rps-picks' }, ...Object.entries(RPS).map(([k, icon], i) => h('button', {
      class: `rps-btn${mine === k ? ' chosen' : ''}`,
      disabled: !!s.picked[meIdx],
      'aria-label': `${k} (key ${RPS_KEYS[k]})`,
      onClick: () => pickRps(g, k),
    }, icon, h('small', {}, k), h('kbd', {}, `${RPS_KEYS[k]} / ${i + 1}`)))) : null,
    meIdx >= 0 && g.status === 'playing' && !s.picked[meIdx] ? h('p', { class: 'small muted' }, '⌨️ Press R, P or S (or 1, 2, 3) to choose') : null);
}

const RPS_KEYS = { rock: 'R', paper: 'P', scissors: 'S' };
const KEY_TO_PICK = { r: 'rock', p: 'paper', s: 'scissors', 1: 'rock', 2: 'paper', 3: 'scissors' };

function pickRps(g, k) {
  const meIdx = g.players.indexOf(store.me.id);
  if (meIdx < 0 || g.status !== 'playing' || g.state.picked[meIdx]) return;
  myPicks.set(`${g.id}:${g.state.rounds.length}`, k);
  move(g, k);
  redraw?.();
}

/** Keyboard shortcuts for Rock-Paper-Scissors while its table is on screen. */
function onRpsKey(e) {
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
  if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
  const g = viewing && store.cols.games.get(viewing);
  if (g?.kind === 'darts' && (e.key === ' ' || e.key === 'Enter') && !e.target.closest?.('button, a')) {
    e.preventDefault();
    throwDart(g);
    return;
  }
  const pick = KEY_TO_PICK[e.key.toLowerCase()];
  if (!pick || !g || g.kind !== 'rps') return;
  e.preventDefault();
  pickRps(g, pick);
}

function gameView(g) {
  const me = store.me.id;
  const meIdx = g.players.indexOf(me);
  const playing = meIdx >= 0 && !g.gone.includes(me);
  const info = KINDS[g.kind];
  const leave = () => {
    if (playing) act('game.leave', { id: g.id }).catch(() => {});
    viewing = null;
    redraw();
  };
  const board = !g.state ? h('div', { class: 'waiting-dots' }, h('i'), h('i'), h('i'))
    : g.kind === 'ttt' ? tttBoard(g, meIdx) : g.kind === 'c4' ? c4Board(g, meIdx) : g.kind === 'darts' ? dartsView(g, meIdx) : rpsBoard(g, meIdx);
  const opponentGone = g.gone.length > 0;
  const iVoted = g.rematch.includes(me);
  return h('div', { class: `game-view gv-${g.kind}` },
    h('div', { class: 'row between' },
      h('button', { class: 'btn btn-sm btn-ghost', onClick: leave }, playing ? (g.status === 'playing' ? '🏳️ Forfeit & leave' : '← Leave table') : '← Back to lobby'),
      h('b', {}, `${info.icon} ${info.name}`)),
    h('div', { class: 'players' }, playerBadge(g, 0, meIdx), h('span', { class: 'vs' }, 'VS'), playerBadge(g, 1, meIdx)),
    h('div', { class: `game-status${g.status === 'done' ? ' done' : ''}` }, statusLine(g, meIdx)),
    board,
    g.status === 'waiting' && playing ? h('div', { class: 'row center gap-sm' }, h('button', { class: 'btn btn-sm', onClick: (e) => invitePopover(e.currentTarget, g.kind) }, '📨 Invite someone')) : null,
    g.status === 'done' && playing ? h('div', { class: 'row center gap-sm' },
      opponentGone ? h('span', { class: 'muted' }, 'Your opponent left the table.') : h('button', {
        class: 'btn',
        disabled: iVoted,
        onClick: () => act('game.rematch', { id: g.id }).catch(toastError),
      }, iVoted ? 'Waiting for opponent…' : g.rematch.length ? '🔁 Accept rematch!' : '🔁 Rematch')) : null,
  );
}

// ---------------------------------------------------------------- panel
export function openGames({ gameId, focus } = {}) {
  if (gameId) viewing = gameId;
  else if (!viewing || !store.cols.games.has(viewing)) viewing = myActiveGame()?.id || null;
  if (currentPanel() === 'games') {
    if (focus) focusOn(focus);
    redraw?.();
    return;
  }
  if (focus === 'darts') room.dartboard.shake();
  else room.arcade.flash();
  sfx.arcade();
  openPanel({
    key: 'games',
    title: 'Game Arcade',
    subtitle: 'Challenge a colleague to a quick game',
    icon: '🕹️',
    accent: '#7950f2',
    focus: focus || 'games',
    render(body, panel) {
      redraw = () => {
        const g = viewing && store.cols.games.get(viewing);
        if (!g) viewing = null;
        body.replaceChildren(g ? gameView(g) : lobby());
      };
      redraw();
      panel.on('col:games', (e) => {
        const g = e.item;
        const me = store.me.id;
        if (g && g.id === viewing && e.prev && g.players.includes(me)) {
          const meIdx = g.players.indexOf(me);
          if (e.prev.status !== 'done' && g.status === 'done') {
            if (g.state.winner === meIdx) sfx.win();
            else if (g.state.winner !== 'draw') sfx.lose();
          } else if (e.prev.status === 'waiting' && g.status === 'playing') sfx.arcade();
        }
        // Follow a table I just got seated at
        if (g && !viewing && g.players.includes(me) && g.status === 'playing') viewing = g.id;
        redraw();
      });
      panel.on('presence', () => redraw());
      document.addEventListener('keydown', onRpsKey);
      panel.onCleanup(() => {
        redraw = null;
        document.removeEventListener('keydown', onRpsKey);
      });
    },
  });
}
