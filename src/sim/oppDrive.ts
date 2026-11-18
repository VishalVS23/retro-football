/**
 * A simulated opponent drive (Stage 2 step 6): a quick play-by-play dice sim, shown to the player
 * as a short summary. Simple on purpose; the real league sim comes in Stage 4 and team ratings
 * replace `strength` in Stage 3. Pure rules, no Phaser.
 *
 * Inside this file the opponent's drive is worked out in THEIR frame (`t`): they start at their own
 * goal side and drive toward +t, exactly like our offense in drive.ts. t = 120 - x (our coordinates).
 */
import { FIELD_GOAL_POINTS, OPP_GOAL_X, OWN_GOAL_X, TD_POINTS, YARDS_FOR_FIRST_DOWN, EXTRA_POINT_POINTS, type GameState } from './drive';
import { coachTip } from './fourthDown';
import { fieldGoalDistance } from './kicking';
import { TOTAL_LENGTH } from './field';
import type { Rng } from './rng';

export interface OppDriveRules {
  /** 1 = average offense. Scales every gain (later: their team ratings). */
  strength: number;
  /** Share of their plays that are runs. */
  runShare: number;
  /** Ordinary run: from a loss of runLossYards up to a gain of runMaxYards; a breakaway adds a big chunk. */
  runLossYards: number;
  runMaxYards: number;
  bigRunChance: number;
  /** Pass: incomplete, sack (loses sackMin..sackMax), else a catch for passMin..passMax; a big play adds a chunk. */
  incompleteChance: number;
  sackChance: number;
  sackMinYards: number;
  sackMaxYards: number;
  passMinYards: number;
  passMaxYards: number;
  bigPassChance: number;
  /** Extra yards on a breakaway run or big pass play. */
  bigPlayMinYards: number;
  bigPlayMaxYards: number;
  /** Turnovers: a pick on a pass attempt, a lost fumble on any run or catch. */
  interceptionChance: number;
  fumbleChance: number;
  /** Game seconds a play takes: ball carrier tackled in bounds (clock runs through the huddle) / incomplete. */
  playSeconds: number;
  incompleteSeconds: number;
  /** Field goals: furthest try (yards), and the make chance from `fgSureYards` (fgSureChance) down to max range (fgLongChance). */
  fgRangeYards: number;
  fgSureYards: number;
  fgSureChance: number;
  fgLongChance: number;
  /** Their extra point after a touchdown. */
  extraPointChance: number;
  /** Net punt (after their coverage and our return), yards. */
  puntNetMinYards: number;
  puntNetMaxYards: number;
}

export type OppDriveResult = 'touchdown' | 'fieldGoal' | 'missedFieldGoal' | 'punt' | 'interception' | 'fumble' | 'downs' | 'endOfHalf';

export interface OppDrive {
  result: OppDriveResult;
  plays: number;
  /** Net yards gained (from where they started to where the drive ended). */
  yards: number;
  /** Game seconds used. */
  seconds: number;
  /** Where they started and where the drive ended (the last line of scrimmage, or their touchdown), our x. */
  startX: number;
  endX: number;
  /** Where our next drive starts, our x. */
  ourStartX: number;
  /** Points they scored (touchdown + extra point, or field goal). */
  points: number;
  /** Only after a touchdown: did the extra point go in. */
  extraPointGood: boolean | null;
  /** Their longest gain, if it was a big one. */
  bigPlay: { kind: 'run' | 'pass'; yards: number } | null;
}

/** The game situation the drive starts in. Scores are from OUR side (us / them). */
export interface OppDriveSituation {
  quarter: number;
  /** Seconds left in the quarter. */
  timeLeft: number;
  quarterLength: number;
  us: number;
  them: number;
}

/** After a score the other side starts at its 25 (no kickoffs yet: always a touchback). */
export const KICKOFF_START_YARDS = 25;
/** Gains of at least this many yards get a "BIG PLAY" line on the summary. */
export const BIG_PLAY_YARDS = 20;

const toT = (x: number) => TOTAL_LENGTH - x;
const toX = (t: number) => TOTAL_LENGTH - t;
/** In their frame their own goal line is at OWN_GOAL_X and ours (where they score) at OPP_GOAL_X. */
const clampSpot = (t: number) => Math.min(OPP_GOAL_X - 1, Math.max(OWN_GOAL_X + 1, Math.round(t)));

/** Seconds left in the half (the drive can run from Q1 into Q2, never past halftime or the end). */
function halfSecondsLeft(sit: OppDriveSituation) {
  const odd = sit.quarter === 1 || sit.quarter === 3;
  return sit.timeLeft + (odd ? sit.quarterLength : 0);
}

/** Make chance of a field goal of `distance` yards. */
export function oppFieldGoalChance(distance: number, r: OppDriveRules): number {
  if (distance > r.fgRangeYards) return 0;
  if (distance <= r.fgSureYards) return r.fgSureChance;
  const u = (distance - r.fgSureYards) / Math.max(1, r.fgRangeYards - r.fgSureYards);
  return r.fgSureChance + (r.fgLongChance - r.fgSureChance) * u;
}

