// Recommendations: podcasts & music (radio), movies/series (TV) and books (bookshelf) — with likes and comments.
import { store, act } from '../net.js';
import { h, avatarEl, timeAgo, fullName } from '../util.js';
import { openPanel, field, segmented, starInput, emptyState, busy, toast, toastError, confirmDialog } from '../ui/kit.js';
import { room } from '../scene/room.js';
import { sfx } from '../audio.js';

const PLATFORMS = ['Netflix', 'Prime Video', 'Disney+', 'Apple TV+', 'Max', 'NOW', 'RaiPlay', 'Paramount+', 'YouTube', 'Cinema', 'Other'];
const GENRES = ['Pop', 'Rock', 'Hip-hop', 'Electronic', 'Jazz', 'Classical', 'Indie', 'R&B', 'Lo-fi / Focus', 'Italian', 'Other'];

// One entry per kind of recommendation.
const KINDS = {
  podcasts: {
    tab: '🎙️ Podcasts', add: '＋ Recommend a podcast', thanks: 'On air! Thanks for the recommendation 📻', icon: '📻',
    placeholder: 'e.g. Huberman Lab', notePlaceholder: 'Why should we listen? Favourite episode?', action: '▶ Listen',
    empty: ['🎙️', 'The airwaves are quiet', 'Be the first to recommend a podcast!'],
  },
  music: {
    tab: '🎵 Music', add: '＋ Recommend a song or album', thanks: 'Added to the office playlist 🎶', icon: '🎵',
    placeholder: 'e.g. Bohemian Rhapsody', notePlaceholder: 'Perfect for focusing? Friday mood? Tell us!', action: '▶ Play',
    empty: ['🎧', 'The playlist is empty', 'Share a song or an album you love.'],
  },
  shows: {
    add: '＋ Recommend a movie or series', thanks: 'Now showing on the office TV 🍿', icon: '📺',
    placeholder: 'e.g. The Bear', notePlaceholder: 'Why should we watch it? No spoilers 🙊', action: '▶ Watch',
    empty: ['🍿', 'Nothing on TV yet', 'Recommend a movie or a series to get the show started.'],
  },
  books: {
    add: '＋ Recommend a book', thanks: 'On the shelf! Thanks for the recommendation 📚', icon: '📚',
    placeholder: 'e.g. Atomic Habits', notePlaceholder: 'What did you love about it?', action: '📖 Open',
    empty: ['📚', 'The shelf is empty', 'Recommend a book your colleagues should read.'],
  },
};

// The three panels and which kinds each one shows.
const PANELS = {
  radio: { cols: ['podcasts', 'music'], title: 'Office Radio', subtitle: 'Podcasts & music picks from your colleagues', icon: '📻', accent: '#ff7a2f', focus: 'radio' },
  tv: { cols: ['shows'], title: 'Movie & Series TV', subtitle: 'What should we watch next?', icon: '📺', accent: '#228be6', focus: 'tv' },
  books: { cols: ['books'], title: 'Book Club', subtitle: 'Good reads recommended by the team', icon: '📚', accent: '#d9480f', focus: 'books' },
};

let radioTab = 'podcasts';

export function tvSlides() {
  return store.list('shows')
    .sort((a, b) => b.likes.length - a.likes.length || b.at - a.at)
    .slice(0, 10)
    .map((s) => ({ ...s, by: store.user(s.by)?.firstName || 'someone' }));
}

// ---------------------------------------------------------------- add form
function composer(col) {
  const k = KINDS[col];
  const data = { kind: 'movie', rating: 0 };
  const title = h('input', { class: 'input', required: true, maxlength: '120', placeholder: k.placeholder });
  const url = h('input', { class: 'input', type: 'text', inputmode: 'url', autocomplete: 'url', maxlength: '500', placeholder: 'Paste a link (optional)' });
  const note = h('textarea', { class: 'input', rows: '2', maxlength: '400', placeholder: k.notePlaceholder });
  const extra = {};
  const fields = [field(col === 'music' ? 'Song or album' : 'Title', title)];
  if (col === 'podcasts') {
    extra.host = h('input', { class: 'input', maxlength: '80', placeholder: 'Host or network (optional)' });
    fields.push(field('Host / show', extra.host));
  } else if (col === 'music') {
    extra.artist = h('input', { class: 'input', maxlength: '80', placeholder: 'Artist or band' });
    extra.genre = h('select', { class: 'input' }, h('option', { value: '' }, 'Genre…'), ...GENRES.map((g) => h('option', { value: g }, g)));
    fields.push(h('div', { class: 'row gap-sm wrap' }, field('Artist', extra.artist), field('Genre', extra.genre)));
  } else if (col === 'shows') {
    extra.platform = h('select', { class: 'input' }, h('option', { value: '' }, 'Where to watch…'), ...PLATFORMS.map((p) => h('option', { value: p }, p)));
    fields.push(
      h('div', { class: 'row gap wrap' },
        field('Type', segmented([['movie', '🎬 Movie'], ['series', '📺 Series']], data.kind, (v) => { data.kind = v; })),
        field('Your rating', starInput(0, (v) => { data.rating = v; }))),
      field('Platform', extra.platform),
    );
  } else if (col === 'books') {
    extra.author = h('input', { class: 'input', maxlength: '80', placeholder: 'Author' });
    fields.push(h('div', { class: 'row gap wrap' }, field('Author', extra.author), field('Your rating', starInput(0, (v) => { data.rating = v; }))));
  }
  fields.push(field('Link', url), field('Your note', note));
  const submit = h('button', { class: 'btn', type: 'submit' }, 'Recommend');
  const form = h('form', { class: 'composer-form' }, ...fields, h('div', { class: 'row end' }, submit));
  const details = h('details', { class: 'composer' }, h('summary', {}, k.add), form);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    busy(submit, async () => {
      const payload = { title: title.value, url: url.value, note: note.value };
      if (col === 'podcasts') payload.host = extra.host.value;
      if (col === 'music') Object.assign(payload, { artist: extra.artist.value, genre: extra.genre.value });
      if (col === 'shows') Object.assign(payload, { kind: data.kind, rating: data.rating, platform: extra.platform.value });
      if (col === 'books') Object.assign(payload, { author: extra.author.value, rating: data.rating });
      await act(`${col}.add`, payload);
      form.reset();
      details.open = false;
      sfx.pop();
      if (col === 'books') room.bookshelf.wiggle();
      toast(k.thanks, { icon: k.icon });
    });
  });
  return details;
}

