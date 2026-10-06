// Full-screen wall: zoom the camera onto the corkboard and open the sticker tray.
import { h, $ } from '../util.js';
import { focusOn, clearFocus, dimLabels, setInset } from '../scene/core.js';
import { closePanel, currentPanel } from '../ui/kit.js';
import { toggleTray } from './stickers.js';
import { sfx } from '../audio.js';

let backBtn = null;

export const isWallOpen = () => !!backBtn;

export function openWall() {
  if (backBtn) return;
  if (currentPanel()) closePanel();
  setInset(0, 0);
  focusOn('wall');
  dimLabels(true);
  document.body.classList.add('wall-open');
  toggleTray(true);
  sfx.whoosh();
  backBtn = h('button', { class: 'btn wall-back', onClick: closeWall }, '← Back to the office');
  $('#hud').append(backBtn);
}

export function closeWall() {
  if (!backBtn) return;
  backBtn.remove();
  backBtn = null;
  document.body.classList.remove('wall-open');
  toggleTray(false);
  if (!currentPanel()) {
    clearFocus();
    dimLabels(false);
  }
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && backBtn && !document.querySelector('.popover, .modal')) closeWall();
});
