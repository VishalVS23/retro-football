/**
 * Box scores (Stage 4b): team stats, points by period and every player's line for one game, kept
 * for every game of the current season. Pure logic.
 */
import { addDrive, newSideStats, type SideStats } from '../sim/gameStats';
import type { SimGameResult } from '../sim/simGame';
import type { Rng } from '../sim/rng';
import { rateGame } from './gameRatings';
import type { SeasonSummary } from './playoffs';
import { addLine, creditSnaps, regroupLines, sanitizeLines, type Lines, type StatUnit } from './playerStats';
import { logScoring, sanitizeScoring, type ScoreInfo, type ScoringPlay } from '../story/scoring';

export interface TeamBox {
  teamId: number;
  stats: SideStats;
  /** Points per period: 0-3 = Q1-Q4, 4+ = overtime periods. */
  byPeriod: number[];
  lines: Lines;
  /** 4d: each starter's rating for this game, x10 (74 = 7.4). Missing in games played before 4d. */
  ratings?: Record<number, number>;
}

export interface BoxScore {
  gameId: number;
  /** [home, away]. */
  teams: [TeamBox, TeamBox];
  /** 5b: the scoring plays in order (sides as `teams`). Missing in games before 5b. */
  scoring?: ScoringPlay[];
}

/** Box scores of the season so far, by game id. */
export type BoxScores = Record<number, BoxScore>;

/** Mixed into a game's seed for the credit dice (never the game's own). */
export const CREDIT_SALT = 0x51ed27;

const emptyTeam = (teamId: number): TeamBox => ({ teamId, stats: newSideStats(), byPeriod: [0, 0, 0, 0], lines: {} });

/**
 * The box score of a simulated game (side 0 = home, side 1 = away, as the sim was given them).
 * `units` = each side's players; `rng` = the credit dice.
 */
export function boxFromSim(gameId: number, result: SimGameResult, teamIds: [number, number], units: [StatUnit, StatUnit], rng: Rng): BoxScore {
  const teams: [TeamBox, TeamBox] = [emptyTeam(teamIds[0]), emptyTeam(teamIds[1])];
  for (const e of result.log) {
    const me = teams[e.side];
    const other = (1 - e.side) as 0 | 1;
    const i = Math.max(0, e.period - 1);
    while (me.byPeriod.length <= i) me.byPeriod.push(0);
    while (teams[other].byPeriod.length <= i) teams[other].byPeriod.push(0);
    me.byPeriod[i] += e.points;
    if (e.drive) me.stats = addDrive(me.stats, e.drive);
  }
  const infos = creditLog([teams[0].lines, teams[1].lines], result.log, units, rng);
  return withRatings({ gameId, teams, scoring: logScoring(result.log, infos) }, units);
}

/** The box score with every starter's game rating added (4d; `units` in the box's team order). */
export function withRatings(box: BoxScore, units: [StatUnit, StatUnit]): BoxScore {
  const [a, b] = rateGame(box, units);
  return { ...box, teams: [{ ...box.teams[0], ratings: a }, { ...box.teams[1], ratings: b }] };
}

/**
 * Player credit for a sim log (whole games, and the simmed parts of a game the user plays: CPU
 * drives, SIM): side 0's lines first. Mutates `lines`.
 */
export function creditLog(lines: [Lines, Lines], log: SimGameResult['log'], units: [StatUnit, StatUnit], rng: Rng): (ScoreInfo | undefined)[] {
  // 5b: how each entry's points came (the drive's touchdown or field goal), for the scoring log.
  const infos: (ScoreInfo | undefined)[] = [];
  for (const e of log) {
    const other = (1 - e.side) as 0 | 1;
    const got: { info?: ScoreInfo } = {};
    if (e.drive) creditSnaps(lines[e.side], lines[other], e.drive.snaps, units[e.side], units[other], rng, (x) => (got.info = x));
    else if (e.try?.kind === 'extraPoint')
      // A try on its own (after a touchdown scored before the sim took over).
      creditSnaps(lines[e.side], lines[other], [{ k: 'try', kind: 'extraPoint', good: e.try.good }], units[e.side], units[other], rng);
    infos.push(got.info);
  }
  return infos;
}

/**
 * 4b-1 saves filed defenders under the team with the ball: puts every player back in his own team's
 * box. `teamOf(id)` = the player's team id (undefined = unknown: left where he is).
 */
export function regroupBoxes(boxes: BoxScores, teamOf: (id: number) => number | undefined): BoxScores {
  const out: BoxScores = {};
  for (const [key, b] of Object.entries(boxes)) {
    const [h, a] = b.teams;
    const inH = new Set(Object.keys(h.lines).map(Number));
    const isHome = (id: number) => {
      const t = teamOf(id);
      return t === undefined ? inH.has(id) : t === h.teamId;
    };
    const [hl, al] = regroupLines(h.lines, a.lines, isHome);
    out[Number(key)] = { ...b, teams: [{ ...h, lines: hl }, { ...a, lines: al }] };
  }
  return out;
}

