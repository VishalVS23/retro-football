/**
 * BOX SCORE screen (Stage 4b): one game's score by period, both teams' stats side by side, then one
 * team's player tables (PASSING, RUSHING, RECEIVING, DEFENSE, KICKING): tap AWAY / HOME to switch.
 * Opens on top of the season screen; BACK (or Esc) closes it.
 */
import '@fontsource/press-start-2p/latin-400.css';
import './boxScoreScreen.css';
import type { BoxScore, TeamBox } from '../league/boxScore';
import type { PlayerLine } from '../league/playerStats';
import { totalYards } from '../sim/gameStats';
import { teamLogoHtml } from './teamLogo';
import { ratingBand, ratingText } from '../league/gameRatings';
import { statSummary } from '../league/leaders';

export interface BoxTeamInfo {
  abbr: string;
  color: string;
}

export interface BoxScoreOptions {
  box: BoxScore;
  /** null = an exhibition game (no week). */
  week: number | null;
  ot: number;
  /** [home, away]. */
  teams: [BoxTeamInfo, BoxTeamInfo];
  /** "J. SMITH" and the position, for a player id. */
  player: (id: number) => { name: string; pos: string };
  /** Start on this side's players (0 = home, 1 = away). */
  side?: 0 | 1;
  onClose: () => void;
}

let close: (() => void) | null = null;

