/**
 * Defensive calls (Stage 3 step 3d2): before each snap the CPU defense picks a coverage, weighted
 * by the situation and the team's aggression, rolled with the seeded dice. Each call changes how
 * the corners and the linebacker line up and play, so you can read it before the snap.
 * Pure (no Phaser). Feel values come from `feel.defCalls`.
 */
import type { Feel } from '../config/feel';
import type { CoverParams } from './defense';
import { FIELD_WIDTH } from './field';
import { OPP_GOAL_X } from './drive';
import type { Vec } from './throw';

export type DefCallId = 'man' | 'press' | 'off' | 'blitz';
export const DEF_CALL_IDS: readonly DefCallId[] = ['man', 'press', 'off', 'blitz'];

/** What the hint calls it ("LOOKS LIKE: PRESS MAN"). */
export const DEF_CALL_NAMES: Record<DefCallId, string> = {
  man: 'MAN',
  press: 'PRESS MAN',
  off: 'OFF MAN',
  blitz: 'LB BLITZ',
};

/** One-line tip for the play-call screen: how to beat it. */
export const DEF_CALL_TIPS: Record<DefCallId, string> = {
  man: 'Find the open man',
  press: 'Corners pressed: take a shot deep',
  off: 'Corners off: hitches and quick outs are open',
  blitz: 'Blitz coming: throw quick, the RB is open',
};

/** The corners' cushion for this call: how far off they line up and how long it takes to close. */
export function cornerCushion(call: DefCallId, feel: Feel): { yards: number; closeTime: number } {
  const d = feel.defense;
  const c = feel.defCalls;
  if (call === 'press') return { yards: c.pressCushionYards, closeTime: c.pressCloseTime };
  if (call === 'off') return { yards: c.offCushionYards, closeTime: c.offCloseTime };
  return { yards: d.cbCushionYards, closeTime: d.cbCushionCloseTime };
}

/**
 * Coverage params for this call: corners (`cb`) and the linebacker (`lb`), before ratings
 * (`coverFor` scales them per player). `run` = our called play is a run (the LB holds near the line).
 */
export function coverParams(call: DefCallId, feel: Feel, losX: number, run: boolean): { cb: CoverParams; lb: CoverParams } {
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
    cushionYards: 1,
    cushionCloseTime: d.cbCushionCloseTime,
    topSpeed: feel.routes.topSpeed * d.lbSpeedRatio,
    // He reads the play: holds near the line against a run, drops into coverage against a pass.
    minX: losX + (run ? d.lbFloorYards : d.lbPassDropYards),
  };
  return { cb, lb };
}

/** Where the linebacker lines up: a few yards deep, or creeping up to the line on a blitz. */
export function linebackerStart(call: DefCallId, feel: Feel, losX: number): Vec {
  return { x: losX + (call === 'blitz' ? feel.defCalls.blitzStartYards : feel.defense.lbDepthYards), y: FIELD_WIDTH / 2 };
}

/** Where a corner lines up against a receiver at `wr`. */
export function cornerStart(call: DefCallId, feel: Feel, wr: Vec): Vec {
  return { x: wr.x + cornerCushion(call, feel).yards, y: wr.y };
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
  const w: Record<DefCallId, number> = { man: c.weightMan, press: c.weightPress, off: c.weightOff, blitz: c.weightBlitz };
  const late = s.down >= 3;
  if (late && s.toGo >= c.longYards) {
    // Long yardage: keep everything in front of them.
    w.off += c.longOffBonus;
  } else if (s.toGo <= c.shortYards) {
    // Short yardage: get up close and get after it.
    w.press += c.shortAggressiveBonus;
    w.blitz += c.shortAggressiveBonus;
    w.off *= 0.3;
  }
  // Red zone: no room behind them to play off.
  if (OPP_GOAL_X - s.ballX <= 20) {
    w.off = 0;
    w.press += c.redZonePressBonus;
  }
  // Protecting a late lead: don't give up the big play.
  if (s.lead > 0 && s.quarter >= 4 && s.timeLeft <= 120) {
    w.off += c.preventOffBonus;
    w.blitz *= 0.5;
  }
  // Team personality: aggressive coordinators press and blitz more, soft ones sit back.
  const a = Math.max(0, Math.min(1, s.aggression));
  w.press *= 0.5 + a;
  w.blitz *= 0.5 + a;
  w.off *= 1.5 - a;
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
