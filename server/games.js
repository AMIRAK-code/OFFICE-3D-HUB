// Server-authoritative two-player mini games. Games live in memory only.
import { newId } from './db.js';

export class UserError extends Error {}

export const KINDS = {
  ttt: { name: 'Tic-Tac-Toe' },
  c4: { name: 'Connect Four' },
  rps: { name: 'Rock Paper Scissors' },
  darts: { name: 'Darts' },
};

const TTT_LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const C4_COLS = 7;
const C4_ROWS = 6;
const RPS_BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
const RPS_TARGET = 2; // best of three

// Darts: 3 rounds, 3 darts each per round, highest total wins.
const DART_ROUNDS = 3;
const DARTS_PER_TURN = 3;
const SECTORS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5]; // clockwise from the top

/** Score a dart that landed at (x, y); board radius = 1, +y is down, (0,0) is the bullseye. */
export function dartScore(x, y) {
  const r = Math.hypot(x, y);
  if (r <= 0.0374) return { s: 50, label: 'Bullseye!' };
  if (r <= 0.0935) return { s: 25, label: 'Outer bull' };
  if (r > 1) return { s: 0, label: 'Miss' };
  const deg = ((Math.atan2(x, -y) * 180) / Math.PI + 360 + 9) % 360;
  const n = SECTORS[Math.floor(deg / 18) % 20];
  if (r >= 0.953) return { s: n * 2, label: `Double ${n}` };
  if (r >= 0.582 && r <= 0.629) return { s: n * 3, label: `Triple ${n}` };
  return { s: n, label: String(n) };
}

export function create(kind, userId) {
  if (!KINDS[kind]) throw new UserError('Unknown game');
  const now = Date.now();
  return { id: newId(), kind, players: [userId], gone: [], status: 'waiting', state: null, first: 0, rematch: [], createdAt: now, updatedAt: now };
}

function fresh(g) {
  g.rematch = [];
  if (g.kind === 'ttt') g.state = { board: Array(9).fill(null), turn: g.first, winner: null, line: null };
  if (g.kind === 'c4') g.state = { board: Array(C4_COLS * C4_ROWS).fill(null), turn: g.first, winner: null, line: null, last: null };
  if (g.kind === 'rps') g.state = { picks: [null, null], score: [0, 0], rounds: [], winner: null };
  if (g.kind === 'darts') g.state = { scores: [0, 0], turn: g.first, left: DARTS_PER_TURN, round: 1, rounds: DART_ROUNDS, throws: [[], []], last: null, winner: null };
}

export function join(g, userId) {
  if (g.players.includes(userId)) throw new UserError('You are already at this table');
  if (g.status !== 'waiting') throw new UserError('This table is already full');
  g.players.push(userId);
  g.status = 'playing';
  fresh(g);
  g.updatedAt = Date.now();
}

function finish(g, winner, line = null) {
  g.state.winner = winner;
  g.state.line = line;
  g.status = 'done';
}

