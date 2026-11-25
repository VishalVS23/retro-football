/**
 * SEASON screen (Stage 4a): the season's home. A side rail (SEASON / STANDINGS / SCHEDULE / STATS / TEAM)
 * and, on the right: this week's game (PLAY GAME / SIM GAME, or SIM WEEK on a bye) with last week's
 * scores; the division tables; the user's 18 weeks (tap one for every score that week); or (4c) the
 * league leaders and every team's stats.
 * Look only: the game scene does the work through the callbacks.
 */
import '@fontsource/press-start-2p/latin-400.css';
import './seasonScreen.css';
import {
  SEASON_WEEKS,
  divisionStandings,
  gamesInWeek,
  recordText,
  standingRows,
  teamGame,
  type Season,
  type SeasonGame,
  type StandingRow,
} from '../league/season';
import { teamLogoHtml } from './teamLogo';
import { parseNewsText, unreadCount, type NewsItem, type NewsStore } from '../story/news';
import type { TeamTotals } from '../league/leaders';
import { ROUND_NAMES, championOf, inPlayoffs, playoffResult, playoffSeeds, resultWords, roundOfWeek, seasonDone, type SeasonSummary } from '../league/playoffs';

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
  /** 4b: does this game have a box score, and open it. */
  hasBox?: (gameId: number) => boolean;
  onBox?: (gameId: number) => void;
  /** 4c: the STATS view's numbers (worked out when it opens), and tapping a leader opens his profile. */
  stats?: () => SeasonStatsData;
  onPlayer?: (playerId: number) => void;
  /** 4e: past seasons (champion, runner-up, the user's season), oldest first. */
  pastSeasons?: SeasonSummary[];
  /** 5a: the inbox. Names for the text's tokens; marking read returns the updated store (the scene saves it). */
  news?: {
    store: NewsStore;
    teamName: (id: number, full: boolean) => string;
    playerName: (id: number) => string;
    onRead: (id: number | 'all') => NewsStore;
    onTeam: (teamId: number) => void;
  };
}

export interface SeasonStatsData {
  leaders: { label: string; decimals?: boolean; rows: { id: number; name: string; pos: string; teamId: number; value: number }[] }[];
  teams: TeamTotals[];
}

type View = 'season' | 'inbox' | 'standings' | 'schedule' | 'stats' | 'playoffs';
type TeamSort = 'pf' | 'pa' | 'yds' | 'alw' | 'to' | 'sck';
function per(total: number, games: number) {
  return games ? total / games : 0;
}
/** Team table columns: the label, the value, and whether a LOWER number is better (sorted first). */
const TEAM_COLS: { key: TeamSort; label: string; value: (t: TeamTotals) => number; low?: boolean; text?: (v: number) => string }[] = [
  { key: 'pf', label: 'PTS/G', value: (t) => per(t.pointsFor, t.games) },
  { key: 'pa', label: 'OPP/G', value: (t) => per(t.pointsAgainst, t.games), low: true },
  { key: 'yds', label: 'YDS/G', value: (t) => per(t.yards, t.games) },
  { key: 'alw', label: 'ALW/G', value: (t) => per(t.yardsAllowed, t.games), low: true },
  { key: 'to', label: 'TO +/-', value: (t) => t.takeaways - t.giveaways, text: (v) => (v > 0 ? `+${v}` : `${v}`) },
  { key: 'sck', label: 'SACKS', value: (t) => t.sacks, text: (v) => `${v}` },
];

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
/** "WEEK 7" in the regular season, the round's name in the playoffs (4e). */
export const weekName = (week: number) => (roundOfWeek(week) ? ROUND_NAMES[roundOfWeek(week) - 1] : `WEEK ${week}`);
const pctText = (p: number) => (p >= 1 ? '1.000' : p.toFixed(3).replace(/^0/, ''));

