/**
 * End-of-game screen (Stage 2 step 7): WIN / LOSS / TIE, the final score, points by quarter, team
 * stats side by side, our QB's line and longest play, and PLAY AGAIN (or Enter).
 */
import { ratingBand } from '../league/gameRatings';
import '@fontsource/press-start-2p/latin-400.css';
import './endGame.css';
import { totalYards, type GameStats, type SideStats } from '../sim/gameStats';
import { teamLogoHtml } from './teamLogo';

export interface EndGameOptions {
  us: number;
  them: number;
  stats: GameStats;
  /** Team abbreviations (default YOU / CPU). */
  ourAbbr?: string;
  theirAbbr?: string;
  /** Team colours, for the logo / colour dot next to the score (no logos when missing). */
  ourColor?: string;
  theirColor?: string;
  onPlayAgain: () => void;
  /** The button's text (default PLAY AGAIN; a season game says CONTINUE). */
  buttonLabel?: string;
  /** 4a: shown before FINAL, e.g. WEEK 3. */
  header?: string;
  /** 4b-2: BOX SCORE button (every player's line); missing = no button. */
  onBoxScore?: () => void;
  /** 4d: the game's best-rated player (both teams). */
  potg?: { name: string; pos: string; abbr: string; rating: string; line: string };
  /** 4d: each team's average rating on offense and defense ("6.8"). */
  ratings?: { us: { off: string; def: string }; them: { off: string; def: string } };
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
  const us = o.ourAbbr ?? 'YOU';
  const them = o.theirAbbr ?? 'CPU';
  const outcome = o.us > o.them ? { text: 'YOU WIN!', tone: 'good' } : o.us < o.them ? { text: 'YOU LOSE', tone: 'bad' } : { text: 'TIE GAME', tone: '' };
  const periods = Math.max(s.byQuarter.us.length, s.byQuarter.them.length, 4);
  const cells = (a: number[]) => Array.from({ length: periods }, (_, i) => `<td>${a[i] ?? 0}</td>`).join('');
  const quarters = `
    <table class="eg-quarters">
      <tr><th></th>${Array.from({ length: periods }, (_, i) => `<th>${periodName(i)}</th>`).join('')}<th>T</th></tr>
      <tr><th>${us}</th>${cells(s.byQuarter.us)}<td class="eg-total">${o.us}</td></tr>
      <tr><th>${them}</th>${cells(s.byQuarter.them)}<td class="eg-total">${o.them}</td></tr>
    </table>`;
  const row = (label: string, f: (x: SideStats) => number | string) => `<tr><td>${f(s.us)}</td><th>${label}</th><td>${f(s.them)}</td></tr>`;
  const team = `
    <table class="eg-team">
      <tr class="eg-head"><td>${us}</td><th></th><td>${them}</td></tr>
      ${row('TOTAL YDS', totalYards)}
      ${row('PASSING', (x) => x.passYards)}
      ${row('RUSHING', (x) => x.rushYards)}
      ${row('1ST DOWNS', (x) => x.firstDowns)}
      ${row('TURNOVERS', (x) => x.turnovers)}
      ${row('SACKED', (x) => x.sacked)}
      ${row('PLAYS', (x) => x.plays)}
      ${o.ratings ? `<tr><td>${o.ratings.us.off}</td><th>OFF RATING</th><td>${o.ratings.them.off}</td></tr><tr><td>${o.ratings.us.def}</td><th>DEF RATING</th><td>${o.ratings.them.def}</td></tr>` : ''}
    </table>`;
  const q = s.qb;
  const qbLine = `${q.completions}/${q.attempts} · ${q.yards} YDS · ${q.touchdowns} TD · ${q.interceptions} INT`;

  const el = document.createElement('div');
  el.id = 'end-game';
  el.innerHTML = `
    <div class="eg-panel" role="dialog" aria-label="Final score and stats">
      <div class="eg-left">
        <div class="eg-head-line">${o.header ? `${o.header} · ` : ''}FINAL${periods > 4 ? ` / ${periodName(periods - 1)}` : ''}</div>
        <div class="eg-result ${outcome.tone}">${outcome.text}</div>
        <div class="eg-score">${o.ourColor ? teamLogoHtml(us, o.ourColor, 26) : ''}<span>${us} ${o.us} - ${o.them} ${them}</span>${o.theirColor ? teamLogoHtml(them, o.theirColor, 26) : ''}</div>
        ${quarters}
        <div class="eg-qb"><span>YOUR QB</span>${qbLine}</div>
        ${
          o.potg
            ? `<div class="eg-qb eg-potg"><span>PLAYER OF THE GAME</span><b class="eg-rtg ${ratingBand(Number(o.potg.rating))}">${o.potg.rating}</b> ${o.potg.abbr} ${o.potg.pos} ${o.potg.name}<br>${o.potg.line}</div>`
            : `<div class="eg-qb"><span>LONGEST PLAY</span>${s.longest} YDS</div>`
        }
      </div>
      <div class="eg-right">
        ${team}
        <div class="eg-btns">
          ${o.onBoxScore ? '<button class="eg-btn eg-box" type="button">BOX SCORE</button>' : ''}
          <button class="eg-btn eg-go" type="button">${o.buttonLabel ?? 'PLAY AGAIN'} &gt;</button>
        </div>
      </div>
    </div>`;
  // Taps on the panel never reach the field underneath.
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  el.querySelector('.eg-go')!.addEventListener('click', () => o.onPlayAgain());
  el.querySelector('.eg-box')?.addEventListener('click', () => o.onBoxScore?.());
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
