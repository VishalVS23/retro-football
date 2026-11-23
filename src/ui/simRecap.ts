/**
 * Recap after SIM TO END OF QUARTER / SIM THIS DRIVE (3g-C): every simulated drive (team, result,
 * plays / yards / time), the score, who has the ball next, and CONTINUE (Enter) or SIM NEXT QUARTER.
 * An HTML layer in the same pixel style as the drive summary.
 */
import '@fontsource/press-start-2p/latin-400.css';
import './simRecap.css';

export interface RecapRow {
  abbr: string;
  /** e.g. TOUCHDOWN, PUNT, DRIVE GOES ON. */
  result: string;
  /** e.g. "6 PLAYS · 54 YDS · 1:12". */
  detail: string;
  /** Good for us (green), bad (red), or neither. */
  tone: 'good' | 'bad' | '';
}

export interface SimRecapOptions {
  title: string;
  rows: RecapRow[];
  score: string;
  /** Who has the ball next, e.g. "YOUR BALL · OWN 35 · 2nd & 4". */
  next: string;
  onContinue: () => void;
  /** SIM NEXT QUARTER (left out = no button). */
  onSimNext?: () => void;
}

let close: (() => void) | null = null;

export function closeSimRecap() {
  close?.();
}

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function openSimRecap(o: SimRecapOptions) {
  closeSimRecap();
  const el = document.createElement('div');
  el.id = 'sim-recap';
  const rows = o.rows.length
    ? o.rows
        .map(
          (r) => `<div class="sr-row"><span class="sr-abbr">${esc(r.abbr)}</span><span class="sr-result ${r.tone}">${esc(r.result)}</span><span class="sr-detail">${esc(r.detail)}</span></div>`,
        )
        .join('')
    : '<div class="sr-row sr-empty">NO DRIVES</div>';
  el.innerHTML = `
    <div class="sr-panel" role="dialog" aria-label="Simulation recap">
      <div class="sr-title">${esc(o.title)}</div>
      <div class="sr-rows">${rows}</div>
      <div class="sr-score">${esc(o.score)}</div>
      <div class="sr-next">${esc(o.next)}</div>
      <div class="sr-btns">
        ${o.onSimNext ? '<button class="sr-btn sr-sim" type="button">SIM NEXT QUARTER</button>' : ''}
        <button class="sr-btn sr-go" type="button">CONTINUE &gt;</button>
      </div>
    </div>`;
  const go = () => {
    closeSimRecap();
    o.onContinue();
  };
  el.querySelector('.sr-go')!.addEventListener('click', go);
  el.querySelector('.sr-sim')?.addEventListener('click', () => {
    closeSimRecap();
    o.onSimNext?.();
  });
  // Taps never reach the field; Enter = CONTINUE, and no other key reaches the game while it's open.
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  const onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement | null)?.closest?.('input, select, textarea')) return; // ⚙ panel
    e.stopImmediatePropagation();
    if (e.type === 'keydown' && e.key === 'Enter') {
      e.preventDefault();
      go();
    }
  };
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKey, true);
  document.body.appendChild(el);
  close = () => {
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('keyup', onKey, true);
    el.remove();
    close = null;
  };
}
