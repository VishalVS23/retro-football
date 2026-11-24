/**
 * Defensive calls (Stage 3 step 3d2): before each snap the CPU defense picks a coverage, weighted
 * by the situation and the team's aggression, rolled with the seeded dice. Each call changes how
 * the corners and the linebacker line up and play, so you can read it before the snap.
 * Pure (no Phaser). Feel values come from `feel.defCalls`.
 */
import type { Feel } from '../config/feel';
import type { CoverParams, SafetyParams } from './defense';
import { FIELD_WIDTH, TOTAL_LENGTH } from './field';
import { OPP_GOAL_X } from './drive';
import type { Vec } from './throw';
import type { ZoneCallId } from './zone';

/** The man calls (3d2). */
export type ManCallId = 'man' | 'press' | 'off' | 'blitz';
/** Every call, man and zone (zone calls: Z-a Cover 3, Z-b Cover 2). */
export type DefCallId = ManCallId | ZoneCallId;
/** Everything their coach picks from (Z-c: the zones too). */
export const DEF_CALL_IDS: readonly DefCallId[] = ['man', 'press', 'off', 'blitz', 'cover3', 'cover2'];

/** What the hint calls it ("LOOKS LIKE: PRESS MAN"). */
export const DEF_CALL_NAMES: Record<DefCallId, string> = {
  man: 'MAN',
  press: 'PRESS MAN',
  off: 'OFF MAN',
  blitz: 'LB BLITZ',
  cover3: 'COVER 3',
  cover2: 'COVER 2',
};

/** One-line tip for the play-call screen: how to beat it. */
export const DEF_CALL_TIPS: Record<DefCallId, string> = {
  man: 'Find the open man',
  press: 'Corners pressed: take a shot deep',
  off: 'Corners off: hitches and quick outs are open',
  blitz: 'Blitz coming: throw quick, the RB is open',
  cover3: 'Flats, curls and seams open',
  cover2: 'Seams and the middle open',
};

/** The corners' cushion for this call: how far off they line up and how long it takes to close. */
export function cornerCushion(call: DefCallId, feel: Feel): { yards: number; closeTime: number } {
  const d = feel.defense;
  const c = feel.defCalls;
  if (call === 'press') return { yards: c.pressCushionYards, closeTime: c.pressCloseTime };
  if (call === 'off') return { yards: c.offCushionYards, closeTime: c.offCloseTime };
  if (call === 'cover3') return { yards: feel.zone.cover3CushionYards, closeTime: d.cbCushionCloseTime };
  if (call === 'cover2') return { yards: feel.zone.cover2CushionYards, closeTime: d.cbCushionCloseTime };
  return { yards: d.cbCushionYards, closeTime: d.cbCushionCloseTime };
}

/**
 * Coverage params for this call: corners (`cb`) and the linebacker (`lb`), before ratings
 * (`coverFor` scales them per player). `run` = our called play is a run (the LB holds near the line).
 */
export function coverParams(call: DefCallId, feel: Feel, losX: number, run: boolean): { cb: CoverParams; lb: CoverParams; lb2: CoverParams } {
  const d = feel.defense;
  const cush = cornerCushion(call, feel);
  const cb: CoverParams = {
    topSpeed: feel.routes.topSpeed * d.cbSpeedRatio * (call === 'press' ? feel.defCalls.pressSpeedRatio : 1),
    acceleration: feel.routes.acceleration,
    reactionTime: d.cbReactionTime * (call === 'press' ? feel.defCalls.pressReactionRatio : 1),
    cushionYards: cush.yards,
    cushionCloseTime: cush.closeTime,
    cushionFloorYards: call === 'off' ? feel.defCalls.offFloorYards : 0,
    ballReactionTime: d.cbBallReactionTime,
    ballSpeedRatio: d.cbBallSpeedRatio,
    bodyGapYards: d.cbBodyGapYards,
    helpBallReactionTime: d.cbHelpBallReactionTime,
    turnAcceleration: d.cbTurnAcceleration * (call === 'press' ? feel.defCalls.pressTurnScale : 1),
    anticipation: d.cbAnticipation,
  };
  const lb: CoverParams = {
    ...cb,
    reactionTime: d.lbReactionTime,
    cushionYards: d.lbCushionYards,
    cushionFloorYards: d.lbCushionYards,
    cushionCloseTime: d.cbCushionCloseTime,
    topSpeed: feel.routes.topSpeed * d.lbSpeedRatio,
    // He reads the play: holds near the line against a run, drops into coverage against a pass.
    minX: losX + (run ? d.lbFloorYards : d.lbPassDropYards),
    minXUntil: run ? undefined : d.lbPassDropTime,
  };
  // LB2 (3h-b) on the tight end: same, but a shallower first drop (he has the flat, not the checkdown).
  const lb2: CoverParams = { ...lb, minX: losX + (run ? d.lbFloorYards : d.lb2PassDropYards), cushionYards: d.lb2CushionYards, cushionFloorYards: d.lb2CushionYards };
  return { cb, lb, lb2 };
}

