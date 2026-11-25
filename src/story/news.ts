/**
 * Stage 5a: the inbox. News items written from what really happened in the league: the week's results
 * (upsets, blowouts, overtime, streaks), players of the week (from the game ratings), the playoff race
 * (clinched / eliminated), the playoff field, each round and the champion, and a preview at the start
 * of each season. Pure logic, no Phaser.
 *
 * Text refers to teams and players by id with tokens the inbox turns into (tappable) names:
 * {t:12} = city + nickname, {a:12} = abbreviation, {p:345} = player's name.
 */
import { createRng, type Rng } from '../sim/rng';
import { SEASON_WEEKS, gamesInWeek, standingRows, type Season, type SeasonGame, type StandingRow } from '../league/season';
import { ROUND_NAMES, championOf, roundOfWeek } from '../league/playoffs';
import { statSummary } from '../league/leaders';
import { ratingText } from '../league/gameRatings';
import type { BoxScore } from '../league/boxScore';
import { readGame, writeRecap } from './recap';
import { emptyRecords, sanitizeRecords, weekMilestones, type RecordBook } from './milestones';

export type NewsKind = 'roundup' | 'potw' | 'race' | 'playoffs' | 'champion' | 'preview' | 'recap' | 'milestone' | 'contracts';

export interface NewsItem {
  id: number;
  year: number;
  /** The week it's about (0 = before the season). */
  week: number;
  kind: NewsKind;
  /** Short headline (tokens allowed). */
  title: string;
  /** Paragraphs (tokens allowed). */
  body: string[];
  /** About the user's team: highlighted in the inbox. */
  mine?: boolean;
  read?: boolean;
  /** A game it's about (BOX SCORE button). */
  gameId?: number;
}

export interface NewsStore {
  nextId: number;
  /** Oldest first. */
  items: NewsItem[];
  /** Things already announced (e.g. "clinch:2:14"), so each is said once. */
  flags: string[];
  /** 5c: league records, single game and single season (kept across seasons). */
  records?: RecordBook;
}

export interface NewsTeam {
  abbr: string;
  conference: number;
  division: number;
  /** 1-5 overall stars. */
  stars: number;
  /** 1 = best roster in the league on paper. */
  rank: number;
}

export interface NewsPlayer {
  position: string;
}

export interface NewsContext {
  /** The season with this week's scores in it (playoff seeds set once the regular season is over). */
  season: Season;
  teams: readonly NewsTeam[];
  boxes: Readonly<Record<number, BoxScore>>;
  player: (id: number) => NewsPlayer | undefined;
  userTeamId: number;
}

/** Regular-season games per team. */
const GAMES = 17;
const NEWS_SALT = 0x6e657773;

export function emptyNews(): NewsStore {
  return { nextId: 1, items: [], flags: [] };
}

const t = (id: number) => `{t:${id}}`;
const a = (id: number) => `{a:${id}}`;
const p = (id: number) => `{p:${id}}`;

function add(store: NewsStore, items: Omit<NewsItem, 'id'>[]): NewsStore {
  let id = store.nextId;
  return { ...store, nextId: id + items.length, items: [...store.items, ...items.map((x) => ({ ...x, id: id++ }))] };
}

function flagged(store: NewsStore, key: string) {
  return store.flags.includes(key);
}

/** Week name as it reads in a headline: "WEEK 5" / "WILD CARD ROUND". */
export function weekTitle(week: number): string {
  const r = roundOfWeek(week);
  return r ? ROUND_NAMES[r - 1] : week === 0 ? 'PRESEASON' : `WEEK ${week}`;
}

interface Result {
  g: SeasonGame;
  winner: number;
  loser: number;
  ws: number;
  ls: number;
  tie: boolean;
}

function result(g: SeasonGame): Result {
  const [hs, as] = g.score!;
  const homeWon = hs >= as;
  return { g, winner: homeWon ? g.home : g.away, loser: homeWon ? g.away : g.home, ws: Math.max(hs, as), ls: Math.min(hs, as), tie: hs === as };
}

