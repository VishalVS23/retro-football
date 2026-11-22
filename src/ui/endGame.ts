/**
 * End-of-game screen (Stage 2 step 7): WIN / LOSS / TIE, the final score, points by quarter, team
 * stats side by side, our QB's line and longest play, and PLAY AGAIN (or Enter).
 */
import '@fontsource/press-start-2p/latin-400.css';
import './endGame.css';
import { totalYards, type GameStats, type SideStats } from '../sim/gameStats';

export interface EndGameOptions {
  us: number;
  them: number;
  stats: GameStats;
  onPlayAgain: () => void;
}

let root: HTMLDivElement | null = null;
let againFn: (() => void) | null = null;

export function closeEndGame() {
  root?.remove();
  root = null;
  againFn = null;
  window.removeEventListener('keydown', onKey);
}

/** Q1..Q4, then OT, 2OT, 3OT... */
function periodName(i: number) {
  if (i < 4) return `Q${i + 1}`;
  return i === 4 ? 'OT' : `${i - 3}OT`;
}

export function openEndGame(o: EndGameOptions) {
  closeEndGame();
  const s = o.stats;
  const outcome = o.us > o.them ? { text: 'YOU WIN!', tone: 'good' } : o.us < o.them ? { text: 'YOU LOSE', tone: 'bad' } : { text: 'TIE GAME', tone: '' };
  const periods = Math.max(s.byQuarter.us.length, s.byQuarter.them.length, 4);
  const cells = (a: number[]) => Array.from({ length: periods }, (_, i) => `<td>${a[i] ?? 0}</td>`).join('');
  const quarters = `
    <table class="eg-quarters">
      <tr><th></th>${Array.from({ length: periods }, (_, i) => `<th>${periodName(i)}</th>`).join('')}<th>T</th></tr>
      <tr><th>YOU</th>${cells(s.byQuarter.us)}<td class="eg-total">${o.us}</td></tr>
      <tr><th>CPU</th>${cells(s.byQuarter.them)}<td class="eg-total">${o.them}</td></tr>
    </table>`;
  const row = (label: string, f: (x: SideStats) => number | string) => `<tr><td>${f(s.us)}</td><th>${label}</th><td>${f(s.them)}</td></tr>`;
  const team = `
    <table class="eg-team">
      <tr class="eg-head"><td>YOU</td><th></th><td>CPU</td></tr>
      ${row('TOTAL YDS', totalYards)}
      ${row('PASSING', (x) => x.passYards)}
      ${row('RUSHING', (x) => x.rushYards)}
      ${row('1ST DOWNS', (x) => x.firstDowns)}
      ${row('TURNOVERS', (x) => x.turnovers)}
      ${row('SACKED', (x) => x.sacked)}
      ${row('PLAYS', (x) => x.plays)}
    </table>`;
  const q = s.qb;
  const qbLine = `${q.completions}/${q.attempts} · ${q.yards} YDS · ${q.touchdowns} TD · ${q.interceptions} INT`;

  const el = document.createElement('div');
  el.id = 'end-game';
  el.innerHTML = `
    <div class="eg-panel" role="dialog" aria-label="Final score and stats">
      <div class="eg-left">
        <div class="eg-head-line">FINAL${periods > 4 ? ` / ${periodName(periods - 1)}` : ''}</div>
        <div class="eg-result ${outcome.tone}">${outcome.text}</div>
        <div class="eg-score">YOU ${o.us} - ${o.them} CPU</div>
        ${quarters}
        <div class="eg-qb"><span>YOUR QB</span>${qbLine}</div>
        <div class="eg-qb"><span>LONGEST PLAY</span>${s.longest} YDS</div>
      </div>
      <div class="eg-right">
        ${team}
        <button class="eg-btn" type="button">PLAY AGAIN &gt;</button>
      </div>
    </div>`;
  // Taps on the panel never reach the field underneath.
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  el.querySelector('button')!.addEventListener('click', () => o.onPlayAgain());
  document.body.appendChild(el);
  root = el;
  againFn = o.onPlayAgain;
  window.addEventListener('keydown', onKey);
}

/** Enter = play again (laptop). */
function onKey(e: KeyboardEvent) {
  if (e.key !== 'Enter' || !root) return;
  e.preventDefault();
  againFn?.();
}