export function closeBoxScore() {
  close?.();
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const period = (i: number) => (i < 4 ? `Q${i + 1}` : i === 4 ? 'OT' : `${i - 3}OT`);
const n = (v: number | undefined) => v ?? 0;
const avg = (a: number, b: number) => (b ? (a / b).toFixed(1) : '-');

type Row = [id: number, line: PlayerLine];

function table(title: string, head: string[], rows: string[][]): string {
  if (!rows.length) return '';
  return `
    <div class="bx-h">${title}</div>
    <table class="bx-table">
      <tr>${head.map((h, i) => `<th class="${i === 0 ? 'l' : ''}">${h}</th>`).join('')}</tr>
      ${rows.map((r) => `<tr>${r.map((c, i) => `<td class="${i === 0 ? 'l' : ''}">${c}</td>`).join('')}</tr>`).join('')}
    </table>`;
}

function playerTables(t: TeamBox, o: BoxScoreOptions): string {
  const rows: Row[] = Object.entries(t.lines).map(([id, l]) => [Number(id), l]);
  if (!rows.length) return '<div class="bx-note">NO PLAYER STATS FOR THIS GAME (PLAYED BEFORE STATS WERE KEPT).</div>';
  const who = (id: number) => {
    const p = o.player(id);
    return `<span class="bx-pos">${esc(p.pos)}</span>${esc(p.name)}`;
  };
  const by = (k: keyof PlayerLine, filter: (l: PlayerLine) => boolean) =>
    rows.filter(([, l]) => filter(l)).sort((a, b) => n(b[1][k]) - n(a[1][k]));
  const passing = by('py', (l) => n(l.pa) > 0).map(([id, l]) => [who(id), `${n(l.pc)}/${n(l.pa)}`, `${n(l.py)}`, `${n(l.ptd)}`, `${n(l.pint)}`, `${n(l.sk)}`]);
  const rushing = by('ry', (l) => n(l.ra) > 0).map(([id, l]) => [who(id), `${n(l.ra)}`, `${n(l.ry)}`, avg(n(l.ry), n(l.ra)), `${n(l.rtd)}`, `${n(l.rl)}`]);
  const receiving = by('rcy', (l) => n(l.tg) > 0).map(([id, l]) => [who(id), `${n(l.rec)}`, `${n(l.tg)}`, `${n(l.rcy)}`, `${n(l.rctd)}`, `${n(l.rcl)}`]);
  const defense = rows
    .filter(([, l]) => n(l.tk) + n(l.sck) + n(l.dint) + n(l.pd) + n(l.ff) > 0)
    .sort((a, b) => n(b[1].tk) - n(a[1].tk) || n(b[1].sck) - n(a[1].sck))
    .map(([id, l]) => [who(id), `${n(l.tk)}`, `${n(l.sck)}`, `${n(l.dint)}`, `${n(l.pd)}`, `${n(l.ff)}`]);
  const kicking = by('fgm', (l) => n(l.fga) + n(l.xpa) > 0).map(([id, l]) => [who(id), `${n(l.fgm)}/${n(l.fga)}`, l.fgl ? `${l.fgl}` : '-', `${n(l.xpm)}/${n(l.xpa)}`]);
  const punting = by('pu', (l) => n(l.pu) > 0).map(([id, l]) => [who(id), `${n(l.pu)}`, `${n(l.puy)}`, avg(n(l.puy), n(l.pu))]);
  return (
    table('PASSING', ['', 'C/ATT', 'YDS', 'TD', 'INT', 'SK'], passing) +
    table('RUSHING', ['', 'CAR', 'YDS', 'AVG', 'TD', 'LNG'], rushing) +
    table('RECEIVING', ['', 'REC', 'TGT', 'YDS', 'TD', 'LNG'], receiving) +
    table('DEFENSE', ['', 'TK', 'SCK', 'INT', 'PD', 'FF'], defense) +
    table('KICKING', ['', 'FG', 'LNG', 'XP'], kicking) +
    table('PUNTING', ['', 'NO', 'NET', 'AVG'], punting)
  );
}

/** 4d: every rated player of one team, best first, with a colour pill and a few of his stats. */
function ratingsTable(t: TeamBox, o: BoxScoreOptions, unit: 'all' | 'offense' | 'defense'): string {
  const r = t.ratings;
  if (!r || !Object.keys(r).length) return '<div class="bx-note">NO RATINGS FOR THIS GAME (PLAYED BEFORE RATINGS WERE KEPT).</div>';
  const rows = Object.entries(r)
    .map(([id, v]) => ({ id: Number(id), v, p: o.player(Number(id)) }))
    .filter((x) => unit === 'all' || (POS_UNIT[x.p.pos] ?? 'special') === unit)
    .sort((a, b) => b.v - a.v || a.id - b.id)
    .map((x) => [
      `<span class="bx-pos">${esc(x.p.pos)}</span>${esc(x.p.name)}`,
      `<span class="bx-stat">${esc(statSummary(t.lines[x.id] ?? {}).replace('A STRONG GAME UP FRONT', ''))}</span>`,
      `<span class="bx-rtg ${ratingBand(x.v / 10)}">${ratingText(x.v)}</span>`,
    ]);
  return table('GAME RATINGS', ['', '', 'RTG'], rows);
}

const POS_UNIT: Record<string, 'offense' | 'defense' | 'special'> = { QB: 'offense', RB: 'offense', WR: 'offense', TE: 'offense', OL: 'offense', DL: 'defense', LB: 'defense', CB: 'defense', S: 'defense', K: 'special', P: 'special' };

export function openBoxScore(o: BoxScoreOptions) {
  closeBoxScore();
  let side: 0 | 1 = o.side ?? 1;
  let mode: 'stats' | 'ratings' = 'stats';
  let unit: 'all' | 'offense' | 'defense' = 'all';
  const [home, away] = o.box.teams;
  const [hi, ai] = o.teams;
  const hs = home.byPeriod.reduce((a, b) => a + b, 0);
  const as = away.byPeriod.reduce((a, b) => a + b, 0);
  const periods = Math.max(4, home.byPeriod.length, away.byPeriod.length);
  const cells = (a: number[]) => Array.from({ length: periods }, (_, i) => `<td>${a[i] ?? 0}</td>`).join('');
  const quarters = `
    <table class="bx-quarters">
      <tr><th></th>${Array.from({ length: periods }, (_, i) => `<th>${period(i)}</th>`).join('')}<th>T</th></tr>
      <tr><th>${esc(ai.abbr)}</th>${cells(away.byPeriod)}<td class="bx-total">${as}</td></tr>
      <tr><th>${esc(hi.abbr)}</th>${cells(home.byPeriod)}<td class="bx-total">${hs}</td></tr>
    </table>`;
  const row = (label: string, f: (t: TeamBox) => number) => `<tr><td>${f(away)}</td><th>${label}</th><td>${f(home)}</td></tr>`;
  const teamStats = `
    <table class="bx-team">
      <tr class="bx-head"><td>${esc(ai.abbr)}</td><th></th><td>${esc(hi.abbr)}</td></tr>
      ${row('TOTAL YDS', (t) => totalYards(t.stats))}
      ${row('PASSING', (t) => t.stats.passYards)}
      ${row('RUSHING', (t) => t.stats.rushYards)}
      ${row('1ST DOWNS', (t) => t.stats.firstDowns)}
      ${row('TURNOVERS', (t) => t.stats.turnovers)}
      ${row('SACKED', (t) => t.stats.sacked)}
      ${row('PLAYS', (t) => t.stats.plays)}
    </table>`;

  const el = document.createElement('div');
  el.id = 'box-score';
  el.innerHTML = `
    <div class="bx-wrap" role="dialog" aria-label="Box score">
      <div class="bx-top">
        <button type="button" class="bx-back" data-act="close">&lt; BACK</button>
        <div class="bx-title">${o.week !== null ? `WEEK ${o.week} · ` : ''}FINAL${o.ot ? ` / ${o.ot > 1 ? `${o.ot}OT` : 'OT'}` : ''}</div>
      </div>
      <div class="bx-body">
        <div class="bx-score">${teamLogoHtml(ai.abbr, ai.color, 28)}<span>${esc(ai.abbr)} ${as} @ ${hs} ${esc(hi.abbr)}</span>${teamLogoHtml(hi.abbr, hi.color, 28)}</div>
        <div class="bx-cols">${quarters}${teamStats}</div>
        <div class="bx-chips">
          <button type="button" class="bx-chip" data-side="1">${esc(ai.abbr)} PLAYERS</button>
          <button type="button" class="bx-chip" data-side="0">${esc(hi.abbr)} PLAYERS</button>
        </div>
        <div class="bx-modes"></div>
        <div class="bx-players"></div>
      </div>
    </div>`;
  const players = el.querySelector<HTMLElement>('.bx-players')!;
  const render = () => {
    el.querySelectorAll<HTMLElement>('.bx-chip').forEach((c) => c.classList.toggle('on', Number(c.dataset.side) === side));
    const chip = (attr: string, v: string, label: string, on: boolean) => `<button type="button" class="bx-chip small${on ? ' on' : ''}" ${attr}="${v}">${label}</button>`;
    el.querySelector<HTMLElement>('.bx-modes')!.innerHTML =
      chip('data-mode', 'stats', 'STATS', mode === 'stats') +
      chip('data-mode', 'ratings', 'RATINGS', mode === 'ratings') +
      (mode === 'ratings' ? `<span class="bx-gap"></span>${chip('data-unit', 'all', 'ALL', unit === 'all')}${chip('data-unit', 'offense', 'OFF', unit === 'offense')}${chip('data-unit', 'defense', 'DEF', unit === 'defense')}` : '');
    players.innerHTML = mode === 'ratings' ? ratingsTable(o.box.teams[side], o, unit) : playerTables(o.box.teams[side], o);
  };
  const done = () => {
    closeBoxScore();
    o.onClose();
  };
  el.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const m = t.closest<HTMLElement>('[data-mode]');
    if (m) {
      mode = m.dataset.mode as 'stats' | 'ratings';
      render();
      return;
    }
    const u = t.closest<HTMLElement>('[data-unit]');
    if (u) {
      unit = u.dataset.unit as 'all' | 'offense' | 'defense';
      render();
      return;
    }
    const chip = t.closest<HTMLElement>('[data-side]');
    if (chip) {
      side = Number(chip.dataset.side) as 0 | 1;
      render();
      return;
    }
    if (t.closest('[data-act="close"]')) done();
  });
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  const onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement | null)?.closest?.('input, select, textarea')) return;
    e.stopImmediatePropagation();
    if (e.type === 'keydown' && (e.key === 'Escape' || e.key === 'Backspace')) {
      e.preventDefault();
      done();
    }
  };
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKey, true);
  document.body.appendChild(el);
  render();
  close = () => {
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('keyup', onKey, true);
    el.remove();
    close = null;
  };
}
