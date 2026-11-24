/**
 * Stats screens (Stage 4c): league leaders, team totals, and one player's season, game log and past
 * seasons, all added up from the box scores. Pure logic.
 */
import type { Position } from '../players/positions';
import type { BoxScores, StatsStore } from './boxScore';
import type { Season } from './season';
import { addLine, type Lines, type PlayerLine, type StatKey } from './playerStats';

/** Leader categories, in the order the chips show them. */
export const LEADER_CATS: readonly { key: StatKey; label: string }[] = [
  { key: 'py', label: 'PASS YDS' },
  { key: 'ptd', label: 'PASS TD' },
  { key: 'ry', label: 'RUSH YDS' },
  { key: 'rtd', label: 'RUSH TD' },
  { key: 'rec', label: 'CATCHES' },
  { key: 'rcy', label: 'REC YDS' },
  { key: 'tk', label: 'TACKLES' },
  { key: 'sck', label: 'SACKS' },
  { key: 'dint', label: 'INT' },
  { key: 'fgm', label: 'FG MADE' },
];

/** Each player's totals for the season so far. */
export function playerTotals(boxes: BoxScores): Lines {
  const out: Lines = {};
  for (const b of Object.values(boxes)) for (const t of b.teams) for (const [id, l] of Object.entries(t.lines)) out[Number(id)] = addLine(out[Number(id)] ?? {}, l);
  return out;
}

/** The top `n` players in one stat (only players above 0; ties: lower id first, so it never flickers). */
export function leaders(totals: Lines, key: StatKey, n = 10): { id: number; value: number }[] {
  return Object.entries(totals)
    .map(([id, l]) => ({ id: Number(id), value: l[key] ?? 0 }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value || a.id - b.id)
    .slice(0, n);
}

export interface TeamTotals {
  teamId: number;
  games: number;
  pointsFor: number;
  pointsAgainst: number;
  yards: number;
  passYards: number;
  rushYards: number;
  yardsAllowed: number;
  /** Turnovers forced minus turnovers given away. */
  takeaways: number;
  giveaways: number;
  /** Sacks the defense made. */
  sacks: number;
}

/** Every team's totals from the box scores (`teamCount` teams, ids 0..n-1; a team with no games gets zeros). */
export function teamTotals(boxes: BoxScores, teamCount: number): TeamTotals[] {
  const out: TeamTotals[] = Array.from({ length: teamCount }, (_, teamId) => ({
    teamId,
    games: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    yards: 0,
    passYards: 0,
    rushYards: 0,
    yardsAllowed: 0,
    takeaways: 0,
    giveaways: 0,
    sacks: 0,
  }));
  const pts = (a: number[]) => a.reduce((x, y) => x + y, 0);
  for (const b of Object.values(boxes)) {
    for (let side = 0; side < 2; side++) {
      const me = b.teams[side];
      const them = b.teams[1 - side];
      const t = out[me.teamId];
      if (!t) continue;
      t.games++;
      t.pointsFor += pts(me.byPeriod);
      t.pointsAgainst += pts(them.byPeriod);
      t.passYards += me.stats.passYards;
      t.rushYards += me.stats.rushYards;
      t.yards += me.stats.passYards + me.stats.rushYards;
      t.yardsAllowed += them.stats.passYards + them.stats.rushYards;
      t.giveaways += me.stats.turnovers;
      t.takeaways += them.stats.turnovers;
      t.sacks += them.stats.sacked;
    }
  }
  return out;
}

export interface GameLogRow {
  week: number;
  opponent: number;
  home: boolean;
  /** Null = no stats that game (didn't play, or nothing to count). */
  line: PlayerLine | null;
}

/** A player's line in each game his team has played this season (with a box score), by week. */
export function gameLog(season: Season, boxes: BoxScores, playerId: number, teamId: number): GameLogRow[] {
  const rows: GameLogRow[] = [];
  for (const g of season.games) {
    if (!g.score || (g.home !== teamId && g.away !== teamId)) continue;
    const b = boxes[g.id];
    if (!b) continue;
    const mine = b.teams.find((t) => t.teamId === teamId);
    rows.push({ week: g.week, opponent: g.home === teamId ? g.away : g.home, home: g.home === teamId, line: mine?.lines[playerId] ?? null });
  }
  return rows.sort((a, b) => a.week - b.week);
}

/** A player's line in each past season he has stats for (oldest first). */
export function pastSeasons(stats: StatsStore, playerId: number): { year: number; line: PlayerLine }[] {
  return stats.history
    .filter((h) => h.lines[playerId])
    .map((h) => ({ year: h.year, line: h.lines[playerId] }))
    .sort((a, b) => a.year - b.year);
}

/** One column of a player's stat table: its header and how to show it from a line. */
export interface StatColumn {
  label: string;
  value: (l: PlayerLine) => string;
}

const n = (l: PlayerLine, k: StatKey) => l[k] ?? 0;
const col = (label: string, k: StatKey): StatColumn => ({ label, value: (l) => `${n(l, k)}` });
const avg = (a: number, b: number) => (b ? (a / b).toFixed(1) : '-');
const longest = (label: string, k: StatKey): StatColumn => ({ label, value: (l) => (l[k] !== undefined ? `${l[k]}` : '-') });

const PASSING: StatColumn[] = [
  { label: 'C/ATT', value: (l) => `${n(l, 'pc')}/${n(l, 'pa')}` },
  col('YDS', 'py'),
  col('TD', 'ptd'),
  col('INT', 'pint'),
  col('SK', 'sk'),
];
const RUSHING: StatColumn[] = [col('CAR', 'ra'), col('YDS', 'ry'), { label: 'AVG', value: (l) => avg(n(l, 'ry'), n(l, 'ra')) }, col('TD', 'rtd')];
const RECEIVING: StatColumn[] = [col('REC', 'rec'), col('TGT', 'tg'), col('YDS', 'rcy'), col('TD', 'rctd'), longest('LNG', 'rcl')];
const DEFENSE: StatColumn[] = [col('TK', 'tk'), col('SCK', 'sck'), col('INT', 'dint'), col('PD', 'pd'), col('FF', 'ff')];

/** The stat table that fits a position (none for linemen: no counting stats yet). */
export const PROFILE_COLUMNS: Record<Position, StatColumn[]> = {
  QB: [...PASSING, { label: 'RUSH', value: (l) => `${n(l, 'ry')}` }],
  RB: [...RUSHING, { label: 'REC', value: (l) => `${n(l, 'rec')}` }, { label: 'REC YDS', value: (l) => `${n(l, 'rcy')}` }],
  WR: RECEIVING,
  TE: RECEIVING,
  OL: [],
  DL: DEFENSE,
  LB: DEFENSE,
  CB: DEFENSE,
  S: DEFENSE,
  K: [{ label: 'FG', value: (l) => `${n(l, 'fgm')}/${n(l, 'fga')}` }, longest('LNG', 'fgl'), { label: 'XP', value: (l) => `${n(l, 'xpm')}/${n(l, 'xpa')}` }],
  P: [col('PUNTS', 'pu'), col('NET', 'puy'), { label: 'AVG', value: (l) => avg(n(l, 'puy'), n(l, 'pu')) }],
};
