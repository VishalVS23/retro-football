/**
 * Feel tuning panel: a slide-in HTML panel with a slider for every value in feel.ts.
 * Changes apply live, are remembered on this device, and can be copied out as code.
 * Toggle with the ⚙ button or the backtick (`) key.
 */
import { feel } from '../config/feel';
import {
  applyOverrides,
  diffFromDefaults,
  formatFeel,
  listEntries,
  sliderRange,
  type FeelShape,
} from '../config/feelTools';

/** Fired on window whenever a feel value changes, so scenes can react (e.g. re-fit the camera). */
export const FEEL_CHANGE_EVENT = 'feelchange';

const STORAGE_KEY = 'retro-football:feel-overrides:v1';
const live = feel as unknown as FeelShape;
const defaults: FeelShape = structuredClone(live);

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) applyOverrides(live, JSON.parse(raw));
  } catch {
    /* storage blocked or corrupt: just use defaults */
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(diffFromDefaults(live, defaults)));
  } catch {
    /* storage blocked: tweaks last until refresh */
  }
}

function notify() {
  window.dispatchEvent(new Event(FEEL_CHANGE_EVENT));
}

/** Turns "sidelineMarginYards" into "sideline margin yards". */
function label(key: string) {
  return key.replace(/([A-Z])/g, ' $1').toLowerCase();
}

function fmt(n: number) {
  return String(Math.round(n * 1000) / 1000);
}

export function setupFeelPanel() {
  loadSaved();

  const toggle = document.createElement('button');
  toggle.id = 'feel-toggle';
  toggle.textContent = '⚙';
  toggle.title = 'Feel tuning (`)';

  const panel = document.createElement('div');
  panel.id = 'feel-panel';
  panel.innerHTML = `
    <div class="fp-head">
      <strong>Feel tuning</strong>
      <span class="fp-msg"></span>
    </div>
    <div class="fp-buttons">
      <button data-act="copy">Copy values</button>
      <button data-act="reset">Reset</button>
      <button data-act="close">Close</button>
    </div>
    <div class="fp-body"></div>
  `;
  const body = panel.querySelector<HTMLDivElement>('.fp-body')!;
  const msg = panel.querySelector<HTMLSpanElement>('.fp-msg')!;

  const syncers: Array<() => void> = [];

  // One section per group, one slider per value.
  let currentGroup = '';
  for (const { group, key } of listEntries(live)) {
    if (group !== currentGroup) {
      currentGroup = group;
      const h = document.createElement('h3');
      h.textContent = label(group);
      body.appendChild(h);
    }
    const r = sliderRange(key, defaults[group][key]);
    const row = document.createElement('label');
    row.className = 'fp-row';
    row.innerHTML = `<span class="fp-name">${label(key)}</span><span class="fp-val"></span>`;
    const val = row.querySelector<HTMLSpanElement>('.fp-val')!;
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(r.min);
    slider.max = String(r.max);
    slider.step = String(r.step);
    row.appendChild(slider);
    body.appendChild(row);

    const sync = () => {
      const v = live[group][key];
      slider.value = String(v);
      val.textContent = fmt(v);
      row.classList.toggle('fp-changed', v !== defaults[group][key]);
    };
    slider.addEventListener('input', () => {
      live[group][key] = Number(slider.value);
      sync();
      save();
      notify();
    });
    syncers.push(sync);
    sync();
  }

  const flash = (text: string) => {
    msg.textContent = text;
    window.setTimeout(() => (msg.textContent = ''), 2000);
  };

  const setOpen = (open: boolean) => panel.classList.toggle('open', open);
  toggle.addEventListener('click', () => setOpen(!panel.classList.contains('open')));
  window.addEventListener('keydown', (e) => {
    if (e.key === '`') setOpen(!panel.classList.contains('open'));
  });

  panel.querySelector('.fp-buttons')!.addEventListener('click', async (e) => {
    const act = (e.target as HTMLElement).dataset.act;
    if (act === 'close') setOpen(false);
    if (act === 'reset') {
      applyOverrides(live, defaults);
      syncers.forEach((s) => s());
      save();
      notify();
      flash('Reset to defaults');
    }
    if (act === 'copy') {
      const text = formatFeel(live);
      try {
        await navigator.clipboard.writeText(text);
        flash('Copied! Paste it to Claude');
      } catch {
        window.prompt('Copy these values:', text); // fallback where clipboard is blocked
      }
    }
  });

  document.body.append(toggle, panel);
  return { panel, flash };
}