const otText = (g: SeasonGame) => (g.ot ? (g.ot > 1 ? ` in ${g.ot} overtimes` : ' in overtime') : '');

/** One sentence about a notable game, and how notable it is (higher first). */
function notable(r: Result, teams: readonly NewsTeam[], rng: Rng): { score: number; text: string } | null {
  const { g, winner: w, loser: l, ws, ls } = r;
  const sc = `${ws}-${ls}`;
  if (r.tie) return { score: 5, text: rng.pick([`${t(g.home)} and ${t(g.away)} couldn't be split: ${sc}${otText(g)}.`, `Nobody won in ${a(g.home)}-${a(g.away)}: a ${sc} tie.`]) };
  const gap = teams[l].stars - teams[w].stars;
  if (gap >= 2)
    return {
      score: 10 + gap,
      text: rng.pick([
        `UPSET: ${t(w)} stunned ${t(l)}, ${sc}${otText(g)}.`,
        `Nobody saw this coming: ${t(w)} beat ${t(l)} ${sc}${otText(g)}.`,
        `${t(l)} were heavy favourites and still lost ${sc} to ${t(w)}${otText(g)}.`,
      ]),
    };
  if (g.ot) return { score: 8, text: rng.pick([`${t(w)} outlasted ${t(l)} ${sc}${otText(g)}.`, `It took overtime, but ${t(w)} got past ${t(l)}, ${sc}.`]) };
  if (ls === 0) return { score: 7, text: rng.pick([`${t(w)} shut out ${t(l)}, ${sc}.`, `${t(l)} never got on the board in a ${sc} loss to ${t(w)}.`]) };
  if (ws - ls >= 24) return { score: 6, text: rng.pick([`${t(w)} routed ${t(l)} ${sc}.`, `A blowout: ${t(w)} ${ws}, ${t(l)} ${ls}.`, `${t(w)} ran ${t(l)} off the field, ${sc}.`]) };
  if (ws + ls >= 75) return { score: 6, text: rng.pick([`A shootout: ${t(w)} beat ${t(l)} ${sc}.`, `Nobody played defense in ${t(w)}'s ${sc} win over ${t(l)}.`]) };
  if (ws - ls <= 3) return { score: 4, text: rng.pick([`${t(w)} edged ${t(l)} ${sc}.`, `${t(w)} held on to beat ${t(l)} ${sc}.`]) };
  return null;
}

/** "W5" -> 5 wins in a row (negative = losses). */
function streakOf(r: StandingRow): number {
  const m = /^([WL])(\d+)$/.exec(r.streak);
  if (!m) return 0;
  return m[1] === 'W' ? Number(m[2]) : -Number(m[2]);
}

