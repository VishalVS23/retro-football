/**
 * SEASON screen (Stage 4a): the season's home. A side rail (SEASON / STANDINGS / SCHEDULE / TEAM)
 * and, on the right: this week's game (PLAY GAME / SIM GAME, or SIM WEEK on a bye) with last week's
 * scores; the division tables; or the user's 18 weeks (tap one for every score that week).
 * Look only: the game scene does the work through the callbacks.
 */
import '@fontsource/press-start-2p/latin-400.css';
import './seasonScreen.css';
import {
  SEASON_WEEKS,
  divisionStandings,
  gamesInWeek,
  isOver,
  recordText,
  standingRows,
  teamGame,
  type Season,
  type SeasonGame,
  type StandingRow,
} from '../league/season';
import { teamLogoHtml } from './teamLogo';

export interface SeasonTeamInfo {
  abbr: string;
  city: string;
  nickname: string;
  color: string;
  conference: number;
  division: number;
  /** 1-5 by league rank. */
  stars: number;
}

export interface SeasonScreenOptions {
  season: Season;
  teams: SeasonTeamInfo[];
  conferences: readonly string[];
  divisions: readonly (readonly string[])[];
  userTeamId: number;
  /** Show this week's scores under the week card (the week just finished). */
  resultsWeek?: number;
  onPlay: () => void;
  onSim: () => void;
  /** Bye week: sim everyone else's games. */
  onSimWeek: () => void;
  onNextSeason: () => void;
  onTeam: () => void;
}

type View = 'season' | 'standings' | 'schedule';

let close: (() => void) | null = null;
let setBusy: ((busy: boolean) => void) | null = null;

export function closeSeasonScreen() {
  close?.();
}

