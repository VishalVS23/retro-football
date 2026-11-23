/**
 * Play calling screen (user's own mockup / UI kit): top bar, big play diagram, PLAY SELECT list
 * of cards with mini diagrams, and EXECUTE PLAY / AUDIBLE / CANCEL / TEAM buttons.
 * An HTML layer over the game, so text is crisp and the list scrolls natively.
 */
import { starText } from '../league/teamStars';
import '@fontsource/press-start-2p/latin-400.css';
import './playCall.css';
import type { GameState } from '../sim/drive';
import { downText } from '../sim/drive';
import { TOTAL_LENGTH } from '../sim/field';
import type { FourthChoice } from '../sim/fourthDown';
import { fieldZone } from '../sim/playcall';
import { nextRoute, type PlayDef, type RouteDef } from '../sim/routes';
import { playDiagramSvg, type DiagramDefense } from './playDiagram';
import type { DefCallId } from '../sim/defCalls';

export interface PlayCallOptions {
  match: GameState;
  /** Quarter and time, e.g. "Q2 1:05". */
  clock: string;
  /** The opponent and their overall stars, e.g. { abbr: 'BAL', stars: 4 } (left out = no chip). */
  opponent?: { abbr: string; stars: number } | null;
  /** Our timeouts left, and whether one can be called now (only while the clock is running). */
  timeoutsLeft: number;
  canTimeout: boolean;
  /** Calls the timeout; returns the timeouts left afterwards. */
  onTimeout: () => number;
  plays: PlayDef[];
  selected: number;
  /** The play lined up right now (may have hot routes); kept if it's the selected play. */
  current: PlayDef;
  /** The chosen play's index, and the play itself with any hot routes. */
  onExecute: (playIndex: number, play: PlayDef) => void;
  onCancel: () => void;
  /**
   * Kick button: "FIELD GOAL (37 YD)" when in range, "KICK XP" on a try, or null for none.
   * On a try, EXECUTE PLAY becomes GO FOR 2.
   */
  kickLabel: string | null;
  onKick: () => void;
  /** 4th down: show PUNT. */
  canPunt: boolean;
  onPunt: () => void;
  /** The coach's 4th-down tip (null on other downs); its button gets a gold glow. */
  tip: { choice: FourthChoice; text: string } | null;
  /** Our players' last names for the big diagram (formation order); null = plain WR / RB / QB. */
  names: { qb: string; skill: string[] } | null;
  /** Their defenders' names and the matchup edges for the big diagram (see DiagramView.defense); null = plain CB / LB / S. */
  matchups: DiagramDefense | null;
  /** At the line (PLAYS reopened before the snap): their defensive call, drawn in the diagram, with a read and a tip. null = in the huddle. */
  defenseRead: { call: DefCallId; name: string; tip: string } | null;
  /** TEAM: opens the roster (null = not available yet, e.g. before a team is picked). */
  onTeam: (() => void) | null;
  /** SIM (3g): its menu's choices; picking one closes the screen and calls `onSim`. null = no SIM button. */
  sim?: { options: { id: string; label: string; note?: string }[]; onSim: (id: string) => void } | null;
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
const BIG: DiagramWindow = { y0: 4.5, h: 45, behind: 14 }; // tall enough for Out routes on both sides; 14 yd behind fits the slot's name left of him (3h-a)
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

  const tipLines = [
    ...(o.tip ? [`COACH: <b>${o.tip.text.toUpperCase()}</b>`] : []),
    ...(o.defenseRead ? [`LOOKS LIKE: <b>${o.defenseRead.name}</b> - ${o.defenseRead.tip.toUpperCase()}`] : []),
  ];
  const rec = (c: FourthChoice) => (o.tip?.choice === c ? ' pc-rec' : '');