/** The week's results: notable games first, streaks; in the playoffs, every game. */
function roundup(ctx: NewsContext, week: number, rng: Rng): Omit<NewsItem, 'id'> | null {
  const s = ctx.season;
  const games = gamesInWeek(s, week).filter((g) => g.score);
  if (!games.length) return null;
  const me = ctx.userTeamId;
  const myGame = games.find((g) => g.home === me || g.away === me);
  const mine = !!myGame;
  const round = roundOfWeek(week);
  if (round) {
    const body = games.map((g) => {
      const r = result(g);
      const sc = `${r.ws}-${r.ls}`;
      return round === 4
        ? `${t(r.winner)} beat ${t(r.loser)} ${sc}${otText(g)} to win the Championship.`
        : rng.pick([`${t(r.winner)} beat ${t(r.loser)} ${sc}${otText(g)} and move on.`, `${t(r.loser)} are out: ${t(r.winner)} won ${sc}${otText(g)}.`]);
    });
    return { year: s.year, week, kind: 'playoffs', title: `${weekTitle(week)}: RESULTS`, body, ...(mine && { mine }) };
  }
  const notes = games
    .filter((g) => g !== myGame)
    .map((g) => notable(result(g), ctx.teams, rng))
    .filter((x): x is { score: number; text: string } => !!x)
    .sort((x, y) => y.score - x.score)
    .slice(0, 5)
    .map((x) => x.text);
  const body = notes.length ? notes : [rng.pick(['A quiet week: every game went about the way it was supposed to.', 'No surprises this week: the favourites took care of business.'])];
  // Our own game always comes first.
  if (myGame) {
    const r = result(myGame);
    const opp = myGame.home === me ? myGame.away : myGame.home;
    const sc = `${r.ws}-${r.ls}`;
    body.unshift(r.tie ? `Your ${t(me)} tied ${t(opp)} ${sc}${otText(myGame)}.` : r.winner === me ? `Your ${t(me)} beat ${t(opp)} ${sc}${otText(myGame)}.` : `Your ${t(me)} lost ${sc} to ${t(opp)}${otText(myGame)}.`);
  }
  const rows = standingRows(s, ctx.teams);
  const hot = [...rows].sort((x, y) => streakOf(y) - streakOf(x) || x.teamId - y.teamId)[0];
  const cold = [...rows].sort((x, y) => streakOf(x) - streakOf(y) || x.teamId - y.teamId)[0];
  if (hot && streakOf(hot) >= 4) body.push(rng.pick([`${t(hot.teamId)} have won ${streakOf(hot)} in a row.`, `The hottest team in the league: ${t(hot.teamId)}, ${streakOf(hot)} straight wins.`]));
  if (cold && streakOf(cold) <= -4) body.push(rng.pick([`${t(cold.teamId)} have now lost ${-streakOf(cold)} straight.`, `Still searching: ${t(cold.teamId)} have dropped ${-streakOf(cold)} in a row.`]));
  const undefeated = rows.filter((r) => r.l === 0 && r.t === 0 && r.w >= 5);
  if (undefeated.length && week < SEASON_WEEKS) body.push(`Still unbeaten: ${undefeated.map((r) => `${a(r.teamId)} (${r.w}-0)`).join(', ')}.`);
  return { year: s.year, week, kind: 'roundup', title: 'AROUND THE LEAGUE', body, ...(mine && { mine }) };
}

const OFFENSE = ['QB', 'RB', 'WR', 'TE'];
const DEFENSE = ['DL', 'LB', 'CB', 'S'];

/** Players of the week: the best-rated offensive and defensive player in each conference. */
function playersOfWeek(ctx: NewsContext, week: number, conferenceNames: readonly string[]): Omit<NewsItem, 'id'> | null {
  const games = gamesInWeek(ctx.season, week).filter((g) => g.score && ctx.boxes[g.id]);
  if (!games.length) return null;
  type Pick = { id: number; teamId: number; rating: number; line: string };
  const best: (Pick | null)[][] = [
    [null, null],
    [null, null],
  ];
  for (const g of games)
    for (const tb of ctx.boxes[g.id].teams) {
      const conf = ctx.teams[tb.teamId]?.conference ?? 0;
      for (const [key, rating] of Object.entries(tb.ratings ?? {})) {
        const id = Number(key);
        const pos = ctx.player(id)?.position;
        const side = pos && OFFENSE.includes(pos) ? 0 : pos && DEFENSE.includes(pos) ? 1 : -1;
        if (side < 0) continue;
        const cur = best[conf][side];
        if (!cur || rating > cur.rating || (rating === cur.rating && id < cur.id))
          best[conf][side] = { id, teamId: tb.teamId, rating, line: statSummary(tb.lines[id] ?? {}) };
      }
    }
  const body: string[] = [];
  let mine = false;
  best.forEach((sides, c) =>
    sides.forEach((x, side) => {
      if (!x) return;
      if (x.teamId === ctx.userTeamId) mine = true;
      body.push(`${conferenceNames[c] ?? ''} ${side ? 'DEFENSE' : 'OFFENSE'}: ${p(x.id)} (${a(x.teamId)}, ${ctx.player(x.id)?.position}): ${x.line}. Rated ${ratingText(x.rating)}.`);
    }),
  );
  return body.length ? { year: ctx.season.year, week, kind: 'potw', title: 'PLAYERS OF THE WEEK', body, ...(mine ? { mine } : {}) } : null;
}

