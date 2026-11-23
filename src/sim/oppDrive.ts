/**
 * A simulated opponent drive (Stage 2 step 6): a quick play-by-play dice sim, shown to the player
 * as a short summary. Simple on purpose; the real league sim comes in Stage 4 and team ratings
 * replace `strength` in Stage 3. Pure rules, no Phaser.
 *
 * Inside this file the opponent's drive is worked out in THEIR frame (`t`): they start at their own
 * goal side and drive toward +t, exactly like our offense in drive.ts. t = 120 - x (our coordinates).
 */
import { FIELD_GOAL_POINTS, OPP_GOAL_X, OWN_GOAL_X, TD_POINTS, YARDS_FOR_FIRST_DOWN, EXTRA_POINT_POINTS, TWO_POINT_POINTS, type GameState } from './drive';
import { coachTip } from './fourthDown';
import { fieldGoalDistance } from './kicking';
import { TOTAL_LENGTH } from './field';
import type { Rng } from './rng';
import { NEUTRAL_MODS, type DriveMods } from './driveRatings';
import { oddsShift } from './ratings';

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
  /** Their 2-point tries (overtime: when they need 2, and every try in the shootout from the 3rd OT). */
  twoPointChance: number;
  /** Net punt (after their coverage and our return), yards. */
  puntNetMinYards: number;
  puntNetMaxYards: number;
  /** Hurry-up: behind with this many seconds or fewer left in Q4 (or `halfHurryTime` in Q2), quicker plays, more passes. */
  hurryTime: number;
  halfHurryTime: number;
  hurryPlaySeconds: number;
  hurryRunShare: number;
  /** Ahead in Q4: run the clock down (slower plays, more runs). */
  milkPlaySeconds: number;
  milkRunShare: number;
  /** At the end of the half/game with this many seconds or fewer left: kick the field goal now if in range. */
  lastSnapSeconds: number;
  /** Ahead in Q4 and the kneel-downs left can run out the clock: take a knee (each takes this long). */
  kneelSeconds: number;
  /** In Q2 with this many seconds or fewer left and further than `halfKneelYards` from our goal: kneel out the half. */
  halfKneelTime: number;
  halfKneelYards: number;
  /** Two scores behind in Q4 (down by this many or more): more passes, more deep shots (and more picks). */
  riskMargin: number;
  /** ...doublings of the big-pass-play odds and of the interception odds while taking risks. */
  riskBigPlaySteps: number;
  riskPickSteps: number;
}

/** How they managed the clock on this drive (shown on the summary). */
export type OppDriveNote = 'hurryUp' | 'runClock' | 'kneel' | 'risky' | null;

/** 'quarterEnd' = stopped at 0:00 of the quarter mid-drive (SIM TO END OF QUARTER, only when `stopAfterSeconds` is given): the drive carries on next quarter. */
export type OppDriveResult = 'touchdown' | 'fieldGoal' | 'missedFieldGoal' | 'punt' | 'interception' | 'fumble' | 'downs' | 'endOfHalf' | 'quarterEnd';

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
  /** Only after a touchdown: did the try go in (null = no try needed: overtime walk-off). */
  extraPointGood: boolean | null;
  /** Which try they went for after a touchdown (overtime: 2 when they need it). */
  tryKind?: 'extraPoint' | 'twoPoint';
  /** Their longest gain, if it was a big one. */
  bigPlay: { kind: 'run' | 'pass'; yards: number } | null;
  note: OppDriveNote;
  /** Box-score numbers for the end-of-game screen (gains count up to the goal line; sacks count against passing). */
  stats: OppDriveStats;
  /** Timeouts called during the drive: by the offense (hurry-up) and by the defense (stopping a team running the clock). */
  timeoutsUsed: { offense: number; defense: number };
  /** Only for 'quarterEnd': the down and the first-down line (same coordinates as `endX`) to carry on from. */
  series?: { down: number; firstDownX: number };
}

export interface OppDriveStats {
  passYards: number;
  rushYards: number;
  firstDowns: number;
  /** Times their QB was sacked. */
  sacks: number;
  /** The QB's line on this drive (3g-B: our simmed drives count in our QB line). Picks count as attempts. */
  attempts: number;
  completions: number;
  /** Yards on completions (sacks not taken off, unlike passYards). */
  completionYards: number;
  passTouchdowns: number;
  /** Longest gain from scrimmage on the drive. */
  longest: number;
}

