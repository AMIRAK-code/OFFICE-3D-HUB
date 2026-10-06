// Reusable UI pieces: side panels, popovers, modals, toasts and form helpers.
import { h, $ } from '../util.js';
import { on, emit } from '../net.js';
import { focusOn, clearFocus, setInset, dimLabels } from '../scene/core.js';
import { sfx } from '../audio.js';

// ---------------------------------------------------------------- toasts
const toastRoot = $('#toasts');
export function toast(text, { icon = '✨', type = 'info', action, duration = 4500, sticky = false } = {}) {
  const el = h('div', { class: `toast toast-${type}`, role: 'status' },
    h('span', { class: 'toast-icon' }, icon),
    h('span', { class: 'toast-text' }, text));
  if (action) {
    el.append(h('button', {
      class: 'btn btn-sm',
      onClick: async () => {
        dismiss();
        await action.onClick();
      },
    }, action.label));
  }
  el.append(h('button', { class: 'toast-x', 'aria-label': 'Dismiss', onClick: () => dismiss() }, '✕'));
  toastRoot.append(el);
  while (toastRoot.children.length > 4) toastRoot.firstElementChild.remove();
  requestAnimationFrame(() => el.classList.add('in'));
  let timer = sticky ? null : setTimeout(() => dismiss(), duration);
  el.addEventListener('pointerenter', () => clearTimeout(timer));
  el.addEventListener('pointerleave', () => {
    if (!sticky) timer = setTimeout(() => dismiss(), 2000);
  });
  function dismiss() {
    clearTimeout(timer);
    el.classList.remove('in');
    setTimeout(() => el.remove(), 300);
  }
  return dismiss;
}
export const toastError = (err) => {
  sfx.error();
  toast(err?.message || String(err), { icon: '⚠️', type: 'error' });
};