/** Everything the stats keep (4b): this season's box scores, and every past season's totals per player. */
export interface StatsStore {
  boxes: BoxScores;
  history: { year: number; lines: Lines }[];
  /** 4b-2: the box scores have every player in his own team's lines (missing = a 4b-1 save: regroup once). */
  grouped?: true;
  /** 4e: a short record of each finished season (champion, runner-up, the user's season). */
  seasons?: SeasonSummary[];
}

export const emptyStats = (): StatsStore => ({ boxes: {}, history: [], grouped: true });

/** Each player's totals for the season so far (from the box scores). */
export function seasonTotals(boxes: BoxScores): Lines {
  const out: Lines = {};
  for (const b of Object.values(boxes)) for (const t of b.teams) for (const [id, l] of Object.entries(t.lines)) out[Number(id)] = addLine(out[Number(id)] ?? {}, l);
  return out;
}

/** A finished season: its totals go into the history, its box scores are dropped (keeps the save small). */
export function closeSeasonStats(s: StatsStore, year: number): StatsStore {
  return { ...s, boxes: {}, history: [...s.history.filter((h) => h.year !== year), { year, lines: seasonTotals(s.boxes) }], grouped: true };
}

export function sanitizeStats(raw: unknown): StatsStore {
  if (typeof raw !== 'object' || raw === null) return emptyStats();
  const r = raw as Record<string, unknown>;
  const boxes = sanitizeBoxScores(r.boxes) ?? {};
  const history: StatsStore['history'] = [];
  if (Array.isArray(r.history))
    for (const h of r.history) {
      const lines = h && sanitizeLines((h as { lines: unknown }).lines);
      const year = h && (h as { year: unknown }).year;
      if (lines && typeof year === 'number' && Number.isInteger(year) && year >= 1) history.push({ year, lines });
    }
  const out: StatsStore = r.grouped === true ? { boxes, history, grouped: true } : { boxes, history };
  const seasons = sanitizeSummaries(r.seasons);
  if (seasons.length) out.seasons = seasons;
  return out;
}

export function sanitizeBoxScores(raw: unknown): BoxScores | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const out: BoxScores = {};
  const int = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0;
  for (const [key, b] of Object.entries(raw as Record<string, unknown>)) {
    const box = b as BoxScore | null;
    if (!int(Number(key)) || !box || box.gameId !== Number(key) || !Array.isArray(box.teams) || box.teams.length !== 2) return null;
    const teams: TeamBox[] = [];
    for (const t of box.teams) {
      const lines = t && sanitizeLines(t.lines);
      if (!t || !int(t.teamId) || !lines || !Array.isArray(t.byPeriod) || !t.byPeriod.every(int) || typeof t.stats !== 'object' || t.stats === null) return null;
      const s = t.stats as unknown as Record<string, unknown>;
      const keys: (keyof SideStats)[] = ['plays', 'passYards', 'rushYards', 'firstDowns', 'turnovers', 'sacked'];
      if (!keys.every((k) => typeof s[k] === 'number')) return null;
      const team: TeamBox = { teamId: t.teamId, stats: { ...(t.stats as SideStats) }, byPeriod: [...t.byPeriod], lines };
      const ratings = sanitizeRatings((t as { ratings?: unknown }).ratings);
      if (ratings) team.ratings = ratings;
      teams.push(team);
    }
    out[box.gameId] = { gameId: box.gameId, teams: [teams[0], teams[1]] };
    const scoring = sanitizeScoring((box as { scoring?: unknown }).scoring);
    if (scoring) out[box.gameId].scoring = scoring;
  }
  return out;
}

/** Ratings by player id (x10, whole numbers 30-100); anything else = none. */
function sanitizeRatings(raw: unknown): Record<number, number> | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const out: Record<number, number> = {};
  for (const [id, r] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^\d+$/.test(id) || typeof r !== 'number' || !Number.isInteger(r) || r < 0 || r > 100) return null;
    out[Number(id)] = r;
  }
  return out;
}

/** Season records from storage (4e): any damaged entry is dropped. */
function sanitizeSummaries(raw: unknown): SeasonSummary[] {
  if (!Array.isArray(raw)) return [];
  const int = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0;
  const results = ['champion', 'runnerUp', 1, 2, 3, 'missed', 'alive'];
  return raw.filter(
    (x): x is SeasonSummary =>
      typeof x === 'object' &&
      x !== null &&
      int(x.year) &&
      int(x.champion) &&
      int(x.runnerUp) &&
      Array.isArray(x.score) &&
      x.score.length === 2 &&
      x.score.every(int) &&
      int(x.ot) &&
      int(x.userTeam) &&
      typeof x.userRecord === 'string' &&
      results.includes(x.userResult),
  ).map((x) => ({ ...x, score: [x.score[0], x.score[1]] }));
}
