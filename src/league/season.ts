/**
 * The season (Stage 4a): a 17-game, 18-week schedule built the way real football builds one,
 * results, and standings with tiebreakers. Pure logic (no Phaser, no browser).
 *
 * Schedule formula, per team (2 conferences x 4 divisions x 4 teams):
 *  - 6 division games (each rival home and away);
 *  - 4 against a whole division of its own conference (rotates every year, 3-year cycle);
 *  - 4 against a whole division of the other conference (4-year cycle);
 *  - 2 against the teams that finished in the same spot in the other two divisions of its conference;
 *  - 1 against the same-spot team of another division of the other conference.
 * Home games: 8 or 9 each. One bye per team in weeks 5-12 (four teams a week).
 */
import { createRng, type Rng } from '../sim/rng';

export const SEASON_WEEKS = 18;
export const GAMES_PER_TEAM = 17;
/** Bye weeks: four teams each in weeks 5-12 (1-based). */
export const BYE_FIRST_WEEK = 5;
export const BYES_PER_WEEK = 4;

/** What the schedule needs to know about a team: where it plays (its id = its index in the list). */
export interface SeasonTeam {
  conference: number;
  division: number;
}

export interface SeasonGame {
  id: number;
  /** 1-18; 19-22 = the playoffs (4e). */
  week: number;
  home: number;
  away: number;
  /** Final score [home, away], once played. */
  score?: [number, number];
  /** Overtime periods played (0 = none). */
  ot?: number;
  /** 4e: a playoff game (1 = Wild Card ... 4 = Championship). Never counts in the standings. */
  round?: number;
  /** 4e: the Championship is on a neutral field (no home edge). */
  neutral?: true;
}

export interface Season {
  /** 1 = the first season of this save. */
  year: number;
  /** Fixes this season's schedule and every simmed game's dice. */
  seed: number;
  /** The week being played (1-18); past the last week once the regular season is over. */
  week: number;
  games: SeasonGame[];
  /** Where each team finished in its division last season (0 = first): the same-spot games. */
  places: number[];
  /** 4e: each conference's playoff seeds (team ids, 1 seed first), once the playoffs start. */
  seeds?: number[][];
}

const PAIRINGS: [number, number][][] = [
  [
    [0, 1],
    [2, 3],
  ],
  [
    [0, 2],
    [1, 3],
  ],
  [
    [0, 3],
    [1, 2],
  ],
];

/** Mixed into the save's seed (and the year) for a season's own dice. */
export const SEASON_SALT = 0x5ea5011;

export function seasonSeed(saveSeed: number, year: number): number {
  return (saveSeed ^ SEASON_SALT ^ Math.imul(year, 0x9e3779b1)) >>> 0;
}

/** The teams of each division, [conference][division] = team ids in id order. */
function divisionsOf(teams: readonly SeasonTeam[]): number[][][] {
  const d: number[][][] = [0, 1].map(() => [0, 1, 2, 3].map(() => []));
  teams.forEach((t, id) => d[t.conference][t.division].push(id));
  return d;
}

interface Pair {
  home: number;
  away: number;
  /** Division games keep their home side; the rest can be flipped to balance home games. */
  fixed: boolean;
}

/** Every game of the season (who, and who's home), before weeks are picked. */
export function seasonPairs(teams: readonly SeasonTeam[], places: readonly number[], year: number): Pair[] {
  const div = divisionsOf(teams);
  const pairs: Pair[] = [];
  const y = year - 1;
  const atPlace = (c: number, d: number, place: number) => div[c][d].find((id) => places[id] === place)!;
  for (let c = 0; c < 2; c++)
    for (let d = 0; d < 4; d++) {
      const ids = div[c][d];
      // Division: each rival twice, once at each place.
      for (let i = 0; i < 4; i++)
        for (let j = i + 1; j < 4; j++) {
          pairs.push({ home: ids[i], away: ids[j], fixed: true }, { home: ids[j], away: ids[i], fixed: true });
        }
    }
  // A whole division vs a whole division: each team two at home, two away.
  const fullVs = (a: number[], b: number[]) => {
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++) {
        const aHome = (i + j + y) % 2 === 0;
        pairs.push({ home: aHome ? a[i] : b[j], away: aHome ? b[j] : a[i], fixed: false });
      }
  };
  const pairing = PAIRINGS[y % 3];
  for (let c = 0; c < 2; c++) for (const [a, b] of pairing) fullVs(div[c][a], div[c][b]);
  for (let d = 0; d < 4; d++) fullVs(div[0][d], div[1][(d + y) % 4]);
  // Same spot, own conference: the two divisions it doesn't play in full.
  for (let c = 0; c < 2; c++) {
    const [p, q] = pairing; // p = [a, b], q = [c, d]: a and b each play c's and d's same-spot teams
    for (const a of p)
      for (const b of q)
        for (let place = 0; place < 4; place++) {
          const x = atPlace(c, a, place);
          const z = atPlace(c, b, place);
          pairs.push({ home: x, away: z, fixed: false });
        }
  }
  // Same spot, other conference: a division it doesn't play in full.
  for (let d = 0; d < 4; d++)
    for (let place = 0; place < 4; place++) {
      pairs.push({ home: atPlace(0, d, place), away: atPlace(1, (d + y + 1) % 4, place), fixed: false });
    }
  balanceHome(pairs, teams.length);
  return pairs;
}