/** Run an async action with a busy button and error toast. */
export async function busy(btn, fn) {
  if (btn?.disabled) return undefined;
  if (btn) btn.disabled = true;
  try {
    return await fn();
  } catch (err) {
    toastError(err);
    return undefined;
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ---------------------------------------------------------------- popover
let pop = null;
export function openPopover(anchor, content, { className = '', placement = 'below' } = {}) {
  closePopover();
  const el = h('div', { class: `popover ${className}`, role: 'menu' }, content);
  document.body.append(el);
  const rect = anchor instanceof Element ? anchor.getBoundingClientRect() : { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y, width: 0 };
  const pw = el.offsetWidth;
  const ph = el.offsetHeight;
  let x = anchor instanceof Element ? rect.left + rect.width / 2 - pw / 2 : rect.left + 6;
  let y = placement === 'above' ? rect.top - ph - 10 : rect.bottom + 10;
  if (y + ph > window.innerHeight - 8) y = rect.top - ph - 10;
  x = Math.max(8, Math.min(window.innerWidth - pw - 8, x));
  y = Math.max(8, Math.min(window.innerHeight - ph - 8, y));
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  requestAnimationFrame(() => el.classList.add('in'));
  const outside = (e) => {
    if (!el.contains(e.target) && !(anchor instanceof Element && anchor.contains(e.target))) closePopover();
  };
  setTimeout(() => document.addEventListener('pointerdown', outside, true));
  pop = { el, outside };
  return { el, close: closePopover };
}
export function closePopover() {
  if (!pop) return;
  document.removeEventListener('pointerdown', pop.outside, true);
  const { el } = pop;
  pop = null;
  el.classList.remove('in');
  setTimeout(() => el.remove(), 150);
}
export const menuItem = (icon, label, onClick, { danger = false } = {}) =>
  h('button', { class: `menu-item${danger ? ' danger' : ''}`, role: 'menuitem', onClick: () => { closePopover(); onClick(); } }, h('span', {}, icon), h('span', {}, label));

// ---------------------------------------------------------------- modal
let modal = null;
export function openModal({ title, icon = '', render, className = '', onClose }) {
  closeModal();
  const body = h('div', { class: 'modal-body' });
  const card = h('div', { class: `modal-card ${className}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('header', { class: 'modal-head' }, h('h3', {}, icon ? `${icon} ${title}` : title), h('button', { class: 'panel-close', 'aria-label': 'Close', onClick: () => closeModal() }, '✕')),
    body);
  const el = h('div', { class: 'modal' }, card);
  el.addEventListener('pointerdown', (e) => {
    if (e.target === el) closeModal();
  });
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add('in'));
  const unsubs = [];
  modal = { el, unsubs, onClose };
  const api = { body, close: closeModal, on: (evt, fn) => unsubs.push(on(evt, fn)) };
  render(body, api);
  return api;
}
export function closeModal() {
  if (!modal) return;
  const { el, unsubs, onClose } = modal;
  modal = null;
  unsubs.forEach((u) => u());
  onClose?.();
  el.classList.remove('in');
  setTimeout(() => el.remove(), 250);
}

export function confirmDialog(text, { okLabel = 'Delete', danger = true } = {}) {
  return new Promise((resolve) => {
    let answer = false;
    openModal({
      title: 'Are you sure?',
      className: 'modal-sm',
      onClose: () => resolve(answer),
      render(body, api) {
        body.append(
          h('p', { class: 'muted' }, text),
          h('div', { class: 'row end gap' },
            h('button', { class: 'btn btn-ghost', onClick: () => api.close() }, 'Cancel'),
            h('button', { class: `btn ${danger ? 'btn-danger' : ''}`, onClick: () => { answer = true; api.close(); } }, okLabel)),
        );
      },
    });
  });
}

// ---------------------------------------------------------------- side panel
const panelRoot = $('#panel-root');
let current = null;

export function openPanel({ key, title, subtitle, icon, accent, focus, onClose, render }) {
  if (current?.key === key) return current.api;
  closePanel(true);
  const body = h('div', { class: 'panel-body' });
  const el = h('aside', { class: 'panel', style: `--accent:${accent}`, role: 'dialog', 'aria-label': title },
    h('header', { class: 'panel-head' },
      h('div', { class: 'panel-icon' }, icon),
      h('div', { class: 'panel-titles' }, h('h2', {}, title), subtitle ? h('p', {}, subtitle) : null),
      h('button', { class: 'panel-close', 'aria-label': 'Close', onClick: () => closePanel() }, '✕')),
    body);
  panelRoot.append(el);
  requestAnimationFrame(() => el.classList.add('open'));
  const unsubs = [];
  const cleanup = [];
  const api = { key, el, body, on: (evt, fn) => unsubs.push(on(evt, fn)), onCleanup: (fn) => cleanup.push(fn), close: () => closePanel() };
  current = { key, el, api, unsubs, cleanup, onClose };
  const desktop = window.innerWidth > 860;
  setInset(desktop ? Math.min(480, window.innerWidth * 0.42) : 0, desktop ? 0 : window.innerHeight * 0.5);
  if (focus) focusOn(focus);
  dimLabels(true);
  document.body.classList.add('panel-open');
  render(body, api);
  emit('panel', key);
  return api;
}

export function closePanel(switching = false) {
  if (!current) return;
  const c = current;
  current = null;
  c.unsubs.forEach((u) => u());
  c.cleanup.forEach((fn) => fn());
  c.onClose?.();
  c.el.classList.remove('open');
  setTimeout(() => c.el.remove(), 400);
  if (!switching) {
    clearFocus();
    setInset(0, 0);
    dimLabels(false);
    document.body.classList.remove('panel-open');
    emit('panel', null);
  }
}
export const currentPanel = () => current?.key || null;

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (pop) return closePopover();
  if (modal) return closeModal();
  if (current) closePanel();
});

// ---------------------------------------------------------------- form helpers
export function field(label, input, hint) {
  // Only wrap real form controls in <label>; custom widgets (segmented, stars) contain buttons.
  const tag = /^(INPUT|SELECT|TEXTAREA)$/.test(input.tagName) ? 'label' : 'div';
  return h(tag, { class: 'field' }, h('span', { class: 'field-label' }, label), input, hint ? h('span', { class: 'field-hint' }, hint) : null);
}

export function segmented(options, value, onChange) {
  const el = h('div', { class: 'segmented', role: 'tablist' });
  const render = () => {
    el.replaceChildren(...options.map(([v, label]) => h('button', {
      type: 'button',
      role: 'tab',
      'aria-selected': String(v === value),
      class: v === value ? 'active' : '',
      onClick: () => {
        value = v;
        render();
        onChange(v);
      },
    }, label)));
  };
  render();
  el.setValue = (v) => {
    value = v;
    render();
  };
  return el;
}

export function starInput(value, onChange) {
  const el = h('div', { class: 'stars-input', role: 'radiogroup', 'aria-label': 'Rating' });
  const render = () => {
    el.replaceChildren(...[1, 2, 3, 4, 5].map((n) => h('button', {
      type: 'button',
      class: n <= value ? 'on' : '',
      'aria-label': `${n} star${n > 1 ? 's' : ''}`,
      onClick: () => {
        value = value === n ? 0 : n;
        render();
        onChange(value);
      },
    }, '★')));
  };
  render();
  return el;
}

export function emptyState(icon, title, text) {
  return h('div', { class: 'empty' }, h('div', { class: 'empty-icon' }, icon), h('b', {}, title), h('p', {}, text));
}

/** Keeps a list container in sync by re-rendering keyed children (keeps scroll position). */
export function renderList(container, items, renderItem, empty) {
  container.replaceChildren(...(items.length ? items.map(renderItem) : [empty]));
}