/** Greys out the buttons while a week is being simmed. */
export function seasonScreenBusy(busy: boolean) {
  setBusy?.(busy);
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const starText = (n: number) => '*'.repeat(n) + '-'.repeat(5 - n);
const pctText = (p: number) => (p >= 1 ? '1.000' : p.toFixed(3).replace(/^0/, ''));

export function openSeasonScreen(o: SeasonScreenOptions) {
  closeSeasonScreen();
  let view: View = 'season';
  let conf = o.teams[o.userTeamId].conference;
  let weekDetail: number | null = null;
  let busy = false;
  const s = o.season;
  const rows = standingRows(s, o.teams);
  const me = o.userTeamId;
  const t = (id: number) => o.teams[id];
  const logo = (id: number, size: number) => teamLogoHtml(t(id).abbr, t(id).color, size);
  const rec = (id: number) => recordText(rows[id]);

  /** One score line: AWY 17 @ HOM 24 (OT), ours highlighted, winner bright. */
  const scoreLine = (g: SeasonGame) => {
    const mine = g.home === me || g.away === me;
    const [hs, as] = g.score ?? [0, 0];
    const side = (id: number, pts: number, won: boolean) =>
      `<span class="ss-side${won ? ' won' : ''}">${logo(id, 16)}<span class="ss-abbr">${esc(t(id).abbr)}</span><b>${g.score ? pts : ''}</b></span>`;
    return `<div class="ss-score${mine ? ' mine' : ''}">${side(g.away, as, as > hs)}<span class="ss-at">@</span>${side(g.home, hs, hs > as)}${g.ot ? `<span class="ss-ot">${g.ot > 1 ? `${g.ot}OT` : 'OT'}</span>` : ''}</div>`;
  };

  const weekScores = (week: number, title: string) => {
    const games = gamesInWeek(s, week);
    const byes = o.teams.map((_, id) => id).filter((id) => !games.some((g) => g.home === id || g.away === id));
    return `
      <div class="ss-h">${title}</div>
      <div class="ss-scores">${games.map(scoreLine).join('')}</div>
      ${byes.length ? `<div class="ss-note">BYE: ${byes.map((id) => esc(t(id).abbr)).join(' · ')}</div>` : ''}`;
  };

  const seasonView = () => {
    const over = isOver(s);
    let card: string;
    if (over) {
      const r = rows[me];
      const div = divisionStandings(s, o.teams, t(me).conference, t(me).division, rows);
      const place = div.findIndex((x) => x.teamId === me) + 1;
      card = `
        <div class="ss-card">
          <div class="ss-card-title">REGULAR SEASON OVER</div>
          <div class="ss-big">${logo(me, 40)}<span>${esc(t(me).abbr)} ${recordText(r)}</span></div>
          <div class="ss-note">${['1ST', '2ND', '3RD', '4TH'][place - 1]} IN THE ${esc(o.divisions[t(me).conference][t(me).division].toUpperCase())} · PLAYOFFS COME LATER (4E)</div>
          <div class="ss-btns"><button type="button" class="ss-btn go" data-act="next">START NEXT SEASON &gt;</button></div>
        </div>`;
    } else {
      const g = teamGame(s, me);
      if (!g) {
        card = `
          <div class="ss-card">
            <div class="ss-card-title">WEEK ${s.week} OF ${SEASON_WEEKS}</div>
            <div class="ss-big">${logo(me, 40)}<span>BYE WEEK</span></div>
            <div class="ss-note">${esc(t(me).abbr)} ${rec(me)} · A WEEK OFF. THE REST OF THE LEAGUE PLAYS.</div>
            <div class="ss-btns"><button type="button" class="ss-btn go" data-act="simweek">SIM WEEK &gt;</button></div>
          </div>`;
      } else if (g.score) {
        // Our game is done (e.g. the app closed before the rest of the week was simmed).
        const home = g.home === me;
        const [mine, theirs] = home ? g.score : [g.score[1], g.score[0]];
        card = `
          <div class="ss-card">
            <div class="ss-card-title">WEEK ${s.week} OF ${SEASON_WEEKS}</div>
            <div class="ss-big">${logo(me, 40)}<span>${mine > theirs ? 'WON' : mine < theirs ? 'LOST' : 'TIED'} ${mine}-${theirs}</span>${logo(home ? g.away : g.home, 40)}</div>
            <div class="ss-note">THE REST OF THE LEAGUE STILL HAS TO PLAY THIS WEEK.</div>
            <div class="ss-btns"><button type="button" class="ss-btn go" data-act="simweek">FINISH THE WEEK &gt;</button></div>
          </div>`;
      } else {
        const home = g.home === me;
        const opp = home ? g.away : g.home;
        const team = (id: number) => `
          <div class="ss-team">
            ${logo(id, 44)}
            <div class="ss-tname">${esc(t(id).abbr)}</div>
            <div class="ss-trec">${rec(id)}</div>
            <div class="ss-tstars">${starText(t(id).stars)}</div>
          </div>`;
        card = `
          <div class="ss-card">
            <div class="ss-card-title">WEEK ${s.week} OF ${SEASON_WEEKS} · ${home ? 'HOME' : 'AWAY'}</div>
            <div class="ss-match">${team(me)}<div class="ss-vs">${home ? 'VS' : 'AT'}</div>${team(opp)}</div>
            <div class="ss-note">${esc(t(opp).city.toUpperCase())} ${esc(t(opp).nickname.toUpperCase())}</div>
            <div class="ss-btns">
              <button type="button" class="ss-btn go" data-act="play">PLAY GAME &gt;</button>
              <button type="button" class="ss-btn sim" data-act="sim">SIM GAME</button>
            </div>
          </div>`;
      }
    }
    const results = o.resultsWeek ? weekScores(o.resultsWeek, `WEEK ${o.resultsWeek} RESULTS`) : '';
    return `<div class="ss-title">SEASON ${s.year}</div>${card}${results}`;
  };

  const table = (c: number, d: number) => {
    const list: StandingRow[] = divisionStandings(s, o.teams, c, d, rows);
    return `
      <div class="ss-div">
        <div class="ss-h">${esc(o.divisions[c][d].toUpperCase())}</div>
        <table class="ss-table">
          <tr><th class="l">TEAM</th><th>W-L-T</th><th>PCT</th><th>PF</th><th>PA</th><th>DIV</th><th>STRK</th></tr>
          ${list
            .map(
              (r) => `<tr class="${r.teamId === me ? 'mine' : ''}">
                <td class="l">${logo(r.teamId, 16)}<span>${esc(t(r.teamId).abbr)}</span></td>
                <td>${r.w}-${r.l}-${r.t}</td><td>${pctText(r.pct)}</td><td>${r.pf}</td><td>${r.pa}</td><td>${recordText(r.div)}</td><td>${r.streak}</td>
              </tr>`,
            )
            .join('')}
        </table>
      </div>`;
  };

  const standingsView = () => `
    <div class="ss-head">
      <div class="ss-title">STANDINGS · AFTER WEEK ${Math.min(s.week - 1, SEASON_WEEKS)}</div>
      <div class="ss-chips">${o.conferences.map((name, c) => `<button type="button" class="ss-chip${conf === c ? ' on' : ''}" data-conf="${c}">${esc(name.split(' ')[0].toUpperCase())}</button>`).join('')}</div>
    </div>
    <div class="ss-divs">${[0, 1, 2, 3].map((d) => table(conf, d)).join('')}</div>`;

  const scheduleView = () => {
    if (weekDetail !== null) {
      return `<button class="ss-link" type="button" data-act="weeks">&lt; YOUR SCHEDULE</button>${weekScores(weekDetail, `WEEK ${weekDetail}`)}`;
    }
    const lines = Array.from({ length: SEASON_WEEKS }, (_, i) => {
      const w = i + 1;
      const g = teamGame(s, me, w);
      const now = w === s.week ? ' now' : '';
      if (!g) return `<button type="button" class="ss-week${now}" data-week="${w}"><span class="ss-wk">WK ${w}</span><span class="ss-bye">BYE</span></button>`;
      const home = g.home === me;
      const opp = home ? g.away : g.home;
      let res = '';
      if (g.score) {
        const [mine, theirs] = home ? g.score : [g.score[1], g.score[0]];
        const k = mine > theirs ? 'W' : mine < theirs ? 'L' : 'T';
        res = `<span class="ss-res r-${k}">${k} ${mine}-${theirs}${g.ot ? ' OT' : ''}</span>`;
      }
      return `<button type="button" class="ss-week${now}" data-week="${w}"><span class="ss-wk">WK ${w}</span><span class="ss-opp">${home ? 'VS' : '@'} ${logo(opp, 16)}${esc(t(opp).abbr)}</span>${res}</button>`;
    }).join('');
    return `<div class="ss-title">${esc(t(me).abbr)} SCHEDULE · ${rec(me)}</div><div class="ss-weeks">${lines}</div>`;
  };

  const el = document.createElement('div');
  el.id = 'season-screen';
  el.innerHTML = `
    <div class="ss-wrap" role="dialog" aria-label="Season">
      <nav class="ss-rail">
        <div class="ss-me">${logo(me, 44)}<span>${esc(t(me).abbr)} ${rec(me)}</span></div>
        <button type="button" class="ss-nav" data-view="season">SEASON</button>
        <button type="button" class="ss-nav" data-view="standings">STANDINGS</button>
        <button type="button" class="ss-nav" data-view="schedule">SCHEDULE</button>
        <button type="button" class="ss-nav" data-act="team">TEAM</button>
      </nav>
      <main class="ss-main"></main>
    </div>`;
  const main = el.querySelector<HTMLElement>('.ss-main')!;
  const render = () => {
    el.querySelectorAll<HTMLButtonElement>('.ss-nav[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === view));
    main.innerHTML = view === 'season' ? seasonView() : view === 'standings' ? standingsView() : scheduleView();
    main.querySelectorAll<HTMLButtonElement>('.ss-btn').forEach((b) => (b.disabled = busy));
  };
  const act = (a: string | undefined) => {
    if (busy) return;
    if (a === 'play') o.onPlay();
    if (a === 'sim') o.onSim();
    if (a === 'simweek') o.onSimWeek();
    if (a === 'next') o.onNextSeason();
    if (a === 'team') o.onTeam();
  };
  el.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const nav = target.closest<HTMLElement>('[data-view]');
    if (nav) {
      view = nav.dataset.view as View;
      weekDetail = null;
      render();
      main.scrollTop = 0;
      return;
    }
    const c = target.closest<HTMLElement>('[data-conf]');
    if (c) {
      conf = Number(c.dataset.conf);
      render();
      return;
    }
    const wk = target.closest<HTMLElement>('[data-week]');
    if (wk) {
      weekDetail = Number(wk.dataset.week);
      render();
      main.scrollTop = 0;
      return;
    }
    const a = target.closest<HTMLElement>('[data-act]')?.dataset.act;
    if (a === 'weeks') {
      weekDetail = null;
      render();
      return;
    }
    act(a);
  });
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  // Enter = the main button of the SEASON view (play this week / sim the bye week / next season).
  // No key reaches the game underneath while this is open.
  const onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement | null)?.closest?.('input, select, textarea')) return; // ⚙ panel
    if (document.getElementById('team-screen')) return; // the TEAM screen on top handles its own keys
    e.stopImmediatePropagation();
    if (e.type === 'keydown' && e.key === 'Enter' && view === 'season') {
      e.preventDefault();
      act(main.querySelector<HTMLElement>('.ss-btn.go')?.dataset.act);
    }
  };
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKey, true);
  document.body.appendChild(el);
  render();
  setBusy = (b) => {
    busy = b;
    main.querySelectorAll<HTMLButtonElement>('.ss-btn').forEach((x) => (x.disabled = b));
  };
  close = () => {
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('keyup', onKey, true);
    el.remove();
    close = null;
    setBusy = null;
  };
}
