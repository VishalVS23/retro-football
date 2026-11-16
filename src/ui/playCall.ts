/**
 * Play calling screen (user's own mockup / UI kit): top bar, big play diagram, PLAY SELECT list
 * of cards with mini diagrams, and EXECUTE PLAY / AUDIBLE / CANCEL / TEAM buttons.
 * An HTML layer over the game, so text is crisp and the list scrolls natively.
 */
import '@fontsource/press-start-2p/latin-400.css';
import './playCall.css';
import type { GameState } from '../sim/drive';
import { downText } from '../sim/drive';
import { fieldZone } from '../sim/playcall';
import type { PlayDef } from '../sim/routes';
import { playDiagramSvg } from './playDiagram';

export interface PlayCallOptions {
  match: GameState;
  plays: PlayDef[];
  selected: number;
  onExecute: (playIndex: number) => void;
  onCancel: () => void;
}

let close: (() => void) | null = null;

export function isPlayCallOpen() {
  return close !== null;
}

export function closePlayCall() {
  close?.();
}

// Diagram windows, in field yards. Across the field we show the band the routes use; along the
// field, as many yards as fit the box's shape, starting a few yards behind the line of scrimmage.
// Minis use a fixed length instead, centred in the card (no empty field on the right).
const BIG: DiagramWindow = { y0: 8.5, h: 37.5, behind: 7 };
const MINI: DiagramWindow = { y0: 10, h: 34, behind: 4, w: 42 };
interface DiagramWindow {
  y0: number;
  h: number;
  behind: number;
  w?: number;
}

export function openPlayCall(o: PlayCallOptions) {
  closePlayCall();
  let selected = o.selected;
  const { match, plays } = o;

  const root = document.createElement('div');
  root.id = 'playcall';
  root.innerHTML = `
    <div class="pc-top">
      <div class="pc-chip">PLAY CALL: <b>${downText(match)}</b></div>
      <div class="pc-chip">ZONE: <b>${fieldZone(match.ballX)}</b></div>
      <div class="pc-chip pc-chip-off">OFFENSE: <b>PASS</b></div>
    </div>
    <div class="pc-field pc-panel"></div>
    <div class="pc-list pc-panel">
      <div class="pc-list-head">PLAY SELECT</div>
      <div class="pc-cards">
        ${plays
          .map(
            (p, i) => `
          <button class="pc-card" data-i="${i}">
            <span class="pc-mini"></span>
            <span class="pc-card-name">${p.name.toUpperCase()}</span>
            <span class="pc-check"></span>
          </button>`,
          )
          .join('')}
      </div>
    </div>
    <div class="pc-btns">
      <button class="pc-btn pc-go" data-act="go">EXECUTE PLAY</button>
      <button class="pc-btn pc-audible" data-act="audible" disabled title="Coming next: change a receiver's route">AUDIBLE</button>
      <button class="pc-btn pc-cancel" data-act="cancel">CANCEL</button>
      <button class="pc-btn pc-team" data-act="team" disabled title="Coming in stage 3: rosters">TEAM</button>
    </div>
  `;
  document.body.appendChild(root);
  const field = root.querySelector<HTMLDivElement>('.pc-field')!;

  /** Draws a play into a box, fitting the box's shape (see BIG / MINI). */
  const drawInto = (el: HTMLElement, play: PlayDef, win: DiagramWindow, detailed: boolean) => {
    const r = el.getBoundingClientRect();
    const aspect = r.height > 0 ? r.width / r.height : 1.8;
    el.innerHTML = playDiagramSvg(play, match.ballX, match.firstDownX, {
      x0: match.ballX - win.behind,
      y0: win.y0,
      w: win.w ?? win.h * aspect,
      h: win.h,
      detailed,
    });
  };
  const drawBig = () => drawInto(field, plays[selected], BIG, true);
  const drawAll = () => {
    drawBig();
    root.querySelectorAll<HTMLElement>('.pc-card').forEach((c) => {
      drawInto(c.querySelector<HTMLElement>('.pc-mini')!, plays[Number(c.dataset.i)], MINI, false);
    });
  };
  const select = (i: number) => {
    selected = i;
    root.querySelectorAll<HTMLButtonElement>('.pc-card').forEach((c) => c.classList.toggle('sel', Number(c.dataset.i) === i));
    drawBig();
  };

  root.querySelector('.pc-cards')!.addEventListener('click', (e) => {
    const card = (e.target as HTMLElement).closest<HTMLButtonElement>('.pc-card');
    if (card) select(Number(card.dataset.i));
  });
  root.querySelector('.pc-btns')!.addEventListener('click', (e) => {
    const act = (e.target as HTMLElement).closest<HTMLButtonElement>('.pc-btn')?.dataset.act;
    if (act === 'go') finish(() => o.onExecute(selected));
    if (act === 'cancel') finish(o.onCancel);
  });
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter') finish(() => o.onExecute(selected));
    if (e.key === 'Escape') finish(o.onCancel);
  };
  window.addEventListener('keydown', onKey);
  window.addEventListener('resize', drawAll);
  // Keep taps on the screen from reaching the game underneath.
  root.addEventListener('pointerdown', (e) => e.stopPropagation());

  close = () => {
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', drawAll);
    root.remove();
    close = null;
  };
  const finish = (then: () => void) => {
    close?.();
    then();
  };

  drawAll();
  select(selected);
  root.querySelector<HTMLButtonElement>('.pc-card.sel')?.scrollIntoView({ block: 'nearest' });
}
