/**
 * TEAM screen (Stage 3c): a side rail (ROSTER / PRACTICE / BACK) and, on the right, the roster as
 * cards in depth-chart order, or one player's profile (tabs OVERVIEW / RATINGS / STATS). Look only.
 * Opened from the play calling or season screen; BACK (or Esc) returns to it. 4c: can open straight on
 * one player (any team's, from the league leaders); BACK then closes it.
 */
import '@fontsource/press-start-2p/latin-400.css';
import './teamScreen.css';
import { ATTRIBUTE_NAMES, MENTAL, PHYSICAL, TECHNICAL, type AttributeKey } from '../players/attributes';
import { ATTR_SHORT, band, keyAttributes, otherPositions, potentialText, stars, unitOf } from '../players/display';
import { PERSONALITY_TEXT } from '../players/personality';
import { currentAbility, fullName, playerPersonality, ratingWords, type Player } from '../players/player';
import { POSITION_NAMES } from '../players/positions';
import { TRAITS } from '../players/traits';
import type { RosterRow } from '../league/rosterView';
import { teamLogoHtml } from './teamLogo';
import { PROFILE_COLUMNS } from '../league/leaders';
import type { PlayerLine } from '../league/playerStats';

export interface TeamScreenOptions {
  team: { abbr: string; city: string; nickname: string; color: string };
  roster: RosterRow[];
  practice: RosterRow[];
  onClose: () => void;
  /** 4c: a player's stats for the STATS tab (missing = no tab). */
  statsFor?: (playerId: number) => PlayerStatsInfo;
  /** 4c: open on this player's profile (BACK then closes the screen). */
  startPlayerId?: number;
  /** Start on this tab of that profile. */
  startTab?: 'overview' | 'ratings' | 'stats';
}

export interface PlayerStatsInfo {
  year: number;
  /** This season's totals (null = no stats yet) and the games he has a line in. */
  season: PlayerLine | null;
  games: number;
  log: { week: number; opponent: string; home: boolean; line: PlayerLine | null }[];
  past: { year: number; line: PlayerLine }[];
}

type View = 'roster' | 'practice';
type Filter = 'all' | 'offense' | 'defense' | 'special';
type Tab = 'overview' | 'ratings' | 'stats';

let close: (() => void) | null = null;

export function closeTeamScreen() {
  close?.();
}

/** Text from our own data still goes through this before landing in HTML. */
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const STAR =
  '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M5 0.6l1.3 2.9 3.1.3-2.4 2.1.7 3.1L5 7.4 2.3 9l.7-3.1L.6 3.8l3.1-.3z"/></svg>';
function starsHtml(n: number, total = 5): string {
  let s = '';
  for (let i = 0; i < total; i++) s += `<span class="ts-star${i < n ? ' on' : ''}">${STAR}</span>`;
  return `<span class="ts-stars" role="img" aria-label="${n} of ${total} stars">${s}</span>`;
}

/** A segmented bar: `segments` blocks, filled in proportion to a 1-20 value, coloured by band. */
function barHtml(v: number, segments: number): string {
  const filled = Math.round((v / 20) * segments);
  let s = '';
  for (let i = 0; i < segments; i++) s += `<i${i < filled ? ' class="on"' : ''}></i>`;
  return `<span class="ts-bar b-${band(v)}">${s}</span>`;
}

function cardHtml(r: RosterRow): string {
  const attrs = r.card
    .map((a) => `<span class="ts-attr"><span class="ts-attr-l">${ATTR_SHORT[a.key]}</span>${barHtml(a.value, 10)}<span class="ts-attr-v v-${band(a.value)}">${a.value}</span></span>`)
    .join('');
  return `
    <button class="ts-card${r.starter ? ' starter' : ''}" type="button" data-id="${r.player.id}">
      <span class="ts-card-top">
        <span class="ts-pos pos-${r.position}">${r.slot}</span>
        <span class="ts-name">${esc(r.name)}</span>
        <span class="ts-age">${r.age}</span>
        ${starsHtml(r.stars)}
      </span>
      <span class="ts-card-attrs">${attrs}</span>
    </button>`;
}

function attrRow(p: Player, k: AttributeKey, big: boolean): string {
  const v = p.attributes[k];
  return `<div class="ts-arow${big ? ' big' : ''}"><span class="ts-aname">${ATTRIBUTE_NAMES[k]}</span>${big ? barHtml(v, 20) : ''}<span class="ts-aval v-${band(v)}">${v}</span></div>`;
}