  const root = document.createElement('div');
  root.id = 'playcall';
  root.innerHTML = `
    <div class="pc-top">
      <div class="pc-chip">PLAY CALL: <b>${downText(match)}</b></div>
      <div class="pc-chip pc-chip-fixed"><b>${o.clock}</b></div>
      <div class="pc-chip pc-chip-zone">ZONE: <b>${fieldZone(match.ballX)}</b></div>
      <div class="pc-chip pc-chip-off">OFFENSE: <b class="pc-kind">PASS</b></div>
      ${o.opponent ? `<div class="pc-chip pc-chip-fixed pc-chip-vs">VS ${o.opponent.abbr} <b>${starText(o.opponent.stars)}</b></div>` : ''}
      ${o.sim ? '<button class="pc-chip pc-chip-fixed pc-sim" type="button" title="Let your coach play it out">SIM</button>' : ''}
    </div>
    ${
      o.sim
        ? `<div class="pc-sim-menu" hidden><div class="pc-sim-box pc-panel">
            <div class="pc-sim-title">SIMULATE</div>
            ${o.sim.options.map((x) => `<button class="pc-btn pc-sim-opt" data-sim="${x.id}">${x.label}${x.note ? `<span class="pc-sim-note">${x.note}</span>` : ''}</button>`).join('')}
            <button class="pc-btn pc-cancel pc-sim-cancel">CANCEL</button>
          </div></div>`
        : ''
    }
    <div class="pc-field pc-panel"><div class="pc-field-svg"></div>${tipLines.length ? `<div class="pc-tip">${tipLines.join('<br>')}</div>` : ''}<div class="pc-hint">TAP A RECEIVER, THE RB OR THE TE TO CHANGE HIS ROUTE</div></div>
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
      <button class="pc-btn pc-go${rec('go')}" data-act="go">${match.tryPending ? 'GO FOR 2' : 'EXECUTE PLAY'}</button>
      ${o.canPunt ? `<button class="pc-btn pc-punt${rec('punt')}" data-act="punt">PUNT</button>` : ''}
      ${o.kickLabel ? `<button class="pc-btn pc-kick${rec('fieldGoal')}" data-act="kick">${o.kickLabel}</button>` : ''}
      <button class="pc-btn pc-audible" data-act="audible" title="Change a receiver's route for this play">AUDIBLE</button>
      <button class="pc-btn pc-timeout" data-act="timeout" title="Stops the running clock: no huddle time comes off at the snap">TIMEOUT (${o.timeoutsLeft})</button>
      <button class="pc-btn pc-cancel" data-act="cancel">CANCEL</button>
      <button class="pc-btn pc-team${o.kickLabel || o.canPunt ? ' pc-hide' : ''}" data-act="team"${o.onTeam ? '' : ' disabled'} title="Your roster and players">TEAM</button>
    </div>
  `;
  document.body.appendChild(root);
  const fieldPanel = root.querySelector<HTMLDivElement>('.pc-field')!;
  const field = root.querySelector<HTMLDivElement>('.pc-field-svg')!;
  const audibleBtn = root.querySelector<HTMLButtonElement>('.pc-audible')!;
  const timeoutBtn = root.querySelector<HTMLButtonElement>('.pc-timeout')!;
  timeoutBtn.disabled = !o.canTimeout;

  /** Draws a play into a box, fitting the box's shape (see BIG / MINI). */
  const drawInto = (el: HTMLElement, play: PlayDef, win: DiagramWindow, detailed: boolean, extra: { hot?: boolean[]; tappable?: boolean } = {}) => {
    const r = el.getBoundingClientRect();
    const aspect = r.height > 0 ? r.width / r.height : 1.8;
    const w = win.w ?? win.h * aspect;
    // Near their goal line, slide the window back so it ends just past the back of the end zone.
    const x0 = Math.min(match.ballX - win.behind, TOTAL_LENGTH + 2 - w);
    el.innerHTML = playDiagramSvg(play, match.ballX, match.firstDownX, {
      x0,
      y0: win.y0,
      w,
      h: win.h,
      detailed,
      ...(detailed && o.names ? { names: o.names } : {}),
      ...(detailed && o.matchups ? { defense: o.matchups } : {}),
      ...(detailed && o.defenseRead ? { call: o.defenseRead.call } : {}),
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
    routes[k] = nextRoute(routes[k], k);
    drawBig();
  });
  root.querySelector('.pc-btns')!.addEventListener('click', (e) => {
    const act = (e.target as HTMLElement).closest<HTMLButtonElement>('.pc-btn')?.dataset.act;
    if (act === 'go') finish(() => o.onExecute(selected, calledPlay()));
    if (act === 'kick') finish(o.onKick);
    if (act === 'punt') finish(o.onPunt);
    if (act === 'audible') setAudible(!audible);
    if (act === 'timeout' && !timeoutBtn.disabled) {
      timeoutBtn.textContent = `TIMEOUT (${o.onTimeout()})`;
      timeoutBtn.disabled = true; // the clock is stopped now
      timeoutBtn.classList.add('used');
    }
    if (act === 'cancel') finish(o.onCancel);
    if (act === 'team') o.onTeam?.();
  });
  // SIM menu: a small box over the screen; Esc / CANCEL closes it.
  const simMenu = root.querySelector<HTMLDivElement>('.pc-sim-menu');
  const showSim = (on: boolean) => {
    if (simMenu) simMenu.hidden = !on;
  };
  root.querySelector('.pc-sim')?.addEventListener('click', () => showSim(true));
  simMenu?.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const id = t.closest<HTMLButtonElement>('[data-sim]')?.dataset.sim;
    if (id) finish(() => o.sim?.onSim(id));
    else if (t.closest('.pc-sim-cancel') || t === simMenu) showSim(false);
  });
  const onKey = (e: KeyboardEvent) => {
    if (simMenu && !simMenu.hidden) {
      if (e.key === 'Escape') showSim(false);
      return;
    }
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
