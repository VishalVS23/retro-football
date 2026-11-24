/**
 * Running the season's weeks (Stage 4a): the sim jobs for a week's games from the league, and
 * applying their results. Pure logic.
 */
import type { League } from './league';
import { matchupMods, simTeam } from './simTeams';
import { gameSeed, gamesInWeek, recordResult, type Season } from './season';
import type { WeekJob, WeekResult } from './weekSim';
import type { DriveMods, SimRatingParams } from '../sim/driveRatings';
import type { KickRules } from '../sim/kicking';
import type { PuntRules } from '../sim/punting';

interface ModFeel {
  ratings: SimRatingParams;
  kicking: KickRules;
  punting: PuntRules;
}

/** The drive nudges for a game: [home on offense, away on offense]. */
export function gameMods(league: League, home: number, away: number, f: ModFeel): [DriveMods, DriveMods] {
  return matchupMods(simTeam(league, home), simTeam(league, away), f);
}

/** Sim jobs for every game of `week` still without a score (the user's own game is left out while it's his to play). */
export function weekJobs(league: League, s: Season, week: number, f: ModFeel, skipTeam: number | null = null): WeekJob[] {
  return gamesInWeek(s, week)
    .filter((g) => !g.score && g.home !== skipTeam && g.away !== skipTeam)
    .map((g) => ({ gameId: g.id, mods: gameMods(league, g.home, g.away, f), seed: gameSeed(s, g.id) }));
}

export function applyResults(s: Season, results: readonly WeekResult[]): Season {
  return results.reduce((x, r) => recordResult(x, r.gameId, r.score, r.ot), s);
}