/** The STATS tab (4c): this season, the game log and past seasons, in the columns that fit his position. */
function statsHtml(p: Player, info: PlayerStatsInfo): string {
  const cols = PROFILE_COLUMNS[p.position];
  if (!cols.length) return '<div class="ts-section"><div class="ts-text">NO STATS FOR LINEMEN YET: THEY GET GAME RATINGS LATER.</div></div>';
  const head = (first: string) => `<tr><th class="l">${first}</th>${cols.map((c) => `<th>${c.label}</th>`).join('')}</tr>`;
  const cells = (l: PlayerLine | null) => cols.map((c) => `<td>${l ? c.value(l) : '-'}</td>`).join('');
  const season = info.season
    ? `<table class="ts-stable">${head('GP')}<tr><td class="l">${info.games}</td>${cells(info.season)}</tr></table>`
    : '<div class="ts-text">NO STATS THIS SEASON YET.</div>';
  const log = info.log.length
    ? `<table class="ts-stable">${head('WEEK')}${info.log
        .map((g) => `<tr class="${g.line ? '' : 'dim'}"><td class="l">${g.week} ${g.home ? 'VS' : '@'} ${esc(g.opponent)}</td>${cells(g.line)}</tr>`)
        .join('')}</table>`
    : '<div class="ts-text">NO GAMES PLAYED YET.</div>';
  const past = info.past.length
    ? `<div class="ts-section"><div class="ts-h">PAST SEASONS</div><table class="ts-stable">${head('SEASON')}${info.past
        .map((h) => `<tr><td class="l">${h.year}</td>${cells(h.line)}</tr>`)
        .join('')}</table></div>`
    : '';
  return `
    <div class="ts-section"><div class="ts-h">SEASON ${info.year}</div>${season}</div>
    <div class="ts-section"><div class="ts-h">GAME LOG</div>${log}</div>
    ${past}`;
}

function profileHtml(r: RosterRow, tab: Tab, backLabel: string, stats?: PlayerStatsInfo): string {
  const p = r.player;
  const ca = currentAbility(p);
  const persona = playerPersonality(p);
  const keys = keyAttributes(p.position);
  const traits = p.traits.length ? p.traits.map((t) => `<li>${esc(TRAITS[t].label)}</li>`).join('') : '<li class="ts-none">None</li>';
  const others = otherPositions(p);
  const also = others.length
    ? others.map((o) => `<li><span class="ts-pos pos-${o.pos}">${o.pos}</span> ${o.level.toUpperCase()}</li>`).join('')
    : `<li class="ts-none">Only ${POSITION_NAMES[p.position].toLowerCase()}</li>`;
  const overview = `
    <div class="ts-section">
      <div class="ts-h">PERSONALITY</div>
      <div class="ts-persona">${esc(persona.toUpperCase())}</div>
      <div class="ts-text">${esc(PERSONALITY_TEXT[persona])}</div>
    </div>
    <div class="ts-cols">
      <div class="ts-section"><div class="ts-h">TRAITS</div><ul class="ts-list">${traits}</ul></div>
      <div class="ts-section"><div class="ts-h">CAN ALSO PLAY</div><ul class="ts-list">${also}</ul></div>
    </div>
    <div class="ts-section">
      <div class="ts-h">BEST RATINGS FOR A ${p.position}</div>
      ${keys
        .slice(0, 5)
        .map((k) => attrRow(p, k, true))
        .join('')}
    </div>`;
  const group = (title: string, list: readonly AttributeKey[]) => {
    const rest = list.filter((k) => !keys.includes(k));
    return rest.length ? `<div class="ts-section"><div class="ts-h">${title}</div>${rest.map((k) => attrRow(p, k, false)).join('')}</div>` : '';
  };
  const ratings = `
    <div class="ts-section">
      <div class="ts-h">KEY FOR A ${p.position}</div>
      ${keys.map((k) => attrRow(p, k, true)).join('')}
    </div>
    <div class="ts-sub-h">OTHER RATINGS</div>
    <div class="ts-cols three">
      ${group('TECHNICAL', TECHNICAL)}${group('MENTAL', MENTAL)}${group('PHYSICAL', PHYSICAL)}
    </div>`;
  return `
    <div class="ts-profile">
      <button class="ts-link" type="button" data-act="list">&lt; ${backLabel}</button>
      <div class="ts-phead">
        <div class="ts-pinfo">
          <div class="ts-pname">${esc(fullName(p).toUpperCase())}</div>
          <div class="ts-pmeta"><span class="ts-pos pos-${p.position}">${r.slot}</span> ${esc(POSITION_NAMES[p.position].toUpperCase())} · AGE ${p.age}</div>
          <div class="ts-plevel">${starsHtml(stars(ca))}<span>${ratingWords(ca).toUpperCase()}</span></div>
          <div class="ts-pot">POTENTIAL: ${potentialText(p).toUpperCase()} <span>(ROUGH GUESS, NO SCOUTS YET)</span></div>
        </div>
      </div>
      <div class="ts-tabs" role="tablist">
        <button type="button" role="tab" data-tab="overview" class="${tab === 'overview' ? 'on' : ''}">OVERVIEW</button>
        <button type="button" role="tab" data-tab="ratings" class="${tab === 'ratings' ? 'on' : ''}">RATINGS</button>
        ${stats ? `<button type="button" role="tab" data-tab="stats" class="${tab === 'stats' ? 'on' : ''}">STATS</button>` : ''}
      </div>
      <div class="ts-tabbody">${tab === 'stats' && stats ? statsHtml(p, stats) : tab === 'ratings' ? ratings : overview}</div>
    </div>`;
}

