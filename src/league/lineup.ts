/**
 * Who is on the field for a pass or run play (Stage 3d), from each team's depth chart. Pure logic.
 *
 * Our formation's skill spots are [wide top, slot top, wide bottom, RB] (formation.ts): WR1 plays
 * wide top, WR3 the slot, WR2 wide bottom. Their corners line up the same way: CB1 on WR1, CB3
 * (the nickel) on the slot, CB2 on WR2; LB1 covers the RB; S1 is the deep safety.
 * The lines (3h-a): our five blockers top to bottom = LT (OL1), LG (OL4), C (OL3), RG (OL5),
 * RT (OL2); their four rushers top to bottom = edge (DL1), inside (DL3), inside (DL4), edge (DL2).
 * The tight end (TE1, 3h-b) is skill spot 4, covered by LB2. Until 3h-c the second safety isn't on the field.
 */
import { depthChart, type League } from './league';
import type { Player } from '../players/player';

export interface OffenseLineup {
  qb: Player;
  /** In formation order: wide top, slot top, wide bottom, RB, TE (same as `formation().skill`). */
  skill: [Player, Player, Player, Player, Player];
  /** Our five blockers in formation order (top to bottom); `BLOCKER_OF[i]` blocks their rusher i. */
  line: [Player, Player, Player, Player, Player];
}

export interface DefenseLineup {
  /** Covering skill spots 0-4: the three corners, LB1 (on the RB) and LB2 (on the TE). */
  cover: [Player, Player, Player, Player, Player];
  safety: Player;
  /** The four rushers in formation order (top to bottom): they chase the ball carrier once free of their blocks. */
  rush: [Player, Player, Player, Player];
}

export function offenseLineup(league: League, teamId: number): OffenseLineup {
  const c = depthChart(league, teamId);
  return { qb: c.QB[0].player, skill: [c.WR[0].player, c.WR[2].player, c.WR[1].player, c.RB[0].player, c.TE[0].player], line: [c.OL[0].player, c.OL[3].player, c.OL[2].player, c.OL[4].player, c.OL[1].player] };
}

export function defenseLineup(league: League, teamId: number): DefenseLineup {
  const c = depthChart(league, teamId);
  return { cover: [c.CB[0].player, c.CB[2].player, c.CB[1].player, c.LB[0].player, c.LB[1].player], safety: c.S[0].player, rush: [c.DL[0].player, c.DL[2].player, c.DL[3].player, c.DL[1].player] };
}

/** The team's starting kicker and punter (K1, P1). */
export interface KickingUnit {
  k: Player;
  p: Player;
}

export function kickingUnit(league: League, teamId: number): KickingUnit {
  const c = depthChart(league, teamId);
  return { k: c.K[0].player, p: c.P[0].player };
}
