/**
 * A simulated game between two teams (Stage 3 step 3g): drives back and forth through four
 * quarters, halftime and college overtime, each drive rolled by the drive sim (oppDrive.ts) with that
 * offense-vs-defense matchup's nudges (driveRatings.ts). Pure logic, no Phaser.
 *
 * `simulateGame` plays a whole game from the opening kickoff (tests, the league in Stage 4).
 * `simulateFrom` carries on from any moment of a game (SIM TO END OF GAME, 3g-B): the score, the
 * clock, who has the ball and where (even mid-series), a try still to take, or mid-overtime.
 * The final score is never picked: it's whatever the drives add up to.
 *
 * Coordinates: each drive is worked out from the offense's side (`t`: its own goal line at
 * OWN_GOAL_X, the one it attacks at OPP_GOAL_X). simulateOppDrive takes and returns the DEFENSE's
 * frame (x = 120 - t), and its `ourStartX` is where the defense, now on offense, starts in its own frame.
 */
import { newClock, runOff, type ClockEvent, type ClockRules, type ClockState } from './clock';
import { EXTRA_POINT_POINTS, OWN_GOAL_X, OPP_GOAL_X, TWO_POINT_POINTS } from './drive';
import { TOTAL_LENGTH } from './field';
import { SHOOTOUT_PERIOD } from './overtime';
import { simulateOppDrive, type OppDrive, type OppDriveRules } from './oppDrive';
import { type DriveMods } from './driveRatings';
import type { Rng } from './rng';

export type Side = 0 | 1;

export interface SimRules {
  /** mods[s] = side s on offense against the other side's defense. */
  mods: [DriveMods, DriveMods];
  rules: OppDriveRules;
  clock: ClockRules;
}

export interface SimGameInput extends SimRules {
  /** Which side gets the ball first (the other side gets it to start the second half). */
  receives: Side;
}

/** A game in progress, from the simulator's point of view. */
export interface SimGameState {
  score: [number, number];
  /** Regulation clock; `ot` = the overtime period being played. */
  clock: ClockState;
  /** Timeouts left this half, per side. */
  timeouts: [number, number];
  /** Who has the ball, and where (its own frame). */
  offense: Side;
  startT: number;
  /** Mid-series: the down and the first-down line (its own frame). Left out = 1st & 10. */
  down?: number;
  firstDownT?: number;
  /** The offense just scored a touchdown and still has the try to take (from OFFENSE's point of view). */
  tryPending?: boolean;
  /** Who received the opening kickoff (the other side gets the ball after halftime). */
  receives: Side;
  /** Overtime: who goes first each period, and whether that side's possession this period is done. */
  otFirst?: Side;
  otFirstDone?: boolean;
}

/** Something that put points on the board (or could have): a drive, or a try on its own. */
export interface SimLogEntry {
  side: Side;
  /** 1-4 = quarters, 5+ = overtime periods (where the points go in the box score). */
  period: number;
  points: number;
  /** Left out for a try taken on its own (after a touchdown scored before the sim started) or a shootout 2-pt try. */
  drive?: OppDrive;
  try?: { kind: 'extraPoint' | 'twoPoint'; good: boolean };
}

export interface SimGameResult {
  score: [number, number];
  /** Overtime periods played (0 = none), counting any played before the sim started. */
  ot: number;
  log: SimLogEntry[];
  /** The clock at the end (0:00 in Q4, or the overtime period it ended in). */
  clock: ClockState;
}

export const SIM_START_T = OWN_GOAL_X + 25; // the offense's own 25 (no kickoffs: always a touchback)
export const SIM_OT_START_T = OPP_GOAL_X - 25; // overtime: their 25
const other = (s: Side): Side => (s === 0 ? 1 : 0);

/** The opening kickoff of a fresh game. */
export function freshGameState(receives: Side, cr: ClockRules): SimGameState {
  return { score: [0, 0], clock: newClock(cr), timeouts: [cr.timeoutsPerHalf, cr.timeoutsPerHalf], offense: receives, startT: SIM_START_T, receives };
}

/** Plays a whole game. Ties are settled in college overtime (each side a possession from the other's 25; from the 3rd OT a 2-pt shootout). */
export function simulateGame(input: SimGameInput, rng: Rng): SimGameResult {
  return simulateFrom(freshGameState(input.receives, input.clock), input, rng);
}

