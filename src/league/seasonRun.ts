/**
 * Running the season's weeks (Stage 4a): the sim jobs for a week's games from the league, and
 * applying their results. Pure logic.
 */
import type { League } from './league';
import { matchupMods, simTeam, type SimTeam } from './simTeams';
import type { StatUnit } from './playerStats';
import type { BoxScores } from './boxScore';
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
  return matchupMods(simTeam(league, home), simTeam(league, away), f, 0);
}

/** The players a team has on the field, for the stats (4b). */
export function statUnit(t: SimTeam): StatUnit {
  return { off: t.offense, def: t.defense, kick: t.kicking };
}

/** Sim jobs for every game of `week` still without a score (the user's own game is left out while it's his to play). */
export function weekJobs(league: League, s: Season, week: number, f: ModFeel, skipTeam: number | null = null): WeekJob[] {
  return gamesInWeek(s, week)
    .filter((g) => !g.score && g.home !== skipTeam && g.away !== skipTeam)
    .map((g) => {
      const home = simTeam(league, g.home);
      const away = simTeam(league, g.away);
      return {
        gameId: g.id,
        mods: matchupMods(home, away, f, 0),
        seed: gameSeed(s, g.id),
        teams: [g.home, g.away] as [number, number],
        units: [statUnit(home), statUnit(away)] as [StatUnit, StatUnit],
      };
    });
}

export function applyResults(s: Season, results: readonly WeekResult[]): Season {
  return results.reduce((x, r) => recordResult(x, r.gameId, r.score, r.ot), s);
}

/** The week's box scores added to the season's (4b). */
export function addBoxes(boxes: BoxScores, results: readonly WeekResult[]): BoxScores {
  const out = { ...boxes };
  for (const r of results) if (r.box) out[r.gameId] = r.box;
  return out;
}
