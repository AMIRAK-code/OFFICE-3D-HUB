// Free-form text notes for the wall.
import { act } from '../net.js';
import { h } from '../util.js';
import { openModal, busy, toast } from '../ui/kit.js';
import { sfx } from '../audio.js';

const COLORS = ['#ffe66d', '#ffd6a5', '#caffbf', '#9bf6ff', '#ffc6ff', '#ffadad', '#e9ecef'];
const MAX = 200;
let lastColor = COLORS[0];

export function openMemoDialog() {
  openModal({
    title: 'Write a note',
    icon: '📝',
    className: 'modal-memo',
    render(body, modal) {
      let color = lastColor;
      const text = h('textarea', { class: 'input memo-text', rows: '4', maxlength: String(MAX), placeholder: 'Remember: team lunch on Friday! 🍕', 'aria-label': 'Note text' });
      const count = h('span', { class: 'muted small' }, `0/${MAX}`);
      const paper = h('div', { class: 'memo-preview' }, text);
      const swatches = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Note colour' });
      const drawColors = () => {
        paper.style.setProperty('--memo', color);
        swatches.replaceChildren(...COLORS.map((c) => h('button', {
          type: 'button',
          class: `swatch${c === color ? ' on' : ''}`,
          style: `--c:${c}`,
          role: 'radio',
          'aria-checked': String(c === color),
          'aria-label': `Colour ${c}`,
          onClick: () => {
            color = c;
            lastColor = c;
            drawColors();
          },
        })));
      };
      const add = h('button', { class: 'btn', type: 'submit' }, 'Stick it on the wall 📌');
      const form = h('form', { class: 'col' },
        paper,
        h('div', { class: 'row between' }, swatches, count),
        h('div', { class: 'row end' }, add));
      text.addEventListener('input', () => {
        count.textContent = `${text.value.length}/${MAX}`;
      });
      // Enter posts, Shift+Enter makes a new line.
      text.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
          e.preventDefault();
          form.requestSubmit();
        }
      });
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        busy(add, async () => {
          await act('wall.addNote', { text: text.value, color });
          sfx.slap();
          toast('Note stuck on the wall!', { icon: '📝' });
          modal.close();
        });
      });
      body.append(form);
      drawColors();
      setTimeout(() => text.focus(), 250);
    },
  });
}