/** Flips non-division games along chains until every team has 8 or 9 home games. */
function balanceHome(pairs: Pair[], n: number) {
  const home = new Array(n).fill(0);
  pairs.forEach((p) => home[p.home]++);
  const hi = Math.ceil(GAMES_PER_TEAM / 2); // 9
  const lo = Math.floor(GAMES_PER_TEAM / 2); // 8
  // Reverse a chain of hosted games from a team with too many home games to one with room (or the
  // other way): only the two ends change.
  const fix = (from: number, isEnd: (t: number) => boolean, forward: boolean) => {
    const prev = new Map<number, number>(); // team -> index of the pair used to reach it
    const queue = [from];
    const seen = new Set([from]);
    while (queue.length) {
      const u = queue.shift()!;
      for (let k = 0; k < pairs.length; k++) {
        const p = pairs[k];
        if (p.fixed) continue;
        const [a, b] = forward ? [p.home, p.away] : [p.away, p.home];
        if (a !== u || seen.has(b)) continue;
        seen.add(b);
        prev.set(b, k);
        if (isEnd(b)) {
          // Walk back, flipping each game on the way.
          let v = b;
          while (v !== from) {
            const q = pairs[prev.get(v)!];
            const back = forward ? q.home : q.away;
            [q.home, q.away] = [q.away, q.home];
            v = back;
          }
          home[from] += forward ? -1 : 1;
          home[b] += forward ? 1 : -1;
          return true;
        }
        queue.push(b);
      }
    }
    return false;
  };
  for (let guard = 0; guard < 200; guard++) {
    const over = home.findIndex((h) => h > hi);
    if (over >= 0 && fix(over, (t) => home[t] < hi, true)) continue;
    const under = home.findIndex((h) => h < lo);
    if (under >= 0 && fix(under, (t) => home[t] > lo, false)) continue;
    break;
  }
}

/**
 * Puts every game in a week: each team plays once a week except its bye. Week by week, a matching
 * of the remaining games (the team with the fewest options first, backtracking); if a week can't be
 * filled the whole thing starts again with fresh dice. Builds `SCHEDULE_TRIES` full schedules and
 * keeps the one with the fewest division rematches coming soon after the first game.
 */
export function assignWeeks(pairs: readonly Pair[], n: number, rng: Rng): number[] {
  let best: number[] | null = null;
  let bestSoon = Infinity;
  let found = 0;
  for (let attempt = 0; attempt < 400 && found < SCHEDULE_TRIES && bestSoon > 0; attempt++) {
    const weeks = tryAssign(pairs, n, rng);
    if (!weeks) continue;
    found++;
    const soon = soonRematches(pairs, weeks);
    if (soon < bestSoon) {
      best = weeks;
      bestSoon = soon;
    }
  }
  if (!best) throw new Error('Could not build a schedule');
  return best;
}

/** How many full schedules to build and pick the best of. */
const SCHEDULE_TRIES = 8;

/** Division rematches played fewer than REMATCH_GAP weeks after the first meeting. */
function soonRematches(pairs: readonly Pair[], weeks: readonly number[]): number {
  const first = new Map<number, number>();
  let soon = 0;
  pairs.forEach((p, k) => {
    if (!p.fixed) return;
    const key = pairKey(p.home, p.away);
    const w = first.get(key);
    if (w === undefined) first.set(key, weeks[k]);
    else if (Math.abs(w - weeks[k]) < REMATCH_GAP) soon++;
  });
  return soon;
}