export function openTeamScreen(o: TeamScreenOptions) {
  closeTeamScreen();
  let view: View = 'roster';
  let filter: Filter = 'all';
  let tab: Tab = o.startTab ?? 'overview';
  let player: RosterRow | null = null;
  if (o.startPlayerId !== undefined) {
    player = o.roster.find((r) => r.player.id === o.startPlayerId) ?? null;
    if (!player) {
      player = o.practice.find((r) => r.player.id === o.startPlayerId) ?? null;
      if (player) view = 'practice';
    }
  }

  const el = document.createElement('div');
  el.id = 'team-screen';
  el.innerHTML = `
    <div class="ts-wrap" role="dialog" aria-label="Team">
      <nav class="ts-rail">
        <div class="ts-team">${teamLogoHtml(o.team.abbr, o.team.color, 44)}<span>${esc(o.team.abbr)}</span></div>
        <button type="button" class="ts-nav" data-view="roster">ROSTER</button>
        <button type="button" class="ts-nav" data-view="practice">PRACTICE</button>
        <button type="button" class="ts-back" data-act="close">&lt; BACK</button>
      </nav>
      <main class="ts-main"></main>
    </div>`;
  const main = el.querySelector<HTMLElement>('.ts-main')!;

  const rows = () => (view === 'roster' ? o.roster : o.practice);
  const render = () => {
    el.querySelectorAll<HTMLButtonElement>('.ts-nav').forEach((b) => b.classList.toggle('on', b.dataset.view === view && !player));
    if (player) {
      const backLabel = o.startPlayerId !== undefined ? 'BACK' : view === 'roster' ? 'ROSTER' : 'PRACTICE SQUAD';
      main.innerHTML = profileHtml(player, tab, backLabel, o.statsFor?.(player.player.id));
      main.scrollTop = 0;
      return;
    }
    const list = rows().filter((r) => view !== 'roster' || filter === 'all' || unitOf(r.position) === filter);
    const chip = (f: Filter, label: string) => `<button type="button" class="ts-chip${filter === f ? ' on' : ''}" data-filter="${f}">${label}</button>`;
    const title =
      view === 'roster'
        ? `${esc(o.team.city.toUpperCase())} ${esc(o.team.nickname.toUpperCase())} · ${o.roster.length} PLAYERS`
        : `PRACTICE SQUAD · ${o.practice.length} PLAYERS`;
    main.innerHTML = `
      <div class="ts-head">
        <div class="ts-title">${title}</div>
        ${view === 'roster' ? `<div class="ts-chips">${chip('all', 'ALL')}${chip('offense', 'OFF')}${chip('defense', 'DEF')}${chip('special', 'K/P')}</div>` : '<div class="ts-note">Young players learning the game. Not on the game-day roster.</div>'}
      </div>
      <div class="ts-cards">${list.map(cardHtml).join('')}</div>`;
  };
  const back = () => {
    if (player && o.startPlayerId === undefined) {
      player = null;
      render();
    } else {
      closeTeamScreen();
      o.onClose();
    }
  };

  el.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const nav = t.closest<HTMLElement>('[data-view]');
    if (nav) {
      view = nav.dataset.view as View;
      player = null;
      render();
      main.scrollTop = 0;
      return;
    }
    const f = t.closest<HTMLElement>('[data-filter]');
    if (f) {
      filter = f.dataset.filter as Filter;
      render();
      return;
    }
    const tb = t.closest<HTMLElement>('[data-tab]');
    if (tb) {
      tab = tb.dataset.tab as Tab;
      render();
      return;
    }
    const card = t.closest<HTMLElement>('.ts-card');
    if (card) {
      player = rows().find((r) => r.player.id === Number(card.dataset.id)) ?? null;
      tab = 'overview';
      render();
      return;
    }
    const act = t.closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'list') back();
    if (act === 'close') {
      player = null;
      back();
    }
  });
  // Taps never reach the play calling screen or the field underneath.
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  // Esc = back. No key reaches the game while this is open (capture phase, runs first).
  const onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement | null)?.closest?.('input, select, textarea')) return; // ⚙ panel
    e.stopImmediatePropagation();
    if (e.type === 'keydown' && (e.key === 'Escape' || e.key === 'Backspace')) {
      e.preventDefault();
      back();
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