/** Where the linebacker lines up: a few yards deep, or creeping up to the line on a blitz. */
export function linebackerStart(call: DefCallId, feel: Feel, losX: number): Vec {
  return { x: losX + (call === 'blitz' ? feel.defCalls.blitzStartYards : feel.defense.lbDepthYards), y: FIELD_WIDTH / 2 };
}

// ---------- Safety looks (3h-c) ----------

/**
 * How their two safeties play this snap. Both are readable before the snap from where the
 * safeties stand. TWO DEEP: each over his half of the field (deep outside covered, the middle
 * open). ROBBER: S1 alone deep in the middle, S2 sits ~10 yards deep in the middle and jumps
 * slants and digs (the middle jammed, deep outside open).
 */
export type ShellId = 'twoDeep' | 'robber';
export const SHELL_IDS: readonly ShellId[] = ['twoDeep', 'robber'];
export const SHELL_NAMES: Record<ShellId, string> = { twoDeep: 'TWO DEEP', robber: 'ONE DEEP + ROBBER' };
export const SHELL_TIPS: Record<ShellId, string> = {
  twoDeep: 'Middle open',
  robber: 'Go deep outside',
};

/** Where S1 (k 0) and S2 (k 1) line up for this look. */
export function safetyStart(feel: Feel, losX: number, shell: ShellId, k: 0 | 1): Vec {
  const d = feel.defense;
  const mid = FIELD_WIDTH / 2;
  const deep = (yards: number) => Math.min(losX + yards, TOTAL_LENGTH - 1);
  if (shell === 'twoDeep') return { x: deep(d.twoDeepDepthYards), y: mid + (k ? 1 : -1) * d.twoDeepHalfYards };
  return k ? { x: deep(d.robberDepthYards), y: mid } : { x: deep(d.safetyDepthYards), y: mid };
}

/**
 * How safety k plays this look, before his ratings (`readTime` = his rated read of the throw,
 * from the look's base reaction time: see `safetyBaseReaction`). Speeds from the DB chase speed.
 */
export function safetyParamsFor(feel: Feel, losX: number, shell: ShellId, k: 0 | 1, readTime: number): SafetyParams {
  const d = feel.defense;
  const db = feel.tackling.dbPursuitSpeed;
  const common = { maxX: TOTAL_LENGTH - 1, cushionYards: d.safetyCushionYards, driftSpeed: db * d.safetyDriftRatio, bailSpeed: db * d.safetyBailRatio, ballReactionTime: readTime };
  if (shell === 'twoDeep') {
    return {
      ...common,
      baseX: Math.min(losX + d.twoDeepDepthYards, TOTAL_LENGTH - 1),
      ballSpeed: db * d.twoDeepBallSpeedRatio,
      half: k ? 1 : -1,
      halfYards: d.twoDeepHalfYards,
      // A ball in front of him: quicker, by the same share his ratings give the normal read.
      frontBallReactionTime: readTime * (d.twoDeepFrontReactionTime / d.twoDeepBallReactionTime),
      frontBallSpeed: db * d.twoDeepFrontSpeedRatio,
    };
  }
  if (k) {
    // The robber holds his depth (no bailing): he's there for what's thrown in front of the deep man.
    const x = Math.min(losX + d.robberDepthYards, TOTAL_LENGTH - 1);
    return { ...common, baseX: x, maxX: x, cushionYards: 0, ballSpeed: db * d.robberBallSpeedRatio };
  }
  return { ...common, baseX: Math.min(losX + d.safetyDepthYards, TOTAL_LENGTH - 1), ballSpeed: db * d.safetyBallSpeedRatio };
}