/**
 * The playoff race, worked out safely (ties in the standings are counted against the team, so a
 * "clinched" or "eliminated" is never wrong, at worst a week late). Wins count ties as half.
 */
export function raceStatus(s: Season, teams: readonly NewsTeam[]): { clinched: number[]; division: number[]; topSeed: number[]; eliminated: number[] } {
  const rows = standingRows(s, teams);
  const cur = rows.map((r) => r.w + r.t / 2);
  const max = rows.map((r, i) => cur[i] + Math.max(0, GAMES - (r.w + r.l + r.t)));
  const out = { clinched: [] as number[], division: [] as number[], topSeed: [] as number[], eliminated: [] as number[] };
  teams.forEach((tm, x) => {
    const conf = teams.map((_, i) => i).filter((i) => i !== x && teams[i].conference === tm.conference);
    const div = conf.filter((i) => teams[i].division === tm.division);
    const threats = conf.filter((i) => max[i] >= cur[x]).length;
    if (threats <= 5) out.clinched.push(x);
    if (div.every((i) => max[i] < cur[x])) out.division.push(x);
    if (threats === 0) out.topSeed.push(x);
    const divGone = div.some((i) => cur[i] > max[x]);
    if (divGone && conf.filter((i) => cur[i] > max[x]).length >= 6) out.eliminated.push(x);
  });
  return out;
}

function race(store: NewsStore, ctx: NewsContext, week: number): { items: Omit<NewsItem, 'id'>[]; flags: string[] } {
  const s = ctx.season;
  if (roundOfWeek(week)) return { items: [], flags: [] };
  const st = raceStatus(s, ctx.teams);
  const flags: string[] = [];
  const fresh = (kind: string, ids: number[]) =>
    ids.filter((id) => {
      const key = `${kind}:${s.year}:${id}`;
      if (flagged(store, key)) return false;
      flags.push(key);
      return true;
    });
  const top = fresh('top', st.topSeed);
  const div = fresh('div', st.division);
  const clinch = fresh('clinch', st.clinched);
  const elim = fresh('elim', st.eliminated);
  const body: string[] = [];
  for (const id of top) body.push(`${t(id)} have locked up the #1 seed and a first-round bye.`);
  for (const id of div) body.push(`${t(id)} are division champions.`);
  for (const id of clinch.filter((id) => !div.includes(id) && !top.includes(id))) body.push(`${t(id)} have clinched a playoff spot.`);
  for (const id of elim) body.push(`${t(id)} have been knocked out of the playoff race.`);
  if (!body.length) return { items: [], flags };
  const me = ctx.userTeamId;
  const mineIn = [...top, ...div, ...clinch].includes(me);
  const mineOut = elim.includes(me);
  const title = top.includes(me)
    ? `${a(me)} CLINCH THE #1 SEED`
    : div.includes(me)
      ? `${a(me)} WIN THE DIVISION`
      : mineIn
        ? `YOU'RE IN! ${a(me)} CLINCH A PLAYOFF SPOT`
        : mineOut
          ? `${a(me)} ELIMINATED FROM THE PLAYOFF RACE`
          : 'THE PLAYOFF RACE';
  return { items: [{ year: s.year, week, kind: 'race', title, body, ...((mineIn || mineOut) && { mine: true }) }], flags };
}

