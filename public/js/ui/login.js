// Login: first name + surname identify you (same pair next time = same person).
import { api, auth } from '../net.js';
import { h, $, avatarEl, pickFile, resizeImage, MONTHS } from '../util.js';
import { unlockAudio, sfx } from '../audio.js';

const root = $('#login');

function card(...children) {
  root.replaceChildren(h('div', { class: 'login-card' }, ...children));
  root.classList.remove('hidden');
  requestAnimationFrame(() => root.classList.add('in'));
}

/** Resolves with { user, isNew } once signed in. */
export function showLogin(config) {
  return new Promise((resolve) => {
    const first = h('input', { class: 'input', name: 'given-name', autocomplete: 'given-name', required: true, maxlength: '40', placeholder: 'e.g. Amir' });
    const last = h('input', { class: 'input', name: 'family-name', autocomplete: 'family-name', required: true, maxlength: '40', placeholder: 'e.g. Rossi' });
    const pass = config.passcodeRequired ? h('input', { class: 'input', type: 'password', autocomplete: 'current-password', required: true, placeholder: 'Ask your office manager' }) : null;
    const error = h('p', { class: 'login-error', role: 'alert' });
    const submit = h('button', { class: 'btn btn-lg', type: 'submit' }, 'Come in  →');
    const form = h('form', { class: 'login-form' },
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Name'), first),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Surname'), last),
      pass ? h('label', { class: 'field' }, h('span', { class: 'field-label' }, '🔒 Office passcode'), pass) : null,
      error,
      submit);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      unlockAudio();
      error.textContent = '';
      submit.disabled = true;
      try {
        const res = await api.login({ firstName: first.value, lastName: last.value, passcode: pass?.value });
        auth.set(res.token);
        sfx.chime();
        resolve(res);
      } catch (err) {
        error.textContent = err.message;
        sfx.error();
        form.closest('.login-card')?.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-10px)' }, { transform: 'translateX(10px)' }, { transform: 'translateX(0)' }], { duration: 300 });
      } finally {
        submit.disabled = false;
      }
    });
    card(
      h('div', { class: 'login-door' }, '🚪'),
      h('h1', {}, `Welcome to ${config.officeName}`),
      h('p', { class: 'muted' }, 'Enter your name to come in. Your surname is your key — use the same name & surname next time and we’ll remember you.'),
      form,
    );
    setTimeout(() => first.focus(), 300);
  });
}

/** Optional second step for newcomers: avatar + birthday. Resolves with { birthday }. */
export function showWelcome(user) {
  return new Promise((resolve) => {
    let current = user;
    const avatarBox = h('button', { class: 'avatar-drop', type: 'button', 'aria-label': 'Upload an avatar' });
    const drawAvatar = () => avatarBox.replaceChildren(avatarEl(current, 110), h('span', { class: 'avatar-edit' }, '📸'));
    drawAvatar();
    const status = h('p', { class: 'small muted center' }, 'Click the circle to upload a photo');
    avatarBox.addEventListener('click', async () => {
      const file = await pickFile('image/png,image/jpeg,image/webp');
      if (!file) return;
      status.textContent = 'Uploading…';
      try {
        const dataUrl = await resizeImage(file, { max: 256, square: true, type: 'image/jpeg', quality: 0.88 });
        const res = await api.upload('avatar', dataUrl);
        current = { ...current, avatar: res.url };
        drawAvatar();
        sfx.pop();
        status.textContent = 'Looking great! ✨';
      } catch (err) {
        status.textContent = err.message;
      }
    });
    const month = h('select', { class: 'input', 'aria-label': 'Birthday month' }, h('option', { value: '' }, 'Month'), ...MONTHS.map((m, i) => h('option', { value: String(i + 1) }, m)));
    const day = h('select', { class: 'input', 'aria-label': 'Birthday day' }, h('option', { value: '' }, 'Day'), ...Array.from({ length: 31 }, (_, i) => h('option', { value: String(i + 1) }, String(i + 1))));
    if (user.birthday) {
      month.value = String(user.birthday.m);
      day.value = String(user.birthday.d);
    }
    const go = h('button', { class: 'btn btn-lg', type: 'button' }, 'Enter the office  🎉');
    go.addEventListener('click', () => {
      const birthday = month.value && day.value ? { m: Number(month.value), d: Number(day.value) } : null;
      resolve({ birthday });
    });
    card(
      h('h1', {}, `Hi ${user.firstName}! 👋`),
      h('p', { class: 'muted' }, 'Add a face so colleagues recognise your cursor — it follows you around the office.'),
      h('div', { class: 'col center' }, avatarBox, status),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, '🎂 Your birthday (optional — no year needed)'), h('div', { class: 'row gap-sm' }, month, day)),
      go,
      h('button', { class: 'link-btn', type: 'button', onClick: () => resolve({ birthday: null }) }, 'Skip for now'),
    );
  });
}

export function hideLogin() {
  root.classList.remove('in');
  setTimeout(() => {
    root.classList.add('hidden');
    root.replaceChildren();
  }, 500);
}