/** How long safety k waits after a handoff before chasing the run (two-deep safeties read pass first). */
export function safetyRunRead(feel: Feel, shell: ShellId): number {
  return shell === 'twoDeep' ? feel.runGame.twoDeepRunReadTime : 0;
}

/** The base time safety k takes to read the throw in this look (his ratings then scale it). */
export function safetyBaseReaction(feel: Feel, shell: ShellId, k: 0 | 1): number {
  const d = feel.defense;
  if (shell === 'twoDeep') return d.twoDeepBallReactionTime;
  return k ? d.robberBallReactionTime : d.safetyBallReactionTime;
}

/** How likely each look is in this situation (not normalised). */
export function shellWeights(s: DefSituation, feel: Feel): Record<ShellId, number> {
  const c = feel.defCalls;
  const w: Record<ShellId, number> = { twoDeep: c.weightTwoDeep, robber: c.weightRobber };
  if (s.down >= 3 && s.toGo >= c.longYards) w.twoDeep += c.longTwoDeepBonus;
  else if (s.toGo <= c.shortYards) w.robber += c.shortRobberBonus;
  if (OPP_GOAL_X - s.ballX <= 20) w.robber += c.redZoneRobberBonus;
  if (s.lead > 0 && s.quarter >= 4 && s.timeLeft <= 120) w.twoDeep += c.preventTwoDeepBonus;
  return w;
}

/** Picks the safety look with one dice roll (0..1). */
export function pickShell(s: DefSituation, feel: Feel, roll: number): ShellId {
  const w = shellWeights(s, feel);
  return roll * (w.twoDeep + w.robber) < w.twoDeep ? 'twoDeep' : 'robber';
}

/** Where the second linebacker lines up (3h-b): a few yards deep, shading the tight end's side. */
export function linebacker2Start(feel: Feel, losX: number): Vec {
  return { x: losX + feel.defense.lbDepthYards, y: FIELD_WIDTH / 2 + feel.defense.lb2OffsetYards };
}

/** With our tight end in to block, LB2 drops here (the short middle, a hook zone) and breaks on throws nearby. */
export function lb2ZoneSpot(feel: Feel, losX: number): Vec {
  return { x: losX + feel.defCalls.lb2ZoneDepthYards, y: FIELD_WIDTH / 2 - feel.defCalls.lb2ZoneTopYards };
}

/** LB2 in his hook zone: he heads straight for the spot (no cushion, no man) and breaks on throws like anyone. */
export function zoneParams(lb: CoverParams): CoverParams {
  return { ...lb, cushionYards: 0, cushionFloorYards: 0, minX: undefined, minXUntil: undefined, bodyGapYards: 0, anticipation: 0 };
}

/** What LB2 does this snap: covers the tight end, or (TE in to block) drops into the short middle or blitzes. */
export type Lb2Job = 'cover' | 'drop' | 'blitz';

/** LB2's job from the play and one dice roll (0..1) against `lb2BlitzChance`. */
export function lb2Job(teBlocks: boolean, roll: number, chance: number): Lb2Job {
  if (!teBlocks) return 'cover';
  return roll < chance ? 'blitz' : 'drop';
}

/**
 * Our tight end stays in to block: does their coach send LB2 after the QB (else he drops into the
 * short middle)? His usual blitz share for the situation (`callWeights`, so aggression, down and
 * distance, score and clock all count) x `lb2BlitzScale`, at most `lb2BlitzMax`. Decided by one
 * dice roll at the snap, with no tell before it.
 */
export function lb2BlitzChance(s: DefSituation, feel: Feel): number {
  const w = callWeights(s, feel);
  const total = DEF_CALL_IDS.reduce((sum, id) => sum + w[id], 0);
  if (total <= 0) return 0;
  return Math.min(feel.defCalls.lb2BlitzMax, (w.blitz / total) * feel.defCalls.lb2BlitzScale);
}

/** Where a corner lines up against a receiver at `wr`. */
export function cornerStart(call: DefCallId, feel: Feel, wr: Vec): Vec {
  // Cover 2 corners shade OUTSIDE their man (they own the flat): the tell against two-deep man.
  const shade = call === 'cover2' ? feel.zone.cover2ShadeYards * (Math.sign(wr.y - FIELD_WIDTH / 2) || 1) : 0;
  return { x: wr.x + cornerCushion(call, feel).yards, y: wr.y + shade };
}

