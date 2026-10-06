import fs from 'node:fs';
import path from 'node:path';
import { UPLOAD_DIR, newId } from './db.js';

const TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
export const MAX_UPLOAD_BYTES = 2.5 * 1024 * 1024;

// Check the file signature so a renamed script can't pose as an image.
function magicOk(mime, buf) {
  const hex = buf.subarray(0, 12).toString('hex');
  switch (mime) {
    case 'image/png': return hex.startsWith('89504e47');
    case 'image/jpeg': return hex.startsWith('ffd8ff');
    case 'image/gif': return hex.startsWith('47494638');
    case 'image/webp': return hex.startsWith('52494646') && buf.subarray(8, 12).toString('ascii') === 'WEBP';
    default: return false;
  }
}

/** Decode a base64 data URL, validate it and write it to the uploads folder. Returns its public URL. */
export function saveDataUrlImage(dataUrl) {
  const m = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw new Error('Please upload a PNG, JPG, WEBP or GIF image.');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > MAX_UPLOAD_BYTES) throw new Error('That image is too large (max 2.5 MB).');
  if (!magicOk(m[1], buf)) throw new Error('That file does not look like a valid image.');
  const name = `${newId()}.${TYPES[m[1]]}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
  return `/uploads/${name}`;
}

export const isUploadUrl = (u) => typeof u === 'string' && /^\/uploads\/[a-z0-9]+\.(png|jpg|webp|gif)$/.test(u);
