/**
 * A whole simulated game between two teams (Stage 3 step 3g-A): drives back and forth through four
 * quarters, halftime and college overtime, each drive rolled by the drive sim (oppDrive.ts) with that
 * offense-vs-defense matchup's nudges (driveRatings.ts). Pure logic, no Phaser. Used by the tests to
 * check balance now, and by SIM TO END OF GAME (3g-B) and the league (Stage 4) later.
 *
 * The final score is never picked: it's whatever the drives add up to.
 *
 * Coordinates: each drive is worked out from the offense's side (`t`: its own goal line at
 * OWN_GOAL_X, the one it attacks at OPP_GOAL_X). simulateOppDrive takes and returns the DEFENSE's
 * frame (x = 120 - t), and its `ourStartX` is where the defense, now on offense, starts in its own frame.
 */
import { newClock, runOff, type ClockRules, type ClockState } from './clock';
import { OWN_GOAL_X, OPP_GOAL_X, TWO_POINT_POINTS } from './drive';
import { TOTAL_LENGTH } from './field';
import { SHOOTOUT_PERIOD } from './overtime';
import { simulateOppDrive, type OppDrive, type OppDriveRules } from './oppDrive';
import { NEUTRAL_MODS, type DriveMods } from './driveRatings';
import type { Rng } from './rng';

export type Side = 0 | 1;

export interface SimGameInput {
  /** mods[s] = side s on offense against the other side's defense. */
  mods: [DriveMods, DriveMods];
  rules: OppDriveRules;
  clock: ClockRules;
  /** Which side gets the ball first (the other side gets it to start the second half). */
  receives: Side;
}

export interface SimDriveLog {
  side: Side;
  quarter: number;
  ot: number;
  drive: OppDrive;
}

export interface SimGameResult {
  score: [number, number];
  /** Overtime periods played (0 = none). */
  ot: number;
  drives: SimDriveLog[];
}

const START_T = OWN_GOAL_X + 25; // the offense's own 25 (no kickoffs: always a touchback)
const OT_START_T = OPP_GOAL_X - 25; // overtime: their 25
const other = (s: Side): Side => (s === 0 ? 1 : 0);

/** Plays a whole game. Ties are settled in college overtime (each side a possession from the other's 25; from the 3rd OT a 2-pt shootout). */
export function simulateGame(input: SimGameInput, rng: Rng): SimGameResult {
  const { rules, clock: cr } = input;
  const mods = input.mods ?? [NEUTRAL_MODS, NEUTRAL_MODS];
  const score: [number, number] = [0, 0];
  const drives: SimDriveLog[] = [];
  const timeouts: [number, number] = [cr.timeoutsPerHalf, cr.timeoutsPerHalf];
  let clock: ClockState = newClock(cr);
  let offense: Side = input.receives;
  let startT = START_T;
  let secondHalfDone = false;

  const runDrive = (side: Side, fromT: number, ot: number) => {
    const d = other(side);
    const drive = simulateOppDrive(
      TOTAL_LENGTH - fromT,
      {
        quarter: ot ? 5 : clock.quarter,
        timeLeft: ot ? 1e6 : clock.timeLeft,
        quarterLength: cr.quarterLength,
        us: score[d],
        them: score[side],
        overtime: ot > 0,
        offenseTimeouts: ot ? 0 : timeouts[side],
        defenseTimeouts: ot ? 0 : timeouts[d],
      },
      rules,
      rng,
      mods[side],
    );
    score[side] += drive.points;
    timeouts[side] -= drive.timeoutsUsed.offense;
    timeouts[d] -= drive.timeoutsUsed.defense;
    drives.push({ side, quarter: ot ? 4 + ot : clock.quarter, ot, drive });
    return drive;
  };

  // Regulation.
  for (let guard = 0; guard < 200; guard++) {
    const drive = runDrive(offense, startT, 0);
    const r = runOff(clock, drive.seconds, cr);
    clock = r.clock;
    if (r.event === 'final') break;
    if (r.event === 'halftime' && !secondHalfDone) {
      secondHalfDone = true;
      timeouts[0] = timeouts[1] = cr.timeoutsPerHalf;
      offense = other(input.receives);
      startT = START_T;
      continue;
    }
    offense = other(offense);
    startT = drive.ourStartX;
  }

  // College overtime: the side that received first goes first each period.
  let ot = 0;
  while (score[0] === score[1] && ot < 20) {
    ot++;
    const first = input.receives;
    if (ot >= SHOOTOUT_PERIOD) {
      for (const s of [first, other(first)] as Side[]) if (rng.chance(rules.twoPointChance)) score[s] += TWO_POINT_POINTS;
      continue;
    }
    runDrive(first, OT_START_T, ot);
    runDrive(other(first), OT_START_T, ot);
  }
  return { score, ot, drives };
}
