// Tiny JSON-file database. Everything lives in memory and is flushed to
// data/db.json shortly after each change (atomic write via temp file).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const COLLECTIONS = ['users', 'sessions', 'stickers', 'wall', 'requests', 'podcasts', 'music', 'shows', 'books', 'places', 'giveaways', 'mail'];

function load() {
  let data = {};
  try {
    data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      const backup = `${DB_FILE}.corrupt-${Date.now()}`;
      console.error(`Could not read ${DB_FILE} (${err.message}). Backing it up to ${backup} and starting fresh.`);
      fs.copyFileSync(DB_FILE, backup);
      data = {};
    }
  }
  for (const c of COLLECTIONS) data[c] ||= {};
  data.meta ||= { z: 1 };
  return data;
}

export const db = load();

let timer = null;
export function persist() {
  if (!timer) timer = setTimeout(flush, 400);
}

export function flush() {
  clearTimeout(timer);
  timer = null;
  const json = JSON.stringify(db);
  const tmp = `${DB_FILE}.tmp`;
  try {
    fs.writeFileSync(tmp, json);
    fs.renameSync(tmp, DB_FILE);
  } catch {
    // Windows can refuse the rename while another process (antivirus, backup) holds the file.
    fs.writeFileSync(DB_FILE, json);
  }
}

export const newId = () => Date.now().toString(36) + crypto.randomBytes(5).toString('hex');
export const newToken = () => crypto.randomBytes(24).toString('base64url');
export const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    flush();
    process.exit(0);
  });
}