export function openSeasonScreen(o: SeasonScreenOptions) {
  closeSeasonScreen();
  let view: View = 'season';
  let conf = o.teams[o.userTeamId].conference;
  let weekDetail: number | null = null;
  let busy = false;
  // STATS view (4c).
  let statsMode: 'players' | 'teams' = 'players';
  let cat = 0;
  let teamSort: TeamSort = 'pf';
  let sortFlip = false;
  let statsData: SeasonStatsData | null = null;
  // INBOX (5a): the open message (null = the list).
  let newsItem: number | null = null;
  let news = o.news?.store ?? null;
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
    const seed = (id: number) => {
      const i = g.round ? (s.seeds ?? []).findIndex((c) => c.includes(id)) : -1;
      return i >= 0 ? `<span class="ss-seed">${s.seeds![i].indexOf(id) + 1}</span>` : '';
    };
    const side = (id: number, pts: number, won: boolean) =>
      `<span class="ss-side${won ? ' won' : ''}">${seed(id)}${logo(id, 16)}<span class="ss-abbr">${esc(t(id).abbr)}</span><b>${g.score ? pts : ''}</b></span>`;
    const inner = `${side(g.away, as, as > hs)}<span class="ss-at">${g.neutral ? 'VS' : '@'}</span>${side(g.home, hs, hs > as)}${g.ot ? `<span class="ss-ot">${g.ot > 1 ? `${g.ot}OT` : 'OT'}</span>` : ''}`;
    // A played game with a box score: tap it for the box score (4b).
    return g.score && o.hasBox?.(g.id)
      ? `<button type="button" class="ss-score tap${mine ? ' mine' : ''}" data-game="${g.id}">${inner}<span class="ss-box">BOX &gt;</span></button>`
      : `<div class="ss-score${mine ? ' mine' : ''}">${inner}</div>`;
  };

  const weekScores = (week: number, title: string) => {
    const games = gamesInWeek(s, week);
    const byes = o.teams.map((_, id) => id).filter((id) => !games.some((g) => g.home === id || g.away === id));
    return `
      <div class="ss-h">${title}</div>
      <div class="ss-scores">${games.map(scoreLine).join('')}</div>
      ${byes.length && !roundOfWeek(week) ? `<div class="ss-note">BYE: ${byes.map((id) => esc(t(id).abbr)).join(' · ')}</div>` : ''}`;
  };

  const seasonView = () => {
    let card: string;
    const round = roundOfWeek(s.week);
    const champ = championOf(s);
    if (seasonDone(s) && champ) {
      // 4e: the season is finished: the champion, the final, and how our season went.
      const won = champ.champion === me;
      const sc = champ.game.score!;
      const [w, l] = champ.champion === champ.game.home ? sc : [sc[1], sc[0]];
      card = `
        <div class="ss-card${won ? ' champ' : ''}">
          <div class="ss-card-title">${won ? 'YOU WON THE CHAMPIONSHIP!' : `SEASON ${s.year} CHAMPIONS`}</div>
          <div class="ss-big">${logo(champ.champion, 48)}<span>${esc(t(champ.champion).city.toUpperCase())} ${esc(t(champ.champion).nickname.toUpperCase())}</span></div>
          <div class="ss-note">BEAT ${esc(t(champ.runnerUp).abbr)} ${w}-${l}${champ.game.ot ? ' (OT)' : ''} IN THE CHAMPIONSHIP</div>
          <div class="ss-note">YOUR SEASON: ${esc(t(me).abbr)} ${rec(me)} · ${resultWords(playoffResult(s, me))}</div>
          <div class="ss-btns"><button type="button" class="ss-btn go" data-act="next">START NEXT SEASON &gt;</button></div>
        </div>`;
    } else if (round && !teamGame(s, me)) {
      // 4e: playoffs, and we're not playing this round (a bye as a top-2 seed, knocked out, or missed).
      const res = playoffResult(s, me);
      const seed = (s.seeds ?? []).find((c) => c.includes(me))?.indexOf(me) ?? -1;
      const why =
        res === 'alive' ? `${seed + 1} SEED: A FIRST-ROUND BYE. YOU PLAY IN THE DIVISIONAL ROUND.` : `${esc(t(me).abbr)} ${rec(me)} · ${resultWords(res)}.`;
      card = `
        <div class="ss-card">
          <div class="ss-card-title">PLAYOFFS · ${ROUND_NAMES[round - 1]}</div>
          <div class="ss-big">${logo(me, 40)}<span>${res === 'alive' ? 'BYE WEEK' : 'SEASON OVER'}</span></div>
          <div class="ss-note">${why}</div>
          <div class="ss-btns"><button type="button" class="ss-btn go" data-act="simweek">SIM ${round === 4 ? 'THE CHAMPIONSHIP' : 'ROUND'} &gt;</button>
            <button type="button" class="ss-btn sim" data-view="playoffs">BRACKET</button></div>
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
            <div class="ss-card-title">${round ? `PLAYOFFS · ${ROUND_NAMES[round - 1]}` : `WEEK ${s.week} OF ${SEASON_WEEKS}`}</div>
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
        const where = g.neutral ? 'NEUTRAL FIELD' : home ? 'HOME' : 'AWAY';
        card = `
          <div class="ss-card">
            <div class="ss-card-title">${round ? `PLAYOFFS · ${ROUND_NAMES[round - 1]}` : `WEEK ${s.week} OF ${SEASON_WEEKS}`} · ${where}</div>
            <div class="ss-match">${team(me)}<div class="ss-vs">${home ? 'VS' : 'AT'}</div>${team(opp)}</div>
            <div class="ss-note">${esc(t(opp).city.toUpperCase())} ${esc(t(opp).nickname.toUpperCase())}</div>
            <div class="ss-btns">
              <button type="button" class="ss-btn go" data-act="play">PLAY GAME &gt;</button>
              <button type="button" class="ss-btn sim" data-act="sim">SIM GAME</button>
            </div>
          </div>`;
      }
    }
    const results = o.resultsWeek ? weekScores(o.resultsWeek, `${weekName(o.resultsWeek)} RESULTS`) : '';
    // 5a: news waiting (the latest message about us, else the latest).
    const latest = news ? ([...news.items].reverse().find((x) => !x.read && x.mine) ?? [...news.items].reverse().find((x) => !x.read)) : undefined;
    const nudge = latest
      ? `<button type="button" class="ss-inboxnote" data-news="${latest.id}"><span class="ss-dot"></span><span>${newsText(latest.title, false).toUpperCase()}</span><span class="ss-box">INBOX (${unread()}) &gt;</span></button>`
      : '';
    return `<div class="ss-title">SEASON ${s.year}${inPlayoffs(s) ? ' · PLAYOFFS' : ''}</div>${card}${nudge}${results}`;
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
      return `<button class="ss-link" type="button" data-act="weeks">&lt; YOUR SCHEDULE</button>${weekScores(weekDetail, weekName(weekDetail))}`;
    }
    // The regular season, then any playoff weeks with a game of ours (4e).
    const weeks = [...Array.from({ length: SEASON_WEEKS }, (_, i) => i + 1), ...[19, 20, 21, 22].filter((w) => teamGame(s, me, w))];
    const lines = weeks.map((w) => {
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
      const wk = roundOfWeek(w) ? ['WC', 'DIV', 'CONF', 'FINAL'][roundOfWeek(w) - 1] : `WK ${w}`;
      return `<button type="button" class="ss-week${now}" data-week="${w}"><span class="ss-wk">${wk}</span><span class="ss-opp">${home ? 'VS' : '@'} ${logo(opp, 16)}${esc(t(opp).abbr)}</span>${res}</button>`;
    }).join('');
    return `<div class="ss-title">${esc(t(me).abbr)} SCHEDULE · ${rec(me)}</div><div class="ss-weeks">${lines}</div>`;
  };

  const statsView = () => {
    statsData ??= o.stats?.() ?? { leaders: [], teams: [] };
    const d = statsData;
    const chip = (attr: string, value: string | number, label: string, on: boolean) => `<button type="button" class="ss-chip${on ? ' on' : ''}" ${attr}="${value}">${label}</button>`;
    const head = `
      <div class="ss-head">
        <div class="ss-title">STATS · SEASON ${s.year}</div>
        <div class="ss-chips">${chip('data-mode', 'players', 'PLAYERS', statsMode === 'players')}${chip('data-mode', 'teams', 'TEAMS', statsMode === 'teams')}</div>
      </div>`;
    if (statsMode === 'players') {
      const c = d.leaders[cat];
      const list = c?.rows.length
        ? c.rows
            .map(
              (r, i) => `<button type="button" class="ss-leader${r.teamId === me ? ' mine' : ''}" data-player="${r.id}">
                <span class="ss-rank">${i + 1}</span>${logo(r.teamId, 16)}<span class="ss-labbr">${esc(t(r.teamId).abbr)}</span>
                <span class="ss-lpos">${esc(r.pos)}</span><span class="ss-lname">${esc(r.name)}</span><b>${c.decimals ? r.value.toFixed(1) : r.value}</b></button>`,
            )
            .join('')
        : '<div class="ss-note">NO GAMES PLAYED YET.</div>';
      const note = c?.decimals ? '<div class="ss-note">PLAYERS RATED IN AT LEAST HALF OF THEIR TEAM\'S GAMES.</div>' : '';
      return `${head}
        <div class="ss-cats">${d.leaders.map((x, i) => chip('data-cat', i, x.label, i === cat)).join('')}</div>
        <div class="ss-leaders">${list}</div>${note}`;
    }
    const sortCol = TEAM_COLS.find((x) => x.key === teamSort)!;
    const dir = (sortCol.low ? 1 : -1) * (sortFlip ? -1 : 1);
    const teams = [...d.teams].sort((a, b) => dir * (sortCol.value(a) - sortCol.value(b)) || a.teamId - b.teamId);
    const fmt = (c: (typeof TEAM_COLS)[number], v: number) => (c.text ? c.text(v) : v.toFixed(1));
    return `${head}
      <table class="ss-table ss-teamstats">
        <tr><th class="l">TEAM</th>${TEAM_COLS.map((c) => `<th><button type="button" class="ss-sort${c.key === teamSort ? ' on' : ''}" data-sort="${c.key}">${c.label}</button></th>`).join('')}</tr>
        ${teams
          .map(
            (x) => `<tr class="${x.teamId === me ? 'mine' : ''}"><td class="l">${logo(x.teamId, 16)}<span>${esc(t(x.teamId).abbr)}</span></td>${TEAM_COLS.map((c) => `<td>${fmt(c, c.value(x))}</td>`).join('')}</tr>`,
          )
          .join('')}
      </table>
      <div class="ss-note">TAP A COLUMN TO SORT (AGAIN TO FLIP). ALW = YARDS ALLOWED. TO = TAKEAWAYS MINUS GIVEAWAYS.</div>`;
  };

  /** 4e: the playoff picture (during the season), or the bracket round by round; past champions below. */
  const playoffsView = () => {
    let body: string;
    if (!s.seeds && !s.games.some((g) => g.score)) {
      body = '<div class="ss-note">NO GAMES PLAYED YET. THE PLAYOFF PICTURE SHOWS UP AFTER WEEK 1: 6 TEAMS A CONFERENCE GET IN, THE TOP 2 SEEDS SKIP THE WILD CARD ROUND.</div>';
    } else if (!s.seeds) {
      const confs = playoffSeeds(s, o.teams);
      body = `<div class="ss-note">IF THE SEASON ENDED TODAY. DIVISION WINNERS ARE SEEDS 1-4; THE TOP 2 SEEDS SKIP THE WILD CARD ROUND.</div>
        <div class="ss-divs">${confs
          .map(
            (c, ci) => `<div class="ss-div">
              <div class="ss-h">${esc(o.conferences[ci].toUpperCase())}</div>
              <table class="ss-table">
                <tr><th class="l">SEED</th><th>W-L-T</th><th>PCT</th></tr>
                ${[...c.seeds, ...c.hunt]
                  .map(
                    (id, i) => `<tr class="${id === me ? 'mine' : ''}${i === 6 ? ' ss-cut' : ''}"><td class="l"><span class="ss-seed">${i < 6 ? i + 1 : '-'}</span>${logo(id, 16)}<span>${esc(t(id).abbr)}</span></td><td>${rows[id].w}-${rows[id].l}-${rows[id].t}</td><td>${pctText(rows[id].pct)}</td></tr>`,
                  )
                  .join('')}
              </table>
            </div>`,
          )
          .join('')}</div>`;
    } else {
      body = [1, 2, 3, 4]
        .map((r) => {
          const games = s.games.filter((g) => g.round === r);
          const todo = r === 1 ? '' : '<div class="ss-note">TO BE DECIDED.</div>';
          return `<div class="ss-h">${ROUND_NAMES[r - 1]}</div>${games.length ? `<div class="ss-scores">${games.map(scoreLine).join('')}</div>` : todo}`;
        })
        .join('');
    }
    const past = (o.pastSeasons ?? []).slice().reverse();
    const history = past.length
      ? `<div class="ss-h">PAST CHAMPIONS</div><div class="ss-scores">${past
          .map(
            (h) => `<div class="ss-score${h.champion === me ? ' mine' : ''}"><span class="ss-wk">SEASON ${h.year}</span>${logo(h.champion, 16)}<span class="ss-abbr">${esc(t(h.champion).abbr)}</span>
              <span class="ss-at">BEAT ${esc(t(h.runnerUp).abbr)} ${h.score[0]}-${h.score[1]}${h.ot ? ' OT' : ''}</span><span class="ss-box">YOU: ${esc(h.userRecord)}</span></div>`,
          )
          .join('')}</div>`
      : '';
    return `<div class="ss-title">PLAYOFFS · SEASON ${s.year}</div>${body}${history}`;
  };

  /** News text with its tokens: team / player names (tappable in a message, plain in the list). */
  const newsText = (line: string, links: boolean) =>
    parseNewsText(line)
      .map((part) => {
        if ('text' in part) return esc(part.text);
        const name = 'team' in part ? o.news!.teamName(part.team, part.full) : o.news!.playerName(part.player);
        if (!links) return esc(name);
        return 'team' in part ? `<button type="button" class="ss-ref" data-team="${part.team}">${esc(name)}</button>` : `<button type="button" class="ss-ref" data-player="${part.player}">${esc(name)}</button>`;
      })
      .join('');
  const newsWeek = (x: NewsItem) => (x.week === 0 ? 'PRE' : roundOfWeek(x.week) ? ['WC', 'DIV', 'CONF', 'FINAL'][roundOfWeek(x.week) - 1] : `WK ${x.week}`);
  const unread = () => (news ? unreadCount(news) : 0);

  const inboxView = () => {
    if (!news) return '<div class="ss-note">NO NEWS YET.</div>';
    const open = newsItem !== null ? news.items.find((x) => x.id === newsItem) : undefined;
    if (open) {
      const box = open.gameId !== undefined && o.hasBox?.(open.gameId) ? `<div class="ss-btns"><button type="button" class="ss-btn sim" data-game="${open.gameId}">BOX SCORE &gt;</button></div>` : '';
      return `<button class="ss-link" type="button" data-act="inbox">&lt; INBOX</button>
        <div class="ss-article${open.mine ? ' mine' : ''}">
          <div class="ss-meta">SEASON ${open.year} · ${open.week === 0 ? 'PRESEASON' : weekName(open.week)}</div>
          <div class="ss-title">${newsText(open.title, false).toUpperCase()}</div>
          ${open.body.map((b) => `<p>${newsText(b, true)}</p>`).join('')}
          ${box}
        </div>`;
    }
    const list = [...news.items].reverse();
    const rowsHtml = list.length
      ? list
          .map(
            (x) => `<button type="button" class="ss-news${x.mine ? ' mine' : ''}${x.read ? '' : ' unread'}" data-news="${x.id}">
              <span class="ss-dot"></span><span class="ss-nwk">${newsWeek(x)}</span><span class="ss-ntitle">${newsText(x.title, false).toUpperCase()}</span></button>`,
          )
          .join('')
      : '<div class="ss-note">NO NEWS YET. IT ARRIVES AS THE WEEKS ARE PLAYED.</div>';
    return `<div class="ss-head"><div class="ss-title">INBOX${unread() ? ` · ${unread()} NEW` : ''}</div>
        ${unread() ? '<div class="ss-chips"><button type="button" class="ss-chip" data-act="allread">MARK ALL READ</button></div>' : ''}</div>
      <div class="ss-newslist">${rowsHtml}</div>`;
  };

  const el = document.createElement('div');
  el.id = 'season-screen';
  el.innerHTML = `
    <div class="ss-wrap" role="dialog" aria-label="Season">
      <nav class="ss-rail">
        <div class="ss-me">${logo(me, 44)}<span>${esc(t(me).abbr)} ${rec(me)}</span></div>
        <button type="button" class="ss-nav" data-view="season">SEASON</button>
        ${o.news ? '<button type="button" class="ss-nav" data-view="inbox">INBOX<span class="ss-badge"></span></button>' : ''}
        <button type="button" class="ss-nav" data-view="standings">STANDINGS</button>
        <button type="button" class="ss-nav" data-view="schedule">SCHEDULE</button>
        <button type="button" class="ss-nav" data-view="playoffs">PLAYOFFS</button>
        ${o.stats ? '<button type="button" class="ss-nav" data-view="stats">STATS</button>' : ''}
        <button type="button" class="ss-nav" data-act="team">TEAM</button>
      </nav>
      <main class="ss-main"></main>
    </div>`;
  const main = el.querySelector<HTMLElement>('.ss-main')!;
  const render = () => {
    el.querySelectorAll<HTMLButtonElement>('.ss-nav[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === view));
    const n = unread();
    const badge = el.querySelector<HTMLElement>('.ss-badge');
    if (badge) {
      badge.textContent = n ? String(n) : '';
      badge.hidden = !n;
    }
    main.innerHTML = view === 'inbox' ? inboxView() : view === 'season' ? seasonView() : view === 'standings' ? standingsView() : view === 'stats' ? statsView() : view === 'playoffs' ? playoffsView() : scheduleView();
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
      newsItem = null;
      render();
      main.scrollTop = 0;
      return;
    }
    const item = target.closest<HTMLElement>('[data-news]');
    if (item && o.news && news) {
      const id = Number(item.dataset.news);
      newsItem = id;
      view = 'inbox';
      if (!news.items.find((x) => x.id === id)?.read) news = o.news.onRead(id);
      render();
      main.scrollTop = 0;
      return;
    }
    const teamRef = target.closest<HTMLElement>('[data-team]');
    if (teamRef) {
      o.news?.onTeam(Number(teamRef.dataset.team));
      return;
    }
    const mode = target.closest<HTMLElement>('[data-mode]');
    if (mode) {
      statsMode = mode.dataset.mode as 'players' | 'teams';
      render();
      return;
    }
    const catBtn = target.closest<HTMLElement>('[data-cat]');
    if (catBtn) {
      cat = Number(catBtn.dataset.cat);
      render();
      return;
    }
    const sortBtn = target.closest<HTMLElement>('[data-sort]');
    if (sortBtn) {
      const k = sortBtn.dataset.sort as TeamSort;
      sortFlip = k === teamSort ? !sortFlip : false;
      teamSort = k;
      render();
      return;
    }
    const who = target.closest<HTMLElement>('[data-player]');
    if (who) {
      o.onPlayer?.(Number(who.dataset.player));
      return;
    }
    const c = target.closest<HTMLElement>('[data-conf]');
    if (c) {
      conf = Number(c.dataset.conf);
      render();
      return;
    }
    const box = target.closest<HTMLElement>('[data-game]');
    if (box) {
      o.onBox?.(Number(box.dataset.game));
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
    if (a === 'inbox') {
      newsItem = null;
      render();
      return;
    }
    if (a === 'allread' && o.news) {
      news = o.news.onRead('all');
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
    if (document.getElementById('team-screen') || document.getElementById('box-score')) return; // a screen on top handles its own keys
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