/** One opponent drive from `startX` (our coordinates). */
export function simulateOppDrive(startX: number, sit: OppDriveSituation, r: OppDriveRules, rng: Rng): OppDrive {
  const startT = clampSpot(toT(startX));
  let t = startT;
  let down = 1;
  let firstDownT = Math.min(t + YARDS_FOR_FIRST_DOWN, OPP_GOAL_X);
  let plays = 0;
  let seconds = 0;
  let bigPlay: OppDrive['bigPlay'] = null;
  const halfLeft = halfSecondsLeft(sit);
  const strength = Math.max(0.1, r.strength);

  const done = (result: OppDriveResult, endT: number, ourStartT: number, points = 0, extraPointGood: boolean | null = null): OppDrive => ({
    result,
    plays,
    yards: Math.round(endT - startT),
    seconds: Math.min(seconds, halfLeft),
    startX: toX(startT),
    endX: toX(endT),
    ourStartX: toX(ourStartT),
    points,
    extraPointGood,
    bigPlay,
  });
  // Our ball after they give it up at their-frame spot `t2` (in our end zone = touchback at our 20).
  const ourBallAt = (t2: number) => (t2 >= OPP_GOAL_X ? OPP_GOAL_X - 20 : clampSpot(t2));
  const kickoffToUs = OPP_GOAL_X - KICKOFF_START_YARDS; // our 25, in their frame

  for (;;) {
    if (seconds >= halfLeft) return done('endOfHalf', t, ourBallAt(t));

    // 4th down: the same rules of thumb as our coach (seen from their side of the field).
    if (down === 4) {
      const timeNow = sit.timeLeft - seconds;
      const asIfOurs: GameState = { ballX: t, down: 4, firstDownX: firstDownT, us: sit.them, them: sit.us, oppStartX: null, tryPending: false };
      const fgDist = fieldGoalDistance(t);
      const tip = coachTip({ match: asIfOurs, quarter: timeNow > 0 ? sit.quarter : sit.quarter + 1, timeLeft: timeNow > 0 ? timeNow : timeNow + sit.quarterLength, fgRange: fgDist <= r.fgRangeYards });
      if (tip?.choice === 'fieldGoal') {
        plays++;
        seconds += r.incompleteSeconds;
        if (rng.chance(oppFieldGoalChance(fgDist, r))) return done('fieldGoal', t, kickoffToUs, FIELD_GOAL_POINTS);
        // Missed: our ball at the spot of the kick, or our 20 if that's further out.
        return done('missedFieldGoal', t, Math.min(t - 7, OPP_GOAL_X - 20));
      }
      if (tip?.choice === 'punt') {
        plays++;
        seconds += r.incompleteSeconds;
        return done('punt', t, ourBallAt(t + rng.range(r.puntNetMinYards, r.puntNetMaxYards)));
      }
    }

    // A play.
    plays++;
    const run = rng.chance(r.runShare);
    let gain: number;
    let stops = false;
    if (run) {
      gain = rng.range(-r.runLossYards, r.runMaxYards) * strength;
      if (rng.chance(r.bigRunChance)) gain += rng.range(r.bigPlayMinYards, r.bigPlayMaxYards) * strength;
      if (rng.chance(r.fumbleChance)) {
        seconds += r.playSeconds;
        return done('fumble', t, ourBallAt(t + Math.max(0, gain)));
      }
    } else if (rng.chance(r.interceptionChance)) {
      seconds += r.incompleteSeconds;
      // Picked off somewhere downfield.
      return done('interception', t, ourBallAt(t + rng.range(5, 20)));
    } else if (rng.chance(r.sackChance)) {
      gain = -rng.range(r.sackMinYards, r.sackMaxYards);
    } else if (rng.chance(r.incompleteChance)) {
      gain = 0;
      stops = true;
    } else {
      gain = rng.range(r.passMinYards, r.passMaxYards) * strength;
      if (rng.chance(r.bigPassChance)) gain += rng.range(r.bigPlayMinYards, r.bigPlayMaxYards) * strength;
      if (rng.chance(r.fumbleChance)) {
        seconds += r.playSeconds;
        return done('fumble', t, ourBallAt(t + gain));
      }
    }
    seconds += stops ? r.incompleteSeconds : r.playSeconds;
    const counted = Math.round(Math.min(gain, OPP_GOAL_X - t)); // a gain only counts up to the goal line
    if (counted >= BIG_PLAY_YARDS && (!bigPlay || counted > bigPlay.yards)) bigPlay = { kind: run ? 'run' : 'pass', yards: counted };

    const next = t + gain;
    if (next >= OPP_GOAL_X) {
      const xp = rng.chance(r.extraPointChance);
      return done('touchdown', OPP_GOAL_X, kickoffToUs, TD_POINTS + (xp ? EXTRA_POINT_POINTS : 0), xp);
    }
    // A sack in their own end zone is a safety; rare enough that it's just spotted at their 1 here.
    t = clampSpot(next);
    if (t >= firstDownT) {
      down = 1;
      firstDownT = Math.min(t + YARDS_FOR_FIRST_DOWN, OPP_GOAL_X);
    } else if (down === 4) {
      return done('downs', t, t);
    } else {
      down++;
    }
  }
}