function tryAssign(pairs: readonly Pair[], n: number, rng: Rng): number[] | null {
  const order = Array.from({ length: n }, (_, i) => i);
  shuffle(order, rng);
  const byeWeek = new Array(n).fill(0);
  order.forEach((t, i) => (byeWeek[t] = BYE_FIRST_WEEK + Math.floor(i / BYES_PER_WEEK)));
  const weekOf = new Array(pairs.length).fill(0);
  const left = new Set(pairs.map((_, k) => k));
  const metWeek = new Map<number, number>();
  for (let w = 1; w <= SEASON_WEEKS; w++) {
    const playing = order.filter((t) => byeWeek[t] !== w);
    const options = new Map<number, number[]>();
    playing.forEach((t) => options.set(t, []));
    for (const k of left) {
      const p = pairs[k];
      if (options.has(p.home) && options.has(p.away)) {
        options.get(p.home)!.push(k);
        options.get(p.away)!.push(k);
      }
    }
    // A division rematch soon after the first meeting goes last: only when nothing else fits.
    const soon = (k: number) => {
      const met = metWeek.get(pairKey(pairs[k].home, pairs[k].away));
      return met !== undefined && w - met < REMATCH_GAP ? 1 : 0;
    };
    options.forEach((ks) => {
      shuffle(ks, rng);
      ks.sort((a, b) => soon(a) - soon(b));
    });
    const chosen: number[] = [];
    const used = new Set<number>();
    let steps = 0;
    const match = (): boolean => {
      if (++steps > 4000) return false;
      let best = -1;
      let bestCount = Infinity;
      for (const t of playing) {
        if (used.has(t)) continue;
        const c = options.get(t)!.filter((k) => !used.has(pairs[k].home) && !used.has(pairs[k].away)).length;
        if (c < bestCount) {
          bestCount = c;
          best = t;
        }
      }
      if (best < 0) return true;
      if (bestCount === 0) return false;
      for (const k of options.get(best)!) {
        const p = pairs[k];
        if (used.has(p.home) || used.has(p.away)) continue;
        used.add(p.home);
        used.add(p.away);
        chosen.push(k);
        if (match()) return true;
        chosen.pop();
        used.delete(p.home);
        used.delete(p.away);
      }
      return false;
    };
    if (!match()) return null;
    for (const k of chosen) {
      weekOf[k] = w;
      left.delete(k);
      metWeek.set(pairKey(pairs[k].home, pairs[k].away), w);
    }
  }
  return left.size === 0 ? weekOf : null;
}

/** Division rivals meet twice: this many weeks apart or more whenever the schedule allows. */
export const REMATCH_GAP = 4;
const pairKey = (a: number, b: number) => Math.min(a, b) * 64 + Math.max(a, b);

function shuffle<T>(a: T[], rng: Rng) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}

/** Random division places for a first season (each division 0-3 in some order). */
export function randomPlaces(teams: readonly SeasonTeam[], rng: Rng): number[] {
  const places = new Array(teams.length).fill(0);
  for (const conf of divisionsOf(teams))
    for (const ids of conf) {
      const p = [0, 1, 2, 3];
      shuffle(p, rng);
      ids.forEach((id, i) => (places[id] = p[i]));
    }
  return places;
}

/** A new season: its schedule (from `seed`), week 1. `places` = last season's finish (random for year 1). */
export function newSeason(teams: readonly SeasonTeam[], year: number, seed: number, places?: readonly number[]): Season {
  const rng = createRng(seed);
  const pl = places ? [...places] : randomPlaces(teams, rng);
  const pairs = seasonPairs(teams, pl, year);
  const weeks = assignWeeks(pairs, teams.length, rng);
  const games = pairs
    .map((p, k) => ({ week: weeks[k], home: p.home, away: p.away }))
    .sort((a, b) => a.week - b.week || a.home - b.home)
    .map((g, id) => ({ id, ...g }));
  return { year, seed, week: 1, games, places: pl };
}

export function gamesInWeek(s: Season, week: number): SeasonGame[] {
  return s.games.filter((g) => g.week === week);
}

