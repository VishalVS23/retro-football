/**
 * CPU drive summary (Stage 2 step 6): a short panel after each simulated opponent drive.
 * "CPU BALL · OPP 25 / 8 PLAYS · 61 YDS · 0:48 / FIELD GOAL (37 YD) / YOU 7 - 3 CPU", a mini field
 * strip, and CONTINUE. The scene decides when it closes (CONTINUE, or on its own after a moment).
 */
import '@fontsource/press-start-2p/latin-400.css';
import './driveSummary.css';
import { HOLD_YARDS, OWN_GOAL_X, spotText } from '../sim/drive';
import { END_ZONE_DEPTH, TOTAL_LENGTH } from '../sim/field';
import type { OppDrive } from '../sim/oppDrive';

export interface DriveSummaryOptions {
  drive: OppDrive;
  /** Score after the drive. */
  us: number;
  them: number;
  /** The drive ran out the clock in Q4 (END OF GAME instead of END OF HALF). */
  lastQuarter: boolean;
  onContinue: () => void;
}

let root: HTMLDivElement | null = null;

export function closeDriveSummary() {
  root?.remove();
  root = null;
  continueFn = null;
  window.removeEventListener('keydown', onKey);
}

function clock(seconds: number) {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** The big result line and whether it's good or bad news for us. */
function resultLine(d: OppDrive, lastQuarter: boolean): { text: string; tone: '' | 'good' | 'bad' } {
  switch (d.result) {
    case 'touchdown':
      return { text: 'TOUCHDOWN', tone: 'bad' };
    case 'fieldGoal':
      // Their kick: from their line of scrimmage to our goal, plus the hold and the end zone.
      return { text: `FIELD GOAL (${Math.round(d.endX - OWN_GOAL_X + HOLD_YARDS + END_ZONE_DEPTH)} YD)`, tone: 'bad' };
    case 'missedFieldGoal':
      return { text: 'MISSED FG!', tone: 'good' };
    case 'punt':
      return { text: 'PUNT', tone: '' };
    case 'interception':
      return { text: 'INTERCEPTED!', tone: 'good' };
    case 'fumble':
      return { text: 'FUMBLE! RECOVERED', tone: 'good' };
    case 'downs':
      return { text: 'TURNOVER ON DOWNS', tone: 'good' };
    case 'endOfHalf':
      if (d.note === 'kneel' && lastQuarter) return { text: 'RAN OUT THE CLOCK', tone: 'bad' };
      return { text: lastQuarter ? 'END OF GAME' : 'END OF HALF', tone: '' };
  }
}

export function openDriveSummary(o: DriveSummaryOptions) {
  closeDriveSummary();
  const d = o.drive;
  const res = resultLine(d, o.lastQuarter);
  const lines: string[] = [];
  if (d.result === 'touchdown') lines.push(d.extraPointGood ? 'XP GOOD' : 'XP NO GOOD');
  if (d.result !== 'endOfHalf') lines.push(`YOUR BALL · ${spotText(d.ourStartX)}`);
  const pct = (x: number) => `${(x / TOTAL_LENGTH) * 100}%`;
  const lo = Math.min(d.startX, d.endX);
  const hi = Math.max(d.startX, d.endX);
  const notes = [
    d.note ? { hurryUp: 'HURRY-UP OFFENSE', runClock: 'RUNNING DOWN THE CLOCK', kneel: 'TOOK A KNEE' }[d.note] : '',
    d.bigPlay ? `BIG PLAY: ${d.bigPlay.yards} YD ${d.bigPlay.kind === 'run' ? 'RUN' : 'PASS'}` : '',
  ].filter(Boolean);
  const big = notes.length ? `<div class="ds-big">${notes.join('<br>')}</div>` : '';

  const el = document.createElement('div');
  el.id = 'drive-summary';
  el.innerHTML = `
    <div class="ds-panel" role="dialog" aria-label="CPU drive summary">
      <div class="ds-head">CPU BALL · ${spotText(d.startX)}</div>
      <div class="ds-stats">${d.plays} PLAY${d.plays === 1 ? '' : 'S'} · ${d.yards} YDS · ${clock(d.seconds)}</div>
      ${big}
      <div class="ds-field">
        <div class="ds-ez left"></div><div class="ds-ez right"></div><div class="ds-mid"></div>
        <div class="ds-bar" style="left:${pct(lo)};width:${pct(hi - lo)}"></div>
        <div class="ds-start" style="left:${pct(d.startX)}"></div>
        <div class="ds-end" style="left:${pct(d.endX)}"></div>
      </div>
      <div class="ds-result ${res.tone}">${res.text}</div>
      <div class="ds-sub">${[...lines, `YOU ${o.us} - ${o.them} CPU`].join('<br>')}</div>
      <button class="ds-btn" type="button">CONTINUE ▸</button>
    </div>`;
  // Taps on the panel never reach the field underneath.
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  el.querySelector('button')!.addEventListener('click', () => o.onContinue());
  document.body.appendChild(el);
  root = el;
  window.addEventListener('keydown', onKey);
  continueFn = o.onContinue;
}

let continueFn: (() => void) | null = null;

/** Enter continues (laptop). */
function onKey(e: KeyboardEvent) {
  if (e.key !== 'Enter' || !root) return;
  e.preventDefault();
  continueFn?.();
}
