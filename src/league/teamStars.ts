/**
 * 1-5 stars for every team by rank in the league: overall, offense and defense separately (the top
 * fifth gets 5, the bottom fifth 1). Shown on CHOOSE YOUR TEAM, the play-call bar and the CPU drive
 * summary so the user can tell how good the other team is. Pure logic.
 */
import { teamRatings, type League } from './league';

export interface TeamStars {
  overall: number;
  offense: number;
  defense: number;
}

/** Stars for each of `values` by rank (highest = 5). */
function byRank(values: number[]): number[] {
  const order = values.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v || a.i - b.i);
  const out = new Array<number>(values.length);
  order.forEach((o, rank) => (out[o.i] = 5 - Math.floor((rank * 5) / values.length)));
  return out;
}

/** Stars for every team, indexed by team id. */
export function teamStars(league: League): TeamStars[] {
  const r = league.teams.map((t) => teamRatings(league, t.id));
  const overall = byRank(r.map((x) => x.overall));
  const offense = byRank(r.map((x) => x.offense));
  const defense = byRank(r.map((x) => x.defense));
  return league.teams.map((_, i) => ({ overall: overall[i], offense: offense[i], defense: defense[i] }));
}

/** "***--" (the pixel font has no star glyph). */
export function starText(n: number): string {
  const k = Math.max(0, Math.min(5, Math.round(n)));
  return '*'.repeat(k) + '-'.repeat(5 - k);
}