// ---------------------------------------------------------------- cards & comments
function stars(n) {
  return h('span', { class: 'stars', 'aria-label': `${n} out of 5` }, '★'.repeat(n), h('span', { class: 'off' }, '★'.repeat(5 - n)));
}

function metaFor(col, it) {
  if (col === 'shows') return [h('span', { class: `chip ${it.kind}` }, it.kind === 'series' ? '📺 Series' : '🎬 Movie'), it.platform ? h('span', { class: 'chip' }, it.platform) : null, it.rating ? stars(it.rating) : null];
  if (col === 'music') return [it.artist ? h('span', { class: 'chip' }, `🎤 ${it.artist}`) : null, it.genre ? h('span', { class: 'chip' }, it.genre) : null];
  if (col === 'books') return [it.author ? h('span', { class: 'chip' }, `✍️ ${it.author}`) : null, it.rating ? stars(it.rating) : null];
  return [it.host ? h('span', { class: 'chip' }, `🎙️ ${it.host}`) : null];
}

/** Per-panel UI state that survives re-renders: open threads, drafts, focused input. */
function threadState() {
  return { open: new Set(), drafts: new Map(), focused: null };
}

function commentThread(col, it, state) {
  const me = store.me.id;
  const comments = it.comments || [];
  const input = h('input', { class: 'input input-sm', maxlength: '300', placeholder: 'Write a comment…', 'aria-label': 'Write a comment', value: state.drafts.get(it.id) || '' });
  input.dataset.thread = it.id;
  input.addEventListener('input', () => state.drafts.set(it.id, input.value));
  input.addEventListener('focus', () => { state.focused = it.id; });
  input.addEventListener('blur', () => { if (state.focused === it.id) state.focused = null; });
  const send = h('button', { class: 'btn btn-sm', type: 'submit' }, 'Send');
  const form = h('form', { class: 'comment-form' }, input, send);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!input.value.trim()) return;
    const text = input.value;
    // Clear first: the server's update can re-render the thread before the reply arrives.
    state.drafts.delete(it.id);
    state.focused = it.id;
    input.value = '';
    busy(send, async () => {
      try {
        await act(`${col}.comment`, { id: it.id, text });
        sfx.pop();
      } catch (err) {
        state.drafts.set(it.id, text);
        state.redraw();
        throw err;
      }
    });
  });
  return h('div', { class: 'comments' },
    ...comments.map((c) => {
      const author = store.user(c.by);
      const canDelete = c.by === me || it.by === me;
      return h('div', { class: 'comment' },
        avatarEl(author, 24),
        h('div', { class: 'grow' },
          h('div', { class: 'comment-meta' }, h('b', {}, c.by === me ? 'You' : fullName(author)), h('span', { class: 'muted' }, timeAgo(c.at))),
          h('p', {}, c.text)),
        canDelete ? h('button', {
          class: 'icon-btn-sm',
          title: 'Delete comment',
          'aria-label': 'Delete comment',
          onClick: () => act(`${col}.uncomment`, { id: it.id, commentId: c.id }).catch(toastError),
        }, '✕') : null);
    }),
    comments.length ? null : h('p', { class: 'small muted' }, 'No comments yet — start the conversation!'),
    form);
}

