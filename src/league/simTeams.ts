/**
 * The players a simulated game needs from each team (3g-A), and the drive nudges for a matchup.
 * Pure logic. The same 11-on-11 as the arcade field (3h-d): QB, RB, TE, 3 WR, 5 OL vs 3 CB, 2 LB,
 * 2 S, 4 DL, plus the kicker and punter.
 */
import type { League } from './league';
import { defenseLineup, kickingUnit, offenseLineup, type DefenseLineup, type KickingUnit, type OffenseLineup } from './lineup';
import { driveMods, type DriveMods, type SimRatingParams } from '../sim/driveRatings';
import type { KickRules } from '../sim/kicking';
import type { PuntRules } from '../sim/punting';

export interface SimTeam {
  offense: OffenseLineup;
  defense: DefenseLineup;
  kicking: KickingUnit;
}

export function simTeam(league: League, teamId: number): SimTeam {
  return { offense: offenseLineup(league, teamId), defense: defenseLineup(league, teamId), kicking: kickingUnit(league, teamId) };
}

interface ModFeel {
  ratings: SimRatingParams;
  kicking: KickRules;
  punting: PuntRules;
}

/** [a on offense vs b's defense, b on offense vs a's defense]. `home` = which of the two is at home (null = neutral field). */
export function matchupMods(a: SimTeam, b: SimTeam, f: ModFeel, home: 0 | 1 | null = null): [DriveMods, DriveMods] {
  const base = { kicking: f.kicking, punting: f.punting };
  const h = home === null ? 0 : home === 0 ? 1 : -1;
  return [driveMods(a, b.defense, base, f.ratings, h), driveMods(b, a.defense, base, f.ratings, -h)];
}
