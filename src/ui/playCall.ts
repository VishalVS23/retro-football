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
import { nextRoute, type PlayDef, type RouteDef } from '../sim/routes';
import { playDiagramSvg } from './playDiagram';

export interface PlayCallOptions {
  match: GameState;
  plays: PlayDef[];
  selected: number;
  /** The play lined up right now (may have hot routes); kept if it's the selected play. */
  current: PlayDef;
  /** The chosen play's index, and the play itself with any hot routes. */
  onExecute: (playIndex: number, play: PlayDef) => void;
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
const BIG: DiagramWindow = { y0: 4.5, h: 45, behind: 7 }; // tall enough for Out routes on both sides
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
  // This snap's routes (AUDIBLE changes them; picking a play resets them to its own).
  let routes: RouteDef[] = [...(o.current.name === plays[selected].name ? o.current : plays[selected]).routes];
  let audible = false;
  const calledPlay = (): PlayDef => ({ ...plays[selected], routes: [...routes] });

  const root = document.createElement('div');
  root.id = 'playcall';
  root.innerHTML = `
    <div class="pc-top">
      <div class="pc-chip">PLAY CALL: <b>${downText(match)}</b></div>
      <div class="pc-chip">ZONE: <b>${fieldZone(match.ballX)}</b></div>
      <div class="pc-chip pc-chip-off">OFFENSE: <b class="pc-kind">PASS</b></div>
    </div>
    <div class="pc-field pc-panel"><div class="pc-field-svg"></div><div class="pc-hint">TAP A RECEIVER OR THE RB TO CHANGE HIS ROUTE</div></div>
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
      <button class="pc-btn pc-audible" data-act="audible" title="Change a receiver's route for this play">AUDIBLE</button>
      <button class="pc-btn pc-cancel" data-act="cancel">CANCEL</button>
      <button class="pc-btn pc-team" data-act="team" disabled title="Coming in stage 3: rosters">TEAM</button>
    </div>
  `;
  document.body.appendChild(root);
  const fieldPanel = root.querySelector<HTMLDivElement>('.pc-field')!;
  const field = root.querySelector<HTMLDivElement>('.pc-field-svg')!;
  const audibleBtn = root.querySelector<HTMLButtonElement>('.pc-audible')!;

  /** Draws a play into a box, fitting the box's shape (see BIG / MINI). */
  const drawInto = (el: HTMLElement, play: PlayDef, win: DiagramWindow, detailed: boolean, extra: { hot?: boolean[]; tappable?: boolean } = {}) => {
    const r = el.getBoundingClientRect();
    const aspect = r.height > 0 ? r.width / r.height : 1.8;
    el.innerHTML = playDiagramSvg(play, match.ballX, match.firstDownX, {
      x0: match.ballX - win.behind,
      y0: win.y0,
      w: win.w ?? win.h * aspect,
      h: win.h,
      detailed,
      ...extra,
    });
  };
  const drawBig = () => {
    const hot = routes.map((r, i) => r.name !== plays[selected].routes[i].name);
    drawInto(field, calledPlay(), BIG, true, { hot, tappable: audible });
  };
  const setAudible = (on: boolean) => {
    audible = on;
    audibleBtn.classList.toggle('on', on);
    fieldPanel.classList.toggle('audible', on);
    drawBig();
  };
  const drawAll = () => {
    drawBig();
    root.querySelectorAll<HTMLElement>('.pc-card').forEach((c) => {
      drawInto(c.querySelector<HTMLElement>('.pc-mini')!, plays[Number(c.dataset.i)], MINI, false);
    });
  };
  const select = (i: number, resetRoutes = true) => {
    selected = i;
    if (resetRoutes) routes = [...plays[i].routes];
    root.querySelectorAll<HTMLButtonElement>('.pc-card').forEach((c) => c.classList.toggle('sel', Number(c.dataset.i) === i));
    root.querySelector('.pc-kind')!.textContent = plays[i].run ? 'RUN' : 'PASS';
    drawBig();
  };

  root.querySelector('.pc-cards')!.addEventListener('click', (e) => {
    const card = (e.target as HTMLElement).closest<HTMLButtonElement>('.pc-card');
    if (card) select(Number(card.dataset.i));
  });
  // Audible mode: each tap on a receiver gives him the next route.
  field.addEventListener('click', (e) => {
    if (!audible) return;
    const wr = (e.target as Element).closest('[data-wr]')?.getAttribute('data-wr');
    if (wr == null) return;
    const k = Number(wr);
    routes[k] = nextRoute(routes[k]);
    drawBig();
  });
  root.querySelector('.pc-btns')!.addEventListener('click', (e) => {
    const act = (e.target as HTMLElement).closest<HTMLButtonElement>('.pc-btn')?.dataset.act;
    if (act === 'go') finish(() => o.onExecute(selected, calledPlay()));
    if (act === 'audible') setAudible(!audible);
    if (act === 'cancel') finish(o.onCancel);
  });
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter') finish(() => o.onExecute(selected, calledPlay()));
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
  select(selected, false);
  root.querySelector<HTMLButtonElement>('.pc-card.sel')?.scrollIntoView({ block: 'nearest' });
}