function playoffField(store: NewsStore, ctx: NewsContext, week: number, conferenceNames: readonly string[]) {
  const s = ctx.season;
  const key = `field:${s.year}`;
  if (!s.seeds || flagged(store, key)) return null;
  const body = s.seeds.map((c, ci) => `${conferenceNames[ci] ?? ''}: ${c.map((id, i) => `${i + 1}. ${a(id)}`).join('  ')}`);
  body.push('Seeds 1 and 2 sit out the Wild Card round. The higher seed is at home until the Championship (neutral field).');
  const me = ctx.userTeamId;
  const seed = s.seeds.find((c) => c.includes(me))?.indexOf(me) ?? -1;
  if (seed >= 0) body.unshift(`${t(me)} are in as the ${seed + 1} seed${seed < 2 ? ', with a bye' : ''}.`);
  else body.unshift(`${t(me)} missed the playoffs this year.`);
  return { item: { year: s.year, week, kind: 'playoffs' as const, title: 'THE PLAYOFF FIELD IS SET', body, mine: true }, flag: key };
}

function champion(store: NewsStore, ctx: NewsContext, week: number) {
  const s = ctx.season;
  const c = championOf(s);
  const key = `champ:${s.year}`;
  if (!c || flagged(store, key)) return null;
  const won = c.champion === ctx.userTeamId;
  const sc = c.game.score!;
  const score = `${Math.max(sc[0], sc[1])}-${Math.min(sc[0], sc[1])}`;
  const body = [
    `${t(c.champion)} are the champions of season ${s.year}, beating ${t(c.runnerUp)} ${score}${otText(c.game)}.`,
    won ? 'Your team is on top of the league. Enjoy it: everyone will be coming for you next season.' : c.runnerUp === ctx.userTeamId ? 'So close: your team fell one game short.' : '',
  ].filter(Boolean);
  return {
    item: { year: s.year, week, kind: 'champion' as const, title: won ? 'CHAMPIONS! YOU WON IT ALL' : `${a(c.champion)} WIN THE CHAMPIONSHIP`, body, gameId: c.game.id, ...((won || c.runnerUp === ctx.userTeamId) && { mine: true }) },
    flag: key,
  };
}

/**
 * 5b: game recaps. Short ones for the most notable games around the league (the Championship in full,
 * comebacks, upsets, overtime; at most 2), then the user's game in full, last (the newest message,
 * so it's the headline on the week card).
 */
function recaps(ctx: NewsContext, week: number, rng: Rng): Omit<NewsItem, 'id'>[] {
  const me = ctx.userTeamId;
  const games = gamesInWeek(ctx.season, week).filter((g) => g.score && ctx.boxes[g.id]);
  const rc = (g: SeasonGame) => ({ game: g, box: ctx.boxes[g.id], teams: ctx.teams, player: ctx.player, userTeamId: me });
  const year = ctx.season.year;
  const mine = games.find((g) => g.home === me || g.away === me);
  const scored = games
    .filter((g) => g !== mine)
    .map((g) => {
      const r = result(g);
      const st = readGame(ctx.boxes[g.id], [g.score![0], g.score![1]], g.ot ?? 0);
      const gap = r.tie ? 0 : ctx.teams[r.loser].stars - ctx.teams[r.winner].stars;
      const final = roundOfWeek(g.week) === 4;
      const score = final ? 100 : (st.deficit >= 14 ? 20 + st.deficit : 0) + (gap >= 2 ? 10 + gap : 0) + (g.ot ? 8 : 0);
      return { g, score, final };
    })
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score || x.g.id - y.g.id)
    .slice(0, 2);
  const out = scored.map((x) => ({ ...writeRecap(rc(x.g), rng, x.final), year }));
  if (mine) out.push({ ...writeRecap(rc(mine), rng, true), year });
  return out;
}

/**
 * Everything the week just played produced: results, players of the week, the playoff race, the
 * playoff field (after week 18), the champion. `conferenceNames` short (e.g. KEYSTONE).
 */