/** A team's game this week, or null (its bye). */
export function teamGame(s: Season, teamId: number, week = s.week): SeasonGame | null {
  return s.games.find((g) => g.week === week && (g.home === teamId || g.away === teamId)) ?? null;
}

export function teamSchedule(s: Season, teamId: number): SeasonGame[] {
  return s.games.filter((g) => g.home === teamId || g.away === teamId);
}

export function isOver(s: Season): boolean {
  return s.week > SEASON_WEEKS;
}

/** The dice for one game of the season (fixed: the same game always plays out the same). */
export function gameSeed(s: Season, gameId: number): number {
  return (s.seed ^ Math.imul(gameId + 1, 0x85ebca6b)) >>> 0;
}

/** A copy of the season with one game's final score. */
export function recordResult(s: Season, gameId: number, score: [number, number], ot = 0): Season {
  return { ...s, games: s.games.map((g) => (g.id === gameId ? { ...g, score, ot } : g)) };
}

/** On to the next week (once every game of this one has a score). */
export function advanceWeek(s: Season): Season {
  return { ...s, week: s.week + 1 };
}

// ---------- Standings ----------

export interface Record3 {
  w: number;
  l: number;
  t: number;
}

export interface StandingRow {
  teamId: number;
  w: number;
  l: number;
  t: number;
  /** Ties count as half a win. */
  pct: number;
  pf: number;
  pa: number;
  div: Record3;
  conf: Record3;
  /** e.g. W3 / L1 / T1 / - (no games yet). */
  streak: string;
}

const pctOf = (r: Record3) => (r.w + r.l + r.t === 0 ? 0 : (r.w + r.t / 2) / (r.w + r.l + r.t));

/** Every team's record so far (ids in order). */
export function standingRows(s: Season, teams: readonly SeasonTeam[]): StandingRow[] {
  const rows: StandingRow[] = teams.map((_, teamId) => ({ teamId, w: 0, l: 0, t: 0, pct: 0, pf: 0, pa: 0, div: { w: 0, l: 0, t: 0 }, conf: { w: 0, l: 0, t: 0 }, streak: '-' }));
  const last: string[][] = teams.map(() => []);
  for (const g of [...s.games].sort((a, b) => a.week - b.week)) {
    if (!g.score || g.round) continue; // playoff games don't count
    const [hs, as] = g.score;
    const sameDiv = teams[g.home].conference === teams[g.away].conference && teams[g.home].division === teams[g.away].division;
    const sameConf = teams[g.home].conference === teams[g.away].conference;
    for (const [me, mine, theirs] of [
      [g.home, hs, as],
      [g.away, as, hs],
    ] as const) {
      const r = rows[me];
      r.pf += mine;
      r.pa += theirs;
      const k = mine > theirs ? 'w' : mine < theirs ? 'l' : 't';
      r[k]++;
      if (sameDiv) r.div[k]++;
      if (sameConf) r.conf[k]++;
      last[me].push(k.toUpperCase());
    }
  }
  rows.forEach((r, i) => {
    r.pct = pctOf(r);
    const l = last[i];
    if (l.length) {
      let n = 1;
      while (n < l.length && l[l.length - 1 - n] === l[l.length - 1]) n++;
      r.streak = `${l[l.length - 1]}${n}`;
    }
  });
  return rows;
}

/** Head-to-head record of `team` against the teams in `group` (played games only). */
function headToHead(s: Season, team: number, group: readonly number[]): Record3 {
  const r = { w: 0, l: 0, t: 0 };
  for (const g of s.games) {
    if (!g.score || g.round) continue;
    const opp = g.home === team ? g.away : g.away === team ? g.home : -1;
    if (opp < 0 || !group.includes(opp)) continue;
    const [mine, theirs] = g.home === team ? g.score : [g.score[1], g.score[0]];
    r[mine > theirs ? 'w' : mine < theirs ? 'l' : 't']++;
  }
  return r;
}

/**
 * Orders teams by record, then (among teams tied on win %): head-to-head among the tied teams,
 * division record, conference record, points difference, then a fixed coin flip from the season's seed.
 */
