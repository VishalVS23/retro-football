/**
 * Basic defense: a cornerback in man coverage, a two-man pass rush, and deciding what
 * happens when the ball arrives. Pure functions (no Phaser); feel values are passed in.
 * Units: yards and seconds.
 */
import type { Vec } from './throw';

const dist = (a: Vec, b: Vec) => Math.hypot(b.x - a.x, b.y - a.y);

/** Moves `from` toward `to` by at most `step` yards. */
function moveToward(from: Vec, to: Vec, step: number): Vec {
  const d = dist(from, to);
  if (d <= step || d === 0) return { ...to };
  return { x: from.x + ((to.x - from.x) / d) * step, y: from.y + ((to.y - from.y) / d) * step };
}

// ---------- Cornerback (man coverage) ----------

export interface CoverParams {
  topSpeed: number;
  acceleration: number;
  /** How far behind the receiver's movements he is, in seconds (he reacts late). */
  reactionTime: number;
  /** How far downfield of the receiver he lines up. */
  cushionYards: number;
  /** Seconds after the snap for that cushion to close to nothing. */
  cushionCloseTime: number;
  /** After the throw, how long before he breaks on the ball. */
  ballReactionTime: number;
  /** Fraction of his top speed when breaking on the ball (he has to read it in the air). */
  ballSpeedRatio: number;
}

export interface Coverage {
  pos: Vec;
  speed: number;
  /** Seconds since the snap. */
  t: number;
  /** Where the receiver has been (for the reaction delay). */
  history: Array<{ t: number; pos: Vec }>;
}

export function startCoverage(cbStart: Vec, wrStart: Vec): Coverage {
  return { pos: { ...cbStart }, speed: 0, t: 0, history: [{ t: 0, pos: { ...wrStart } }] };
}

/** Where the receiver was `delay` seconds ago. */
function delayedPos(history: Coverage['history'], t: number): Vec {
  for (let i = history.length - 1; i >= 0; i--) if (history[i].t <= t) return history[i].pos;
  return history[0].pos;
}

/**
 * One step of coverage. He shadows where the receiver was a moment ago (plus a shrinking
 * cushion), so cuts buy the receiver a step. Once the ball is in the air and he has reacted,
 * he sprints to the landing spot instead.
 */
export function stepCoverage(
  c: Coverage,
  wrPos: Vec,
  dt: number,
  p: CoverParams,
  ball?: { landing: Vec; sinceThrow: number },
): Coverage {
  const t = c.t + dt;
  const history = [...c.history, { t, pos: { ...wrPos } }].filter((h) => h.t >= t - p.reactionTime - 0.5);
  let target: Vec;
  let top = p.topSpeed;
  if (ball && ball.sinceThrow >= p.ballReactionTime) {
    target = ball.landing;
    top = p.topSpeed * p.ballSpeedRatio;
  } else {
    const seen = delayedPos(history, t - p.reactionTime);
    const cushion = p.cushionYards * Math.max(0, 1 - t / Math.max(0.01, p.cushionCloseTime));
    target = { x: seen.x + cushion, y: seen.y };
  }
  const speed = Math.min(top, c.speed + p.acceleration * dt);
  return { pos: moveToward(c.pos, target, speed * dt), speed, t, history };
}

// ---------- Pass rush ----------

export interface RushParams {
  /** Speed while a blocker is on him. */
  blockedSpeed: number;
  /** Speed once he's beaten his blocker. */
  freeSpeed: number;
  /** How close to the QB counts as a sack. */
  sackReachYards: number;
}

export interface Rusher {
  pos: Vec;
  /** Seconds after the snap when he beats his blocker. */
  shedAt: number;
}

export function isFree(r: Rusher, t: number) {
  return t >= r.shedAt;
}

export function stepRusher(r: Rusher, qb: Vec, t: number, dt: number, p: RushParams): Rusher {
  const speed = isFree(r, t) ? p.freeSpeed : p.blockedSpeed;
  return { ...r, pos: moveToward(r.pos, qb, speed * dt) };
}

/** Where his blocker stands while engaged: just in front of him, between him and the QB. */
export function blockerSpot(r: Rusher, qb: Vec, gap = 1): Vec {
  return moveToward(r.pos, qb, gap);
}

export function reachedQb(rushers: Rusher[], qb: Vec, p: RushParams): boolean {
  return rushers.some((r) => dist(r.pos, qb) <= p.sackReachYards);
}

export function closestRusher(rushers: Rusher[], qb: Vec): number {
  return Math.min(...rushers.map((r) => dist(r.pos, qb)));
}

// ---------- When the ball arrives ----------

export type PassResult = 'catch' | 'breakup' | 'interception' | 'incomplete';

export interface ContestParams {
  catchRadiusYards: number;
  /** Defender within this distance of the ball can contest it. */
  contestRadiusYards: number;
  /** Chance of a breakup when he's right on the ball (scaled down the further away he is). */
  breakupChance: number;
  /** Chance of an interception when he's closer to the ball than the receiver. */
  interceptChance: number;
  /** Chance of an interception when the ball lands on him and the receiver isn't there. */
  overthrowInterceptChance: number;
}

/**
 * Decides the outcome. `roll` is a random number in [0, 1) from the seeded RNG,
 * passed in so the result can be tested and replayed.
 */
export function resolvePass(wr: Vec, cb: Vec, landing: Vec, roll: number, p: ContestParams): PassResult {
  const wrD = dist(wr, landing);
  const cbD = dist(cb, landing);
  const wrCanCatch = wrD <= p.catchRadiusYards;
  const cbCanReach = cbD <= p.catchRadiusYards;

  if (!wrCanCatch) {
    return cbCanReach && roll < p.overthrowInterceptChance ? 'interception' : 'incomplete';
  }
  if (cbD > p.contestRadiusYards) return 'catch';

  const strength = 1 - cbD / p.contestRadiusYards; // 1 = right on the ball, 0 = edge of range
  const pInt = cbD < wrD ? p.interceptChance * strength : 0;
  const pBreakup = p.breakupChance * strength;
  if (roll < pInt) return 'interception';
  if (roll < pInt + pBreakup) return 'breakup';
  return 'catch';
}