export function weekNews(store: NewsStore, ctx: NewsContext, week: number, conferenceNames: readonly string[]): NewsStore {
  const rng = createRng((ctx.season.seed ^ NEWS_SALT ^ (week * 2654435761)) >>> 0);
  const items: Omit<NewsItem, 'id'>[] = [];
  const flags: string[] = [];
  const r = roundup(ctx, week, rng);
  if (r) items.push(r);
  if (!roundOfWeek(week)) {
    const potw = playersOfWeek(ctx, week, conferenceNames);
    if (potw) items.push(potw);
  }
  // 5c: big games, season milestones, league records.
  const ms = weekMilestones(ctx.season, week, ctx.boxes, store.records ?? emptyRecords(), store.flags, ctx.userTeamId, (id) => ctx.player(id)?.position);
  if (ms.body.length) items.push({ year: ctx.season.year, week, kind: 'milestone', title: ms.record ? 'NEW LEAGUE RECORD!' : 'BIG GAMES & MILESTONES', body: ms.body, ...(ms.mine && { mine: true }) });
  flags.push(...ms.flags);
  store = { ...store, records: ms.records };
  const rc = race(store, ctx, week);
  items.push(...rc.items);
  flags.push(...rc.flags);
  const field = playoffField(store, ctx, week, conferenceNames);
  if (field) {
    items.push(field.item);
    flags.push(field.flag);
  }
  const ch = champion(store, ctx, week);
  if (ch) {
    items.push(ch.item);
    flags.push(ch.flag);
  }
  items.push(...recaps(ctx, week, rng));
  const out = add(store, items);
  return flags.length ? { ...out, flags: [...out.flags, ...flags] } : out;
}

/** Start of a season: the favourites on paper, our outlook, last year's champion. Said once a season. */
export function previewNews(store: NewsStore, season: Season, teams: readonly NewsTeam[], userTeamId: number, conferenceNames: readonly string[], lastChampion?: number): NewsStore {
  const key = `preview:${season.year}`;
  if (flagged(store, key)) return store;
  const rng = createRng((season.seed ^ NEWS_SALT) >>> 0);
  const ids = teams.map((_, i) => i);
  const body: string[] = [];
  if (lastChampion !== undefined) body.push(`${t(lastChampion)} are the defending champions.`);
  [0, 1].forEach((c) => {
    const fav = ids.filter((i) => teams[i].conference === c).sort((x, y) => teams[x].rank - teams[y].rank).slice(0, 3);
    body.push(`${conferenceNames[c] ?? ''} favourites on paper: ${fav.map((i) => t(i)).join(', ')}.`);
  });
  const rank = teams[userTeamId].rank;
  const outlook =
    rank <= 4
      ? rng.pick(['Anything short of a deep playoff run will be a disappointment.', 'The roster is one of the best in the league: the expectation is a title run.'])
      : rank <= 12
        ? rng.pick(['A playoff team on paper. Win the games you should and it should be there.', 'Good enough to make the playoffs; good enough to win it all is another question.'])
        : rank <= 22
          ? rng.pick(['A middle-of-the-pack roster: the playoffs will take some good football.', 'The experts have this team around .500. Prove them wrong.'])
          : rng.pick(['Few people expect much from this roster. Every win will count.', 'A long season is predicted. Surprise people.']);
  body.push(`${t(userTeamId)}: ranked ${rank} of ${teams.length} on paper. ${outlook}`);
  const out = add(store, [{ year: season.year, week: 0, kind: 'preview', title: `SEASON ${season.year} PREVIEW`, body, mine: true }]);
  return { ...out, flags: [...out.flags, key] };
}

/**
 * The lore (user's idea, 2026-11-24): the old league folded and came back as this one, with new teams,
 * names and logos; its record book carried over. One message, once per save (any season).
 */
export function loreNews(store: NewsStore, year: number): NewsStore {
  if (flagged(store, 'lore')) return store;
  const out = add(store, [
    {
      year,
      week: 0,
      kind: 'preview',
      title: 'A NEW ERA: THE LEAGUE IS REBORN',
      body: [
        'The old league played its final season and folded. Its 32 cities came back as a new league: new teams, new names, new colours, new logos.',
        "One thing carried over: the record book. Every old-league mark is still there to chase, from Cal Whitcomb's 462 passing yards in a game to Hollis Varga's 4,612 in a season.",
        "See them all in STATS > RECORDS. Break one and it's yours.",
      ],
      mine: true,
    },
  ]);
  return { ...out, flags: [...out.flags, 'lore'] };
}

