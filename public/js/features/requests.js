// Requests: public or anonymous notes that can be pinned to the wall.
import { store, act } from '../net.js';
import { h, avatarEl, fullName, timeAgo, randomToken, getAnonToken, saveAnonToken, removeAnonToken } from '../util.js';
import { openPanel, segmented, emptyState, busy, toast, toastError, confirmDialog } from '../ui/kit.js';
import { focusNote } from '../scene/wall.js';
import { room } from '../scene/room.js';
import { sfx } from '../audio.js';

let tab = 'public';

const isMine = (r) => (r.authorId && r.authorId === store.me.id) || !!getAnonToken(r.id);

function composer(onPosted) {
  const text = h('textarea', { class: 'input', rows: '3', maxlength: '280', required: true, placeholder: 'e.g. Could we get oat milk in the kitchen? 🥛' });
  const count = h('span', { class: 'muted small' }, '0/280');
  text.addEventListener('input', () => {
    count.textContent = `${text.value.length}/280`;
  });
  const anon = h('input', { type: 'checkbox', class: 'switch' });
  const pin = h('input', { type: 'checkbox', class: 'switch', checked: true });
  const submit = h('button', { class: 'btn', type: 'submit' }, 'Post request');
  const form = h('form', { class: 'composer-form req-composer' },
    text,
    h('div', { class: 'row between wrap gap-sm' },
      h('div', { class: 'row gap wrap' },
        h('label', { class: 'toggle' }, anon, h('span', {}, '🕶️ Post anonymously')),
        h('label', { class: 'toggle' }, pin, h('span', {}, '📌 Pin to the wall'))),
      count),
    h('p', { class: 'small muted anon-hint' }, 'Anonymous requests are never linked to your name — not even on the server. Only this browser can edit or delete them.'),
    h('div', { class: 'row end' }, submit));
  const sync = () => form.classList.toggle('is-anon', anon.checked);
  anon.addEventListener('change', sync);
  form.setAnon = (v) => {
    anon.checked = v;
    sync();
  };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    busy(submit, async () => {
      const token = anon.checked ? randomToken() : undefined;
      const res = await act('request.add', { text: text.value, anonymous: anon.checked, pinned: pin.checked, token });
      if (token) saveAnonToken(res.id, token);
      const wasAnon = anon.checked;
      text.value = '';
      count.textContent = '0/280';
      room.requestBox.bounce();
      sfx.pop();
      toast(pin.checked ? 'Pinned to the wall! 📌' : 'Request posted!', { icon: wasAnon ? '🕶️' : '📢' });
      onPosted(res.id, wasAnon, pin.checked);
    });
  });
  return form;
}

function card(r, highlight) {
  const author = r.authorId ? store.user(r.authorId) : null;
  const mine = isMine(r);
  const voted = r.votes.includes(store.me.id);
  const token = getAnonToken(r.id);
  return h('article', { class: `card req${r.status === 'done' ? ' done' : ''}${highlight ? ' highlight' : ''}`, style: `--note:${r.color}`, dataset: { id: r.id } },
    h('div', { class: 'req-head' },
      r.anonymous ? h('span', { class: 'av anon', style: '--s:26px' }, '🕶️') : avatarEl(author, 26),
      h('b', {}, r.anonymous ? (mine ? 'Anonymous (you)' : 'Anonymous') : mine ? 'You' : fullName(author)),
      h('span', { class: 'muted small' }, timeAgo(r.at)),
      h('span', { class: 'grow' }),
      r.pinned ? h('span', { class: 'chip', title: 'Pinned to the wall' }, '📌 on the wall') : null,
      r.status === 'done' ? h('span', { class: 'chip ok' }, '✓ Done') : null),
    h('p', { class: 'req-text' }, r.text),
    h('footer', { class: 'card-foot' },
      h('button', {
        class: `like${voted ? ' on' : ''}`,
        'aria-pressed': String(voted),
        title: voted ? 'Remove your +1' : '+1 this request',
        onClick: () => {
          sfx.pop();
          act('request.vote', { id: r.id }).catch(toastError);
        },
      }, h('span', {}, '👍'), h('b', {}, String(r.votes.length))),
      h('button', { class: 'btn btn-sm btn-ghost', onClick: () => act('request.status', { id: r.id, status: r.status === 'done' ? 'open' : 'done' }).catch(toastError) }, r.status === 'done' ? '↩️ Reopen' : '✅ Mark done'),
      r.pinned ? h('button', { class: 'btn btn-sm btn-ghost', onClick: () => focusNote(r.id) }, '🔍 Find on wall') : null,
      h('span', { class: 'grow' }),
      mine ? h('button', {
        class: 'btn btn-sm btn-ghost',
        onClick: () => act('request.update', { id: r.id, pinned: !r.pinned, token }).then(() => sfx.click(), toastError),
      }, r.pinned ? 'Unpin' : '📌 Pin') : null,
      mine ? h('button', {
        class: 'icon-btn-sm',
        title: 'Delete',
        'aria-label': 'Delete request',
        onClick: async () => {
          if (!(await confirmDialog('Delete this request for everyone?'))) return;
          act('request.remove', { id: r.id, token }).then(() => removeAnonToken(r.id), toastError);
        },
      }, '🗑️') : null));
}

export function openRequests({ noteId } = {}) {
  const target = noteId && store.cols.requests.get(noteId);
  if (target) tab = target.anonymous ? 'anon' : 'public';
  let highlight = noteId || null;
  let scrollTo = highlight;
  room.requestBox.bounce();
  sfx.pop();
  const api = openPanel({
    key: 'requests',
    title: 'Requests',
    subtitle: 'Ask for anything — pin it to the wall for everyone to see',
    icon: '📌',
    accent: '#f59f00',
    focus: 'wall',
    render(body, panel) {
      let show = 'open';
      const tabs = segmented([['public', '📢 Public'], ['anon', '🕶️ Anonymous']], tab, (v) => {
        tab = v;
        form.setAnon(v === 'anon');
        draw();
      });
      const form = composer((id, wasAnon) => {
        highlight = id;
        scrollTo = id;
        if (wasAnon !== (tab === 'anon')) {
          tab = wasAnon ? 'anon' : 'public';
          tabs.setValue(tab);
        }
        draw();
      });
      form.setAnon(tab === 'anon');
      const list = h('div', { class: 'cards' });
      const filter = segmented([['open', 'Open'], ['done', 'Done'], ['all', 'All']], show, (v) => {
        show = v;
        draw();
      });
      body.append(tabs, form, h('div', { class: 'list-controls' }, filter), list);

      function draw() {
        const items = store.list('requests')
          .filter((r) => (tab === 'anon' ? r.anonymous : !r.anonymous))
          .filter((r) => show === 'all' || r.status === show)
          .sort((a, b) => (a.status === 'done') - (b.status === 'done') || b.votes.length - a.votes.length || b.at - a.at);
        list.replaceChildren(...(items.length ? items.map((r) => card(r, r.id === highlight)) : [
          tab === 'anon'
            ? emptyState('🕶️', 'No anonymous requests', 'Something you’d rather not ask with your name? Post it here.')
            : emptyState('📢', show === 'done' ? 'Nothing done yet' : 'No open requests', 'Need a new chair, a team lunch, or better coffee? Ask away!'),
        ]));
        if (highlight && scrollTo === highlight) {
          scrollTo = null;
          const el = list.querySelector(`[data-id="${CSS.escape(highlight)}"]`);
          el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      }
      draw();
      panel.on('col:requests', draw);
      panel.on('col:users', draw);
    },
  });
  if (noteId) setTimeout(() => focusNote(noteId), 50);
  return api;
}