function card(col, it, state) {
  const k = KINDS[col];
  const by = store.user(it.by);
  const mine = it.by === store.me.id;
  const liked = it.likes.includes(store.me.id);
  const nComments = (it.comments || []).length;
  const open = state.open.has(it.id);
  return h('article', { class: 'card rec' },
    h('div', { class: 'rec-top' },
      h('div', { class: 'grow' }, h('h4', {}, it.title), h('div', { class: 'meta' }, ...metaFor(col, it))),
      h('button', {
        class: `like${liked ? ' on' : ''}`,
        'aria-pressed': String(liked),
        title: liked ? 'Unlike' : 'Like',
        onClick: () => {
          sfx.pop();
          act(`${col}.like`, { id: it.id }).catch(toastError);
        },
      }, h('span', {}, liked ? '❤️' : '🤍'), h('b', {}, String(it.likes.length)))),
    it.note ? h('p', { class: 'rec-note' }, it.note) : null,
    h('footer', { class: 'card-foot' },
      avatarEl(by, 22),
      h('span', { class: 'muted' }, `${mine ? 'You' : by?.firstName || 'Someone'} · ${timeAgo(it.at)}`),
      h('span', { class: 'grow' }),
      h('button', {
        class: `btn btn-sm btn-ghost${open ? ' active' : ''}`,
        'aria-expanded': String(open),
        onClick: () => {
          if (open) state.open.delete(it.id);
          else {
            state.open.add(it.id);
            state.focused = it.id;
          }
          state.redraw();
        },
      }, `💬 ${nComments || 'Comment'}`),
      it.url ? h('a', { class: 'btn btn-sm btn-ghost', href: it.url, target: '_blank', rel: 'noopener noreferrer' }, k.action) : null,
      mine ? h('button', {
        class: 'icon-btn-sm',
        title: 'Delete',
        'aria-label': 'Delete recommendation',
        onClick: async () => {
          if (await confirmDialog(`Remove “${it.title}”?`)) act(`${col}.remove`, { id: it.id }).catch(toastError);
        },
      }, '🗑️') : null),
    open ? commentThread(col, it, state) : null);
}

/** A complete list (composer + filters + cards) for one kind of recommendation. */
function section(col, panel) {
  const state = threadState();
  let sort = 'top';
  let filter = 'all';
  const search = h('input', { class: 'input input-sm', type: 'search', placeholder: 'Search…', 'aria-label': 'Search recommendations' });
  const list = h('div', { class: 'cards' });
  const controls = h('div', { class: 'list-controls' },
    segmented([['top', '🔥 Popular'], ['new', '🆕 Newest']], sort, (v) => { sort = v; draw(); }),
    col === 'shows' ? segmented([['all', 'All'], ['movie', 'Movies'], ['series', 'Series']], filter, (v) => { filter = v; draw(); }) : null,
    search);
  search.addEventListener('input', () => draw());
  const el = h('div', { class: 'col rec-section' }, composer(col), controls, list);

  function draw() {
    const q = search.value.trim().toLowerCase();
    const items = store.list(col)
      .filter((it) => filter === 'all' || it.kind === filter)
      .filter((it) => !q || [it.title, it.host, it.artist, it.author, it.genre, it.platform, it.note].join(' ').toLowerCase().includes(q))
      .sort((a, b) => (sort === 'top' ? b.likes.length - a.likes.length || b.at - a.at : b.at - a.at));
    const keep = state.focused; // removing a focused input may fire blur and clear it
    list.replaceChildren(...(items.length ? items.map((it) => card(col, it, state)) : [q || filter !== 'all' ? emptyState('🔍', 'No matches', 'Try another search or filter.') : emptyState(...KINDS[col].empty)]));
    // Keep the caret in the comment box someone is typing in.
    state.focused = keep;
    if (keep) {
      const input = list.querySelector(`[data-thread="${CSS.escape(keep)}"]`);
      if (input && document.activeElement !== input) {
        input.focus({ preventScroll: true });
        input.setSelectionRange(input.value.length, input.value.length);
      }
    }
  }
  state.redraw = draw;
  draw();
  panel.on(`col:${col}`, draw);
  panel.on('col:users', draw);
  return el;
}

// ---------------------------------------------------------------- panels
export function openRecs(key) {
  const p = PANELS[key];
  if (key === 'radio') {
    room.radio.setActive(true);
    sfx.tune();
  } else if (key === 'tv') {
    room.tv.turnOn();
    sfx.tvOn();
  } else {
    room.bookshelf.wiggle();
    sfx.pop();
  }
  openPanel({
    key,
    title: p.title,
    subtitle: p.subtitle,
    icon: p.icon,
    accent: p.accent,
    focus: p.focus,
    onClose: () => {
      if (key === 'radio') room.radio.setActive(false);
      if (key === 'tv') {
        room.tv.turnOff();
        sfx.tvOff();
      }
    },
    render(body, panel) {
      if (p.cols.length === 1) {
        body.append(section(p.cols[0], panel));
        return;
      }
      // Radio: Podcasts / Music tabs (each keeps its own state while switching).
      const sections = Object.fromEntries(p.cols.map((c) => [c, section(c, panel)]));
      const holder = h('div');
      const show = () => holder.replaceChildren(sections[radioTab]);
      body.append(segmented(p.cols.map((c) => [c, KINDS[c].tab]), radioTab, (v) => {
        radioTab = v;
        sfx.click();
        show();
      }), holder);
      show();
    },
  });
}