/**
 * 6a: the user's contract news at the start of a season: who re-signed (and for how much), who
 * left because the cap had no room for him, who was signed to fill the roster. Money is text
 * already formatted by the caller.
 */
export function contractNews(
  store: NewsStore,
  year: number,
  o: { resigned: { id: number; text: string }[]; left: { id: number; text: string }[]; signed: { id: number; text: string }[]; cap: string },
): NewsStore {
  if (!o.resigned.length && !o.left.length && !o.signed.length) return store;
  const list = (xs: { id: number; text: string }[]) => xs.map((x) => `{p:${x.id}} (${x.text})`).join(', ');
  const body = [`The cap for season ${year} is ${o.cap}. Contracts that ran out were dealt with automatically (negotiations come later).`];
  if (o.resigned.length) body.push(`RE-SIGNED: ${list(o.resigned)}.`);
  if (o.left.length) body.push(`LEFT IN FREE AGENCY (no cap room to keep them): ${list(o.left)}.`);
  if (o.signed.length) body.push(`SIGNED TO FILL THE ROSTER: ${list(o.signed)}.`);
  body.push('See every contract on your TEAM screen under CAP.');
  return add(store, [{ year, week: 0, kind: 'contracts', title: `CONTRACTS: ${o.resigned.length} RE-SIGNED, ${o.left.length} LEFT`, body, mine: true }]);
}

/** Keep this season and last (older news goes, so the save doesn't grow forever). */
export function pruneNews(store: NewsStore, year: number): NewsStore {
  return {
    ...store,
    items: store.items.filter((x) => x.year >= year - 1),
    flags: store.flags.filter((f) => {
      const y = Number(f.split(':')[1]);
      return !(y < year - 1);
    }),
  };
}

export function unreadCount(store: NewsStore): number {
  return store.items.filter((x) => !x.read).length;
}

export function markRead(store: NewsStore, id: number | 'all'): NewsStore {
  return { ...store, items: store.items.map((x) => (id === 'all' || x.id === id ? (x.read ? x : { ...x, read: true }) : x)) };
}

const KINDS: NewsKind[] = ['roundup', 'potw', 'race', 'playoffs', 'champion', 'preview', 'recap', 'milestone', 'contracts'];

/** A damaged or missing store (old save) = an empty one; bad items are dropped. */
export function sanitizeNews(v: unknown): NewsStore {
  if (!v || typeof v !== 'object') return emptyNews();
  const o = v as Partial<NewsStore>;
  const items = Array.isArray(o.items)
    ? o.items.filter(
        (x): x is NewsItem =>
          !!x &&
          typeof x === 'object' &&
          Number.isInteger(x.id) &&
          Number.isInteger(x.year) &&
          Number.isInteger(x.week) &&
          KINDS.includes(x.kind) &&
          typeof x.title === 'string' &&
          Array.isArray(x.body) &&
          x.body.every((b) => typeof b === 'string'),
      )
    : [];
  const maxId = items.reduce((m, x) => Math.max(m, x.id), 0);
  const nextId = Number.isInteger(o.nextId) && (o.nextId as number) > maxId ? (o.nextId as number) : maxId + 1;
  const flags = Array.isArray(o.flags) ? o.flags.filter((f): f is string => typeof f === 'string') : [];
  return o.records !== undefined ? { nextId, items, flags, records: sanitizeRecords(o.records) } : { nextId, items, flags };
}

/** Splits text into plain parts and tokens, for the inbox to render. */
export type NewsPart = { text: string } | { team: number; full: boolean } | { player: number };
export function parseNewsText(s: string): NewsPart[] {
  const out: NewsPart[] = [];
  const re = /\{([tap]):(\d+)\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ text: s.slice(last, m.index) });
    const id = Number(m[2]);
    out.push(m[1] === 'p' ? { player: id } : { team: id, full: m[1] === 't' });
    last = re.lastIndex;
  }
  if (last < s.length) out.push({ text: s.slice(last) });
  return out;
}
