/**
 * The players a simulated game needs from each team (3g-A), and the drive nudges for a matchup.
 * Pure logic. Only these players count for now (the same ones as on the arcade field); 11-on-11
 * (step 3h) adds the tight end and the rest through the lineup lists.
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

/** [a on offense vs b's defense, b on offense vs a's defense]. */
export function matchupMods(a: SimTeam, b: SimTeam, f: ModFeel): [DriveMods, DriveMods] {
  const base = { kicking: f.kicking, punting: f.punting };
  return [driveMods(a, b.defense, base, f.ratings), driveMods(b, a.defense, base, f.ratings)];
}