const MOVES = {
  darts(g, p, mv) {
    const s = g.state;
    if (s.turn !== p) throw new UserError('Not your turn');
    const x = Number(mv?.x);
    const y = Number(mv?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new UserError('Aim at the board');
    const r = Math.hypot(x, y) || 1;
    const k = r > 1.4 ? 1.4 / r : 1; // keep stray darts near the board
    const hit = { x: +(x * k).toFixed(3), y: +(y * k).toFixed(3) };
    const { s: points, label } = dartScore(hit.x, hit.y);
    s.throws[p].push({ ...hit, s: points, label });
    s.last = { p, s: points, label };
    s.scores[p] += points;
    s.left--;
    if (s.left > 0) return;
    const secondDone = p !== g.first;
    if (secondDone) {
      if (s.round >= DART_ROUNDS) {
        const [a, b] = s.scores;
        return finish(g, a === b ? 'draw' : a > b ? 0 : 1);
      }
      s.round++;
    }
    s.turn = 1 - p;
    s.left = DARTS_PER_TURN;
  },
  ttt(g, p, cell) {
    const s = g.state;
    if (s.turn !== p) throw new UserError('Not your turn');
    if (!Number.isInteger(cell) || cell < 0 || cell > 8 || s.board[cell] !== null) throw new UserError('Pick an empty square');
    s.board[cell] = p;
    const line = TTT_LINES.find((l) => l.every((i) => s.board[i] === p));
    if (line) finish(g, p, line);
    else if (s.board.every((c) => c !== null)) finish(g, 'draw');
    else s.turn = 1 - p;
  },
  c4(g, p, col) {
    const s = g.state;
    if (s.turn !== p) throw new UserError('Not your turn');
    if (!Number.isInteger(col) || col < 0 || col >= C4_COLS) throw new UserError('Pick a column');
    let row = -1;
    for (let r = C4_ROWS - 1; r >= 0; r--) {
      if (s.board[r * C4_COLS + col] === null) { row = r; break; }
    }
    if (row < 0) throw new UserError('That column is full');
    s.board[row * C4_COLS + col] = p;
    s.last = row * C4_COLS + col;
    const at = (r, c) => (r >= 0 && r < C4_ROWS && c >= 0 && c < C4_COLS ? s.board[r * C4_COLS + c] : undefined);
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      const cells = [[row, col]];
      for (const dir of [1, -1]) {
        let r = row + dr * dir;
        let c = col + dc * dir;
        while (at(r, c) === p) { cells.push([r, c]); r += dr * dir; c += dc * dir; }
      }
      if (cells.length >= 4) return finish(g, p, cells.map(([r, c]) => r * C4_COLS + c));
    }
    if (s.board.every((c) => c !== null)) finish(g, 'draw');
    else s.turn = 1 - p;
  },
  rps(g, p, pick) {
    const s = g.state;
    if (!RPS_BEATS[pick]) throw new UserError('Pick rock, paper or scissors');
    if (s.picks[p]) throw new UserError('You already picked — waiting for your opponent');
    s.picks[p] = pick;
    if (!s.picks[0] || !s.picks[1]) return;
    const [a, b] = s.picks;
    const w = a === b ? null : RPS_BEATS[a] === b ? 0 : 1;
    s.rounds.push({ picks: [a, b], winner: w });
    if (w !== null) s.score[w]++;
    s.picks = [null, null];
    if (w !== null && s.score[w] >= RPS_TARGET) finish(g, w);
  },
};

export function move(g, userId, mv) {
  if (g.status !== 'playing') throw new UserError('This game is not running');
  const p = g.players.indexOf(userId);
  if (p < 0) throw new UserError('You are not playing in this game');
  MOVES[g.kind](g, p, mv);
  g.updatedAt = Date.now();
}

export function rematch(g, userId) {
  if (g.status !== 'done') throw new UserError('The game is still running');
  if (!g.players.includes(userId)) throw new UserError('You are not playing in this game');
  if (g.gone.length) throw new UserError('Your opponent has left the table');
  if (!g.rematch.includes(userId)) g.rematch.push(userId);
  if (g.rematch.length === 2) {
    g.first = 1 - g.first;
    g.status = 'playing';
    fresh(g);
  }
  g.updatedAt = Date.now();
}

/** Returns true when the game should be deleted. */
export function leave(g, userId) {
  const p = g.players.indexOf(userId);
  if (p < 0) return false;
  if (g.status === 'waiting') return true;
  if (g.status === 'playing') {
    finish(g, 1 - p);
    g.state.forfeit = true;
  }
  if (!g.gone.includes(userId)) g.gone.push(userId);
  g.updatedAt = Date.now();
  return g.gone.length >= g.players.length;
}

/** Public view: hides Rock-Paper-Scissors picks until both players have chosen. */
export function view(g) {
  if (g.kind !== 'rps' || !g.state) return g;
  const { picks, ...rest } = g.state;
  return { ...g, state: { ...rest, picked: picks.map(Boolean) } };
}
