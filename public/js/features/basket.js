// Too Good To Go basket: list things to give away, reserve them, mark them as given.
import { api, store, act } from '../net.js';
import { h, avatarEl, timeAgo, fullName, pickFile, resizeImage } from '../util.js';
import { openPanel, field, emptyState, busy, toast, toastError, confirmDialog } from '../ui/kit.js';
import { room } from '../scene/room.js';
import { sfx } from '../audio.js';

function composer() {
  let photo = null;
  const title = h('input', { class: 'input', required: true, maxlength: '80', placeholder: 'e.g. 3 croissants, a desk lamp, concert ticket…' });
  const desc = h('textarea', { class: 'input', rows: '2', maxlength: '300', placeholder: 'Condition, best-before date, size… (optional)' });
  const pickup = h('input', { class: 'input', maxlength: '120', placeholder: 'e.g. Kitchen fridge, top shelf — until 6pm' });
  const preview = h('div', { class: 'photo-preview' }, h('span', {}, '📷'));
  const photoBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-sm' }, 'Add a photo');
  photoBtn.addEventListener('click', () => busy(photoBtn, async () => {
    const file = await pickFile('image/png,image/jpeg,image/webp');
    if (!file) return;
    const dataUrl = await resizeImage(file, { max: 900, type: 'image/jpeg', quality: 0.85 });
    const res = await api.upload('photo', dataUrl);
    photo = res.url;
    preview.replaceChildren(h('img', { src: photo, alt: 'Item photo' }));
    photoBtn.textContent = 'Change photo';
  }));
  const submit = h('button', { class: 'btn', type: 'submit' }, 'Put it in the basket 🧺');
  const form = h('form', { class: 'composer-form' },
    field('What are you giving away?', title),
    field('Details', desc),
    field('Pick-up', pickup),
    h('div', { class: 'row gap' }, preview, photoBtn),
    h('div', { class: 'row end' }, submit));
  const details = h('details', { class: 'composer' }, h('summary', {}, '＋ Give something away'), form);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    busy(submit, async () => {
      await act('giveaways.add', { title: title.value, desc: desc.value, pickup: pickup.value, photo });
      form.reset();
      photo = null;
      preview.replaceChildren(h('span', {}, '📷'));
      photoBtn.textContent = 'Add a photo';
      details.open = false;
      room.basket.hop();
      sfx.pop();
      toast('In the basket! Colleagues have been notified 🌱', { icon: '🧺' });
    });
  });
  return details;
}

function itemCard(it) {
  const me = store.me.id;
  const giver = store.user(it.by);
  const claimer = it.claimedBy ? store.user(it.claimedBy) : null;
  const mine = it.by === me;
  const run = (type, msg) => (e) => busy(e.currentTarget, async () => {
    await act(type, { id: it.id });
    if (msg) toast(msg, { icon: '🧺' });
    sfx.pop();
  });
  const actions = [];
  if (it.status === 'available' && !mine) actions.push(h('button', { class: 'btn btn-sm', onClick: run('giveaways.claim', `Reserved! Ask ${giver?.firstName || 'them'} where to pick it up.`) }, '🙋 I want it!'));
  if (it.status === 'reserved' && it.claimedBy === me) actions.push(h('button', { class: 'btn btn-sm btn-ghost', onClick: run('giveaways.release') }, 'Cancel reservation'));
  if (mine && it.status !== 'given') actions.push(h('button', { class: 'btn btn-sm btn-ghost', onClick: run('giveaways.done', 'Marked as given — thank you! 💚') }, '✅ Given'));
  if (mine && it.status === 'reserved') actions.push(h('button', { class: 'btn btn-sm btn-ghost', onClick: run('giveaways.release') }, '↩️ Make available'));
  if (mine) {
    actions.push(h('button', {
      class: 'icon-btn-sm',
      title: 'Delete',
      'aria-label': 'Delete item',
      onClick: async () => {
        if (await confirmDialog(`Remove “${it.title}” from the basket?`)) act('giveaways.remove', { id: it.id }).catch(toastError);
      },
    }, '🗑️'));
  }
  const status = {
    available: h('span', { class: 'chip ok' }, 'Available'),
    reserved: h('span', { class: 'chip warn' }, claimer?.id === me ? 'Reserved for you' : `Reserved by ${claimer ? claimer.firstName : 'someone'}`),
    given: h('span', { class: 'chip muted' }, 'Given away'),
  }[it.status];
  return h('article', { class: `card give ${it.status}` },
    it.photo ? h('img', { class: 'give-photo', src: it.photo, alt: it.title, loading: 'lazy' }) : h('div', { class: 'give-photo ph' }, '🎁'),
    h('div', { class: 'grow' },
      h('div', { class: 'row between gap-sm' }, h('h4', {}, it.title), status),
      it.desc ? h('p', { class: 'small' }, it.desc) : null,
      it.pickup ? h('p', { class: 'small muted' }, `📍 ${it.pickup}`) : null,
      h('footer', { class: 'card-foot' },
        avatarEl(giver, 20),
        h('span', { class: 'muted small' }, `${mine ? 'You' : fullName(giver)} · ${timeAgo(it.at)}`),
        h('span', { class: 'grow' }),
        ...actions)));
}

export function openBasket() {
  room.basket.hop();
  sfx.pop();
  openPanel({
    key: 'basket',
    title: 'Too Good To Go',
    subtitle: 'Give away what you don’t need — first come, first served',
    icon: '🧺',
    accent: '#0f8a4a',
    focus: 'basket',
    render(body, panel) {
      const list = h('div', { class: 'cards' });
      body.append(composer(), list);
      function draw() {
        const all = store.list('giveaways').sort((a, b) => b.at - a.at);
        const avail = all.filter((i) => i.status === 'available');
        const reserved = all.filter((i) => i.status === 'reserved');
        const given = all.filter((i) => i.status === 'given');
        const sections = [];
        sections.push(h('h3', { class: 'section-title' }, `Up for grabs (${avail.length})`));
        sections.push(...(avail.length ? avail.map(itemCard) : [emptyState('🧺', 'The basket is empty', 'Leftover snacks? A book you finished? Give it a second life!')]));
        if (reserved.length) sections.push(h('h3', { class: 'section-title' }, `Reserved (${reserved.length})`), ...reserved.map(itemCard));
        if (given.length) sections.push(h('details', { class: 'given-list' }, h('summary', {}, `Given away (${given.length}) 💚`), ...given.slice(0, 30).map(itemCard)));
        list.replaceChildren(...sections);
      }
      draw();
      panel.on('col:giveaways', draw);
      panel.on('col:users', draw);
    },
  });
}