/** The game situation the drive starts in. Scores are from OUR side (us / them). */
export interface OppDriveSituation {
  quarter: number;
  /** Seconds left in the quarter. */
  timeLeft: number;
  quarterLength: number;
  us: number;
  them: number;
  /**
   * College overtime: untimed (no clock tricks), no punts (4th down: kick only when 3 ties or wins),
   * and after a touchdown they kick, go for 2, or need no try at all, depending on the score.
   */
  overtime?: boolean;
  /** Starting mid-series (3g-B: simming from the middle of our drive): the down, and the first-down line in the same coordinates as `startX`. Left out = 1st & 10. */
  startDown?: number;
  firstDownAtX?: number;
  /** Stop at 0:00 of the quarter, mid-drive, after this many seconds (SIM TO END OF QUARTER in Q1 / Q3). Left out = play the drive out. */
  stopAfterSeconds?: number;
  /** Timeouts the offense / the defense may use this drive (left out = none). */
  offenseTimeouts?: number;
  defenseTimeouts?: number;
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
export function oppFieldGoalChance(distance: number, r: OppDriveRules, mods: DriveMods = NEUTRAL_MODS): number {
  const range = r.fgRangeYards + mods.fgRangeYards;
  if (distance > range) return 0;
  if (distance <= r.fgSureYards) return oddsShift(r.fgSureChance, mods.fgSteps);
  const u = (distance - r.fgSureYards) / Math.max(1, range - r.fgSureYards);
  return oddsShift(r.fgSureChance + (r.fgLongChance - r.fgSureChance) * u, mods.fgSteps);
}

/**
 * One opponent drive from `startX` (our coordinates). `mods` = their offense vs our defense
 * (driveRatings.ts); left out = an average matchup.
 */
export function simulateOppDrive(startX: number, sit: OppDriveSituation, r: OppDriveRules, rng: Rng, mods: DriveMods = NEUTRAL_MODS): OppDrive {
  const startT = clampSpot(toT(startX));
  let t = startT;
  let down = Math.max(1, Math.min(4, Math.round(sit.startDown ?? 1)));
  let firstDownT = sit.firstDownAtX !== undefined ? Math.min(OPP_GOAL_X, Math.max(t + 1, toT(sit.firstDownAtX))) : Math.min(t + YARDS_FOR_FIRST_DOWN, OPP_GOAL_X);
  let plays = 0;
  let seconds = 0;
  let bigPlay: OppDrive['bigPlay'] = null;
  let note: OppDriveNote = null;
  const stats: OppDriveStats = { passYards: 0, rushYards: 0, firstDowns: 0, sacks: 0, attempts: 0, completions: 0, completionYards: 0, passTouchdowns: 0, longest: 0 };
  const timeoutsUsed = { offense: 0, defense: 0 };
  let offTimeouts = Math.max(0, sit.offenseTimeouts ?? 0);
  let defTimeouts = Math.max(0, sit.defenseTimeouts ?? 0);
  const ot = !!sit.overtime;
  const halfLeft = ot ? Infinity : halfSecondsLeft(sit);
  /** SIM TO END OF QUARTER: pause here (only matters when it comes before the end of the half). */
  const stopAt = ot ? Infinity : (sit.stopAfterSeconds ?? Infinity);
  const strength = Math.max(0.1, r.strength);
  /** Their lead (negative = behind). The score can't change during the drive. */
  const margin = sit.them - sit.us;
  /** Quarter and time left right now (a drive can run from Q1 into Q2, or Q3 into Q4). */
  const now = () => {
    const left = sit.timeLeft - seconds;
    return left > 0 || sit.quarter % 2 === 0 ? { quarter: sit.quarter, timeLeft: Math.max(0, left) } : { quarter: sit.quarter + 1, timeLeft: left + sit.quarterLength };
  };

  let tryKind: OppDrive['tryKind'];
  const done = (result: OppDriveResult, endT: number, ourStartT: number, points = 0, extraPointGood: boolean | null = null): OppDrive => ({
    result,
    plays,
    yards: Math.round(endT - startT),
    // A play that starts before 0:00 still finishes, but the quarter (or half) ends at 0:00.
    seconds: Math.min(seconds, halfLeft, stopAt),
    startX: toX(startT),
    endX: toX(endT),
    ourStartX: toX(ourStartT),
    points,
    extraPointGood,
    bigPlay,
    note,
    stats: { ...stats },
    timeoutsUsed: { ...timeoutsUsed },
    ...(tryKind ? { tryKind } : {}),
  });
  // Our ball after they give it up at their-frame spot `t2` (in our end zone = touchback at our 20).
  const ourBallAt = (t2: number) => (t2 >= OPP_GOAL_X ? OPP_GOAL_X - 20 : clampSpot(t2));
  const kickoffToUs = OPP_GOAL_X - KICKOFF_START_YARDS; // our 25, in their frame

  const kickFieldGoal = () => {
    plays++;
    seconds += r.incompleteSeconds;
    if (rng.chance(oppFieldGoalChance(fieldGoalDistance(t), r, mods))) return done('fieldGoal', t, kickoffToUs, FIELD_GOAL_POINTS);
    // Missed: our ball at the spot of the kick, or our 20 if that's further out.
    return done('missedFieldGoal', t, Math.min(t - 7, OPP_GOAL_X - 20));
  };

  for (;;) {
    if (seconds >= stopAt && stopAt < halfLeft) {
      seconds = stopAt;
      return { ...done('quarterEnd', t, t), series: { down, firstDownX: toX(firstDownT) } };
    }
    if (seconds >= halfLeft) return done('endOfHalf', t, ourBallAt(t));
    const clock = now();
    const left = halfLeft - seconds; // seconds left in the half (or the game)
    const fgDist = fieldGoalDistance(t);
    const inRange = fgDist <= r.fgRangeYards + mods.fgRangeYards;

    // Take a knee: ahead in Q4 with enough kneel-downs left to run out the game, or nothing doing at the end of Q2.
    const kneelsLeft = 4 - down;
    const kneelOutGame = clock.quarter === 4 && margin > 0 && left <= kneelsLeft * r.kneelSeconds;
    const kneelOutHalf = clock.quarter === 2 && left <= r.halfKneelTime && OPP_GOAL_X - t > r.halfKneelYards;
    if (!ot && (kneelOutGame || kneelOutHalf)) {
      note = 'kneel';
      plays += Math.max(1, Math.min(kneelsLeft, Math.ceil(left / Math.max(1, r.kneelSeconds))));
      seconds = halfLeft;
      return done('endOfHalf', t, ourBallAt(t));
    }

    // Last snap of the half (or the game, when 3 points are enough to matter): kick it now.
    if (!ot && left <= r.lastSnapSeconds && inRange && (clock.quarter === 2 || margin >= -FIELD_GOAL_POINTS)) return kickFieldGoal();

    // 4th down: the same rules of thumb as our coach (seen from their side of the field).
    if (down === 4) {
      const asIfOurs: GameState = { ballX: t, down: 4, firstDownX: firstDownT, us: sit.them, them: sit.us, oppStartX: null, tryPending: false };
      const tip = coachTip({ match: asIfOurs, quarter: clock.quarter, timeLeft: clock.timeLeft, fgRange: inRange, overtime: ot });
      if (tip?.choice === 'fieldGoal') return kickFieldGoal();
      if (tip?.choice === 'punt') {
        plays++;
        seconds += r.incompleteSeconds;
        return done('punt', t, ourBallAt(t + rng.range(r.puntNetMinYards, r.puntNetMaxYards) + mods.puntNetYards));
      }
    }

    // A play. Behind late: hurry-up (and the two-minute drill before halftime). Ahead in Q4: run the clock.
    const hurry = !ot && (clock.quarter === 4 && margin < 0 && clock.timeLeft <= r.hurryTime) || (clock.quarter === 2 && clock.timeLeft <= r.halfHurryTime);
    const milk = !ot && clock.quarter === 4 && margin > 0;
    // Two scores down in Q4: more passes and deeper shots (more big plays, more picks).
    const risky = !ot && clock.quarter === 4 && margin <= -r.riskMargin;
    if (hurry) note = 'hurryUp';
    else if (milk) note = 'runClock';
    else if (risky) note = 'risky';
    const playSeconds = hurry ? r.hurryPlaySeconds : milk ? r.milkPlaySeconds : r.playSeconds;
    const bigPassSteps = mods.bigPassSteps + (risky ? r.riskBigPlaySteps : 0);
    const pickSteps = mods.pickSteps + (risky ? r.riskPickSteps : 0);
    plays++;
    const run = rng.chance(hurry || risky ? r.hurryRunShare : milk ? r.milkRunShare : r.runShare);
    let gain: number;
    let stops = false;
    let completed = false;
    if (run) {
      gain = rng.range(-r.runLossYards, r.runMaxYards) * strength * mods.runYards;
      if (rng.chance(oddsShift(r.bigRunChance, mods.bigRunSteps))) gain += rng.range(r.bigPlayMinYards, r.bigPlayMaxYards) * strength;
      if (rng.chance(r.fumbleChance * mods.fumbleRatio)) {
        seconds += playSeconds;
        return done('fumble', t, ourBallAt(t + Math.max(0, gain)));
      }
    } else if (rng.chance(oddsShift(r.interceptionChance, pickSteps))) {
      stats.attempts++;
      seconds += r.incompleteSeconds;
      // Picked off somewhere downfield.
      return done('interception', t, ourBallAt(t + rng.range(5, 20)));
    } else if (rng.chance(oddsShift(r.sackChance, mods.sackSteps))) {
      gain = -rng.range(r.sackMinYards, r.sackMaxYards);
      stats.sacks++;
    } else if (rng.chance(oddsShift(r.incompleteChance, -mods.completionSteps))) {
      stats.attempts++;
      gain = 0;
      stops = true;
    } else {
      stats.attempts++;
      stats.completions++;
      completed = true;
      gain = rng.range(r.passMinYards, r.passMaxYards) * strength * mods.passYards;
      if (rng.chance(oddsShift(r.bigPassChance, bigPassSteps))) gain += rng.range(r.bigPlayMinYards, r.bigPlayMaxYards) * strength;
      if (rng.chance(r.fumbleChance)) {
        seconds += playSeconds;
        return done('fumble', t, ourBallAt(t + gain));
      }
    }
    // Clock still running after the play: the side that wants it stopped may call a timeout
    // (the offense in its hurry-up, the defense when they're running the clock on it).
    if (!stops && hurry && offTimeouts > 0) {
      offTimeouts--;
      timeoutsUsed.offense++;
      stops = true;
    } else if (!stops && milk && defTimeouts > 0) {
      defTimeouts--;
      timeoutsUsed.defense++;
      stops = true;
    }
    seconds += stops ? r.incompleteSeconds : playSeconds;
    const counted = Math.round(Math.min(gain, OPP_GOAL_X - t)); // a gain only counts up to the goal line
    if (run) stats.rushYards += counted;
    else stats.passYards += counted;
    if (completed) stats.completionYards += counted;
    if (counted > stats.longest) stats.longest = counted;
    if (completed && t + gain >= OPP_GOAL_X) stats.passTouchdowns++;
    if (counted >= BIG_PLAY_YARDS && (!bigPlay || counted > bigPlay.yards)) bigPlay = { kind: run ? 'run' : 'pass', yards: counted };

    const next = t + gain;
    if (next >= OPP_GOAL_X) {
      if (ot) {
        // Overtime: already ahead after the touchdown = game over, no try. Down 1 or tied: kick. Down 2+: go for 2.
        const after = margin + TD_POINTS;
        if (after > 0) return done('touchdown', OPP_GOAL_X, kickoffToUs, TD_POINTS, null);
        tryKind = after >= -EXTRA_POINT_POINTS ? 'extraPoint' : 'twoPoint';
        const good = rng.chance(tryKind === 'extraPoint' ? r.extraPointChance : r.twoPointChance);
        const extra = good ? (tryKind === 'extraPoint' ? EXTRA_POINT_POINTS : TWO_POINT_POINTS) : 0;
        return done('touchdown', OPP_GOAL_X, kickoffToUs, TD_POINTS + extra, good);
      }
      const xp = rng.chance(r.extraPointChance);
      return done('touchdown', OPP_GOAL_X, kickoffToUs, TD_POINTS + (xp ? EXTRA_POINT_POINTS : 0), xp);
    }
    // A sack in their own end zone is a safety; rare enough that it's just spotted at their 1 here.
    t = clampSpot(next);
    if (t >= firstDownT) {
      stats.firstDowns++;
      down = 1;
      firstDownT = Math.min(t + YARDS_FOR_FIRST_DOWN, OPP_GOAL_X);
    } else if (down === 4) {
      return done('downs', t, t);
    } else {
      down++;
    }
  }
}