export function rankTeams(s: Season, rows: readonly StandingRow[], ids: readonly number[]): number[] {
  const byPct = new Map<number, number[]>();
  for (const id of ids) {
    const k = Math.round(rows[id].pct * 1e6);
    byPct.set(k, [...(byPct.get(k) ?? []), id]);
  }
  const coin = (id: number) => (Math.imul(s.seed ^ (id + 1), 0x27d4eb2d) >>> 0) / 2 ** 32;
  return [...byPct.entries()]
    .sort((a, b) => b[0] - a[0])
    .flatMap(([, group]) => {
      if (group.length === 1) return group;
      const key = (id: number) => [pctOf(headToHead(s, id, group)), pctOf(rows[id].div), pctOf(rows[id].conf), rows[id].pf - rows[id].pa, coin(id)];
      return [...group].sort((a, b) => {
        const ka = key(a);
        const kb = key(b);
        for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return kb[i] - ka[i];
        return a - b;
      });
    });
}

/** One division's standings, best first. */
export function divisionStandings(s: Season, teams: readonly SeasonTeam[], conference: number, division: number, rows = standingRows(s, teams)): StandingRow[] {
  const ids = teams.map((t, id) => ({ t, id })).filter((x) => x.t.conference === conference && x.t.division === division).map((x) => x.id);
  return rankTeams(s, rows, ids).map((id) => rows[id]);
}

/** Where each team finished in its division (0 = first): next season's same-spot games. */
export function finalPlaces(s: Season, teams: readonly SeasonTeam[]): number[] {
  const rows = standingRows(s, teams);
  const places = new Array(teams.length).fill(0);
  for (let c = 0; c < 2; c++) for (let d = 0; d < 4; d++) divisionStandings(s, teams, c, d, rows).forEach((r, i) => (places[r.teamId] = i));
  return places;
}

/** "10-6-1" (the tie part only when there are ties). */
export function recordText(r: Record3): string {
  return r.t ? `${r.w}-${r.l}-${r.t}` : `${r.w}-${r.l}`;
}

/** A season from storage, or null if it's damaged (a new one is made then). */
export function sanitizeSeason(raw: unknown, teamCount: number): Season | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const s = raw as Record<string, unknown>;
  const int = (v: unknown, min: number, max = Infinity) => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
  // Weeks 19-22 are the playoffs (4e); 23 = the season is finished.
  if (!int(s.year, 1) || !int(s.seed, 0) || !int(s.week, 1, SEASON_WEEKS + 5) || !Array.isArray(s.games) || !Array.isArray(s.places)) return null;
  if (s.places.length !== teamCount || !s.places.every((p) => int(p, 0, 3))) return null;
  const games: SeasonGame[] = [];
  for (const [i, g] of (s.games as unknown[]).entries()) {
    if (typeof g !== 'object' || g === null) return null;
    const x = g as Record<string, unknown>;
    const playoff = x.round !== undefined;
    if (playoff && (!int(x.round, 1, 4) || x.week !== SEASON_WEEKS + (x.round as number))) return null;
    if (x.id !== i || !int(x.week, 1, playoff ? SEASON_WEEKS + 4 : SEASON_WEEKS) || !int(x.home, 0, teamCount - 1) || !int(x.away, 0, teamCount - 1) || x.home === x.away) return null;
    const game: SeasonGame = { id: i, week: x.week as number, home: x.home as number, away: x.away as number };
    if (playoff) game.round = x.round as number;
    if (playoff && x.neutral === true) game.neutral = true;
    if (x.score !== undefined) {
      if (!Array.isArray(x.score) || x.score.length !== 2 || !x.score.every((v) => int(v, 0))) return null;
      game.score = [x.score[0], x.score[1]];
      game.ot = int(x.ot, 0) ? (x.ot as number) : 0;
    }
    games.push(game);
  }
  if (games.filter((g) => !g.round).length !== (teamCount * GAMES_PER_TEAM) / 2 || games.length > (teamCount * GAMES_PER_TEAM) / 2 + 13) return null;
  const out: Season = { year: s.year as number, seed: s.seed as number, week: s.week as number, games, places: s.places as number[] };
  if (Array.isArray(s.seeds) && s.seeds.length === 2 && s.seeds.every((c) => Array.isArray(c) && c.length === 6 && c.every((t) => int(t, 0, teamCount - 1))))
    out.seeds = (s.seeds as number[][]).map((c) => [...c]);
  else if (games.some((g) => g.round)) return null; // playoff games without seeds: damaged
  return out;
}