/**
 * One step of the blitzing linebacker: after a short delay he runs straight at `goal` (the QB, or
 * whoever has the ball in the backfield). Nobody blocks him.
 */
export function stepBlitzer(pos: Vec, goal: Vec, t: number, dt: number, feel: Feel): Vec {
  if (t < feel.defCalls.blitzDelay) return pos;
  const dx = goal.x - pos.x;
  const dy = goal.y - pos.y;
  const d = Math.hypot(dx, dy);
  const step = feel.defCalls.blitzSpeed * dt;
  if (d <= step || d === 0) return { ...goal };
  return { x: pos.x + (dx / d) * step, y: pos.y + (dy / d) * step };
}

// ---------- Choosing the call ----------

export interface DefSituation {
  down: 1 | 2 | 3 | 4;
  /** Yards to go for a first down (or to the goal line). */
  toGo: number;
  /** Line of scrimmage (our coordinates). */
  ballX: number;
  quarter: number;
  /** Seconds left in the quarter. */
  timeLeft: number;
  /** The DEFENSE's lead (their score minus ours). */
  lead: number;
  /** Their coordinator's aggression, 0 (soft) .. 1 (blitz-happy). */
  aggression: number;
}

/** How likely each call is in this situation (not normalised). */
export function callWeights(s: DefSituation, feel: Feel): Record<DefCallId, number> {
  const c = feel.defCalls;
  const w: Record<DefCallId, number> = {
    man: c.weightMan,
    press: c.weightPress,
    off: c.weightOff,
    blitz: c.weightBlitz,
    cover3: c.weightCover3,
    cover2: c.weightCover2,
  };
  const late = s.down >= 3;
  if (late && s.toGo >= c.longYards) {
    // Long yardage: keep everything in front of them (Cover 2 sits under the sticks with two deep).
    w.off += c.longOffBonus;
    w.cover2 += c.longCover2Bonus;
    w.cover3 += c.longCover3Bonus;
  } else if (s.toGo <= c.shortYards) {
    // Short yardage: get up close and get after it.
    w.press += c.shortAggressiveBonus;
    w.blitz += c.shortAggressiveBonus;
    w.off *= 0.3;
    w.cover2 *= c.shortZoneRatio;
    w.cover3 *= c.shortZoneRatio;
  }
  // Red zone: no room behind them to play off; less room for zones too.
  if (OPP_GOAL_X - s.ballX <= 20) {
    w.off = 0;
    w.press += c.redZonePressBonus;
    w.cover2 *= c.redZoneZoneRatio;
    w.cover3 *= c.redZoneZoneRatio;
  }
  // Protecting a late lead: don't give up the big play.
  if (s.lead > 0 && s.quarter >= 4 && s.timeLeft <= 120) {
    w.off += c.preventOffBonus;
    w.cover2 += c.preventCover2Bonus;
    w.cover3 += c.preventCover3Bonus;
    w.blitz *= 0.5;
  }
  // Team personality: aggressive coordinators press and blitz more, soft ones sit back (off man, zones).
  const a = Math.max(0, Math.min(1, s.aggression));
  w.press *= 0.5 + a;
  w.blitz *= 0.5 + a;
  w.off *= 1.5 - a;
  w.cover2 *= 1.5 - a;
  w.cover3 *= 1.5 - a;
  return w;
}

/** Picks a call from the weights with one dice roll (0..1). */
export function pickDefCall(s: DefSituation, feel: Feel, roll: number): DefCallId {
  const w = callWeights(s, feel);
  const total = DEF_CALL_IDS.reduce((sum, id) => sum + w[id], 0);
  if (total <= 0) return 'man';
  let r = roll * total;
  for (const id of DEF_CALL_IDS) {
    r -= w[id];
    if (r < 0) return id;
  }
  return 'man';
}

/**
 * A team's fixed aggression, 0..1, from its id (same every game, no save needed). Stage 8: it
 * comes from their defensive coordinator instead.
 */
export function teamAggression(teamId: number | null | undefined): number {
  if (teamId === null || teamId === undefined) return 0.5;
  // Small integer hash, spread evenly enough over 32 teams.
  let h = (teamId + 1) * 2654435761;
  h = (h ^ (h >>> 15)) >>> 0;
  return (h % 1000) / 999;
}
