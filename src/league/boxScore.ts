/**
 * Box scores (Stage 4b): team stats, points by period and every player's line for one game, kept
 * for every game of the current season. Pure logic.
 */
import { addDrive, newSideStats, type SideStats } from '../sim/gameStats';
import type { SimGameResult } from '../sim/simGame';
import type { Rng } from '../sim/rng';
import { addLine, creditSnaps, sanitizeLines, type Lines, type StatUnit } from './playerStats';

export interface TeamBox {
  teamId: number;
  stats: SideStats;
  /** Points per period: 0-3 = Q1-Q4, 4+ = overtime periods. */
  byPeriod: number[];
  lines: Lines;
}

export interface BoxScore {
  gameId: number;
  /** [home, away]. */
  teams: [TeamBox, TeamBox];
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
    if (e.drive) {
      me.stats = addDrive(me.stats, e.drive);
      creditSnaps(me.lines, e.drive.snaps, units[e.side], units[other], rng);
    } else if (e.try?.kind === 'extraPoint') {
      // A try on its own (after a touchdown scored before the sim took over).
      creditSnaps(me.lines, [{ k: 'try', kind: 'extraPoint', good: e.try.good }], units[e.side], units[other], rng);
    }
  }
  return { gameId, teams };
}

/** Everything the stats keep (4b): this season's box scores, and every past season's totals per player. */
export interface StatsStore {
  boxes: BoxScores;
  history: { year: number; lines: Lines }[];
}

export const emptyStats = (): StatsStore => ({ boxes: {}, history: [] });

/** Each player's totals for the season so far (from the box scores). */
export function seasonTotals(boxes: BoxScores): Lines {
  const out: Lines = {};
  for (const b of Object.values(boxes)) for (const t of b.teams) for (const [id, l] of Object.entries(t.lines)) out[Number(id)] = addLine(out[Number(id)] ?? {}, l);
  return out;
}

/** A finished season: its totals go into the history, its box scores are dropped (keeps the save small). */
export function closeSeasonStats(s: StatsStore, year: number): StatsStore {
  return { boxes: {}, history: [...s.history.filter((h) => h.year !== year), { year, lines: seasonTotals(s.boxes) }] };
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
  return { boxes, history };
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
      teams.push({ teamId: t.teamId, stats: { ...(t.stats as SideStats) }, byPeriod: [...t.byPeriod], lines });
    }
    out[box.gameId] = { gameId: box.gameId, teams: [teams[0], teams[1]] };
  }
  return out;
}
