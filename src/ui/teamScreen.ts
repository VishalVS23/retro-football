/**
 * TEAM screen (Stage 3c): a side rail (ROSTER / PRACTICE / BACK) and, on the right, the roster as
 * cards in depth-chart order, or one player's profile (tabs OVERVIEW / RATINGS). Look only.
 * Opened from the play calling screen; BACK (or Esc) returns to it.
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

export interface TeamScreenOptions {
  team: { abbr: string; city: string; nickname: string; color: string };
  roster: RosterRow[];
  practice: RosterRow[];
  onClose: () => void;
}

type View = 'roster' | 'practice';
type Filter = 'all' | 'offense' | 'defense' | 'special';
type Tab = 'overview' | 'ratings';

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

function profileHtml(r: RosterRow, tab: Tab, backLabel: string): string {
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
      </div>
      <div class="ts-tabbody">${tab === 'overview' ? overview : ratings}</div>
    </div>`;
}

export function openTeamScreen(o: TeamScreenOptions) {
  closeTeamScreen();
  let view: View = 'roster';
  let filter: Filter = 'all';
  let tab: Tab = 'overview';
  let player: RosterRow | null = null;

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
      main.innerHTML = profileHtml(player, tab, view === 'roster' ? 'ROSTER' : 'PRACTICE SQUAD');
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
    if (player) {
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