/** Carries a game on from `state` to the end. */
export function simulateFrom(state: SimGameState, input: SimRules, rng: Rng): SimGameResult {
  const { rules, clock: cr, mods } = input;
  const score: [number, number] = [...state.score];
  const timeouts: [number, number] = [...state.timeouts];
  const log: SimLogEntry[] = [];
  let clock: ClockState = { ...state.clock };
  let offense = state.offense;
  let startT = state.startT;
  let down = state.down;
  let firstDownT = state.firstDownT;
  let tryPending = !!state.tryPending;
  const period = () => (clock.ot ? 4 + clock.ot : clock.quarter);

  /** One possession from `fromT` (with any mid-series down carried in). */
  const runDrive = (side: Side, fromT: number): OppDrive => {
    const d = other(side);
    const ot = !!clock.ot;
    const drive = simulateOppDrive(
      TOTAL_LENGTH - fromT,
      {
        quarter: ot ? 5 : clock.quarter,
        timeLeft: ot ? 1e6 : clock.timeLeft,
        quarterLength: cr.quarterLength,
        us: score[d],
        them: score[side],
        overtime: ot,
        offenseTimeouts: ot ? 0 : timeouts[side],
        defenseTimeouts: ot ? 0 : timeouts[d],
        ...(down !== undefined ? { startDown: down } : {}),
        ...(firstDownT !== undefined ? { firstDownAtX: TOTAL_LENGTH - firstDownT } : {}),
      },
      rules,
      rng,
      mods[side],
    );
    down = undefined;
    firstDownT = undefined;
    score[side] += drive.points;
    timeouts[side] -= drive.timeoutsUsed.offense;
    timeouts[d] -= drive.timeoutsUsed.defense;
    return drive;
  };

  /** A try on its own: the neutral coach kicks, except in the shootout or when 2 are needed in overtime. */
  const takeTry = (side: Side) => {
    const margin = score[side] - score[other(side)]; // touchdown already counted
    const shootout = (clock.ot ?? 0) >= SHOOTOUT_PERIOD;
    const kind: 'extraPoint' | 'twoPoint' = shootout || (clock.ot && margin < -EXTRA_POINT_POINTS) ? 'twoPoint' : 'extraPoint';
    const good = rng.chance(kind === 'extraPoint' ? rules.extraPointChance : rules.twoPointChance);
    const points = good ? (kind === 'extraPoint' ? EXTRA_POINT_POINTS : TWO_POINT_POINTS) : 0;
    score[side] += points;
    log.push({ side, period: period(), points, try: { kind, good } });
  };

  // ---------- Regulation ----------
  if (!clock.ot) {
    for (let guard = 0; guard < 300; guard++) {
      let event: ClockEvent = null;
      if (tryPending) {
        tryPending = false;
        takeTry(offense);
        offense = other(offense);
        startT = SIM_START_T;
        // A touchdown on the last play of a quarter: the try comes first, then the break.
        if (clock.timeLeft <= 0) {
          const r = runOff(clock, 0, cr);
          clock = r.clock;
          event = r.event;
        }
      } else {
        const drive = runDrive(offense, startT);
        const r = runOff(clock, drive.seconds, cr);
        // Points belong to the quarter the drive ended in (the half / the game ends at 0:00 of Q2 / Q4).
        const endQuarter = r.event === 'halftime' ? 2 : r.event === 'final' ? 4 : r.clock.quarter;
        log.push({ side: offense, period: endQuarter, points: drive.points, drive });
        clock = r.clock;
        event = r.event;
        offense = other(offense);
        startT = drive.ourStartX;
      }
      if (event === 'final') break;
      if (event === 'halftime') {
        timeouts[0] = timeouts[1] = cr.timeoutsPerHalf;
        offense = other(state.receives);
        startT = SIM_START_T;
      }
    }
    if (score[0] !== score[1]) return { score, ot: 0, log, clock };
    clock = { ...clock, ot: 1, timeLeft: 0, running: false };
    offense = state.otFirst ?? state.receives;
    startT = SIM_OT_START_T;
  }

  // ---------- College overtime ----------
  const first = state.otFirst ?? state.receives;
  let firstDone = !!state.otFirstDone && clock.ot === state.clock.ot;
  for (let guard = 0; guard < 30; guard++) {
    const p = clock.ot!;
    const order: Side[] = firstDone ? [other(first)] : [first, other(first)];
    for (const side of order) {
      const startHere = side === offense ? startT : SIM_OT_START_T;
      if (tryPending && side === offense) {
        tryPending = false;
        takeTry(side);
      } else if (p >= SHOOTOUT_PERIOD) {
        takeTry(side);
      } else {
        const drive = runDrive(side, startHere);
        log.push({ side, period: 4 + p, points: drive.points, drive });
      }
      offense = other(side);
      startT = SIM_OT_START_T;
    }
    firstDone = false;
    if (score[0] !== score[1]) break;
    clock = { ...clock, ot: p + 1 };
    offense = first;
  }
  return { score, ot: clock.ot ?? 0, log, clock };
}
