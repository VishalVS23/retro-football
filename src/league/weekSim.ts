/**
 * Simulating a week of league games (Stage 4a). `simGames` is pure (tests and the worker run it);
 * `runWeekSims` sends the jobs to a Web Worker so the screen never stutters, and falls back to
 * running them right here if workers aren't available.
 *
 * Each game carries its own seed, so a game plays out the same wherever and whenever it's simmed.
 * The drive nudges (`mods`) are worked out on the main thread from the league; the worker only gets each
 * team's starters (for the box score, 4b), never the whole league. The rules come from the live `feel`
 * values (the ⚙ panel can change them).
 */
import { createRng } from '../sim/rng';
import { simulateGame, type Side } from '../sim/simGame';
import type { DriveMods } from '../sim/driveRatings';
import type { OppDriveRules } from '../sim/oppDrive';
import type { ClockRules } from '../sim/clock';
import { boxFromSim, CREDIT_SALT, type BoxScore } from './boxScore';
import type { StatUnit } from './playerStats';

export interface WeekJob {
  gameId: number;
  /** [home on offense vs away's defense, away on offense vs home's defense]. */
  mods: [DriveMods, DriveMods];
  seed: number;
  /** 4b: [home, away] team ids and starters, for the box score (left out = score only). */
  teams?: [number, number];
  units?: [StatUnit, StatUnit];
}

export interface WeekResult {
  gameId: number;
  /** [home, away]. */
  score: [number, number];
  ot: number;
  /** 4b: the box score (when the job had the teams' players). */
  box?: BoxScore;
}

export interface WeekRules {
  rules: OppDriveRules;
  clock: ClockRules;
}

/** Plays each game from the opening kickoff. Who receives first is the game's own coin flip. */
export function simGames(jobs: readonly WeekJob[], r: WeekRules): WeekResult[] {
  return jobs.map((j) => {
    const rng = createRng(j.seed);
    const receives: Side = rng.next() < 0.5 ? 0 : 1;
    const res = simulateGame({ mods: j.mods, rules: r.rules, clock: r.clock, receives }, rng);
    // Who did what: the credit dice are the game's own seed mixed with a salt (the score never depends on them).
    const box = j.teams && j.units ? boxFromSim(j.gameId, res, j.teams, j.units, createRng((j.seed ^ CREDIT_SALT) >>> 0)) : undefined;
    return { gameId: j.gameId, score: [res.score[0], res.score[1]], ot: res.ot, ...(box && { box }) };
  });
}

let worker: Worker | null = null;
let nextRequest = 1;

/** Sims the games in the background (a Web Worker); the same results as `simGames`. */
export function runWeekSims(jobs: WeekJob[], r: WeekRules): Promise<WeekResult[]> {
  if (!jobs.length) return Promise.resolve([]);
  try {
    worker ??= new Worker(new URL('./weekWorker.ts', import.meta.url), { type: 'module' });
  } catch {
    return Promise.resolve(simGames(jobs, r));
  }
  const w = worker;
  const id = nextRequest++;
  return new Promise((resolve) => {
    const done = (results: WeekResult[]) => {
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
      resolve(results);
    };
    const onMessage = (e: MessageEvent<{ id: number; results: WeekResult[] }>) => {
      if (e.data?.id === id) done(e.data.results);
    };
    // A worker that fails (e.g. blocked by the browser) never leaves the week stuck: sim it here instead.
    const onError = () => {
      worker = null;
      done(simGames(jobs, r));
    };
    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError);
    w.postMessage({ id, jobs, rules: r });
  });
}
